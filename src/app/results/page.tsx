import { AppFrame } from "@/components/app-frame";
import { ContentsScreen } from "@/components/contents-screen";

export const dynamic = "force-dynamic";

export default function ResultsPage() {
  return (
    <AppFrame current="/results">
      <main className="shell">
        <header className="topbar">
          <h1 className="page-title">Results</h1>
        </header>
        <ContentsScreen />
      </main>
    </AppFrame>
  );
}
