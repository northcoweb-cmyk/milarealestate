/** Launch-countdown emails for the waitlist: four designs, each addressed to the person by their sign-up name. Inline styles only (email clients ignore the rest). */
const SITE = "https://milarealestate.app";
export const launchAt = () => new Date(process.env.LAUNCH_AT || "2026-10-23T14:00:00-04:00");

export function daysLeft(now = new Date()): number {
  // whole calendar days in New York, so "5 days" never flips at an odd hour
  const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
  const a = Date.parse(ymd(now) + "T00:00:00Z"), b = Date.parse(ymd(launchAt()) + "T00:00:00Z");
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
const when = () => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(launchAt()) + " at " + new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(launchAt());
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export const firstName = (name: string | null | undefined) => { const f = (name ?? "").trim().split(/\s+/)[0]; return f ? f.charAt(0).toUpperCase() + f.slice(1) : ""; };
const dayWord = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

export const DESIGNS = [
  { id: "countdown", label: "Countdown", blurb: "A glowing countdown dial, the features that are locked in, one button to the waitlist site." },
] as const;
export type DesignId = (typeof DESIGNS)[number]["id"];

// Only what is built, tested and confirmed. Add a line here only after you have used it and it works well.
const FEATURES: [string, string, string][] = [
  ["📅", "Your calendar, in plain words", "Tell Mila “showing at 3 on Friday” and it's on your calendar. Move it or cancel it the same way."],
  ["🏠", "Showings and open houses, organized", "Every showing and open house kept in one place, with the client and the address on each one."],
  ["👥", "Clients and follow-ups, never dropped", "Keep every client in one place, and Mila reminds you who to follow up with, and when."],
];

const wrap = (bg: string, inner: string, foot: string, textColor = "#8a87a6") => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"></head><body style="margin:0;background:${bg};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg}"><tr><td align="center" style="padding:28px 14px">${inner}
<p style="max-width:520px;font-size:12px;line-height:1.55;color:${textColor};margin:18px 0 0;text-align:center">${foot}</p></td></tr></table></body></html>`;
const FOOT = `You're getting this because you joined the Mila waitlist. This is an automated email, so please don't reply.<br>Mila · <a href="${SITE}" style="color:inherit">milarealestate.app</a>`;
const cta = () => `<p style="margin:26px 0 4px;text-align:center"><a href="${SITE}" style="display:inline-block;background:#14122b;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:16px 36px;border-radius:999px">Go to the Mila waitlist site</a></p><p style="margin:8px 0 0;text-align:center;font-size:13px;color:#6b6890">Opens milarealestate.app, our waitlist site</p>`;

export function announceEmail(_design: DesignId, name: string | null, days: number) {
  const n = firstName(name), hi = n ? `Hi ${esc(n)},` : "Hi there,", who = n ? esc(n) : "friend";
  const subject = days <= 0 ? `${n ? n + ", " : ""}Mila opens today` : days === 1 ? `${n ? n + ", " : ""}Mila opens tomorrow` : `${n ? n + ", " : ""}Mila opens in ${days} days`;
  const dnum = days === 0 ? "Today" : String(days), dlabel = days === 0 ? "is the day" : days === 1 ? "day to go" : "days to go";
  const text = `${n ? `Hi ${n}` : "Hi there"},\n\nMila opens ${dayWord(days)} (${when()}), and you're on the list. I hope you're as excited as we are.\n\nWhat you'll be able to do:\n${FEATURES.map(([, t, d]) => `- ${t}: ${d}`).join("\n")}\n\nYour 7-day free trial starts when you sign up. No card needed. Your personal link arrives the moment we open.\n\nThe waitlist site: ${SITE}\n\nThis is an automated email, so please don't reply.`;
  let html: string;

  html = wrap("#eeebfa", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px -20px rgba(80,50,180,.45)">
<tr><td style="background:#2a2178;line-height:0">${days <= 14 ? `<img src="${SITE}/email/countdown-${days}.jpg" width="560" alt="${days === 0 ? "Mila opens today" : `${days} ${days === 1 ? "day" : "days"} until Mila opens`}: ${when()}" style="display:block;width:100%;height:auto;border:0">` : `<p style="margin:0;padding:48px 24px;text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:96px;line-height:1;color:#ffffff">${days}<br><span style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;font-size:18px;letter-spacing:.2em">DAYS TO GO</span></p>`}</td></tr>
<tr><td style="padding:30px 30px 6px"><p style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;color:#14122b">${hi.replace(",", "")}, almost time.</p><p style="margin:0 0 18px;font-size:16.5px;line-height:1.55;color:#33305a">Mila opens ${dayWord(days)}, and you're on the list. I hope you're as excited as we are. Here's what you'll be able to do:</p>
${FEATURES.map(([e, t, d]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="44" valign="top" style="padding:0 0 14px;font-size:26px">${e}</td><td valign="top" style="padding:0 0 14px;font-size:15px;line-height:1.5;color:#33305a"><b style="color:#14122b">${t}</b><br>${d}</td></tr></table>`).join("")}
<p style="margin:4px 0 0;font-size:15px;color:#33305a">Your <b>7-day free trial</b> starts when you sign up. No card needed.</p>${cta()}</td></tr>
<tr><td style="padding:14px 30px 30px;font-size:13.5px;color:#6b6890;text-align:center">Your personal link arrives the moment we open.</td></tr></table>`, FOOT);
  return { subject, html, text };
}
