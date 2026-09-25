import { getRequestSession } from "@/auth/request-session";
import { DashboardHome } from "@/components/dashboard-home";
import { AppFrame } from "@/components/app-frame";
import { listVisibleJobs } from "@/storage/visible-jobs";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { session } = await getRequestSession();
  const jobs = await listVisibleJobs();
  const customer = session?.role === "customer";
  return (
    <AppFrame current="/dashboard">
      <main className="shell">
        <header className="topbar">
          <div>
            <p className="kicker">Operate</p>
            <h1 className="page-title">Dashboard</h1>
          </div>
        </header>
        <DashboardHome
          customer={customer}
          jobs={jobs.map((job) => {
            const version = job.estimates.find((item) => item.id === job.activeEstimateId) ?? job.estimates.at(-1);
            return {
              id: job.id,
              address: job.property.address,
              customer: job.customer.name,
              concern: job.concern,
              updatedAt: job.updatedAt,
              status: version?.status ?? null,
              unpriced: version?.pricedLines.filter((line) => line.unpricedReason !== "Excluded from price." && (line.unitPrice == null || line.unpricedReason)).length ?? 0,
              total: version?.totals.supportedTotal ?? null,
            };
          })}
        />
      </main>
    </AppFrame>
  );
}
