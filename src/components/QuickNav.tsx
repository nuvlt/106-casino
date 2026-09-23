"use client";

import type { Route } from "next";
import Link from "next/link";

/**
 * Ana sayfadaki kısa yol şeridi. Dar ekranda yana kayar; yönetici
 * yalnızca ADMIN_EMAILS listesindekilere görünür (sayfanın kendisi de
 * sunucuda ayrıca korunuyor).
 */
export function QuickNav({ isAdmin }: { isAdmin: boolean }) {
  const links: { href: Route; icon: string; label: string }[] = [
    { href: "/gecmis", icon: "🕘", label: "Geçmişim" },
    { href: "/siralama", icon: "🏆", label: "Sıralama" },
    { href: "/rozetler", icon: "🎖️", label: "Rozetler" },
    ...(isAdmin ? [{ href: "/admin" as Route, icon: "⚙️", label: "Yönetim" }] : []),
  ];

  return (
    <nav aria-label="Kısa yollar" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/6 px-3.5 py-2
                     text-xs font-black text-white/80 ring-1 ring-white/10 transition
                     hover:bg-white/12 active:scale-[0.97]"
        >
          <span aria-hidden>{l.icon}</span>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
