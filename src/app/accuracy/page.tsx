import Link from "next/link";
import { readFile } from "fs/promises";
import path from "path";
import { AppFrame } from "@/components/app-frame";
import { BrandLockup } from "@/components/brand-lockup";

export const dynamic = "force-dynamic";

type Row = {
  kind: string;
  truthFt: number;
  valueFt: number | null;
  actualPercent: number | null;
  errorPercent: number | null;
  meetsAccuracyTarget: boolean;
  safe: boolean;
};

export default async function AccuracyPage() {
  const report = JSON.parse(await readFile(path.join(process.cwd(), "eval/report.json"), "utf8")) as {
    claim: string;
    safe: boolean;
    methodsNotRun: string[];
    results: { case: string; method: string; kind: string; rows: Row[] }[];
  };
  return (
    <AppFrame>
    <main className="shell">
      <header className="topbar">
        <div>
          <BrandLockup />
          <h1 className="page-title">Accuracy harness</h1>
          <p className="meta">{report.safe ? "No claimed pass exceeded the truth by more than 5%, and every claimed pass sat inside its error bar." : "The harness found an unsafe claim."}</p>
        </div>
        <Link className="btn secondary" href="/">Home</Link>
      </header>
      <p className="banner">{report.claim}</p>
      <section className="panel">
        <table>
          <thead>
            <tr><th>Case</th><th>Method</th><th>Kind</th><th>Truth</th><th>Solved</th><th>Actual</th><th>Bound</th><th>Meets ±5%</th></tr>
          </thead>
          <tbody>
            {report.results.flatMap((item) =>
              item.rows.map((row) => (
                <tr key={`${item.case}-${item.method}-${row.kind}-${row.truthFt}`}>
                  <td>{item.case}</td>
                  <td>{item.method}</td>
                  <td>{row.kind.replaceAll("_", " ")}</td>
                  <td>{row.truthFt}</td>
                  <td>{row.valueFt ?? "?"}</td>
                  <td>{row.actualPercent == null ? "?" : `${row.actualPercent}%`}</td>
                  <td>{row.errorPercent == null ? "?" : `±${row.errorPercent}%`}</td>
                  <td>{row.meetsAccuracyTarget ? "yes" : "no"}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <p className="kicker">Not run</p>
        {report.methodsNotRun.map((note) => <p key={note}>{note}</p>)}
      </section>
    </main>
    </AppFrame>
  );
}
