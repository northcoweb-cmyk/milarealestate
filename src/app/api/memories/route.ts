import { api, bad, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { listMemories, saveMemory } from "@/lib/agent/memory";

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
  if (!b.key?.trim() || !b.value?.trim()) throw bad("Add a title and a note.");
  const ctx = await buildCtx(profile);
  return { memory: await saveMemory(ctx, { scope: b.scope ?? "user", subject_id: b.subject_id ?? null, key: b.key.trim(), value: b.value.trim(), source: "user_stated", pinned: !!b.pinned }) };
});
