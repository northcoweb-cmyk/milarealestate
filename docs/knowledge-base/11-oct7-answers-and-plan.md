# Oct 7: answers, decisions and plan

## Decisions made
- Pricing: $29 Standard, $49 Premium (2x credits), Team custom. 7-day free trial for everyone. Cancel any time.
- Launch: capped number of seats, everyone else in a queue.
- Post once a day, "link in bio" only (never the raw link).
- Mila is locked down for testing before anyone but Ryan and his girlfriend uses it.

## Decisions still open
1. 2-week paid trial? Recommendation: no. Two trial types confuse people, and a paid low-price trial adds friction. Instead, the free 7 days plus the half-off first-month code.
2. Headline and launch framing (see doc 09).
3. Logos for the proof strip (real brokerage marks need permission).
4. Vercel Pro: see below.
5. Queue mechanics: seats per day, how long an invite stays valid.
6. Which model after testing (see below).
Pending decisions live in this folder: `09-decisions-log.md` and this file.

## Email setup (how to do all of it)
1. Sending works: Resend, domain verified. Keys: `RESEND_API_KEY`/SMTP vars and `MAIL_FROM` in each project.
2. Receiving: in Porkbun, forward `admin@milarealestate.app` to your real inbox. Set `MAIL_REPLY_TO=admin@milarealestate.app`.
3. Add a DMARC record in Porkbun DNS (TXT, host `_dmarc`, value `v=DMARC1; p=none; rua=mailto:admin@milarealestate.app`).
4. Warm-up: start with 10-20 sends a day to real people (you, friends, design partners), double daily, only send to people who opted in. Never buy lists.
5. Waitlist confirmation and invite emails now use the Mila look (cloud header, serif wordmark, purple/blue). Live after the next deploy to main.
6. Test before launch: send the invite to a Gmail and a Yahoo address and check spam placement (admin page has a send-test).

## Stripe (what is built, what you do)
Built: plan checkout, credit packs, webhook (grants credits, monthly reset, failed payment marks past due, cancel), customer portal button, promo codes at checkout.
You do:
1. Create the Stripe account and finish business details. Work in **test mode** first.
2. Developers > API keys: copy the secret key into the main app project as `STRIPE_SECRET_KEY`.
3. Developers > Webhooks > add endpoint `https://app.milarealestate.app/api/stripe/webhook` with events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
4. Settings > Billing > Customer portal: turn on cancel subscription.
5. Product catalog > Coupons: create 50% off, duration once, then a promotion code (e.g. WELCOME50).
6. Run one test purchase with card 4242 4242 4242 4242, then switch to live keys.
Not yet verified end to end, because it needs your keys.

## Security checklist
Done: access-code lock with per-IP lockout, server-side account creation, signed Stripe webhooks, per-user and global AI budgets, kill switch.
To do: turn off Supabase public sign-ups before the link goes public; Vercel env vars set to sensitive; a spend limit in the OpenAI dashboard; 2FA on Vercel, GitHub, Supabase, Porkbun, Stripe, Resend; rotate any key that was ever pasted in chat; run the security review agent before launch.

## Competitors
- VERA: claims 157 integrations. I can't verify that and neither can you without trying it. Test it: sign up, connect 5 of the claimed ones. An integration count is not a feature. Don't copy their wording or code; learn from concepts only.
- Their traffic: not visible directly. Free estimates from Similarweb or Semrush are rough for small sites. Check their sitemap and meta tags to see how they handle SEO.
- Compass, Lofty: PC-first CRMs for agents. Mila's edge is phone-first, does the work, asks before sending, and costs a fraction.
- Positioning: be the agent that does work, not another dashboard. Price $29 undercuts most.

## Data and integrations roadmap (easy connect, one click)
1. Gmail/Outlook sending via Google/Microsoft OAuth (Google sign-in comes a few days after launch). Others keep "open in mail app".
2. Auto-text from the agent's own number: needs Twilio-style provider and carrier registration (A2P 10DLC, takes weeks). Start the registration now if you want it.
3. MLS: no free national feed. Real options: an MLS-specific RESO feed via the agent's broker, or a data reseller (Bridge, Spark, Trestle). Each MLS needs the broker's permission. RentCast stays for public/estimate data.
4. Property facts: any detail Mila states is shown with its source, and a mismatch is confirmed with the agent before anything is saved or posted. Posts use the full verified address.

## Notifications
Plan: one daily summary email (and push where supported), sent only to people who opened the app in the last 7 days, with an off switch. Not built yet.

## Legal
No lawyer needed to start: use a reputable template generator (Termly, iubenda, or Stripe Atlas/Clerky-style templates) for Terms and Privacy, then get a lawyer to review once you have revenue. Must cover AI output disclaimers, email/text consent, and that Mila does not give legal or Fair Housing advice.

## Vercel
You do not need Pro for normal use, since the limit is 100 deployments per day and a normal day is a handful. Pro helps if you keep hitting it, and it is also required for commercial use under Vercel's terms ($20/month). Since you are charging customers, plan on Pro before launch.

## Models
OpenAI GPT-6 tiers are configured but not confirmed on your key. I'd test reliability and cost of OpenAI against Claude on the same 100 requests, then pick one.
