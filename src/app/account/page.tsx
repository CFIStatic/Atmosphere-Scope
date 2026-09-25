import Link from "next/link";
import { AccountForm } from "@/components/account-form";
import { AppFrame } from "@/components/app-frame";
import { BrandLockup } from "@/components/brand-lockup";

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
        <div>
          <BrandLockup />
          <h1 className="page-title">Account</h1>
          <p className="meta">Change your password here. Estimator approval and customer authorization stay separate.</p>
        </div>
        <Link className="btn secondary" href="/">Home</Link>
      </header>
      <AccountForm notice={notice} />
    </main>
    </AppFrame>
  );
}
