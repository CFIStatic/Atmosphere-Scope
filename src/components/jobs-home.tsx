"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadWalkthrough } from "@/capture/snapshot";
import { Amount } from "@/components/amount";
import { buildReview } from "@/domain/assist";
import { formatDate } from "@/domain/format";
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

  const attention = jobs.filter((job) => job.unpriced > 0 || !job.status || job.status === "ai_draft" || job.status === "estimator_reviewed" || job.status === "estimator_approved");
  const recent = jobs.filter((job) => !attention.includes(job)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const empty = !walk && jobs.length === 0;

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
            <td data-label="Address">{job.address}</td>
            <td data-label="Type">{job.concern || "Claim"}</td>
            <td data-label="Status">{jobStatusChip(job.status)}</td>
            <td className="num" data-label="Total"><Amount value={job.unpriced > 0 ? null : job.total} /></td>
            <td data-label="Updated">{job.updatedAt ? formatDate(job.updatedAt) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
