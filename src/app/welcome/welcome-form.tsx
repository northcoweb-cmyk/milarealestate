"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { jfetch } from "@/components/ui";

export function WelcomeForm({ mode, localAllowed }: { mode: "supabase" | "local"; localAllowed: boolean }) {
  const router = useRouter();
  const [signIn, setSignIn] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setInfo(null);
    try {
      const r = await jfetch<{ onboarded?: boolean; confirm?: boolean; message?: string }>(signIn ? "/api/auth/login" : "/api/auth/signup", { method: "POST", json: { name, email, password } });
      if (r.confirm) { setInfo(r.message ?? "Check your email."); return; }
      router.replace(signIn || r.onboarded ? "/" : "/onboarding"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  async function demo() {
    setBusy(true); setError(null);
    try { await jfetch("/api/auth/demo", { method: "POST" }); router.replace("/"); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Demo isn't available."); setBusy(false); }
  }
  if (!localAllowed) return <div className="glass p-6 text-center"><p className="font-semibold">Sign-in isn't available right now.</p><p className="muted mt-1 text-[14.5px]">Please try again in a little while.</p></div>;
  return (
    <form onSubmit={submit} className="glass-strong space-y-4 p-6" style={{ borderRadius: 32 }}>
      <h1 className="h2 text-center">{signIn ? "Welcome back" : "Create your account"}</h1>
      {!signIn && <div><label className="lbl" htmlFor="n">Your name</label><input id="n" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sarah Carter" required /></div>}
      <div><label className="lbl" htmlFor="e">Email</label><input id="e" type="email" className="field" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@brokerage.com" required /></div>
      {mode === "supabase" && <div><label className="lbl" htmlFor="p">Password</label><input id="p" type="password" className="field" autoComplete={signIn ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></div>}
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
