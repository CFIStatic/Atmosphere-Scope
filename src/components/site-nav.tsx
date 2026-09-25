import Link from "next/link";

const LINKS = [
  ["/contents", "Contents", "Contents"],
  ["/measure", "Measure", "Measure"],
  ["/claims", "Claims", "Claims"],
  ["/underwriting", "Underwriting", "Cover"],
  ["/account", "Account", "Account"],
] as const;

export function SiteNav({ current }: { current?: string }) {
  return (
    <nav className="tabs side-nav" aria-label="Primary">
      {LINKS.map(([href, label, short]) => (
        <Link key={href} href={href} aria-label={label} aria-current={current === href ? "page" : undefined}>
          <span className="nav-full">{label}</span>
          <span className="nav-short">{short}</span>
        </Link>
      ))}
    </nav>
  );
}
