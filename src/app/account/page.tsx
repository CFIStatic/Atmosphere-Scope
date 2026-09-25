import { AccountForm } from "@/components/account-form";
import { AppFrame } from "@/components/app-frame";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const notice = params.error === "admin"
    ? "An admin has to open that page."
    : params.error === "role"
      ? "This account has no role yet. Ask an admin."
      : null;
  return (
    <AppFrame current="/account">
    <main className="shell">
      <header className="topbar">
        <h1 className="page-title">Account</h1>
      </header>
      <AccountForm notice={notice} />
    </main>
    </AppFrame>
  );
}
