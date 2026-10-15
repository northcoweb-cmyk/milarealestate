import { api, bad, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { TABLES, type TableName } from "@/lib/types";
import { authMode, clearSession } from "@/lib/auth";
import { deleteFile } from "@/lib/files";
import { disconnectGoogle } from "@/lib/integrations/google";
import { supabaseUrl } from "@/lib/supabase-url";

// What the app keeps after "delete my data": the account itself and the money records (plan, credits and their history).
const KEEP = new Set<TableName>(["profiles", "subscriptions", "credit_transactions", "usage", "waitlist"]);

/**
 * Deletes what the person has created. Requires typing DELETE.
 *  scope "data": everything they did (contacts, calendar, tasks, posts, emails, documents, memory, conversations, connections) is wiped; the account, plan and credits stay.
 *  scope "account": the same, plus the account itself and the sign-in, which frees the email to sign up again.
 */
export const POST = api(async ({ profile, req }) => {
  const b = await readJson<{ confirm?: string; scope?: string }>(req);
  if (b.confirm !== "DELETE") throw bad("Type DELETE to confirm.");
  const scope = b.scope === "account" ? "account" : "data";
  const store = getStore();
  if (scope === "account") {
    const sub = (await store.list("subscriptions", profile.id))[0];
    if (sub?.status === "active" && sub.stripe_subscription_id) throw bad("Cancel your plan first (More, then Credits & billing), then delete your account, so you aren't billed again.");
  }
  await disconnectGoogle(profile.id);
  for (const d of await store.list("documents", profile.id)) await deleteFile(d.storage_path);
  let removed = 0;
  for (const t of TABLES) if (scope === "account" || !KEEP.has(t)) removed += await store.removeWhere(t, profile.id, () => true);
  if (scope === "data") {
    // the saved arrangement of their lists is part of what they did; the account's name, referral and billing stay
    const s = { ...profile.settings } as Record<string, unknown>;
    delete s.task_order; delete s.home_order;
    await store.update("profiles", profile.id, profile.id, { settings: s } as never);
    return { ok: true, scope, removed };
  }
  if (authMode() === "supabase") {
    const svc = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const r = await fetch(`${supabaseUrl()}/auth/v1/admin/users/${profile.id}`, { method: "DELETE", headers: { apikey: svc, Authorization: `Bearer ${svc}` }, signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!r || !(r.ok || r.status === 404)) throw bad("Your data is deleted, but the account itself didn't go through. Try again.");
  }
  await clearSession();
  return { ok: true, scope, removed };
});
