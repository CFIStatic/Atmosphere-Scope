import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLockup } from "@/components/brand-lockup";
import { SiteNav } from "@/components/site-nav";

export function AppFrame({ current, children }: { current?: string; children: ReactNode }) {
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="/" className="sidebar-logo" aria-label="Atmosphere Scope">
          <BrandLockup />
        </Link>
        <SiteNav current={current} />
      </aside>
      <div className="app-main">
        <div className="mobile-brand">
          <Link href="/" aria-label="Atmosphere Scope">
            <BrandLockup />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
