import Link from "next/link";
import { AccountChip } from "@/components/account-chip";

const LINKS = [
  ["/record", "Record"],
  ["/jobs", "Jobs"],
  ["/results", "Results"],
  ["/estimate", "Estimate"],
  ["/account", "Account"],
] as const;

export function SiteNav({ current }: { current?: string }) {
  const primary = LINKS.slice(0, 4);
  const account = LINKS[4];
  return (
    <nav className="side-nav" aria-label="Primary">
      {primary.map(([href, label]) => (
        <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>
          <NavIcon name={label} />
          <span>{label}</span>
        </Link>
      ))}
      <AccountChip />
      <Link href={account[0]} aria-current={current === account[0] ? "page" : undefined}>
        <NavIcon name={account[1]} />
        <span>{account[1]}</span>
      </Link>
    </nav>
  );
}

function NavIcon({ name }: { name: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true as const };
  if (name === "Record") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
    );
  }
  if (name === "Jobs") {
    return (
      <svg {...common}>
        <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (name === "Results") {
    return (
      <svg {...common}>
        <path d="M3 12.5V8M8 12.5V3.5M13 12.5V6" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (name === "Estimate") {
    return (
      <svg {...common}>
        <path d="M4 2.5h5.5L13 6v7.5H4v-11z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9.5 2.5V6H13" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="5.5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 13.25c.7-2.1 2.3-3.15 4.5-3.15s3.8 1.05 4.5 3.15" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
