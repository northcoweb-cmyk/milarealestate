# Refund and chargeback policy (owner decision, Oct 11)

- No refunds once an account has used 100 or more credits in the period (`REFUND_MAX_CREDITS_USED` in `src/app/api/billing/refund-request/route.ts`). Under that, a person reviews each request. Cancel any time via Manage subscription.
- Every refund request stores plan, status, credits used, balance and timestamp (feedback row, category `refund_request`). That is the usage evidence for a Stripe dispute.
- Chargeback defense checklist (Stripe disputes): usage log (credits ledger), signup/consent timestamps, the terms shown at checkout, support/refund request history, cancellation availability.
- TODO owner/legal: publish this as terms shown before checkout, with an "I agree" line; confirm wording with a lawyer. Until Stripe live checkout is tested, treat all of this as untested.
- Enable Stripe Radar defaults; consider requiring card verification at trial start.
