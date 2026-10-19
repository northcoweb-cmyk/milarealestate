# Lock-in week: Mon Oct 12 → launch Fri Oct 23 (moved from Tue Oct 20)

Rules for the week: one push (one deploy) per batch of fixes, no new features after Sun Oct 18, nothing is called done until it is checked on a real phone. Owner is free from ~11am unless noted. Work blocks you gave: Wed 4–9:30, Fri 3–9:30, Sat 2–9:30, Sun 8–3. Car service Tue 10am (slow wifi).

| Day | Your focus (owner) | My focus |
|---|---|---|
| **Mon 12** (11am →) | 1) Stripe setup walkthrough: products, keys, webhook, test checkout. 2) Google login + Google Calendar walkthrough (Cloud Console OAuth app, Supabase provider, redirect URL). 3) Evening: live-test batch #1 on your phone, flag every bad reply with the 🐞 button | Photo-from-link rules (5 max, address match), calendar add-only mode, admin "copy today's reports" button, Mila voice (spoken replies) |
| **Tue 13** (car, slow wifi) | Light work only: free legal pages (see below), decide pricing, send Sarah the content plan, flag bugs from your phone | Fix batch from Mon's reports; docs; nothing heavy to download |
| **Wed 14** (free until 4) | Microsoft sign-in + Outlook calendar walkthrough; Stripe live-mode keys in Vercel; /api/health all green | Out-of-office flow (pre-departure checklist and reminders), open house and calendar time correctness, credits/cost dashboard |
| **Thu 15** (all day) | Live-test batch #2 (use the question list); run the admin export and paste it to me | Fix batch #2, expand the question bank from real reports, usage caps and credit/profit check |
| **Fri 16** (free until 3) | Test voice (mic and Mila speaking) on iPhone and Android; check admin pages show real data | Fix batch #3; integrations knowledge (what Mila can connect to) |
| **Sat 17** (free until 2) | Live-test batch #3, multi-device (phone + desktop + a second person's phone) | Fix batch #4, security/spend-guard pass, backup and restore check |
| **Sun 18** (work 8–3, free after) | Final walkthrough as a brand-new user; Sarah's UGC videos queued | FEATURE FREEZE. Regression run, deploy rehearsal, rollback checklist |
| **Mon 19** (all day) | Multi-device test day: signup with code, trial, chat, calendar, posts, billing, cancel. One live Stripe purchase and cancel with your own card | Only fixes for things you find. One push at the end of the day |
| **Fri 23** | Launch (moved from Tue 20) | Watch admin errors and spend; same-day fixes in one push each |

## Model use (so quality never drops)
Rules are embedded in `CLAUDE.md`: Haiku 5.5 for mechanical work only; Sonnet 5.5 for anything that changes how Mila understands, decides, or handles money/data.

## Free legal route (no lawyer)
Not legal advice, so treat it as a stopgap. Use a reputable free generator for a Terms of Service, Privacy Policy and Refund Policy (Termly, Iubenda free tier, or the Stripe-provided templates), set governing law to your state, and add a checkout checkbox "I agree to the Terms and Refund Policy". The refund rule is yours to set: no refunds once 100+ credits are used (see knowledge-base/19). Many state bar associations and law-school clinics offer free or cheap small-business reviews later; book one after launch money comes in. Also keep the usage ledger: it is your main evidence in a chargeback.

## Pricing and profit (what is known)
Plan config (src/lib/config.ts): Mila $49/mo, hard AI-spend ceiling $14/mo per subscriber (provisional), top-ups $0.05/credit. Stripe takes about 2.9% + $0.30 (about $1.72 on $49). So the worst-case AI cost leaves roughly $33 before hosting, property-data and email costs. These ceilings are limits, not measured costs: real cost per user is unknown until the first week of usage. Recommendation: keep $49 for launch, watch the cost ledger for 2 weeks, then adjust. A lower price needs measured cost data first.
