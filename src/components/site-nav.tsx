import Link from "next/link";

const LINKS = [
  ["/contents", "Contents"],
  ["/measure", "Measure"],
  ["/claims", "Claims"],
  ["/underwriting", "Underwriting"],
  ["/account", "Account"],
] as const;

export function SiteNav({ current }: { current?: string }) {
  return (
    <nav className="tabs" aria-label="Primary">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
