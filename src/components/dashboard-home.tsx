"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadWalkthrough } from "@/capture/snapshot";
import { buildReview, jobCardSentence } from "@/domain/assist";
import { formatDate, formatMoney } from "@/domain/format";
import { jobStatusChip } from "@/domain/labels";
import type { JobRow } from "@/components/jobs-home";

export function DashboardHome({ jobs, customer }: { jobs: JobRow[]; customer: boolean }) {
  const [query, setQuery] = useState("");
  const [walk, setWalk] = useState<JobRow | null>(null);

  useEffect(() => {
    const snapshot = loadWalkthrough();
    if (!snapshot) return;
    const review = buildReview(snapshot);
    const missing = review.items.some((item) => item.price == null);
    const total = !missing && review.items.length
      ? review.items.reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0)
      : null;
    setWalk({
      id: "walk",
      address: snapshot.suggestedAddress || review.summary.split(",")[0] || "",
      customer: snapshot.suggestedName || "Walkthrough",
      concern: "Walkthrough",
      updatedAt: "",
      status: "ai_draft",
      unpriced: missing ? review.items.filter((item) => item.price == null).length : 0,
      total: missing ? null : total,
    });
  }, []);

  const ranked = useMemo(() => {
    const rows = walk ? [walk, ...jobs] : jobs;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((job) => [job.customer, job.address, job.concern, job.id, job.status ?? ""].join(" ").toLowerCase().includes(q));
  }, [jobs, walk, query]);

  const attention = ranked.filter((job) => needsAttention(job, customer));
  const recent = ranked.filter((job) => !needsAttention(job, customer)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const priced = ranked.reduce((sum, job) => sum + (job.total != null && job.total > 0 ? job.total : 0), 0);
  const unpriced = ranked.reduce((sum, job) => sum + job.unpriced, 0);
  const empty = ranked.length === 0;

  return (
    <div className="grid">
      <label className="atm-filter">
        <span className="sr-only">Filter the dashboard</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by job, company, date, address, or ID"
          aria-label="Filter the dashboard"
        />
      </label>
      <div className="kpi" aria-label="Dashboard summary">
        <div><span>Jobs</span><strong>{ranked.length}</strong></div>
        <div><span>Needs attention</span><strong>{attention.length}</strong></div>
        <div><span>Recent</span><strong>{recent.length}</strong></div>
        <div><span>Priced</span><strong>{priced > 0 ? formatMoney(priced) : "—"}</strong></div>
        <div><span>Unpriced</span><strong>{unpriced}</strong></div>
      </div>
      {empty ? (
        <div className="empty">
          <p>{query ? "Nothing matches that search." : customer ? "No shared jobs." : "No jobs yet."}</p>
          {!customer && !query && <Link className="btn" href="/record">Record a walkthrough</Link>}
        </div>
      ) : (
        <>
          <section>
            <h2>Needs attention</h2>
            {attention.length === 0 ? <p className="meta">Nothing needs attention.</p> : <DashList rows={attention} />}
          </section>
          <section>
            <h2>Recent walkthroughs</h2>
            {recent.length === 0 ? <p className="meta">No walkthroughs yet.</p> : <DashList rows={recent} />}
          </section>
        </>
      )}
    </div>
  );
}

function needsAttention(job: JobRow, customer: boolean): boolean {
  if (job.id === "walk") return true;
  return jobCardSentence({ customer: job.customer, concern: job.concern, status: job.status, unpriced: job.unpriced, viewerIsCustomer: customer }).needsAttention;
}

function DashList({ rows }: { rows: JobRow[] }) {
  return (
    <ul className="atm-list">
      {rows.map((job) => (
        <li key={job.id}>
          <Link href={job.id === "walk" ? "/review" : `/jobs/${job.id}`}>
            <span>
              <strong>{job.customer || "Untitled"}</strong>
              <span className="meta">{job.address || "—"}{job.concern ? ` · ${job.concern}` : ""}</span>
            </span>
            <span className="atm-list-end">
              <span className="badge">{jobStatusChip(job.status)}</span>
              <span className="num">{job.total != null && (job.total > 0 || job.unpriced === 0) ? formatMoney(job.total) : "—"}</span>
              {job.unpriced > 0 && <span className="tag">Needs price</span>}
              <span className="meta">{job.updatedAt ? formatDate(job.updatedAt) : "—"}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
