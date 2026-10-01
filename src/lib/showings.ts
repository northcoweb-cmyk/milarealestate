import type { Ctx } from "./agent/context";
import { fmtDay, fmtTime, relativeDays } from "./time";

/** Everything a showing / open-house card needs, joined from events, properties, contacts and photos. */
export interface ShowingCardData {
  eventId: string;
  kind: "showing" | "open_house";
  title: string;
  when: { day: string; time: string; endTime: string; startIso: string };
  property: { id: string; address: string; city: string | null; state: string | null; zip: string | null; verified: boolean; price: number | null; beds: number | null; baths: number | null; sqft: number | null; listingUrl: string | null; isDemo: boolean };
  images: string[];
  streetView: boolean;
  contact: { id: string; name: string; phone: string | null; email: string | null; color: string } | null;
}

export async function loadShowings(ctx: Ctx, days = 10, limit = 8): Promise<ShowingCardData[]> {
  const { store, userId, now, tz } = ctx;
  const horizon = now.getTime() + days * 86_400_000;
  const events = (await store.list("calendar_events", userId))
    .filter((e) => e.status === "confirmed" && (e.kind === "showing" || e.kind === "open_house") && e.property_id && new Date(e.end_at).getTime() > now.getTime() && new Date(e.start_at).getTime() < horizon)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .slice(0, limit);
  if (!events.length) return [];
  const [props, imgs, contacts] = await Promise.all([store.list("properties", userId), store.list("property_images", userId), store.list("contacts", userId)]);
  const mapsKey = Boolean(process.env.GOOGLE_MAPS_API_KEY);
  const out: ShowingCardData[] = [];
  for (const e of events) {
    const p = props.find((x) => x.id === e.property_id);
    if (!p) continue;
    const c = e.contact_id ? contacts.find((x) => x.id === e.contact_id) : null;
    out.push({
      eventId: e.id, kind: e.kind as "showing" | "open_house", title: e.title,
      when: { day: relativeDays(e.start_at, now, tz) === fmtDay(e.start_at, tz) || ["Today", "Tomorrow"].includes(relativeDays(e.start_at, now, tz)) ? relativeDays(e.start_at, now, tz) : relativeDays(e.start_at, now, tz), time: fmtTime(e.start_at, tz), endTime: fmtTime(e.end_at, tz), startIso: e.start_at },
      property: { id: p.id, address: p.address, city: p.city, state: p.state, zip: p.zip, verified: p.verified, price: p.verified ? p.list_price : null, beds: p.verified ? p.beds : null, baths: p.verified ? p.baths : null, sqft: p.verified ? p.sqft : null, listingUrl: p.listing_url, isDemo: p.is_demo },
      images: imgs.filter((i) => i.property_id === p.id).sort((a, b) => a.position - b.position).map((i) => i.url),
      streetView: mapsKey && Boolean(p.city && p.state),
      contact: c ? { id: c.id, name: c.name, phone: c.phone, email: c.email, color: c.avatar_color } : null,
    });
  }
  return out;
}
