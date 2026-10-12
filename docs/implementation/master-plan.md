# Mila master launch plan (Mon Oct 12 → launch Tue Oct 20, 10 AM ET)
Replaces the day table in week-plan.md. "You" = owner. "Me" = Claude. Batches ship as ONE push per day (Vercel limits). Feature freeze Sun Oct 18.
Busy: Wed 4–9:30, Fri 3–9:30, Sat 2–9:30, Sun 8–3, Tue 10am car (slow wifi).

## Workstreams (everything we discussed)
A. Mila quality: question bank + real-use bug loop; correct times (open houses, in-progress events); out-of-office coverage with pre-departure reminders; accurate property facts (evidence ledger); scoped learning; grounded morning plan; Home "next appointment / commitments"; interpretation tracing.
B. Voice: transcription works; build Mila's SPOKEN voice (natural server voice, metered, with a daily/credit cap); device-test.
C. Photos: pull up to 5 main photos per link, only if the address matches; always at least one (Street View fallback); show the limit to users; portal (Zillow/Redfin) decision pending.
D. Calendar: add-only sync, clean titles/locations/times to Google and Outlook; disconnect works; no pulling.
E. Logins and connections: Google login; Microsoft = calendar/mail; expand the integrations Mila knows and explains; CRM/MLS later.
F. Money: Stripe live (keys, webhook, checkout, cancel, promo code), refund rule (100+ credits), chargeback evidence, terms checkbox, legal pages, annual plan decision, pricing review with real data.
G. Costs and profit: credit-to-dollar, per-user caps, spend ceilings and kill switch, cost ledger by category, top-ups for every API (OpenAI $3-4 left, property data, Maps, email, hosting), alerts, "expected charge" before expensive work, profit per user.
H. Admin/backend: errors, funnel, who is active, spend, waitlist, daily bug export (built), Google Cloud billing upgrade + budget alert.
I. Bug reporting: one-tap flag with what you expected; admin batch export; daily paste to Claude; every bug becomes a test first.
J. Growth: SEO/AI-search foundation (built), Search Console + Bing, same profile name/bio everywhere, Product Hunt + directories, Sarah's TikTok/UGC, waitlist push, launch email, referral program, affiliates, brokerage outreach, annual plan.
K. Launch ops: multi-device test day, rollback, backups, support inbox, Day-1 monitoring, 25-seat cap and invite codes.
L. After launch: team/brokerage workspaces, referral loop in-app, CRM imports, competitor analysis (Meta's Muse), physical Mila product, price revisions.

## Day by day
**Mon 12 (you home ~11am)**
- You: Stripe live setup (keys, webhook with 4 events, NEXT_PUBLIC_APP_URL) → test checkout. Google login + Google Calendar setup. Evening: live-test round 1 (question list), flag bad replies, paste admin export. Paste full /api/health JSON.
- Me: walk you through Stripe + Google; build Mila's spoken voice; start out-of-office flow.
**Tue 13 (car 10am, slow wifi, light work)**
- You: free legal docs (Terms, Privacy, Refund Policy + checkout "I agree"), pricing decision, Search Console + Bing verification, same bio on all profiles, brief Sarah (better TikTok, UGC videos).
- Me: fix batch #1 from Monday's reports; legal pages in the app; out-of-office pre-departure reminders; push once tonight.
**Wed 14 (free until 4; work 4–9:30)**
- You: Microsoft login/calendar setup; confirm Stripe live env in Vercel; top up and list every API/balance (OpenAI, property data, Maps, email, Supabase, Vercel).
- Me: add-only calendar format/timing polish; cost ledger by category + credit-to-dollar + caps check; integrations knowledge for Mila; push once.
**Thu 15 (full day)**
- You: live-test round 2 (deep), paste admin export; test Google/Microsoft connect + disconnect.
- Me: fix batch #2; grow the question bank from real reports; per-user profit view in admin; referral program; push once.
**Fri 16 (free until 3; work 3–9:30)**
- You: test voice (mic + Mila speaking) on iPhone and Android; check every admin page shows real data.
- Me: fix batch #3; expected-charge preview; annual plan if you decide yes; push once.
**Sat 17 (free until 2; work 2–9:30)**
- You: live-test round 3 on phone + desktop + a second person's phone; Sarah posts first videos.
- Me: fix batch #4; security + spend-guard pass; backup/restore check; onboarding polish; launch email drafted; push once.
**Sun 18 (work 8–3; free after)**
- FEATURE FREEZE. You: fresh new-user walkthrough start to finish; queue launch posts. Me: full regression, deploy rehearsal, rollback checklist written.
**Mon 19 (all day)**
- You: multi-device test day (iPhone, Android, desktop, tablet): signup with code, trial, chat, calendar, posts, voice, billing, cancel. One real Stripe purchase + cancel on your card. Verify every env var; confirm waitlist email ready.
- Me: only fixes for what you find; one final push by evening; go/no-go list.
**Tue 20 (launch, 10 AM ET)**
- 8:00 final health check · 9:30 send launch email · 10:00 open signups · all day watch admin errors/spend, fix in one push per batch, post socials, reply to every report.
**Launch week 1 routine:** daily admin export → fixes; daily cost + profit check; SEO/AI-answer check weekly; brokerage outreach; referral push; first reviews (G2/Capterra).

## Decisions still needed from you
Zillow/Redfin portal risk (default: stay blocked, use uploads/Street View); annual plan yes/no; launch promo code yes/no; seat cap stays 25?; Google Cloud billing (upgrade before trial ends).
