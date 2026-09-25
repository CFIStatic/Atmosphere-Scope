import Link from "next/link";

export function Wordmark({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} className="wordmark" aria-label="Atmosphere home">
      <svg width="28" height="28" viewBox="0 0 22 22" aria-hidden="true">
        <rect width="22" height="2.8" fill="currentColor" opacity="0.3" />
        <rect y="4.8" width="22" height="2.8" fill="currentColor" opacity="0.5" />
        <rect y="9.6" width="22" height="2.8" fill="currentColor" opacity="0.68" />
        <rect y="14.4" width="22" height="2.8" fill="currentColor" opacity="0.88" />
        <rect className="wordmark-accent" y="19.2" width="22" height="2.8" />
      </svg>
      <span>Atmosphere</span>
    </Link>
  );
}
