"use client";

import { useEffect, useState } from "react";
import { jfetch } from "./ui";

export interface CardRef { key: string; address: string; city: string | null; state: string | null; zip: string | null; listingId?: string; propertyId?: string }
type Res = { thumb: string | null; photoStatus: string; reason?: string };

// Module-level memo: re-renders, tab changes and remounts never ask the server twice in one session (the server caches too).
const done = new Map<string, Res>();
const asked = new Set<string>();

/**
 * Cache-first, then enrich: 1) one free cache-only call paints whatever we already have; 2) one enrich call (server decides whether
 * a provider call is allowed) fills in the rest. Cards render immediately either way; photos swap in when they arrive.
 */
export function useListingPhotos(cards: CardRef[], opts: { enrich?: boolean } = {}) {
  const [, bump] = useState(0);
  const sig = cards.map((c) => c.key).join(",");
  useEffect(() => {
    let live = true;
    const todo = cards.filter((c) => !done.has(c.key) && !asked.has(`peek:${c.key}`));
    const run = async () => {
      if (todo.length) {
        todo.forEach((c) => asked.add(`peek:${c.key}`));
        try { const r = await jfetch<{ items: ({ key: string } & Res)[] }>("/api/media/cards", { method: "POST", json: { items: todo, enrich: false } }); for (const i of r.items) if (i.thumb) done.set(i.key, i); if (live) bump((n) => n + 1); } catch { /* cards still render */ }
      }
      if (!opts.enrich) return;
      const need = cards.filter((c) => !done.has(c.key) && !asked.has(`enrich:${c.key}`) && c.city && c.state);
      if (!need.length) return;
      need.forEach((c) => asked.add(`enrich:${c.key}`));
      try { const r = await jfetch<{ items: ({ key: string } & Res)[] }>("/api/media/cards", { method: "POST", json: { items: need, enrich: true } }); for (const i of r.items) done.set(i.key, i); if (live) bump((n) => n + 1); } catch { /* ignore */ }
    };
    void run();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, opts.enrich]);
  const get = (key: string) => done.get(key)?.thumb ?? null;
  const reasons = () => [...new Set(cards.map((c) => done.get(c.key)).filter((r) => r && !r.thumb && r.reason).map((r) => r!.reason as string))]; // owner-only: why no photo
  return Object.assign(get, { reasons });
}
