import Link from "next/link";
import { AccountForm } from "@/components/account-form";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="brand"><span>Atmosphere Scope</span>Account</p>
          <p className="meta">Estimator approval and customer authorization are different sign-ins.</p>
        </div>
        <Link className="btn secondary" href="/">Home</Link>
      </header>
      <AccountForm />
    </main>
  );
}
