"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadWalkthrough } from "@/capture/snapshot";
import { buildReview, jobCardSentence } from "@/domain/assist";
import { jobStatusChip } from "@/domain/labels";
import type { EstimateStatus } from "@/domain/types";

type JobCard = {
  id: string;
  address: string;
  customer: string;
  concern: string;
  updatedAt: string;
  status: EstimateStatus | null;
  unpriced: number;
};

export function JobsHome({ jobs, customer }: { jobs: JobCard[]; customer: boolean }) {
  const [walk, setWalk] = useState<string | null>(null);
  useEffect(() => {
    const snapshot = loadWalkthrough();
    setWalk(snapshot ? buildReview(snapshot).summary : null);
  }, []);

  const cards = jobs.map((job) => ({ ...job, ...jobCardSentence(job) }));
  const attention = cards.filter((job) => job.needsAttention);
  const recent = cards.filter((job) => !job.needsAttention).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const empty = !walk && jobs.length === 0;

  if (empty) {
    return (
      <div className="empty">
        <p>{customer ? "No jobs have been shared with you." : "No jobs yet."}</p>
        {!customer && <Link className="btn" href="/jobs/new">New job</Link>}
      </div>
    );
  }

  return (
    <div className="grid">
      {(walk || attention.length > 0) && (
        <section>
          <h2>Needs your attention</h2>
          {walk && (
            <Link href="/review" className="job-row">
              <span>
                <strong>Latest walk</strong>
                <span className="meta">{walk}</span>
              </span>
            </Link>
          )}
          {attention.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`} className="job-row">
              <span>
                <strong>{job.address}</strong>
                <span className="meta">{job.sentence}</span>
              </span>
              <span className="chip">{jobStatusChip(job.status)}</span>
            </Link>
          ))}
        </section>
      )}
      {recent.length > 0 && (
        <section>
          <h2>Recent</h2>
          {recent.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`} className="job-row">
              <span>
                <strong>{job.address}</strong>
                <span className="meta">{job.sentence}</span>
              </span>
              <span className="chip">{jobStatusChip(job.status)}</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
