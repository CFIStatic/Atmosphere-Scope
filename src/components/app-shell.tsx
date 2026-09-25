"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BrandLockup } from "@/components/brand-lockup";
import { cycleThemePreference, readThemePreference, setThemePreference, themeLabel, type ThemePreference } from "@/theme/theme";

const SECTIONS = [
  {
    id: "operate",
    label: "Operate",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/record", label: "Record" },
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    items: [
      { href: "/jobs", label: "Jobs" },
      { href: "/results", label: "Results" },
      { href: "/estimate", label: "Estimate" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [{ href: "/account", label: "Account" }],
  },
] as const;

const BOTTOM = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/record", label: "Record" },
  { href: "/jobs", label: "Jobs" },
  { href: "/results", label: "Results" },
  { href: "/estimate", label: "Estimate" },
] as const;

const JUMP = [
  ...BOTTOM,
  { href: "/review", label: "Review" },
  { href: "/account", label: "Account" },
];

type PublicSession = { email: string; name: string; role: "admin" | "estimator" | "customer" };

export function AppShell({ current, children }: { current?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const active = (href: string) => current === href;

  return (
    <div className="atm-app">
      <aside className="atm-rail glass-rail">
        <div className="atm-rail-logo">
          <Link href="/dashboard" aria-label="Atmosphere Scope">
            <BrandLockup />
          </Link>
        </div>
        <Rail current={current} onNavigate={() => setOpen(false)} />
      </aside>

      {open && (
        <div className="atm-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="atm-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <aside className="atm-drawer-panel glass-rail">
            <div className="atm-rail-logo">
              <Link href="/dashboard" aria-label="Atmosphere Scope" onClick={() => setOpen(false)}>
                <BrandLockup />
              </Link>
              <button type="button" className="atm-icon-btn" aria-label="Close navigation" onClick={() => setOpen(false)}>×</button>
            </div>
            <Rail current={current} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="atm-workspace">
        <header className="atm-top glass-bar">
          <button type="button" className="atm-menu" aria-label="Open navigation" onClick={() => setOpen(true)}>
            <MenuIcon />
          </button>
          <JumpPalette />
          <UserMenu />
        </header>
        <div className="atm-content">{children}</div>
      </div>

      <nav className="atm-bottom" aria-label="Primary">
        {BOTTOM.map((item) => (
          <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined}>
            <NavIcon name={item.label} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Rail({ current, onNavigate }: { current?: string; onNavigate: () => void }) {
  return (
    <nav aria-label="Main" className="atm-nav">
      {SECTIONS.map((section) => (
        <div key={section.id} className="atm-nav-section">
          <p>{section.label}</p>
          <ul>
            {section.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={current === item.href ? "page" : undefined} onClick={onNavigate}>
                  <NavIcon name={item.label} />
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function JumpPalette() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return JUMP;
    return JUMP.filter((item) => item.label.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <div ref={wrapRef} className="atm-search">
      <div className="atm-search-field glass-card">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search by job, company, date, address, ID, or hash"
          aria-label="Search"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches[0]) go(matches[0].href);
          }}
        />
        <kbd>⌘K</kbd>
      </div>
      {open && matches.length > 0 && (
        <div className="atm-search-menu glass-panel" role="listbox">
          {matches.map((item) => (
            <button key={item.href} type="button" onClick={() => go(item.href)}>
              <NavIcon name={item.label} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [theme, setTheme] = useState<ThemePreference>("dark");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTheme(readThemePreference());
    void fetch("/api/auth/session").then(async (response) => {
      if (!response.ok) return;
      const body = await response.json();
      setSession(body.session ?? null);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = (session?.name || session?.email || "?").slice(0, 1).toUpperCase();

  return (
    <div ref={wrapRef} className="atm-user">
      <button type="button" className="atm-avatar" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {initial}
      </button>
      {open && (
        <div className="atm-user-menu glass-panel" role="menu">
          <div className="atm-user-id">
            <p>{session?.name ?? "Not signed in"}</p>
            <p>{session?.email ?? ""}</p>
            {session?.role && <p className="atm-role">{session.role}</p>}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const next = cycleThemePreference(theme);
              setTheme(next);
              setThemePreference(next);
            }}
          >
            Appearance: {themeLabel(theme)}
          </button>
          <Link role="menuitem" href="/account" onClick={() => setOpen(false)}>Account</Link>
          {session?.role === "admin" && <Link role="menuitem" href="/admin/users" onClick={() => setOpen(false)}>Users</Link>}
          {session ? (
            <button
              type="button"
              role="menuitem"
              className="atm-signout"
              onClick={async () => {
                await fetch("/api/auth/session", { method: "DELETE" });
                router.push("/login");
                router.refresh();
              }}
            >
              Sign out
            </button>
          ) : (
            <Link role="menuitem" href="/login" onClick={() => setOpen(false)}>Sign in</Link>
          )}
        </div>
      )}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" />
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

function NavIcon({ name }: { name: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true as const };
  if (name === "Dashboard") {
    return <svg {...common}><path d="M2.5 8.5 8 3.5l5.5 5V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V8.5z" stroke="currentColor" strokeWidth="1.4" /></svg>;
  }
  if (name === "Record") {
    return <svg {...common}><circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.4" /><circle cx="8" cy="8" r="2" fill="currentColor" /></svg>;
  }
  if (name === "Jobs") {
    return <svg {...common}><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.4" /></svg>;
  }
  if (name === "Results") {
    return <svg {...common}><path d="M3 12.5V8M8 12.5V3.5M13 12.5V6" stroke="currentColor" strokeWidth="1.4" /></svg>;
  }
  if (name === "Estimate" || name === "Review") {
    return <svg {...common}><path d="M4 2.5h5.5L13 6v7.5H4v-11z" stroke="currentColor" strokeWidth="1.4" /><path d="M9.5 2.5V6H13" stroke="currentColor" strokeWidth="1.4" /></svg>;
  }
  return <svg {...common}><circle cx="8" cy="5.5" r="2.25" stroke="currentColor" strokeWidth="1.4" /><path d="M3.5 13.25c.7-2.1 2.3-3.15 4.5-3.15s3.8 1.05 4.5 3.15" stroke="currentColor" strokeWidth="1.4" /></svg>;
}
