"use client";

import { useEffect, useState } from "react";
import { sfx } from "@/lib/sound";

/** Ses aç/kapa — tercih tarayıcıda saklanır. */
export function SoundToggle() {
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Sunucuda localStorage yok; ilk render sonrası okunur.
    setMuted(sfx.muted);
    setReady(true);
    const unsubscribe = sfx.subscribe(setMuted);
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <button
      onClick={() => {
        const next = !muted;
        sfx.prime();
        sfx.setMuted(next);
        setMuted(next);
        if (!next) sfx.chip();
      }}
      aria-label={muted ? "Sesi aç" : "Sesi kapat"}
      aria-pressed={muted}
      className="grid size-9 shrink-0 place-items-center rounded-full bg-white/8 text-sm
                 text-gold ring-1 ring-gold/25 transition active:scale-95"
    >
      {ready && muted ? "🔇" : "🔊"}
    </button>
  );
}
