# Mila — your personal real-estate work agent

Mila is a mobile-first PWA for US real-estate agents. You tell Mila what you need done ("I have an open house at 123 Main Street Sunday at 1 PM. Set everything up."); Mila works out the steps, prepares calendar events, reminders, emails, social posts and tasks, and asks for approval before anything consequential. It is not a CRM and not a chat wrapper.

## What's real vs. what needs your keys

| Capability | Works with no keys? | Needs |
|---|---|---|
| Home / chat, thinking states, time-of-day sky, PWA install | Yes | — |
| Rules-based understanding of common requests (open house, new buyer, move event, reminders, follow-ups, imports, social/email drafts) | Yes | — |
| Contacts, timeline, memory, tasks & approvals, calendar (Mila's own), templates, documents, workflows, credits ledger, owner dashboard | Yes (local JSON store) | — |
| CSV / pasted-list / XLSX / text-PDF sign-in sheet import | Yes | — |
| Free-form requests the rules don't cover, drafting polish | No | `ANTHROPIC_API_KEY` |
| Reading **photos** and **scanned PDFs** (sign-in sheets) | No | `ANTHROPIC_API_KEY` |
| Live **market research** with sources | No | `ANTHROPIC_API_KEY` (uses web search) |
| Accounts with passwords, multi-device, production database + file storage | No (local dev uses passwordless local accounts) | Supabase |
| Gmail send/search, Google Calendar sync, Google Contacts / Sheets import | No | Google OAuth keys |
| Real billing (plans + credit packs) | No (dev billing state) | Stripe |
| Email reminders / notifications | No | Resend (+ cron) |
| Voice input | Yes in browsers with speech recognition (Safari, Chrome) | — |
| SMS, Instagram/Facebook/TikTok/LinkedIn publishing, Outlook, Apple Calendar, MLS data, image generation | **Coming soon** — shown as such, never faked | — |

Honesty rules baked in: approving an email without Gmail connected does **not** claim it was sent (it stays "approved — waiting on connection"); social posts are approved for manual posting; property facts are only used after you mark them verified; no stock photos; market answers show date, location, data period and sources or are refused.

> The Supabase adapter, Google adapter, Stripe checkout/webhook and Anthropic provider are written against the vendors' documented APIs but could **not** be exercised against live services in the build environment. Test each with a real account before launch.

## Quick start (no keys)

```bash
npm install
npm run dev          # http://localhost:3000
```
Open the app → **Explore with demo data** (fictional agent "Sarah Carter") or create a local account. Data lives in `.data/` (git-ignored).

```bash
npm run lint && npm run typecheck && npm test
```

## Architecture

```
src/app/            Next.js App Router: pages (Home, Contacts, Calendar, Tasks, More, Settings…) and /api routes
src/components/     Sky (sun/stars/clouds), glass UI, chat blocks, composer (voice + attachments), review sheets
src/lib/agent/      The agent
  intents.ts, nlu.ts   fast rules router + date/time/address/budget parsers (free, instant)
  llm.ts               optional AI: classify unknown requests, chat, drafting (cheapest capable tier)
  tools.ts             tool registry: create_contact, create_calendar_event, draft_email, send_email, save_memory…
  policy.ts            autonomy: ask vs auto; deletes, cancellations and sends to >10 people ALWAYS ask
  handlers/            open house, calendar (conflicts, moves, stale comms), contacts, follow-ups, reminders, comms
  engine.ts            one turn: understand → plan → execute/approve → record → charge credits
  prioritize.ts        urgent/important/upcoming/low scoring (capped, no fake urgency)
  memory.ts            durable structured memory (view/edit/delete in More → Memory)
src/lib/ai/provider.ts provider abstraction with tiers (fast / standard / reasoning / vision / research)
src/lib/credits.ts     credit ledger + per-operation usage rows (provider, model, tokens, USD cost, credits)
src/lib/db/store.ts    Store interface → FileStore (local) or SupabaseStore; always scoped by user_id
src/lib/integrations/  Google adapter (OAuth, Gmail, Calendar, People, Sheets), AES-GCM token encryption
supabase/migrations/   Postgres schema + Row Level Security
```

### How the agent works
1. **Understand** — rules router first (free). Unknown requests go to a cheap model (if configured), whose output is re-parsed by the same deterministic parsers.
2. **Plan** — intent → workflow (editable under More → Workflows). Missing info is asked only when needed (e.g. "Which day?").
3. **Check** — the calendar is always checked first; conflicts become a choice (keep / move / find another time).
4. **Execute through tools** — each tool returns a structured result. Consequential tools declare a *gate*; the autonomy policy turns them into **approvals** (Tasks) unless you've allowed them (Settings → Mila).
5. **Record** — timeline events, durable memory, usage + credits ledger.
6. **Follow through** — moving an event flags drafts that mention the old time and asks whether to update them.

### Credits
Customers see "Mila Credits". Every turn writes a `usage` row (provider, model, tokens, estimated USD cost) and a `credit_transactions` row. Costs, plans and packs live in the `app_config` table, edited at **/admin** (open to `ADMIN_EMAILS`, or any local user in dev) — never hard-coded in agent code. The admin page shows per-user credits used vs. real AI cost vs. revenue. In dev, accounts get 100,000 development credits but the ledger records everything exactly as in production. Set per-model prices with `MILA_PRICE_*` so cost estimates stay accurate.

### Security
Server-only secrets; OAuth tokens encrypted (AES-256-GCM) and never sent to the client; every query scoped by `user_id`; RLS on every table; signed httpOnly session cookies (local) or Supabase tokens; uploads served only through an ownership-checked route; deletes require explicit confirmation; data export and delete-all in Settings → Privacy.

## Production setup

1. **Supabase**: create a project → run `supabase/migrations/0001_init.sql` (SQL editor or `supabase db push`). Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. In Auth settings choose whether email confirmation is required.
2. **Secrets**: generate `SESSION_SECRET` and `INTEGRATION_ENCRYPTION_KEY` (`openssl rand -hex 32`), set `ADMIN_EMAILS` and `NEXT_PUBLIC_APP_URL`.
3. **AI**: `ANTHROPIC_API_KEY`.
4. **Google**: Cloud console → OAuth consent screen + Web OAuth client; enable Gmail, Calendar, People and Sheets APIs; redirect URI `https://YOUR_DOMAIN/api/integrations/google/callback`; set `GOOGLE_CLIENT_ID/SECRET`. Gmail/Calendar scopes are "sensitive/restricted" — plan for Google's OAuth verification before public launch.
5. **Stripe**: set `STRIPE_SECRET_KEY`; add a webhook to `/api/stripe/webhook` (events `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`) and set `STRIPE_WEBHOOK_SECRET`.
6. **Email + cron**: `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET` (Vercel Cron is preconfigured in `vercel.json`).
7. **Deploy** to Vercel (`next build`). `GET /api/health` reports which capabilities are active (booleans only).

## Adding an integration
Add an adapter in `src/lib/integrations/`, expose Connect/Disconnect routes under `/api/integrations/<name>/`, list it in `/api/integrations` (status: connected / not_configured / coming_soon), and add tools to `src/lib/agent/tools.ts` that return `fail("not_connected", …)` when it isn't linked. Gate consequential tools in `policy.ts`.

## Roadmap / known gaps
Marketing website (build next from the real app); SMS (Twilio); social publishing; Outlook/Apple Calendar; MLS data; image generation (seam in `ai/provider.ts`); server-side voice transcription; Google Calendar two-way sync is pull-on-demand; email-based daily debrief delivery.
