import type { Prisma } from "@prisma/client";
// Prisma's native JSON transport can round IEEE-754 values. Store a versioned
// text envelope INSIDE JSON columns so immutable geometry survives both engines.
// JSON 通道可能舍入浮点数；JSON 列内用版本化文本封装保留几何精度。
export function encodeJson(value: unknown): Prisma.InputJsonValue {
  return { encoding: "groundwork-json-v1", payload: JSON.stringify(value) };
}
export function decodeJson(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "encoding" in value &&
    "payload" in value &&
    value.encoding === "groundwork-json-v1" &&
    typeof value.payload === "string"
  )
    return JSON.parse(value.payload);
  // Read compatibility for imported native JSON and the first test migration.
  return value;
}
