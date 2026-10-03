"use client";

import { useEffect } from "react";

const sent = new Set<string>();
export function report(message: string, stack?: string) {
  const key = message.slice(0, 120);
  if (sent.has(key) || sent.size > 20) return; // once per distinct problem per page load
  sent.add(key);
  try { fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, stack, route: location.pathname }), keepalive: true }).catch(() => {}); } catch { /* reporting must never break the app */ }
}

/** Sends browser-side crashes to the owner dashboard. Invisible to users. */
export function ErrorReporter() {
  useEffect(() => {
    const onErr = (e: ErrorEvent) => { if (e.message && !/ResizeObserver|Script error/i.test(e.message)) report(e.message, e.error?.stack); };
    const onRej = (e: PromiseRejectionEvent) => { const r = e.reason; const m = r instanceof Error ? r.message : typeof r === "string" ? r : ""; if (m && !/AbortError|Failed to fetch|NetworkError|Load failed/i.test(m)) report(`Unhandled: ${m}`, r instanceof Error ? r.stack : undefined); };
    window.addEventListener("error", onErr); window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  return null;
}
