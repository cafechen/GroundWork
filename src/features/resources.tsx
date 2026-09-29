"use client";
import { errorMessage } from "@/lib/error-message";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Map as MapIcon,
  Network,
  Plus,
  Search,
  Warehouse,
  Route,
  Layers3,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, useCatalog } from "@/data/platform";
import {
  schemas,
  modelSchema,
  gatewaySchema,
  parkSchema,
  type Kind,
  type AnyResource,
  type Catalog,
} from "@/contracts/platform";
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
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Field, Choice, Notice, download } from "@/components/common";
import { MapStage } from "./scene/map-stage";

const titles = {
  maps: ["地图管理", "Maps"],
  models: ["设备模型", "Device models"],
  gateways: ["接入网关", "Gateways"],
  parks: ["园区管理", "Parks"],
} as const;
const resourceIcons = {
  maps: MapIcon,
  models: Boxes,
  gateways: Network,
  parks: Warehouse,
};
const descriptions = {
  maps: [
    "管理园区底图、楼层与导航拓扑。",
    "Manage park maps, floors and navigation topology.",
  ],
  models: [
    "定义可复用的设备类型、尺寸与运动参数。",
    "Define reusable device types, dimensions and motion parameters.",
  ],
  gateways: [
    "管理设备连接配置与数据通道。",
    "Manage connection configuration and data channels.",
  ],
  parks: [
    "组织地图、设备与任务，进入园区开始验证。",
    "Bring maps, devices and tasks together in a park.",
  ],
} as const;
const modelDefault = modelSchema.parse({
  category: "tugger",
  length: 3,
  width: 1.5,
  height: 1.4,
  wheelbase: 1.8,
  maxSpeed: 1.2,
  maxSteer: 0.6,
  mass: 1000,
  trailers: 1,
});
export function Overview() {
  const { data, error, isPending } = useCatalog(),
    { t } = useLocale();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-heading">{t("总览", "Overview")}</h1>
          <p className="page-description">
            {t("从场景到可复现证据", "From scenes to reproducible evidence")}
          </p>
        </div>
        <Button asChild>
          <Link href="/parks">
            <Warehouse />
            {t("管理园区", "Manage parks")}
            <ArrowRight />
          </Link>
        </Button>
      </div>
      {error && <Notice error>{error.message}</Notice>}
      {isPending && <p>{t("载入中…", "Loading…")}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data &&
          (["maps", "models", "gateways", "parks"] as Kind[]).map((kind) => {
            const Icon = resourceIcons[kind];
            return (
              <Card key={kind} className="gap-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium">
                    <Link href={`/${kind}`}>
                      {t(titles[kind][0], titles[kind][1])}
                    </Link>
                  </CardTitle>
                  <Icon className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">
                    {data[kind].filter((r) => !r.archived).length}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      "未归档资源 · 当前工作区",
                      "Non-archived · Current workspace",
                    )}
                  </p>
                </CardContent>
              </Card>
            );
          })}
      </div>
      <div className="grid gap-6 xl:grid-cols-7">
        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle>{t("园区工作空间", "Park workspaces")}</CardTitle>
            <p className="page-description">
              {t(
                "继续场景编辑、运行任务或查看实验结果。",
                "Continue editing scenes, running tasks or reviewing evidence.",
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.parks
              .filter((p) => !p.archived)
              .slice(0, 5)
              .map((park) => (
                <Link
                  key={park.id}
                  href={`/parks/${park.id}`}
                  className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Warehouse className="size-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {park.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {park.data.maps.length} {t("地图", "maps")} ·{" "}
                      {park.data.devices.length} {t("设备", "devices")} ·{" "}
                      {park.data.tasks.length} {t("任务", "tasks")}
                    </p>
                  </div>
                  <Badge variant="outline">v{park.version}</Badge>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            {data && !data.parks.some((p) => !p.archived) && (
              <div className="rounded-lg border border-dashed px-6 py-10 text-center">
                <Warehouse className="mx-auto mb-3 size-8 text-muted-foreground" />
                <p className="font-medium">
                  {t("创建第一个园区", "Create your first park")}
                </p>
                <p className="page-description">
                  {t(
                    "选择地图和设备模型，建立自己的验证空间。",
                    "Choose maps and device models to create a validation workspace.",
                  )}
                </p>
                <Button className="mt-4" variant="outline" asChild>
                  <Link href="/parks">
                    {t("前往园区管理", "Go to parks")}
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>{t("验证工作流", "Validation workflow")}</CardTitle>
            <p className="page-description">
              {t(
                "从基础资源到一次可回放的实验。",
                "From reusable assets to a replayable experiment.",
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {[
              {
                icon: Layers3,
                title: t("准备地图与模型", "Prepare maps and models"),
                detail: t(
                  "固定版本，确认尺寸和场景边界。",
                  "Pin revisions and verify dimensions and scene boundaries.",
                ),
              },
              {
                icon: Route,
                title: t("编排园区与任务", "Configure parks and tasks"),
                detail: t(
                  "放置设备、绘制路线并保存场景。",
                  "Place devices, draw routes and save the scene.",
                ),
              },
              {
                icon: Boxes,
                title: t("仿真、回放与分析", "Simulate, replay and analyze"),
                detail: t(
                  "检查运动轨迹、接触事件和执行指标。",
                  "Inspect trajectories, contact events and execution metrics.",
                ),
              },
            ].map((step, i) => (
              <div key={i} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted/50">
                  <step.icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {step.detail}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Notice>
        {t(
          "仿真预览：实机、视频、点云、远程接管尚未接通。",
          "Simulation preview: live devices, video, point clouds and takeover are not connected.",
        )}
      </Notice>
    </div>
  );
}

export function Resources({ kind }: { kind: Kind }) {
  const { data, error, isPending } = useCatalog(),
    { t } = useLocale(),
    query = useQueryClient();
  const [editor, setEditor] = useState<AnyResource | "new" | null>(null),
    [message, setMessage] = useState(""),
    [view, setView] = useState<AnyResource | null>(null),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const rows = (data?.[kind] ?? []).filter(
    (row) =>
      row.name
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()) &&
      (status === "all" ||
        (status === "archived" ? row.archived : !row.archived)),
  );
  async function action(row: AnyResource, verb: "clone" | "archive") {
    if (
      verb === "archive" &&
      !confirm(
        t(
          "归档该资源？引用检查仍会生效。",
          "Archive this resource? Reference checks still apply.",
        ),
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await api(
        `/api/platform/${kind}/${row.id}/${verb}`,
        verb === "archive" ? { version: row.version } : {},
      );
      await query.invalidateQueries({ queryKey: ["catalog"] });
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-heading">
            {t(titles[kind][0], titles[kind][1])}
          </h1>
          <p className="page-description">
            {t(descriptions[kind][0], descriptions[kind][1])}
          </p>
        </div>
        <Button onClick={() => setEditor("new")}>
          <Plus />
          {t("创建", "Create")}
        </Button>
      </div>
      {kind === "maps" && (
        <Notice>
          {t(
            "五张 RMF 地图先行；Manufacturing & Logistics 待补。底图不等于完整物理世界。",
            "Five RMF maps available; Manufacturing & Logistics pending. Maps are not complete physics worlds.",
          )}
        </Notice>
      )}
      {kind === "gateways" && (
        <Notice>
          {t(
            "此处登记网关和通道配置，不代表已接入或在线。",
            "Configuration only; registration does not establish connectivity or online status.",
          )}
        </Notice>
      )}
      {(error || message) && <Notice error>{message || error?.message}</Notice>}
      {isPending && <p>{t("载入中…", "Loading…")}</p>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="pl-9"
            aria-label={t("搜索资源", "Search resources")}
            placeholder={t("按名称搜索…", "Filter by name…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Choice
          label={t("资源状态", "Resource state")}
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: t("全部", "All") },
            { value: "active", label: t("未归档", "Not archived") },
            { value: "archived", label: t("已归档", "Archived") },
          ]}
        />
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="p-0">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("名称", "Name")}</TableHead>
                <TableHead>{t("版本", "Revision")}</TableHead>
                <TableHead>{t("状态", "State")}</TableHead>
                <TableHead>{t("操作", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {kind === "parks" ? (
                      <Link href={`/parks/${row.id}`}>{row.name}</Link>
                    ) : (
                      row.name
                    )}
                  </TableCell>
                  <TableCell>v{row.version}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {row.archived
                        ? t("已归档", "Archived")
                        : t("已配置", "Configured")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {kind === "parks" ? (
                        <Button asChild variant="outline">
                          <Link href={`/parks/${row.id}`}>
                            {t("进入园区", "Open park")}
                          </Link>
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={() => setView(row)}>
                          {t("查看", "View")}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        disabled={row.archived || busy}
                        onClick={() => setEditor(row)}
                      >
                        {t("编辑", "Edit")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => action(row, "clone")}
                      >
                        {t("克隆", "Clone")}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={row.archived || busy}
                        onClick={() => action(row, "archive")}
                      >
                        {t("归档", "Archive")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data && !rows.length && (
            <p className="py-12 text-center text-muted-foreground">
              {t(
                "没有匹配的资源，请调整筛选或创建资源。",
                "No matching resources. Adjust filters or create one.",
              )}
            </p>
          )}
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">
            {t("显示", "Showing")} {rows.length} / {data?.[kind].length ?? 0}{" "}
            {t("项资源", "resources")}
          </div>
        </CardContent>
      </Card>
      {data && editor && (
        <ResourceEditor
          key={editor === "new" ? "new" : editor.id}
          kind={kind}
          row={editor === "new" ? undefined : editor}
          catalog={data}
          close={() => setEditor(null)}
          saved={async () => {
            setEditor(null);
            await query.invalidateQueries({ queryKey: ["catalog"] });
          }}
        />
      )}
      <Dialog
        open={Boolean(view)}
        onOpenChange={(open) => !open && setView(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{view?.name}</DialogTitle>
            <DialogDescription>
              {t("资源只读预览", "Read-only resource preview")}
            </DialogDescription>
          </DialogHeader>
          {view?.kind === "maps" ? (
            <MapPreview row={view} />
          ) : (
            <pre className="overflow-auto text-xs">
              {JSON.stringify(view?.data, null, 2)}
            </pre>
          )}
          <Button
            variant="outline"
            onClick={() => view && download(`${view.id}.json`, view.data)}
          >
            {t("下载 JSON", "Download JSON")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function MapPreview({ row }: { row: Extract<AnyResource, { kind: "maps" }> }) {
  const [level, setLevel] = useState(row.data.levels[0].id);
  return (
    <>
      <Choice
        label="楼层 / Floor"
        value={level}
        onChange={setLevel}
        options={row.data.levels.map((l) => ({ value: l.id, label: l.id }))}
      />
      <MapStage map={row.data} levelId={level} objects={[]} devices={[]} />
    </>
  );
}

function ResourceEditor({
  kind,
  row,
  catalog,
  close,
  saved,
}: {
  kind: Kind;
  row?: AnyResource;
  catalog: Catalog;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const { t } = useLocale(),
    [name, setName] = useState(row?.name ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [model, setModel] = useState(() =>
    row?.kind === "models" ? row.data : modelDefault,
  );
  const [gateway, setGateway] = useState(() =>
    row?.kind === "gateways"
      ? row.data
      : gatewaySchema.parse({
          location: "local",
          adapter: "simulation",
          channels: [],
        }),
  );
  const [channels, setChannels] = useState(
      JSON.stringify(gateway.channels, null, 2),
    ),
    [sensors, setSensors] = useState(JSON.stringify(model.sensors, null, 2));
  const [mapText, setMapText] = useState(
    row?.kind === "maps" ? JSON.stringify(row.data, null, 2) : "",
  );
  const [park, setPark] = useState(() =>
    row?.kind === "parks"
      ? row.data
      : ({
          description: "",
          maps: [],
          models: [],
          gateways: [],
          devices: [],
          objects: [],
          tasks: [],
        } as ReturnType<typeof parkSchema.parse>),
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const raw =
        kind === "models"
          ? { ...model, sensors: JSON.parse(sensors) }
          : kind === "gateways"
            ? { ...gateway, channels: JSON.parse(channels) }
            : kind === "parks"
              ? park
              : JSON.parse(mapText);
      const data = schemas[kind].parse(raw);
      await api(`/api/platform/${kind}${row ? `/${row.id}` : ""}`, {
        name,
        data,
        ...(row ? { version: row.version } : {}),
      });
      await saved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {row
              ? t("编辑资源", "Edit resource")
              : t("创建资源", "Create resource")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "版本保存后可追溯；已有园区保持其绑定版本。",
              "Saved revisions are traceable; existing parks retain pinned versions.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Field label={t("名称", "Name")} value={name} onChange={setName} />
          {kind === "models" && (
            <>
              <Choice
                label={t("设备类型", "Category")}
                value={model.category}
                onChange={(v) =>
                  setModel({
                    ...model,
                    category: modelSchema.shape.category.parse(v),
                  })
                }
                options={[
                  "tugger",
                  "forklift",
                  "amr",
                  "quadruped",
                  "custom",
                ].map((v) => ({ value: v, label: v }))}
              />
              <div className="grid grid-cols-2 gap-4">
                {(
                  [
                    "length",
                    "width",
                    "height",
                    "wheelbase",
                    "maxSpeed",
                    "maxSteer",
                    "mass",
                    "trailers",
                    "trailerLength",
                    "trailerWidth",
                    "hitchLength",
                  ] as const
                ).map((key) => (
                  <Field
                    key={key}
                    label={key}
                    type="number"
                    step="any"
                    value={model[key]}
                    onChange={(v) => setModel({ ...model, [key]: Number(v) })}
                  />
                ))}
              </div>
              <Field
                label={t("说明", "Description")}
                value={model.description}
                onChange={(v) => setModel({ ...model, description: v })}
              />
              <label className="grid gap-2 text-sm">
                {t(
                  "传感器声明 JSON（不代表已有仿真）",
                  "Sensor declarations JSON (not simulated)",
                )}
                <Textarea
                  value={sensors}
                  onChange={(e) => setSensors(e.target.value)}
                />
              </label>
            </>
          )}
          {kind === "gateways" && (
            <>
              <Choice
                label={t("适配器", "Adapter")}
                value={gateway.adapter}
                onChange={(v) =>
                  setGateway({
                    ...gateway,
                    adapter: v as "simulation" | "external",
                  })
                }
                options={["simulation", "external"].map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
              <Choice
                label={t("位置", "Location")}
                value={gateway.location}
                onChange={(v) =>
                  setGateway({
                    ...gateway,
                    location: v as "local" | "edge" | "cloud",
                  })
                }
                options={["local", "edge", "cloud"].map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
              <Field
                label={t("端点（禁止填写凭证）", "Endpoint (no credentials)")}
                value={gateway.endpoint}
                onChange={(v) => setGateway({ ...gateway, endpoint: v })}
              />
              <Field
                label={t("说明", "Description")}
                value={gateway.description}
                onChange={(v) => setGateway({ ...gateway, description: v })}
              />
              <label className="grid gap-2 text-sm">
                {t(
                  "通道 JSON：name / kind / topic",
                  "Channels JSON: name / kind / topic",
                )}
                <Textarea
                  value={channels}
                  onChange={(e) => setChannels(e.target.value)}
                />
              </label>
            </>
          )}
          {kind === "maps" && (
            <label className="grid gap-2 text-sm">
              {t(
                "规范化地图 JSON（不是 SDF/URDF 导入）",
                "Normalized map JSON (not SDF/URDF import)",
              )}
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 4 * 1024 * 1024) {
                      setError("Maximum 4 MiB");
                      return;
                    }
                    setMapText(await file.text());
                  }
                }}
              />
              <Textarea
                className="min-h-72 font-mono text-xs"
                value={mapText}
                onChange={(e) => setMapText(e.target.value)}
              />
            </label>
          )}
          {kind === "parks" && (
            <>
              <Field
                label={t("说明", "Description")}
                value={park.description}
                onChange={(v) => setPark({ ...park, description: v })}
              />
              {(["maps", "models", "gateways"] as const).map((k) => (
                <fieldset key={k} className="rounded-lg border p-4">
                  <legend className="px-2 text-sm">
                    {t(titles[k][0], titles[k][1])}
                  </legend>
                  <div className="grid gap-3">
                    {catalog[k]
                      .filter((r) => !r.archived)
                      .map((r) => (
                        <label
                          key={r.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={
                              k === "gateways"
                                ? park.gateways.includes(r.id)
                                : park[k].some((x) => x.id === r.id)
                            }
                            onChange={(e) =>
                              setPark((p) =>
                                k === "gateways"
                                  ? {
                                      ...p,
                                      gateways: e.target.checked
                                        ? [...p.gateways, r.id]
                                        : p.gateways.filter(
                                            (id) => id !== r.id,
                                          ),
                                    }
                                  : k === "maps"
                                    ? {
                                        ...p,
                                        maps: e.target.checked
                                          ? [
                                              ...p.maps,
                                              {
                                                id: r.id,
                                                version: r.version,
                                                pose: [0, 0, 0],
                                              },
                                            ]
                                          : p.maps.filter((x) => x.id !== r.id),
                                      }
                                    : {
                                        ...p,
                                        models: e.target.checked
                                          ? [
                                              ...p.models,
                                              { id: r.id, version: r.version },
                                            ]
                                          : p.models.filter(
                                              (x) => x.id !== r.id,
                                            ),
                                      },
                              )
                            }
                          />
                          {r.name} · v{r.version}
                        </label>
                      ))}
                  </div>
                </fieldset>
              ))}
            </>
          )}
          {error && <Notice error>{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={close}
            >
              {t("取消", "Cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("保存中…", "Saving…") : t("保存", "Save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
