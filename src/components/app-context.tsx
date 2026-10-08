"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Profile } from "@/lib/types";

interface Me { profile: Profile; admin: boolean; tester?: boolean; credits: { balance: number; allowance: number; resetsAt: string; trial?: { endsAt: string; daysLeft: number; day: number; expired: boolean } | null }; capabilities: { ai: boolean; google: boolean } }
interface Ctx extends Me { refresh: () => Promise<void>; toast: (msg: string, tone?: "info" | "error" | "success") => void; setBalance: (n: number) => void }

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("useApp outside provider"); return c; };

interface Toast { id: number; msg: string; tone: "info" | "error" | "success" }

export function AppProvider({ initial, children }: { initial: Me; children: React.ReactNode }) {
  const [me, setMe] = useState<Me>(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/me", { cache: "no-store" });
    if (r.ok) setMe(await r.json());
  }, []);
  const toast = useCallback((msg: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const setBalance = useCallback((n: number) => setMe((m) => ({ ...m, credits: { ...m.credits, balance: n } })), []);

  // Deliver due reminders as browser notifications while the app is open.
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/reminders/due", { cache: "no-store" });
        if (!r.ok || stop) return;
        const { due } = (await r.json()) as { due: { title: string }[] };
        for (const d of due) {
          toast(`Reminder: ${d.title}`, "info");
          if ("Notification" in window && Notification.permission === "granted" && me.profile.settings.notifications.channels.browser) {
            try { new Notification("Mila", { body: d.title, icon: "/pwa-icon/192" }); } catch { /* some mobile browsers require a service worker */ }
          }
        }
      } catch { /* offline */ }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [toast, me.profile.settings.notifications.channels.browser]);

  const value = useMemo(() => ({ ...me, refresh, toast, setBalance }), [me, refresh, toast, setBalance]);
  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="glass-strong rise pointer-events-auto max-w-md px-4 py-3 text-[15px]" style={{ borderRadius: 18, color: t.tone === "error" ? "var(--danger)" : "var(--ink)" }}>{t.msg}</div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}
