import type { ReactNode } from "react";
import Link from "next/link";
import { AccountChip } from "@/components/account-chip";
import { BrandLockup } from "@/components/brand-lockup";
import { SiteNav } from "@/components/site-nav";

export function AppFrame({ current, children }: { current?: string; children: ReactNode }) {
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="/" aria-label="Atmosphere Scope">
          <BrandLockup />
        </Link>
        <SiteNav current={current} />
      </aside>
      <div className="app-main">
        <AccountChip />
        {children}
      </div>
    </div>
  );
}
