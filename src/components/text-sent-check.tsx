"use client";
import { useCallback, useEffect, useState } from "react";
import { jfetch } from "@/components/ui";

/** After the agent taps "Open in Messages" and comes back: "Message sent?" so the contact's history is true, not guessed. */
export function TextSentCheck() {
  const [name, setName] = useState<string | null>(null);
  const check = useCallback(async () => {
    let flagged = false;
    try { flagged = !!sessionStorage.getItem("mila_sms"); } catch { /* ignore */ }
    if (!flagged) return;
    try { const r = await jfetch<{ pending: { name: string } | null }>("/api/text-check"); setName(r.pending?.name ?? null); if (!r.pending) sessionStorage.removeItem("mila_sms"); } catch { /* quiet */ }
  }, []);
  useEffect(() => {
    void check();
    const h = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [check]);
  if (!name) return null;
  async function answer(sent: boolean) { setName(null); try { sessionStorage.removeItem("mila_sms"); await jfetch("/api/text-check", { method: "POST", json: { sent } }); } catch { /* quiet */ } }
  return (
    <div role="status" className="fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-3xl p-3.5 shadow-lg" style={{ background: "var(--surface-strong, #fff)", color: "var(--ink, #14122b)", top: "calc(env(safe-area-inset-top) + 12px)" }}>
      <p className="min-w-0 flex-1 text-[15px] font-semibold">💬 Did you send your text to {name.split(" ")[0]}?</p>
      <button className="btn btn-primary btn-sm" onClick={() => answer(true)}>Yes, sent</button>
      <button className="btn btn-sm" onClick={() => answer(false)}>Not yet</button>
    </div>
  );
}
