import Link from "next/link";
import { providerStatus } from "@/analysis/provider-status";
import { MeasureApp } from "@/components/measure-app";

export const dynamic = "force-dynamic";

export default function MeasurePage() {
  const rows = providerStatus();
  const note = (stage: string) => rows.find((row) => row.stage === stage)?.note ?? "";
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="brand"><span>Atmosphere</span>Scope</p>
          <p className="meta">Guided capture. The sheet sets scale. A dimension over the 5% bound is not confirmed.</p>
        </div>
        <Link className="btn secondary" href="/">Home</Link>
      </header>
      <MeasureApp setup={{ measurement: note("Room measurement"), vision: note("Object identification"), pricing: note("Replacement prices") }} />
    </main>
  );
}
