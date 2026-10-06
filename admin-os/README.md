# Mila OS (admin dashboard)

A separate Next.js project that reads the Mila database and shows: waitlist signups, users, the trial funnel, errors, AI spend, and a launch checklist. It is read-only and has its own login.

## Deploy on Vercel (separate project)
1. Vercel > Add New > Project > import the same GitHub repo (`milarealestate`).
2. **Root Directory: `admin-os`**. Framework: Next.js (auto).
3. Environment variables (see `.env.example`):
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: copy from the Mila app project's env vars.
   - `ADMIN_OS_EMAIL`, `ADMIN_OS_PASSWORD`, `ADMIN_OS_SECRET`: you choose these (long random password and secret).
   - Optional: `MILA_APP_URL`, `LAUNCH_DATE`.
4. Deploy. Give it its own address (for example `os.yourdomain.com`, or the free `*.vercel.app` one).
5. Run `supabase/migrations/0005_waitlist.sql` once in the Supabase SQL editor (creates the waitlist table).

## Security
- The service-role key is only used on the server, never sent to the browser.
- Login is rate-limited and uses a signed, httpOnly cookie. Every page and the CSV download check it.
- The site is `noindex`. Do not share the URL or password.

## Local
`cd admin-os && npm install && cp .env.example .env.local` (fill it in) `&& npm run dev` then open http://localhost:3200.
