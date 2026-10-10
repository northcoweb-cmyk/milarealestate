import type { BriefItem, BriefSection } from "../../types";
import type { Ctx } from "../context";
import { saveMemory } from "../memory";
import { type HandlerOut, reply } from "./types";

const YES = /\b(?:pets?|dogs?|cats?)\s+(?:are\s+)?(?:allowed|ok(?:ay)?|welcome|friendly)|pet[- ]friendly|allows? pets|allowed:? yes/i;
const NO = /\bno\s+pets\b|\bpets?\s+(?:are\s+)?not\s+(?:allowed|permitted)|doesn'?t allow pets|not pet[- ]friendly|pets?:? no/i;
const KEY = "Pets";

/** "Which of my listings allow pets?": answered from what's saved on each home (the notes, the description). Anything unknown stays unknown, with a one-tap way to record it. */
export async function petCheckHandler(ctx: Ctx, _text: string): Promise<HandlerOut> {
  const [props, mems] = await Promise.all([ctx.store.list("properties", ctx.userId), ctx.store.list("memories", ctx.userId)]);
  if (!props.length) return reply("You don't have any listings saved yet, so there's nothing to check.", [], "smalltalk");
  const yes: BriefItem[] = [], no: BriefItem[] = [], unknown: BriefItem[] = [];
  for (const p of props.filter((x) => !x.is_demo).slice(0, 30)) {
    const note = mems.find((m) => m.scope === "property" && m.subject_id === p.id && m.key === KEY)?.value;
    const hay = `${note ?? ""} ${p.description ?? ""}`;
    const label = `${p.address}${p.city ? `, ${p.city}` : ""}`;
    if (NO.test(hay)) no.push({ text: label, state: "info" });
    else if (YES.test(hay)) yes.push({ text: label, state: "done" });
    else unknown.push({ text: label, state: "missing", gap: "pet policy unknown", button: { label: "Pets OK", style: "quiet", action: { type: "set_pets", propertyId: p.id, policy: "Pets allowed" } } });
  }
  const sections: BriefSection[] = [
    ...(yes.length ? [{ emoji: "🐶", label: "Allow pets", items: yes }] : []),
    ...(no.length ? [{ emoji: "🚫", label: "No pets", items: no }] : []),
    ...(unknown.length ? [{ emoji: "❔", label: "Not recorded yet", items: unknown }] : []),
  ];
  return reply(`${yes.length ? `${yes.length} allow pets` : "None are recorded as allowing pets"}${unknown.length ? `, and ${unknown.length} ${unknown.length === 1 ? "has" : "have"} no pet policy saved` : ""}. I only go by what's saved on each home.`, [{ type: "listing_brief", kicker: "Pets", title: "Pet-friendly check", done: 0, total: 0, sections }], "smalltalk");
}

export async function setPets(ctx: Ctx, propertyId: string, policy: string): Promise<HandlerOut> {
  const p = await ctx.store.get("properties", ctx.userId, propertyId);
  if (!p) return reply("I couldn't find that home.", [], "smalltalk");
  await saveMemory(ctx, { scope: "property", subject_id: p.id, key: KEY, value: policy.slice(0, 80), source: "user_stated" });
  return reply(`Noted: ${policy.toLowerCase()} at ${p.address}.`, [], "smalltalk");
}
