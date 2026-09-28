"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div role="alert">
      页面载入失败 / Unable to load page{" "}
      <Button onClick={reset}>重试 / Retry</Button>
    </div>
  );
}
