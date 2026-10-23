"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mila's sense of "now" follows the phone: when the device's time zone differs from the saved one, update it once so every page and every answer agrees.
 * It never reloads the page (that closed an open chat and threw away the message being typed): the server data refreshes in place, and only once per time zone per visit.
 */
export function TzSync({ saved }: { saved: string }) {
  const router = useRouter();
  useEffect(() => {
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return; }
    if (!tz || tz === saved) return;
    try { if (sessionStorage.getItem("mila_tz_synced") === tz) return; sessionStorage.setItem("mila_tz_synced", tz); } catch { /* private mode: the saved check above still stops repeats once the save lands */ }
    fetch("/api/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ timezone: tz }) })
      .then((r) => { if (r.ok) router.refresh(); })
      .catch(() => undefined);
  }, [saved, router]);
  return null;
}
