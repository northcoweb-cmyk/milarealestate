# Launch moved: Fri Oct 23, 10 AM ET (code gate off at 8 AM ET)

Sends are manual (Mila OS → Waitlist → type SEND). Nothing in the system sends on its own at launch time.

## 1. Date change (send today, to the whole waitlist)
**Subject:** Mila opens Friday, October 23 (a short delay)

Hi {first name},

A quick update: we're moving Mila's opening from Tuesday to **Friday, October 23 at 10:00 AM Eastern**. We found a few things we want to get right before agents start using it for real, and we'd rather open a little later than open with rough edges.

Nothing changes for you. You're still on the list, and your personal link arrives that morning. Your 7-day free trial starts when you sign up, and no card is needed.

Thanks for your patience. It will be worth it.

The Mila team

## 2. Day before (Thu Oct 22, evening)
**Subject:** Mila opens tomorrow at 10 AM

Hi {first name},

Tomorrow, Friday, October 23 at 10:00 AM Eastern, Mila opens. Watch your inbox: your personal link arrives then. Use the same email address to create your password.

Your 7-day free trial starts when you sign up. No card needed.

See you tomorrow,
The Mila team

## 3. Launch morning (Fri Oct 23, 10 AM, with the personal link)
**Subject:** Mila is open: your link is inside

Hi {first name},

Mila is open. Here is your personal link: {link}

Use the email you joined the waitlist with to set your password. You get 7 days free, no card. Start by telling her what you need: "Showing at 3 on Friday," "Set up my open house," or "Who should I follow up with today?" If something looks wrong, use Help & support inside the app.

The Mila team

## Social / bio line
Mila opens Friday, October 23 at 10 AM ET. Join the waitlist: milarealestate.app

## Env vars to check in Vercel (override the code defaults)
- Main app project: `ACCESS_CODE_OFF_AT` (delete it, or set `2026-10-23T08:00:00-04:00`). If it still says Oct 20, sign-up opens tomorrow at 8 AM.
- Waitlist project: `NEXT_PUBLIC_LAUNCH_AT` = `2026-10-23T10:00:00-04:00`
- Mila OS project: `LAUNCH_AT` = `2026-10-23T10:00:00-04:00` and `LAUNCH_DATE` = `2026-10-23`
