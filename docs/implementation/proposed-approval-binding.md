# Proposed patch: bind an approval to the exact content that was shown

Status: NOT applied (src/lib/agent is owned by another engineer). Route-level hardening in src/app/api/approvals/** is already done.

## Finding (P0, needs agent-code change)

`createApproval` (src/lib/agent/tools.ts ~463) stores only `payload: { tool, args }`. For email, `args` is `{ draftId }` / `{ draftIds }`; for social `{ postId }`; for calendar `{ id, start_at, end_at }`.
`decideApprovalOnce` (~518) then calls `invoke(ctx, tool, args, { approved: true })`, and `sendDrafts` (~455) RE-READS the draft by id at execution time.
So if the draft's recipients, subject or body (or the post caption, or the event) change AFTER the approval card was created (agent re-draft, another tab, POST /api/approvals/:id edits, a later chat turn editing the draft), approving sends the NEW content that the person never saw. `sendDrafts` also does not check the draft's status, so an already-sent draft id can be re-sent by a second approval.
Only `replace_calendar_event` (new, in working tree) is bound (`originalVersion` compared with `updated_at`).

The API route's edit-at-decision path (`edits` in POST /api/approvals/:id) is an intentional, same-request user edit and is fine; it is now limited to drafts the approval covers.

## Patch

1. Snapshot a fingerprint at creation. In `createApproval`, after computing `gate`, add a `bind` map to the payload:

```ts
import { createHash } from "node:crypto";
const fp = (o: unknown) => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 32);

async function bindingFor(ctx: Ctx, tool: string, args: Args): Promise<Record<string, string>> {
  const bind: Record<string, string> = {};
  if (tool === "send_email" || tool === "send_email_batch") {
    for (const id of (args.draftIds ?? [args.draftId]) as string[]) {
      const d = await ctx.store.get("email_drafts", ctx.userId, id);
      if (d) bind[`email_drafts:${id}`] = fp({ to: d.to_emails, c: d.to_contact_ids, contact: d.contact_id, s: d.subject, b: d.body });
    }
  } else if (tool === "publish_social_post") {
    const p = await ctx.store.get("social_posts", ctx.userId, args.postId);
    if (p) bind[`social_posts:${p.id}`] = fp({ c: p.caption, h: p.hashtags, s: p.slides, pl: p.platform });
  } else if (tool === "update_calendar_event" || tool === "cancel_calendar_event") {
    const e = await ctx.store.get("calendar_events", ctx.userId, args.id);
    if (e) bind[`calendar_events:${e.id}`] = e.updated_at;
  }
  return bind;
}
// payload: { tool, args, bind: await bindingFor(ctx, tool, args) }
```

(`Approval["payload"]` type gets an optional `bind?: Record<string,string>`; the de-dup key in `createApproval` must stay `{tool,args}` only.)

2. Verify at decision time, before `invoke`, in `decideApprovalOnce` (approve branch only):

```ts
const stale = await staleBinding(ctx, a.payload);   // recompute bindingFor() and compare
if (stale.length) {
  const u = await ctx.store.update("approvals", ctx.userId, id, { status: "failed", decided_at: nowIso(), error: "That changed after you were shown it, so I did not send or change anything. Ask me again and I will show the updated version." });
  return { approval: u!, message: u!.error! };
}
```

Legacy approvals without `bind` keep working (skip the check) so existing pending rows are not stranded.

3. The route-level edit path must re-bind after a legitimate decision-time edit. In `decideApproval` accept an optional `{ rebind: true }` that the route passes only when it applied `edits`/`caption` in the same request, recomputing `bind` from the edited rows before the comparison. (Alternatively expose `bindApproval(ctx, approvalId)` and call it from the route after the edits; the route already runs edits before `decideApproval`.)

4. `sendDrafts`: skip drafts whose `status` is `sent` (return `{ already_sent }`) so an approval can never re-send, and refuse drafts with zero resolved recipients.

5. Tests to add alongside (tests/approval-binding.test.mts): create approval for a draft, edit body, approve -> status `failed`, no send; edit recipient -> same; unchanged -> executes; legacy approval without `bind` -> executes; approving twice sends once.
