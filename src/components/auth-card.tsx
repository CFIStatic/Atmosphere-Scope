import type { ReactNode } from "react";
import { Wordmark } from "@/components/wordmark";

export function AuthCard({ title, lede, children, after }: { title: string; lede?: string; children: ReactNode; after?: ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="auth-chrome">
        <Wordmark href="/login" />
      </div>
      <section className="auth-card">
        <p className="auth-kicker">Workspace</p>
        <h1>{title}</h1>
        {lede && <p className="auth-lede">{lede}</p>}
        {children}
      </section>
      <p className="auth-footnote">Passwords are encrypted, never stored in plain text, and never seen by this page.</p>
      {after}
    </main>
  );
}
