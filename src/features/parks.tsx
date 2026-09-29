"use client";
import { errorMessage } from "@/lib/error-message";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCatalog,
  useResource,
  useRuns,
  api,
  type RunSummary,
} from "@/data/platform";
import {
  type Resource,
  type Catalog,
  type ParkData,
  type DeviceData,
  type TaskData,
  type SceneObject,
  deviceSchema,
  taskSchema,
  objectSchema,
} from "@/contracts/platform";
import type { ParkResult } from "@/simulation/park";
import { useLocale } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Field, Choice, Notice, freshId, download } from "@/components/common";
import { MapStage } from "./scene/map-stage";

const tabs = {
  overview: ["园区概览", "Overview"],
  scene: ["场景编辑", "Scene editor"],
  devices: ["设备实例", "Devices"],
  operations: ["作业管理", "Operations"],
  control: ["控制面板", "Control panel"],
  analytics: ["统计分析", "Analytics"],
  settings: ["园区配置", "Settings"],
} as const;
export type ParkTab = keyof typeof tabs;
export function ParkPage({ id, tab }: { id: string; tab: ParkTab }) {
  const catalog = useCatalog(),
    park = useResource("parks", id),
    { t } = useLocale();
  if (park.error || catalog.error)
    return (
      <Notice error>{park.error?.message || catalog.error?.message}</Notice>
    );
  if (!park.data || !catalog.data) return <p>{t("正在载入…", "Loading…")}</p>;
  return (
    <ParkWorkbench key={id} row={park.data} catalog={catalog.data} tab={tab} />
  );
}
function ParkWorkbench({
  row,
  catalog,
  tab,
}: {
  row: Resource<"parks">;
  catalog: Catalog;
  tab: ParkTab;
}) {
  const { t } = useLocale(),
    query = useQueryClient();
  const [draft, setDraft] = useState<ParkData>(row.data),
    [version, setVersion] = useState(row.version),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [mapId, setMapId] = useState(draft.maps[0].id),
    [floor, setFloor] = useState(""),
    [selectedDevice, setSelectedDevice] = useState<DeviceData | "new" | null>(
      null,
    ),
    [selectedTask, setSelectedTask] = useState<TaskData | "new" | null>(null);
  const [tool, setTool] = useState("select"),
    [points, setPoints] = useState<[number, number][]>([]),
    [selectedObject, setSelectedObject] = useState<SceneObject | null>(null);
  const [undo, setUndo] = useState<ParkData[]>([]),
    [redo, setRedo] = useState<ParkData[]>([]);
  const [result, setResult] = useState<ParkResult | null>(null),
    [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(false),
    [rate, setRate] = useState(1);
  const runs = useRuns(row.id),
    mapRef = draft.maps.find((m) => m.id === mapId) ?? draft.maps[0],
    map = useResource("maps", mapRef.id, mapRef.version);
  const levelId = map.data?.data.levels.some((l) => l.id === floor)
    ? floor
    : (map.data?.data.levels[0]?.id ?? "");
  const dirtyAll = dirty || points.length > 0;
  useEffect(() => {
    if (!dirtyAll) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    const warnNavigation = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest(
              "header a, nav[aria-label] a, a[data-navigation]",
            )
          : null;
      if (
        target &&
        !window.confirm(
          "Discard unsaved scene changes? / 放弃未保存的场景修改？",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", warnNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", warnNavigation, true);
    };
  }, [dirtyAll]);
  useEffect(() => {
    if (!playing || !result) return;
    const timer = setInterval(
      () => setFrame((i) => Math.min(result.frames.length - 1, i + 1)),
      100 / rate,
    );
    return () => clearInterval(timer);
  }, [playing, result, rate]);
  function edit(next: ParkData) {
    setUndo((u) => [...u.slice(-49), draft]);
    setRedo([]);
    setDraft(next);
    setDirty(true);
  }
  async function save(next = draft) {
    setBusy(true);
    setError("");
    try {
      const saved = await api<Resource<"parks">>(
        `/api/platform/parks/${row.id}`,
        { name: row.name, version, data: next },
      );
      setDraft(saved.data);
      setVersion(saved.version);
      setDirty(false);
      setUndo([]);
      setRedo([]);
      query.setQueryData(["resource", "parks", row.id, undefined], saved);
      await query.invalidateQueries({ queryKey: ["catalog"] });
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function run(task: TaskData) {
    if (dirtyAll) {
      setError(
        t(
          "请先完成路线并保存场景。",
          "Finish the route and save the scene first.",
        ),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/api/platform/parks/${row.id}/runs`, {
        version,
        taskId: task.id,
      });
      await query.invalidateQueries({ queryKey: ["runs", row.id] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function replay(id: string) {
    setError("");
    try {
      const r = await api<ParkResult>(`/api/runs/${id}/result`);
      setResult(r);
      setFrame(0);
      setPlaying(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const objects = draft.objects.filter(
      (o) => o.mapId === mapRef.id && o.level === levelId,
    ),
    devices = draft.devices.filter(
      (d) => d.mapId === mapRef.id && d.level === levelId,
    );
  const finishRoute = () => {
    if (points.length < 2) {
      setError(
        t(
          "请在地图上至少点击两个不同的位置。",
          "Click at least two distinct positions on the map.",
        ),
      );
      return;
    }
    const o = objectSchema.parse({
      id: freshId(),
      name: t("运输路线", "Delivery route"),
      type: "route",
      mapId: mapRef.id,
      level: levelId,
      x: points[0][0],
      y: points[0][1],
      points,
    });
    edit({ ...draft, objects: [...draft.objects, o] });
    setSelectedObject(o);
    setPoints([]);
    setTool("select");
    setError("");
  };
  const onPick = (x: number, y: number) => {
    if (tool === "select") return;
    if (tool === "route") {
      setPoints((p) => [...p, [x, y]]);
      return;
    }
    const o = objectSchema.parse({
      id: freshId(),
      name: tool,
      type: tool,
      mapId: mapRef.id,
      level: levelId,
      x,
      y,
      value: tool === "speed" ? 0.6 : 0,
    });
    edit({ ...draft, objects: [...draft.objects, o] });
    setSelectedObject(o);
  };
  const controls = (
    <div className="flex flex-wrap gap-3">
      <Choice
        label={t("地图版本", "Map revision")}
        value={mapRef.id}
        onChange={(value) => {
          if (points.length) {
            setError(
              t(
                "请先完成或清除路线草稿。",
                "Finish or clear the route draft first.",
              ),
            );
            return;
          }
          setMapId(value);
          setFloor("");
        }}
        options={draft.maps.map((m) => ({
          value: m.id,
          label: `${catalog.maps.find((r) => r.id === m.id)?.name ?? m.id} · v${m.version}`,
        }))}
      />
      <Choice
        label={t("楼层", "Floor")}
        value={levelId}
        onChange={(value) => {
          if (points.length) {
            setError(t("请先完成路线。", "Finish the route first."));
            return;
          }
          setFloor(value);
        }}
        options={
          map.data?.data.levels.map((l) => ({ value: l.id, label: l.id })) ?? []
        }
      />
    </div>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-heading">{row.name}</h1>
          <p className="page-description">
            {t(tabs[tab][0], tabs[tab][1])} · v{version}{" "}
            {dirtyAll ? t("· 有未保存修改", "· Unsaved changes") : ""}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link
            href="/parks"
            onClick={(e) => {
              if (
                dirtyAll &&
                !confirm(
                  t(
                    "离开会丢失未保存修改，继续？",
                    "Discard unsaved changes and leave?",
                  ),
                )
              )
                e.preventDefault();
            }}
          >
            {t("园区列表", "Park list")}
          </Link>
        </Button>
      </div>
      <nav aria-label={t("园区菜单", "Park menu")} className="park-tabs">
        {Object.entries(tabs).map(([key, label]) => (
          <Link
            key={key}
            aria-current={key === tab ? "page" : undefined}
            href={`/parks/${row.id}/${key}`}
            onClick={(e) => {
              if (
                dirtyAll &&
                !confirm(
                  t(
                    "切换页面可能丢失未保存修改，继续？",
                    "Changing pages may discard drafts. Continue?",
                  ),
                )
              )
                e.preventDefault();
            }}
          >
            {t(label[0], label[1])}
          </Link>
        ))}
      </nav>
      {error && <Notice error>{error}</Notice>}
      {row.archived && (
        <Notice>
          {t(
            "园区已归档，不可保存或运行。",
            "Park archived; saving and running are disabled.",
          )}
        </Notice>
      )}
      {row.version !== version && (
        <Notice>
          {t(
            "服务器存在更新版本，未覆盖当前草稿。请复制修改后重新载入。",
            "A newer revision exists; your draft was preserved. Copy changes before reloading.",
          )}
        </Notice>
      )}
      {tab === "overview" && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [t("设备实例", "Devices"), draft.devices.length],
              [t("业务对象", "Scene objects"), draft.objects.length],
              [t("任务", "Tasks"), draft.tasks.length],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardHeader>
                  <CardTitle>{label}</CardTitle>
                </CardHeader>
                <CardContent className="text-3xl">{value}</CardContent>
              </Card>
            ))}
          </div>
          <Notice>
            {t(
              "流程：场景编辑添加路线并保存 → 创建同图同层设备 → 创建任务 → 开始仿真 → 控制面板回放。设备初始位置须距路线起点不超过 2 米，并留出整车及挂车净空。",
              "Workflow: save a route → create a device on the same map/floor → create a task → simulate → replay in Control panel. Spawn must be within 2 m of route start with chassis/trailer clearance.",
            )}
          </Notice>
          {controls}
          {map.data && (
            <MapStage
              map={map.data.data}
              levelId={levelId}
              objects={objects}
              devices={devices}
            />
          )}
        </>
      )}
      {tab === "scene" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card>
            <CardContent className="space-y-4">
              {controls}
              <div className="flex flex-wrap items-end gap-2">
                <Choice
                  label={t("绘图工具", "Drawing tool")}
                  value={tool}
                  onChange={setTool}
                  options={[
                    "select",
                    "route",
                    "charging",
                    "parking",
                    "loading",
                    "unloading",
                    "waypoint",
                    "door",
                    "restricted",
                    "speed",
                  ].map((v) => ({ value: v, label: v }))}
                />
                <Button
                  variant="outline"
                  disabled={points.length < 2}
                  onClick={finishRoute}
                >
                  {t("完成路线", "Finish route")} ({points.length})
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPoints([])}
                  disabled={!points.length}
                >
                  {t("清除草稿", "Clear draft")}
                </Button>
                <Button
                  variant="outline"
                  disabled={!undo.length}
                  onClick={() => {
                    const previous = undo[undo.length - 1];
                    setRedo((r) => [...r, draft]);
                    setDraft(previous);
                    setUndo((u) => u.slice(0, -1));
                    setDirty(true);
                  }}
                >
                  {t("撤销", "Undo")}
                </Button>
                <Button
                  variant="outline"
                  disabled={!redo.length}
                  onClick={() => {
                    const next = redo[redo.length - 1];
                    setUndo((u) => [...u, draft]);
                    setDraft(next);
                    setRedo((r) => r.slice(0, -1));
                    setDirty(true);
                  }}
                >
                  {t("重做", "Redo")}
                </Button>
                <Button
                  disabled={busy || row.archived || !dirty || points.length > 0}
                  onClick={() => save()}
                >
                  {t("保存场景", "Save scene")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "选择 route → 2D 点击起点、途经点、终点 → 完成路线 → 保存场景。橙色虚线尚未成为路线。",
                  "Select route → click start, waypoints, goal in 2D → Finish route → Save scene. Orange dashed points are still a draft.",
                )}
              </p>
              {map.error && <Notice error>{map.error.message}</Notice>}
              {map.data && (
                <MapStage
                  map={map.data.data}
                  levelId={levelId}
                  objects={objects}
                  devices={devices}
                  draft={points}
                  onPick={onPick}
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("业务对象", "Scene objects")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {objects.map((o) => (
                <div className="flex gap-2" key={o.id}>
                  <Button
                    className="min-w-0 flex-1 truncate"
                    variant="outline"
                    onClick={() => setSelectedObject(o)}
                  >
                    {o.name}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      edit({
                        ...draft,
                        objects: draft.objects.filter((x) => x.id !== o.id),
                      })
                    }
                  >
                    {t("移除", "Remove")}
                  </Button>
                </div>
              ))}
              {!objects.length && (
                <p className="text-sm">{t("暂无业务对象", "No objects yet")}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t(
                  "门、充电、装卸点仅为语义标注。删除被任务引用的路线会在保存时被拒绝。",
                  "Doors, charging and loading are annotations. Removing a referenced route is rejected on save.",
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      {tab === "devices" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("设备实例", "Devices")}</CardTitle>
            <Button
              disabled={row.archived}
              onClick={() => setSelectedDevice("new")}
            >
              {t("创建设备实例", "Create device")}
            </Button>
          </CardHeader>
          <CardContent>
            <Notice>
              {t(
                "真实设备只登记资产；当前没有在线连接或实机控制。",
                "Physical instances are asset records only; no live connection or real control.",
              )}
            </Notice>
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "名称 / Name",
                    "类型 / Kind",
                    "地图 / Floor",
                    "初始位姿 / Pose",
                    "操作 / Actions",
                  ].map((s) => (
                    <TableHead key={s}>{s}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.devices.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.name}</TableCell>
                    <TableCell>{d.kind}</TableCell>
                    <TableCell>
                      {catalog.maps.find((m) => m.id === d.mapId)?.name} /{" "}
                      {d.level}
                    </TableCell>
                    <TableCell>
                      {d.pose.map((v) => v.toFixed(2)).join(", ")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedDevice(d)}
                      >
                        {t("编辑", "Edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          save({
                            ...draft,
                            devices: draft.devices.filter((x) => x.id !== d.id),
                          })
                        }
                      >
                        {t("删除", "Delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {tab === "operations" && (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t("任务与执行", "Tasks and execution")}</CardTitle>
              <Button
                disabled={
                  row.archived ||
                  !draft.devices.length ||
                  !draft.objects.some((o) => o.type === "route")
                }
                onClick={() => setSelectedTask("new")}
              >
                {t("创建任务", "Create task")}
              </Button>
            </CardHeader>
            <CardContent>
              <Notice>
                {t(
                  "单设备、单图层平面运动学；不是 Gazebo。尚未接入园区 Chrono、感知或实机。",
                  "Single-device, single-floor planar kinematics, not Gazebo. No park Chrono, perception or physical operation.",
                )}
              </Notice>
              {!draft.devices.length && (
                <Notice>
                  {t(
                    "缺少设备：请先创建设备实例。",
                    "Missing device: create an instance first.",
                  )}
                </Notice>
              )}
              {!draft.objects.some((o) => o.type === "route") && (
                <Notice>
                  {t(
                    "缺少路线：请在场景编辑中完成路线并保存。",
                    "Missing route: finish and save a route in Scene editor.",
                  )}
                </Notice>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("任务", "Task")}</TableHead>
                    <TableHead>{t("设备", "Device")}</TableHead>
                    <TableHead>s / m/s</TableHead>
                    <TableHead>{t("操作", "Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draft.tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>{task.name}</TableCell>
                      <TableCell>
                        {
                          draft.devices.find((d) => d.id === task.deviceId)
                            ?.name
                        }
                      </TableCell>
                      <TableCell>
                        {task.duration} / {task.speed}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setSelectedTask(task)}
                          >
                            {t("编辑", "Edit")}
                          </Button>
                          <Button
                            disabled={busy || row.archived}
                            onClick={() => run(task)}
                          >
                            {t("开始仿真", "Start simulation")}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              save({
                                ...draft,
                                tasks: draft.tasks.filter(
                                  (x) => x.id !== task.id,
                                ),
                              })
                            }
                          >
                            {t("删除", "Delete")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <RunList rows={runs.data ?? []} onReplay={replay} />
          {result && (
            <Notice>
              {t(
                "回放已载入，请在控制面板选择对应实验。",
                "Result loaded. Open Control panel and select the run to replay.",
              )}
            </Notice>
          )}
        </>
      )}
      {tab === "control" && (
        <>
          <Notice>
            {t(
              "播放/暂停只控制历史回放，不控制真实设备。completed 是计算完成，不代表任务成功。",
              "Play/pause controls replay only, never real devices. completed means computation ended, not task success.",
            )}
          </Notice>
          <RunList rows={runs.data ?? []} onReplay={replay} />
          {result && (
            <Replay
              result={result}
              frame={frame}
              setFrame={setFrame}
              playing={playing}
              setPlaying={setPlaying}
              rate={rate}
              setRate={setRate}
            />
          )}
        </>
      )}
      {tab === "analytics" && (
        <>
          <RunList rows={runs.data ?? []} onReplay={replay} />
          <Card>
            <CardHeader>
              <CardTitle>{t("指标分析", "Metrics")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("执行", "Run")}</TableHead>
                    <TableHead>{t("判定", "Verdict")}</TableHead>
                    <TableHead>distanceM</TableHead>
                    <TableHead>contactEpisodes</TableHead>
                    <TableHead>maxPathError</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.data?.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.id.slice(0, 8)} · v{r.parkVersion}
                      </TableCell>
                      <TableCell>{r.verdict ?? "—"}</TableCell>
                      {["distanceM", "contactEpisodes", "maxPathError"].map(
                        (key) => (
                          <TableCell key={key}>
                            {r.metrics?.[key] ?? "—"}
                          </TableCell>
                        ),
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Notice>
                {t(
                  "只展示各次实验的原始指标；未证明不同版本或引擎之间可比。接触段不等于事故。",
                  "Raw run metrics only; different revisions/engines are not assumed comparable. Contact episodes are not accidents.",
                )}
              </Notice>
            </CardContent>
          </Card>
        </>
      )}
      {tab === "settings" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("园区配置", "Park configuration")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label={t("说明", "Description")}
              value={draft.description}
              onChange={(value) => edit({ ...draft, description: value })}
            />
            {controls}
            <p className="text-sm">
              {t(
                "绑定资源在园区列表的“编辑”中调整；引用检查保持生效。",
                "Edit resource bindings from the park list; reference checks remain enforced.",
              )}
            </p>
            <Button
              disabled={busy || !dirty || row.archived}
              onClick={() => save()}
            >
              {t("保存配置", "Save settings")}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                download(`${row.id}-v${version}.json`, {
                  ...row,
                  version,
                  data: draft,
                })
              }
            >
              {t("导出配置", "Export configuration")}
            </Button>
          </CardContent>
        </Card>
      )}
      {selectedDevice && (
        <DeviceEditor
          serverError={error}
          key={selectedDevice === "new" ? "new" : selectedDevice.id}
          device={selectedDevice === "new" ? undefined : selectedDevice}
          park={draft}
          catalog={catalog}
          close={() => setSelectedDevice(null)}
          save={async (d) => {
            if (
              await save({
                ...draft,
                devices: [...draft.devices.filter((x) => x.id !== d.id), d],
              })
            )
              setSelectedDevice(null);
          }}
        />
      )}
      {selectedTask && (
        <TaskEditor
          serverError={error}
          task={selectedTask === "new" ? undefined : selectedTask}
          park={draft}
          close={() => setSelectedTask(null)}
          save={async (task) => {
            if (
              await save({
                ...draft,
                tasks: [...draft.tasks.filter((x) => x.id !== task.id), task],
              })
            )
              setSelectedTask(null);
          }}
        />
      )}
      {selectedObject && (
        <ObjectEditor
          object={selectedObject}
          close={() => setSelectedObject(null)}
          save={(object) => {
            edit({
              ...draft,
              objects: draft.objects.map((o) =>
                o.id === object.id ? object : o,
              ),
            });
            setSelectedObject(null);
          }}
        />
      )}
    </div>
  );
}

function RunList({
  rows,
  onReplay,
}: {
  rows: RunSummary[];
  onReplay: (id: string) => void;
}) {
  const { t } = useLocale(),
    q = useQueryClient(),
    [error, setError] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("执行记录", "Executions")}</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <Notice error>{error}</Notice>}
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "ID",
                "任务 / Task",
                "状态 / Status",
                "判定 / Verdict",
                "操作 / Actions",
              ].map((s) => (
                <TableHead key={s}>{s}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.id.slice(0, 8)}</TableCell>
                <TableCell>
                  {r.taskId} · v{r.parkVersion}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{r.status}</Badge>
                </TableCell>
                <TableCell>{r.verdict ?? "—"}</TableCell>
                <TableCell>
                  {r.status === "completed" ? (
                    <Button variant="outline" onClick={() => onReplay(r.id)}>
                      {t("回放", "Replay")}
                    </Button>
                  ) : ["queued", "running"].includes(r.status) ? (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await api(`/api/runs/${r.id}/cancel`, {});
                          await q.invalidateQueries({ queryKey: ["runs"] });
                        } catch (e) {
                          setError(errorMessage(e));
                        }
                      }}
                    >
                      {t("取消", "Cancel")}
                    </Button>
                  ) : r.status === "failed" ? (
                    t("请检查执行日志", "Check worker log")
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && (
          <p className="py-8 text-center text-muted-foreground">
            {t("暂无执行记录", "No executions yet")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
function Replay({
  result,
  frame,
  setFrame,
  playing,
  setPlaying,
  rate,
  setRate,
}: {
  result: ParkResult;
  frame: number;
  setFrame: (n: number) => void;
  playing: boolean;
  setPlaying: (b: boolean) => void;
  rate: number;
  setRate: (n: number) => void;
}) {
  const { t } = useLocale();
  const s = result.request.snapshot;
  // Replay uses frozen run geometry, never the latest mutable map/model.
  const map = useMemo<import("@/contracts/platform").MapData>(
    () => ({
      schemaVersion: 1,
      id: s.mapId,
      name: { zh: s.mapName, en: s.mapName },
      units: { length: "m", angle: "rad" },
      source: { kind: "frozen-run" },
      coordinateTransform: {},
      capabilities: {
        geometry: true,
        navigation: true,
        simulation: false,
        liveControl: false,
      },
      warnings: [],
      lifts: [],
      levels: [
        {
          id: s.levelId,
          elevation: 0,
          vertices: s.walls.flatMap((w, i) =>
            [w.a, w.b].map(([x, y], j) => ({
              id: i * 2 + j,
              x,
              y,
              z: 0,
              name: "",
              parameters: {},
            })),
          ),
          walls: s.walls.map((_, i) => ({
            id: i,
            start: i * 2,
            end: i * 2 + 1,
            parameters: {},
          })),
          lanes: [],
          doors: [],
          floors: [],
          holes: [],
          models: [],
          graphs: [],
          bounds: s.bounds,
        },
      ],
    }),
    [s],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {s.taskName} · {result.verdict}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <MapStage
          map={map}
          levelId={s.levelId}
          objects={s.objects}
          devices={[]}
          frame={result.frames[frame]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => {
              if (frame >= result.frames.length - 1) setFrame(0);
              setPlaying(!playing);
            }}
          >
            {playing ? t("暂停", "Pause") : t("播放", "Play")}
          </Button>
          <input
            aria-label={t("回放时间", "Replay time")}
            type="range"
            min={0}
            max={result.frames.length - 1}
            value={frame}
            onChange={(e) => {
              setPlaying(false);
              setFrame(Number(e.target.value));
            }}
            className="min-w-36 flex-1"
          />
          <span>{result.frames[frame]?.t.toFixed(1)} s</span>
          <Choice
            label={t("倍速", "Speed")}
            value={String(rate)}
            onChange={(v) => setRate(Number(v))}
            options={[0.5, 1, 2, 4].map((v) => ({
              value: String(v),
              label: `${v}×`,
            }))}
          />
          <Button
            variant="outline"
            onClick={() => download("run.json", result)}
          >
            JSON
          </Button>
        </div>
        <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
          {JSON.stringify(result.metrics, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}

function DeviceEditor({
  serverError,
  device,
  park,
  catalog,
  close,
  save,
}: {
  device?: DeviceData;
  serverError: string;
  park: ParkData;
  catalog: Catalog;
  close: () => void;
  save: (d: DeviceData) => Promise<void>;
}) {
  const { t } = useLocale();
  const [d, setD] = useState<DeviceData>(
      () =>
        device ?? {
          id: freshId(),
          name: "",
          kind: "virtual",
          model: park.models[0],
          mapId: park.maps[0].id,
          level: "",
          pose: [0, 0, 0],
          gatewayId: park.gateways[0],
          serial: "",
          channels: [],
        },
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const ref = park.maps.find((m) => m.id === d.mapId) ?? park.maps[0],
    map = useResource("maps", ref.id, ref.version),
    level = d.level || map.data?.data.levels[0]?.id || "";
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("设备实例", "Device instance")}</DialogTitle>
          <DialogDescription>
            {t(
              "可在 2D 地图上点击初始位置，或使用路线起点；整车净空仍需验证。",
              "Click a spawn in 2D or use a route start; full-body clearance still requires validation.",
            )}
          </DialogDescription>
        </DialogHeader>
        {serverError && <Notice error>{serverError}</Notice>}
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await save(deviceSchema.parse({ ...d, level }));
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label={t("名称", "Name")}
            value={d.name}
            onChange={(name) => setD({ ...d, name })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice
              label={t("类型", "Kind")}
              value={d.kind}
              onChange={(v) =>
                setD({
                  ...d,
                  kind: v as DeviceData["kind"],
                  gatewayId: undefined,
                  channels: [],
                  serial: "",
                })
              }
              options={["virtual", "physical"].map((value) => ({
                value,
                label: value,
              }))}
            />
            <Choice
              label={t("模型版本", "Model revision")}
              value={d.model.id}
              onChange={(v) =>
                setD({ ...d, model: park.models.find((m) => m.id === v)! })
              }
              options={park.models.map((m) => ({
                value: m.id,
                label: `${catalog.models.find((r) => r.id === m.id)?.name} v${m.version}`,
              }))}
            />
            <Choice
              label={t("地图", "Map")}
              value={d.mapId}
              onChange={(mapId) => setD({ ...d, mapId, level: "" })}
              options={park.maps.map((m) => ({
                value: m.id,
                label: catalog.maps.find((r) => r.id === m.id)?.name ?? m.id,
              }))}
            />
            <Choice
              label={t("楼层", "Floor")}
              value={level}
              onChange={(level) => setD({ ...d, level })}
              options={
                map.data?.data.levels.map((l) => ({
                  value: l.id,
                  label: l.id,
                })) ?? []
              }
            />
            <Choice
              label={t("网关", "Gateway")}
              value={d.gatewayId ?? "none"}
              onChange={(v) =>
                setD({
                  ...d,
                  gatewayId: v === "none" ? undefined : v,
                  channels: [],
                })
              }
              options={[
                { value: "none", label: t("不绑定", "Unbound") },
                ...catalog.gateways
                  .filter(
                    (g) =>
                      park.gateways.includes(g.id) &&
                      (d.kind === "virtual") ===
                        (g.data.adapter === "simulation"),
                  )
                  .map((g) => ({ value: g.id, label: g.name })),
              ]}
            />
            {d.kind === "physical" && (
              <Field
                label={t("序列号", "Serial")}
                value={d.serial}
                onChange={(serial) => setD({ ...d, serial })}
              />
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {["x / m", "y / m", "yaw / rad"].map((label, i) => (
              <Field
                key={label}
                label={label}
                type="number"
                step="any"
                value={d.pose[i]}
                onChange={(v) => {
                  const pose = [...d.pose] as DeviceData["pose"];
                  pose[i] = Number(v);
                  setD({ ...d, pose });
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {park.objects
              .filter(
                (o) =>
                  o.type === "route" &&
                  o.mapId === d.mapId &&
                  o.level === level,
              )
              .map((o) => (
                <Button
                  key={o.id}
                  variant="outline"
                  type="button"
                  onClick={() =>
                    setD({
                      ...d,
                      pose: [
                        ...o.points[0],
                        Math.atan2(
                          o.points[1][1] - o.points[0][1],
                          o.points[1][0] - o.points[0][0],
                        ),
                      ],
                    })
                  }
                >
                  {t("使用路线起点：", "Use route start: ")}
                  {o.name}
                </Button>
              ))}
          </div>
          {map.data && (
            <MapStage
              map={map.data.data}
              levelId={level}
              objects={park.objects.filter((o) => o.mapId === d.mapId)}
              devices={[{ ...d, level }]}
              onPick={(x, y) => setD({ ...d, pose: [x, y, d.pose[2]] })}
            />
          )}
          <fieldset className="grid gap-2">
            <legend>{t("通道", "Channels")}</legend>
            {catalog.gateways
              .find((g) => g.id === d.gatewayId)
              ?.data.channels.map((c) => (
                <label key={c.name} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={d.channels.includes(c.name)}
                    onChange={(e) =>
                      setD({
                        ...d,
                        channels: e.target.checked
                          ? [...d.channels, c.name]
                          : d.channels.filter((v) => v !== c.name),
                      })
                    }
                  />
                  {c.name} / {c.kind}
                </label>
              ))}
          </fieldset>
          {error && <Notice error>{error}</Notice>}
          <Button disabled={busy} type="submit">
            {t("保存设备", "Save device")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function TaskEditor({
  serverError,
  task,
  park,
  close,
  save,
}: {
  task?: TaskData;
  serverError: string;
  park: ParkData;
  close: () => void;
  save: (t: TaskData) => Promise<void>;
}) {
  const { t } = useLocale();
  const [value, setValue] = useState<TaskData>(
      () =>
        task ?? {
          id: freshId(),
          name: "",
          deviceId: park.devices[0].id,
          routeId: park.objects.find((o) => o.type === "route")!.id,
          duration: 60,
          speed: 1,
          engine: "kinematic",
        },
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const device = park.devices.find((d) => d.id === value.deviceId),
    routes = park.objects.filter(
      (o) =>
        o.type === "route" &&
        o.mapId === device?.mapId &&
        o.level === device?.level,
    );
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("作业任务", "Task")}</DialogTitle>
          <DialogDescription>
            {t(
              "当前仅支持单虚拟设备平面运动学。",
              "Currently supports one virtual device with planar kinematics.",
            )}
          </DialogDescription>
        </DialogHeader>
        {serverError && <Notice error>{serverError}</Notice>}
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await save(taskSchema.parse(value));
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label={t("名称", "Name")}
            value={value.name}
            onChange={(name) => setValue({ ...value, name })}
          />
          <Choice
            label={t("设备", "Device")}
            value={value.deviceId}
            onChange={(deviceId) => {
              const d = park.devices.find((x) => x.id === deviceId)!;
              setValue({
                ...value,
                deviceId,
                routeId:
                  park.objects.find(
                    (o) =>
                      o.type === "route" &&
                      o.mapId === d.mapId &&
                      o.level === d.level,
                  )?.id ?? "",
              });
            }}
            options={park.devices
              .filter((d) => d.kind === "virtual")
              .map((d) => ({ value: d.id, label: d.name }))}
          />
          <Choice
            label={t("同图同层路线", "Route on same map/floor")}
            value={value.routeId}
            onChange={(routeId) => setValue({ ...value, routeId })}
            options={routes.map((o) => ({ value: o.id, label: o.name }))}
          />
          <Field
            label={t("时长 / s", "Duration / s")}
            type="number"
            value={value.duration}
            onChange={(v) => setValue({ ...value, duration: Number(v) })}
          />
          <Field
            label={t("速度 / m/s", "Speed / m/s")}
            type="number"
            step="any"
            value={value.speed}
            onChange={(v) => setValue({ ...value, speed: Number(v) })}
          />
          {error && <Notice error>{error}</Notice>}
          <Button disabled={busy || !routes.length} type="submit">
            {t("保存任务", "Save task")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function ObjectEditor({
  object,
  close,
  save,
}: {
  object: SceneObject;
  close: () => void;
  save: (o: SceneObject) => void;
}) {
  const { t } = useLocale(),
    [value, setValue] = useState(object),
    [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("业务对象", "Scene object")}</DialogTitle>
          <DialogDescription>
            {t(
              "应用到草稿后仍需保存场景。",
              "Apply to draft, then save the scene.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              save(objectSchema.parse(value));
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          <Field
            label={t("名称", "Name")}
            value={value.name}
            onChange={(name) => setValue({ ...value, name })}
          />
          <div className="grid grid-cols-2 gap-3">
            {(["x", "y", "yaw", "w", "h", "value"] as const).map((key) => (
              <Field
                key={key}
                label={key}
                type="number"
                step="any"
                value={value[key]}
                onChange={(v) => setValue({ ...value, [key]: Number(v) })}
              />
            ))}
          </div>
          {value.type === "route" && (
            <p>
              {t(
                "路线位置由绘制的点确定，x/y 为标签位置。",
                "Route geometry comes from its points; x/y positions the label.",
              )}
            </p>
          )}
          {error && <Notice error>{error}</Notice>}
          <Button type="submit">{t("应用到草稿", "Apply to draft")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
