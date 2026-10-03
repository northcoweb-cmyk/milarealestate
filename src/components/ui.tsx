"use client";

import { pinTo, useVisualViewport } from "./use-visual-viewport";
import { useScrollLock } from "./use-scroll-lock";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect } from "react";
import clsx from "clsx";

const AV_TONES = ["#0b0b0c", "#232326", "#3b3b40", "#5a5a60", "#8a8a90", "#b8b8bd", "#e4e4e7", "#f7f7f8"];
function hash(str: string) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Unique, deterministic filler portrait: a bold geometric pattern in the app's black/white palette, different per person. */
export function Avatar({ name, size = 44, seed, ring, src }: { name: string; color?: string; size?: number; seed?: string; ring?: string; src?: string | null }) {
  if (src) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size, boxShadow: ring ? `0 0 0 2.5px ${ring}` : "0 4px 12px -4px rgba(0,0,0,.4)", margin: ring ? 3 : 0 }} />
  );
  const h = hash(seed ?? name);
  const pick = (n: number, k: number) => AV_TONES[(h >> (k * 3)) % n];
  const dark = h % 2 === 0;
  const bg = dark ? AV_TONES[(h >>> 3) % 3] : AV_TONES[5 + ((h >>> 3) % 3)];
  const a = dark ? AV_TONES[3 + ((h >>> 6) % 3)] : AV_TONES[1 + ((h >>> 6) % 3)];
  const b = dark ? AV_TONES[5 + ((h >>> 9) % 3)] : AV_TONES[0 + ((h >>> 9) % 2)];
  void pick;
  const pattern = (h >>> 12) % 8;
  const r = (h >>> 16) % 4; // rotation quarter
  const shapes = [
    <g key="0"><circle cx="20" cy="20" r="15" fill={a} /><circle cx="20" cy="20" r="8" fill={b} /></g>,
    <g key="1"><rect width="20" height="40" fill={a} /><circle cx="20" cy="20" r="10" fill={b} /></g>,
    <g key="2"><path d="M0 40 L40 0 L40 40Z" fill={a} /><circle cx="12" cy="12" r="6" fill={b} /></g>,
    <g key="3">{[0, 1, 2, 3].map((i) => <rect key={i} x={i * 10} y="0" width="5" height="40" fill={i % 2 ? a : b} />)}</g>,
    <g key="4"><path d="M0 0 H40 V20 A20 20 0 0 1 0 20Z" fill={a} /><circle cx="20" cy="30" r="6" fill={b} /></g>,
    <g key="5">{[0, 1, 2].flatMap((x) => [0, 1, 2].map((y) => <circle key={`${x}${y}`} cx={8 + x * 12} cy={8 + y * 12} r={(x + y) % 2 ? 3 : 5} fill={(x + y) % 2 ? a : b} />))}</g>,
    <g key="6"><rect x="6" y="6" width="28" height="28" rx="4" transform="rotate(45 20 20)" fill={a} /><circle cx="20" cy="20" r="6" fill={b} /></g>,
    <g key="7"><path d="M0 40 A40 40 0 0 1 40 0 V40Z" fill={a} /><path d="M0 40 A20 20 0 0 1 20 20 V40Z" fill={b} /></g>,
  ];
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const light = !dark;
  return (
    <span className="relative inline-flex shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size, boxShadow: ring ? `0 0 0 2.5px ${ring}, 0 4px 12px -4px rgba(0,0,0,.4)` : "0 4px 12px -4px rgba(0,0,0,.4), inset 0 0 0 1px rgba(255,255,255,.18)", margin: ring ? 3 : 0 }} aria-label={name} role="img">
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden><rect width="40" height="40" fill={bg} /><g transform={`rotate(${r * 90} 20 20)`}>{shapes[pattern]}</g></svg>
      <span className="absolute inset-0 flex items-center justify-center"><span className="flex items-center justify-center rounded-full font-bold" style={{ width: size * 0.62, height: size * 0.62, fontSize: size * 0.27, color: light ? "#fff" : "#0b0b0c", background: light ? "rgba(10,10,10,.82)" : "rgba(255,255,255,.88)", letterSpacing: ".02em" }}>{initials}</span></span>
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" | "accent" }) {
  const c = { neutral: "var(--ink-soft)", ok: "var(--ok)", warn: "var(--warn)", danger: "var(--danger)", accent: "var(--accent)" }[tone];
  return <span className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[12px] font-semibold" style={{ color: c, background: `color-mix(in srgb, ${c} 13%, transparent)` }}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("shimmer rounded-2xl", className)} style={{ background: "color-mix(in srgb, var(--ink) 5%, transparent)" }} />;
}

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; wide?: boolean }) {
  const vvBox = useVisualViewport(open);
  useScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" style={pinTo(vvBox)} role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 touch-none bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className={clsx("surface relative max-h-[min(92svh,100%)] w-full touch-pan-y overflow-y-auto overscroll-contain p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]", wide ? "sm:max-w-2xl" : "sm:max-w-lg", "rounded-b-none sm:rounded-b-[28px]")}
            style={{ borderRadius: 32 }} initial={{ y: 60, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="h2">{title}</h2>
              <button className="btn btn-quiet btn-sm !min-w-[44px] !px-2" onClick={onClose} aria-label="Close"><X size={20} /></button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Confirm({ open, title, body, confirmLabel = "Confirm", danger, onConfirm, onClose, busy }: { open: boolean; title: string; body?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {body && <p className="muted mb-6 whitespace-pre-line">{body}</p>}
      <div className="flex gap-3">
        <button className="btn flex-1" onClick={onClose}>Cancel</button>
        <button className={clsx("btn flex-1", danger ? "btn-danger" : "btn-primary")} disabled={busy} onClick={onConfirm}>{busy ? "Working…" : confirmLabel}</button>
      </div>
    </Sheet>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="glass flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 h-14 w-14 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #fff, var(--accent) 120%)", opacity: 0.55 }} />
      <p className="h2 mb-1">{title}</p>
      {body && <p className="muted mb-5 max-w-sm">{body}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-2">
      <div className="min-w-0 flex-1 basis-[13rem]">
        <h1 className="h1">{title}</h1>
        {sub && <p className="muted mt-1.5">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className="relative h-8 w-[52px] shrink-0 rounded-full transition-colors before:absolute before:-inset-2 before:content-['']" style={{ background: checked ? "linear-gradient(135deg,var(--accent),var(--accent-2))" : "color-mix(in srgb, var(--ink) 18%, transparent)" }}>
      <span className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all" style={{ left: checked ? 24 : 4 }} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full p-1" style={{ background: "color-mix(in srgb, var(--ink) 7%, transparent)" }}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className="rounded-full px-4 py-1.5 text-[14px] font-semibold transition pointer-coarse:min-h-11" style={value === o.value ? { background: "var(--glass-strong)", boxShadow: "var(--shadow)", color: "var(--ink)" } : { color: "var(--ink-soft)" }}>{o.label}</button>
      ))}
    </div>
  );
}

export async function jfetch<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T & { error?: string }> {
  const r = await fetch(url, { ...init, headers: { ...(init?.json ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) }, body: init?.json ? JSON.stringify(init.json) : init?.body });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error ?? "Something went wrong."), { status: r.status, data });
  return data;
}

/** Coloured label for what kind of contact someone is (buyer, seller, …). */
export function TypeBadge({ type, label, emoji }: { type: string; label: string; emoji?: string }) {
  void type; // black/white palette: the label carries the meaning, not a hue
  return <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-[3px] text-[12.5px] font-bold" style={{ color: "var(--ink)", background: "color-mix(in srgb, var(--ink) 8%, transparent)", border: "1px solid var(--line)" }}>{emoji && <span aria-hidden>{emoji}</span>}{label}</span>;
}

/** Round check that draws itself when completed. */
export function CheckDot({ done, onClick, label }: { done: boolean; onClick: () => void; label: string }) {
  return (
    <motion.button onClick={onClick} aria-label={label} aria-pressed={done} whileTap={{ scale: 0.88 }} className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ border: "2px solid " + (done ? "var(--ok)" : "color-mix(in srgb, var(--ink) 35%, transparent)") }}>
      <motion.span className="absolute inset-0 rounded-full" initial={false} animate={{ scale: done ? 1 : 0.4, opacity: done ? 1 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 26 }} style={{ background: "var(--ok)" }} />
      <svg viewBox="0 0 24 24" width="16" height="16" className="relative" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={false} animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }} transition={{ duration: 0.28, ease: "easeOut", delay: done ? 0.08 : 0 }} />
      </svg>
    </motion.button>
  );
}

