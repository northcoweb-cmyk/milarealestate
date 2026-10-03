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
  const asked = ctx.state.asked_location === street;
  const r = await resolveAddress(ctx, text, street, { answering: asked });
  if (r.status === "ok") { if (asked) { ctx.state.asked_location = null; await persistState(ctx); } return { ok: true, found: r }; }
  if (asked) {
    // Already asked once and still can't read it: never ask a second time. Carry on with the address as given, flagged as unverified.
    ctx.state.asked_location = null; await persistState(ctx);
    return { ok: true, found: { status: "ok", street, place: {}, unverified: true } };
  }
  ctx.state.asked_location = street;
  ctx.state.pending = { kind: "clarify", intent, slots: { text }, missing: "location" };
  await persistState(ctx);
  const mine = ctx.profile.location?.trim();
  return { ok: false, out: reply(`What city is ${street} in? (A ZIP works too.)`, mine ? [{ type: "choice", title: "In your area?", buttons: [{ label: `Yes — ${mine}`, style: "primary", action: { type: "prompt", text: mine } }] }] : []) };
}
