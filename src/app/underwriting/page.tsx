import Link from "next/link";
import { providerStatus } from "@/analysis/provider-status";
import { UnderwritingFlow } from "@/components/underwriting-flow";

export const dynamic = "force-dynamic";

export default function UnderwritingPage() {
  const shopping = providerStatus().find((row) => row.env === "SERPAPI_API_KEY");
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="brand"><span>Atmosphere Scope</span>Underwriting</p>
          <p className="meta">2-story example · figures on the valuation tab are illustrative. The underwriter decides.</p>
        </div>
        <Link className="btn secondary" href="/">Home</Link>
      </header>
      <UnderwritingFlow shoppingReady={Boolean(shopping?.ready)} />
    </main>
  );
}
