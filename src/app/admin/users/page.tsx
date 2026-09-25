import { AdminUsers } from "@/components/admin-users";
import { AppFrame } from "@/components/app-frame";
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
          <h1 className="page-title">Users</h1>
        </header>
        <section className="panel">
          <AdminUsers live={live} />
        </section>
      </main>
    </AppFrame>
  );
}
