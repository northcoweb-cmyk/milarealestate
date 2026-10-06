"use client";

import { useState } from "react";
import { jfetch } from "@/components/ui";

export function ClaimForm({ token, email, needsPassword }: { token: string; email: string; needsPassword: boolean }) {
  const [password, setPassword] = useState(""); const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (needsPassword && password.length < 8) return setError("Use a password of at least 8 characters.");
    if (needsPassword && password !== again) return setError("The two passwords don't match.");
    setBusy(true);
    try { await jfetch("/api/auth/claim", { method: "POST", json: { token, password } }); window.location.replace("/onboarding"); }
    catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="glass-strong space-y-4 p-6" style={{ borderRadius: 32 }}>
      <h1 className="h2 text-center">Create your password</h1>
      <div><label className="lbl" htmlFor="e">Your email</label><input id="e" className="field" value={email} readOnly aria-readonly /></div>
      {needsPassword && <>
        <div><label className="lbl" htmlFor="p">Password</label><input id="p" type="password" className="field" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></div>
        <div><label className="lbl" htmlFor="p2">Confirm password</label><input id="p2" type="password" className="field" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} minLength={8} required /></div>
      </>}
      {error && <p role="alert" className="text-[14.5px]" style={{ color: "var(--danger)" }}>{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? "One moment…" : "Start my 7-day trial"}</button>
      <p className="faint text-center text-[12.5px]">No card needed. You&apos;ll set up your profile next.</p>
    </form>
  );
}
