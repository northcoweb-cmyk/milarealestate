import type { Block, Contact, Property } from "../../types";
import type { Ctx } from "../context";
import { persistState } from "../conversation";
import { describeStated, extractListingFacts, hasAnyFact } from "../listing";
import { parseAddress } from "../nlu";
import { describeFacts, enrichProperty } from "../property-lookup";
import { TOOLS } from "../tools";
import { type HandlerOut, reply } from "./types";
import { locationGate } from "./location";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * "New listing at 8814 Brookside Drive, Rockville MD. 4 bed 3 bath, $875,000. Sellers are the Hendersons."
 * One message in, listing saved. Mila only asks for what she truly can't work out (the address itself), looks up
 * whatever the agent didn't say, and then offers the next moves instead of making the agent walk through a form.
 */
export async function addListingHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const street = parseAddress(text) ?? (ctx.state.last_property_id ? null : null);
  if (!street) {
    ctx.state.pending = { kind: "clarify", intent: "add_listing", slots: { text }, missing: "address" };
    await persistState(ctx);
    return reply("Congrats on the new listing! What's the address? You can give me the price, beds, baths and sellers in the same message and I'll save it all.");
  }
  const gate = await locationGate(ctx, "add_listing", text, street);
  if (!gate.ok) return gate.out;
  const { place, unverified, assumed } = gate.found;
  const f = extractListingFacts(text);
  ctx.steps.push("Saving your listing");
  const created = (await TOOLS.create_property.run(ctx, { address: street, city: place.city, state: place.state, zip: place.zip, county: place.county, list_price: f.list_price, beds: f.beds, baths: f.baths, sqft: f.sqft })) as any;
  let prop = created.data.property as Property;
  ctx.state.last_property_id = prop.id;

  // look up anything the agent didn't say (beds/baths/size/price) — silently, never as a question
  const missing = prop.beds == null || prop.baths == null || prop.sqft == null || prop.list_price == null;
  let looked = "";
  if (missing && !unverified) {
    ctx.steps.push("Looking up the rest online");
    const enr = await enrichProperty(ctx, prop, { place });
    prop = enr.property;
    if (enr.memory?.found) looked = describeFacts(enr.memory.facts);
  }

  // sellers: save as a contact the first time they're mentioned
  let seller: Contact | null = null;
  if (f.seller) {
    const r = (await TOOLS.create_contact.run(ctx, { name: /^[A-Z][a-z]+s$/.test(f.seller) ? `The ${f.seller}` : f.seller, type: "seller", status: "active", source: "Listing", notes: `Seller of ${street}` })) as any;
    if (r.ok) seller = r.data.contact;
  }

  const where = [prop.city, prop.state].filter(Boolean).join(", ");
  const have = [prop.beds != null ? `${prop.beds} bd` : null, prop.baths != null ? `${prop.baths} ba` : null, prop.sqft ? `${prop.sqft.toLocaleString("en-US")} sq ft` : null, prop.list_price ? money(prop.list_price) : null].filter(Boolean).join(" · ");
  const lines = [`Saved your listing: ${street}${where ? `, ${where}` : ""}${prop.zip ? ` ${prop.zip}` : ""}.`];
  if (have) lines.push(have + (hasAnyFact(f) && looked ? " (you gave me some, I found the rest online — please check them)" : looked ? " — found online, please check" : ""));
  if (seller) lines.push(`Sellers: ${seller.name} (saved as a contact).`);
  const still = [prop.list_price == null ? "price" : null, prop.beds == null ? "beds" : null, prop.baths == null ? "baths" : null, prop.sqft == null ? "square feet" : null].filter(Boolean);
  if (still.length) lines.push(`Still blank: ${still.join(", ")} — tell me whenever (e.g. “it's 3 bed 2 bath, $480k”) or add them on the property page.`);
  if (assumed) lines.push(`I assumed it's in ${where} (your market) — if not, just tell me the city and state.`);
  if (unverified) lines.push("I couldn't find that address on the map, so double-check the spelling.");
  if (!f.seller && !seller) lines.push("");
  void describeStated;

  const blocks: Block[] = [{
    type: "choice", title: "What should I do next?",
    buttons: [
      { label: "Make an Instagram post", style: "primary", action: { type: "prompt", text: `Create an Instagram post for ${street}` } },
      { label: "Set up an open house", style: "secondary", action: { type: "prompt", text: `Set up an open house at ${street}` } },
      { label: "Start a showing sheet", style: "secondary", href: `/properties/${prop.id}` },
      { label: "New-listing checklist", style: "secondary", action: { type: "listing_checklist", propertyId: prop.id } },
      { label: "Open property", style: "quiet", href: `/properties/${prop.id}` },
    ],
  }];
  return reply(lines.filter((l, i, a) => l || (i && a[i - 1])).join("\n"), blocks, "chat_simple");
}

const CHECKLIST: [string, number][] = [
  ["Order professional photos", 2], ["Prep the listing description and features", 2], ["Enter in MLS and verify it", 3],
  ["Install sign and lockbox", 3], ["Send “Just listed” to your sphere", 4], ["Schedule the first open house", 5], ["Pull comps and confirm the list price", 1],
];
export async function listingChecklist(ctx: Ctx, propertyId: string): Promise<HandlerOut> {
  const prop = await ctx.store.get("properties", ctx.userId, propertyId);
  if (!prop) return reply("I couldn't find that listing.", [], "smalltalk");
  for (const [title, days] of CHECKLIST) {
    await TOOLS.create_task.run(ctx, { kind: "task", title: `${title} — ${prop.address}`, property_id: prop.id, due_at: new Date(ctx.now.getTime() + days * 86_400_000).toISOString(), internal: true });
  }
  return reply(`Added a ${CHECKLIST.length}-step new-listing checklist for ${prop.address} to your tasks, spaced over the next few days.`, [{ type: "choice", title: "Checklist ready", buttons: [{ label: "See tasks", style: "secondary", href: "/tasks" }] }], "chat_simple");
}
