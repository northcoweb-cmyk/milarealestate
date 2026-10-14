"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { useApp } from "@/components/app-context";
import { jfetch } from "@/components/ui";

type Summary = { code: string; link: string; earnedCredits: number; pendingCredits: number; monthlyReward: number; annualReward: number; friendBonus: number; holdDays: number; cap: number; haveReferrer: boolean; canEnterCode: boolean; referred: { name: string; state: string; at: string }[] };

const stateLabel = (s: string, sum: Summary) => s === "rewarded" ? ["Reward earned", "#15803d"] : s.startsWith("pending:") ? [`Subscribed · reward in ${s.split(":")[1]} day${s.split(":")[1] === "1" ? "" : "s"}`, "#b45309"] : s === "review" ? ["Under review", "#b45309"] : s === "void" ? ["Cancelled before the reward", "#b91c1c"] : ["Signed up · no plan yet", "var(--muted)"];

/** Refer a friend: link and code to copy, rules in plain words, enter a code, and track every invite. */
export function ReferralPanel() {
  const { toast, refresh } = useApp();
  const [s, setS] = useState<Summary | null>(null);
  const [copied, setCopied] = useState<"" | "link" | "code">("");
  const [entry, setEntry] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => jfetch<Summary>("/api/referral").then(setS).catch(() => toast("Couldn't load your invite link.", "error"));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return <p className="muted">Loading…</p>;
  const msg = `I use Mila, an AI operations manager for real estate agents. Try it free for 7 days: ${s.link}  (my code: ${s.code})`;
  async function copy(what: "link" | "code") { try { await navigator.clipboard.writeText(what === "link" ? s!.link : s!.code); setCopied(what); setTimeout(() => setCopied(""), 1800); } catch { toast("Press and hold to copy.", "info"); } }
  async function share() { try { if (navigator.share) await navigator.share({ title: "Mila", text: msg }); else { await navigator.clipboard.writeText(msg); setCopied("link"); setTimeout(() => setCopied(""), 1800); } } catch { /* closed the sheet */ } }
  async function apply() { setBusy(true); try { const r = await jfetch<{ ok: boolean; message: string }>("/api/referral/apply", { method: "POST", json: { code: entry } }); toast(r.message, r.ok ? "success" : "error"); if (r.ok) { setEntry(""); await load(); refresh(); } } catch (e) { toast(e instanceof Error ? e.message : "Couldn't add that code.", "error"); } finally { setBusy(false); } }
  return (
    <div className="space-y-5">
      <div className="space-y-4 p-6" style={{ borderRadius: 28, background: "linear-gradient(150deg, rgba(143,180,255,.28), rgba(166,140,255,.30) 55%, rgba(255,201,168,.34))", border: "1px solid var(--line)" }}>
        <p className="display text-[30px] leading-tight">Invite an agent. Earn credits.</p>
        <p className="text-[15px]">When someone signs up with your link or code and stays subscribed for {s.holdDays} days, you earn <b>{s.monthlyReward} credits</b> (<b>{s.annualReward}</b> if they pick the annual plan). They get <b>{s.friendBonus} bonus credits</b> and 7 free days.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0 rounded-2xl bg-white/70 px-4 py-3"><p className="faint text-[11.5px] font-bold uppercase tracking-wider">Your link</p><p className="truncate text-[14.5px] font-semibold">{s.link}</p></div>
          <button className="btn" onClick={() => copy("link")}>{copied === "link" ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy link</>}</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="rounded-2xl bg-white/70 px-4 py-3"><p className="faint text-[11.5px] font-bold uppercase tracking-wider">Your code</p><p className="text-[22px] font-bold tracking-[.22em]">{s.code}</p></div>
          <button className="btn" onClick={() => copy("code")}>{copied === "code" ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy code</>}</button>
        </div>
        <button className="btn btn-primary w-full" onClick={share}><Share2 size={16} /> Share with a friend</button>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="glass p-4" style={{ borderRadius: 22 }}><p className="display text-[30px]">{s.referred.length}</p><p className="faint text-[12.5px]">Joined</p></div>
        <div className="glass p-4" style={{ borderRadius: 22 }}><p className="display text-[30px]">{s.earnedCredits.toLocaleString()}</p><p className="faint text-[12.5px]">Credits earned</p></div>
        <div className="glass p-4" style={{ borderRadius: 22 }}><p className="display text-[30px]">{s.pendingCredits.toLocaleString()}</p><p className="faint text-[12.5px]">On the way</p></div>
      </div>

      <div className="glass p-5" style={{ borderRadius: 24 }}>
        <p className="mb-2 font-semibold">Your invites</p>
        {s.referred.length === 0 ? <p className="muted text-[14.5px]">No one yet. Share your link and they'll show up here.</p> : <ul className="divide-y" style={{ borderColor: "var(--line)" }}>{s.referred.map((r, i) => { const [t, c] = stateLabel(r.state, s); return <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-[14.5px]"><span>{r.name}</span><span className="text-[13px] font-semibold" style={{ color: c }}>{t}</span></li>; })}</ul>}
      </div>

      {s.canEnterCode && <div className="glass p-5" style={{ borderRadius: 24 }}>
        <p className="mb-1 font-semibold">Were you invited?</p>
        <p className="muted mb-3 text-[14px]">Enter a friend's code before you subscribe. You'll both get a bonus.</p>
        <div className="flex gap-2"><input className="field" value={entry} onChange={(e) => setEntry(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} placeholder="Their code" aria-label="Referral code" /><button className="btn" disabled={busy || entry.length < 6} onClick={apply}>{busy ? "Adding…" : "Add code"}</button></div>
      </div>}

      <div className="glass p-5" style={{ borderRadius: 24 }}>
        <p className="mb-2 font-semibold">How it works</p>
        <ul className="muted list-disc space-y-1.5 pl-5 text-[14px]">
          <li>Credits arrive {s.holdDays} days after your friend's first paid plan, as long as they're still subscribed.</li>
          <li>Free trials and 100% discount codes don't count. Only a real payment does.</li>
          <li>Your own accounts don't count, and neither do sign-ups from the same connection as yours (those go to a manual review).</li>
          <li>Up to {s.cap} rewarded friends, and up to 5 rewards in any 30 days.</li>
        </ul>
      </div>
    </div>
  );
}
