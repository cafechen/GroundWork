import { z } from "zod";
import { guardRequest, body, response, failure } from "@/server/http";
import { PlatformError } from "@/server/errors";
import { database } from "@/server/db";
import { PlatformRepository } from "@/server/repositories/platform";
import { RunService } from "@/server/services/runs";
import { planContext, defaultPlan, modelPlan } from "@/simulation/planning";
import { compareResults } from "@/simulation/lab-domain";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  req: Request,
  ctx: { params: Promise<{ operation: string }> },
) {
  try {
    guardRequest(req);
    const { operation } = await ctx.params;
    if (req.method === "GET" && operation === "capabilities") {
      const { map, catalog } = planContext();
      return response({
        engines: {
          park: true,
          yard: true,
          road: true,
          chrono: Boolean(process.env.GROUNDWORK_CHRONO_PYTHON),
        },
        modelGateway: Boolean(process.env.GROUNDWORK_MODEL_URL),
        catalog,
        plan: defaultPlan(map, catalog),
        limits: { queued: 12, jobs: 200 },
        security: "trusted-lan-no-auth",
      });
    }
    if (req.method === "POST") {
      const raw = await body(req, 1024 * 1024);
      if (operation === "plan") {
        const input = z
          .object({ map: z.unknown().optional() })
          .strict()
          .parse(raw);
        const { map, catalog } = planContext(input.map);
        return response({ catalog, plan: defaultPlan(map, catalog) });
      }
      if (operation === "model-plan") {
        const input = z
          .object({
            prompt: z.string().min(1).max(4000),
            map: z.unknown().optional(),
          })
          .strict()
          .parse(raw);
        return response(await modelPlan(input.prompt, input.map));
      }
      if (operation === "compare") {
        const input = z
            .object({ baseline: z.string(), candidate: z.string() })
            .strict()
            .parse(raw),
          db = database(),
          runs = new RunService(db, new PlatformRepository(db));
        return response(
          compareResults(
            await runs.result(input.baseline),
            await runs.result(input.candidate),
          ),
        );
      }
    }
    throw new PlatformError("Not found / 不存在", 404);
  } catch (e) {
    return failure(e);
  }
}
export const GET = handle;
export const POST = handle;
