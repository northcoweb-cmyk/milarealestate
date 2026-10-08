import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

const FRESH_MS = 6 * 3_600_000;

async function latestConversation(userId: string) {
  const list = (await getStore().list("conversations", userId)).sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at));
  return list[0] ?? null;
}

/** "Did you send your text to Maria?" The last text Mila drafted and the agent opened in Messages, if it is recent and not yet answered. */
export const GET = api(async ({ profile }) => {
  const c = await latestConversation(profile.id);
  const p = c?.state?.pending_text;
  return p && Date.now() - p.at < FRESH_MS ? { pending: { name: p.name } } : { pending: null };
});

/** The answer: sent -> it goes in their timeline and last-contact date; not yet -> forgotten, nothing logged. */
export const POST = api(async ({ profile, req }) => {
  const { sent } = (await req.json().catch(() => ({}))) as { sent?: boolean };
  const store = getStore();
  const c = await latestConversation(profile.id);
  const p = c?.state?.pending_text;
  if (!c || !p) return { ok: true };
  if (sent) {
    const now = new Date().toISOString();
    await store.insert("contact_events", profile.id, { contact_id: p.contact_id, kind: "text", title: "Text sent", detail: null, occurred_at: now });
    await store.update("contacts", profile.id, p.contact_id, { last_contact_at: now });
  }
  await store.update("conversations", profile.id, c.id, { state: { ...c.state, pending_text: null } });
  return { ok: true };
});
