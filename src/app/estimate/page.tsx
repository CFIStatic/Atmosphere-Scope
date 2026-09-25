import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { ClaimsFlow } from "@/components/claims-flow";
import { UnderwritingFlow } from "@/components/underwriting-flow";

export const dynamic = "force-dynamic";

export default async function EstimatePage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const params = await searchParams;
  const underwriting = params.report === "underwriting";
  return (
    <AppFrame current="/estimate">
      <main className="shell">
        <header className="topbar">
          <h1 className="page-title">Estimate</h1>
        </header>
        <div className="report-type" role="tablist" aria-label="Report type">
          <Link href="/estimate" aria-current={underwriting ? undefined : "page"}>Claim</Link>
          <Link href="/estimate?report=underwriting" aria-current={underwriting ? "page" : undefined}>Underwriting</Link>
        </div>
        {underwriting ? <UnderwritingFlow /> : <ClaimsFlow />}
      </main>
    </AppFrame>
  );
}
