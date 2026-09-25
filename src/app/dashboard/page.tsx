import { AppFrame } from "@/components/app-frame";
import { toLibraryJob } from "@/components/library-job";
import { VideoLibrary } from "@/components/video-library";
import { getRequestSession } from "@/auth/request-session";
import { listVisibleJobs } from "@/storage/visible-jobs";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { session } = await getRequestSession();
  const jobs = await listVisibleJobs();
  return (
    <AppFrame variant="library" current="/dashboard">
      <VideoLibrary summary customer={session?.role === "customer"} jobs={jobs.map((job) => toLibraryJob(job, session?.role === "customer"))} />
    </AppFrame>
  );
}
