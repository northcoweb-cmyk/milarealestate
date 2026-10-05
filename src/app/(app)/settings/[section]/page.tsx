"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import type { AutonomyKey, ExperienceLevel, BusinessType } from "@/lib/types";
import { Avatar, Segmented, Sheet, Skeleton, Toggle, jfetch, Pill } from "@/components/ui";
import { buildSignature, emptyBrand } from "@/lib/signature";
import { squarePhoto, uploadMedia } from "@/lib/media-upload";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";
import { PlaceInput, type PickedPlace } from "@/components/place-input";

const TITLES: Record<string, string> = { profile: "Profile", business: "Business", connections: "Calendar & contacts", mila: "Mila", notifications: "Notifications", credits: "Credits & billing", appearance: "Appearance", privacy: "Privacy", security: "Security" };

export default function SettingsPage() { return <Suspense><Inner /></Suspense>; }

function Inner() {
  const { section } = useParams<{ section: string }>();
  if (!TITLES[section]) return <Page><p className="muted">That setting doesn't exist.</p><Link href="/more" className="btn mt-4">Back</Link></Page>;
  return (
    <Page>
      <Link href="/more" className="btn btn-quiet btn-sm mb-3 !pl-2"><ArrowLeft size={18} />More</Link>
      <h1 className="h1 mb-6">{TITLES[section]}</h1>
      {section === "profile" && <Profile />}
      {section === "business" && <Business />}
      {section === "connections" && <Connections />}
      {section === "mila" && <Autonomy />}
      {section === "notifications" && <Notifications />}
      {section === "credits" && <Credits />}
      {section === "appearance" && <Appearance />}
      {section === "privacy" && <Privacy />}
      {section === "security" && <Security />}
    </Page>
  );
}

function useSave() {
  const { refresh, toast } = useApp();
  return async (body: Record<string, unknown>) => { try { await jfetch("/api/me", { method: "PATCH", json: body }); await refresh(); toast("Saved.", "success"); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save.", "error"); } };
}

function Card({ children, title, sub }: { children: React.ReactNode; title?: string; sub?: string }) {
  return <section className="glass mb-5 p-5 sm:p-6">{title && <p className="h2 mb-0.5">{title}</p>}{sub && <p className="muted mb-4 text-[14.5px]">{sub}</p>}{children}</section>;
}

function Profile() {
  const { profile } = useApp(); const save = useSave();
  const [f, setF] = useState({ full_name: profile.full_name, role: profile.role, brokerage: profile.brokerage ?? "", location: profile.location, primary_market: profile.primary_market, experience: profile.experience as ExperienceLevel, business_type: profile.business_type as BusinessType });
  const [pick, setPick] = useState<PickedPlace | null>(null); const [pickText, setPickText] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); const ok = !!pick && f.location === pickText; save({ ...f, brokerage: f.brokerage || null, ...(ok && pick?.lat != null && pick.lng != null && profile.lat == null ? { lat: pick.lat, lng: pick.lng } : {}), ...(ok && pick?.timezone ? { timezone: pick.timezone } : {}) }); }}>
      <PublicIdentity />
      <Card>
        <div className="space-y-4">
          <div><label className="lbl">Name</label><input className="field" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><label className="lbl">Role</label><select className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{["Agent", "Broker", "Team lead", "Assistant"].map((r) => <option key={r}>{r}</option>)}</select></div><div><label className="lbl">Brokerage</label><input className="field" value={f.brokerage} onChange={(e) => setF({ ...f, brokerage: e.target.value })} /></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><label className="lbl">City & state</label><PlaceInput mode="city" value={f.location} onChange={(v) => setF({ ...f, location: v })} onPick={(pl) => { setPick(pl); setPickText(pl.cityState ?? ""); }} verified={!!pick && f.location === pickText} placeholder="Start typing your city…" /></div><div><label className="lbl">Primary market</label><input className="field" value={f.primary_market} onChange={(e) => setF({ ...f, primary_market: e.target.value })} /></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><label className="lbl">Experience</label><select className="field" value={f.experience} onChange={(e) => setF({ ...f, experience: e.target.value as ExperienceLevel })}><option value="new">New agent</option><option value="growing">Growing agent</option><option value="experienced">Experienced agent</option><option value="team">Team / broker</option></select></div><div><label className="lbl">Focus</label><select className="field" value={f.business_type} onChange={(e) => setF({ ...f, business_type: e.target.value as BusinessType })}>{["buyer", "seller", "rental", "commercial", "investor", "mixed"].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select></div></div>
        </div>
        <button className="btn btn-primary mt-5">Save</button>
      </Card>
      <p className="faint px-2 text-[13px]">Email: {profile.email} · Time zone: {profile.timezone}</p>
    </form>
  );
}

/** Photo + the signature that ends every social caption. */
function PublicIdentity() {
  const { profile, toast } = useApp(); const save = useSave();
  const [b, setB] = useState({ ...emptyBrand(), ...(profile.settings.brand ?? {}) });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof b, v: string) => setB((x) => ({ ...x, [k]: v }));
  const preview = buildSignature({ full_name: profile.full_name, brokerage: profile.brokerage, settings: { ...profile.settings, brand: b } });
  const fileRef = useRef<HTMLInputElement>(null);
  async function upload(files: FileList | null) {
    const file = files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const sq = await squarePhoto(file);
      const m = await uploadMedia(sq, {});
      const old = b.pfp;
      setB((x) => ({ ...x, pfp: m.id }));
      await save({ settings: { brand: { ...b, pfp: m.id } } });
      if (old) fetch(`/api/media/${old}`, { method: "DELETE" }).catch(() => undefined);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't use that photo.", "error"); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function removePhoto() { const old = b.pfp; setB((x) => ({ ...x, pfp: null })); await save({ settings: { brand: { ...b, pfp: null } } }); if (old) fetch(`/api/media/${old}`, { method: "DELETE" }).catch(() => undefined); }
  return (
    <Card title="Your public signature" sub="Added to the end of every social caption so people know you're a licensed agent. Many states require your license info and brokerage in advertising — check yours.">
      <div className="mb-5 flex items-center gap-4">
        <Avatar name={profile.full_name} size={72} src={b.pfp ? `/api/files/${b.pfp}` : null} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Uploading…" : b.pfp ? "Change photo" : "Add profile photo"}</button>
          {b.pfp && <button type="button" className="btn btn-quiet btn-sm" onClick={removePhoto}>Remove</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files)} />
      </div>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="lbl">License / credentials</label><input className="field" value={b.credentials} onChange={(e) => set("credentials", e.target.value)} placeholder="MD Realtor®" /></div>
          <div><label className="lbl">License # <span className="faint">(optional)</span></label><input className="field" value={b.license} onChange={(e) => set("license", e.target.value)} placeholder="Required in some states" /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="lbl">Cell</label><input className="field" inputMode="tel" value={b.cell} onChange={(e) => set("cell", e.target.value)} placeholder="301.509.7280" /></div>
          <div><label className="lbl">Office <span className="faint">(optional)</span></label><input className="field" inputMode="tel" value={b.office} onChange={(e) => set("office", e.target.value)} placeholder="202.243.7700" /></div>
        </div>
        <div><label className="lbl">Public email</label><input className="field" type="email" value={b.email} onChange={(e) => set("email", e.target.value)} placeholder="you@yourteam.com" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="lbl">Team / group <span className="faint">(optional)</span></label><input className="field" value={b.team} onChange={(e) => set("team", e.target.value)} placeholder="Coalition Properties Group" /></div>
          <div><label className="lbl">Brokerage</label><p className="field flex items-center !bg-transparent text-ink-soft">{profile.brokerage || "Add it in your profile above"}</p></div>
        </div>
      </div>
      <p className="kicker mb-1.5 mt-5">Preview — ends every caption</p>
      <p className="rounded-2xl p-3.5 text-[14.5px] leading-snug" style={{ background: "color-mix(in srgb, var(--ink) 6%, transparent)" }}>{preview}</p>
      <button type="button" className="btn btn-primary mt-4" onClick={() => save({ settings: { brand: b } })}>Save signature</button>
    </Card>
  );
}

function Business() {
  const { toast } = useApp();
  const { data, loading } = useApi<{ business: { name: string; license_state: string | null; signature: string | null; service_areas: string[] } | null }>("/api/business");
  const [f, setF] = useState({ name: "", license_state: "", signature: "", areas: "" });
  useEffect(() => { if (data) setF({ name: data.business?.name ?? "", license_state: data.business?.license_state ?? "", signature: data.business?.signature ?? "", areas: (data.business?.service_areas ?? []).join(", ") }); }, [data]);
  if (loading) return <Skeleton className="h-64" />;
  return (
    <form onSubmit={async (e) => { e.preventDefault(); try { await jfetch("/api/business", { method: "PUT", json: { name: f.name, license_state: f.license_state, signature: f.signature, service_areas: f.areas.split(",").map((s) => s.trim()).filter(Boolean) } }); toast("Saved.", "success"); } catch (er) { toast(er instanceof Error ? er.message : "Couldn't save.", "error"); } }}>
      <Card sub="Used in drafts and for local context.">
        <div className="space-y-4">
          <div><label className="lbl">Business or team name</label><input className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]"><div><label className="lbl">License state</label><input className="field" maxLength={2} value={f.license_state} onChange={(e) => setF({ ...f, license_state: e.target.value })} placeholder="MD" /></div><div><label className="lbl">Service areas</label><input className="field" value={f.areas} onChange={(e) => setF({ ...f, areas: e.target.value })} placeholder="Gaithersburg, Rockville, Germantown" /></div></div>
          <div><label className="lbl">Email signature</label><textarea className="field min-h-[110px]" value={f.signature} onChange={(e) => setF({ ...f, signature: e.target.value })} /></div>
        </div>
        <button className="btn btn-primary mt-5">Save</button>
      </Card>
      <p className="faint px-2 text-[13px]">Real-estate rules vary by state. Mila won't present legal, tax or compliance guidance as certain — always confirm with your broker or state authority.</p>
    </form>
  );
}

interface Integration { id: string; name: string; description: string; status: string; detail?: string; services?: string[] }
function Connections() {
  const { data, loading, reload } = useApi<{ items: Integration[]; googleConfigured: boolean; googleAccount: string | null }>("/api/integrations");
  const params = useSearchParams(); const { toast } = useApp(); const [busy, setBusy] = useState(false);
  useEffect(() => { const e = params.get("error"), c = params.get("connected"); if (c) toast("Connected.", "success"); if (e) toast({ denied: "Access wasn't granted.", state: "That sign-in expired. Try again.", exchange: "That didn't work. Try again.", not_configured: "This isn't available right now." }[e] ?? "Couldn't connect.", "error"); }, [params, toast]);
  const connected = data?.items.some((i) => i.status === "connected" && i.id.startsWith("google"));
  const label = (s: string) => ({ connected: ["Connected", "ok"], not_configured: ["Needs setup", "warn"], disconnected: ["Not connected", "neutral"], error: ["Needs attention", "danger"], coming_soon: ["Coming soon", "neutral"] }[s] as [string, any]);
  if (loading) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-3">
      <p className="muted px-1 pb-1 text-[14.5px]">Keep your calendar in step with Mila and bring in people you already know.</p>
      {data!.items.filter((i) => ["google_calendar", "google_contacts", "google_sheets"].includes(i.id) && i.status !== "not_configured").map((i) => { const [t, tone] = label(i.status); return (
        <div key={i.id} className="glass flex items-center gap-4 p-4 sm:p-5" style={{ borderRadius: 24 }}>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{({ google_calendar: "Calendar sync", google_contacts: "Contacts", google_sheets: "Spreadsheets" } as Record<string, string>)[i.id] ?? i.name}</p><Pill tone={tone}>{t}</Pill></div><p className="muted text-[14px]">{i.description}</p></div>
          {i.id.startsWith("google") && i.status !== "not_configured" && (i.status === "connected" ? null : <a className="btn btn-primary btn-sm" href={`/api/integrations/google/start?services=${i.services?.join(",")}`}>{i.status === "error" ? "Reconnect" : "Connect"}</a>)}
        </div>); })}
      {connected && <button className="btn btn-sm mt-2" disabled={busy} onClick={async () => { setBusy(true); await jfetch("/api/integrations/google/disconnect", { method: "POST" }); await reload(); setBusy(false); toast("Disconnected.", "success"); }}>Disconnect</button>}
      <p className="faint px-2 pt-2 text-[13px]">You can disconnect any time.</p>
    </div>
  );
}

const AUTONOMY: { key: AutonomyKey; title: string; sub: string }[] = [
  { key: "contacts", title: "Contacts", sub: "Creating and updating people" },
  { key: "calendar", title: "Calendar — new events", sub: "Adding events (never double-books)" },
  { key: "calendar_changes", title: "Calendar — changes", sub: "Moving or editing existing events" },
  { key: "email_drafts", title: "Email drafts", sub: "Writing drafts (never sends)" },
  { key: "email_sending", title: "Email sending", sub: "Sending emails on your behalf" },
  { key: "tasks", title: "Task creation", sub: "Adding tasks and follow-ups" },
  { key: "reminders", title: "Reminders", sub: "Setting reminders" },
  { key: "social_posts", title: "Social posts", sub: "Approving posts for publishing" },
  { key: "sms", title: "Text messages", sub: "Sending SMS (coming soon)" },
];
function Autonomy() {
  const { profile } = useApp(); const save = useSave();
  const [a, setA] = useState(profile.settings.autonomy);
  const set = (k: AutonomyKey, v: "ask" | "auto") => { const n = { ...a, [k]: v }; setA(n); save({ settings: { autonomy: n } }); };
  return (
    <>
      <p className="muted mb-5">Choose what Mila can do on her own. Anything set to “Ask every time” shows up in Tasks for your approval first.</p>
      <div className="grid gap-3 lg:grid-cols-2">{AUTONOMY.map((x) => (
        <div key={x.key} className="glass flex flex-wrap items-center gap-3 p-4 sm:p-5" style={{ borderRadius: 24 }}>
          <div className="min-w-0 flex-1"><p className="font-semibold">{x.title}</p><p className="muted text-[14px]">{x.sub}</p></div>
          <Segmented value={a[x.key]} onChange={(v) => set(x.key, v)} options={[{ value: "ask", label: "Ask every time" }, { value: "auto", label: "Automatic" }]} />
        </div>))}</div>
      <div className="glass mt-5 flex items-center gap-4 p-4 sm:p-5" style={{ borderRadius: 24 }}>
        <div className="min-w-0 flex-1"><p className="font-semibold">Email my contacts when I set up an open house</p><p className="muted text-[14px]">Off by default. When it&apos;s off, Mila never drafts a blast on her own — you can still say “email my contacts about the open house” whenever you want one. Nothing is ever sent without your approval.</p></div>
        <Toggle label="Draft an email to my contacts when I set up an open house" checked={profile.settings.workflows?.email_contacts === true} onChange={(v) => save({ settings: { workflows: { email_contacts: v } } })} />
      </div>
      <p className="faint mt-4 px-2 text-[13px]">Always asks, regardless of these settings: deleting anything, cancelling events, and emailing more than 10 people at once.</p>
    </>
  );
}

function Notifications() {
  const { profile } = useApp(); const save = useSave();
  const [n, setN] = useState(profile.settings.notifications);
  const upd = (next: typeof n) => { setN(next); save({ settings: { notifications: next } }); };
  const [perm, setPerm] = useState<string>("default");
  useEffect(() => { if ("Notification" in window) setPerm(Notification.permission); else setPerm("unsupported"); }, []);
  const ch: [keyof typeof n.channels, string, string][] = [["email", "Email", "Summaries and reminders by email (needs email delivery to be configured)"], ["browser", "Browser", "Alerts while Mila is open"], ["pwa", "App (Home Screen)", "In-app alerts"], ["calendar", "Calendar", "Reminders on your calendar events"], ["sms", "SMS", "Coming soon"]];
  const tp: [keyof typeof n.topics, string][] = [["daily_summary", "Daily summary"], ["task_reminders", "Task reminders"], ["approval_reminders", "Approval reminders"], ["lead_alerts", "Lead alerts"], ["calendar_conflicts", "Calendar conflicts"], ["follow_up_reminders", "Follow-up reminders"]];
  return (
    <>
      <Card title="How" sub="Where Mila can reach you.">
        <div className="space-y-4">{ch.map(([k, t, s]) => <div key={k} className="flex items-center gap-4"><div className="min-w-0 flex-1"><p className="font-semibold">{t}</p><p className="muted text-[13.5px]">{s}</p></div><Toggle label={t} checked={k !== "sms" && n.channels[k]} onChange={(v) => k !== "sms" && upd({ ...n, channels: { ...n.channels, [k]: v } })} /></div>)}</div>
        {perm !== "granted" && perm !== "unsupported" && <button className="btn btn-sm mt-4" onClick={async () => setPerm(await Notification.requestPermission())}>Allow browser notifications</button>}
        {perm === "denied" && <p className="faint mt-2 text-[13px]">Notifications are blocked in your browser settings.</p>}
      </Card>
      <Card title="What" sub="Choose the nudges you want.">
        <div className="space-y-4">{tp.map(([k, t]) => <div key={k} className="flex items-center gap-4"><p className="flex-1 font-semibold">{t}</p><Toggle label={t} checked={n.topics[k]} onChange={(v) => upd({ ...n, topics: { ...n.topics, [k]: v } })} /></div>)}</div>
      </Card>
    </>
  );
}

interface CreditsData { trial?: { daysLeft: number; day: number; expired: boolean } | null; balance: number; allowance: number; spentThisPeriod: number; resetsAt: string; status: string; plan: { name: string } | null; history: { id: string; at: string; label: string; credits: number }[]; packs: { credits: number; price_usd: number }[]; plans: { key: string; name: string; price_usd: number; credits: number; blurb: string }[]; billingConfigured: boolean }
const OP: Record<string, string> = { "turn:open_house": "Open house workflow", "turn:new_contact": "New contact", "turn:priorities": "Follow-up priorities", "turn:market": "Market research", "turn:draft_email": "Email draft", "turn:social_post": "Social post", "turn:batch_followups": "Follow-up drafts", "turn:signin_paste": "Sign-in sheet", "turn:move_event": "Calendar change", "turn:reminder": "Reminder", "turn:general": "Question", "market_research": "Market research", "contact_import": "Contact import", "image_extraction": "Photo reading", "document_extraction": "Document reading" };
function Credits() {
  const { data, loading, reload } = useApi<CreditsData>("/api/credits");
  const { toast, refresh } = useApp(); const params = useSearchParams();
  useEffect(() => { if (params.get("checkout") === "success") { toast("Thanks! Your credits will appear in a moment.", "success"); setTimeout(() => { reload(); refresh(); }, 2500); } }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading || !data) return <Skeleton className="h-96" />;
  const pct = Math.min(100, Math.round((data.balance / Math.max(data.allowance, 1)) * 100));
  async function buy(body: Record<string, unknown>) {
    try {
      if (data!.billingConfigured) { const r = await jfetch<{ url: string }>("/api/billing/checkout", { method: "POST", json: body }); window.location.assign(r.url); }
      else { await jfetch("/api/credits/purchase", { method: "POST", json: { credits: body.credits ?? 500 } }); toast("Test credits added (development mode).", "success"); reload(); refresh(); }
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't start checkout.", "error"); }
  }
  return (
    <>
      <Card>
        <div className="mb-1 flex items-baseline justify-between"><p className="kicker">Mila credits</p>{data.trial && <Pill tone={data.trial.expired ? "warn" : "accent"}>{data.trial.expired ? "Trial ended" : `Free trial · ${data.trial.daysLeft} ${data.trial.daysLeft === 1 ? "day" : "days"} left`}</Pill>}</div>
        <p className="display text-[48px] leading-none">{data.balance.toLocaleString()} <span className="faint text-[22px]">/ {data.allowance.toLocaleString()}</span></p>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 9%, transparent)" }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,var(--accent),var(--accent-2))" }} /></div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-[14.5px]"><div><p className="faint">Used this period</p><p className="font-semibold">{data.spentThisPeriod.toLocaleString()}</p></div><div><p className="faint">Resets</p><p className="font-semibold">{new Date(data.resetsAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}</p></div></div>
      </Card>
      <Card title="Add credits" sub="Credits never disappear unexpectedly. Extra credits roll over as long as you're subscribed.">
        <div className="grid gap-3 sm:grid-cols-3">{data.packs.map((p) => <button key={p.credits} className="glass p-4 text-left transition hover:bg-white/50" style={{ borderRadius: 22 }} onClick={() => buy({ kind: "pack", credits: p.credits })}><p className="display text-[28px]">+{p.credits.toLocaleString()}</p><p className="muted text-[14px]">{data.billingConfigured ? `$${p.price_usd}` : "Add test credits"}</p></button>)}</div>
      </Card>
      <Card title="Plans" sub={data.trial ? "No card needed for your trial. Pick a plan whenever you are ready — every plan includes the full Mila." : "Every plan includes the full Mila — plans differ by monthly credits."}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.plans.map((p) => <div key={p.key} className="glass p-5" style={{ borderRadius: 24 }}><p className="font-semibold">{p.name}</p><p className="display text-[40px] leading-tight">${p.price_usd}<span className="faint text-[16px]">/mo</span></p><p className="font-semibold">{p.credits.toLocaleString()} Mila credits / month</p><p className="muted mt-1 text-[14px]">{p.blurb}</p><button className="btn btn-primary btn-sm mt-4" disabled={!data.billingConfigured} onClick={() => buy({ kind: "plan", plan_key: p.key })}>{data.plan?.name === p.name && data.status === "active" ? "Current plan" : data.billingConfigured ? "Choose plan" : "Billing not connected"}</button></div>)}</div>
      </Card>
      <Card title="Usage history">
        {data.history.length ? <ul className="divide-y" style={{ borderColor: "var(--line)" }}>{data.history.filter((h) => h.credits > 0).slice(0, 25).map((h) => <li key={h.id} className="flex items-center justify-between py-2.5 text-[14.5px]"><span>{OP[h.label] ?? h.label.replace(/^turn:/, "").replace(/_/g, " ")}<span className="faint ml-2 text-[12.5px]">{new Date(h.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></span><span className="font-semibold">−{h.credits}</span></li>)}</ul> : <p className="muted">No usage yet.</p>}
      </Card>
    </>
  );
}

function Appearance() {
  const { profile } = useApp(); const save = useSave();
  const [a, setA] = useState(profile.settings.appearance);
  return (
    <>
      <Card title="Sky" sub="By default, Mila's background follows your real sunrise and sunset.">
        <Segmented value={a.theme} onChange={(v) => { const n = { ...a, theme: v }; setA(n); save({ settings: { appearance: n } }); }} options={[{ value: "auto", label: "Follow the sun" }, { value: "day", label: "Always day" }, { value: "night", label: "Always night" }]} />
      </Card>
      <Card title="Animated clouds" sub="Off by default so Mila stays fast and easy on your battery."><div className="flex items-center gap-4"><div className="flex-1"><p className="font-semibold">Move the clouds</p><p className="muted text-[14px]">The sky still follows your sunrise and sunset either way. Turning this on animates the clouds, which uses more battery.</p></div><Toggle label="Animated clouds" checked={a.animated_sky === true} onChange={(v) => { const n = { ...a, animated_sky: v }; setA(n); save({ settings: { appearance: n } }); }} /></div></Card>
      <Card title="Motion"><div className="flex items-center gap-4"><div className="flex-1"><p className="font-semibold">Reduce motion</p><p className="muted text-[14px]">Calms clouds, birds and transitions. Mila also respects your device's setting.</p></div><Toggle label="Reduce motion" checked={a.reduce_motion} onChange={(v) => { const n = { ...a, reduce_motion: v }; setA(n); save({ settings: { appearance: n } }); }} /></div></Card>
      <LocationCard />
    </>
  );
}
function LocationCard() {
  const save = useSave(); const { profile } = useApp(); const { toast } = useApp();
  return (
    <Card title="Location for the sky" sub={profile.lat != null ? "Using your approximate location." : "Using your time zone. Add an approximate location for exact sunrise and sunset."}>
      <div className="flex gap-3"><button className="btn btn-sm" onClick={() => navigator.geolocation?.getCurrentPosition((p) => save({ lat: p.coords.latitude, lng: p.coords.longitude }), () => toast("Location wasn't shared — no problem.", "info"), { enableHighAccuracy: false, maximumAge: 3_600_000 })}>Use approximate location</button>{profile.lat != null && <button className="btn btn-quiet btn-sm" onClick={() => save({ lat: null, lng: null })}>Clear</button>}</div>
      <p className="faint mt-3 text-[13px]">Stored rounded to about 10 km. Never used for anything but the sky.</p>
    </Card>
  );
}

function Privacy() {
  const { profile } = useApp(); const save = useSave(); const router = useRouter(); const { toast } = useApp();
  const [p, setP] = useState(profile.settings.privacy); const [del, setDel] = useState(false); const [txt, setTxt] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <>
      <Card title="Your data" sub="Your contacts, calendar, emails and documents are visible only to you. Mila's staff and other users can't see them.">
        <div className="flex items-center gap-4"><div className="flex-1"><p className="font-semibold">Keep conversation history</p><p className="muted text-[14px]">Lets Mila remember context across visits. Structured memory is separate and always editable in More → Memory.</p></div><Toggle label="Keep conversation history" checked={p.store_conversations} onChange={(v) => { const n = { ...p, store_conversations: v }; setP(n); save({ settings: { privacy: n } }); }} /></div>
        <div className="mt-5 flex flex-wrap gap-3"><a className="btn btn-sm" href="/api/privacy/export">Download my data</a><button className="btn btn-danger btn-sm" onClick={() => setDel(true)}>Delete all my data</button></div>
      </Card>
      <p className="faint px-2 text-[13px]">Mila never sends email, texts or posts without your permission, and never shares your data with other users.</p>
      <Sheet open={del} onClose={() => { setDel(false); setTxt(""); }} title="Delete everything?">
        <p className="muted mb-4">This permanently deletes your contacts, calendar, tasks, memories, documents and connections. It can't be undone. Type <b>DELETE</b> to confirm.</p>
        <input className="field mb-4" autoFocus placeholder="Type DELETE" value={txt} onChange={(e) => setTxt(e.target.value)} aria-label="Type DELETE to confirm" />
        <div className="flex gap-3"><button className="btn flex-1" onClick={() => setDel(false)}>Cancel</button><button className="btn btn-danger flex-1" disabled={busy || txt !== "DELETE"} onClick={async () => { setBusy(true); try { await jfetch("/api/privacy/delete", { method: "POST", json: { confirm: txt } }); window.location.replace("/welcome"); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't delete.", "error"); setBusy(false); } }}>{busy ? "Deleting…" : "Delete permanently"}</button></div>
      </Sheet>
    </>
  );
}

function Security() {
  const router = useRouter();
  return (
    <>
      <Card title="Account protection" sub="How Mila keeps your business safe.">
        <ul className="muted space-y-2 text-[14.5px]"><li>• Every record is tied to your account; other users can never read it.</li><li>• Your connected accounts are stored securely and never shown in the app.</li><li>• Consequential actions wait for your approval unless you say otherwise.</li><li>• Deleting data always asks first.</li></ul>
      </Card>
      <Card><button className="btn" onClick={async () => { await jfetch("/api/auth/logout", { method: "POST" }); window.location.replace("/welcome"); }}>Sign out</button></Card>
    </>
  );
}
