import { AppFrame } from "@/components/app-frame";
import { ReviewScreen } from "@/components/review-screen";

export const dynamic = "force-dynamic";

export default function ReviewPage() {
  return (
    <AppFrame current="/results">
      <main className="shell">
        <header className="topbar">
          <h1 className="page-title">Review</h1>
        </header>
        <ReviewScreen />
      </main>
    </AppFrame>
  );
}
