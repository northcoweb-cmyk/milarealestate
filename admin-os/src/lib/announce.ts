/** Launch-countdown emails for the waitlist: four designs, each addressed to the person by their sign-up name. Inline styles only (email clients ignore the rest). */
const SITE = "https://milarealestate.app";
export const launchAt = () => new Date(process.env.LAUNCH_AT || "2026-10-20T10:00:00-04:00");

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
  { id: "countdown", label: "Countdown", blurb: "A big glowing number of days, the three things Mila does best, one button." },
  { id: "features", label: "Feature grid", blurb: "Clean white card with a days-left pill and a 2×2 grid of what's inside." },
  { id: "letter", label: "Founder letter", blurb: "A warm, personal note in serif type, signed by you. Short and human." },
  { id: "night", label: "Night sky", blurb: "Dark and starry like the app itself, with a huge serif countdown." },
] as const;
export type DesignId = (typeof DESIGNS)[number]["id"];

const FEATURES: [string, string, string][] = [
  ["📅", "A calendar that runs itself", "Say “showing at 3 on Friday” and it's booked, with the client, address and notes inside. One tap puts it in your iPhone or Google calendar."],
  ["✉️", "Follow-ups, drafted", "Emails and texts written in your voice for every lead and showing. You approve, then it goes."],
  ["🏠", "Listings and posts, ready", "Drop an address and Mila pulls the facts and photos, then builds the listing and Instagram posts."],
  ["✈️", "Days off, handled", "Tell Mila you're out and she blocks the time, moves what's booked and reminds you the night before."],
];

const wrap = (bg: string, inner: string, foot: string, textColor = "#8a87a6") => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"></head><body style="margin:0;background:${bg};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg}"><tr><td align="center" style="padding:28px 14px">${inner}
<p style="max-width:520px;font-size:12px;line-height:1.55;color:${textColor};margin:18px 0 0;text-align:center">${foot}</p></td></tr></table></body></html>`;
const FOOT = `You're getting this because you joined the Mila waitlist. This is an automated email, so please don't reply. Questions? hello@milarealestate.app<br>Mila · <a href="${SITE}" style="color:inherit">milarealestate.app</a>`;
const cta = (label: string, bg = "#14122b", fg = "#ffffff") => `<p style="margin:26px 0 4px;text-align:center"><a href="${SITE}" style="display:inline-block;background:${bg};color:${fg};text-decoration:none;font-weight:700;font-size:16px;padding:16px 36px;border-radius:999px">${label}</a></p>`;

export function announceEmail(design: DesignId, name: string | null, days: number) {
  const n = firstName(name), hi = n ? `Hi ${esc(n)},` : "Hi there,", who = n ? esc(n) : "friend";
  const subject = days <= 0 ? `${n ? n + ", " : ""}Mila opens today` : days === 1 ? `${n ? n + ", " : ""}Mila opens tomorrow` : `${n ? n + ", " : ""}Mila opens in ${days} days`;
  const dnum = days === 0 ? "Today" : String(days), dlabel = days === 0 ? "is the day" : days === 1 ? "day to go" : "days to go";
  const text = `${n ? `Hi ${n}` : "Hi there"},\n\nMila opens ${dayWord(days)} (${when()}), and you're on the list. I hope you're as excited as we are.\n\nWhat's waiting for you:\n${FEATURES.map(([, t, d]) => `- ${t}: ${d}`).join("\n")}\n\nYour 7-day free trial starts when you sign up. No card needed.\n\nWe'll send your personal link the moment we open.\n\nMila\n${SITE}\n\nThis is an automated email, so please don't reply. Questions? hello@milarealestate.app`;
  let html: string;

  if (design === "countdown") {
    html = wrap("#eeebfa", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px -20px rgba(80,50,180,.45)">
<tr><td style="background:#2a2178;line-height:0">${days <= 14 ? `<img src="${SITE}/email/countdown-${days}.jpg" width="560" alt="${days === 0 ? "Mila opens today" : `${days} ${days === 1 ? "day" : "days"} until Mila opens`}: ${when()}" style="display:block;width:100%;height:auto;border:0">` : `<p style="margin:0;padding:48px 24px;text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:96px;line-height:1;color:#ffffff">${days}<br><span style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;font-size:18px;letter-spacing:.2em">DAYS TO GO</span></p>`}</td></tr>
<tr><td style="padding:30px 30px 6px"><p style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;color:#14122b">${hi.replace(",", "")}, almost time.</p><p style="margin:0 0 18px;font-size:16.5px;line-height:1.55;color:#33305a">Mila opens ${dayWord(days)}, and you're on the list. I hope you're as excited as we are. Here's what you'll be able to do:</p>
${FEATURES.slice(0, 3).map(([e, t, d]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="44" valign="top" style="padding:0 0 14px;font-size:26px">${e}</td><td valign="top" style="padding:0 0 14px;font-size:15px;line-height:1.5;color:#33305a"><b style="color:#14122b">${t}</b><br>${d}</td></tr></table>`).join("")}
<p style="margin:4px 0 0;font-size:15px;color:#33305a">Your <b>7-day free trial</b> starts when you sign up. No card needed.</p>${cta("See what's inside")}</td></tr>
<tr><td style="padding:14px 30px 30px;font-size:13.5px;color:#6b6890;text-align:center">Your personal link arrives the moment we open.</td></tr></table>`, FOOT);
  } else if (design === "features") {
    html = wrap("#f4f5f9", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e6e4f2">
<tr><td style="padding:34px 30px 8px"><p style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:30px;color:#14122b">Mila</p>
<span style="display:inline-block;background:#14122b;color:#fff;font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:7px 14px;border-radius:999px">${days <= 0 ? "Opens today" : days === 1 ? "Opens tomorrow" : `${days} days to launch`}</span>
<p style="margin:16px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.15;color:#14122b">${hi.replace(",", "")}, here's what's coming.</p>
<p style="margin:0;font-size:16px;line-height:1.55;color:#33305a">Mila, your AI operations manager for real estate, opens ${dayWord(days)}. Four things you'll love from day one:</p></td></tr>
<tr><td style="padding:18px 22px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${FEATURES.slice(0, 2).map(([e, t, d]) => `<td width="50%" valign="top" style="padding:0 8px 16px"><div style="background:#f4f1ff;border-radius:18px;padding:18px"><div style="font-size:26px">${e}</div><p style="margin:8px 0 4px;font-size:15.5px;font-weight:700;color:#14122b">${t}</p><p style="margin:0;font-size:13.5px;line-height:1.5;color:#4a4766">${d}</p></div></td>`).join("")}</tr><tr>
${FEATURES.slice(2, 4).map(([e, t, d]) => `<td width="50%" valign="top" style="padding:0 8px 16px"><div style="background:#f4f1ff;border-radius:18px;padding:18px"><div style="font-size:26px">${e}</div><p style="margin:8px 0 4px;font-size:15.5px;font-weight:700;color:#14122b">${t}</p><p style="margin:0;font-size:13.5px;line-height:1.5;color:#4a4766">${d}</p></div></td>`).join("")}</tr></table></td></tr>
<tr><td style="padding:4px 30px 32px"><p style="margin:0;font-size:15px;line-height:1.55;color:#33305a">We open <b>${when()}</b>. Your <b>7-day free trial</b> starts when you sign up, no card needed. I hope you're excited, because we are.</p>${cta("Take a look")}</td></tr></table>`, FOOT);
  } else if (design === "letter") {
    html = wrap("#faf7f2", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:6px;border:1px solid #ece6da"><tr><td style="padding:44px 40px 36px">
<p style="margin:0 0 28px;font-family:Georgia,'Times New Roman',serif;font-size:26px;color:#14122b">Mila</p>
<p style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.4;color:#14122b">${hi}</p>
<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.65;color:#2d2a3f">Mila opens <b>${dayWord(days)}</b> (${when()}), and I wanted to tell you personally that I'm glad you're on the list.</p>
<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.65;color:#2d2a3f">I built Mila because agents spend their evenings on follow-ups, calendars and paperwork instead of clients. So she does that part: she books your showings, drafts your emails and texts, preps your listings and posts, and handles your days off. You just tell her what you need, in plain words.</p>
<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.65;color:#2d2a3f">Your 7-day free trial starts when you sign up, no card needed. I hope you're excited. I can't wait to hear what you think.</p>
<p style="margin:26px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#2d2a3f">See you on launch day,<br><b>Ryan</b><br><span style="font-size:15px;color:#7d7a92">Founder, Mila</span></p>
${cta("Visit Mila", "#14122b")}</td></tr></table>`, FOOT);
  } else {
    html = wrap("#0d0b2b", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#15123f;background-image:linear-gradient(180deg,#1a1650 0%,#2a2170 60%,#4a3a9c 120%);border-radius:28px;overflow:hidden">
<tr><td align="center" style="padding:46px 28px 10px"><p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:28px;color:#ffffff">Mila</p>
<p style="margin:0;font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#b9b2ff;font-weight:700">${who}, we open in</p>
<p style="margin:4px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:128px;line-height:1.05;color:#ffffff;font-weight:400">${dnum}</p>
<p style="margin:0 0 18px;font-size:19px;color:#d9d4ff;font-weight:600">${dlabel}</p>
<p style="margin:0;font-size:15.5px;line-height:1.6;color:#c9c4ee">${when()}</p></td></tr>
<tr><td style="padding:26px 26px 6px">${FEATURES.map(([e, t, d]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px"><tr><td style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:16px 18px"><table role="presentation" width="100%"><tr><td width="40" valign="top" style="font-size:24px">${e}</td><td valign="top" style="font-size:14px;line-height:1.5;color:#c9c4ee"><b style="color:#ffffff;font-size:15.5px">${t}</b><br>${d}</td></tr></table></td></tr></table>`).join("")}</td></tr>
<tr><td align="center" style="padding:10px 28px 40px"><p style="margin:0 0 4px;font-size:15px;color:#d9d4ff">7-day free trial. No card needed. I hope you're excited.</p>${cta("See what's inside", "#ffffff", "#1a1650")}</td></tr></table>`, FOOT, "#8d89b8");
  }
  return { subject, html, text };
}
