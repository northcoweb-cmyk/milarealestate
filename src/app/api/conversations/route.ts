import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/[*#`]/g, "").trim();
const titleOf = (first: string | undefined, title: string | null) => (title?.trim() ? title.trim() : first ? clean(first).slice(0, 56) + (clean(first).length > 56 ? "…" : "") : "New chat");

/** Your chats, newest first, each with a readable title and the last line. `?q=` searches the words in your own messages and Mila's replies. Everything is scoped to the signed-in person. */
export const GET = api(async ({ profile, url }) => {
  const store = getStore();
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  const [convs, msgs] = await Promise.all([store.list("conversations", profile.id), store.list("messages", profile.id)]);
  const by = new Map<string, typeof msgs>();
  for (const m of msgs) { const l = by.get(m.conversation_id) ?? []; l.push(m); by.set(m.conversation_id, l); }
  const rows = convs.map((c) => {
    const list = (by.get(c.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const firstUser = list.find((m) => m.role === "user")?.content;
    const last = list[list.length - 1];
    const hit = q ? list.find((m) => m.content.toLowerCase().includes(q)) : null;
    return { id: c.id, title: titleOf(firstUser, c.title), snippet: clean((hit ?? last)?.content ?? "").slice(0, 110), updated_at: last?.created_at ?? c.updated_at, count: list.length, match: !!hit, open: !!c.state?.pending };
  }).filter((r) => r.count > 0 && (!q || r.match || r.title.toLowerCase().includes(q))).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 50);
  return { conversations: rows };
});
