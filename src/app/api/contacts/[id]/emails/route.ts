import { api, bad } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { getGoogle, gmail } from "@/lib/integrations/google";
import { outlook, outlookConnected } from "@/lib/integrations/microsoft";

/** Emails with one person: what Mila sent for the agent, plus (when Gmail or Outlook is connected) their recent back-and-forth, replies included. Read-only. */
export const GET = api<{ id: string }>(async ({ profile, params }) => {
  const store = getStore();
  const c = await store.get("contacts", profile.id, params.id);
  if (!c) throw bad("Contact not found.");
  const sent = (await store.list("emails", profile.id)).filter((e) => e.contact_id === c.id).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 10).map((e) => ({ subject: e.subject, fromThem: e.direction === "in", at: e.occurred_at, snippet: e.snippet ?? "" }));
  let live: { subject: string; fromThem: boolean; at: string; snippet: string }[] = [];
  let source: "gmail" | "outlook" | null = null, note: string | null = null;
  if (!c.email) note = "Add their email address to see your emails with them.";
  else {
    try {
      const g = await getGoogle(profile.id);
      if (g?.hasScope("gmail")) {
        source = "gmail";
        live = (await gmail.search(profile.id, `from:${c.email} OR to:${c.email}`, 8)).map((m) => ({ subject: m.subject || "(no subject)", fromThem: m.from.toLowerCase().includes(c.email!.toLowerCase()), at: m.date, snippet: m.snippet }));
      } else if (await outlookConnected(profile.id)) { source = "outlook"; live = await outlook.withPerson(profile.id, c.email, 8); }
      else note = "Connect Gmail or Outlook in Settings to see their replies here.";
    } catch { note = "Couldn't read your inbox just now. Try again in a moment."; }
  }
  return { sent, live, source, note };
});
