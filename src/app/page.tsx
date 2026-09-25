import Link from "next/link";
import { getRequestSession } from "@/auth/request-session";
import { listVisibleJobs } from "@/storage/visible-jobs";
import { SCENARIOS } from "@/samples/scenarios";
import { SampleLauncher } from "@/components/sample-launcher";
import { bannerFor } from "@/domain/review";
import { providerStatus } from "@/analysis/provider-status";
import { AppFrame } from "@/components/app-frame";
import { BrandLockup } from "@/components/brand-lockup";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { session } = await getRequestSession();
  const jobs = await listVisibleJobs();
  const customer = session?.role === "customer";
  return (
    <AppFrame current="/">
    <main className="shell">
      <header className="topbar">
        <div>
          <BrandLockup />
          <p className="meta">Atmosphere Scope writes its own estimate from the walkthrough. Contents stay evidence-linked. The sketch supplies quantities. Labor and equipment rates are entered here.</p>
        </div>
        <div className="row">
          <div className="row">
            <Link className="btn" href="/contents">Contents</Link>
            {!customer && <Link className="btn secondary" href="/jobs/new">New job</Link>}
          </div>
        </div>
      </header>
      {!customer && <nav className="cards" style={{ marginBottom: 16 }}>
        <Link className="card" href="/contents"><strong>Contents</strong><span className="meta">Sketch beside the priced list. Evidence and unverified prices stay visible.</span></Link>
        <Link className="card" href="/measure"><strong>Measure</strong><span className="meta">Supporting capture. The sheet sets scale. It is not the landing screen.</span></Link>
        <Link className="card" href="/claims"><strong>Claims review</strong><span className="meta">Draft scope and estimate from the catalog and rate book.</span></Link>
        <Link className="card" href="/underwriting"><strong>Underwriting</strong><span className="meta">Checklist through the same contents list.</span></Link>
        <Link className="card" href="/accuracy"><strong>Accuracy harness</strong><span className="meta">Synthetic results by method. 95% is not claimed.</span></Link>
      </nav>}
      {!customer && <section className="panel" style={{ marginBottom: 16 }}>
        <p className="kicker">Keys</p>
        <p className="meta">The walkthrough needs only OPENAI_API_KEY. Measurement and local storage run without it. SerpAPI, a GPU host, and Supabase stay optional.</p>
        <table className="stack">
          <thead><tr><th>Stage</th><th>Env</th><th>Provider</th><th>Cost</th><th>Status</th></tr></thead>
          <tbody>
            {providerStatus().map((row) => (
              <tr key={row.stage}>
                <td data-label="Stage">{row.stage}</td>
                <td data-label="Env">{row.env ?? "—"}</td>
                <td data-label="Provider">{row.provider}</td>
                <td data-label="Cost">{row.cost}</td>
                <td data-label="Status">{row.ready ? "ready" : "missing"} · {row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>}
      {!customer && <section className="panel" style={{ marginBottom: 16 }}>
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
      </section>}
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
    </AppFrame>
  );
}
