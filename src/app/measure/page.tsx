import Link from "next/link";
import { providerStatus } from "@/analysis/provider-status";
import { AppFrame } from "@/components/app-frame";
import { BrandLockup } from "@/components/brand-lockup";
import { MeasureApp } from "@/components/measure-app";

export const dynamic = "force-dynamic";

export default function MeasurePage() {
  const rows = providerStatus();
  const note = (stage: string) => rows.find((row) => row.stage === stage)?.note ?? "";
  return (
    <AppFrame current="/measure">
    <main className="shell">
      <header className="topbar">
        <div>
          <BrandLockup />
          <h1 className="page-title">Measure</h1>
          <p className="meta">Supporting measurement. After a video is processed, the contents list opens. A dimension over the 5% bound is not confirmed.</p>
        </div>
        <Link className="btn secondary" href="/contents">Contents</Link>
      </header>
      <MeasureApp setup={{ measurement: note("Room measurement"), vision: note("Object identification"), pricing: note("Replacement prices") }} />
    </main>
    </AppFrame>
  );
}
