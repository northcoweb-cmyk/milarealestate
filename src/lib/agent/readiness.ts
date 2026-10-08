import { kindFacts, kindForProperty, kindMissing } from "../property-kind";
import type { BriefItem, BriefSection, Property } from "../types";
import type { Ctx } from "./context";
import { fullMoney, plural } from "./context";
import { fmtDay, fmtTime } from "../time";
import { rentcastConfigured } from "../listing-data/rentcast";
import type { LookupMemory } from "./property-lookup";

/**
 * Operational memory for one listing: everything Mila already knows (property, seller, dates, notes, comps, appointments, contacts,
 * marketing, follow-ups) and, just as important, what is still missing. Computed from existing records - nothing new to keep up.
 */
export interface ListingBrief {
  property: Property;
  listingDate: string | null; // YYYY-MM-DD
  sections: BriefSection[];
  missing: BriefItem[];
  done: number;
  total: number;
}

/** "2026-10-08" -> "Thursday, Oct 8" (a calendar date has no time zone, so format it as UTC noon). */
export const dayLabel = (ymd: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }).format(new Date(`${ymd}T12:00:00Z`));
export const LISTING_DATE_KEY = "Listing date";
export const SELLER_KEY = "Seller";
const AGREEMENT = /listing (?:agreement|contract)|exclusive (?:right|listing)|\b(?:lac|ela)\b|listing_agreement/i;

export async function buildListingBrief(ctx: Ctx, prop: Property): Promise<ListingBrief> {
  const { store, userId, now, tz } = ctx;
  const [mems, contacts, events, tasks, docs, posts, drafts, images] = await Promise.all([
    store.list("memories", userId), store.list("contacts", userId), store.list("calendar_events", userId), store.list("tasks", userId),
    store.list("documents", userId), store.list("social_posts", userId), store.list("email_drafts", userId), store.list("property_images", userId),
  ]);
  const street = prop.address;
  const mine = mems.filter((m) => m.scope === "property" && m.subject_id === prop.id);
  const val = (k: string) => mine.find((m) => m.key === k)?.value ?? null;
  const ask = (text: string) => ({ type: "prompt", text }) as const;
  const sections: BriefSection[] = [];
  const add = (emoji: string, label: string, items: BriefItem[]) => { if (items.length) sections.push({ emoji, label, items }); };
  const lookup: LookupMemory | null = (() => { try { const raw = mems.find((m) => m.key === `cache:property_lookup:${prop.id}`)?.value; return raw ? (JSON.parse(raw) as LookupMemory) : null; } catch { return null; } })();

  // ---- the home
  const kind = kindForProperty(prop, mems);
  const rest = kind.group === "commercial" || kind.group === "land" || kind.group === "multifamily";
  const facts = (rest ? kindFacts(kind, prop, fullMoney) : [prop.beds != null && `${prop.beds} bd`, prop.baths != null && `${prop.baths} ba`, prop.sqft && `${prop.sqft.toLocaleString("en-US")} sq ft`, prop.list_price && fullMoney(prop.list_price)].filter(Boolean)).join(" · ");
  const place = [prop.city, [prop.state, prop.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const home: BriefItem[] = [{ text: `${street}${place ? `, ${place}` : ""}`, state: "info" }];
  const gaps = kindMissing(kind, prop);
  home.push(!gaps.length ? { text: facts, state: "done" } : { text: facts || `No ${gaps.slice(0, 3).join(", ")} yet`, state: "missing", gap: `the ${gaps.join(", ")} ${gaps.length === 1 ? "is" : "are"} incomplete`, button: { label: "Add details", style: "secondary", href: `/properties/${prop.id}` } });
  add("🏠", kind.group !== "unknown" && kind.group !== "residential" ? `The ${kind.label.toLowerCase()}` : kind.group === "residential" && kind.label !== "Single-family home" ? `The ${kind.label.toLowerCase()}` : "The home", home);

  // ---- seller + dates
  const sellerName = val(SELLER_KEY)?.toLowerCase();
  const seller = (sellerName ? contacts.find((c) => c.name.toLowerCase() === sellerName) : undefined) ?? contacts.find((c) => c.type === "seller" && (c.notes ?? "").toLowerCase().includes(street.toLowerCase()));
  const listingDate = val(LISTING_DATE_KEY);
  const dateLabel = (d: string) => dayLabel(d);
  add("👤", "Seller & timing", [
    seller ? { text: `${seller.name}${seller.email ? ` · ${seller.email}` : ""}${seller.phone ? ` · ${seller.phone}` : ""}`, state: "done" } : { text: "No seller saved for this listing", state: "missing", gap: "you haven't saved the seller", button: { label: "Add the seller", style: "secondary", action: ask(`The sellers for ${street} are `) } },
    listingDate ? { text: `Goes live ${dateLabel(listingDate)}`, state: "done" } : { text: "No listing date set", state: "missing", gap: "there's no listing date", button: { label: "Set the date", style: "secondary", action: ask(`I'm listing ${street} on `) } },
  ]);

  // ---- paperwork + photos
  const agreement = docs.find((d) => d.property_id === prop.id && AGREEMENT.test(`${d.name} ${d.summary ?? ""} ${(d.text_content ?? "").slice(0, 1500)}`));
  const photographer = events.find((e) => e.status === "confirmed" && /photograph|photo shoot|photos/i.test(e.title) && (e.property_id === prop.id || e.title.toLowerCase().includes(street.toLowerCase())));
  const hasPhotos = images.some((i) => i.property_id === prop.id);
  add("📄", "Paperwork & photos", [
    agreement ? { text: `Listing agreement uploaded (${agreement.name})`, state: "done" } : { text: "Listing agreement not uploaded", state: "missing", gap: "your listing agreement hasn't been uploaded", button: { label: "Upload it", style: "secondary", href: `/properties/${prop.id}` } },
    photographer ? { text: `Photographer booked ${fmtDay(photographer.start_at, tz)} ${fmtTime(photographer.start_at, tz)}`, state: "done" }
      : hasPhotos ? { text: "Photos added", state: "done" }
      : { text: "No photographer scheduled and no photos yet", state: "missing", gap: "you haven't scheduled the photographer", button: { label: "Schedule photographer", style: "secondary", action: ask(`Schedule the photographer at ${street}`) } },
  ]);

  // ---- appointments
  const upcoming = events.filter((e) => e.status === "confirmed" && e.property_id === prop.id && new Date(e.end_at).getTime() > now.getTime() && e.notes !== "Transaction milestone").sort((a, b) => a.start_at.localeCompare(b.start_at));
  const openHouse = upcoming.find((e) => e.kind === "open_house");
  const appts: BriefItem[] = upcoming.slice(0, 4).map((e) => ({ text: `${e.title.split(" — ")[0]} · ${fmtDay(e.start_at, tz)} ${fmtTime(e.start_at, tz)}`, state: "info" as const }));
  appts.push(openHouse ? { text: "Open house scheduled", state: "done" } : { text: "No open house scheduled", state: "missing", gap: "you don't have an open house scheduled", button: { label: "Set up open house", style: "secondary", action: ask(`Set up an open house at ${street}`) } });
  add("📅", "Appointments", appts);

  // ---- comps + relevant people
  const comps = lookup?.extra?.comps ?? [];
  const compItems: BriefItem[] = comps.length
    ? [{ text: `${plural(comps.length, "comparable home")} pulled`, state: "done" }, ...comps.slice(0, 3).map((c) => ({ text: `${c.address}${c.price ? ` · ${fullMoney(c.price)}` : ""}${c.beds != null ? ` · ${c.beds} bd` : ""}${c.distance_mi != null ? ` · ${c.distance_mi.toFixed(1)} mi` : ""}`, state: "info" as const }))]
    : rentcastConfigured() ? [{ text: "Comparable homes not pulled yet", state: "missing", gap: "you haven't pulled comps", button: { label: "Pull comps", style: "secondary", action: ask(`Prep for ${street}`) } }] : [];
  if (lookup?.extra?.est_value) compItems.push({ text: `Estimated value ${fullMoney(lookup.extra.est_value)}${lookup.extra.est_low && lookup.extra.est_high ? ` (range ${fullMoney(lookup.extra.est_low)}–${fullMoney(lookup.extra.est_high)})` : ""} — an automated estimate`, state: "info" });
  add("📊", "Pricing & comps", compItems);

  const price = prop.list_price;
  const fits = price ? contacts.filter((c) => (c.type === "buyer" || c.type === "lead") && c.status !== "inactive" && c.status !== "closed" && c.budget_max != null && c.budget_max >= price * 0.9 && (c.budget_min == null || c.budget_min <= price * 1.1)).slice(0, 3) : [];
  add("👥", "Relevant contacts", fits.length ? [{ text: `${plural(fits.length, "buyer")} whose budget fits: ${fits.map((c) => c.name.split(" ")[0]).join(", ")}`, state: "info", button: { label: "Message them", style: "secondary", action: ask(`Draft an email to ${fits[0].name} about ${street}`) } }] : []);

  // ---- notes Mila already has
  const notes = mine.filter((m) => !m.key.startsWith("cache:") && ![LISTING_DATE_KEY, SELLER_KEY, "Stage", "Transaction"].includes(m.key)).slice(0, 4);
  add("📝", "What I remember", notes.map((m) => ({ text: `${m.key}: ${m.value}`, state: "info" as const })));

  // ---- marketing + follow-ups
  const livePost = posts.find((p) => p.property_id === prop.id && p.category === "just_listed" && !["archived", "failed"].includes(p.status));
  const stateWord = (s: string) => (s === "draft" || s === "pending_approval" ? "draft ready for review" : s === "approved_unpublished" ? "ready to post" : s === "scheduled" ? "planned" : s === "published" ? "posted" : s);
  const openTasks = tasks.filter((t) => t.property_id === prop.id && t.status === "open" && t.kind === "task");
  const sellerMail = drafts.find((d) => d.property_id === prop.id && (!seller || d.contact_id === seller.id || d.to_contact_ids.includes(seller.id)));
  const follow: BriefItem[] = [
    livePost ? { text: `Instagram announcement: ${stateWord(livePost.status)}`, state: "done", button: { label: "Open", style: "quiet", href: "/content" } } : { text: "No Instagram announcement yet", state: "missing", gap: "you haven't prepared the Instagram announcement", button: { label: "Make it", style: "secondary", action: ask(`Create an Instagram post for ${street}`) } },
    openTasks.length >= 3 ? { text: `Listing checklist started — ${plural(openTasks.length, "task")} open`, state: "done", button: { label: "See tasks", style: "quiet", href: "/tasks" } } : { text: "Listing checklist not started", state: "missing", gap: "the listing checklist hasn't been started", button: { label: "Start checklist", style: "secondary", action: { type: "listing_checklist", propertyId: prop.id } } },
  ];
  if (seller) follow.push(sellerMail ? { text: `Seller update drafted for ${seller.name.split(" ")[0]}`, state: "done" } : { text: `No update written for ${seller.name.split(" ")[0]} yet`, state: "missing", gap: `you haven't written the seller update for ${seller.name.split(" ")[0]}`, button: { label: "Draft update", style: "secondary", action: ask(`Draft an email to ${seller.name} with a listing update for ${street}`) } });
  add("📣", "Marketing & follow-ups", follow);

  const all = sections.flatMap((s) => s.items);
  return { property: prop, listingDate, sections, missing: all.filter((i) => i.state === "missing"), done: all.filter((i) => i.state === "done").length, total: all.filter((i) => i.state !== "info").length };
}
