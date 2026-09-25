import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { ReviewScreen } from "@/components/review-screen";

export const dynamic = "force-dynamic";

export default function ReviewPage() {
  return (
    <div className="field-flow">
      <AppFrame current="/results">
        <main className="shell review-shell">
          <header className="topbar">
            <h1 className="page-title">Review</h1>
            <Link className="meta" href="/jobs">Jobs</Link>
          </header>
          <ReviewScreen />
        </main>
      </AppFrame>
    </div>
  );
}
