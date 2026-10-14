"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { useApp } from "@/components/app-context";
import { jfetch } from "@/components/ui";

type Summary = { code: string; link: string; earnedCredits: number; perReferral: number; friendBonus: number; cap: number; referred: { name: string; status: string; at: string }[] };

/** Refer a friend: their link, how it works, who joined, and what they've earned. */
export function ReferralPanel() {
  const { toast } = useApp();
  const [s, setS] = useState<Summary | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { jfetch<Summary>("/api/referral").then(setS).catch(() => toast("Couldn't load your invite link.", "error")); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return <p className="muted">Loading…</p>;
  const msg = `I use Mila, an AI operations manager for real estate agents. Try it free for 7 days: ${s.link}`;
  async function copy() { try { await navigator.clipboard.writeText(s!.link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { toast("Press and hold the link to copy it.", "info"); } }
  async function share() { try { if (navigator.share) await navigator.share({ title: "Mila", text: msg }); else await copy(); } catch { /* closed the sheet */ } }
  return (
    <div className="space-y-5">
      <div className="glass-strong space-y-4 p-6" style={{ borderRadius: 26 }}>
        <p className="text-[22px] font-semibold">Give a friend 7 free days. Get {s.perReferral} credits when they subscribe.</p>
        <p className="muted text-[14.5px]">When someone signs up with your link and starts a paid plan, you get <b>{s.perReferral} credits</b> and they get <b>{s.friendBonus} bonus credits</b>. It works for up to {s.cap} friends.</p>
        <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={{ background: "color-mix(in srgb, var(--accent) 9%, transparent)" }}><span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{s.link}</span></div>
        <div className="flex flex-wrap gap-2"><button className="btn btn-primary" onClick={share}><Share2 size={16} /> Share</button><button className="btn" onClick={copy}>{copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy link</>}</button></div>
        <p className="faint text-[12.5px]">Your code: <b>{s.code}</b>. Credits are added once their first paid plan goes through. Free trials and 100% discounts don't count.</p>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="glass p-4" style={{ borderRadius: 22 }}><p className="display text-[30px]">{s.referred.length}</p><p className="faint text-[12.5px]">Joined</p></div>
        <div className="glass p-4" style={{ borderRadius: 22 }}><p className="display text-[30px]">{s.referred.filter((r) => r.status === "paid").length}</p><p className="faint text-[12.5px]">Subscribed</p></div>
        <div className="glass p-4" style={{ borderRadius: 22 }}><p className="display text-[30px]">{s.earnedCredits.toLocaleString()}</p><p className="faint text-[12.5px]">Credits earned</p></div>
      </div>
      {s.referred.length > 0 && <div className="glass p-5" style={{ borderRadius: 24 }}><p className="mb-2 font-semibold">Your invites</p><ul className="divide-y" style={{ borderColor: "var(--line)" }}>{s.referred.map((r, i) => <li key={i} className="flex items-center justify-between py-2.5 text-[14.5px]"><span>{r.name}</span><span className="faint text-[13px]">{r.status === "paid" ? `Subscribed · +${s.perReferral} credits` : "Signed up"}</span></li>)}</ul></div>}
    </div>
  );
}
