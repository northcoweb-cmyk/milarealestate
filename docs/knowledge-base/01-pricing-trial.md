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
