"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Check } from "lucide-react";
import { jfetch } from "./ui";

export interface PickedPlace { id: string; name: string | null; address: string | null; city: string | null; state: string | null; cityState: string | null; lat: number | null; lng: number | null; timezone: string | null }
const newToken = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
interface Sugg { id: string; main: string; secondary: string; text: string }

/**
 * Text input with live Google place suggestions (server-proxied). Picking a suggestion
 * returns a verified place. If place search isn't available, it behaves as a plain input.
 */
export function PlaceInput({ value, onChange, onPick, mode = "place", placeholder, id, verified, required }: {
  value: string; onChange: (v: string) => void; onPick?: (p: PickedPlace) => void; mode?: "city" | "address" | "place";
  placeholder?: string; id?: string; verified?: boolean; required?: boolean;
}) {
  const [items, setItems] = useState<Sugg[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [available, setAvailable] = useState(true);
  const token = useRef<string | null>(null);
  if (token.current == null) token.current = newToken();
  const skip = useRef(false);
  const seq = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    const q = value.trim();
    if (q.length < 2) { setItems([]); return; }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/places/autocomplete?mode=${mode}&t=${token.current}&q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (my !== seq.current) return;
        setAvailable(j.available !== false); setItems(j.suggestions ?? []); setHi(-1); setOpen(true);
      } catch { /* offline: stay as a plain input */ }
    }, 220);
    return () => clearTimeout(t);
  }, [value, mode]);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", out); return () => document.removeEventListener("mousedown", out);
  }, []);

  async function pick(s: Sugg) {
    skip.current = true; onChange(s.text); setOpen(false); setItems([]);
    try { const r = await jfetch<{ place: PickedPlace }>(`/api/places/details?id=${encodeURIComponent(s.id)}&t=${token.current}`); token.current = newToken(); onPick?.(r.place); if (mode === "city" && r.place.cityState) { skip.current = true; onChange(r.place.cityState); } }
    catch { /* keep the typed text */ }
  }
  function key(e: React.KeyboardEvent) {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h <= 0 ? items.length - 1 : h - 1)); }
    else if (e.key === "Enter" && hi >= 0) { e.preventDefault(); pick(items[hi]); }
    else if (e.key === "Escape") setOpen(false);
  }
  return (
    <div ref={box} className="relative">
      <input id={id} className="field" style={{ paddingRight: verified ? 44 : undefined }} value={value} required={required} placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={open && items.length > 0} aria-controls={listId} aria-autocomplete="list"
        onChange={(e) => onChange(e.target.value)} onFocus={() => items.length && setOpen(true)} onKeyDown={key} />
      {verified && <Check size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" style={{ color: "var(--ok)" }} aria-label="Verified place" />}
      {open && items.length > 0 && available && (
        <ul id={listId} role="listbox" className="surface absolute inset-x-0 top-[calc(100%+6px)] z-50 overflow-hidden p-1.5" style={{ borderRadius: 20 }}>
          {items.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === hi}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)} className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left" style={{ background: i === hi ? "color-mix(in srgb, var(--ink) 8%, transparent)" : "transparent" }}>
                <MapPin size={16} className="shrink-0 text-ink-faint" />
                <span className="min-w-0"><span className="block truncate text-[15px] font-semibold">{s.main}</span>{s.secondary && <span className="faint block truncate text-[12.5px]">{s.secondary}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
