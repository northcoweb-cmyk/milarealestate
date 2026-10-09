# Decisions log (newest first)

**Oct 6, 2026**
- Release date: **Oct 20**. Quality over date: if the go/no-go list isn't green, it moves.
- Payments: Stripe, using the owner's agency Stripe account.
- Google Cloud: keep the free credits; upgrade billing about a week before launch (target Oct 12 to 13). Reminder set.
- Pricing: lower and simplify. Mila saves clicks but isn't full automation (sending a message still opens the phone's message app). Price to be fair for that so lots of agents sign up. Proposal in chat; owner to decide.
- Domain: not decided; cheap but good. Candidates to check availability for later.
- Sending email and admin email for now: milarealestateapp@yahoo.com.
- Platforms: Instagram and X first; TikTok optional (low effort: reuse the same videos).
- Waitlist page: owner is building it. Signups go to the `waitlist` table (migration 0005).
- Test users: owner and partner using the app; then 5 to 10 prototype testers; soft launch before Oct 20.
- Admin: a separate "Mila OS" dashboard project (admin-os/) deployed as its own Vercel project.
- Launch is 10:00 AM Eastern on Oct 20 (not 9).

**Oct 7, 2026**
- Domain bought: **milarealestate.app** (Porkbun, DNS there). Addresses: `milarealestate.app` and `www` = waitlist (later the public marketing site with pricing and how to sign up); `app.milarealestate.app` = the Mila app; `admin.milarealestate.app` = Mila OS.
- The app is invite-only: creating an account needs the access code (SIGNUP_ACCESS_CODE, default 3725). Existing accounts sign in normally; waitlist members use their personal invite link. A wrong code locks only that visitor's IP for 30 minutes (no site-wide lockout, by choice). Turn off Supabase "Allow new users to sign up" before sharing the link publicly, or the code can be bypassed.
- Browser tab titles: waitlist "Mila | AI for Real Estate"; app "Mila | Dashboard". Share cards live at `/og.jpg` in both.
- Email: send through Resend on the domain (hello@milarealestate.app), forward inbound to the Yahoo inbox; Yahoo only for early testing.
- **Google sign-in is wanted**, planned a few days after launch (after the first 7-day week). See the roadmap, item 8.
- Vercel Hobby plan hit the 100 deployments/day limit. Each project now builds only when its own folder changes and only on main. Plan to move to Vercel Pro before launch.
- Contact address: **admin@milarealestate.app** (Porkbun forwarding to the Yahoo inbox) for bugs and support. Emails are sent from hello@milarealestate.app with replies going to admin@ (MAIL_REPLY_TO). Public pages no longer show the Yahoo address.
- Feedback button (migration 0008) built and waiting to ship once Vercel deploys are available again.
- **Design direction (memory):** the app should use the purples and cool blues from the Mila website (sky gradient from soft blue through violet to peach, white cards, Instrument Serif headlines, Inter body) so people who join from the waitlist feel they are in the same product, not a new UI. The app currently uses a different, more neutral look; a visual pass to match the website is on the to-do list. Tokens to reuse live in `waitlist/src/app/globals.css` (sky, iris, peach, night, paper).


## Oct 7 (evening)
- Launch seats: 20 people for the first 1-2 weeks, then widen slowly. Controlled by `SEAT_CAP` (set it in BOTH the admin-os and main app projects; default 20). Admin "send invites" stops at the cap, and the claim page refuses past it. Everyone else stays in the queue.
- Team plan is "Contact us": opens a pre-filled email to admin@milarealestate.app (team name, agents, CRM, MLS). Team logo, shared pipeline and invite links are not built yet.
- Property details found online show "Not looking right? Let's change it." which jumps to the edit form.
- Notifications: no push. Plan is an in-app inbox plus a daily summary card on Home, and email only for people who used the app recently.

## Oct 9: trial users are hard-capped at $20 total
- Why: Ryan pays for every trial user, with no card on file. Wants all trial users under $20 total.
- Decision: per trial user 100 credits, about $0.50 AI, 2 listing lookups, 3 photo lookups. Plus a pool: all trial users together stop at $20 of real cost.
- When the pool is full: smart answers pause for trial users (rules-based work keeps going) and they are pointed to a plan.
- Test accounts are excluded and never limited.
- Where: `src/lib/config.ts` (trial), `src/lib/ai/budget.ts` (pool check), `src/lib/media/limits.ts` (free tier lookups). Details in `01-pricing-trial.md`.
