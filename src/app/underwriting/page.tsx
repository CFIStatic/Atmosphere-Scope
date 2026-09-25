import Link from "next/link";
import { UnderwritingFlow } from "@/components/underwriting-flow";
import { SiteNav } from "@/components/site-nav";

export const dynamic = "force-dynamic";

export default function UnderwritingPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="brand"><span>Atmosphere Scope</span>Underwriting</p>
          <p className="meta">Checklist, gaps, and contents come from the saved walkthrough. Dwelling value was not measured.</p>
        </div>
        <Link className="btn secondary" href="/contents">Contents</Link>
      </header>
      <SiteNav current="/underwriting" />
      <UnderwritingFlow />
    </main>
  );
}
