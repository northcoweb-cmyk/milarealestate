import { getStore } from "./db/store";
import type { CalendarEvent, CalendarEventKind } from "./types";

const KIND_LABEL: Record<CalendarEventKind, string> = { showing: "Showing", open_house: "Open house", call: "Call", meeting: "Meeting", lunch: "Lunch", closing: "Closing", other: "Event" };
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** The notes that go inside a calendar entry (Google, Apple, any app): who, how to reach them, which home, and what Mila knows. Plain text, so it reads the same everywhere. */
export async function eventDescription(userId: string, e: { kind: CalendarEventKind | string; notes?: string | null; contact_id?: string | null; property_id?: string | null }): Promise<string> {
  const store = getStore();
  const [contact, prop] = await Promise.all([
    e.contact_id ? store.get("contacts", userId, e.contact_id).catch(() => null) : null,
    e.property_id ? store.get("properties", userId, e.property_id).catch(() => null) : null,
  ]);
  const lines: string[] = [];
  const label = KIND_LABEL[e.kind as CalendarEventKind] ?? "Event";
  if (contact) {
    lines.push(`${label} with ${contact.name}${contact.type && contact.type !== "other" ? ` (${contact.type.replace("_", " ")})` : ""}`);
    if (contact.phone) lines.push(`Phone: ${contact.phone}`);
    if (contact.email) lines.push(`Email: ${contact.email}`);
  }
  if (prop) {
    const where = [prop.address, [prop.city, prop.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
    const facts = [prop.list_price ? money(prop.list_price) : null, prop.beds ? `${prop.beds} bd` : null, prop.baths ? `${prop.baths} ba` : null, prop.sqft ? `${prop.sqft.toLocaleString("en-US")} sqft` : null].filter(Boolean).join(" · ");
    lines.push(`Property: ${where}${facts ? ` (${facts})` : ""}`);
  }
  if (e.notes?.trim()) lines.push(`Notes: ${e.notes.trim()}`);
  lines.push("", "Added by Mila");
  return lines.join("\n");
}

export const eventDescriptionFor = (userId: string, ev: CalendarEvent) => eventDescription(userId, ev);
