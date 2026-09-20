/** Ortak arayüz parçaları — bütün ekranlar aynı dili konuşsun diye. */

import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-white/8 bg-surface/80 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-base font-bold tracking-tight text-white/90">{children}</h2>
      {right ? <div className="text-xs text-muted">{right}</div> : null}
    </header>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "gold" | "win" | "lose" | "info";
}) {
  const tones = {
    neutral: "bg-white/8 text-white/70",
    gold: "bg-gold/15 text-gold",
    win: "bg-win/15 text-win",
    lose: "bg-lose/15 text-lose",
    info: "bg-neon/15 text-neon",
  } as const;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  tone = "gold",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "gold" | "felt" | "ruby" | "ghost";
  type?: "button" | "submit";
  className?: string;
}) {
  const tones = {
    gold: "bg-gradient-to-b from-[#ffd561] to-gold-deep text-[#3a2500] shadow-[0_6px_0_#8a5e00]",
    felt: "bg-gradient-to-b from-[#34d17c] to-felt-deep text-[#03271a] shadow-[0_6px_0_#0a3a24]",
    ruby: "bg-gradient-to-b from-[#ff6b6b] to-[#9b1616] text-white shadow-[0_6px_0_#6b0f0f]",
    ghost: "bg-white/8 text-white/80 shadow-none border border-white/10",
  } as const;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`font-display rounded-2xl px-5 py-3.5 text-base font-extrabold tracking-tight
        transition active:translate-y-[3px] active:shadow-none
        disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0
        ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Kullanıcı baş harflerinden renkli rozet — sıralama ve akış için. */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-display font-bold text-white/95"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(140deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 32%))`,
      }}
    >
      {name}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-white/6 ${className}`} />;
}
