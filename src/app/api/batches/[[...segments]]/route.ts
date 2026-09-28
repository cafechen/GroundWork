import { database } from "@/server/db";
import { PlatformRepository } from "@/server/repositories/platform";
import { BatchService } from "@/server/services/batches";
import { guardRequest, response, failure, body } from "@/server/http";
import { PlatformError } from "@/server/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  req: Request,
  ctx: { params: Promise<{ segments?: string[] }> },
) {
  try {
    guardRequest(req);
    const parts = (await ctx.params).segments ?? [],
      [id, action] = parts;
    if (parts.length > 2 || (id && !/^[a-zA-Z0-9_-]{1,80}$/.test(id)))
      throw new PlatformError("Not found / 不存在", 404);
    const db = database(),
      service = new BatchService(db, new PlatformRepository(db));
    if (req.method === "GET" && !id) return response(await service.list());
    if (req.method === "POST" && !id)
      return response(await service.submit(await body(req, 16384)), 202);
    if (req.method === "GET" && id && !action)
      return response(await service.get(id));
    if (req.method === "POST" && id && action === "cancel")
      return response(await service.cancel(id));
    throw new PlatformError("Not found / 不存在", 404);
  } catch (e) {
    return failure(e);
  }
}
export const GET = handle;
export const POST = handle;
