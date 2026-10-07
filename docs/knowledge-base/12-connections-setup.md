# Connections and billing setup (what you do, step by step)

## Gmail, Google Calendar, Contacts, Sheets (already built, needs Google keys)
1. Google Cloud Console > APIs & Services > Library: enable Gmail API, Google Calendar API, People API, Google Sheets API.
2. OAuth consent screen: app name Mila, support email admin@milarealestate.app, logo, domain milarealestate.app. Add the scopes. Gmail send/read scopes are "restricted", so Google requires a verification review (can take weeks). Until verified, only listed test users (up to 100) can connect, which is enough for the 20-person launch.
3. Credentials > OAuth client ID (web). Authorized redirect URI: `https://app.milarealestate.app/api/integrations/google/callback`.
4. In the main app Vercel project set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL=https://app.milarealestate.app`, `INTEGRATION_ENCRYPTION_KEY` (any long random string) and `SESSION_SECRET`.
5. Connect your own Gmail in Settings > Connections and check it says Connected with your address.

## Outlook / Microsoft 365 (built tonight, untested against live Microsoft)
1. entra.microsoft.com > App registrations > New registration. Name Mila. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts".
2. Redirect URI (Web): `https://app.milarealestate.app/api/integrations/microsoft/callback`.
3. API permissions > Microsoft Graph > Delegated: Mail.ReadWrite, Mail.Send, Calendars.ReadWrite, User.Read, offline_access.
4. Certificates & secrets > New client secret. Copy the VALUE (not the ID).
5. Vercel main app: `MICROSOFT_CLIENT_ID` (Application/client ID), `MICROSOFT_CLIENT_SECRET`. Redeploy.
6. Test with an Outlook.com account and a work account. Work accounts may need their admin to approve.
Until the keys are set, Outlook shows "Coming soon" to users. Nothing is faked.

## MLS
No single connection works for everyone: each MLS grants data access through the broker or association (usually a RESO Web API or IDX/VOW license). Mila says so on the Connections screen. Practical path: ask your first 20 users which MLS they use, then connect the biggest one through a data reseller (Bridge, Spark, or Trestle).

## Stripe
1. Dashboard > Settings > Branding: upload the Mila logo (square and icon), set brand color #7B63E8 and accent color, so Checkout and the customer portal look like Mila. Public business details: name Mila, support email admin@milarealestate.app, website milarealestate.app.
2. Settings > Billing > Customer portal: allow cancel subscription, update payment method, invoice history. Add Terms and Privacy links.
3. Developers > API keys: use a Restricted key (write access to Checkout Sessions, Customers, Billing Portal; read on Subscriptions). Put it in `STRIPE_SECRET_KEY` on the main app project.
4. Developers > Webhooks > add `https://app.milarealestate.app/api/stripe/webhook`, events `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`. Signing secret goes in `STRIPE_WEBHOOK_SECRET`.
5. Create the half-off coupon (50%, once) and a promotion code.
6. Because this is your NorthCo account, keep Mila's products and statement descriptor separate (descriptor "MILA") so customers don't see the wrong business on their card.
7. Test mode first (card 4242 4242 4242 4242), then switch to live keys.

## Emails
- Daily summary: runs every day at 12:00 UTC (8am ET) through `/api/cron/daily-summary`. Needs `CRON_SECRET`, `RESEND_API_KEY` and `MAIL_FROM` set on the MAIN app project (today only the waitlist and admin projects have them). Sent only to people who used Mila in the last 7 days and left it on.
- Queue email: sent when someone joins the waitlist (waitlist project).
