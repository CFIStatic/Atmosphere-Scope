import { AdminUsers } from "@/components/admin-users";
import { AppFrame } from "@/components/app-frame";
import { BrandLockup } from "@/components/brand-lockup";
import { authMode } from "@/auth/access";
import { getRequestSession } from "@/auth/request-session";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const { session } = await getRequestSession();
  const live = authMode() === "supabase" && session?.role === "admin";
  return (
    <AppFrame current="/account">
      <main className="shell">
        <header className="topbar">
          <div>
            <BrandLockup />
            <h1 className="page-title">Users</h1>
            <p className="meta">Invite an estimator or a customer. The role is written on the server into app metadata. People set their own password from the invite link.</p>
          </div>
        </header>
        <section className="panel">
          <AdminUsers live={live} />
        </section>
      </main>
    </AppFrame>
  );
}
