import type { Intent } from "../intents";
import { persistState } from "../conversation";
import type { Ctx } from "../context";
import { type Resolve, resolveAddress } from "../property-lookup";
import { type HandlerOut, reply } from "./types";
import { classifyProperty } from "../../property-kind";

/**
 * "123 Main Street" alone isn't enough to find a home. If the city/state (or ZIP) is missing, Mila asks for it,
 * remembers what she was doing, and picks the request back up with the answer.
 */
export async function locationGate(ctx: Ctx, intent: Intent, text: string, street: string): Promise<{ ok: true; found: Extract<Resolve, { status: "ok" }> } | { ok: false; out: HandlerOut }> {
  const asked = ctx.state.asked_location === street;
  const r = await resolveAddress(ctx, text, street, { answering: asked });
  if (r.status === "ok") {
    if (asked) { ctx.state.asked_location = null; await persistState(ctx); }
    const lm = landmarkAsk(text, street, r.place.landmark ?? null);
    if (lm) return { ok: false, out: lm };
    return { ok: true, found: r };
  }
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

/**
 * The map says this address is a public or commercial place (a capitol, a ballpark, a mall). Before saving it as someone's home or booking
 * a showing there, ask what it is, unless the agent already said ("the commercial space at…", "my listing, a duplex").
 */
export function landmarkAsk(text: string, street: string, landmark: string | null): HandlerOut | null {
  if (!landmark) return null;
  if (classifyProperty({ agentText: text }).basis === "agent") return null;
  if (/\b(it'?s|that'?s|this is)\s+(?:a |an )?(?:home|house|commercial|land|lot)\b/i.test(text)) return null;
  const base = text.replace(/[.\s]+$/, "");
  const named = /^a public/.test(landmark) ? "a public or commercial place" : landmark;
  return reply(`${street} is ${named} on the map. Is this a home, a commercial property, or land?`, [{ type: "choice", title: "What kind of property is it?", buttons: [
    { label: "🏠 A home", style: "secondary", action: { type: "prompt", text: `${base} (it's a home)` } },
    { label: "🏢 Commercial", style: "primary", action: { type: "prompt", text: `${base} (it's a commercial property)` } },
    { label: "🌳 Land", style: "secondary", action: { type: "prompt", text: `${base} (it's land)` } },
  ] }]);
}
