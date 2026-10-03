import type { Intent } from "../intents";
import { persistState } from "../conversation";
import type { Ctx } from "../context";
import { type Resolve, resolveAddress } from "../property-lookup";
import { type HandlerOut, reply } from "./types";

/**
 * "123 Main Street" alone isn't enough to find a home. If the city/state (or ZIP) is missing, Mila asks for it,
 * remembers what she was doing, and picks the request back up with the answer.
 */
export async function locationGate(ctx: Ctx, intent: Intent, text: string, street: string): Promise<{ ok: true; found: Extract<Resolve, { status: "ok" }> } | { ok: false; out: HandlerOut }> {
  const r = await resolveAddress(ctx, text, street);
  if (r.status === "ok") return { ok: true, found: r };
  ctx.state.pending = { kind: "clarify", intent, slots: { text }, missing: "location" };
  await persistState(ctx);
  const mine = ctx.profile.location?.trim();
  return { ok: false, out: reply(`What city and state is ${street} in? A ZIP code works too — I need the full address so I can look the home up.`, mine ? [{ type: "choice", title: "Is it in your area?", buttons: [{ label: `Yes — ${mine}`, style: "primary", action: { type: "prompt", text: mine } }] }] : []) };
}
