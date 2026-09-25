import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

export function AppFrame({
  current,
  variant = "page",
  children,
}: {
  current?: string;
  variant?: "page" | "library";
  children: ReactNode;
}) {
  return <AppShell current={current} variant={variant}>{children}</AppShell>;
}
