# Pricing and trial

| Plan | Price | Credits / mo | AI budget cap / mo |
|---|---|---|---|
| Solo | $79 | 1,500 | $18 |
| Pro | $129 | 3,500 | $32 |
| Team | $299 (up to ~$499 for bigger teams) | 12,000 | $85 |
| Enterprise | Custom | n/a | n/a (not built) |

**Trial:** 7 days, no card, 400 credits, $3 total AI budget.
**Rule:** every plan's AI budget stays under 30% of its price so margin is protected.

**Trial tracking (admin dashboard):** Day 1 first task, Day 2 returned, Day 3 unprompted use, Day 5 connected more of the workflow, Day 7 still active, then paid.

**Not live yet:** Stripe is not connected, so there is no payment path after the trial. Must be done before real users hit Day 7.
**Watch out:** the saved pricing config in the database can override new defaults. Check Admin > Pricing.
