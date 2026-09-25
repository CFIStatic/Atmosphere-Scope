import Link from "next/link";
import { providerStatus } from "@/analysis/provider-status";
import { MeasureApp } from "@/components/measure-app";
import { SiteNav } from "@/components/site-nav";

export const dynamic = "force-dynamic";

export default function MeasurePage() {
  const rows = providerStatus();
  const note = (stage: string) => rows.find((row) => row.stage === stage)?.note ?? "";
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="brand"><span>Atmosphere</span>Scope</p>
          <p className="meta">Supporting measurement. After a video is processed, the contents list opens. A dimension over the 5% bound is not confirmed.</p>
        </div>
        <Link className="btn secondary" href="/contents">Contents</Link>
      </header>
      <SiteNav current="/measure" />
      <MeasureApp setup={{ measurement: note("Room measurement"), vision: note("Object identification"), pricing: note("Replacement prices") }} />
    </main>
  );
}
