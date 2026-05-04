"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Polling hook que dispara fetch a `url` cada `intervalMs` ms.
 * Cancela en cleanup. Re-arranca cuando cambia url o running.
 */
export function usePoll<T>(
  url: string,
  intervalMs: number,
  running = true,
): { data: T | null; error: string | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    if (!running) return;

    const tick = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!cancelRef.current) {
          setData(j);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelRef.current) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    };

    void tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelRef.current = true;
      clearInterval(id);
    };
  }, [url, intervalMs, running]);

  return { data, error, loading };
}

/** Una vez, no polling. Para tabs offline. */
export function useFetchOnce<T>(
  url: string,
  enabled = true,
): { data: T | null; error: string | null; loading: boolean; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [tick, setTick] = useState(0);
  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!cancelled) {
          setData(j);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [url, enabled, tick]);

  return { data, error, loading, refetch };
}
