import Link from "next/link";
import { ContentsScreen } from "@/components/contents-screen";
import { SiteNav } from "@/components/site-nav";

export const dynamic = "force-dynamic";

export default function ContentsPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="brand"><span>Atmosphere</span>Scope</p>
          <p className="meta">Priced contents, with the sketch beside the list. Each line keeps its evidence. An unverified price stays unverified.</p>
        </div>
        <Link className="btn secondary" href="/">Home</Link>
      </header>
      <SiteNav current="/contents" />
      <ContentsScreen />
    </main>
  );
}
