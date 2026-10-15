import { api, bad, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { getStore } from "@/lib/db/store";
import { creditSummary } from "@/lib/credits";
import { redactPii } from "@/lib/server/sanitize";

/** Owner policy (Oct 11): once an account has used this many credits in the period, the service has been delivered and the request is declined. Have a lawyer confirm the wording before it is published as terms. */
export const REFUND_MAX_CREDITS_USED = 100;

/**
 * A refund REQUEST. It never refunds anything by itself and never says one is promised: the owner reviews each request under the published policy.
 * Usage is shown to the reviewer as context, not as proof of anything.
 */
export const POST = api(async ({ profile, req }) => {
  rateLimit(`refund:${profile.id}`, 3, 24 * 60 * 60_000);
  const b = await readJson<{ reason?: unknown }>(req);
  const reason = typeof b.reason === "string" && b.reason.trim() ? redactPii(b.reason.trim().slice(0, 1000)) : null; // optional
  const s = await creditSummary(profile.id);
  const overLimit = s.spentThisPeriod >= REFUND_MAX_CREDITS_USED;
  const context = { kind: "refund_request", policy: { max_credits_used: REFUND_MAX_CREDITS_USED, over_limit: overLimit }, plan: s.plan?.name ?? null, status: s.status, usage: { creditsUsedThisPeriod: s.spentThisPeriod, balance: s.balance, allowance: s.allowance, periodResets: s.resetsAt }, requested_at: new Date().toISOString(), triage: { severity: null, owner: "Ryan", resolution: overLimit ? "declined_policy_usage" : null } };
  const row = await getStore().insert("feedback", profile.id, { kind: "bug", target: "refund", target_id: null, note: reason ?? "(no reason given)", snippet: null, page: "/settings/credits", category: "refund_request", context, status: "open", github_issue: null } as never);
  if (!row) throw bad("We couldn't save that. Please email support@milarealestate.app.");
  if (overLimit) return { ok: true, message: `Refunds aren't available once an account has used ${REFUND_MAX_CREDITS_USED} or more credits, because the service has already been delivered. Your request is on file and a person will still look at it if something went wrong. You can cancel any time with Manage subscription.` };
  return { ok: true, message: "Request received. A person reviews every request and will reply by email. This doesn't change your plan; use Manage subscription to cancel any time." };
});
