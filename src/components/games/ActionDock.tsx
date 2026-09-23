import type { ReactNode } from "react";

/**
 * Oyunun ana düğmesi(leri) için yuva.
 *
 * Telefonda ekranın altına sabitlenir: oyuncu çarkı/tahtayı/zarı izlerken
 * düğmeye başparmağıyla basabilsin. Önceden düğme bahis panelinin altında
 * kalıyordu; basmak için aşağı kaydırınca oyunun kendisi ekrandan
 * çıkıyor, sonucu görmek için tekrar yukarı kaydırmak gerekiyordu.
 *
 * Geniş ekranda (lg) sağ sütundaki normal yerine döner — orada her şey
 * zaten aynı anda görünüyor.
 *
 * Arkadaki degrade, altından kayan içeriği yumuşakça karartır; yuvanın boş
 * kısmı tıklamaları geçirir (pointer-events-none), yalnızca düğmeler
 * tıklanabilir.
 */
export function ActionDock({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30
                 bg-gradient-to-t from-[#05070f] via-[#05070f]/90 to-transparent
                 px-4 pt-8 pb-[max(14px,env(safe-area-inset-bottom))]
                 lg:pointer-events-auto lg:static lg:z-auto lg:bg-none lg:p-0"
    >
      <div className="pointer-events-auto mx-auto w-full max-w-lg space-y-2 lg:max-w-none">
        {children}
      </div>
    </div>
  );
}
