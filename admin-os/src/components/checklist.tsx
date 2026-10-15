"use client";
import { useEffect, useState } from "react";

const ITEMS: [string, string][] = [
  ["stripe", "Stripe takes a real payment and a trial converts to paid"],
  ["iphone", "Sign-in, onboarding and the 5 trial tasks work on a real iPhone"],
  ["android", "Same on an Android phone and on desktop"],
  ["photos", "Street View photos load (Google Cloud billing upgraded)"],
  ["spend", "AI spend caps verified; daily cap and alerts set"],
  ["migrations", "All database migrations run (incl. 0005 waitlist)"],
  ["persist", "Data survives a deploy and a sign-out"],
  ["copy", "No vendor names or raw errors visible to users"],
  ["waitlist", "Waitlist signups land here and the welcome email sends"],
  ["legal", "Privacy policy and terms pages are live and reviewed"],
  ["testers", "5 to 10 test users have used it for a week and their fixes are in"],
  ["topups", "Every vendor account topped up (see Top-ups below)"],
  ["support", "support@milarealestate.app receives mail and I can answer it from Mila OS"],
  ["gcal", "Google Calendar connects on a fresh account and a test event lands in it"],
  ["trial", "A non-tester account at day 8 gets the popup and is view-only until it buys a plan"],
  ["freeze", "Feature freeze Oct 18: bug fixes only"],
];

export function Checklist() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setDone(JSON.parse(localStorage.getItem("mila-os-launch") ?? "{}")); } catch { /* ignore */ } }, []);
  const toggle = (k: string) => setDone((d) => { const n = { ...d, [k]: !d[k] }; try { localStorage.setItem("mila-os-launch", JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const n = ITEMS.filter(([k]) => done[k]).length;
  return (
    <div className="card">
      <p className="eyebrow" style={{ marginBottom: 6 }}>{n} of {ITEMS.length} done (saved in this browser)</p>
      {ITEMS.map(([k, label]) => <label key={k} className="check"><input type="checkbox" checked={!!done[k]} onChange={() => toggle(k)} /><span style={{ textDecoration: done[k] ? "line-through" : "none", color: done[k] ? "var(--faint)" : "var(--fg)" }}>{label}</span></label>)}
    </div>
  );
}
