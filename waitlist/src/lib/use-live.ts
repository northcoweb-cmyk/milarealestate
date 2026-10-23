"use client";
import { useEffect, useState } from "react";

export const APP_URL = "https://app.milarealestate.app/welcome";
const LAUNCH_AT = process.env.NEXT_PUBLIC_LAUNCH_AT || "2026-10-23T14:30:00-04:00";

/** False until the launch moment (and on the server); flips by itself when the time passes, no refresh needed. */
export function useLive(): boolean {
  const t = new Date(LAUNCH_AT).getTime();
  const [live, setLive] = useState(false);
  useEffect(() => { const check = () => setLive(Date.now() >= t); check(); const i = setInterval(check, 1000); return () => clearInterval(i); }, [t]);
  return live;
}
