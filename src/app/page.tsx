import Link from "next/link";
import { getRequestSession } from "@/auth/request-session";
import { listVisibleJobs } from "@/storage/visible-jobs";
import { SCENARIOS } from "@/samples/scenarios";
import { SampleLauncher } from "@/components/sample-launcher";
import { jobStatusChip } from "@/domain/labels";
import { AppFrame } from "@/components/app-frame";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { session } = await getRequestSession();
  const jobs = await listVisibleJobs();
  const customer = session?.role === "customer";
  return (
    <AppFrame current="/">
      <main className="shell">
        <header className="topbar">
          <h1 className="page-title">Jobs</h1>
          {!customer && jobs.length > 0 && <Link className="btn" href="/jobs/new">New job</Link>}
        </header>
        {jobs.length === 0 ? (
          <div className="empty">
            <p>{customer ? "No jobs have been shared with you." : "No jobs yet."}</p>
            {!customer && <Link className="btn" href="/jobs/new">New job</Link>}
          </div>
        ) : (
          <div>
            {jobs.map((job) => {
              const version = job.estimates.find((item) => item.id === job.activeEstimateId) ?? job.estimates.at(-1);
              return (
                <Link key={job.id} href={`/jobs/${job.id}`} className="job-row">
                  <span>
                    <strong>{job.property.address}</strong>
                    <span className="meta">{job.customer.name}</span>
                  </span>
                  <span className="chip">{jobStatusChip(version?.status)}</span>
                </Link>
              );
            })}
          </div>
        )}
        {!customer && (
          <details className="quiet">
            <summary>Try a sample</summary>
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
      </main>
    </AppFrame>
  );
}
