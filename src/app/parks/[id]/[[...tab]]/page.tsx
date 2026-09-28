import { notFound } from "next/navigation";
import { ParkPage, type ParkTab } from "@/features/parks";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
}) {
  const { id, tab } = await params;
  const key = tab?.[0] ?? "overview";
  if (
    (tab?.length ?? 0) > 1 ||
    ![
      "overview",
      "scene",
      "devices",
      "operations",
      "control",
      "analytics",
      "settings",
    ].includes(key)
  )
    notFound();
  return <ParkPage id={id} tab={key as ParkTab} />;
}
