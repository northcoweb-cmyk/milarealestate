"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui";
import { useApp } from "@/components/app-context";
import { partsIn } from "@/lib/time";

/** Pick the days and Mila does the rest through her normal time-off flow: blocks them so nothing new gets booked, warns about anything already there, offers to move it, and reminds you the evening before to wrap things up. */
export function OutOfOffice({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useApp();
  const router = useRouter();
  const tz = profile.timezone;
  const p = partsIn(new Date(), tz);
  const iso = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  const [from, setFrom] = useState(iso); const [to, setTo] = useState("");
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const say = (v: string) => { const [, m, d] = v.split("-").map(Number); return `${MON[m - 1]} ${d}`; };
  const go = () => {
    const range = to && to > from ? `${say(from)} through ${say(to)}` : say(from);
    onClose();
    router.push(`/?ask=${encodeURIComponent(`I'm out of office ${range}`)}`);
  };
  return (
    <Sheet open={open} onClose={onClose} title="✈️ Out of office">
      <div className="space-y-4">
        <p className="muted text-[14.5px]">Mila blocks the time so nothing new gets booked, flags anything already on your calendar and offers to move it, and reminds you the evening before to wrap things up.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="lbl" htmlFor="ooo-from">First day off</label><input id="ooo-from" type="date" className="field" value={from} onChange={(e) => { setFrom(e.target.value); if (to && to < e.target.value) setTo(""); }} /></div>
          <div><label className="lbl" htmlFor="ooo-to">Back to work after (optional)</label><input id="ooo-to" type="date" className="field" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <button className="btn btn-primary w-full" disabled={!from} onClick={go}>Set out of office</button>
      </div>
    </Sheet>
  );
}
