"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect } from "react";
import clsx from "clsx";

export function Avatar({ name, color, size = 44 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(145deg, ${color ?? "#7C9CBF"}, color-mix(in srgb, ${color ?? "#7C9CBF"} 70%, #1b2a5a))`, boxShadow: "0 4px 12px -4px rgba(30,50,110,.4), inset 0 1px 0 rgba(255,255,255,.35)" }}>{initials}</span>
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
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-[#0b1030]/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className={clsx("glass-strong relative max-h-[92svh] w-full overflow-y-auto p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]", wide ? "sm:max-w-2xl" : "sm:max-w-lg", "rounded-b-none sm:rounded-b-[28px]")}
            style={{ borderRadius: 32 }} initial={{ y: 60, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="h2">{title}</h2>
              <button className="btn btn-quiet btn-sm !px-2" onClick={onClose} aria-label="Close"><X size={20} /></button>
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
    <header className="mb-6 flex items-end justify-between gap-4 pt-2">
      <div>
        <h1 className="h1">{title}</h1>
        {sub && <p className="muted mt-1.5">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className="relative h-8 w-[52px] shrink-0 rounded-full transition-colors" style={{ background: checked ? "linear-gradient(135deg,var(--accent),var(--accent-2))" : "color-mix(in srgb, var(--ink) 18%, transparent)" }}>
      <span className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all" style={{ left: checked ? 24 : 4 }} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full p-1" style={{ background: "color-mix(in srgb, var(--ink) 7%, transparent)" }}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className="rounded-full px-4 py-1.5 text-[14px] font-semibold transition" style={value === o.value ? { background: "var(--glass-strong)", boxShadow: "var(--shadow)", color: "var(--ink)" } : { color: "var(--ink-soft)" }}>{o.label}</button>
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
