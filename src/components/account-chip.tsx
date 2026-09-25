"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PublicSession = { email: string; name: string; role: "admin" | "estimator" | "customer" };

export function AccountChip() {
  const [session, setSession] = useState<PublicSession | null>(null);

  useEffect(() => {
    void fetch("/api/auth/session").then(async (response) => {
      if (!response.ok) return;
      const body = await response.json();
      setSession(body.session ?? null);
    });
  }, []);

  return (
    <div className="account-chip">
      {session ? (
        <>
          <span className="account-name">{session.name}</span>
          <span className="account-role">{session.role}</span>
          {session.role === "admin" && <Link href="/admin/users">Users</Link>}
        </>
      ) : (
        <Link href="/login">Sign in</Link>
      )}
    </div>
  );
}
