import type { Block, Contact } from "../types";
import type { Ctx } from "./context";
import { type HandlerOut, reply } from "./handlers/types";
import { listMemories, saveMemory } from "./memory";

/**
 * Mila listens to everything the agent says and keeps what is durable: how they work, their market, goals,
 * and what each client wants. Deterministic (no model call), so it is free, instant and never invents facts.
 * Every fact lands in `memories`, visible and editable in More → Memory, and feeds replies and drafts.
 */
const sentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const clip = (s: string, n = 220) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

const SELF: { key: string; scope: "user" | "business"; re: RegExp; take?: (m: RegExpExecArray) => string }[] = [
  { key: "Market", scope: "business", re: /\b(?:i (?:mostly |mainly )?(?:work|sell|farm|operate|focus) (?:in|on|around)|my (?:market|farm|area|territory) is)\s+([^.!?\n]{3,80})/i },
  { key: "Specialty", scope: "business", re: /\bi (?:specialize|specialise|focus) in\s+([^.!?\n]{3,80})|\bmy (?:niche|specialty|speciality) is\s+([^.!?\n]{3,80})/i },
  { key: "Goal", scope: "business", re: /\b(?:my goal is|i(?:'m| am) (?:trying|aiming|working) (?:to|toward)|i want to (?:close|sell|hit|get|reach|do))\s+([^.!?\n]{3,120})/i },
  { key: "Team", scope: "business", re: /\bi(?:'m| am) (?:on|part of|with) (?:the |a )?([^.!?\n]{3,60}team[^.!?\n]{0,40})|\bmy (?:assistant|partner|team) (?:is|are)\s+([^.!?\n]{3,80})/i },
  { key: "Availability", scope: "user", re: /\b(i (?:don't|do not|never|can't|cannot) (?:work|show|take (?:calls|meetings))[^.!?\n]{2,80}|i(?:'m| am) (?:off|unavailable|out)(?: on| every)?[^.!?\n]{2,60})/i, take: (m) => m[1] },
  { key: "Preference", scope: "user", re: /\bi (?:always|usually|prefer|like to|love to|hate to|never) ([^.!?\n]{4,120})/i, take: (m) => m[0] },
  { key: "Writing style", scope: "user", re: /\b(?:keep (?:my )?(?:emails|texts|messages|captions|posts) ([^.!?\n]{3,80})|(?:i )?(?:sign|end) (?:my )?(?:emails|texts) (?:with|as) ([^.!?\n]{3,60}))/i, take: (m) => m[0] },
];

const CLIENT: { key: string; re: RegExp }[] = [
  { key: "Wants", re: /\b(?:wants?|needs?|is looking for|are looking for|looking for|hoping for|must have|loves?)\b[^.!?\n]{3,140}/i },
  { key: "Budget", re: /\b(?:budget|pre-?approved|approved for|max(?:imum)?|up to)\b[^.!?\n]{0,30}\$?\s?\d[\d,.]*\s?(?:k|m|million)?[^.!?\n]{0,40}/i },
  { key: "Timeline", re: /\b(?:moving|closing|lease (?:ends|is up)|needs? to (?:move|sell|buy)|by (?:the )?(?:end of |next |this )?(?:spring|summer|fall|winter|january|february|march|april|may|june|july|august|september|october|november|december))[^.!?\n]{0,100}/i },
  { key: "Family", re: /\b(?:has|have|with)\b[^.!?\n]{0,30}\b(?:kids?|children|baby|dogs?|cats?|pets?|spouse|husband|wife|partner|parents?|mother|father)\b[^.!?\n]{0,60}/i },
  { key: "Prefers", re: /\bprefers?\b[^.!?\n]{3,100}/i },
  { key: "Concern", re: /\b(?:worried|nervous|concerned|hesitant|afraid|stressed) (?:about|that)\b[^.!?\n]{3,120}/i },
];

export interface Learned { scope: "user" | "business" | "contact"; key: string; value: string; contact?: Contact }

/** Returns how many facts were saved. Never throws. */
export async function learnFromTurn(ctx: Ctx, text: string): Promise<number> {
  return (await learnDetailed(ctx, text)).length;
}

/** Saves the durable facts in a message and returns exactly what was saved. Never throws. */
export async function learnDetailed(ctx: Ctx, text: string): Promise<Learned[]> {
  const saved: Learned[] = [];
  try {
    if (!text || text.length < 12 || text.length > 1500) return saved;
    const known = await listMemories(ctx);
    const have = (scope: string, subject: string | null, key: string, value: string) =>
      known.some((m) => m.scope === scope && (m.subject_id ?? null) === subject && m.key === key && m.value.toLowerCase() === value.toLowerCase());
    for (const s of sentences(text)) {
      // statements about the agent
      if (/\b(?:i|i'm|i am|my)\b/i.test(s) && !/\?\s*$/.test(s)) {
        for (const r of SELF) {
          const m = r.re.exec(s);
          if (!m) continue;
          const value = clip((r.take ? r.take(m) : (m[1] ?? m[2] ?? m[0])).trim().replace(/[,;:\s]+$/, ""));
          if (value.length < 4 || have(r.scope, null, r.key, value)) continue;
          // preferences/goals accumulate (distinct key per sentence); single-valued facts replace
          const multi = r.key === "Preference" || r.key === "Goal" || r.key === "Availability" || r.key === "Writing style";
          await saveMemory(ctx, { scope: r.scope, key: multi ? `${r.key}: ${clip(value, 40)}` : r.key, value, source: "inferred", confidence: 0.8 });
          saved.push({ scope: r.scope, key: r.key, value });
        }
      }
      // statements about a client we know
      const contacts = await ctx.store.list("contacts", ctx.userId);
      for (const c of contacts) {
        const first = c.name.split(/\s+/)[0];
        const esc = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // short first names ("Li", "Mc") only count when written as a capitalised name, so ordinary words never match
        if (/\?\s*$/.test(s) || !(first.length >= 3 ? new RegExp(`\\b${esc}\\b`, "i").test(s) : new RegExp(`(?<![\\p{L}])${esc}(?![\\p{L}])`, "u").test(s))) continue;
        for (const r of CLIENT) {
          const m = r.re.exec(s);
          if (!m) continue;
          let value = m[0].trim().replace(/\s+(?:and|but)\s+(?:also\s+)?(?:wants?|needs?|has|have|is|are|loves?|prefers?)\b.*$/i, "").replace(/^(?:wants?|needs?|is looking for|are looking for|looking for|hoping for|loves?|prefers?)\s+/i, "").replace(/[,;:\s]+$/, "");
          value = clip(value);
          if (value.length < 3 || have("contact", c.id, r.key, value)) continue;
          await saveMemory(ctx, { scope: "contact", subject_id: c.id, key: r.key, value, source: "inferred", confidence: 0.75 });
          saved.push({ scope: "contact", key: r.key, value, contact: c });
        }
      }
    }
    return saved;
  } catch (e) {
    console.warn("[mila] learn skipped", e);
    return saved;
  }
}

const BUYING = /\b(pre-?approved|approved for|budget|wants? (?:a |an |to buy)|looking (?:to buy|for a|for an)|buy(?:ing)?|offer on)\b/i;
const SELLING = /\b(list(?:ing)? (?:their|his|her|the|my)|sell(?:ing)? (?:their|his|her|the)|wants? to sell|thinking of selling|cma|price (?:their|the) home)\b/i;

/**
 * When the agent TELLS Mila something about a client (not asks), Mila saves it, says exactly what she saved,
 * checks it against what she already knows (a "seller" who is pre-approved to buy), and offers the obvious next step.
 */
export async function clientUpdateHandler(ctx: Ctx, text: string, known: Contact[]): Promise<HandlerOut | null> {
  if (/\?\s*$/.test(text) || /^(what|who|when|where|how|why|do|does|did|is|are|can|could|show|tell|find|list)\b/i.test(text.trim())) return null;
  const items = (await learnDetailed(ctx, text)).filter((i) => i.contact);
  if (!items.length) return noteAboutClient(ctx, text, known);
  const c = items[0].contact!;
  const first = c.name.split(/\s+/)[0];
  const lines = items.map((i) => `• ${i.key}: ${i.value}`).join("\n");
  const blocks: Block[] = [];
  let ask = "";
  const buying = BUYING.test(text), selling = SELLING.test(text);
  if (buying && c.type === "seller") ask = `${first} is saved as a seller, but this sounds like they're buying too. Should I add that? I'll keep them as a seller and tag them as a buyer.`;
  else if (selling && (c.type === "buyer" || c.type === "lead")) ask = `${first} is saved as a ${c.type}, but this sounds like they're selling. Should I note that too?`;
  if (ask) blocks.push({ type: "choice", title: "Quick check", body: ask, buttons: [
    { label: buying ? "Yes, also a buyer" : "Yes, also a seller", style: "primary", action: { type: "tag_contact", contactId: c.id, tag: buying ? "buyer" : "seller" } },
    { label: "No, leave as is", style: "quiet", action: { type: "noop" } },
  ] });
  const mentionsBudget = items.some((i) => i.key === "Budget" || i.key === "Wants");
  if (mentionsBudget || /\b(wants|looking)\b/i.test(text)) blocks.push({ type: "choice", title: `Next for ${first}`, buttons: [
    { label: "Remind me to send listings", style: "secondary", action: { type: "quick_task", contactId: c.id, title: `Send listings to ${first}`, subtitle: items.map((i) => i.value).join(" • ") } },
    { label: "Open profile", style: "quiet", href: `/contacts/${c.id}` },
  ] });
  void known;
  return reply(`Got it. Saved to ${first}'s profile:\n${lines}${ask ? "" : "\nI'll use this when I draft messages and suggest homes."}`, blocks, "chat_simple");
}

/** Everything Mila knows that is relevant to this message, as plain text for the model. */
export async function knowledgeFor(ctx: Ctx, text: string): Promise<string> {
  const all = await listMemories(ctx);
  const lines: string[] = [];
  for (const m of all.filter((x) => x.scope === "user" || x.scope === "business").slice(0, 25)) lines.push(`- ${m.key}: ${m.value}`);
  const contacts = await ctx.store.list("contacts", ctx.userId);
  for (const c of contacts) {
    const first = c.name.split(/\s+/)[0];
    if (first.length < 3 || !new RegExp(`\\b${first}\\b`, "i").test(text)) continue;
    const { contactFacts } = await import("./memory");
    const f = await contactFacts(ctx, c);
    lines.push(`- Client ${c.name}${c.status ? ` (${c.status})` : ""}: ${f.join("; ") || "no details yet"}`);
  }
  return lines.join("\n");
}


/**
 * "Dana hates carpet" / "Priya is relocating from Chicago": a plain statement that starts with a saved client's name is kept on
 * that client verbatim, so nothing the agent says about a person is ever dropped just because it didn't fit a known pattern.
 */
async function noteAboutClient(ctx: Ctx, text: string, known: Contact[]): Promise<HandlerOut | null> {
  const t = text.trim();
  if (t.length < 8 || t.length > 400 || /^(remind|call|email|text|send|schedule|book|move|cancel|draft|make|show|tell|find|add|set|create|delete|remove|undo|what|who|when|where|how|why)\b/i.test(t)) return null;
  for (const c of known) {
    const m = new RegExp(`^(?:${c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${c.name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?:['’]s)?\\s+(.{4,})$`, "iu").exec(t);
    if (!m) continue;
    const value = clip(m[1].replace(/[.!\s]+$/, ""));
    const first = c.name.split(/\s+/)[0];
    const mems = await listMemories(ctx);
    const lv = value.toLowerCase();
    // already known (the structured patterns saved it earlier, or this exact note exists): acknowledge, never store twice
    const known1 = CLIENT.some((r) => r.re.test(t)) || mems.some((x) => x.scope === "contact" && x.subject_id === c.id && (x.value.toLowerCase() === lv || x.value.toLowerCase().includes(lv) || lv.includes(x.value.toLowerCase())));
    if (known1) { ctx.state.last_contact_ids = [c.id]; return reply(`Got it — that's already on ${first}'s profile.`, [], "chat_simple"); }
    await saveMemory(ctx, { scope: "contact", subject_id: c.id, key: "Note", value, source: "user_stated", confidence: 0.9 });
    ctx.state.last_contact_ids = [c.id];
    return reply(`Got it. Saved to ${first}'s profile:\n• Note: ${value}\nI'll use this when I draft messages and suggest homes.`, [], "chat_simple");
  }
  return null;
}
