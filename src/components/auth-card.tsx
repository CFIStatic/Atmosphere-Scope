import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand-lockup";

export function AuthCard({ title, lede, children }: { title: string; lede?: string; children: ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-card panel grid">
        <BrandLockup />
        <h1 className="page-title">{title}</h1>
        {lede && <p className="meta">{lede}</p>}
        {children}
      </section>
    </main>
  );
}
