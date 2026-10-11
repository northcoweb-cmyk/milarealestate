# Security audit (P0 reliability brief)

Scope: src/app/api/**, src/lib/server, src/lib/auth, src/lib/db, supabase/migrations. Agent code and components were read only.
Tests: tests/security-audit.test.mts (new). Status values: FIXED+test, NEEDS AGENT CHANGE, NOT AN ISSUE.

## Findings

| # | Sev | Finding | Where | Status |
|---|-----|---------|-------|--------|
| 1 | P0 | RLS owner policies were `for all`: any signed-in user with the public anon key could call PostgREST directly and insert `credit_transactions` (self-grant credits), edit `subscriptions`/`usage`, change `profiles.email` to an ADMIN_EMAILS address (admin check is email based, so admin takeover), or edit `approvals`. `integrations` (encrypted OAuth tokens) was client-readable. The app never uses user tokens against the DB, so reads stay, writes become server-only. | supabase/migrations/0001_init.sql:31,511,530 (+approvals :259, integrations :442, usage :494) | FIXED+test: new additive supabase/migrations/0012_lock_server_owned_tables.sql (must be APPLIED to the live DB by the owner; not run by me). Test replays all migrations and asserts final policies. |
| 2 | P0 | Approval does not bind to the content that was shown: payload holds only `{tool,args}` (draft/post/event ids); `sendDrafts` re-reads the draft at execute time, so edits after the approval was created are sent. `sendDrafts` also does not check draft status (re-send). | src/lib/agent/tools.ts:463-485, 506-554, send_email run :330 / sendDrafts | NEEDS AGENT CHANGE: exact patch in docs/implementation/proposed-approval-binding.md |
| 3 | P1 | POST /api/approvals/:id applied `edits[].draftId` and `postId`/`caption` to ANY of the user's drafts/posts (not only those in the approval), even for reject or already-decided approvals; no length caps. | src/app/api/approvals/[id]/route.ts (was :20-26) | FIXED+test: approval loaded first (404), edits only on approve of a pending approval, only for covered drafts / its own postId, capped. |
| 4 | P1 | POST /api/approvals/:id/compose handed off and marked drafts `approved_unsent` for rejected/executed approvals. | src/app/api/approvals/[id]/compose/route.ts:19 | FIXED+test: requires pending (or approved+blocked_integration, the "connect to finish" case). |
| 5 | P1 | /api/health was public and disclosed capability flags, schema gaps, seat cap, photo-pipeline error text, provider call counts, and fired outbound provider calls (Zillapi key probe, Google Street View with the key) on every anonymous hit (cost/abuse, and Google error text). | src/app/api/health/route.ts:49-50 | FIXED+test: public gets `{ok}` only (503 `{ok:false}` when no DB). Detail requires `Authorization: Bearer CRON_SECRET` or signed-in admin. admin-os launch check only needs reachability. |
| 6 | P1 | /api/media/image relayed any `image/*` from allow-listed hosts incl. SVG with same-origin headers (script execution if opened top-level). | src/app/api/media/image/route.ts:18-23 | FIXED+test: raster types only, nosniff, sandbox CSP. |
| 7 | P1 | Bug reports forwarded the last 8 chat messages to a GitHub issue unredacted and with live @mentions. Chat text contains client names/PII; keep GITHUB_BUG_REPO private. | src/app/api/bug/route.ts:37-39 | FIXED+test (secrets redacted, @ neutralised). Owner action: confirm the repo is PRIVATE. |
| 8 | P1 | /api/content/bulk `approve_schedule` with no ids approved every planned post, and archive of up to 100 posts, with no confirmation. | src/app/api/content/bulk/route.ts:7-12 | FIXED+test: no-ids or >10 archive needs `confirm:true`. Current UI sends explicit ids, so unaffected. |
| 9 | P2 | Cron endpoints compared the bearer with `!==` (timing). | cron/reminders:8, cron/daily-summary:12 | FIXED+test: src/lib/server/bearer.ts (sha256 + timingSafeEqual). |
| 10 | P2 | /api/version exposed git branch name. | src/app/api/version/route.ts | FIXED+test (commit short sha + env only). |
| 11 | P2 | Untrusted content: imported CSV/PDF/photo text goes through `getProvider().complete` with a forced JSON schema (`record_attendees`) and no tool loop, so document text cannot trigger tools. Output becomes contacts/notes/memory (`source:"imported"`, confidence .8) and later reaches prompts only through `fence()` inside `<saved_data>` with an explicit "data, not instructions" system line. Residual risk: a poisoned sheet can plant a wrong email/phone/note on a contact; email still needs approval and the card shows recipients. `text_content` of PDFs is searched by search_documents and read by followups.ts:54 (read only, not executed). | src/lib/agent/ingest.ts:192-215, 266-288; llm.ts:35-62 | NOT AN ISSUE for tool execution; residual P2: show "imported" provenance on contacts and never auto-send to imported-only addresses (agent change, optional). |
| 12 | P2 | Workflow PATCH accepts arbitrary `steps[].tool` strings; cannot escape approvals (invoke gates) but should be validated against TOOLS. | src/app/api/workflows/[id]/route.ts:13 | Open (low risk, own data only). |
| 13 | P2 | /api/privacy/delete removes app rows but not the Supabase auth user. | src/app/api/privacy/delete/route.ts | Open (needs `auth/v1/admin/users/:id` DELETE; deliberately not run). |
| 14 | P2 | Per-user autonomy `auto` setting is user chosen; confirm in agent code that sends/deletes/bulk ignore it (hard gates). | src/app/api/me/route.ts:57 | Needs agent-side confirmation; not verified by me. |

## Checked, no issue

- Tenancy: all 72 non-public routes use `api()` (existing test) and every `store.get/update/remove/list/findBy` takes the session user id; FileStore and SupabaseStore both filter by user_id, and `insert/update` cannot be used to forge `user_id` or `id` (tested across properties, contacts, calendar_events, approvals, email_drafts, social_posts, documents, memories, conversations, messages). Files (`/api/files/:id`, media, showing sheets, documents, agreement-pdf, memories) all fetch with `profile.id`.
- Unauthenticated routes: only auth/*, errors (size capped, rate limited, redacted), stripe webhook (HMAC + 5 min tolerance + idempotency), cron (secret), OAuth start/callback (getUserId + signed state), health, version. waitlist is a separate app.
- Admin routes: all 7 call `isAdmin`; `isAdmin` is closed in production/Vercel/Supabase mode without ADMIN_EMAILS (tested in security.test.mts). Now safe from email self-edit via finding 1.
- Local passwordless auth: `localAuthAllowed()` blocks it in production (login, signup, claim via localSignIn, demo).
- Secrets: no keys in git (pattern scan of tracked files), only `.env.example` tracked, `.env*` ignored, no client component reads a server env var, only NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/APP_URL are public, Google Maps key only used in server routes/proxies, `logError` redacts keys/tokens/JWTs, error responses are generic.
- SSRF: calendar link uses safeFetch (FetchBlocked), media image proxy is host allow-listed with `redirect:"error"`.
- Destructive actions: delete routes require `confirm=1`, privacy delete requires typing DELETE, admin clear requires confirm.
- Paid endpoints: rateLimit + ensureCredits on lookup, plan, pull-photos, places, streetview, agent.

## Owner actions
1. Apply supabase/migrations/0012_lock_server_owned_tables.sql to the live project.
2. Confirm GITHUB_BUG_REPO is private.
3. If anything external polls /api/health for detail, send the CRON_SECRET bearer.
4. Hand docs/implementation/proposed-approval-binding.md to the agent-code engineer (finding 2).
