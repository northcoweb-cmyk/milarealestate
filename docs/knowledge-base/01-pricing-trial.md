# Pricing and trial (decided Oct 7)

| Plan | Price | Credits / mo | AI budget cap / mo |
|---|---|---|---|
| Mila Standard | $29 | 700 | $8 |
| Mila Premium | $49 (2x credits) | 1,400 | $14 |
| Team | Custom, contact us | n/a | n/a |

- **Trial:** 7 days, no card, 400 credits, $3 total AI budget. Everyone starts here.
- **Cancel any time.** No contracts. Stripe customer portal button is in Settings > Credits.
- **Promo:** half off the first month, created as a Stripe promotion code (checkout accepts codes). Post it launch day or a week after.
- **Rule:** AI budget stays under 30% of the price, so margin is protected. Credit numbers are a first guess, verify against real usage after week 1.
- **Watch out:** a saved pricing config in the database overrides these defaults. Check Admin > Pricing.
- **Team plan:** the $299 row still exists in config as a placeholder. Hide or replace it with a "Contact us" card before launch.

## Credits, margin and top-ups (Oct 7)
- Top-ups: any amount from 100 to 5,000 credits at **$0.05 per credit**, plus 200/$10, 500/$25, 1,000/$50 presets. Always pricier per credit than a plan (Standard is $0.041, Premium $0.035), so subscribing is the better deal.
- Heavy agent day is roughly 45 credits (chats, drafts, posts, one lookup), so about 900 a month. Standard (700) fits a normal user and runs short for a heavy one, who tops up or upgrades. Premium (1,400) covers heavy use.
- Worst-case gross margin if a user burns the whole AI budget: Standard about 72% ($29 - $8 - Stripe $1.14), Premium about 71%. Typical use costs far less.
- Market research now costs 20 credits (was 10) because one run can make up to 8 paid RentCast calls (about $0.6 at worst). RentCast spend is tracked separately from the AI budget, so watch it.

## Unit economics guard (Oct 8)
Worst case = AI budget fully spent + every paid data limit used + Stripe fee. Must stay under 60% of the price (enforced by `tests/unit-economics.test.mts`).
- Standard $29: AI $8 + 40 data lookups ($2.96) + 40 photo lookups + Stripe = about $14, so at least $15 left.
- Premium $49: AI $14 + 100 data lookups ($7.40) + 100 photo lookups + Stripe = about $28, so at least $21 left.
- A single deep research run can cost about $0.35 to $0.70 in data and AI, so it costs 25 credits. Monthly caps stop daily heavy use from running up a bill: when a cap is hit Mila says so and falls back to web search.
- Limits can be tuned with the `MILA_TIER_LIMITS` env var without a deploy of code.
- Plan quality: Premium (and trials) get the top reasoning model. Standard runs hard questions on the standard model with high effort, plus a shallower research run (5 data calls instead of 8).

## Trial cost limits (decided Oct 9)
Trials have no card behind them, so you pay for every trial user. The rule: **all trial users together never cost more than $20.**

How it is enforced (all in the code, no one has to watch it):
- **Per trial user:** 100 credits, about $0.50 of AI, 2 live listing lookups and 3 photo lookups (these are the paid data calls, a few cents each). That is roughly $0.75 at most per person.
- **All trial users together:** a hard pool of $20 (`trial.pool_usd`, or `MILA_TRIAL_POOL_USD` in the env). When the pool is used up, the smart open-ended answers pause for every trial user. Calendar, contacts, tasks, listings and drafts keep working, and the notice says to start a plan.
- **Seats:** 25 at launch (`SEAT_CAP`). 25 users at the per-user caps is about $19, so the pool is rarely the thing that stops anyone.
- **Test accounts** (`sarahpark0506@gmail.com`, `rystillwell06@gmail.com`, `northcoweb@yahoo.com`) are not counted in the pool and are not limited: they refill with credits and get a $40 a month AI allowance (`MILA_TESTER_AI_BUDGET_USD`).
- To open the trial up (more credits, more seats), raise `trial.pool_usd` first, then the per-user numbers. The math to keep: seats × per-user cost should stay at or under the pool.
