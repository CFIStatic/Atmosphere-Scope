import Link from "next/link";

export function BrandLockup({ href }: { href?: string }) {
  const mark = (
    <span className="brand-lockup-pair">
      <img className="brand-lockup brand-lockup-dark" src="/brand/lockup-dark.svg" alt="Atmosphere Scope" width={1193} height={209} />
      <img className="brand-lockup brand-lockup-light" src="/brand/lockup-light.svg" alt="Atmosphere Scope" width={1193} height={209} />
    </span>
  );
  if (!href) return mark;
  return (
    <Link href={href} className="brand-lockup-link">
      {mark}
    </Link>
  );
}
