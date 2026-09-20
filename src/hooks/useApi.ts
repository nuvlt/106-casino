"use client";

/**
 * Küçük veri çekme kancası — yeniden kullanılabilir, yenilenebilir,
 * isteğe bağlı aralıklı güncelleme. Ek bağımlılık getirmemek için
 * bilerek sade tutuldu.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (updater: (prev: T | null) => T | null) => void;
}

export function useApi<T>(url: string, opts: { refreshMs?: number } = {}): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!alive.current) return;
      if (!res.ok) {
        setError(json?.error ?? "İstek başarısız");
      } else {
        setData(json as T);
        setError(null);
      }
    } catch {
      if (alive.current) setError("Bağlantı kurulamadı");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    alive.current = true;
    void load();
    if (!opts.refreshMs) return () => { alive.current = false; };
    const t = setInterval(() => void load(), opts.refreshMs);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [load, opts.refreshMs]);

  return {
    data,
    error,
    loading,
    reload: load,
    setData: (updater) => setData((prev) => updater(prev)),
  };
}

/** POST yardımcısı — oyun uçları için. */
export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "İstek başarısız");
  return json as T;
}

/** Her bahse benzersiz anahtar — ağ tekrarında ikinci tur açılmasın. */
export const newKey = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
