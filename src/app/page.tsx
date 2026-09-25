import Link from "next/link";
import { listJobs } from "@/storage/job-store";
import { SCENARIOS } from "@/samples/scenarios";
import { SampleLauncher } from "@/components/sample-launcher";
import { bannerFor } from "@/domain/review";
import { providerStatus } from "@/analysis/provider-status";

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
        <div className="row">
          <Link className="btn secondary" href="/account">Account</Link>
          <Link className="btn" href="/jobs/new">New job</Link>
        </div>
      </header>
      <nav className="cards" style={{ marginBottom: 16 }}>
        <Link className="card" href="/measure"><strong>Measure a room</strong><span className="meta">Calibration sheet, guided capture, error bounds.</span></Link>
        <Link className="card" href="/claims"><strong>Claims review</strong><span className="meta">Gaps, sketch spans, and what is not confirmed.</span></Link>
        <Link className="card" href="/underwriting"><strong>Underwriting</strong><span className="meta">Checklist through contents, from the saved walkthrough.</span></Link>
        <Link className="card" href="/accuracy"><strong>Accuracy harness</strong><span className="meta">Synthetic results by method. 95% is not claimed.</span></Link>
      </nav>
      <section className="panel" style={{ marginBottom: 16 }}>
        <p className="kicker">Keys</p>
        <p className="meta">The walkthrough needs only OPENAI_API_KEY. Measurement and local storage run without it. SerpAPI, a GPU host, and Supabase stay optional.</p>
        <table>
          <thead><tr><th>Stage</th><th>Env</th><th>Provider</th><th>Cost</th><th>Status</th></tr></thead>
          <tbody>
            {providerStatus().map((row) => (
              <tr key={row.stage}>
                <td>{row.stage}</td>
                <td>{row.env ?? "—"}</td>
                <td>{row.provider}</td>
                <td>{row.cost}</td>
                <td>{row.ready ? "ready" : "missing"} · {row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
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
