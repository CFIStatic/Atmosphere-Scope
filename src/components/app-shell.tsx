"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AccountMenu } from "@/components/account-menu";
import { LibraryQueryContext } from "@/components/library-query";
import { Wordmark } from "@/components/wordmark";

export function AppShell({
  current,
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

  const rail = <Rail current={current} onNavigate={() => setOpen(false)} showChat={variant === "page"} />;

  return (
    <div className={variant === "library" ? "lib" : "ops"}>
      <aside className="rail" aria-label="Navigation">
        <div className="rail-head">
          <Wordmark />
        </div>
        {variant === "page" && rail}
      </aside>
      {open && (
        <div className="rail-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="rail-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <aside className="rail rail-panel">
            <div className="rail-head">
              <Wordmark />
            </div>
            {rail}
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
              placeholder="Search by job, company, date, address, ID, or hash"
              aria-label="Search videos"
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

function Rail({ current, onNavigate, showChat }: { current?: string; onNavigate: () => void; showChat: boolean }) {
  const path = usePathname();
  const [hash, setHash] = useState("");
  const onJob = /^\/jobs\/[^/]+$/.test(path ?? "");

  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [path]);

  const chatOn = onJob && (hash === "" || hash === "#chat");
  return (
    <>
      <div className="rail-body">
        <div className="rail-section">
          <Link className="navitem" href="/record" onClick={onNavigate}>
            <BoltIcon />
            <span>Start a job</span>
          </Link>
          <Link className="navitem" href="/dashboard" aria-current={current === "/dashboard" || current === "/jobs" ? "page" : undefined} onClick={onNavigate}>
            <GridIcon />
            <span>Dashboard</span>
          </Link>
        </div>
        {showChat && onJob && (
          <div className="rail-section">
            <h3>Chat history</h3>
            <Link className="navitem" href={`${path}#chat`} onClick={onNavigate}>
              <PlusIcon />
              <span>New chat</span>
            </Link>
            <Link className="navitem" href={`${path}#chat`} aria-current={chatOn ? "page" : undefined} onClick={onNavigate}>
              <ChatIcon />
              <span>Chat</span>
            </Link>
          </div>
        )}
      </div>
      <div className="rail-footer">
        <Link className="navitem" href="/account" aria-current={current === "/account" ? "page" : undefined} onClick={onNavigate}>
          <GearIcon />
          <span>Settings</span>
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

function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 16.5 3.5 20l4-1.2A8.5 8.5 0 1 0 5 16.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
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
