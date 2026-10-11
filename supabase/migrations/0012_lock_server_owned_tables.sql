-- Security hardening (additive, idempotent).
-- The app never talks to Postgres with a user's own token: every write goes through the server (service role), which filters by user_id.
-- But the anon key is public by design, and the original "for all" owner policies let any signed-in person call PostgREST directly and:
--   * insert credit_transactions rows (grant themselves credits), edit subscriptions / usage,
--   * update profiles.email to an ADMIN_EMAILS address (admin check is email-based) or rewrite their own settings,
--   * edit approvals (status/payload) or read the encrypted OAuth tokens in integrations.
-- Owners keep READ access to their own rows; all writes are server-only.

drop policy if exists profiles_owner on profiles;
drop policy if exists profiles_owner_read on profiles;
create policy profiles_owner_read on profiles for select to authenticated using (id = auth.uid());

drop policy if exists credit_transactions_owner on credit_transactions;
drop policy if exists credit_transactions_owner_read on credit_transactions;
create policy credit_transactions_owner_read on credit_transactions for select to authenticated using (user_id = auth.uid());

drop policy if exists subscriptions_owner on subscriptions;
drop policy if exists subscriptions_owner_read on subscriptions;
create policy subscriptions_owner_read on subscriptions for select to authenticated using (user_id = auth.uid());

drop policy if exists usage_owner on usage;
drop policy if exists usage_owner_read on usage;
create policy usage_owner_read on usage for select to authenticated using (user_id = auth.uid());

drop policy if exists approvals_owner on approvals;
drop policy if exists approvals_owner_read on approvals;
create policy approvals_owner_read on approvals for select to authenticated using (user_id = auth.uid());

-- integrations hold encrypted OAuth tokens: no client access at all (server only).
drop policy if exists integrations_owner on integrations;
