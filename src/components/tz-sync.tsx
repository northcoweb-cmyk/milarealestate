"use client";

import { useEffect } from "react";

/** Mila's sense of "now" follows the phone: when the device's time zone differs from the saved one, update it once so every page and every answer agrees. */
export function TzSync({ saved }: { saved: string }) {
  useEffect(() => {
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return; }
    if (!tz || tz === saved) return;
    fetch("/api/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ timezone: tz }) })
      .then((r) => { if (r.ok) window.location.reload(); })
      .catch(() => undefined);
  }, [saved]);
  return null;
}
