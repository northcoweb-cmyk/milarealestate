import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { aiAvailable } from "@/lib/ai/provider";
import { googleConfigured } from "@/lib/integrations/google";
import { microsoftConfigured } from "@/lib/integrations/microsoft";

type Status = "connected" | "not_configured" | "disconnected" | "error" | "coming_soon";
interface Item { id: string; name: string; description: string; status: Status; detail?: string; services?: string[]; action?: "connect" | "disconnect" | "reconnect" }

export const GET = api(async ({ profile }) => {
  const g = (await getStore().list("integrations", profile.id)).find((i) => i.provider === "google");
  const gStatus: Status = !googleConfigured() ? "not_configured" : g?.status === "connected" ? "connected" : g?.status === "error" ? "error" : "disconnected";
  const o = (await getStore().list("integrations", profile.id)).find((i) => i.provider === "outlook");
  const oStatus: Status = !microsoftConfigured() ? "coming_soon" : o?.status === "connected" ? "connected" : o?.status === "error" ? "error" : "disconnected";
  const ics = (await getStore().list("integrations", profile.id)).find((i) => i.provider === "ics" && i.status === "connected");
  const has = (s: string) => !!g?.scopes.some((x) => x.includes(s));
  const items: Item[] = [
    { id: "google_gmail", name: "Gmail", description: "Draft and send email, search relevant messages.", status: gStatus === "connected" && !has("gmail") ? "disconnected" : gStatus, detail: g?.account_label ?? (gStatus === "not_configured" ? "The server owner needs to add Google OAuth keys." : g?.error ?? undefined), services: ["gmail"] },
    { id: "google_calendar", name: "Google Calendar", description: "Check conflicts and add or move events.", status: gStatus === "connected" && !has("calendar") ? "disconnected" : gStatus, detail: g?.account_label ?? undefined, services: ["calendar"] },
    { id: "google_contacts", name: "Google Contacts", description: "Import people you already know.", status: gStatus === "connected" && !has("contacts") ? "disconnected" : gStatus, services: ["contacts"] },
    { id: "google_sheets", name: "Google Sheets", description: "Import contacts and sign-in sheets from a spreadsheet.", status: gStatus === "connected" && !has("spreadsheets") ? "disconnected" : gStatus, services: ["sheets"] },
    { id: "ai", name: "Mila Intelligence", description: "Understands free-form requests, reads photos & PDFs, live market research.", status: aiAvailable() ? "connected" : "not_configured", detail: aiAvailable() ? "Active on this server" : "The server owner needs to add an AI key (OpenAI or Anthropic)." },
    { id: "outlook", name: "Outlook", description: "Microsoft email and calendar. Works with Outlook.com, Microsoft 365 and work accounts.", status: oStatus, detail: o?.account_label ?? undefined },
    { id: "apple_calendar", name: "Apple Calendar", description: "Bring in your iCloud calendar with its share link. Read-only, no password.", status: ics ? "connected" : "disconnected", detail: ics?.account_label ?? undefined },
    { id: "sms", name: "Text messaging (SMS)", description: "Send and receive texts with clients.", status: "coming_soon" },
    { id: "mls", name: "MLS", description: "MLS access is granted by your MLS or broker, so it can't be a one-click connect for everyone. Mila already pulls public property details, estimates and area facts without it.", status: "coming_soon", detail: "Tell us your MLS and we'll tell you if it can connect." },
  ];
  return { items, googleConfigured: googleConfigured(), googleAccount: g?.account_label ?? null };
});
