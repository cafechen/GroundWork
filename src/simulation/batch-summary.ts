import { z } from "zod";
import { DEFAULT_CONFIG } from "./yard-scenario";

export const batchConfigSchema = z
  .object({
    seed: z.number().int().min(1).max(1000000),
    speed: z.number().min(0.4).max(2.5),
    trailerLength: z.number().min(2).max(5),
    aisleWidth: z.number().min(2.4).max(8),
    doorDelay: z.number().min(0).max(60),
    policy: z.enum(["fifo", "none"]),
    vehicleCount: z.number().int().min(1).max(2),
    dt: z.number().min(0.02).max(0.2),
    duration: z.number().min(10).max(120),
  })
  .strict();
export const batchInputSchema = z
  .object({ config: batchConfigSchema.partial().default({}) })
  .strict();
const pairSchema = z
  .object({
    seed: z.number(),
    doorDelay: z.number(),
    baselineId: z.string(),
    candidateId: z.string(),
  })
  .strict();
export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string(),
    createdAt: z.string(),
    config: batchConfigSchema,
    pairs: z.array(pairSchema).length(6),
  })
  .strict()
  .superRefine((m, ctx) => {
    const ids = m.pairs.flatMap((p) => [p.baselineId, p.candidateId]);
    if (
      new Set(ids).size !== 12 ||
      m.pairs.some(
        (p, i) =>
          p.seed !== [11, 42][Math.floor(i / 3)] ||
          p.doorDelay !== [0, 8, 18][i % 3],
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid matched batch manifest / 无效配对清单",
      });
  });
export type BatchManifest = z.infer<typeof manifestSchema>;
export function makeManifest(
  config: unknown,
  id: () => string,
  createdAt: string,
): BatchManifest {
  return manifestSchema.parse({
    schemaVersion: 1,
    id: id(),
    createdAt,
    config: batchConfigSchema.parse({
      ...DEFAULT_CONFIG,
      ...batchInputSchema.parse({ config }).config,
    }),
    pairs: [11, 42].flatMap((seed) =>
      [0, 8, 18].map((doorDelay) => ({
        seed,
        doorDelay,
        baselineId: id(),
        candidateId: id(),
      })),
    ),
  });
}
export type BatchRun = {
  id: string;
  status: string;
  engine: string;
  engineVersion: string;
  codeFingerprint: string;
  inputHash: string;
  inputSnapshot: unknown;
  verdict: string | null;
  metrics: unknown;
};
export function summarizeBatch(manifest: BatchManifest, rows: BatchRun[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const memberIds = manifest.pairs.flatMap((p) => [
    p.baselineId,
    p.candidateId,
  ]);
  const members = memberIds.map((id) => byId.get(id));
  const evidence = (r: BatchRun | undefined) =>
    r
      ? {
          id: r.id,
          status: r.status,
          verdict: r.verdict,
          metrics: r.metrics,
          engineVersion: r.engineVersion,
          codeFingerprint: r.codeFingerprint,
          inputHash: r.inputHash,
        }
      : null;
  const pairs = manifest.pairs.map((p) => {
    const b = byId.get(p.baselineId),
      c = byId.get(p.candidateId);
    let reason = "";
    if (!b || !c) reason = "Missing run / 缺少实验记录";
    else if (b.status !== "completed" || c.status !== "completed")
      reason = "Pair not completed / 配对尚未全部完成";
    else if (
      b.engine !== "yard" ||
      c.engine !== "yard" ||
      b.engineVersion !== c.engineVersion ||
      b.codeFingerprint !== c.codeFingerprint ||
      !b.codeFingerprint ||
      b.codeFingerprint === "pending-worker"
    )
      reason = "Engine/code mismatch / 引擎或代码版本不一致";
    else {
      for (const [r, policy] of [
        [b, "fifo"],
        [c, "none"],
      ] as const) {
        const input = r.inputSnapshot as {
          engine?: string;
          config?: Record<string, unknown>;
        } | null;
        const expected = {
          ...manifest.config,
          seed: p.seed,
          doorDelay: p.doorDelay,
          policy,
        };
        if (
          input?.engine !== "yard" ||
          !input.config ||
          Object.keys(input.config).length !== Object.keys(expected).length ||
          Object.entries(expected).some(([k, v]) => input.config?.[k] !== v)
        )
          reason = "Input mismatch / 输入不符合配对清单";
        const metrics = r.metrics as Record<string, unknown> | null;
        if (
          !["PASS", "FAIL"].includes(r.verdict ?? "") ||
          !metrics ||
          ["totalWait", "collisionEpisodes", "duration"].some(
            (k) =>
              typeof metrics[k] !== "number" || !Number.isFinite(metrics[k]),
          )
        )
          reason = "Invalid evidence / 指标或判定不完整";
      }
    }
    const bm = b?.metrics as Record<string, number>,
      cm = c?.metrics as Record<string, number>;
    const comparison = reason
      ? null
      : {
          baseline: b!.verdict,
          candidate: c!.verdict,
          waitDelta: cm.totalWait - bm.totalWait,
          collisionDelta: cm.collisionEpisodes - bm.collisionEpisodes,
          durationDelta: cm.duration - bm.duration,
          regression: b!.verdict === "PASS" && c!.verdict !== "PASS",
        };
    return {
      ...p,
      baseline: evidence(b),
      candidate: evidence(c),
      reason,
      comparison,
    };
  });
  const comparable = pairs.filter((p) => p.comparison !== null);
  const count = (status: string) =>
    members.filter((r) => r?.status === status).length;
  return {
    manifest,
    pairs,
    summary: {
      runs: 12,
      completed: count("completed"),
      queued: count("queued"),
      running: count("running"),
      cancelled: count("cancelled"),
      failed: count("failed"),
      interrupted: count("interrupted"),
      missing: members.filter((r) => !r).length,
      evaluatedPairs: comparable.length,
      regressions: comparable.filter((p) => p.comparison!.regression).length,
      baselinePass: comparable.filter((p) => p.comparison!.baseline === "PASS")
        .length,
      candidatePass: comparable.filter(
        (p) => p.comparison!.candidate === "PASS",
      ).length,
    },
  };
}
export type BatchSummary = ReturnType<typeof summarizeBatch>;
export function batchCsv(batch: BatchSummary) {
  const cell = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    [
      "seed",
      "door_delay_s",
      "baseline_id",
      "candidate_id",
      "baseline_status",
      "candidate_status",
      "baseline_verdict",
      "candidate_verdict",
      "wait_delta_s",
      "collision_delta",
      "duration_delta_s",
      "regression",
      "reason",
    ],
    ...batch.pairs.map((p) => [
      p.seed,
      p.doorDelay,
      p.baselineId,
      p.candidateId,
      p.baseline?.status,
      p.candidate?.status,
      p.baseline?.verdict,
      p.candidate?.verdict,
      p.comparison?.waitDelta,
      p.comparison?.collisionDelta,
      p.comparison?.durationDelta,
      p.comparison?.regression,
      p.reason,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
export function batchReport(batch: BatchSummary) {
  const escaped = JSON.stringify(batch, null, 2).replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!,
  );
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>GroundWork matched batch</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Matched regression / 配对回归</h1><p>Synthetic planar model; not a safety certification. / 合成平面模型，不构成安全认证。</p><p>Evaluated / 已比较 ${batch.summary.evaluatedPairs}/6; incomplete or incompatible pairs are excluded / 未完成或不兼容配对不计入通过数。</p><pre>${escaped}</pre></html>`;
}
