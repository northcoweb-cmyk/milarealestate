"use client";

import { MotionConfig, motion } from "motion/react";
import { useId } from "react";
import clsx from "clsx";

export interface FollowUpItem { id: string; label: string; disabled?: boolean }
interface FollowUpProps {
  items: FollowUpItem[];
  loading?: boolean;
  onSelect?: (item: FollowUpItem) => void;
  selectedId?: string;
  title?: string;
  className?: string;
}

const ease = [0.23, 1, 0.32, 1] as const;

/** Suggested next things to ask, shown under one of Mila's answers. Tapping one sends it. */
export function FollowUp({ items, loading = false, onSelect, selectedId, title = "Next", className }: FollowUpProps) {
  const titleId = useId();
  if (items.length === 0 && !loading) return null;
  return (
    <MotionConfig reducedMotion="user">
      <section aria-busy={loading} aria-labelledby={titleId} data-slot="follow-up" className={clsx("text-sm", className)}>
        <h3 id={titleId} className="kicker mb-2.5">{title}</h3>
        <ul className="flex flex-col items-start gap-2">
          {loading ? [56, 72, 44].map((w, i) => <li aria-hidden key={i}><span className="block h-9 animate-pulse rounded-full" style={{ width: `${w * 4}px`, background: "color-mix(in srgb, var(--ink) 8%, transparent)", animationDelay: `${i * 120}ms` }} /></li>)
            : items.map((item, index) => {
              const selected = item.id === selectedId, faded = selectedId !== undefined && !selected;
              return (
                <motion.li key={item.id} className="max-w-full" initial={{ opacity: 0, x: -6, filter: "blur(3px)" }} animate={{ opacity: faded ? 0.45 : 1, x: 0, filter: "blur(0px)" }} transition={{ delay: selectedId ? 0 : index * 0.07, duration: 0.3, ease }}>
                  <button type="button" disabled={item.disabled || faded} aria-pressed={selectedId !== undefined ? selected : undefined} onClick={() => onSelect?.(item)}
                    className={clsx("flex min-h-9 max-w-full items-center gap-2 rounded-full px-3.5 py-1.5 text-left text-[14.5px] font-medium leading-5 transition active:scale-[0.97] disabled:pointer-events-none", selected ? "text-[var(--accent-ink)]" : "hover:brightness-105")}
                    style={selected ? { background: "linear-gradient(135deg,var(--accent),var(--accent-2))" } : { background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--ink)" }}>
                    <svg aria-hidden className={clsx("size-4 shrink-0", selected && "hidden")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5v5a2 2 0 0 0 2 2h12m-5-5 5 5-5 5" /></svg>
                    <svg aria-hidden className={clsx("size-4 shrink-0", !selected && "hidden")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                    <span className="min-w-0 break-words">{item.label}</span>
                  </button>
                </motion.li>
              );
            })}
        </ul>
      </section>
    </MotionConfig>
  );
}

export default FollowUp;
