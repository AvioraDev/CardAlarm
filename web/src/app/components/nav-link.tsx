"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  href: string;
  className?: string;
  children: React.ReactNode;
}

/** Header link that marks the current section with aria-current="page" (styled by `.nav-link`). */
export function NavLink({ href, className, children }: NavLinkProps) {
  const pathname = usePathname();
  const isCurrent = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link href={href} className={className} aria-current={isCurrent ? "page" : undefined}>
      {children}
    </Link>
  );
}
