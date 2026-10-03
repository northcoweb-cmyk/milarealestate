import { api, bad, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { cleanText } from "@/lib/server/sanitize";
import { CACHE_PREFIX, listMemories, saveMemory } from "@/lib/agent/memory";

export const GET = api(async ({ profile }) => {
  const ctx = await buildCtx(profile);
  const [memories, contacts, props] = await Promise.all([listMemories(ctx), ctx.store.list("contacts", profile.id), ctx.store.list("properties", profile.id)]);
  const subjects: Record<string, string> = {};
  for (const c of contacts) subjects[c.id] = c.name;
  for (const p of props) subjects[p.id] = p.address;
  return { memories, subjects };
});

export const POST = api(async ({ profile, req }) => {
  const b = await readJson(req);
  if (typeof b.key !== "string" || typeof b.value !== "string" || !b.key.trim() || !b.value.trim()) throw bad("Add a title and a note.");
  const scope = b.scope ?? "user";
  if (!["user", "business", "contact", "property"].includes(scope)) throw bad("Unknown memory type.");
  const key = cleanText(b.key, 80), value = cleanText(b.value, 1000, true);
  if (key.toLowerCase().startsWith(CACHE_PREFIX)) throw bad("That title is reserved.");
  const ctx = await buildCtx(profile);
  if (b.subject_id != null && !(typeof b.subject_id === "string" && ((await ctx.store.get("contacts", profile.id, b.subject_id)) || (await ctx.store.get("properties", profile.id, b.subject_id))))) throw bad("That contact or property wasn't found.");
  return { memory: await saveMemory(ctx, { scope, subject_id: b.subject_id ?? null, key, value, source: "user_stated", pinned: !!b.pinned }) };
});
