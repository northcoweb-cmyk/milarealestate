# Launch-eve lock (Thu Oct 22) for Fri Oct 23, 10 AM ET

## Code state (verified today, from `main` at 7010494)
- tsc clean (app, waitlist, Mila OS), eslint clean, 492 unit tests, 2,398-scenario QA, production `next build` passes.
- Feature freeze holds: nothing new today unless it is a launch blocker.

## Owner checklist (nothing here can be done from code)
1. **Google Cloud billing upgrade** (Street View, address search, geocoding) before 10 AM. Images come back on their own.
2. **OpenAI credits + a spend limit.** Without them every research or "ask anything" reply fails.
3. **Vercel env, all three projects (app, waitlist, Mila OS):** `ACCESS_CODE_OFF_AT=2026-10-23T14:30:00-04:00`, `NEXT_PUBLIC_LAUNCH_AT=2026-10-23T14:30:00-04:00` (waitlist). Redeploy after saving. Access code 3725 still works until 8 AM.
4. **App env present:** `RESEND_API_KEY`, `STRIPE_SECRET_KEY` + price IDs, `STRIPE_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_MAPS_API_KEY`, Supabase URL/anon/service keys.
5. **Supabase** project running (not paused), migrations 0009 and 0013 applied.
6. **Stripe:** live mode, webhook pointing at the app, one real $39 test purchase refunded afterwards (credits must appear instantly).
7. **Google OAuth:** redirect URIs `/api/auth/oauth/google/callback` and `/api/integrations/google/callback` listed; consent screen published or test users added.
8. **Launch emails:** send from Mila OS only at the planned time (type SEND). Nothing sends automatically.
9. **Turn off Tester auto top-up** (Mila OS → Launch) only if you want a tester account to see the real out-of-credits screen; otherwise leave on.

## 10-minute smoke test tonight (on the live site, on a phone, with a NON-tester account)
1. Create an account with code 3725 (or after 8 AM without it). Finish onboarding. Connect Google Calendar; disconnect it; confirm other connections stay.
2. Add a contact, a property with city/state, a showing tomorrow 2pm, an open house Saturday 1 to 4. Check dates.
3. Make a Just Listed post; check an image or the plain fallback shows, not a broken box.
4. `payment 615k 20%/6.75` gives about $3,191/month. `Market this to Christian families` is refused.
5. Sign out and sign in again with email and password, and with Google.
6. Credits page shows the 100 trial credits; spend a few and watch the balance drop.
7. Buy a plan with a real card (refund after). Credits grant instantly. Trial lock on a fresh account after 7 days is not testable tonight: use Mila OS → extend/expire trial on a throwaway account.

## If something breaks tomorrow
- Mila OS → Errors first. Sign-in problems now log a "Sign-in:" line with the real reason.
- Photos missing = Google billing/key. Research failing = OpenAI credits.
- Rollback: Vercel → Deployments → promote the previous deployment. Do not push fixes in a hurry: one push per batch.
