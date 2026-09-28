import { notFound } from "next/navigation";
import { Resources } from "@/features/resources";
import { kindSchema } from "@/contracts/platform";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const kind = kindSchema.safeParse(section);
  if (!kind.success) notFound();
  return <Resources kind={kind.data} />;
}
