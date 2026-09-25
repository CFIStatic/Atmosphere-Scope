import Link from "next/link";
import { AccountForm } from "@/components/account-form";
import { AppFrame } from "@/components/app-frame";
import { BrandLockup } from "@/components/brand-lockup";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <AppFrame current="/account">
    <main className="shell">
      <header className="topbar">
        <div>
          <BrandLockup />
          <h1 className="page-title">Account</h1>
          <p className="meta">Estimator approval and customer authorization are different sign-ins.</p>
        </div>
        <Link className="btn secondary" href="/">Home</Link>
      </header>
      <AccountForm />
    </main>
    </AppFrame>
  );
}
