"use client";

import { useEffect, useState } from "react";
import { jfetch } from "@/components/ui";

export function WelcomeForm({ mode, localAllowed }: { mode: "supabase" | "local"; localAllowed: boolean }) {
  const [signIn, setSignIn] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [code, setCode] = useState("");
  const [ref, setRef] = useState("");
  useEffect(() => { try { const q = new URLSearchParams(window.location.search).get("ref"); if (q) sessionStorage.setItem("mila_ref", q.toUpperCase().slice(0, 12)); setRef(sessionStorage.getItem("mila_ref") ?? ""); } catch { /* private mode */ } }, []);
  const [inviter, setInviter] = useState<string | null>(null);
  useEffect(() => { if (!ref) return; fetch(`/api/referral/lookup?code=${encodeURIComponent(ref)}`).then((r) => r.json()).then((j) => setInviter(j.valid ? j.name : null)).catch(() => setInviter(null)); }, [ref]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setInfo(null);
    try {
      const r = await jfetch<{ onboarded?: boolean; confirm?: boolean; message?: string }>(signIn ? "/api/auth/login" : "/api/auth/signup", { method: "POST", json: { name, email, password, code, ref } });
      if (r.confirm) { setInfo(r.message ?? "Check your email."); return; }
      // full page load: the client router cache may still hold the signed-out redirect to /welcome
      window.location.replace(signIn || r.onboarded ? "/" : "/onboarding"); return;
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  async function demo() {
    setBusy(true); setError(null);
    try { await jfetch("/api/auth/demo", { method: "POST" }); window.location.replace("/"); }
    catch (e) { setError(e instanceof Error ? e.message : "Demo isn't available."); setBusy(false); }
  }
  if (!localAllowed) return <div className="glass p-6 text-center"><p className="font-semibold">Sign-in isn't available right now.</p><p className="muted mt-1 text-[14.5px]">Please try again in a little while.</p></div>;
  return (
    <form onSubmit={submit} className="glass-strong space-y-4 p-6" style={{ borderRadius: 32 }}>
      <h1 className="h2 text-center">{signIn ? "Welcome back" : "Create your account"}</h1>
      {!signIn && inviter && <p className="rounded-2xl px-4 py-3 text-center text-[14.5px] font-semibold" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}>🎉 {inviter} invited you. You'll get bonus credits when you subscribe.</p>}
      {!signIn && <div><label className="lbl" htmlFor="n">Your name</label><input id="n" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sarah Carter" required /></div>}
      <div><label className="lbl" htmlFor="e">Email</label><input id="e" type="email" className="field" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@brokerage.com" required /></div>
      {mode === "supabase" && <div><label className="lbl" htmlFor="p">Password</label><input id="p" type="password" className="field" autoComplete={signIn ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></div>}
      {!signIn && <div><label className="lbl" htmlFor="r">Referral code (optional)</label><input id="r" className="field" autoComplete="off" value={ref} onChange={(e) => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12); setRef(v); try { sessionStorage.setItem("mila_ref", v); } catch { /* ignore */ } }} placeholder="A friend's code" /></div>}
      {!signIn && <div><label className="lbl" htmlFor="c">Access code</label><input id="c" className="field" inputMode="numeric" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, "").slice(0, 32))} placeholder="Ask for an invite code" required /><p className="faint mt-1.5 text-[12.5px]">Mila is invite-only right now. Already have an account? Use “Sign in” below.</p></div>}
      {mode === "supabase" && (
        <div className="space-y-2">
          <a className="btn w-full" href="/api/auth/oauth/start?provider=google" onClick={() => { try { sessionStorage.setItem("mila_invite", code); } catch { /* ignore */ } }}>Continue with Google</a>
          <a className="btn w-full" href="/api/auth/oauth/start?provider=microsoft" onClick={() => { try { sessionStorage.setItem("mila_invite", code); } catch { /* ignore */ } }}>Continue with Microsoft</a>
          <p className="faint text-center text-[12.5px]">New here? Enter your access code first. This only signs you in; calendar and email stay separate in Settings.</p>
        </div>
      )}
      {error && <p role="alert" className="text-[14.5px]" style={{ color: "var(--danger)" }}>{error}</p>}
      {info && <p className="text-[14.5px]" style={{ color: "var(--ok)" }}>{info}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? "One moment…" : signIn ? "Sign in" : "Get started"}</button>
      <button type="button" className="btn btn-quiet w-full" onClick={() => { setSignIn(!signIn); setError(null); }}>{signIn ? "New here? Create an account" : "Already have an account? Sign in"}</button>
      {mode === "local" && (
        <>
          <div className="hairline pt-4"><button type="button" className="btn w-full" onClick={demo} disabled={busy}>Explore with demo data</button><p className="faint mt-2 text-center text-[12.5px]">Local development mode: accounts have no password. Demo data is fictional.</p></div>
        </>
      )}
    </form>
  );
}
