import { database } from "@/server/db";
import { PlatformRepository } from "@/server/repositories/platform";
import { RunService } from "@/server/services/runs";
import { guardRequest, response, failure, body } from "@/server/http";
import { reportHtml } from "@/simulation/lab-domain";
import { exportXosc, exportRmfGraph, exportSdf } from "@/simulation/exports";
import { PlatformError } from "@/server/errors";
import { decodeJson } from "@/server/repositories/json-codec";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  req: Request,
  ctx: { params: Promise<{ segments?: string[] }> },
) {
  try {
    guardRequest(req);
    const db = database(),
      service = new RunService(db, new PlatformRepository(db));
    const parts = (await ctx.params).segments ?? [],
      [id, action] = parts;
    if (parts.length > 2 || (id && !/^[a-zA-Z0-9_-]{1,80}$/.test(id)))
      throw new PlatformError("Not found / 不存在", 404);
    if (req.method === "GET" && !id) return response(await service.list());
    if (req.method === "POST" && !id)
      return response(
        await service.submitLab(await body(req, 1024 * 1024)),
        202,
      );
    if (
      req.method === "GET" &&
      id &&
      ["report", "xosc", "rmf", "sdf"].includes(action)
    ) {
      const run = await service.result(id);
      let value: string;
      try {
        value =
          action === "report"
            ? reportHtml(run)
            : action === "xosc"
              ? exportXosc(run)
              : action === "rmf"
                ? JSON.stringify(exportRmfGraph(run), null, 2)
                : exportSdf(run);
      } catch (e) {
        throw new PlatformError(
          e instanceof Error ? e.message : "Unsupported export",
        );
      }
      return new Response(value, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="groundwork-${id}.${action === "report" ? "html" : action === "rmf" ? "json" : action}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (req.method === "GET" && id && !action) {
      const row = await db.simulationRun.findUnique({ where: { id } });
      if (!row) throw new PlatformError("Run not found / 实验不存在", 404);
      return response({
        ...row,
        inputSnapshot: decodeJson(row.inputSnapshot),
        metrics: decodeJson(row.metrics),
        error: decodeJson(row.error),
      });
    }
    if (req.method === "GET" && id && action === "result")
      return response(await service.result(id));
    if (req.method === "POST" && id && action === "cancel")
      return response(await service.cancel(id));
    throw new PlatformError("Not found / 不存在", 404);
  } catch (e) {
    return failure(e);
  }
}
export const GET = handle;
export const POST = handle;
