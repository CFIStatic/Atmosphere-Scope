import Link from "next/link";
import { providerStatus } from "@/analysis/provider-status";
import { AppFrame } from "@/components/app-frame";
import { getRequestSession } from "@/auth/request-session";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const { session } = await getRequestSession();
  const admin = session?.role === "admin";
  return (
    <AppFrame current="/account">
      <main className="shell">
        <header className="topbar">
          <h1 className="page-title">System</h1>
        </header>
        {!admin && <p>An admin has to open this page.</p>}
        {admin && (
          <>
            <table className="stack">
              <thead><tr><th>Stage</th><th>Status</th></tr></thead>
              <tbody>
                {providerStatus().map((row) => (
                  <tr key={row.stage}>
                    <td data-label="Stage">{row.stage}</td>
                    <td data-label="Status">{row.ready ? "Ready" : "Missing"} · {row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="meta"><Link href="/accuracy">Accuracy harness</Link></p>
          </>
        )}
      </main>
    </AppFrame>
  );
}
