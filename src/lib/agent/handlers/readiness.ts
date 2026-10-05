import type { Block, CalendarEvent, Property } from "../../types";
import type { Ctx } from "../context";
import { plural } from "../context";
import { zonedToUtc } from "../../time";
import { parseAddress, parseDate } from "../nlu";
import { saveMemory } from "../memory";
import { buildListingBrief, dayLabel, LISTING_DATE_KEY } from "../readiness";
import { createPosts } from "../../content/service";
import { addListingHandler, listingChecklist } from "./listing";
import { askBack } from "./ask";
import { type HandlerOut, reply } from "./types";

const ymd = (d: { y: number; m: number; d: number }) => `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;

/** The property a request is about: an address in the text, else the one we were just discussing, else the next listing coming up. */
async function resolveProperty(ctx: Ctx, text: string): Promise<Property | null> {
  const props = await ctx.store.list("properties", ctx.userId);
  const street = parseAddress(text);
  if (street) { const k = street.toLowerCase().replace(/[^a-z0-9]/g, ""); const hit = props.find((p) => p.address.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith(k.slice(0, Math.max(6, k.length - 6)))); if (hit) return hit; }
  if (ctx.state.last_property_id) { const p = props.find((x) => x.id === ctx.state.last_property_id); if (p) return p; }
  const mems = await ctx.store.list("memories", ctx.userId);
  const dated = props.map((p) => ({ p, d: mems.find((m) => m.scope === "property" && m.subject_id === p.id && m.key === LISTING_DATE_KEY)?.value ?? "" })).filter((x) => x.d && x.d >= ymd({ y: ctx.now.getUTCFullYear(), m: ctx.now.getUTCMonth() + 1, d: ctx.now.getUTCDate() })).sort((a, b) => a.d.localeCompare(b.d));
  return dated[0]?.p ?? [...props].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

/**
 * "I'm listing 1231 Main Street next Thursday. Get me ready."
 * Saves the listing, notes the date, starts the listing checklist and drafts the Instagram announcement (a draft - nothing is posted),
 * then shows everything Mila knows and what is still open.
 */
export async function listingReadyHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const first = await addListingHandler(ctx, text);
  if (!ctx.state.last_property_id || ctx.state.pending) return first; // still needs the address / city
  const prop = await ctx.store.get("properties", ctx.userId, ctx.state.last_property_id);
  if (!prop) return first;

  // the listing date (a memory + a calendar entry the agent can see)
  const d = parseDate(text, ctx.now, ctx.tz);
  if (d) {
    await saveMemory(ctx, { scope: "property", subject_id: prop.id, key: LISTING_DATE_KEY, value: ymd(d), source: "user_stated" });
    const title = `Listing goes live — ${prop.address}`;
    const events = await ctx.store.list("calendar_events", ctx.userId);
    const start = zonedToUtc(d.y, d.m, d.d, 9, 0, ctx.tz);
    const ex = events.find((e) => e.property_id === prop.id && e.title.startsWith("Listing goes live"));
    const row = { title, kind: "other" as CalendarEvent["kind"], start_at: start.toISOString(), end_at: new Date(start.getTime() + 3_600_000).toISOString(), location: prop.address, property_id: prop.id, contact_id: null, status: "confirmed" as const, source: "mila" as const, external_id: null, synced_at: null, workflow_run_id: null, notes: null };
    if (ex) await ctx.store.update("calendar_events", ctx.userId, ex.id, row); else await ctx.store.insert("calendar_events", ctx.userId, row);
  }

  // get ahead of the work, as drafts: checklist tasks + the Instagram announcement
  const tasks = await ctx.store.list("tasks", ctx.userId);
  if (tasks.filter((t) => t.property_id === prop.id && t.kind === "task").length < 3) { ctx.steps.push("Starting the listing checklist"); await listingChecklist(ctx, prop.id); }
  const posts = await ctx.store.list("social_posts", ctx.userId);
  let drafted = false;
  if (!posts.some((p) => p.property_id === prop.id && p.category === "just_listed" && !["archived", "failed"].includes(p.status))) {
    ctx.steps.push("Drafting the Instagram announcement");
    const r = await createPosts(ctx, { category: "just_listed", platforms: ["instagram"], propertyId: prop.id }).catch(() => null);
    drafted = Boolean(r && r.ok);
  }

  ctx.steps.push("Checking what's missing");
  const brief = await buildListingBrief(ctx, prop);
  const when = brief.listingDate ? ` It goes live ${dayLabel(brief.listingDate)}.` : "";
  const block: Block = {
    type: "listing_brief", title: prop.address, subtitle: [prop.city, prop.state].filter(Boolean).join(", ") || undefined, done: brief.done, total: brief.total, sections: brief.sections,
    buttons: [{ label: "What am I missing?", style: "primary", action: { type: "prompt", text: `What am I missing for ${prop.address}?` } }, { label: "Open property", style: "quiet", href: `/properties/${prop.id}` }],
  };
  const lines = [`You're getting ${prop.address} ready.${when}`, `I started the listing checklist${drafted ? " and drafted your Instagram announcement for your approval" : ""}. ${brief.missing.length ? `${plural(brief.missing.length, "thing")} still open — ask me “what am I missing?” any time.` : "Everything on my list is covered."}`];
  return reply(lines.join(" "), [block], "chat_simple");
}

/** "What am I missing?" - the open items for a listing, in plain sentences, each with a button that does it. */
export async function whatMissingHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const prop = await resolveProperty(ctx, text);
  if (!prop) return askBack(ctx, "what_missing", text, "address", "Which listing? Give me the street address.");
  ctx.state.last_property_id = prop.id;
  ctx.steps.push("Checking what's missing");
  const brief = await buildListingBrief(ctx, prop);
  if (!brief.missing.length) return reply(`You're set on ${prop.address}. Everything on my list is covered (${brief.done} of ${brief.total}).`, [{ type: "listing_brief", title: prop.address, done: brief.done, total: brief.total, sections: brief.sections, buttons: [{ label: "Open property", style: "quiet", href: `/properties/${prop.id}` }] }], "chat_simple");
  const gaps = brief.missing.map((m) => m.gap ?? m.text);
  const sentence = gaps.length === 1 ? gaps[0] : `${gaps.slice(0, -1).join(", ")}, and ${gaps[gaps.length - 1]}`;
  const text2 = `Here's what's still open for ${prop.address}: ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}.`;
  const only = brief.sections.map((s) => ({ ...s, items: s.items.filter((i) => i.state === "missing") })).filter((s) => s.items.length);
  return reply(text2, [{ type: "listing_brief", title: "Still open", subtitle: prop.address, done: brief.done, total: brief.total, sections: only }], "chat_simple");
}
