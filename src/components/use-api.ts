"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal data hook: fetch on mount, expose reload, keep the previous data while revalidating. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const my = ++seq.current;
    try {
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (my !== seq.current) return;
      if (!r.ok) setError(j.error ?? "Couldn't load that.");
      else { setData(j as T); setError(null); }
    } catch { if (my === seq.current) setError("You appear to be offline."); }
    finally { if (my === seq.current) setLoading(false); }
  }, [url]);
  useEffect(() => { setLoading(!!url); load(); }, [load, url]);
  return { data, error, loading, reload: load, setData };
}
