# What only you can do (manual steps)

1. **Google + Microsoft sign-in (code is in; needs setup)**
   - Supabase dashboard → Authentication → Providers: enable **Google** (client ID/secret from Google Cloud → APIs & Services → Credentials → OAuth client, type Web) and **Azure (Microsoft)** (Entra app registration; client ID, secret, tenant `common`; Supabase shows the callback URL to paste into each provider).
   - Supabase → Authentication → URL Configuration: add `https://<your app domain>/welcome/oauth` to Redirect URLs.
   - Buttons "Continue with Google/Microsoft" are on the welcome page. They only sign in. New accounts still need the access code and a trial seat. Calendar/email access stays a separate connection in Settings (uses GOOGLE_CLIENT_ID/SECRET and MICROSOFT_CLIENT_ID/SECRET in Vercel; see 12-connections-setup.md).
   - Until the providers are enabled in Supabase the buttons will show an error from the provider. Not tested live.
2. Vercel env (each project): Stripe keys + webhook, model key, GOOGLE_*/MICROSOFT_* client IDs, MAPS key, RENTCAST, GITHUB_BUG_REPO (private repo).
3. Stripe: run one live-mode checkout and one cancel with your own card; turn on Radar; add the terms line ("no refunds after 100 credits used", see knowledge-base/19).
4. Real iPhone + Android pass (install PWA, sign in, chat, calendar, post images).
5. Have a lawyer glance at the refund/terms wording.
6. Muse AI (competitor): analysis not done; I have not reviewed their product. Send me what they claim and I'll write the comparison.
