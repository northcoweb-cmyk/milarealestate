# Google verification (remove the "Google hasn't verified this app" screen)

Account: northcoweb@gmail.com (project Owner). Domain milarealestate.app is verified in Search Console (Thu Oct 15). Do NOT delete the TXT record at Porkbun.

## Steps, in order
1. **Wait about 24 hours** after the domain check (Google's own rule), then Google Auth Platform -> Branding -> View issues -> "I have fixed the issues" -> Proceed.
2. Google Auth Platform -> **Audience** -> set Publishing status to **In production** (Testing mode caps at 100 named testers and tokens expire in 7 days; production lets any user sign in, with the warning until verified).
3. Google Auth Platform -> **Data Access**: scopes must be exactly: openid, email, profile, calendar.events, contacts.readonly, spreadsheets.readonly. Gmail is not requested.
4. Google Auth Platform -> **Verification Center** -> Prepare/Submit. Paste the justifications below and the video link.
5. Answer Google's follow-up emails (they go to support@milarealestate.app and northcoweb@gmail.com) within a day or two. Review usually takes days to a few weeks; up to 100 users can use Mila with the warning in the meantime.

## Scope justifications (paste these)
- **openid, email, profile**: "Used only to sign the user in and show their name and avatar. We use the Google account email as the account identifier."
- **https://www.googleapis.com/auth/calendar.events**: "Mila is an AI operations manager for real estate agents. When the agent asks Mila to schedule a showing, open house or reminder, Mila creates that event on the agent's own Google Calendar (client name, phone, address and notes inside). Mila can also move or cancel only the events it created. Mila never reads or lists the user's other calendar events. We request calendar.events (not the broader calendar scope) because we only need to create and change events."
- **https://www.googleapis.com/auth/contacts.readonly**: "The agent can choose to import their existing contacts into Mila so Mila can remind them to follow up and draft messages. We read contacts once, only when the user taps Import, show a review screen where the user selects which people to add, and add nothing without their confirmation. We never write to or modify Google Contacts."
- **https://www.googleapis.com/auth/spreadsheets.readonly**: "Many agents keep their client list in a Google Sheet. The agent pastes the link to one sheet and picks a tab; Mila reads only that sheet's rows to show a review screen of people to add. We never edit sheets and never read sheets the user did not choose."
- **Data use statement**: "Google user data is used only to provide these user-facing features. It is not sold, not used for advertising, not used to train AI models, and not transferred to others except as needed to run the service. Users can disconnect Google in Settings at any time. Our privacy policy is at https://milarealestate.app/privacy."

## Demo video (unlisted YouTube, about 3 minutes, English, screen recording of the real app)
Show the browser address bar the whole time. Narrate in one sentence per step.
1. Open https://app.milarealestate.app, click "Continue with Google", pick an account. **Pause on the Google consent screen** so the app name, the requested permissions and the client ID are visible, then Allow. (Use a second Google account that is not the owner so the full flow appears.)
2. In the app: Settings -> Calendar & connections -> Connect Google Calendar -> the consent screen -> Allow.
3. Tell Mila: "Showing at 123 Main Street Friday at 3 PM with Dana." Open Google Calendar in another tab and show the event Mila created.
4. Tell Mila: "Cancel the showing." Show the event gone/cancelled in Google Calendar.
5. Connect Contacts (consent screen shown) -> Import -> show the review screen -> add one person.
6. Connect Sheets (consent screen shown) -> paste a sheet link -> pick a tab -> review screen -> add.
7. Settings -> disconnect Google, to show the user is in control.
8. End on https://milarealestate.app/privacy to show the privacy policy.

## What I (Claude) prepare
- Keep this file current. If Google asks questions, paste them here and I draft the reply.
