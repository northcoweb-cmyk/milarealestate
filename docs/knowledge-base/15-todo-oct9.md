# Tomorrow (Fri Oct 9): testing and fixing day

## First thing (setup, ~30 min)
- [ ] Vercel: confirm the main app and Mila OS deployed the latest `main`; redeploy if not.
- [ ] Supabase SQL editor: run `0009_bug_reports.sql` and `0010_os_social.sql`.
- [ ] Main app env: `INTEGRATION_ENCRYPTION_KEY` (any long random string, REQUIRED for calendar links and Gmail/Outlook), `SESSION_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`, `CRON_SECRET`, `SEAT_CAP`, `GITHUB_BUG_TOKEN`.
- [ ] Porkbun: forward `admin@milarealestate.app`.

## Calendar sync (built Oct 8, needs a live test)
- [ ] **Apple Calendar by link:** Calendar app, share the calendar as a Public Calendar, copy the link, paste it in Mila > Calendar > Sync your calendar > Add link. Check events appear, and re-sync doesn't duplicate.
- [ ] **Google Calendar:** needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (steps in `12-connections-setup.md`). Connect, press Sync now, and book a showing that clashes with a Google event to confirm Mila warns.
- [ ] **Outlook calendar by link:** Outlook > Settings > Calendar > Shared calendars > Publish, paste the ICS link.

## Test Mila hard (you and Sarah, with the bug flag)
- [ ] Real addresses and real client situations; flag anything wrong.
- [ ] Re-test the Turner flow: showing, "They said 2", text with Messages check-in, post for it, property appears in Properties.
- [ ] Try the AI-only questions (pricing, market, apartments) once your AI key is live. Note which model answered.

## Money
- [ ] Stripe test mode end to end (checkout, cancel in portal, promo code).
- [ ] Look at Mila OS > AI spend after the testing day: cost per user and per feature.

## UI pass (together)
- [ ] Purple and blue clouds across the app (first pass is in: sky and accent colors).
- [ ] Card styling, spacing, any overlap issues on phone.

## Ideas parked
- First-week checklist after Mila asks what the agent wants help with.
- Unified inbox and "next step" on each contact row.
- Team plan: logo, shared pipeline, invite links.
