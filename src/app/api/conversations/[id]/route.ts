import { api, bad, notFound, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

/** One chat's messages (yours only). */
export const GET = api<{ id: string }>(async ({ profile, params, url }) => {
  const store = getStore();
  const c = await store.get("conversations", profile.id, params.id);
  if (!c) throw notFound("That chat");
  const limit = Math.min(Math.max(Math.floor(Number(url.searchParams.get("limit") ?? 80)) || 80, 1), 300);
  const msgs = (await store.list("messages", profile.id)).filter((m) => m.conversation_id === c.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { conversationId: c.id, title: c.title, messages: msgs.slice(-limit) };
});

/** Rename a chat. */
export const PATCH = api<{ id: string }>(async ({ profile, params, req }) => {
  const b = await readJson<{ title?: string }>(req);
  if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 80) throw bad("Give the chat a short title.");
  const c = await getStore().update("conversations", profile.id, params.id, { title: b.title.trim() });
  if (!c) throw notFound("That chat");
  return { ok: true };
});

/**
 * Delete THIS CHAT only. Your contacts, properties, calendar, drafts and approvals are separate records and stay exactly as they are.
 * (Deleting business records is a different action in Settings > Privacy.)
 */
export const DELETE = api<{ id: string }>(async ({ profile, params, url }) => {
  if (url.searchParams.get("confirm") !== "1") throw bad("Deleting a chat needs confirmation.");
  const store = getStore();
  const c = await store.get("conversations", profile.id, params.id);
  if (!c) throw notFound("That chat");
  const n = await store.removeWhere("messages", profile.id, (m) => (m as { conversation_id?: string }).conversation_id === c.id);
  await store.removeWhere("conversations", profile.id, (x) => x.id === c.id);
  return { ok: true, messagesDeleted: n, note: "Only the chat was deleted. Your contacts, properties, calendar and drafts are unchanged." };
});
