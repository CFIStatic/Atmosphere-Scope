import Link from "next/link";
import { listJobs } from "@/storage/job-store";
import { SCENARIOS } from "@/samples/scenarios";
import { SampleLauncher } from "@/components/sample-launcher";
import { bannerFor } from "@/domain/review";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const jobs = await listJobs();
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="brand"><span>Atmosphere</span>Scope</p>
          <p className="meta">Residential interior walkthroughs, evidence, sketch, and draft estimate. AI output stays a draft until an estimator approves it.</p>
        </div>
        <Link className="btn" href="/jobs/new">New job</Link>
      </header>
      <section className="panel" style={{ marginBottom: 16 }}>
        <p className="kicker">Sample walkthroughs</p>
        <div className="cards">
          {SCENARIOS.map((scenario) => (
            <article key={scenario.id} className="card" style={{ boxShadow: "none" }}>
              <strong>{scenario.title}</strong>
              <span className="meta">{scenario.summary}</span>
              <SampleLauncher scenarioId={scenario.id} />
            </article>
          ))}
        </div>
      </section>
      <section>
        <p className="kicker">Jobs</p>
        <div className="cards">
          {jobs.length === 0 && <p className="meta">No jobs yet. Open a sample or create one.</p>}
          {jobs.map((job) => {
            const version = job.estimates.find((item) => item.id === job.activeEstimateId) ?? job.estimates.at(-1);
            return (
              <Link key={job.id} href={`/jobs/${job.id}`} className="card">
                <strong>{job.property.address}</strong>
                <span className="meta">{job.customer.name} · {job.property.city}</span>
                <span className="badge">{bannerFor(version ?? null)}</span>
                <span className="meta">{job.rooms.length} rooms · sketch {job.sketch.state.replaceAll("_", " ")} · {job.processing.status}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
