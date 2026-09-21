"use client";

/**
 * Ses efektleri.
 *
 * Hiçbir ses DOSYASI yok — hepsi Web Audio ile anlık sentezleniyor.
 * Sebepleri: indirilecek varlık yok (sayfa hafif kalıyor), çevrimdışı
 * çalışıyor, ve çarpana göre tonu değişen kazanç sesi gibi şeyler
 * dosyayla mümkün olmazdı.
 *
 * Tarayıcılar ses bağlamını ancak bir kullanıcı hareketinden sonra
 * başlatmaya izin verir; bu yüzden bağlam ilk dokunuşta kurulur.
 */

const STORAGE_KEY = "106casino.muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const listeners = new Set<(m: boolean) => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** İlk kullanıcı hareketinde çağrılır; sessiz başarısızlık tasarım gereği. */
function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.35; // ofiste kulak tırmalamasın
    master.connect(ctx.destination);
    muted = readMuted();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Tek bir ton — zarf (attack/decay) ile, tıkırtı olmadan. */
function tone(opts: {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  /** Bitişte gidilecek frekans — kayan sesler için. */
  slideTo?: number;
}) {
  const c = ensureCtx();
  if (!c || !master || muted) return;

  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();

  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t0 + opts.dur);

  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);

  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

/** Gürültü patlaması — patlama ve kazı-kazan kazıma sesi için. */
function noise(opts: { dur: number; gain?: number; filter?: number; delay?: number }) {
  const c = ensureCtx();
  if (!c || !master || muted) return;

  const t0 = c.currentTime + (opts.delay ?? 0);
  const frames = Math.floor(c.sampleRate * opts.dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;

  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(opts.filter ?? 1200, t0);
  lp.frequency.exponentialRampToValueAtTime(120, t0 + opts.dur);

  const g = c.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.3, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);

  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start(t0);
}

/** Majör arpej — kazanç büyüdükçe daha çok nota. */
function arpeggio(base: number, steps: number, gain = 0.26) {
  const ratios = [1, 1.25, 1.5, 2, 2.5, 3];
  for (let i = 0; i < Math.min(steps, ratios.length); i++) {
    tone({
      freq: base * ratios[i]!,
      dur: 0.22,
      type: "triangle",
      gain,
      delay: i * 0.075,
    });
  }
}

export const sfx = {
  /** Ses bağlamını kullanıcı hareketiyle başlatır. */
  prime() {
    ensureCtx();
  },

  get muted() {
    return muted;
  },

  setMuted(next: boolean) {
    muted = next;
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* gizli sekmede depolama kapalı olabilir — sorun değil */
    }
    listeners.forEach((fn) => fn(next));
  },

  subscribe(fn: (m: boolean) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Arayüz dokunuşu. */
  click() {
    tone({ freq: 520, dur: 0.05, type: "square", gain: 0.12 });
  },

  /** Jeton seçimi — kısa, tok. */
  chip() {
    tone({ freq: 880, dur: 0.06, type: "square", gain: 0.14 });
    tone({ freq: 440, dur: 0.09, type: "sine", gain: 0.12, delay: 0.02 });
  },

  /** Çark dönerken çıtçıt. */
  tick() {
    tone({ freq: 1400, dur: 0.028, type: "square", gain: 0.07 });
  },

  /** Kazanç — çarpan büyüdükçe daha coşkulu. */
  win(mult: number) {
    const steps = mult >= 10 ? 6 : mult >= 5 ? 5 : mult >= 2 ? 4 : 3;
    arpeggio(440, steps);
    if (mult >= 10) {
      tone({ freq: 1760, dur: 0.6, type: "sine", gain: 0.2, delay: 0.42 });
    }
  },

  /** Kayıp — alçalan, kısa. */
  lose() {
    tone({ freq: 300, dur: 0.28, type: "sawtooth", gain: 0.14, slideTo: 120 });
  },

  /** Roket kalkışı. */
  launch() {
    tone({ freq: 160, dur: 0.55, type: "sawtooth", gain: 0.16, slideTo: 620 });
    noise({ dur: 0.5, gain: 0.12, filter: 900 });
  },

  /** Crash patlaması. */
  explode() {
    noise({ dur: 0.65, gain: 0.4, filter: 2200 });
    tone({ freq: 90, dur: 0.5, type: "sawtooth", gain: 0.22, slideTo: 40 });
  },

  /** Crash'ten sağ çıkma. */
  cashout(mult: number) {
    tone({ freq: 660, dur: 0.12, type: "triangle", gain: 0.24 });
    tone({ freq: 990, dur: 0.22, type: "triangle", gain: 0.22, delay: 0.09 });
    if (mult >= 5) tone({ freq: 1320, dur: 0.3, type: "sine", gain: 0.18, delay: 0.22 });
  },

  /** Rozet kazanıldı. */
  badge() {
    arpeggio(523, 4, 0.22);
    tone({ freq: 2093, dur: 0.5, type: "sine", gain: 0.16, delay: 0.3 });
  },
};
