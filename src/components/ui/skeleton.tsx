"use client";
// Adapted from satnaing/shadcn-admin e16c87f, MIT; see licenses/shadcn-admin-MIT.txt.

import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  );
}

export { Skeleton };
