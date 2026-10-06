# Launch plan: release Oct 20, 2026

**Rule:** if a gate below is red, the date moves. A broken launch costs more than a late one.

## Start today (long lead times)
- **Stripe:** create and verify the account now (verification can take days), then connect checkout, webhooks, the plan picker and the trial-to-paid path.
- **Google Cloud:** check the exact end date of the free trial in the console and upgrade billing BEFORE it ends (Street View photos stop otherwise). Set a budget alert.
- **Pricing config:** update the saved plans in Admin > Pricing to Solo $79 / Pro $129 / Team $299.
- **Domain and email:** pick the domain for the site and the sending address for emails.

## Week 1 (Oct 6 to 12): build
- Waitlist website (needs the owner's UI prompts).
- Trial-extend tool in the admin screen (for "Comment Mila").
- Run the specialist agents on everything that changes. First full pass after Stripe is wired.
- Post videos daily (Maryland, Flow mansion). Create the X account.
- Start a competitor sheet (factual only).

## Week 2 (Oct 13 to 19): harden
- Full pass: fix-it-felix, screen-sweeper, journey-tester, media-qa, content-studio-qa, growth-funnel-qa, ai-spend-guard, data-integrity, copy-voice, trust-guard, mobile-perf.
- Real-device test: iPhone Safari and installed PWA, an Android phone, and desktop. Sign up from scratch, do all five trial tasks, pay with a Stripe test card, cancel, and let a trial expire.
- Load check: confirm AI spend caps hold with 50 simulated users.
- Soft launch to 5 to 10 friendly agents. Fix what they hit.
- Freeze features Oct 17. Only bug fixes after that.

## Hype (waitlist page)
- Waitlist live as early as possible; link in every bio.
- Countdown to Oct 20 on the page and in posts.
- Teaser posts: one feature clip a day; "Comment Mila" for early access.
- Founding-member offer for the waitlist (only if the owner approves a real offer).

## Launch day (Oct 20)
- Release-captain runs the final gate and checks the live site.
- Email the waitlist; post the launch video everywhere; reply to every comment.
- Watch the admin dashboard: signups, trial starts, errors, AI spend. Kill switch ready (MILA_AI_DISABLED=1).

## Go / no-go checklist
- [ ] Stripe takes a real payment and the trial converts
- [ ] Sign-in, onboarding and the 5 trial tasks work on a real iPhone
- [ ] Street View photos load (Google billing upgraded)
- [ ] AI spend caps verified; global cap and alerts set
- [ ] Migrations run; data persists across a deploy
- [ ] No vendor names or raw errors visible to users
- [ ] Waitlist emails send and unsubscribe works
- [ ] Privacy policy and terms pages exist
