"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, MapPin } from "lucide-react";
import clsx from "clsx";
import { jfetch } from "@/components/ui";
import { InstallSteps, useInstall } from "@/components/install";
import { Orb } from "@/components/orb";

const ROLES = ["Agent", "Broker", "Team lead", "Assistant"];
const LEVELS = [
  { v: "new", t: "New agent", d: "Just getting started — I want guidance." },
  { v: "growing", t: "Growing agent", d: "Building my business and my systems." },
  { v: "experienced", t: "Experienced agent", d: "I know my process; I want my time back." },
  { v: "team", t: "Team / broker", d: "I coordinate agents and listings." },
];
const BIZ = [["buyer", "Buyers"], ["seller", "Sellers"], ["rental", "Rentals"], ["commercial", "Commercial"], ["investor", "Investors"], ["mixed", "A mix"]];

export function OnboardingFlow({ name, googleConfigured }: { name: string; googleConfigured: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ full_name: name, role: "Agent", brokerage: "", location: "", primary_market: "", experience: "growing", business_type: "mixed" });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [sample, setSample] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const install = useInstall();
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const total = 6;

  function locate() {
    if (!navigator.geolocation) return setError("Location isn't available in this browser.");
    // approximate is plenty for sunrise/sunset: low accuracy, cached, and rounded server-side
    navigator.geolocation.getCurrentPosition((p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }), () => setError("No problem — Mila will use your time zone instead."), { enableHighAccuracy: false, maximumAge: 3_600_000, timeout: 8000 });
  }

  async function finish() {
    setBusy(true); setError(null);
    try {
      let tz = "America/New_York"; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch { /* default */ }
      await jfetch("/api/me", { method: "PATCH", json: { ...f, brokerage: f.brokerage || null, timezone: tz, ...(coords ?? {}), onboarded: true } });
      if (sample) await jfetch("/api/me/sample-data", { method: "POST" });
      router.replace("/"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't finish setup."); setBusy(false); }
  }

  const next = () => { setError(null); setStep((s) => Math.min(s + 1, total - 1)); };
  const canNext = step === 0 ? f.full_name.trim().length > 1 : step === 1 ? f.location.trim().length > 1 : true;

  return (
    <main className="mx-auto flex min-h-[100svh] w-full max-w-xl flex-col justify-center px-5 py-8">
      <div className="mb-6 flex items-center gap-3">
        {step > 0 && <button className="btn btn-quiet btn-sm !px-2" onClick={() => setStep(step - 1)} aria-label="Back"><ArrowLeft size={20} /></button>}
        <div className="flex flex-1 gap-1.5" aria-label={`Step ${step + 1} of ${total}`}>{Array.from({ length: total }).map((_, i) => <span key={i} className="h-1.5 flex-1 rounded-full transition-all" style={{ background: i <= step ? "linear-gradient(90deg,var(--accent),var(--accent-2))" : "color-mix(in srgb, var(--ink) 12%, transparent)" }} />)}</div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.28 }} className="glass-strong p-6 sm:p-8" style={{ borderRadius: 34 }}>
          {step === 0 && <>
            <h1 className="h1 mb-1">Hi, I'm Mila.</h1><p className="muted mb-6">Let's get you set up — it takes about a minute.</p>
            <div className="space-y-4">
              <div><label className="lbl" htmlFor="fn">Your name</label><input id="fn" className="field" value={f.full_name} onChange={(e) => set("full_name", e.target.value)} autoComplete="name" /></div>
              <div><span className="lbl">Your role</span><div className="flex flex-wrap gap-2">{ROLES.map((r) => <button key={r} className={clsx("chip", f.role === r && "!bg-[var(--accent)] !text-white")} onClick={() => set("role", r)}>{r}</button>)}</div></div>
              <div><label className="lbl" htmlFor="bk">Brokerage <span className="faint">(optional)</span></label><input id="bk" className="field" value={f.brokerage} onChange={(e) => set("brokerage", e.target.value)} placeholder="Used in email signatures" /></div>
            </div>
          </>}
          {step === 1 && <>
            <h1 className="h1 mb-1">Where do you work?</h1><p className="muted mb-6">I use this for market updates and local context.</p>
            <div className="space-y-4">
              <div><label className="lbl" htmlFor="lc">Your city & state</label><input id="lc" className="field" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Gaithersburg, MD" autoComplete="address-level2" /></div>
              <div><label className="lbl" htmlFor="pm">Primary market <span className="faint">(optional)</span></label><input id="pm" className="field" value={f.primary_market} onChange={(e) => set("primary_market", e.target.value)} placeholder="Montgomery County, MD" /></div>
              <div className="glass p-4" style={{ borderRadius: 20 }}>
                <p className="font-semibold">Let the sky match your day</p>
                <p className="muted mb-3 text-[14px]">Mila's background follows your real sunrise and sunset. An approximate location is enough — or skip it and I'll use your time zone.</p>
                <button className="btn btn-sm" onClick={locate} disabled={!!coords}>{coords ? <><Check size={16} />Using approximate location</> : <><MapPin size={16} />Use approximate location</>}</button>
              </div>
            </div>
          </>}
          {step === 2 && <>
            <h1 className="h1 mb-1">Where are you in your career?</h1><p className="muted mb-5">This shapes the suggestions I make.</p>
            <div className="space-y-2.5">{LEVELS.map((l) => <button key={l.v} onClick={() => set("experience", l.v)} className={clsx("glass flex w-full items-center gap-4 p-4 text-left transition", f.experience === l.v && "is-selected")} style={{ borderRadius: 22 }}><div className="flex-1"><p className="font-semibold">{l.t}</p><p className="muted text-[14px]">{l.d}</p></div>{f.experience === l.v && <Check size={20} style={{ color: "var(--accent)" }} />}</button>)}</div>
          </>}
          {step === 3 && <>
            <h1 className="h1 mb-1">What do you mostly do?</h1><p className="muted mb-5">Pick the closest fit. You can change it any time.</p>
            <div className="grid grid-cols-2 gap-2.5">{BIZ.map(([v, l]) => <button key={v} onClick={() => set("business_type", v)} aria-pressed={f.business_type === v} className={clsx("glass flex items-center justify-between p-4 text-left font-semibold transition", f.business_type === v && "is-selected")} style={{ borderRadius: 20 }}>{l}{f.business_type === v && <Check size={18} style={{ color: "var(--accent)" }} />}</button>)}</div>
          </>}
          {step === 4 && <>
            <h1 className="h1 mb-1">Connect your tools</h1><p className="muted mb-5">Optional — you can do this later in More → Settings.</p>
            <div className="space-y-3">
              <div className="glass flex items-center gap-4 p-4" style={{ borderRadius: 22 }}><div className="flex-1"><p className="font-semibold">Google</p><p className="muted text-[14px]">Gmail, Calendar, Contacts and Sheets.</p></div>{googleConfigured ? <a className="btn btn-sm" href="/api/integrations/google/start">Connect</a> : <span className="faint text-[13px]">Not set up on this server</span>}</div>
              <label className="glass flex cursor-pointer items-center gap-4 p-4" style={{ borderRadius: 22 }}><div className="flex-1"><p className="font-semibold">Start with sample contacts</p><p className="muted text-[14px]">Fictional people and appointments so you can try Mila right away. Remove them any time.</p></div><input type="checkbox" className="h-5 w-5" checked={sample} onChange={(e) => setSample(e.target.checked)} /></label>
              <p className="faint px-1 text-[13.5px]">Have a list already? After setup, just tell Mila “import my contacts” or attach a spreadsheet.</p>
            </div>
          </>}
          {step === 5 && <div className="text-center">
            <div className="mb-5 flex justify-center"><Orb size={64} /></div>
            <h1 className="h1 mb-2">You're ready.</h1><p className="muted mb-5">What do you need to get done?</p>
            {!install.standalone && <div className="glass mb-2 p-4 text-left" style={{ borderRadius: 22 }}><p className="mb-2 font-semibold">Add Mila to your Home Screen for the full experience.</p><InstallSteps platform={install.platform} /></div>}
          </div>}
          {error && <p role="alert" className="mt-4 text-[14.5px]" style={{ color: "var(--danger)" }}>{error}</p>}
          <div className="mt-7 flex gap-3">
            {step < 5 && step >= 4 && <button className="btn flex-1" onClick={next}>Skip</button>}
            {step < 5 ? <button className="btn btn-primary flex-1" onClick={next} disabled={!canNext}>{step === 4 ? "Continue" : "Next"}</button> : <button className="btn btn-primary flex-1" onClick={finish} disabled={busy}>{busy ? "Setting things up…" : "Open Mila"}</button>}
          </div>
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
