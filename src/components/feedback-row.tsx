"use client";
import { useState } from "react";
import { jfetch } from "@/components/ui";
import { useApp } from "@/components/app-context";

type Kind = "useful" | "missing" | "wrong";
const OPTIONS: { kind: Kind; label: string }[] = [{ kind: "useful", label: "Useful" }, { kind: "missing", label: "Missing something" }, { kind: "wrong", label: "Wrong" }];

/** A quiet one-tap rating under something Mila produced. "Missing" and "wrong" ask for an optional note. */
export function FeedbackRow({ target = "chat", targetId, snippet }: { target?: string; targetId?: string; snippet?: string }) {
  const { tester } = useApp();
  const [picked, setPicked] = useState<Kind | null>(null);
  const [note, setNote] = useState(""); const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState(false);

  async function send(kind: Kind, withNote = "") {
    setBusy(true); setErr(false);
    try { await jfetch("/api/feedback", { method: "POST", json: { kind, target, targetId, snippet, note: withNote, page: typeof window === "undefined" ? undefined : window.location.pathname } }); setSent(true); }
    catch { setErr(true); }
    finally { setBusy(false); }
  }
  function pick(kind: Kind) { setPicked(kind); if (kind === "useful") void send(kind); }

  if (sent) return <p className="faint text-[13px]" role="status">Thanks, that helps me get better.</p>;
  return (
    <div className="space-y-2" data-feedback>
      {picked === null || picked === "useful" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="faint mr-1 text-[13px]">How was this?</span>
          {OPTIONS.map((o) => <button key={o.kind} type="button" disabled={busy} onClick={() => pick(o.kind)} className="chip !min-h-[30px] !px-3 text-[13px]">{o.label}</button>)}
          {tester && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("mila:bug", { detail: { snippet, targetId } }))} className="chip !min-h-[30px] !px-3 text-[13px]">🐞 Flag a bug</button>}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="faint text-[13px]" htmlFor="fb-note">{picked === "wrong" ? "What was wrong?" : "What was missing?"} (optional)</label>
          <textarea id="fb-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={2} className="field w-full text-[15px]" placeholder="A few words is plenty" />
          <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => send(picked, note)} className="btn btn-primary btn-sm">Send</button><button type="button" disabled={busy} onClick={() => setPicked(null)} className="btn btn-quiet btn-sm">Cancel</button></div>
        </div>
      )}
      {err && <p role="alert" className="text-[13px]" style={{ color: "var(--danger)" }}>Couldn&apos;t send that. Try again.</p>}
    </div>
  );
}
