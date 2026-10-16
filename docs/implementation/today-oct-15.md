# Thu Oct 15: one thing at a time

Rule: finish a step, check it, push, tick it, then start the next. Nothing else is open at the same time.
Not doing (decided): Supabase/Google/Vercel upgrades (the 23rd, only if needed), lawyer review (no budget), @-agents (big update about 2 weeks after launch), SEO (after launch).

## Build day (me, one at a time, you check each)
- [x] 1. **Lock on a finished trial / no plan:** chat box disabled, send button grayed, mic/attach/chips/buttons dead, server refuses everything (billing + support still work).
- [x] 2. **Waitlist SEND does nothing:** find out why, show live progress ("Sent 12 of 40"), make it impossible to double-send.
- [x] 3. **Support email finished:** inbound webhook + env vars, one test ticket, a reply back.
- [~] 4. **Google verification (domain verified; waiting 24h then resubmit, see google-verification.md):** get the "unverified app" screen and your personal email off it (new Owner account, branding, domain check, privacy/terms links, demo video, submit).
- [x] 5. **Site bug sweep:** every page on phone and desktop, in light and dark. Fix what is broken, one page at a time.
- [ ] 6. **Feature gaps from the chat:** anything you asked for that is not built yet (list it here as we find it).

## Step 6 list (from your screenshots, in the order I'm doing them)
- [x] 6a. Draft email/text signs off with your name twice ("Warmly, Admin Tester / Keller Williams / Admin Tester").
- [x] 6b. "Automatic posting isn't available yet" still shows on approvals; remove that wording everywhere.
- [x] 6c. Two buttons on one reply ("Do it" and "Continue it"): one button per Mila reply, plus the follow-up cards when needed.
- [x] 6d. Chat panel cut off at the bottom on desktop.
- [x] 6e. To-do keeps tasks for things that already happened (post for an open house from a week ago); add a way to mark off by hand ("I did this").
- [x] 6f. Calendar settings: Apple logo next to Apple, Google logo next to Google; confirm the calendar connection saves; remind people a day before anything that goes on the calendar.
- [ ] 6g. "Mila is just talking when she gives a response, change that out": need to know what it should be instead (asked below).

## You (evening)
- [ ] 7. Run the question list on Mila, then admin -> Feedback -> "Copy today's reports for Claude" and paste it. Every bad reply becomes a test first.

## Done today so far
- Orb (in place, no dim), chips fade while it plays.
- Credit value chart in Mila OS.
- Open-house answer card is cleaner and offers real actions.
- Google scopes added (you). Calendar no longer drops Sheets (reconnect once).

## Step 7 list: the dinner-break batch (Thu night). Do all, test each, nothing skipped without saying so.
- [x] 7.01 Open house for this Saturday did not create the post or have it ready. Every post with a property photo uses the full-photo style.
- [x] 7.02 Content tab: sections for "Needs posting" and "Posted", with an obvious mark-off both ways.
- [x] 7.03 Remove "pull photos from a link" in Content.
- [x] 7.04 Planning content for a day adds a reminder and a to-do for that day.
- [x] 7.05 Remove "Copy to another platform" (Instagram story / TikTok).
- [x] 7.06 Remove the Rewrite and Archive buttons.
- [x] 7.07 Reviewing an Instagram post goes straight to the editor in Content.
- [x] 7.08 To-do: tasks marked off by time, plus an obvious end-of-day "what did you do today" check-off.
- [x] 7.09 Home: "Start with these 5 - 32 things are ready for you:" shows nothing under it; fix, and add drag-to-reorder for the high-priority items.
- [x] 7.10 Contacts: an easy way to add missing email/phone etc.
- [x] 7.11 Properties: finished showings/open houses go to Past; counts on every filter are correct; only upcoming ones in Upcoming.
- [x] 7.12 Onboarding: the second area field prefills like the first.
- [x] 7.13 Calendar: month view (1st to last day, only that month), click through months; remove Out of office from Calendar and put it clearly in More.
- [x] 7.14 Fix the confusing "Fix the conflicts - push all 1 to the first day back" text.
- [x] 7.15 More page: move property things (showing sheets etc.) to where they belong.
- [x] 7.16 Code-looking text ({{VARIABLES}}) shown to users: fix.
- [x] 7.17 Two Back buttons on some pages: one only.
- [x] 7.18 Notifications: remove SMS, make email work, choose channels in onboarding, known limits for browser/home-screen notifications.
- [x] 7.19 Appearance tab: sky, animated clouds, motion toggles actually work.
- [x] 7.20 Delete my data: wipe all memory and activity, then ask if they also want the account deleted.
- [x] 7.21 Request a copy of data: becomes a support ticket in Mila OS with a file of all their data.
- [x] 7.22 Security: change password with the old password.

### Reminder emails: timing
The 5-minute GitHub job was removed (it emailed failures until a secret was added). Vercel's free plan runs scheduled jobs once a day, so a reminder email goes out when the app is open (checked every minute) or on the daily run. For on-time emails with the app closed: upgrade Vercel to Pro (per-minute schedule), or add a free outside pinger later.
