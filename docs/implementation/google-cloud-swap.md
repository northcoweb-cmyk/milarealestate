# Google Cloud: upgrade or swap without downtime

**Upgrading billing on the SAME project (recommended, on the 23rd):** Google Cloud console → Billing → Upgrade. Keys, OAuth client, redirect URIs and scopes all stay as they are. Nothing in Vercel or Supabase changes. No maintenance window.

**Moving to a NEW Google Cloud project (only if you must):** about 20 minutes. Order matters:
1. New project → enable: Geocoding, Places (New), Street View Static, Maps Static, Time Zone, Google Calendar, Google Sheets, People APIs.
2. Create a Maps API key, restricted to those APIs → Vercel (app) `GOOGLE_MAPS_API_KEY`.
3. Google Auth Platform: consent screen (External, app name Mila, domain milarealestate.app, support + developer contact milarealestateapp@yahoo.com), Data Access scopes: openid, email, profile, calendar.events, contacts.readonly, spreadsheets.readonly. Publish to production.
4. OAuth client (Web). Redirect URIs: the Supabase callback, https://app.milarealestate.app/api/auth/oauth/google/callback, https://app.milarealestate.app/api/integrations/google/callback, https://app.milarealestate.app/welcome/oauth. Origin: https://app.milarealestate.app.
5. Supabase → Auth → Providers → Google: paste the new client id and secret. Vercel (app): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Redeploy.
6. Effects: people who connected Google Calendar, Contacts or Sheets under the old client must reconnect once (tokens belong to the old client). Google sign-in keeps working for existing accounts (same Google account id). Do the swap at a quiet hour; sign-in is unavailable only between steps 5 and the redeploy finishing.
