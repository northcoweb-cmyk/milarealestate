"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Stale-while-revalidate: a screen you've already opened paints instantly from here, then quietly refreshes. This is what stops
// content popping in (and the layout jumping) every time you move between tabs. Cleared on sign-in / sign-out so accounts never mix.
const cache = new Map<string, unknown>();
export const clearApiCache = () => cache.clear();
export const peekApi = <T,>(url: string) => (cache.get(url) as T | undefined) ?? null;
export const putApi = (url: string, v: unknown) => { cache.delete(url); cache.set(url, v); };
const remember = (url: string, data: unknown) => { cache.delete(url); cache.set(url, data); if (cache.size > 60) cache.delete(cache.keys().next().value as string); };

/** Minimal data hook: paint cached data at once, fetch on mount, expose reload, keep the previous data while revalidating. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(() => (url && cache.has(url) ? (cache.get(url) as T) : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !!url && !cache.has(url));
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const my = ++seq.current;
    try {
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (my !== seq.current) return;
      if (!r.ok) setError(j.error ?? "Couldn't load that.");
      else { remember(url, j); setData(j as T); setError(null); }
    } catch { if (my === seq.current) setError("You appear to be offline."); }
    finally { if (my === seq.current) setLoading(false); }
  }, [url]);
  useEffect(() => {
    if (url && cache.has(url)) { setData(cache.get(url) as T); setLoading(false); } else setLoading(!!url);
    load();
  }, [load, url]);
  // keep the cache in step with local optimistic edits made through setData
  const set: typeof setData = useCallback((v) => setData((prev) => { const next = typeof v === "function" ? (v as (p: T | null) => T | null)(prev) : v; if (url && next != null) remember(url, next); return next; }), [url]);
  return { data, error, loading, reload: load, setData: set };
}
