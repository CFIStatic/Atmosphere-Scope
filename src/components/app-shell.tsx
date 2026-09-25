"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AccountMenu } from "@/components/account-menu";
import { BrandLockup } from "@/components/brand-lockup";
import { LibraryQueryContext } from "@/components/library-query";

export function AppShell({
  variant = "page",
  children,
}: {
  current?: string;
  variant?: "page" | "library";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const path = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <div className={variant === "library" ? "lib" : "ops"}>
      <aside className="rail" aria-label="Navigation">
        <div className="rail-head">
          <BrandLockup href="/dashboard" />
        </div>
        <Rail onNavigate={() => setOpen(false)} />
      </aside>
      {open && (
        <div className="rail-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="rail-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <aside className="rail rail-panel">
            <div className="rail-head">
              <BrandLockup href="/dashboard" />
            </div>
            <Rail onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <header className={variant === "library" ? "lib-top" : "ops-top"}>
        <button type="button" className="rail-menu" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
          <MenuIcon />
        </button>
        {variant === "library" && (
          <label className="lib-search">
            <SearchIcon />
            <input
              type="search"
              value={query}
              placeholder="Search by job, company, date, address, or ID"
              aria-label="Search jobs"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        )}
        <AccountMenu />
      </header>
      <div className={variant === "library" ? "lib-main" : "ops-main"}>
        {variant === "library" ? <LibraryQueryContext.Provider value={query}>{children}</LibraryQueryContext.Provider> : children}
      </div>
    </div>
  );
}

function Rail({ onNavigate }: { onNavigate: () => void }) {
  const path = usePathname() ?? "";
  const items = [
    { href: "/dashboard", label: "Dashboard", icon: <GridIcon />, current: path === "/dashboard" },
    { href: "/record", label: "Record", icon: <RecordIcon />, current: path === "/record" },
    { href: "/jobs", label: "Jobs", icon: <FolderIcon />, current: path === "/jobs" || path.startsWith("/jobs/") },
    { href: "/results", label: "Results", icon: <ResultsIcon />, current: path === "/results" || path.startsWith("/results/") },
    { href: "/estimate", label: "Estimate", icon: <EstimateIcon />, current: path === "/estimate" || path.startsWith("/estimate/") },
  ];
  const account = path === "/account" || path.startsWith("/account/");
  return (
    <>
      <div className="rail-body">
        <div className="rail-section">
          {items.map((item) => (
            <Link key={item.href} className="navitem" href={item.href} aria-current={item.current ? "page" : undefined} onClick={onNavigate}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="rail-footer">
        <Link className="navitem" href="/account" aria-current={account ? "page" : undefined} onClick={onNavigate}>
          <GearIcon />
          <span>Account</span>
        </Link>
      </div>
    </>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function RecordIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function ResultsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 6h14M5 12h14M5 18h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function EstimateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 3.5V8h4.5M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 3.2v2.2M12 18.6V21M21 12h-2.2M5.2 12H3M18.2 5.8l-1.6 1.6M7.4 16.6 5.8 18.2M18.2 18.2l-1.6-1.6M7.4 7.4 5.8 5.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
