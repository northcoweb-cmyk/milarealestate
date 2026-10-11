import { api, bad, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { getStore } from "@/lib/db/store";
import { creditSummary } from "@/lib/credits";
import { redactPii } from "@/lib/server/sanitize";

/**
 * A refund REQUEST. It never refunds anything by itself and never says one is promised: the owner reviews each request under the published policy.
 * Usage is shown to the reviewer as context, not as proof of anything.
 */
export const POST = api(async ({ profile, req }) => {
  rateLimit(`refund:${profile.id}`, 3, 24 * 60 * 60_000);
  const b = await readJson<{ reason?: unknown }>(req);
  const reason = typeof b.reason === "string" && b.reason.trim() ? redactPii(b.reason.trim().slice(0, 1000)) : null; // optional
  const s = await creditSummary(profile.id);
  const context = { kind: "refund_request", plan: s.plan?.name ?? null, status: s.status, usage: { creditsUsedThisPeriod: s.spentThisPeriod, balance: s.balance, allowance: s.allowance, periodResets: s.resetsAt }, requested_at: new Date().toISOString(), triage: { severity: null, owner: "Ryan", resolution: null } };
  const row = await getStore().insert("feedback", profile.id, { kind: "bug", target: "refund", target_id: null, note: reason ?? "(no reason given)", snippet: null, page: "/settings/credits", category: "refund_request", context, status: "open", github_issue: null } as never);
  if (!row) throw bad("We couldn't save that. Please email admin@milarealestate.app.");
  return { ok: true, message: "Request received. A person reviews every request and will reply by email. This doesn't change your plan; use Manage subscription to cancel any time." };
});
