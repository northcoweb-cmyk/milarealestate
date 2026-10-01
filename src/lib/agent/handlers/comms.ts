import { fmtDay, fmtRange } from "../../time";
import type { Block, CalendarEvent, Contact, EmailDraft, Property, SocialPost } from "../../types";
import { type Ctx, firstName } from "../context";
import { openHouseSocial, signature, verifiedFacts } from "../comms";
import { llmDraftEmail } from "../llm";
import { contactFacts } from "../memory";
import { capitalisedNames, parseAddress } from "../nlu";
import { TOOLS, invoke } from "../tools";
import { upcomingEvents } from "./calendar";
import { type HandlerOut, reply } from "./types";

export async function socialPostHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const platform = /facebook/i.test(text) ? "facebook" : /tiktok/i.test(text) ? "tiktok" : /linkedin/i.test(text) ? "linkedin" : /twitter|\bx\b/i.test(text) ? "x" : "instagram";
  const addr = parseAddress(text);
  const events = await upcomingEvents(ctx);
  let ev: CalendarEvent | undefined = events.find((e) => e.kind === "open_house" && (!addr || `${e.title} ${e.location}`.toLowerCase().includes(addr.toLowerCase())));
  let prop: Property | null = null;
  if (ev?.property_id) prop = await ctx.store.get("properties", ctx.userId, ev.property_id);
  if (!prop && addr) prop = (await ctx.store.list("properties", ctx.userId)).find((p) => p.address.toLowerCase() === addr.toLowerCase()) ?? null;
  if (!prop && ctx.state.last_property_id) prop = await ctx.store.get("properties", ctx.userId, ctx.state.last_property_id);
  if (!prop) return reply("Which property is the post for? Give me an address and I'll build it.");
  const images = (await ctx.store.list("property_images", ctx.userId)).filter((i) => i.property_id === prop!.id).sort((a, b) => a.position - b.position).map((i) => i.id);
  let post: SocialPost;
  if (ev && /open house|carousel/i.test(text) || (ev && !/just listed|price/i.test(text))) {
    const s = openHouseSocial(ctx, prop, new Date(ev!.start_at), new Date(ev!.end_at), images);
    post = ((await TOOLS.create_social_post.run(ctx, { platform, caption: s.caption, hashtags: s.hashtags, slides: s.slides, property_id: prop.id, event_id: ev!.id })) as any).data.post;
  } else {
    const facts = verifiedFacts(prop);
    const kind = /price/i.test(text) ? "Price Improvement" : "Just Listed";
    post = ((await TOOLS.create_social_post.run(ctx, {
      platform, property_id: prop.id, hashtags: ["#RealEstate", "#HomesForSale"],
      caption: [`${kind}! 🏡`, "", prop.address + (prop.city ? `, ${prop.city}` : ""), facts.join(" • "), "", "Message me for details or a private showing."].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n"),
      slides: [{ role: "hero", headline: prop.address, sub: kind, image_id: images[0] ?? null }, { role: "highlight", headline: facts.join(" • ") || "See it in person", image_id: images[1] ?? images[0] ?? null }, { role: "cta", headline: "Let's talk", sub: ctx.profile.full_name, image_id: null }],
    })) as any).data.post;
  }
  const pub = await invoke(ctx, "publish_social_post", { postId: post.id });
  if (pub.status === "needs_approval") await ctx.store.update("social_posts", ctx.userId, post.id, { status: "pending_approval" });
  const blocks: Block[] = [{ type: "draft_social", postId: post.id, platform, caption: post.caption, slides: post.slides, status: "Draft", buttons: pub.status === "needs_approval" ? [{ label: "Review", style: "secondary", href: `/tasks?approval=${pub.approval.id}` }, { label: "Approve post", style: "primary", approvalId: pub.approval.id }] : undefined }];
  if (!images.length) blocks.push({ type: "notice", tone: "info", title: "Add property photos", body: "I never use stock photos for a real property. Upload photos and I'll put them in the carousel.", buttons: [{ label: "Upload photos", style: "secondary", href: `/properties/${prop.id}` }] });
  return reply(`Here's a ${platform} carousel for ${prop.address}.`, blocks, "social_generation");
}

export async function draftEmailHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const names = capitalisedNames(text);
  let c: Contact | null = null;
  for (const n of names) { const r = (await TOOLS.get_contact.run(ctx, { name: n })) as any; if (r.ok && r.data.contacts.length === 1) { c = r.data.contacts[0]; break; } if (r.ok && r.data.contacts.length > 1) return reply(`Which ${n}?`, [{ type: "choice", title: `Which ${n}?`, buttons: r.data.contacts.slice(0, 5).map((x: Contact) => ({ label: `${x.name}${x.email ? ` · ${x.email}` : ""}`, style: "secondary" as const, action: { type: "prompt", text: text.replace(n, x.name) } })) }]); }
  if (!c && ctx.state.last_contact_ids?.length === 1) c = await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids[0]);
  if (!c) return reply("Who is the email for?");
  const facts = await contactFacts(ctx, c);
  const topic = text.replace(/^.*?\b(?:about|regarding|saying|to say|that)\b\s*/i, "").trim() || text;
  const ai = await llmDraftEmail(ctx, text, c.name, facts);
  const subject = ai?.subject ?? `Following up${topic && topic !== text ? ` — ${topic.slice(0, 50)}` : ""}`;
  const body = ai?.body ?? `Hi ${firstName(c.name)},\n\n${topic && topic !== text ? `I wanted to follow up about ${topic.replace(/[.!?]+$/, "")}.` : "I wanted to follow up."} Let me know a good time to talk.\n\n${signature(ctx.profile)}`;
  const d = ((await TOOLS.draft_email.run(ctx, { contact_id: c.id, subject, body })) as any).data.draft as EmailDraft;
  const out = await invoke(ctx, "send_email", { draftId: d.id });
  const blocks: Block[] = [{ type: "draft_email", draftId: d.id, to: `${c.name}${c.email ? ` <${c.email}>` : ""}`, subject, body, status: "Draft", buttons: out.status === "needs_approval" ? [{ label: "Edit", style: "secondary", href: `/tasks?approval=${out.approval.id}` }, { label: "Approve & send", style: "primary", approvalId: out.approval.id }] : undefined }];
  if (out.status === "needs_approval") await ctx.store.update("email_drafts", ctx.userId, d.id, { status: "pending_approval" });
  if (!c.email) blocks.push({ type: "notice", tone: "warn", title: `${c.name} has no email address`, body: "Add one in their profile before sending.", buttons: [{ label: "Open profile", style: "secondary", href: `/contacts/${c.id}` }] });
  return reply(ai ? `Here's a draft for ${firstName(c.name)}.` : `Here's a simple draft for ${firstName(c.name)}. With Mila's writing connection enabled I can make these richer.`, blocks, "email_generation");
}

export { fmtDay, fmtRange };
