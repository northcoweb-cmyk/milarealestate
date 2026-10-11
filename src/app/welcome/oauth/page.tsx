"use client";

import { useEffect, useState } from "react";

export default function OAuthDone() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access_token = h.get("access_token"), refresh_token = h.get("refresh_token"), expires_in = Number(h.get("expires_in") || 3600);
    if (!access_token || !refresh_token) { setMsg("Sign-in didn't finish."); return; }
    let code = ""; try { code = sessionStorage.getItem("mila_invite") ?? ""; } catch { /* private mode */ }
    fetch("/api/auth/oauth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ access_token, refresh_token, expires_in, code }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) { setMsg(d.error ?? "Sign-in didn't finish."); return; } history.replaceState(null, "", "/welcome/oauth"); window.location.replace(d.onboarded ? "/" : "/onboarding"); })
      .catch(() => setMsg("Couldn't reach Mila. Try again."));
  }, []);
  return <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">{msg ? <><p role="alert" className="font-semibold">{msg}</p><a className="btn btn-primary" href="/welcome">Back to sign in</a></> : <p className="muted">Signing you in…</p>}</main>;
}
