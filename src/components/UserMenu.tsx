"use client";

import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/lib/actions";

export interface UserMenuUser {
  name: string | null;
  email: string;
}

/** Ad(lar)dan baş harfleri çıkarır; ad yoksa e-postanın ilk harfi kullanılır. */
function initials({ name, email }: UserMenuUser): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
    const combined = (first + last).toUpperCase();
    if (combined) return combined;
  }
  return email[0]?.toUpperCase() ?? "?";
}

/**
 * Sağ üstteki hesap rozeti: kimin oturum açtığını her ekranda görünür kılar
 * ve tıklanınca ad/e-posta ile çıkış seçeneğini açar.
 */
export function UserMenu({ user }: { user: UserMenuUser | undefined }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const firstName = user.name?.trim().split(/\s+/)[0] || user.email.split("@")[0];

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Hesap menüsü"
        className="flex items-center gap-1.5 rounded-full bg-white/8 py-1 pl-1 pr-2 ring-1 ring-white/12
                   transition active:scale-95"
      >
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#8fb6ff] to-[#3f6fd1]
                     text-[10px] font-black text-white"
        >
          {initials(user)}
        </span>
        <span className="hidden max-w-[88px] truncate text-[11px] font-black text-white/80 sm:inline-block">
          {firstName}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-2xl bg-[#0f2419]
                     shadow-[0_16px_40px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
        >
          <div className="border-b border-white/8 px-4 py-3">
            <p className="truncate text-sm font-black text-white/90">{user.name || firstName}</p>
            <p className="truncate text-[11px] text-muted">{user.email}</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="w-full px-4 py-3 text-left text-xs font-black text-[#ffb3be] transition hover:bg-white/6"
            >
              Çıkış yap
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
