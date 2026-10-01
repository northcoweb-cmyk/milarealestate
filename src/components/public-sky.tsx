"use client";

import { useEffect, useState } from "react";
import { Sky } from "./sky";

/** Sky for pre-login screens: uses the browser's time zone. */
export function PublicSky({ lat, lng, tz }: { lat?: number | null; lng?: number | null; tz?: string }) {
  const [zone, setZone] = useState(tz ?? "America/New_York");
  useEffect(() => { if (!tz) try { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"); } catch { /* keep default */ } }, [tz]);
  return <Sky initialNow={new Date().toISOString()} tz={zone} lat={lat} lng={lng} />;
}
