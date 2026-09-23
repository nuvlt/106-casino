"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Günlük coin",
    body: "Her gece TRT ile 00:00'da bakiyen 1.000 coin'e sıfırlanır. Coin birikmez — dün ne kadar kazanmış ya da kaybetmiş olursan ol, her sabah temiz 1.000 coin ile başlarsın.",
  },
  {
    title: "Giriş serisi",
    body: "Art arda her gün girersen seri sayacın artar ve günlük coin'ine ekstra bonus eklenir. Bir günü atlarsan seri sıfırdan başlar.",
  },
  {
    title: "Günün görevleri",
    body: "Her gece yenilenen üç görev vardır (ör. \"herhangi bir oyunda 10x yakala\"). Tamamlayıp ödülünü aldığında ekstra coin kazanırsın.",
  },
  {
    title: "Rozetler",
    body: "Belirli başarılar (ilk tur, büyük çarpan, uzun seri gibi) kalıcı rozet kazandırır — coin gibi sıfırlanmaz, hep sende kalır.",
  },
  {
    title: "Sıralama",
    body: "Sıralama anlık bakiyene değil, sezon boyunca ulaştığın en yüksek bakiyeye (zirve) göre yapılır. Böylece kazandıktan sonra oynamayı bırakmak avantaj sağlamaz.",
  },
  {
    title: "Oyunlar",
    body: "Sekiz oyun da rastgele sayı üretimiyle çalışır; sonucu ne oyuncu ne de yönetici değiştirebilir.",
  },
  {
    title: "Gerçek para yok",
    body: "Bütün coin'ler hayalidir; çekilemez, transfer edilemez, gerçek paraya çevrilemez. Bu tamamen ofis içi bir eğlence — tek ödül sıralamanın tepesi.",
  },
];

/** Sağ altta sabit "i" düğmesi — platformun nasıl işlediğini anlatan bir panel açar. */
export function HowItWorks() {
  const [open, setOpen] = useState(false);
  // Oyun ekranında telefonda alt köşe oyna düğmesine ait; "i" orada gizlenir
  // (geniş ekranda yer çakışması yok, görünür kalır).
  const inGame = usePathname()?.startsWith("/oyun/") ?? false;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Platform nasıl işliyor?"
        className={`${inGame ? "hidden lg:grid" : "grid"} gold-metal fixed bottom-4 right-4 z-40 size-11 place-items-center rounded-full
                   font-display text-lg font-black text-[#3a2500]
                   shadow-[0_6px_0_#7a5804,0_10px_24px_rgba(0,0,0,0.5)] ring-1 ring-gold/40
                   transition active:translate-y-[3px] active:shadow-[0_2px_0_#7a5804]`}
      >
        i
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Platform nasıl işliyor"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#0d1f16]
                       ring-1 ring-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.7)] sm:rounded-3xl"
          >
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/8 bg-[#0d1f16]/95 px-5 py-4 backdrop-blur">
              <div className="font-display text-lg font-black text-white">Nasıl işliyor?</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Kapat"
                className="ml-auto grid size-8 shrink-0 place-items-center rounded-full bg-white/8
                           text-white/70 ring-1 ring-white/10 active:scale-95"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {SECTIONS.map((s) => (
                <div key={s.title}>
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-gold">{s.title}</div>
                  <p className="text-sm leading-relaxed text-white/75">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
