import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { getJob } from "@/storage/job-store";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  return <Workspace initialJob={job} />;
}
