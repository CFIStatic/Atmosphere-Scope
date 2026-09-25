"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadWalkthrough } from "@/capture/snapshot";
import { buildReview, jobCardSentence } from "@/domain/assist";
import { formatDate, formatMoney } from "@/domain/format";
import { jobStatusChip } from "@/domain/labels";
import type { EstimateStatus } from "@/domain/types";

export type JobRow = {
  id: string;
  address: string;
  customer: string;
  concern: string;
  updatedAt: string;
  status: EstimateStatus | null;
  unpriced: number;
  total: number | null;
};

export function JobsHome({ jobs, customer }: { jobs: JobRow[]; customer: boolean }) {
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
      address: review.summary.split(",")[0] || "—",
      customer: "Walk",
      concern: "Walk",
      updatedAt: "",
      status: "ai_draft",
      unpriced: missing ? 1 : 0,
      total: missing ? null : total,
    });
  }, []);

  const ranked = jobs.map((job) => ({ ...job, needsAttention: jobCardSentence({ customer: job.customer, concern: job.concern, status: job.status, unpriced: job.unpriced, viewerIsCustomer: customer }).needsAttention }));
  const attention = ranked.filter((job) => job.needsAttention);
  const recent = ranked.filter((job) => !job.needsAttention).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const empty = !walk && jobs.length === 0;
  const book = walk ? [walk, ...ranked] : ranked;
  const priced = book.reduce((sum, job) => sum + (job.total != null && job.total > 0 ? job.total : 0), 0);
  const unpriced = book.reduce((sum, job) => sum + job.unpriced, 0);

  if (empty) {
    return (
      <div className="empty">
        <p>{customer ? "No shared jobs." : "No jobs."}</p>
        {!customer && <Link className="btn" href="/jobs/new">New job</Link>}
      </div>
    );
  }

  return (
    <div className="grid">
      <div className="kpi" aria-label="Book summary">
        <div><span>Jobs</span><strong>{book.length}</strong></div>
        <div><span>Needs attention</span><strong>{attention.length + (walk ? 1 : 0)}</strong></div>
        <div><span>Recent</span><strong>{recent.length}</strong></div>
        <div><span>Priced</span><strong>{priced > 0 ? formatMoney(priced) : "—"}</strong></div>
        <div><span>Unpriced</span><strong>{unpriced}</strong></div>
      </div>
      {(walk || attention.length > 0) && (
        <section>
          <h2>Needs attention</h2>
          <JobTable rows={walk ? [walk, ...attention] : attention} />
        </section>
      )}
      {recent.length > 0 && (
        <section>
          <h2>Recent</h2>
          <JobTable rows={recent} />
        </section>
      )}
    </div>
  );
}

function JobTable({ rows }: { rows: JobRow[] }) {
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Job</th>
          <th>Address</th>
          <th>Type</th>
          <th>Status</th>
          <th className="num">Total</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((job) => (
          <tr key={job.id}>
            <td data-label="Job"><Link href={job.id === "walk" ? "/review" : `/jobs/${job.id}`}>{job.customer}</Link></td>
            <td data-label="Address">{job.address || "—"}</td>
            <td data-label="Type">{job.concern || "Claim"}</td>
            <td data-label="Status">{jobStatusChip(job.status)}</td>
            <td className="num" data-label="Total">
              <span className="num">{job.total != null && (job.total > 0 || job.unpriced === 0) ? formatMoney(job.total) : "—"}</span>
              {job.unpriced > 0 && <> <span className="tag">Needs price</span></>}
            </td>
            <td data-label="Updated">{job.updatedAt ? formatDate(job.updatedAt) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
