import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

export const GET = api(async ({ profile, url }) => {
  const store = getStore();
  const convs = (await store.list("conversations", profile.id)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const conv = convs[0];
  if (!conv) return { conversationId: null, messages: [] };
  const limit = Math.min(Math.max(Math.floor(Number(url.searchParams.get("limit") ?? 40)) || 40, 1), 200);
  const msgs = (await store.list("messages", profile.id)).filter((m) => m.conversation_id === conv.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { conversationId: conv.id, messages: msgs.slice(-limit) };
});

// Start a fresh conversation (context for the old one stays stored)
export const POST = api(async ({ profile }) => {
  const c = await getStore().insert("conversations", profile.id, { title: null, state: {} });
  return { conversationId: c.id };
});
