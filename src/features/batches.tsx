"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/data/platform";
import { useLocale } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Choice, Notice, download } from "@/components/common";
import { errorMessage } from "@/lib/error-message";
import {
  batchCsv,
  batchReport,
  type BatchManifest,
  type BatchSummary,
} from "@/simulation/batch-summary";

function textDownload(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Batches({
  selected,
  onSelect,
  onReplay,
}: {
  selected: string;
  onSelect: (id: string) => void;
  onReplay: (id: string) => Promise<void>;
}) {
  const { t } = useLocale(),
    q = useQueryClient(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ["batches"],
    queryFn: ({ signal }) =>
      api<BatchManifest[]>("/api/batches", undefined, signal),
  });
  const id = selected || list.data?.[0]?.id || "";
  const batch = useQuery({
    queryKey: ["batch", id],
    queryFn: ({ signal }) =>
      api<BatchSummary>(`/api/batches/${id}`, undefined, signal),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data &&
      query.state.data.summary.queued + query.state.data.summary.running === 0
        ? false
        : 1500,
  });
  const data = batch.data,
    s = data?.summary;
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card data-testid="batch-panel">
      <CardHeader>
        <CardTitle>{t("配对回归批次", "Matched regression batches")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 min-w-0">
        <p className="text-sm text-muted-foreground">
          {t(
            "固定种子 11/42 × 门禁延迟 0/8/18 秒，每组比较 FIFO 与无互斥策略；其余参数保持一致。种子、延迟和策略由批次覆盖。",
            "Seeds 11/42 × door delays 0/8/18 s; FIFO versus no exclusion, with all other parameters matched. The batch overrides seed, delay and policy.",
          )}
        </p>
        {(error || list.error || batch.error) && (
          <Notice error>
            {error || list.error?.message || batch.error?.message}
          </Notice>
        )}
        {list.data?.length ? (
          <Choice
            label={t("批次历史（最近 20 批）", "Batch history (latest 20)")}
            value={id}
            onChange={onSelect}
            options={list.data.map((m) => ({
              value: m.id,
              label: `${m.createdAt} · ${m.id.slice(0, 8)}`,
            }))}
          />
        ) : (
          <p>
            {t(
              "暂无批次；点击“6 组配对回归”开始。",
              "No batches. Start with “6 paired cases”.",
            )}
          </p>
        )}
        {data && s && (
          <>
            <p data-testid="batch-progress">
              {t("已完成", "Completed")} {s.completed}/12 ·{" "}
              {t("已比较", "Compared")} {s.evaluatedPairs}/6 ·{" "}
              {t("回归", "Regressions")} {s.regressions}
            </p>
            <p className="text-sm">
              {t(
                "基线通过 / 候选通过（仅计可比较组）",
                "Baseline / candidate passes (comparable pairs only)",
              )}
              : {s.baselinePass}/{s.evaluatedPairs} · {s.candidatePass}/
              {s.evaluatedPairs}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(
                "排队 / 执行 / 失败 / 取消 / 中断 / 缺失",
                "Queued / running / failed / cancelled / interrupted / missing",
              )}
              : {s.queued} / {s.running} / {s.failed} / {s.cancelled} /{" "}
              {s.interrupted} / {s.missing}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy || s.queued + s.running === 0}
                onClick={() =>
                  action(async () => {
                    await api(`/api/batches/${id}/cancel`, {});
                    await q.invalidateQueries({ queryKey: ["batch", id] });
                    await q.invalidateQueries({ queryKey: ["lab-runs"] });
                  })
                }
              >
                {t("取消未完成任务", "Cancel unfinished runs")}
              </Button>
              <Button
                variant="outline"
                onClick={() => download(`batch-${id}.json`, data)}
              >
                JSON
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  textDownload(
                    `batch-${id}.csv`,
                    batchCsv(data),
                    "text/csv;charset=utf-8",
                  )
                }
              >
                CSV
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  textDownload(
                    `batch-${id}.html`,
                    batchReport(data),
                    "text/html;charset=utf-8",
                  )
                }
              >
                {t("批次报告", "Batch report")}
              </Button>
            </div>
            <div className="max-w-full overflow-x-auto">
              <table
                className="w-full min-w-[680px] text-sm"
                data-testid="batch-table"
              >
                <thead>
                  <tr className="border-b text-left">
                    <th>{t("种子 / 延迟(s)", "Seed / delay(s)")}</th>
                    <th>FIFO</th>
                    <th>{t("无互斥", "No exclusion")}</th>
                    <th>Δ {t("等待(s)", "wait(s)")}</th>
                    <th>Δ {t("碰撞次数", "contacts")}</th>
                    <th>{t("判定", "Verdict")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pairs.map((p) => (
                    <tr className="border-b" key={p.baselineId}>
                      <td className="py-3">
                        {p.seed} / {p.doorDelay}
                      </td>
                      {[p.baseline, p.candidate].map((r, i) => (
                        <td key={i} className="py-3">
                          <div>
                            {r?.status ?? "missing"} · {r?.verdict ?? "—"}
                          </div>
                          {r?.status === "completed" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => action(() => onReplay(r.id))}
                            >
                              {t("回放", "Replay")} {r.id.slice(0, 6)}
                            </Button>
                          )}
                        </td>
                      ))}
                      <td>{p.comparison?.waitDelta.toFixed(2) ?? "—"}</td>
                      <td>{p.comparison?.collisionDelta ?? "—"}</td>
                      <td className="max-w-48">
                        {p.comparison
                          ? p.comparison.regression
                            ? t("回归", "Regression")
                            : t("无新增退化", "No new regression")
                          : p.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "未完成或不兼容配对不计入通过数。“无新增退化”不代表两个策略都通过；查看各自判定。合成平面模型，不构成安全认证。",
                "Incomplete or incompatible pairs are excluded. “No new regression” does not mean both policies pass; inspect their verdicts. Synthetic planar model, not a safety certification.",
              )}
            </p>
            <details>
              <summary>
                {t("复现清单与版本证据", "Manifest and version evidence")}
              </summary>
              <pre className="max-h-80 overflow-auto text-xs">
                {JSON.stringify(data, null, 2)}
              </pre>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
