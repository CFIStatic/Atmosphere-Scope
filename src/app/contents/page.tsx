import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { BrandLockup } from "@/components/brand-lockup";
import { ContentsScreen } from "@/components/contents-screen";

export const dynamic = "force-dynamic";

export default function ContentsPage() {
  return (
    <AppFrame current="/contents">
    <main className="shell">
      <header className="topbar">
        <div>
          <BrandLockup />
          <h1 className="page-title">Contents</h1>
          <p className="meta">Priced contents, with the sketch beside the list. Each line keeps its evidence. An unverified price stays unverified.</p>
        </div>
        <Link className="btn secondary" href="/">Home</Link>
      </header>
      <ContentsScreen />
    </main>
    </AppFrame>
  );
}
