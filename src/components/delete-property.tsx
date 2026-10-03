"use client";

import { useEffect, useState } from "react";
import { Confirm, jfetch } from "./ui";
import { useApp } from "./app-context";
import type { PropertyUsage } from "@/lib/property-delete";

/** Confirmation for deleting a property — lists what will go with it so nothing disappears by surprise. */
export function DeletePropertyConfirm({ id, address, open, onClose, onDeleted }: { id: string; address: string; open: boolean; onClose: () => void; onDeleted: () => void }) {
  const { toast } = useApp();
  const [usage, setUsage] = useState<PropertyUsage | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setUsage(null); fetch(`/api/properties/${id}`, { cache: "no-store" }).then((r) => r.json()).then((j) => setUsage(j.usage ?? null)).catch(() => undefined); } }, [open, id]);
  const parts = usage ? [[usage.events, "calendar event"], [usage.tasks, "task"], [usage.drafts, "email draft"], [usage.posts, "social post"], [usage.sheets, "showing sheet"], [usage.photos, "photo"]].filter(([n]) => (n as number) > 0).map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`) : [];
  return (
    <Confirm open={open} danger busy={busy} title={`Delete ${address}?`} confirmLabel="Delete property" onClose={onClose}
      body={`This removes the property and everything made for it${parts.length ? `: ${parts.join(", ")}` : ""}. Mila will stop suggesting things for it. This can't be undone.`}
      onConfirm={async () => { setBusy(true); try { await jfetch(`/api/properties/${id}?confirm=1`, { method: "DELETE" }); toast("Property deleted.", "success"); onDeleted(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't delete it.", "error"); } finally { setBusy(false); onClose(); } }} />
  );
}
