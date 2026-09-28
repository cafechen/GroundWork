import {
  kindSchema,
  runInputSchema,
  revisionInputSchema,
  cloneInputSchema,
} from "@/contracts/platform";
import { database } from "@/server/db";
import { PlatformRepository } from "@/server/repositories/platform";
import { RunService } from "@/server/services/runs";
import { body, guardRequest, response, failure } from "@/server/http";
import { PlatformError } from "@/server/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ segments?: string[] }> };
async function handle(req: Request, context: Context) {
  try {
    guardRequest(req);
    const db = database(),
      repo = new PlatformRepository(db),
      runs = new RunService(db, repo);
    const segments = (await context.params).segments ?? [];
    if (!segments.length && req.method === "GET")
      return response(await repo.catalog());
    const [rawKind, id, action] = segments;
    const kind = kindSchema.parse(rawKind);
    if (segments.length > 3 || (id && !/^[a-zA-Z0-9_-]{1,80}$/.test(id)))
      throw new PlatformError("Not found / 不存在", 404);
    if (req.method === "GET") {
      if (!id) return response(await repo.list(kind));
      if (action === "versions") return response(await repo.history(kind, id));
      if (action === "runs" && kind === "parks") {
        await repo.get(kind, id);
        return response(await runs.list(id));
      }
      if (!action) {
        const v = new URL(req.url).searchParams.get("version");
        if (v !== null && !/^[1-9]\d{0,6}$/.test(v))
          throw new PlatformError("Invalid version / 版本无效");
        return response(
          await repo.get(kind, id, v === null ? undefined : Number(v)),
        );
      }
    }
    if (req.method === "POST") {
      const input = await body(req);
      if (!action)
        return response(await repo.save(kind, input, id), id ? 200 : 201);
      if (action === "archive" && id)
        return response(
          await repo.archive(
            kind,
            id,
            revisionInputSchema.parse(input).version,
          ),
        );
      if (action === "clone" && id) {
        const parsed = cloneInputSchema.parse(input),
          old = await repo.get(kind, id);
        return response(
          await repo.save(kind, {
            name: parsed.name ?? `${old.name} copy`,
            data: old.data,
          }),
          201,
        );
      }
      if (action === "runs" && kind === "parks" && id)
        return response(
          await runs.submit(id, runInputSchema.parse(input)),
          202,
        );
    }
    throw new PlatformError("Unsupported route / 不支持的接口", 404);
  } catch (e) {
    return failure(e);
  }
}
export const GET = handle;
export const POST = handle;
