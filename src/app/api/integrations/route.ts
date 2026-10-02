import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { aiAvailable } from "@/lib/ai/provider";
import { googleConfigured } from "@/lib/integrations/google";

type Status = "connected" | "not_configured" | "disconnected" | "error" | "coming_soon";
interface Item { id: string; name: string; description: string; status: Status; detail?: string; services?: string[]; action?: "connect" | "disconnect" | "reconnect" }

export const GET = api(async ({ profile }) => {
  const g = (await getStore().list("integrations", profile.id)).find((i) => i.provider === "google");
  const gStatus: Status = !googleConfigured() ? "not_configured" : g?.status === "connected" ? "connected" : g?.status === "error" ? "error" : "disconnected";
  const has = (s: string) => !!g?.scopes.some((x) => x.includes(s));
  const items: Item[] = [
    { id: "google_gmail", name: "Gmail", description: "Draft and send email, search relevant messages.", status: gStatus === "connected" && !has("gmail") ? "disconnected" : gStatus, detail: g?.account_label ?? (gStatus === "not_configured" ? "The server owner needs to add Google OAuth keys." : g?.error ?? undefined), services: ["gmail"] },
    { id: "google_calendar", name: "Google Calendar", description: "Check conflicts and add or move events.", status: gStatus === "connected" && !has("calendar") ? "disconnected" : gStatus, detail: g?.account_label ?? undefined, services: ["calendar"] },
    { id: "google_contacts", name: "Google Contacts", description: "Import people you already know.", status: gStatus === "connected" && !has("contacts") ? "disconnected" : gStatus, services: ["contacts"] },
    { id: "google_sheets", name: "Google Sheets", description: "Import contacts and sign-in sheets from a spreadsheet.", status: gStatus === "connected" && !has("spreadsheets") ? "disconnected" : gStatus, services: ["sheets"] },
    { id: "ai", name: "Mila Intelligence", description: "Understands free-form requests, reads photos & PDFs, live market research.", status: aiAvailable() ? "connected" : "not_configured", detail: aiAvailable() ? "Active on this server" : "The server owner needs to add an AI key (OpenAI or Anthropic)." },
    { id: "outlook", name: "Outlook (Mail & Calendar)", description: "Microsoft email and calendar.", status: "coming_soon" },
    { id: "apple_calendar", name: "Apple Calendar", description: "iCloud calendar.", status: "coming_soon" },
    { id: "sms", name: "Text messaging (SMS)", description: "Send and receive texts with clients.", status: "coming_soon" },
    { id: "mls", name: "MLS / listing data", description: "Search live listings and pull verified property details.", status: "coming_soon" },
  ];
  return { items, googleConfigured: googleConfigured(), googleAccount: g?.account_label ?? null };
});
