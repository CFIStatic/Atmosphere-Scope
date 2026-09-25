import { AppFrame } from "@/components/app-frame";
import { toLibraryJob } from "@/components/library-job";
import { SampleLauncher } from "@/components/sample-launcher";
import { VideoLibrary } from "@/components/video-library";
import { getRequestSession } from "@/auth/request-session";
import { SCENARIOS } from "@/samples/scenarios";
import { listVisibleJobs } from "@/storage/visible-jobs";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const { session } = await getRequestSession();
  const jobs = await listVisibleJobs();
  const customer = session?.role === "customer";
  return (
    <AppFrame variant="library" current="/jobs">
      <VideoLibrary customer={customer} jobs={jobs.map((job) => toLibraryJob(job, customer))} />
      {!customer && (
        <details className="quiet lib-samples">
          <summary>Samples</summary>
          <div className="list">
            {SCENARIOS.map((scenario) => (
              <div key={scenario.id} className="job-row">
                <strong>{scenario.title}</strong>
                <SampleLauncher scenarioId={scenario.id} />
              </div>
            ))}
          </div>
        </details>
      )}
    </AppFrame>
  );
}
