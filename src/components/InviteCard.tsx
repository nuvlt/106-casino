"use client";

import { useEffect, useRef, useState } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { coinsShort } from "@/lib/format";
import { sfx } from "@/lib/sound";

interface InviteResponse {
  code: string;
  invited: number;
  earned: number;
  rewardsLeft: number;
  bonus: number;
}

/**
 * "Arkadaşını getir" kartı — kişisel davet linki, paylaş/kopyala ve
 * davet karnesi. Davet sistemi kullanılamıyorsa (tablolar henüz
 * kurulmadıysa) kart hiç görünmez.
 */
export function InviteCard() {
  const { data } = useApi<InviteResponse>("/api/invite");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Link istemcide kurulur: alan adı neyse o paylaşılır.
  useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(typeof navigator.share === "function");
  }, []);

  if (!data || !origin) return null;

  const url = `${origin}/davet/${data.code}`;
  const bonus = coinsShort(data.bonus);
  const shareText = `106 Casino'da her gün 1.000 coin bedava, 8 oyun, ofis sıralaması 🎰 Bu linkle katıl, ikimize de +${bonus} coin!`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Eski tarayıcı / izin yok: metni seçili bırak, kullanıcı elle kopyalasın.
      inputRef.current?.select();
      document.execCommand?.("copy");
    }
    sfx.chip();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const share = async () => {
    try {
      await navigator.share({ title: "106 Casino", text: shareText, url });
    } catch {
      /* kullanıcı paylaşım penceresini kapattı — sorun değil */
    }
  };

  return (
    <div id="davet" className="scroll-mt-24">
      <Card>
        <SectionTitle right={data.invited > 0 ? `${data.invited} kişi katıldı` : undefined}>
          Arkadaşını getir 🎁
        </SectionTitle>

        <p className="mb-3 text-xs leading-relaxed text-white/75">
          Linkinle katılan her iş arkadaşın için{" "}
          <strong className="text-gold">ikinize de +{bonus} coin</strong>.
        </p>

        <input
          ref={inputRef}
          readOnly
          value={url}
          aria-label="Davet linkin"
          onFocus={(e) => e.currentTarget.select()}
          className="mb-2.5 w-full truncate rounded-xl bg-black/30 px-3 py-2.5 font-mono text-[11px]
                     text-white/80 ring-1 ring-white/10 outline-none focus:ring-gold/40"
        />

        {/* Telefonda (ve paylaşımı destekleyen masaüstünde) sistem paylaşım
            menüsü: WhatsApp, Slack, Mail… Desteklemeyende tek kopyala düğmesi. */}
        <div className={`grid gap-2 ${canShare ? "grid-cols-2" : "grid-cols-1"}`}>
          {canShare ? (
            <button
              type="button"
              onClick={share}
              className="gold-metal shine rounded-xl py-2.5 font-display text-sm font-black text-[#3a2500]
                         shadow-[0_4px_0_#7a5804] transition active:translate-y-[3px] active:shadow-[0_1px_0_#7a5804]"
            >
              Paylaş
            </button>
          ) : null}
          <button
            type="button"
            onClick={copy}
            className={
              canShare
                ? "rounded-xl bg-white/8 py-2.5 text-sm font-black text-white/85 ring-1 ring-white/12 transition active:scale-[0.97]"
                : "gold-metal shine rounded-xl py-2.5 font-display text-sm font-black text-[#3a2500] shadow-[0_4px_0_#7a5804] transition active:translate-y-[3px] active:shadow-[0_1px_0_#7a5804]"
            }
          >
            {copied ? "Kopyalandı ✓" : canShare ? "Kopyala" : "Linki kopyala"}
          </button>
        </div>

        {data.invited > 0 || data.rewardsLeft === 0 ? (
          <p className="mt-2.5 text-center text-[11px] text-muted">
            {data.earned > 0 ? <>Davetlerden +{coinsShort(data.earned)} coin kazandın · </> : null}
            {data.rewardsLeft > 0
              ? `${data.rewardsLeft} bonuslu davet hakkın kaldı`
              : "Bonus sınırına ulaştın — davet etmeye devam edebilirsin"}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
