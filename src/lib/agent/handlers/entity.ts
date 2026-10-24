import type { Contact, Property } from "../../types";
import type { Ctx } from "../context";
import { persistState } from "../conversation";
import { parseAddress } from "../nlu";
import { type HandlerOut, reply } from "./types";
import { firstNameOf, firstTokenOf } from "../../names";

/**
 * Which home is this request about? Never "whatever was used last anywhere".
 * Order: an address in the message, the home this conversation is on, the only saved home. With several candidates, ask once and offer them.
 */
export async function pickProperty(ctx: Ctx, text: string, again: (address: string) => string, intent = "general"): Promise<{ prop: Property; assumed: boolean } | { ask: HandlerOut }> {
  const props = await ctx.store.list("properties", ctx.userId);
  const street = parseAddress(text);
  if (street) { const hit = props.find((p) => p.address.toLowerCase() === street.toLowerCase()); if (hit) return { prop: hit, assumed: false }; }
  if (ctx.state.last_property_id) { const p = props.find((x) => x.id === ctx.state.last_property_id); if (p) return { prop: p, assumed: false }; }
  const real = props.filter((p) => !p.is_demo), live = real.length ? real : props; // a demo account has only demo homes: those count
  if (live.length === 1) return { prop: live[0], assumed: true };
  if (!live.length) { ctx.state.pending = { kind: "clarify", intent, slots: { text }, missing: "address" }; await persistState(ctx); return { ask: reply("Which property is this for? Give me the street address.", [], "smalltalk") }; }
  const top = [...live].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  ctx.state.pending = { kind: "clarify", intent, slots: { text }, missing: "address" };
  await persistState(ctx);
  return { ask: reply("Which property is this for?", [{ type: "choice", title: "Pick the home", buttons: top.map((p) => ({ label: `${p.address}${p.city ? `, ${p.city}` : ""}`, style: "secondary" as const, action: { type: "prompt", text: again(p.address) } })) }], "smalltalk") };
}

/** Two clients with the same first name and the message only says the first name: never choose for the agent. */
export function ambiguousFirstName(text: string, found: Contact[]): Contact[] | null {
  if (found.length < 2) return null;
  const first = firstTokenOf(found[0].name).toLowerCase();
  if (!found.every((c) => firstTokenOf(c.name).toLowerCase() === first)) return null;
  if (found.some((c) => text.toLowerCase().includes(c.name.toLowerCase()))) return null; // a full name was given
  return found;
}

export function askWhichPerson(text: string, people: Contact[]): HandlerOut {
  const first = firstNameOf(people[0].name);
  const re = new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return reply(`Which ${first}?`, [{ type: "choice", title: `Which ${first}?`, buttons: people.slice(0, 6).map((c) => ({ label: `${c.name}${c.location ? ` · ${c.location}` : c.email ? ` · ${c.email}` : ""}`, style: "secondary" as const, action: { type: "prompt", text: text.replace(re, c.name) } })) }], "smalltalk");
}
