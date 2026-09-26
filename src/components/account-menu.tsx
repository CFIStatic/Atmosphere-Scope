"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

type PublicSession = { email: string; name: string; role: "admin" | "estimator" | "customer" };

export function AccountMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [ready, setReady] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void fetch("/api/auth/session").then(async (response) => {
      if (response.ok) {
        const body = await response.json();
        setSession(body.session ?? null);
      }
      setReady(true);
    }).catch(() => setReady(true));
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

  const name = session?.name?.trim() || "Your account";
  const sub = !ready ? "Loading…" : session?.role ? roleWord(session.role) : session?.email || "";
  const initial = session?.name?.trim() || session?.email?.trim() || "";

  return (
    <div ref={wrapRef} className="who-wrap">
      <button type="button" className="who" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>
          <span className="who-name">{name}</span>
          <span className="who-role">{sub}</span>
        </span>
        <span className="who-avatar" aria-hidden="true">{initial ? initial.slice(0, 1).toUpperCase() : "—"}</span>
      </button>
      {open && (
        <div className="who-menu" role="menu" aria-label="Account">
          <div className="who-menu-head">
            <p>{name}</p>
            {session?.email && <p>{session.email}</p>}
            {session?.role && <p>{roleWord(session.role)}</p>}
          </div>
          <ThemeToggle id="theme-toggle" labeled />
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)}>Settings</Link>
          {session?.role === "admin" && <Link role="menuitem" href="/admin/users" onClick={() => setOpen(false)}>Users</Link>}
          {session ? (
            <button
              type="button"
              role="menuitem"
              className="who-signout"
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

function roleWord(role: string): string {
  if (role === "admin") return "Admin";
  if (role === "customer") return "Customer";
  return "Estimator";
}
