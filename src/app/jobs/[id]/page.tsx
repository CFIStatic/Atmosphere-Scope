import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { getRequestSession } from "@/auth/request-session";
import { loadVisibleJob } from "@/storage/visible-jobs";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadVisibleJob(id);
  if ("error" in loaded) notFound();
  const { session } = await getRequestSession();
  const canShare = session?.role === "admin" || session?.role === "estimator";
  return <Workspace initialJob={loaded.job} canShare={canShare} />;
}
