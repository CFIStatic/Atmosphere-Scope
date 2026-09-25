import { AppFrame } from "@/components/app-frame";
import { MeasureApp } from "@/components/measure-app";

export const dynamic = "force-dynamic";

export default function WalkPage() {
  return (
    <AppFrame current="/walk">
      <main className="shell">
        <header className="topbar">
          <h1 className="page-title">Walk</h1>
        </header>
        <MeasureApp />
      </main>
    </AppFrame>
  );
}
