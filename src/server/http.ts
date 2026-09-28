import { ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { PlatformError } from "./errors";
export function guardRequest(req: Request) {
  const authority = req.headers.get("host");
  if (!authority)
    throw new PlatformError(
      "Host required / 缺少主机名",
      403,
      "HOST_FORBIDDEN",
    );
  let host: string;
  try {
    host = new URL(`http://${authority}`).hostname;
  } catch {
    throw new PlatformError("Invalid host / 无效主机名", 403);
  }
  const allowed = new Set([
    "localhost",
    "127.0.0.1",
    "[::1]",
    ...(process.env.GROUNDWORK_ALLOWED_HOSTS ?? "").split(",").filter(Boolean),
  ]);
  if (!allowed.has(host))
    throw new PlatformError(
      "Host is not allowed / 主机未获允许",
      403,
      "HOST_FORBIDDEN",
    );
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    const expected = process.env.GROUNDWORK_ORIGIN ?? `http://${authority}`;
    if (
      origin !== expected ||
      ["cross-site", "none"].includes(req.headers.get("sec-fetch-site") ?? "")
    )
      throw new PlatformError(
        "Same-origin request required / 仅允许同源请求",
        403,
        "ORIGIN_FORBIDDEN",
      );
  }
}
export async function body(
  req: Request,
  limit = 4 * 1024 * 1024,
): Promise<unknown> {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new PlatformError("JSON body required / 请发送 JSON", 415);
  if (Number(req.headers.get("content-length")) > limit)
    throw new PlatformError("Request too large / 请求过大", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new PlatformError("Body required / 缺少请求体");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new PlatformError("Request too large / 请求过大", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PlatformError("Invalid JSON / JSON 格式错误");
  }
}
export const response = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export function failure(error: unknown) {
  if (error instanceof ZodError)
    return response(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        code: "VALIDATION_ERROR",
        issues: error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      400,
    );
  if (error instanceof PlatformError)
    return response({ error: error.message, code: error.code }, error.status);
  // Do not expose database connection strings, SQL or worker stack traces.
  return response(
    {
      error: "Operation failed / 操作失败，请检查服务器配置或重试",
      code: "INTERNAL_ERROR",
      requestId: randomUUID(),
    },
    500,
  );
}
