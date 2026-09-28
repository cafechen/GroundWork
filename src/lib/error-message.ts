import { ZodError } from "zod";
export function errorMessage(error: unknown): string {
  if (error instanceof ZodError)
    return (
      "Invalid input / 输入无效：" +
      error.issues
        .map((i) => `${i.path.join(".") || "task"}: ${i.message}`)
        .join("; ")
    );
  return error instanceof Error ? error.message : "Operation failed / 操作失败";
}
