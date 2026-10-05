"use client";

import Link from "next/link";
import { peekApi, putApi } from "./use-api";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { ChevronRight, Sparkles } from "lucide-react";
import { PromptInput } from "./ui/ai-chat-input";

import { useApp } from "./app-context";
import { InstallBanner } from "./install";
import { CheckDot, Skeleton, jfetch } from "./ui";
import { useMila } from "./mila-chat";
import type { Feed } from "@/lib/feed";

export interface HomeData { greeting: string; firstName: string; dateLine: string; feed: Feed | null; isDemo: boolean }

const SUGGESTIONS = [
  "I'm listing 123 Main Street next Thursday. Get me ready.",
  "I have an open house at 123 Main Street Sunday at 1 PM. Set everything up.",
  "Who do I need to follow up with today?",
  "What am I missing?",
  "I have a new buyer named Sarah looking for a 3 bedroom house around $650k in Montgomery County in the next 3 months.",
];
const SHORT = ["Get me ready to list", "Set up an open house", "Who should I follow up with?", "What am I missing?", "Add a new buyer"];

export function HomeClient({ data }: { data: HomeData }) {
  const { toast } = useApp();
  const { ask, open, hasHistory, turns } = useMila();
  // Read synchronously on the client (server snapshot = "seen"), so the how-it-works card is there on the first paint instead of popping in and shoving the page down.
  const helpSeen = useSyncExternalStore(subscribeHelp, readHelp, () => true);
  const dismissHelp = () => { try { localStorage.setItem("mila.help.seen", "1"); } catch { /* ignore */ } helpListeners.forEach((l) => l()); };

  return (
    <main className="xl:grid xl:grid-cols-[minmax(0,1fr)_410px] xl:gap-8 xl:pr-8">
      <section className="relative mx-auto flex w-full max-w-3xl flex-col px-4 pb-2 pt-[max(env(safe-area-inset-top),20px)] xl:sticky xl:top-0 xl:h-[100svh] xl:max-w-none xl:justify-center xl:px-6 xl:pb-16 xl:pt-0">
        <div className="flex flex-col items-center pt-6 text-center xl:pt-0">
          <p className="kicker mb-4">{data.dateLine}</p>
          <h1 className="display text-[clamp(38px,9vw,64px)]">{data.greeting}</h1>
          <div className="mt-6 w-full max-w-2xl"><PromptInput onSubmit={(t, f) => ask(t, f)} size="lg" placeholder="What do you need to get done?" onError={(m) => toast(m, "error")} /></div>
          <div className="no-scrollbar -mx-4 mt-4 flex max-w-[100vw] gap-2 overflow-x-auto px-4 pb-1">
            {SHORT.map((s, i) => <button key={s} className="chip" onClick={() => ask(SUGGESTIONS[i])}>{s}</button>)}
          </div>
          {hasHistory && <button className="chip mt-3" onClick={open}><Sparkles size={15} />Continue where we left off</button>}
          {helpSeen && <div className="mt-5 w-full max-w-xl"><InstallBanner /></div>}
        </div>
      </section>

      <aside id="today" className="mx-auto w-full max-w-3xl px-4 pb-[calc(var(--nav-h)+40px)] pt-7 xl:sticky xl:top-0 xl:h-[100svh] xl:max-w-none xl:overflow-y-auto xl:px-0 xl:pb-10 xl:pt-10 no-scrollbar">
        <TodayPanel data={data} refreshKey={turns} helpSeen={helpSeen} onHelpSeen={dismissHelp} />
      </aside>
    </main>
  );
}

const helpListeners = new Set<() => void>();
const subscribeHelp = (cb: () => void) => { helpListeners.add(cb); return () => { helpListeners.delete(cb); }; };
const readHelp = () => { try { return localStorage.getItem("mila.help.seen") === "1"; } catch { return false; } };

const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 2 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : "yesterday"; };

/** Muse-style feed: what needs you, today's plan, what Mila did, what's next — nothing else. */
function TodayPanel({ data, refreshKey, helpSeen, onHelpSeen }: { data: HomeData; refreshKey: number; helpSeen: boolean; onHelpSeen: () => void }) {
  const { toast } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [f, setF] = useState<Feed | null>(() => data.feed ?? peekApi<Feed>("/api/feed")); // last feed paints at once on return visits, then refreshes
  const [, tick] = useState(0);
  const refresh = useCallback(async () => {
    try { const r = await fetch("/api/feed", { cache: "no-store" }); if (r.ok) { const nf = (await r.json()).feed; putApi("/api/feed", nf); setF(nf); } } catch { /* offline: keep what we have */ }
  }, []);
  useEffect(() => { refresh(); }, [refreshKey, refresh]); // first load + after every Mila turn
  useEffect(() => {
    const vis = () => { if (document.visibilityState === "visible") refresh(); };
    const id = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 45_000);
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    document.addEventListener("visibilitychange", vis); window.addEventListener("focus", vis);
    return () => { clearInterval(id); clearInterval(t); document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", vis); };
  }, [refresh]);

  async function togglePlan(p: Feed["plan"][number]) {
    const next = !p.done;
    setF((x) => x && ({ ...x, plan: x.plan.map((i) => (i.id === p.id ? { ...i, done: next } : i)) })); // instant; the server records it
    try {
      if (next) await jfetch("/api/feed/complete", { method: "POST", json: { id: p.id, title: p.title, why: p.why } });
      else await jfetch(`/api/feed/complete?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    } catch (e) {
      setF((x) => x && ({ ...x, plan: x.plan.map((i) => (i.id === p.id ? { ...i, done: !next } : i)) }));
      toast(e instanceof Error ? e.message : "Couldn't save that.", "error");
    }
  }
  async function approve(id: string, itemId: string) {
    setBusyId(itemId);
    try { const r = await jfetch<{ message: string; ok: boolean }>(`/api/approvals/${id}`, { method: "POST", json: { decision: "approve" } }); toast(r.message, r.ok ? "success" : "info"); refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't approve that.", "error"); }
    finally { setBusyId(null); }
  }
  const Act = ({ a, primary, itemId }: { a: Feed["needsYou"][number]["primary"]; primary?: boolean; itemId: string }) =>
    a.approveId ? <button className={primary ? "btn btn-primary btn-sm" : "btn btn-quiet btn-sm"} disabled={busyId === itemId} onClick={() => approve(a.approveId!, itemId)}>{busyId === itemId ? "Working…" : a.label}</button>
      : <Link className={primary ? "btn btn-primary btn-sm" : "btn btn-quiet btn-sm"} href={a.href ?? "/tasks"}>{a.label}</Link>;
  if (!f) return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your day">
      <Skeleton className="h-6 w-2/3" /><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-24" />
    </div>
  );
  const doneCount = f.plan.filter((p) => p.done).length;
  return (
    <div className="space-y-9">
      {f.trial && (
        <section className="glass p-5" style={{ borderRadius: 24 }} aria-label="Your free trial">
          {f.trial.expired ? (
            <>
              <p className="text-[17px] font-semibold">Your 7-day trial has ended</p>
              <p className="muted mt-1 text-[14.5px]">Everything you built is saved. Pick a plan and Mila picks up where you left off.</p>
              <Link href="/settings/credits" className="btn btn-primary btn-sm mt-3">Choose a plan</Link>
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3"><p className="text-[17px] font-semibold">Your 7-day Mila trial</p><span className="faint text-[13px]">Day {f.trial.day} of 7 · {f.trial.daysLeft} {f.trial.daysLeft === 1 ? "day" : "days"} left</span></div>
              <p className="muted mt-0.5 text-[14px]">Try these five things and you'll see what she does. {f.trial.done} of {f.trial.total} done.</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 9%, transparent)" }}><div className="h-full rounded-full" style={{ width: `${(f.trial.done / f.trial.total) * 100}%`, background: "linear-gradient(90deg,var(--accent),var(--accent-2))" }} /></div>
              <ul className="mt-3 space-y-1">
                {f.trial.items.map((it) => (
                  <li key={it.id}>
                    {it.done
                      ? <p className="flex items-center gap-2.5 py-1.5 text-[15px] muted"><CheckDot done onClick={() => undefined} label={it.label} />{it.label}</p>
                      : <Link href={`/?ask=${encodeURIComponent(it.ask)}`} className="flex items-center gap-2.5 rounded-xl py-1.5 text-[15px] font-semibold"><span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)" }} aria-hidden /><span className="min-w-0 flex-1">{it.label}</span><ChevronRight size={16} className="faint" aria-hidden /></Link>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {!helpSeen && (
        <section className="glass p-5" style={{ borderRadius: 24 }} aria-label="How Mila works">
          <div className="flex items-start justify-between gap-3"><p className="text-[17px] font-semibold">New here? Three things to know</p><button className="btn btn-quiet btn-sm shrink-0 whitespace-nowrap !px-3" aria-label="Dismiss" onClick={onHelpSeen}>Got it</button></div>
          <ol className="mt-3 space-y-2.5 text-[15px] leading-snug">
            <li className="flex gap-3"><span aria-hidden>💬</span><span><b>Tell Mila what you need</b> in the box above — like “I have an open house Sunday at 1.”</span></li>
            <li className="flex gap-3"><span aria-hidden>✋</span><span><b>Mila never sends or deletes without your OK.</b> Anything waiting shows up under “Ready for approval”.</span></li>
            <li className="flex gap-3"><span aria-hidden>✅</span><span><b>Check things off</b> in “Today’s plan” and see everything you’ve finished under Completed.</span></li>
          </ol>
        </section>
      )}

      <div>
        <p className="text-[19px] leading-snug text-ink-soft">{f.summary}</p>
        <p className="faint mt-1.5 text-[12px]">Updated {ago(f.updatedAt)}</p>
      </div>

      {f.needsYou.length > 0 && (
        <section aria-labelledby="needs-you">
          <h2 id="needs-you" className="kicker mb-3">Ready for approval</h2>
          <ul className="space-y-3">
            {f.needsYou.map((n) => (
              <li key={n.id} className="glass p-4" style={{ borderRadius: 24 }}>
                <div className="flex items-start gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[22px]" style={{ background: "color-mix(in srgb, var(--ink) 8%, transparent)" }} aria-hidden>{n.emoji}</span>
                  <div className="min-w-0 flex-1">
                    {n.label && <p className="faint mb-0.5 text-[11.5px] font-bold uppercase tracking-[.12em]">{n.label}</p>}
                    <p className="text-[16.5px] font-semibold leading-snug">{n.title}{n.tone === "urgent" && <span className="ml-2 align-middle text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--danger)" }}>Urgent</span>}</p>
                    {n.why && <p className="muted mt-0.5 text-[14px] leading-snug">{n.why}</p>}
                    <div className="mt-3 flex items-center gap-2"><Act a={n.primary} primary itemId={n.id} />{n.secondary && <Act a={n.secondary} itemId={n.id + "-s"} />}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {f.needsTotal > f.needsYou.length && <Link href="/tasks" className="mt-3 inline-block px-1 text-[14.5px] font-semibold text-accent">See all {f.needsTotal}</Link>}
        </section>
      )}

      {f.plan.length > 0 && (
        <section aria-labelledby="todays-plan">
          <div className="mb-3 flex items-baseline justify-between"><h2 id="todays-plan" className="kicker">Today&apos;s plan{f.plan.length > 0 ? ` · ${doneCount}/${f.plan.length}` : ""}</h2><Link href="/done" className="text-[13.5px] font-semibold text-accent">Completed</Link></div>
          <ul className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)", borderRadius: 24 }}>
            {f.plan.map((p) => (
              <motion.li key={p.id} layout="position" className="flex items-start gap-3.5 px-4 py-3.5">
                <CheckDot done={p.done} onClick={() => togglePlan(p)} label={p.done ? `Mark “${p.title}” not done` : `Mark “${p.title}” done`} />
                <motion.div className="min-w-0 flex-1" animate={{ opacity: p.done ? 0.5 : 1 }}>
                  <p className="text-[16px] font-semibold leading-snug"><span aria-hidden>{p.emoji} </span><span className="relative inline">{p.title}{p.done && <motion.span className="absolute left-0 right-0 top-1/2 h-[2px] origin-left" style={{ background: "var(--ink)" }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.25 }} />}</span></p>
                  <p className="muted text-[13.5px] leading-snug">{p.why}</p>
                </motion.div>
                {!p.done && <Link href={p.action.href ?? "/"} className="btn btn-quiet btn-sm shrink-0">{p.action.label}</Link>}
              </motion.li>
            ))}
          </ul>
        </section>
      )}

      {f.did.length > 0 && (
        <section aria-labelledby="mila-did">
          <div className="mb-3 flex items-baseline justify-between"><h2 id="mila-did" className="kicker">Mila did</h2><Link href="/done" className="text-[13.5px] font-semibold text-accent">All completed</Link></div>
          <ul className="space-y-3.5">
            {f.did.map((d) => (
              <li key={d.id} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[16px]" style={{ background: "color-mix(in srgb, var(--ok) 16%, transparent)" }} aria-hidden>{d.emoji}</span>
                <div className="min-w-0 flex-1"><p className="text-[15.5px] leading-snug">{d.href ? <Link href={d.href}>{d.text}</Link> : d.text}</p><p className="faint text-[12.5px]">✓ {ago(d.at)}</p></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {f.next.length > 0 && (
        <section aria-labelledby="coming-up">
          <div className="mb-3 flex items-baseline justify-between"><h2 id="coming-up" className="kicker">Coming up</h2><Link href="/calendar" className="text-[13.5px] font-semibold text-accent">Calendar</Link></div>
          <ul className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)", borderRadius: 24 }}>
            {f.next.map((e) => (
              <li key={e.id}><Link href={e.href} className="flex items-center gap-3.5 px-4 py-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[22px]" style={{ background: "color-mix(in srgb, var(--ink) 8%, transparent)" }} aria-hidden>{e.emoji}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-[15.5px] font-semibold leading-tight">{e.title}</p><p className="faint truncate text-[13.5px]">{e.day} · {e.time}{e.place ? ` · ${e.place}` : ""}</p></div>
                <ChevronRight size={18} className="shrink-0 text-ink-faint" aria-hidden />
              </Link></li>
            ))}
          </ul>
        </section>
      )}
      {data.isDemo && <p className="faint px-1 text-[12.5px]">You&apos;re viewing fictional demo data.</p>}
    </div>
  );
}
