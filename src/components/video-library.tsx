"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { LibraryJob } from "@/components/library-job";
import { useLibraryQuery } from "@/components/library-query";

const STATUS = {
  recorded: { text: "Recorded", cls: "chip-green" },
  waiting: { text: "Waiting", cls: "chip-yellow" },
  recording: { text: "Recording", cls: "chip-yellow" },
} as const;

type SortKey = "job" | "status" | "recorded" | "uploader";

export function VideoLibrary({ jobs, customer }: { jobs: LibraryJob[]; customer: boolean }) {
  const query = useLibraryQuery();
  const [sortKey, setSortKey] = useState<SortKey>("recorded");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? jobs.filter((job) => [job.name, job.address, job.id, job.recordedAt, ...job.clips.map((clip) => clip.label)].join(" ").toLowerCase().includes(q))
      : jobs;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "job") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "status") return a.status.localeCompare(b.status) * dir;
      if (sortKey === "uploader") return a.name.localeCompare(b.name) * dir;
      return a.recordedAt.localeCompare(b.recordedAt) * dir;
    });
  }, [jobs, query, sortDir, sortKey]);

  const totalClips = jobs.reduce((sum, job) => sum + job.clips.length, 0);
  const shownClips = filtered.reduce((sum, job) => sum + job.clips.length, 0);
  const count = totalClips === 0 ? "0 clips" : `${shownClips} of ${totalClips} clips`;
  const empty = filtered.length === 0;

  function sort(key: SortKey) {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "recorded" ? "desc" : "asc");
    }
  }

  return (
    <div className="lib-screen">
      <div className="lib-toolbar">
        <h1>All videos</h1>
        <span className="lib-count">{count}</span>
      </div>
      <div className="lib-tablewrap">
        <table className="lib-table">
          <thead>
            <tr>
              <th>Preview</th>
              <SortHead label="Job name" column="job" sortKey={sortKey} sortDir={sortDir} onSort={sort} />
              <SortHead label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={sort} />
              <SortHead label="Recorded" column="recorded" sortKey={sortKey} sortDir={sortDir} onSort={sort} />
              <SortHead label="Uploaded by" column="uploader" sortKey={sortKey} sortDir={sortDir} onSort={sort} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((job) => (
              <JobRows key={job.id} job={job} collapsed={collapsed[job.id] ?? false} onToggle={() => setCollapsed((current) => ({ ...current, [job.id]: !current[job.id] }))} />
            ))}
          </tbody>
        </table>
        {empty && (
          <div className="lib-empty">
            <p className="lib-empty-title">{query ? "No matches" : customer ? "No shared jobs." : "No jobs yet"}</p>
            <p className="lib-empty-body">
              {query
                ? "Try clearing search."
                : customer
                  ? "Jobs shared with you show up here."
                  : <><Link href="/record">Start a job</Link> and the name shows up here. Footage files under it as crews film.</>}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SortHead({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(column)}>
        {label} <span className="sortcaret" aria-hidden="true">{active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

function JobRows({ job, collapsed, onToggle }: { job: LibraryJob; collapsed: boolean; onToggle: () => void }) {
  const status = STATUS[job.status];
  const when = recordedParts(job.recordedAt);
  return (
    <>
      <tr className="jobrow">
        <td className="jobpreview">
          <button type="button" className="jobfile" aria-expanded={!collapsed} onClick={onToggle}>
            <Caret />
            <Folder />
          </button>
        </td>
        <td className="titlecell">
          <Link className="job-open" href={`/jobs/${job.id}`}>{job.name}</Link>
          {job.address && <div className="job-sub">{job.address}</div>}
          <div className="job-card-meta">
            <span className={`chip ${status.cls}`}><span className="dot" />{status.text}</span>
            <span>{when.day}</span>
          </div>
        </td>
        <td className="desk"><span className={`chip ${status.cls}`}><span className="dot" />{status.text}</span></td>
        <td className="desk job-when"><time>{when.day}</time>{when.time && <small>{when.time}</small>}</td>
        <td className="desk">—</td>
      </tr>
      {!collapsed && job.clips.map((clip) => {
        const clipWhen = recordedParts(clip.createdAt);
        return (
          <tr key={clip.id} className="cliprow">
            <td>
              <Link className="thumb" href={`/jobs/${job.id}#videos`} aria-label={clip.label}>
                {clip.durationMs ? <span className="dur">{clock(clip.durationMs)}</span> : null}
              </Link>
            </td>
            <td className="titlecell">
              <Link className="job-open" href={`/jobs/${job.id}#videos`}>{clip.label}</Link>
              <div className="job-sub">{clipWhen.day}</div>
            </td>
            <td className="desk"><span className="chip chip-green"><span className="dot" />Recorded</span></td>
            <td className="desk job-when"><time>{clipWhen.day}</time>{clipWhen.time && <small>{clipWhen.time}</small>}</td>
            <td className="desk">—</td>
          </tr>
        );
      })}
    </>
  );
}

function recordedParts(iso: string): { day: string; time: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: "—", time: "" };
  return {
    day: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date),
  };
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function Caret() {
  return (
    <svg className="caret2" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Folder() {
  return (
    <svg className="folder" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
