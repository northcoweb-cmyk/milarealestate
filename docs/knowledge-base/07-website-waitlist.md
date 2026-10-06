# Website: waitlist

**Goal:** turn video views into waitlist signups and trial starts.

**Needs:** hero with the one-liner and a short product loop video; the 4 features that matter; the "Comment Mila" and waitlist email capture; pricing preview; FAQ; footer. Same brand (Instrument Serif and Inter, sky gradient, night mode).

**Rules:** no vendor names; no fake testimonials or fake stats; mobile first; fast.

**Open:** the owner will provide UI prompts. Build as a separate route group or a separate small site that shares the brand. Collect emails in a table with a double-opt-in-friendly structure, and show the count only if it is real.

## Built (Oct 6, 2026)
- `waitlist/` is its own Vercel project (Root Directory `waitlist`). Hero with flip-clock countdown, scroll-reveal app card, feature grid, "Try it" interactive demo, phone carousel using real app screens, brokerage names (text only, with a no-endorsement note), FAQ, privacy and terms pages (drafts: have them reviewed).
- Signup: `POST /api/join` validates, rate-limits, ignores bots (honeypot), de-duplicates by lowercase email, saves to `waitlist` (with `?src=` source), and emails a confirmation if SMTP is set.
- Launch day: Mila OS > Invites emails each person a private link `/claim?t=...` (main app). They set a password on the same email and go to onboarding; the 7-day trial starts there. Links work once, expire after 45 days.
- Env vars: see `waitlist/.env.example` and `admin-os/.env.example`.
- Migrations to run in order: 0005_waitlist.sql, 0006_waitlist_invites.sql.

## Open
- Confirm the invite flow with a fresh email on production (account creation in Supabase auth could only be tested in local mode).
- Move to a proper sending domain (Resend or similar) before emailing the full list; Yahoo SMTP has low daily limits and may land in spam.
- Real testimonials or numbers only when they exist. Logos only with permission.

## Adding a brokerage logo
1. Put the logo (PNG or SVG, transparent background, trimmed) in `waitlist/public/logos/`.
2. Add one line to the `LOGOS` list in `waitlist/src/components/ui/logo-cloud-2.tsx` with its name, file path, and height class.
The grid resizes itself (1 to 8+ logos). Keep the "no endorsement" line under it.

## Checking signups work
Open `<waitlist-site>/api/health`. `{"database":true}` means signups save. `false` means `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are missing in that Vercel project (this is what makes the form say "Signups are paused").

## Performance notes (Oct 6, 2026)
Measured with a 4x CPU slowdown: scroll 60fps, no dropped frames. What made it lighter: clouds and grain are small pre-rendered images (no live blur or blend filters), animation library loads lazily (LazyMotion), the demo only starts typing when scrolled into view, logos/screens shrunk. Rule: keep effects to transform and opacity; avoid `blur()` filters, big `backdrop-filter`, and `mix-blend-mode` on large or moving areas.
