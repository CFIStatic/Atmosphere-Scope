import Link from "next/link";

export function BrandLockup({ href }: { href?: string }) {
  const mark = <img className="brand-lockup" src="/brand/lockup-dark.svg" alt="Atmosphere Scope" width={1193} height={209} />;
  if (!href) return mark;
  return (
    <Link href={href} className="brand-lockup-link">
      {mark}
    </Link>
  );
}
