import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

export function AppFrame({ current, children }: { current?: string; children: ReactNode }) {
  return <AppShell current={current}>{children}</AppShell>;
}
