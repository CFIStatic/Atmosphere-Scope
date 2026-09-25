import Link from "next/link";
import { MeasureApp } from "@/components/measure-app";

export const dynamic = "force-dynamic";

export default function MeasurePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="brand"><span>Atmosphere</span>Scope</p>
          <p className="meta">Guided capture. The sheet sets scale. A dimension over the 5% bound is not confirmed.</p>
        </div>
        <Link className="btn secondary" href="/">Home</Link>
      </header>
      <MeasureApp />
    </main>
  );
}
