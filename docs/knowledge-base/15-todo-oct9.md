# Friday Oct 9: work day plan (about 11am to 11pm)

Rule for the day: **batch deploys.** Don't redeploy after every fix. Collect bugs with the 🐞 flag, I fix them in batches, and we push to `main` a few times total. If you upgrade to Pro, ignore this rule.

## 11:00 to 11:45 Get live (30 to 45 min)
- [ ] Try **Redeploy** on the newest `main` commit in all 3 Vercel projects (main app, admin-os, waitlist). If it says rate limited, go to the Pay option below or skip to "work that doesn't need a deploy".
- [ ] Open `app.milarealestate.app/api/version`. It should show `643945c` (or newer).
- [ ] Supabase SQL editor: run `0009_bug_reports.sql`, then `0010_os_social.sql`.
- [ ] Main app env vars: `INTEGRATION_ENCRYPTION_KEY` (any long random string), `SESSION_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`, `CRON_SECRET`, `GITHUB_BUG_TOKEN`. Redeploy once after adding.
- [ ] Porkbun: forward `admin@milarealestate.app` to your inbox.
- [ ] Check 4 things live: purple/blue night sky, "Sync your calendar" on Calendar, 1227 in Properties, "Report a bug" in More > Settings.

## 11:45 to 1:45 Hard test block 1 (you, then Sarah)
Use real addresses and real client situations. Tap 🐞 on anything wrong. Run these:
- [ ] Showing with a client by name, answer the time with "They said 2", move it, cancel it.
- [ ] Two bookings in one message. A listing appointment. A closing with a timeline.
- [ ] New buyer with email and phone, then "text her…", then tap Open in Messages and come back: does "Did you send your text?" show?
- [ ] "Make me an Instagram post for it" right after a showing. Check the address and photo are the right home.
- [ ] Add a listing, ask what's missing, ask for a checklist.
- [ ] Ask hard AI questions: pricing a home, the market in your area, apartments for a client, a negotiation script. Note which feel dumb.
- [ ] Try to break it: typos, ALL CAPS, vague messages, "help", junk names.
- [ ] Check the emoji answer style and that no `**` or `#` ever shows.

## 1:45 to 2:30 Break

## 2:30 to 3:30 Stripe (test mode)
- [ ] Follow `12-connections-setup.md` > Stripe. Add keys and webhook, then buy Standard with card 4242 4242 4242 4242.
- [ ] Open "Manage or cancel subscription". Cancel. Check credits reset behavior.
- [ ] Make a 50% off promo code and try it at checkout.
- [ ] Branding: logo and purple (#7B63E8) in Stripe > Settings > Branding. Descriptor "MILA".

## 3:30 to 4:30 Connections
- [ ] Google keys (Cloud Console steps in `12-connections-setup.md`). Connect your Gmail. Add yourself and Sarah as test users.
- [ ] Microsoft keys (Entra app steps). Connect an Outlook account.
- [ ] Apple Calendar: share as Public Calendar, paste the link in Calendar > Sync. Create an event in Apple Calendar, press Sync, confirm it appears and that a showing at that time warns about a conflict.
- [ ] Send a real email from Mila through Gmail. Check the contact card shows it and any reply.

## 4:30 to 5:30 Email and launch queue
- [ ] Send a test invite to northcoweb@yahoo.com from Mila OS > Invites. Check inbox vs spam.
- [ ] Join the waitlist with 2 test emails. Confirm the first ones get "on the list", and past `SEAT_CAP` get "in the queue" and show Queued in Mila OS.
- [ ] Press Grant access on one. Confirm the "Access granted" email and that claiming makes an account.
- [ ] Add the DMARC DNS record (see `11-oct7-answers-and-plan.md`).

## 5:30 to 6:30 UI pass (with me, in chat)
- [ ] Go through Home, Chat, Calendar, Contacts, Properties, Content, More on your phone. Screenshot anything that overlaps, clips, or looks off.
- [ ] Purple and blue clouds: say where you want more (cards, tab bar, headers) and how strong.
- [ ] Settings > Credits: check plan cards and the top-up box.

## 6:30 to 7:30 Mila OS and the team
- [ ] Log in to Mila OS, pick Ryan, check Overview, Waitlist, AI spend, Feedback (your test bug reports should be there).
- [ ] Sign out, log in, pick Sarah. Confirm she only sees Social. Have her log one post and one conversation with a realtor.
- [ ] Look at AI spend by feature and per user after the test block: is anything unexpectedly expensive?

## 7:30 to 9:00 Content and growth
- [ ] Video #5 (`video-prompts/05-setup-maze.md`): take fresh app screenshots now that the app looks right.
- [ ] Post for X and Instagram (one post today). Sarah posts on TikTok and X.
- [ ] Reply to a few realtors on X and Instagram.
- [ ] Pick 3 to 5 design partners from Sarah's contacts.

## 9:00 to 10:00 Legal and money admin
- [ ] Terms and Privacy from a template (Termly or iubenda). Add links to the waitlist footer and the sign-up screen. I can wire them in.
- [ ] Decide: pay for Vercel Pro now, or later. (Required before charging customers.)
- [ ] Set a spend limit in your OpenAI account.

## 10:00 to 11:00 Wrap up
- [ ] Send me the list of everything flagged and anything still broken.
- [ ] Mark what worked. Write tomorrow's top 5.

---

## What I'll do the same day (no deploy needed until you say)
- Fix every bug you flag, in batches, with a test for each.
- Build next: first-week checklist (Mila asks what the agent wants help with, then recommends), a "next step" line on each contact row, and the "check photo location against the address" fix for wrong Street View images.
- Run more hard conversations from your test notes.
- Keep `main` ready, then push once when you say.

## Pay option (if the redeploy is still blocked)
Vercel Pro is $20/month and removes the limit immediately. If you pay, push and redeploy as often as needed.
