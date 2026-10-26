"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SubmitForm({ token, replace, label = "Send this video" }: { token: string; replace?: string; label?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await fetch("/api/creators/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, url, replace }) });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) setErr(d.error ?? "Something went wrong."); else { setUrl(""); router.refresh(); }
    } catch { setErr("Network error. Try again."); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={go} className="flex flex-col gap-2 sm:flex-row">
      <input value={url} onChange={(e) => setUrl(e.target.value)} required inputMode="url" placeholder="Paste the link to your posted video" className="min-h-[48px] min-w-0 flex-1 rounded-2xl border border-border bg-white px-4 text-[16px]" />
      <button disabled={busy} className="min-h-[48px] rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Sending…" : label}</button>
      {err && <p role="alert" className="text-[14px] text-red-600 sm:basis-full">{err}</p>}
    </form>
  );
}
