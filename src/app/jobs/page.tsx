import Link from "next/link";
import { getRequestSession } from "@/auth/request-session";
import { listVisibleJobs } from "@/storage/visible-jobs";
import { SCENARIOS } from "@/samples/scenarios";
import { SampleLauncher } from "@/components/sample-launcher";
import { JobsHome } from "@/components/jobs-home";
import { AppFrame } from "@/components/app-frame";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const { session } = await getRequestSession();
  const jobs = await listVisibleJobs();
  const customer = session?.role === "customer";
  return (
    <AppFrame current="/jobs">
      <main className="shell">
        <header className="topbar">
          <h1 className="page-title">Jobs</h1>
          {!customer && jobs.length > 0 && <Link className="btn secondary" href="/jobs/new">New job</Link>}
        </header>
        <JobsHome
          customer={customer}
          jobs={jobs.map((job) => {
            const version = job.estimates.find((item) => item.id === job.activeEstimateId) ?? job.estimates.at(-1);
            return {
              id: job.id,
              address: job.property.address,
              customer: job.customer.name,
              concern: jobType(job.concern),
              updatedAt: job.updatedAt,
              status: version?.status ?? null,
              unpriced: version?.pricedLines.filter((line) => line.unpricedReason !== "Excluded from price." && (line.unitPrice == null || line.unpricedReason)).length ?? 0,
              total: version?.totals.supportedTotal ?? null,
            };
          })}
        />
        {!customer && (
          <details className="quiet">
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
      </main>
    </AppFrame>
  );
}

function jobType(concern: string): string {
  const text = concern.trim();
  if (!text) return "Claim";
  const hit = text.match(/\b(water|fire|theft|wind|contents)\b/i);
  if (hit) return `${hit[1][0].toUpperCase()}${hit[1].slice(1).toLowerCase()}`;
  return text.length > 22 ? "Claim" : text;
}
