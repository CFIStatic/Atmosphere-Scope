import { Suspense } from "react";
import { AppFrame } from "@/components/app-frame";
import { SettingsDesk } from "@/components/settings-desk";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const notice = params.error === "admin"
    ? "An admin has to open that page."
    : params.error === "role"
      ? "This account has no role yet. Ask an admin."
      : null;
  return (
    <AppFrame current="/settings">
      <main className="shell">
        <Suspense fallback={<p className="meta">Loading settings…</p>}>
          <SettingsDesk notice={notice} />
        </Suspense>
      </main>
    </AppFrame>
  );
}
