import "server-only";
import { PrismaClient } from "@prisma/client";
import { PlatformError } from "./errors";

const globalDb = globalThis as typeof globalThis & {
  groundworkDb?: PrismaClient;
};
export function database() {
  if (!process.env.DATABASE_URL)
    throw new PlatformError(
      "Database not configured / 请配置专用 DATABASE_URL 并执行迁移",
      503,
      "DATABASE_NOT_CONFIGURED",
    );
  return (globalDb.groundworkDb ??= new PrismaClient());
}
