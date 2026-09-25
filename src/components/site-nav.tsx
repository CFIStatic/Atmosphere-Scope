import Link from "next/link";

const LINKS = [
  ["/", "Jobs"],
  ["/walk", "Walk"],
  ["/results", "Results"],
  ["/estimate", "Estimate"],
  ["/account", "Account"],
] as const;

export function SiteNav({ current }: { current?: string }) {
  return (
    <nav className="tabs side-nav" aria-label="Primary">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
