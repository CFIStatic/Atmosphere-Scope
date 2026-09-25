import Link from "next/link";
import { readFile } from "fs/promises";
import path from "path";
import { ClaimsFlow } from "@/components/claims-flow";

export const dynamic = "force-dynamic";

type ReportRow = {
  kind: string;
  truthFt: number;
  valueFt: number | null;
  actualPercent: number | null;
  errorPercent: number | null;
  meetsAccuracyTarget: boolean;
};

export default async function ClaimsPage() {
  const report = JSON.parse(await readFile(path.join(process.cwd(), "eval/report.json"), "utf8")) as {
    results: { case: string; method: string; rows: ReportRow[] }[];
  };
  const sample = report.results.find((item) => item.case === "synthetic-rect-charuco" && item.method === "charuco_multiview");
  const walls = (sample?.rows ?? []).filter((row) => row.kind === "wall_length");
  const height = (sample?.rows ?? []).find((row) => row.kind === "ceiling_height") ?? null;
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="brand"><span>Atmosphere Scope</span>[Customer name] · Water loss</p>
          <p className="meta">Floor 1 · measurement comes from the sheet solve, not from the mockup&apos;s placeholder quantities.</p>
        </div>
        <Link className="btn secondary" href="/">Home</Link>
      </header>
      <ClaimsFlow walls={walls} height={height} />
    </main>
  );
}
