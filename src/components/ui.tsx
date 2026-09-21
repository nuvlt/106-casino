/** Ortak arayüz parçaları — casino salonu dili: pirinç kenar, cam parlaması, derinlik. */

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
      className={`gold-hairline gloss relative overflow-hidden rounded-3xl
        bg-gradient-to-b from-surface-2/85 to-surface/90 p-4
        shadow-[0_14px_40px_rgba(0,0,0,0.5)] backdrop-blur-sm ${className}`}
    >
      <div className="relative z-10">{children}</div>
    </section>
  );
}

/** Altın elmas süslemeli başlık — bölümler arasında salon havası. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-3 flex items-center gap-2.5">
      <span className="size-1.5 rotate-45 bg-gold shadow-[0_0_8px_rgba(255,201,74,0.8)]" aria-hidden />
      <h2 className="font-display text-base font-black tracking-tight text-white">{children}</h2>
      <span className="h-px flex-1 bg-gradient-to-r from-gold/40 to-transparent" aria-hidden />
      {right ? <span className="shrink-0 text-[11px] text-muted">{right}</span> : null}
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
    neutral: "bg-white/8 text-white/75 ring-white/10",
    gold: "bg-gold/15 text-gold ring-gold/30",
    win: "bg-win/15 text-win ring-win/30",
    lose: "bg-lose/15 text-lose ring-lose/30",
    info: "bg-neon/15 text-neon ring-neon/30",
  } as const;
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

/**
 * Kalın, kabartmalı düğme — casino jetonu gibi basılınca çöker.
 * Altın tonunda metalik yüzey ve üstünde gezen parlama var.
 */
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
    gold: "gold-metal text-[#3a2500] shadow-[0_7px_0_#7a5804,0_14px_24px_rgba(0,0,0,0.45)]",
    felt: "bg-gradient-to-b from-[#4ce38f] via-[#1f8b4c] to-[#0b3d22] text-[#03271a] shadow-[0_7px_0_#062a18,0_14px_24px_rgba(0,0,0,0.45)]",
    ruby: "bg-gradient-to-b from-[#ff7a8c] via-[#e01e37] to-[#7a0d1d] text-white shadow-[0_7px_0_#5a0914,0_14px_24px_rgba(0,0,0,0.45)]",
    ghost: "bg-white/8 text-white/85 ring-1 ring-white/12 shadow-none",
  } as const;

  const shiny = !disabled && tone !== "ghost";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`font-display relative overflow-hidden rounded-2xl px-5 py-3.5 text-base font-black
        uppercase tracking-wide transition
        active:translate-y-[5px] active:shadow-[0_2px_0_#7a5804]
        disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0
        ${tones[tone]} ${shiny ? "shine" : ""} ${className}`}
    >
      <span className="relative z-10 drop-shadow-[0_1px_0_rgba(255,255,255,0.25)]">{children}</span>
    </button>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-display font-black text-white
                 shadow-[inset_0_2px_6px_rgba(255,255,255,0.28)] ring-1 ring-white/20"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(140deg, hsl(${hue} 78% 52%), hsl(${(hue + 40) % 360} 74% 34%))`,
      }}
    >
      {name}
    </div>
  );
}

/** Altın jeton görünümlü bakiye/rakam kabı. */
export function GoldChip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`gold-metal gloss relative overflow-hidden rounded-full px-3.5 py-1.5
        font-display text-sm font-black text-[#3a2500]
        shadow-[0_3px_0_#7a5804,0_8px_18px_rgba(0,0,0,0.45)] ${className}`}
    >
      <span className="relative z-10">{children}</span>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-white/6 ${className}`} />;
}
