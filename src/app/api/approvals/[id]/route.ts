import { api, bad, notFound, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { decideApproval, rebindApproval } from "@/lib/agent/tools";
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
  const b = await readJson<{ decision: "approve" | "reject" | "done"; edits?: { draftId: string; subject?: string; body?: string }[]; caption?: string; postId?: string }>(req);
  if (b.decision !== "approve" && b.decision !== "reject" && b.decision !== "done") throw bad("Choose approve, reject or done.");
  const ctx = await buildCtx(profile);
  // Look the approval up first: edits are only applied to things THIS approval covers, only while it is still undecided, and only on approve.
  const approval = await ctx.store.get("approvals", profile.id, params.id);
  if (!approval) throw notFound("That approval");
  if (b.decision === "done") {
    // "I already did this myself": closed without Mila sending or posting anything
    if (approval.status === "pending" || approval.status === "approved") {
      const now = new Date().toISOString();
      const u = await ctx.store.update("approvals", profile.id, approval.id, { status: "executed", decided_at: now, executed_at: now, error: null, blocked_integration: null, result: { manual: true } } as never);
      const linked = (await ctx.store.list("tasks", profile.id)).filter((t) => t.approval_id === approval.id && t.status === "open");
      for (const t of linked) await ctx.store.update("tasks", profile.id, t.id, { status: "done", completed_at: now });
      return { approval: u, message: "Marked as done.", ok: true };
    }
    return { approval, message: "That was already handled.", ok: true };
  }
  if (b.decision === "approve" && approval.status === "pending") {
    const a = approval.payload.args as { draftIds?: string[]; draftId?: string; postId?: string };
    const covered = new Set<string>(a.draftIds ?? (a.draftId ? [a.draftId] : []));
    for (const e of (Array.isArray(b.edits) ? b.edits : []).slice(0, 50)) {
      if (!e || typeof e.draftId !== "string" || !covered.has(e.draftId)) continue; // not part of this approval: ignore
      const d = await ctx.store.get("email_drafts", profile.id, e.draftId);
      if (d) await ctx.store.update("email_drafts", profile.id, d.id, { subject: typeof e.subject === "string" ? e.subject.slice(0, 300) : d.subject, body: typeof e.body === "string" ? e.body.slice(0, 20_000) : d.body });
    }
    if (a.postId && b.postId === a.postId && typeof b.caption === "string") await ctx.store.update("social_posts", profile.id, a.postId, { caption: b.caption.slice(0, 5_000) });
  }
  if (b.decision === "approve" && approval.status === "pending" && (b.edits?.length || b.caption != null)) await rebindApproval(ctx, params.id); // the agent saw and made these edits in this very review
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
