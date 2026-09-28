"use client";
import { errorMessage } from "@/lib/error-message";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Evidence } from "@/simulation/lab-domain";
import type { MapData, DeviceData, SceneObject } from "@/contracts/platform";
import {
  DEFAULT_CONFIG,
  PRESETS,
  parseScenario,
} from "@/simulation/yard-scenario";
import { api, type RunSummary } from "@/data/platform";
import { useLocale } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Field, Choice, Notice, download } from "@/components/common";
import { MapStage } from "./scene/map-stage";
import { Batches } from "./batches";
import type { BatchSummary } from "@/simulation/batch-summary";
const noDevices: DeviceData[] = [];
const noObjects: SceneObject[] = [];
type Capabilities = {
  engines: { yard: boolean; road: boolean; chrono: boolean };
  modelGateway: boolean;
  plan: unknown;
  catalog: unknown;
};
export function Laboratory({ classic = false }: { classic?: boolean }) {
  const { t } = useLocale(),
    q = useQueryClient();
  const caps = useQuery({
    queryKey: ["capabilities"],
    queryFn: ({ signal }) =>
      api<Capabilities>("/api/capabilities", undefined, signal),
  });
  const runs = useQuery({
    queryKey: ["lab-runs"],
    queryFn: ({ signal }) => api<RunSummary[]>("/api/runs", undefined, signal),
    refetchInterval: 1500,
  });
  const [engine, setEngine] = useState("yard"),
    [config, setConfig] = useState({ ...DEFAULT_CONFIG }),
    [duration, setDuration] = useState(60),
    [vehicles, setVehicles] = useState(1),
    [trailers, setTrailers] = useState(3),
    [speed, setSpeed] = useState(1.3),
    [friction, setFriction] = useState(0.8),
    [plan, setPlan] = useState(""),
    [geojson, setGeojson] = useState(""),
    [prompt, setPrompt] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Evidence | null>(null),
    [runId, setRunId] = useState(""),
    [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(false),
    [rate, setRate] = useState(1),
    [baseline, setBaseline] = useState(""),
    [comparison, setComparison] = useState<unknown>(null),
    [batch, setBatch] = useState("");
  const runList = (runs.data ?? []).filter((r) => r.engine !== "park");
  useEffect(() => {
    if (!playing || !result) return;
    let last = performance.now(),
      carry = 0;
    const timer = setInterval(() => {
      const now = performance.now(),
        delta = ((now - last) / 1000) * rate;
      last = now;
      setFrame((i) => {
        const target = result.frames[i].t + delta + carry;
        let next = i;
        while (
          next < result.frames.length - 1 &&
          result.frames[next + 1].t <= target
        )
          next++;
        carry = target - result.frames[next].t;
        return next;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [playing, result, rate]);
  async function action(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const request = () =>
    engine === "yard"
      ? { engine, config }
      : engine === "road"
        ? {
            engine,
            plan: plan ? JSON.parse(plan) : caps.data?.plan,
            ...(geojson ? { map: JSON.parse(geojson) } : {}),
          }
        : { engine, duration, vehicles, trailers, speed, friction };
  const load = async (id: string) => {
    const r = await api<Evidence>(`/api/runs/${id}/result`);
    setResult(r);
    setRunId(id);
    setFrame(0);
    setPlaying(true);
  };
  const map = useMemo<MapData | null>(() => {
    if (!result) return null;
    const obstacleVertices = (result.map.obstacles ?? []).flatMap((o) => [
      [o.x, o.y],
      [o.x + o.w, o.y],
      [o.x + o.w, o.y + o.h],
      [o.x, o.y + o.h],
    ]);
    const routeVertices = result.map.routes.flat();
    const vertices = [...obstacleVertices, ...routeVertices].map(
      ([x, y], id) => ({ id, x, y, z: 0, name: "", parameters: {} }),
    );
    let offset = obstacleVertices.length;
    const lanes = result.map.routes.flatMap((route) => {
      const start = offset;
      offset += route.length;
      return route.slice(1).map((_, i) => ({
        id: start + i,
        start: start + i,
        end: start + i + 1,
        graph: 0,
        bidirectional: false,
        parameters: {},
      }));
    });
    return {
      schemaVersion: 1,
      id: "lab",
      name: { zh: "合成实验", en: "Synthetic lab" },
      units: { length: "m", angle: "rad" },
      source: { kind: "synthetic" },
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
          id: "L1",
          elevation: 0,
          vertices,
          lanes,
          walls: (result.map.obstacles ?? []).flatMap((_, i) =>
            Array.from({ length: 4 }, (_, j) => ({
              id: i * 4 + j,
              start: i * 4 + j,
              end: i * 4 + ((j + 1) % 4),
              parameters: {},
            })),
          ),
          doors: [],
          floors: [],
          holes: [],
          models: [],
          graphs: [0],
          bounds: result.map.bounds,
        },
      ],
    };
  }, [result]);
  return (
    <div className="space-y-6">
      <p className="text-xs tracking-[.2em]">GROUNDWORK / LABORATORY</p>
      <h1 className="text-3xl font-semibold">
        {classic
          ? t("经典实验室", "Classic laboratory")
          : t("独立实验室", "Standalone laboratory")}
      </h1>
      <Notice>
        {t(
          "合成场景；不同引擎不是同一车辆的可互换后端。Chrono 仍独立，不接园区地图。",
          "Synthetic scenes. Engines are not interchangeable backends for one vehicle. Chrono remains separate from park maps.",
        )}
      </Notice>
      {(error || caps.error || runs.error) && (
        <Notice error>
          {error || caps.error?.message || runs.error?.message}
        </Notice>
      )}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("实验输入", "Experiment inputs")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!classic && (
              <Choice
                label={t("引擎", "Engine")}
                value={engine}
                onChange={setEngine}
                options={["yard", "road", "chrono"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            )}
            {engine === "yard" && (
              <>
                <Choice
                  label={t("场景预设", "Preset")}
                  value="custom"
                  onChange={(v) =>
                    v !== "custom" &&
                    setConfig({ ...PRESETS[v as keyof typeof PRESETS] })
                  }
                  options={[
                    {
                      value: "custom",
                      label: t("当前参数", "Current parameters"),
                    },
                    ...Object.keys(PRESETS).map((value) => ({
                      value,
                      label: value,
                    })),
                  ]}
                />
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      "seed",
                      "speed",
                      "trailerLength",
                      "aisleWidth",
                      "doorDelay",
                      "vehicleCount",
                      "dt",
                      "duration",
                    ] as const
                  ).map((key) => (
                    <Field
                      key={key}
                      label={key}
                      value={config[key]}
                      type="number"
                      step="any"
                      onChange={(v) =>
                        setConfig({ ...config, [key]: Number(v) })
                      }
                    />
                  ))}
                </div>
                <Choice
                  label={t("路权策略", "Policy")}
                  value={config.policy}
                  onChange={(policy) => setConfig({ ...config, policy })}
                  options={["fifo", "none"].map((value) => ({
                    value,
                    label: value,
                  }))}
                />
                <label className="grid gap-2 text-sm">
                  {t("导入配置 JSON", "Import configuration JSON")}
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        void action(async () => {
                          if (f.size > 1024 * 1024) throw Error("1 MiB limit");
                          setConfig(parseScenario(await f.text()).config);
                        });
                    }}
                  />
                </label>
                <Button
                  variant="outline"
                  onClick={() =>
                    download("scene.json", {
                      schemaVersion: 1,
                      id: "crossing-yard",
                      config,
                    })
                  }
                >
                  {t("导出配置", "Export configuration")}
                </Button>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() =>
                    action(async () => {
                      const created = await api<BatchSummary>("/api/batches", {
                        config,
                      });
                      setBatch(created.manifest.id);
                      await q.invalidateQueries({ queryKey: ["batches"] });
                      await q.invalidateQueries({ queryKey: ["lab-runs"] });
                    })
                  }
                >
                  {t("6 组配对回归（12 次）", "6 paired cases (12 runs)")}
                </Button>
              </>
            )}
            {engine === "road" && (
              <>
                <label className="grid gap-2 text-sm">
                  {t("结构化场景方案 JSON", "Structured plan JSON")}
                  <Textarea
                    className="h-64 max-h-96 field-sizing-fixed font-mono text-xs"
                    value={
                      plan || JSON.stringify(caps.data?.plan ?? {}, null, 2)
                    }
                    onChange={(e) => setPlan(e.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  {t("可选本地米制 GeoJSON", "Optional local-metres GeoJSON")}
                  <Textarea
                    value={geojson}
                    onChange={(e) => setGeojson(e.target.value)}
                  />
                </label>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      const p = await api<{ plan: unknown }>(
                        "/api/plan",
                        geojson ? { map: JSON.parse(geojson) } : {},
                      );
                      setPlan(JSON.stringify(p.plan, null, 2));
                    })
                  }
                >
                  {t("生成模板方案", "Generate template")}
                </Button>
                <Field
                  label={t(
                    "模型网关提示词（显式发送）",
                    "Model gateway prompt (explicit send)",
                  )}
                  value={prompt}
                  onChange={setPrompt}
                />
                <Button
                  disabled={busy || !caps.data?.modelGateway}
                  onClick={() =>
                    action(async () => {
                      const p = await api<{ plan: unknown }>(
                        "/api/model-plan",
                        {
                          prompt,
                          ...(geojson ? { map: JSON.parse(geojson) } : {}),
                        },
                      );
                      setPlan(JSON.stringify(p.plan, null, 2));
                    })
                  }
                >
                  {t("调用已配置模型网关", "Call configured model gateway")}
                </Button>
              </>
            )}
            {engine === "chrono" && (
              <>
                {!caps.data?.engines.chrono && (
                  <Notice>
                    {t(
                      "尚未配置 Chrono Python，不能运行。",
                      "Chrono Python is not configured; running is disabled.",
                    )}
                  </Notice>
                )}
                <Field
                  label="duration / s"
                  value={duration}
                  type="number"
                  onChange={(v) => setDuration(Number(v))}
                />
                <Field
                  label="vehicles"
                  value={vehicles}
                  type="number"
                  onChange={(v) => setVehicles(Number(v))}
                />
                <Field
                  label="trailers"
                  value={trailers}
                  type="number"
                  onChange={(v) => setTrailers(Number(v))}
                />
                <Field
                  label="speed / m/s"
                  value={speed}
                  type="number"
                  step="any"
                  onChange={(v) => setSpeed(Number(v))}
                />
                <Field
                  label="friction"
                  value={friction}
                  type="number"
                  step="any"
                  onChange={(v) => setFriction(Number(v))}
                />
              </>
            )}
            <Button
              className="w-full"
              disabled={
                busy || (engine === "chrono" && !caps.data?.engines.chrono)
              }
              onClick={() =>
                action(async () => {
                  await api("/api/runs", request());
                  await q.invalidateQueries({ queryKey: ["lab-runs"] });
                })
              }
            >
              {t("运行实验", "Run experiment")}
            </Button>
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{t("结果回放", "Result replay")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {map && result ? (
                <>
                  <MapStage
                    map={map}
                    levelId="L1"
                    objects={noObjects}
                    devices={noDevices}
                    frame={result.frames[frame]}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => {
                        if (frame === result.frames.length - 1) setFrame(0);
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
                  </div>
                  <p>
                    {result.verdict} · {result.validity}
                  </p>
                  <pre className="overflow-auto text-xs">
                    {JSON.stringify(result.metrics, null, 2)}
                  </pre>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => download("run.json", result)}
                    >
                      JSON
                    </Button>
                    {["report", "xosc", "rmf", "sdf"].map((action) => (
                      <Button
                        key={action}
                        asChild
                        variant="outline"
                        disabled={
                          result.engine === "chrono" && action === "xosc"
                        }
                      >
                        <a href={`/api/runs/${runId}/${action}`}>{action}</a>
                      </Button>
                    ))}
                  </div>
                  <details>
                    <summary>
                      {t("事件与溯源", "Events and provenance")}
                    </summary>
                    <pre className="max-h-64 overflow-auto text-xs">
                      {JSON.stringify(
                        {
                          events: result.events,
                          provenance: result.provenance,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </>
              ) : (
                <p className="py-16 text-center text-muted-foreground">
                  {t(
                    "运行实验，然后选择已完成记录回放。",
                    "Run an experiment, then replay a completed record.",
                  )}
                </p>
              )}
            </CardContent>
          </Card>
          <Batches selected={batch} onSelect={setBatch} onReplay={load} />
          <Card>
            <CardHeader>
              <CardTitle>{t("实验记录", "Runs")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {runList.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm"
                >
                  <span>
                    {r.id.slice(0, 8)} · {r.engine} · {r.status} · {r.verdict}
                  </span>
                  {r.status === "completed" ? (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => action(() => load(r.id))}
                      >
                        {t("回放", "Replay")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setBaseline(r.id)}
                      >
                        {baseline === r.id
                          ? t("已选基线", "Baseline selected")
                          : t("设为基线", "Set baseline")}
                      </Button>
                      {baseline && (
                        <Button
                          variant="outline"
                          onClick={() =>
                            action(async () =>
                              setComparison(
                                await api("/api/compare", {
                                  baseline,
                                  candidate: r.id,
                                }),
                              ),
                            )
                          }
                        >
                          {t("比较", "Compare")}
                        </Button>
                      )}
                    </div>
                  ) : ["queued", "running"].includes(r.status) ? (
                    <Button
                      variant="outline"
                      onClick={() =>
                        action(async () => {
                          await api(`/api/runs/${r.id}/cancel`, {});
                          await q.invalidateQueries({ queryKey: ["lab-runs"] });
                        })
                      }
                    >
                      {t("取消", "Cancel")}
                    </Button>
                  ) : null}
                </div>
              ))}
              {comparison !== null && (
                <pre className="overflow-auto text-xs">
                  {JSON.stringify(comparison, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
