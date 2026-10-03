import type { Block, Contact, DocumentRow, EmailDraft, Property } from "../../types";
import { type Ctx, firstName, label, plural } from "../context";
import { persistState } from "../conversation";
import { followUpEmail, polish } from "../comms";
import { type Candidate, candidatesFromDocument, importCandidates, textToCandidates } from "../ingest";
import { addrKey, capitalisedNames, parseAddress } from "../nlu";
import { TOOLS, invoke } from "../tools";
import { type HandlerOut, reply } from "./types";

const clip = (c: Candidate) => [c.name, c.email, c.phone].filter(Boolean).join(" · ") || c.raw || "Unreadable row";

function clarifyBlocks(ctx: Ctx, items: Candidate[], meta: { source: string; tag?: string; address?: string }): Block[] {
  if (!items.length) return [];
  const shown = items.slice(0, 5);
  return [{
    type: "choice",
    title: `${plural(items.length, "entry needs", "entries need")} a quick check`,
    body: "I didn't add these because something was missing or unclear.",
    buttons: [
      ...shown.flatMap((c) => [
        { label: `Add ${c.name ?? clip(c)}${c.issues[0] ? ` (${c.issues[0].toLowerCase()})` : ""}`, style: "secondary" as const, action: { type: "import_confirm", candidate: c, ...meta } },
        ...(c.possibleMatch ? [{ label: `Same as ${c.possibleMatch.name}`, style: "secondary" as const, action: { type: "import_merge", candidate: c, contactId: c.possibleMatch.id, ...meta } }] : []),
      ]),
      { label: "Skip them", style: "quiet", action: { type: "noop" } },
    ],
  }];
}

export async function importResultReply(ctx: Ctx, res: Awaited<ReturnType<typeof importCandidates>>, meta: { source: string; tag?: string; address?: string }): Promise<HandlerOut> {
  const all = [...res.created, ...res.updated];
  ctx.state.last_import_batch = all.map((c) => c.id);
  ctx.state.last_contact_ids = all.map((c) => c.id);
  await persistState(ctx);
  const parts = [res.created.length && `added ${plural(res.created.length, "new contact")}`, res.updated.length && `updated ${plural(res.updated.length, "existing contact")}`].filter(Boolean).join(" and ");
  const blocks: Block[] = [];
  if (all.length) blocks.push({
    type: "contacts", title: meta.address ? `From the open house at ${meta.address}` : "Imported", contacts: all.slice(0, 12).map((c) => ({ id: c.id, name: c.name, type: label(c.type), reason: c.notes?.split("\n").pop()?.slice(0, 70), color: c.avatar_color })),
    buttons: all.length ? [{ label: "Draft follow-ups for everyone", style: "primary", action: { type: "prompt", text: "Draft a follow-up for everyone who came" } }] : undefined,
  });
  blocks.push(...clarifyBlocks(ctx, res.needsClarification, meta));
  if (!all.length && !res.needsClarification.length) return reply("I couldn't find any people in that. If it's a photo, make sure the names are readable — or paste the list here.");
  const text = `${parts ? parts[0].toUpperCase() + parts.slice(1) : "Nothing was added yet"}${res.needsClarification.length ? `. ${plural(res.needsClarification.length, "entry needs", "entries need")} your input` : ""}.`;
  return reply(text, blocks, "smalltalk");
}

/** User attached files: sign-in sheet, contact list, documents… */
export async function handleAttachments(ctx: Ctx, docs: DocumentRow[], text: string): Promise<HandlerOut> {
  const sheetish = /sign.?in|open house|visitor|guest|attendee|contacts?|leads?|import|people|list/i.test(text) || docs.some((d) => ["csv", "spreadsheet", "image", "pdf"].includes(d.kind) && /sign|visitor|contact|lead|guest|open/i.test(d.name));
  const wantsSave = /(save|use).*(template|default)/i.test(text);
  if (wantsSave) {
    const d = docs[0];
    const { extractVariables } = await import("../templates");
    const kind = /seller|listing/i.test(text) ? "seller_document" : "buyer_document";
    const body = d.text_content ?? "";
    if (!body) return reply("I can only save text-based documents (text or text PDFs) as fillable templates right now.");
    await ctx.store.insert("document_templates", ctx.userId, { name: d.name.replace(/\.[^.]+$/, ""), kind, body, variables: extractVariables(body), document_id: d.id, is_default: true });
    return reply(`Saved “${d.name}” as your default ${label(kind).toLowerCase()} template. I only fill in {{VARIABLE}} fields — I never rewrite the wording.`, [], "smalltalk");
  }
  if (!sheetish && docs.every((d) => d.kind !== "csv" && d.kind !== "spreadsheet")) {
    const d = docs[0];
    return reply(`Got it — I saved ${d.name}${d.summary ? `: ${d.summary}` : ""}. What would you like me to do with it?`, [], "chat_simple");
  }

  ctx.steps.push("Reading your file");
  const prop = await lastOpenHouseProperty(ctx, text);
  const all: Candidate[] = [];
  const problems: { name: string; error: string }[] = [];
  for (const d of docs) {
    const r = await candidatesFromDocument(ctx, d);
    if ("error" in r) problems.push({ name: d.name, error: r.error }); // one unreadable file must not block the others
    else all.push(...r.candidates);
  }
  if (!all.length && problems.length) {
    const msg = problems.length === 1 ? problems[0].error : problems.map((x) => `${x.name}: ${x.error}`).join("\n");
    return reply(problems[0].error, [{ type: "notice", tone: "warn", title: "I couldn't read that file", body: msg, buttons: [{ label: "Upload a CSV instead", style: "secondary", href: "/contacts" }] }], "smalltalk");
  }
  ctx.steps.push("Matching against your contacts");
  const meta = { source: prop ? `Open house — ${prop.address}` : "Upload", tag: prop ? `open-house:${prop.address}` : undefined, address: prop?.address };
  const res = await importCandidates(ctx, all, { source: meta.source, tag: meta.tag, propertyAddress: prop?.address });
  const out = await importResultReply(ctx, res, meta);
  if (problems.length) out.blocks.push({ type: "notice", tone: "warn", title: `${problems.length === 1 ? "One file" : `${problems.length} files`} couldn't be read`, body: problems.map((x) => `${x.name}: ${x.error}`).join("\n") });
  return out;
}

export async function lastOpenHouseProperty(ctx: Ctx, text = ""): Promise<Property | null> {
  const addr = parseAddress(text);
  const props = await ctx.store.list("properties", ctx.userId);
  if (addr) { const p = props.find((x) => addrKey(x.address) === addrKey(addr)); if (p) return p; }
  if (ctx.state.last_property_id) { const p = await ctx.store.get("properties", ctx.userId, ctx.state.last_property_id); if (p) return p; }
  const ev = (await ctx.store.list("calendar_events", ctx.userId)).filter((e) => e.kind === "open_house" && e.property_id && e.status === "confirmed").sort((a, b) => b.start_at.localeCompare(a.start_at))[0];
  return ev?.property_id ? ctx.store.get("properties", ctx.userId, ev.property_id) : null;
}

/** Pasted lists: "Here's my sign-in sheet: John Smith, john@x.com, asked about financing …" */
export async function pastedListHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const body = text.includes(":") ? text.slice(text.indexOf(":") + 1) : text;
  const cands = textToCandidates(body);
  if (!cands.length) return reply("Upload a photo, PDF or spreadsheet of the sign-in sheet — or paste one person per line (name, email, phone, notes).");
  const prop = await lastOpenHouseProperty(ctx, text);
  const meta = { source: prop ? `Open house — ${prop.address}` : "Pasted list", tag: prop ? `open-house:${prop.address}` : undefined, address: prop?.address };
  const res = await importCandidates(ctx, cands, { source: meta.source, tag: meta.tag, propertyAddress: prop?.address });
  return importResultReply(ctx, res, meta);
}

/** "Draft a follow-up for everyone who came" — personalised, grouped into one approval. */
export async function batchFollowUpHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const prop = await lastOpenHouseProperty(ctx, text);
  let contacts: Contact[] = [];
  const batchIds = ctx.state.last_import_batch ?? [];
  if (batchIds.length) contacts = (await Promise.all(batchIds.map((id) => ctx.store.get("contacts", ctx.userId, id)))).filter(Boolean) as Contact[];
  if (!contacts.length && prop) contacts = (await ctx.store.list("contacts", ctx.userId)).filter((c) => c.tags.includes(`open-house:${prop.address}`));
  const names = capitalisedNames(text);
  if (!contacts.length) return reply("I don't have a recent sign-in sheet to work from. Upload it (photo, PDF, spreadsheet) and I'll extract everyone.", [{ type: "notice", tone: "info", title: "Upload your sign-in sheet", body: "Tap the paperclip below to attach a photo, PDF or CSV." }]);
  const withEmail = contacts.filter((c) => c.email);
  const noEmail = contacts.filter((c) => !c.email);
  ctx.steps.push("Preparing messages");
  const drafts: { c: Contact; d: EmailDraft; cls: string }[] = [];
  for (const c of withEmail) {
    const mem = (await ctx.store.list("memories", ctx.userId)).filter((m) => m.scope === "contact" && m.subject_id === c.id && /open house note/i.test(m.key)).map((m) => m.value).join("; ");
    const mail = followUpEmail(ctx, c, prop, mem || c.notes);
    const body = mail.body;
    const r = (await TOOLS.draft_email.run(ctx, { contact_id: c.id, subject: mail.subject, body, property_id: prop?.id ?? null, event_id: null })) as any;
    drafts.push({ c, d: r.data.draft as EmailDraft, cls: mail.cls });
  }
  void names; void polish;
  const blocks: Block[] = drafts.slice(0, 3).map(({ c, d, cls }) => ({ type: "draft_email" as const, draftId: d.id, to: `${c.name} <${c.email}>`, subject: d.subject, body: d.body.replaceAll("{{first_name}}", firstName(c.name)), status: cls === "general" ? "Draft" : `Draft · ${cls}` }));
  if (drafts.length) {
    const out = await invoke(ctx, "send_email_batch", { draftIds: drafts.map((x) => x.d.id), title: `Open-house follow-ups${prop ? ` — ${prop.address}` : ""}` });
    for (const x of drafts) await ctx.store.update("email_drafts", ctx.userId, x.d.id, { status: out.status === "needs_approval" ? "pending_approval" : "draft" });
    if (out.status === "needs_approval") blocks.push({ type: "notice", tone: "info", title: `${plural(drafts.length, "follow-up")} ready`, body: `Each is personalized from what they told you. Nothing is sent until you approve.${noEmail.length ? ` ${plural(noEmail.length, "person has", "people have")} no email: ${noEmail.map((c) => firstName(c.name)).join(", ")}.` : ""}`, buttons: [{ label: "Review", style: "secondary", href: `/tasks?approval=${out.approval.id}` }, { label: "Approve & send", style: "primary", approvalId: out.approval.id }] });
  }
  return reply(`I drafted ${plural(drafts.length, "personalized follow-up")}.`, blocks, "email_generation");
}
