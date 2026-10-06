import { randomBytes } from "node:crypto";
import { getStore } from "./db/store";
import { NIL_USER } from "./server/errors";
import type { WaitlistEntry } from "./types";

const INVITE_DAYS = 45;
export const newInviteToken = () => randomBytes(24).toString("hex");

export type InviteState = { ok: true; entry: WaitlistEntry } | { ok: false; reason: "invalid" | "used" | "expired" };

/** Look up a launch-day invite link. Never says more than it must: unknown, already-used and expired are the only answers. */
export async function inviteFor(token: string | null | undefined, now = Date.now()): Promise<InviteState> {
  if (!token || !/^[a-f0-9]{48}$/.test(token)) return { ok: false, reason: "invalid" };
  const entry = await getStore().findBy("waitlist", NIL_USER, { invite_token: token });
  if (!entry) return { ok: false, reason: "invalid" };
  if (entry.claimed_at) return { ok: false, reason: "used" };
  if (!entry.invited_at || now - new Date(entry.invited_at).getTime() > INVITE_DAYS * 86_400_000) return { ok: false, reason: "expired" };
  return { ok: true, entry };
}

export async function markClaimed(entry: WaitlistEntry, accountId: string) {
  await getStore().update("waitlist", NIL_USER, entry.id, { claimed_at: new Date().toISOString(), account_id: accountId, status: "joined" });
}
