import { api, bad, notFound, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { decideApproval } from "@/lib/agent/tools";
import { InsufficientCredits } from "@/lib/credits";
import { appendMila } from "@/lib/agent/conversation";
import { persistState } from "@/lib/agent/conversation";

export const GET = api<{ id: string }>(async ({ profile, params }) => {
  const ctx = await buildCtx(profile);
  const approval = await ctx.store.get("approvals", profile.id, params.id);
  if (!approval) throw notFound("That approval");
  const a = approval.payload.args as any;
  const ids: string[] = a.draftIds ?? (a.draftId ? [a.draftId] : []);
  const drafts = (await Promise.all(ids.map((id) => ctx.store.get("email_drafts", profile.id, id)))).filter(Boolean);
  const contacts = await ctx.store.list("contacts", profile.id);
  const post = a.postId ? await ctx.store.get("social_posts", profile.id, a.postId) : null;
  const event = a.id && approval.payload.tool.includes("calendar") ? await ctx.store.get("calendar_events", profile.id, a.id) : null;
  return { approval, drafts, post, event, recipients: Object.fromEntries(contacts.map((c) => [c.id, { name: c.name, email: c.email }])) };
});

export const POST = api<{ id: string }>(async ({ profile, params, req }) => {
  const b = await readJson<{ decision: "approve" | "reject"; edits?: { draftId: string; subject?: string; body?: string }[]; caption?: string; postId?: string }>(req);
  if (b.decision !== "approve" && b.decision !== "reject") throw bad("Choose approve or reject.");
  const ctx = await buildCtx(profile);
  for (const e of b.edits ?? []) {
    const d = await ctx.store.get("email_drafts", profile.id, e.draftId);
    if (d) await ctx.store.update("email_drafts", profile.id, d.id, { subject: e.subject ?? d.subject, body: e.body ?? d.body });
  }
  if (b.postId && typeof b.caption === "string") await ctx.store.update("social_posts", profile.id, b.postId, { caption: b.caption });
  try {
    const r = await decideApproval(ctx, params.id, b.decision);
    // Surface follow-up questions (e.g. stale communications) in the conversation
    if (r.followUp?.length) await appendMila(ctx, "I moved that on your calendar.", r.followUp);
    await persistState(ctx);
    return { approval: r.approval, message: r.message, ok: r.result ? r.result.ok : b.decision === "reject", code: r.result && !r.result.ok ? r.result.code : undefined };
  } catch (e) {
    if (e instanceof InsufficientCredits) throw bad("You're out of Mila credits.");
    throw e;
  }
});
