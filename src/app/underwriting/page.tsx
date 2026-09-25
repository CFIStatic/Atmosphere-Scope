import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { BrandLockup } from "@/components/brand-lockup";
import { UnderwritingFlow } from "@/components/underwriting-flow";

export const dynamic = "force-dynamic";

export default function UnderwritingPage() {
  return (
    <AppFrame current="/underwriting">
    <main className="shell">
      <header className="topbar">
        <div>
          <BrandLockup />
          <h1 className="page-title">Underwriting</h1>
          <p className="meta">Checklist, gaps, and contents come from the saved walkthrough. Dwelling value was not measured.</p>
        </div>
        <Link className="btn secondary" href="/contents">Contents</Link>
      </header>
      <UnderwritingFlow />
    </main>
    </AppFrame>
  );
}
