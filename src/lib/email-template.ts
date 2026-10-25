/** Mila-branded transactional email: gradient header, soft card, ticket chip, clear footer. Table layout + inline styles so it renders in Gmail, Outlook and Apple Mail. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const para = (t: string) => t.split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1b1830;">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

export function brandedEmail(o: { preheader?: string; heading: string; body: string; chip?: string; quote?: { label: string; text: string }; button?: { label: string; href: string }; note?: string }): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://milarealestate.app";
  const support = process.env.SUPPORT_EMAIL || "support@milarealestate.app";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f0fb;-webkit-text-size-adjust:100%;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(o.preheader ?? o.heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0fb;padding:28px 12px;"><tr><td align="center">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="background:#a68cff;background-image:linear-gradient(135deg,#8fb4ff 0%,#a68cff 55%,#ffc9a8 100%);border-radius:24px 24px 0 0;padding:30px 32px;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1;color:#ffffff;letter-spacing:-0.5px;">Mila</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:rgba(255,255,255,.9);margin-top:6px;letter-spacing:.3px;">Your AI operations manager for real estate</div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:34px 32px 8px;font-family:Arial,Helvetica,sans-serif;">
    ${o.chip ? `<div style="display:inline-block;background:#ede9fe;color:#6d28d9;font-size:12px;font-weight:700;letter-spacing:.4px;border-radius:999px;padding:5px 12px;margin-bottom:16px;">${esc(o.chip)}</div>` : ""}
    <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.2;color:#1b1830;">${esc(o.heading)}</h1>
    ${para(o.body)}
    ${o.quote ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr><td style="border-left:3px solid #a68cff;background:#f8f6ff;border-radius:0 12px 12px 0;padding:12px 16px;font-size:14px;line-height:1.55;color:#4b4866;"><div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#8a86a6;margin-bottom:4px;">${esc(o.quote.label)}</div>${esc(o.quote.text).replace(/\n/g, "<br>")}</td></tr></table>` : ""}
    ${o.button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;"><tr><td style="background:#6d5ae6;background-image:linear-gradient(135deg,#6d5ae6,#8fa4ff);border-radius:999px;"><a href="${esc(o.button.href)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(o.button.label)}</a></td></tr></table>` : ""}
    ${o.note ? `<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#7a7794;">${esc(o.note)}</p>` : ""}
    <p style="margin:0 0 26px;font-size:16px;color:#1b1830;">The Mila team</p>
  </td></tr>
  <tr><td style="background:#1b1830;border-radius:0 0 24px 24px;padding:24px 32px;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#ffffff;">Mila</div>
    <div style="font-size:13px;line-height:1.6;color:#b9b6d3;margin-top:6px;">Mila drafts, schedules and follows up for real estate agents, and asks before anything goes out.</div>
    <div style="font-size:13px;line-height:1.8;margin-top:14px;"><a href="${site}" style="color:#c9bbff;text-decoration:none;">milarealestate.app</a> &nbsp;·&nbsp; <a href="${site}/privacy" style="color:#c9bbff;text-decoration:none;">Privacy</a> &nbsp;·&nbsp; <a href="${site}/terms" style="color:#c9bbff;text-decoration:none;">Terms</a></div>
    <div style="font-size:12px;line-height:1.6;color:#8d8aa8;margin-top:14px;">This is an automated message, so please don't reply to this email: replies aren't monitored. To reach us, open Help &amp; support inside Mila or email <a href="mailto:${support}" style="color:#b9a8ff;">${support}</a> (we reply within 48 to 72 hours). Mila is a product of NorthCo Designs.</div>
  </td></tr>
 </table>
</td></tr></table></body></html>`;
}

export interface ReminderEmail {
  title: string; whenTime: string; whenDay: string; firstName: string; appUrl: string;
  event?: { title: string; when: string; where?: string | null } | null;
  person?: { name: string; phone?: string | null } | null;
  later?: { time: string; title: string }[];
}

/** One reminder, made to be read in two seconds on a phone: the time, the thing, who and where, a one-tap action, and what is next today. */
export function reminderEmail(o: ReminderEmail): { subject: string; text: string; html: string } {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://milarealestate.app";
  const btn = (label: string, href: string, solid = true) => `<td style="padding:0 8px 8px 0;"><a href="${esc(href)}" style="display:inline-block;border-radius:999px;padding:13px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;${solid ? "background:#6d5ae6;background-image:linear-gradient(135deg,#6d5ae6,#8fa4ff);color:#ffffff;" : "background:#f1eeff;color:#4a35c9;"}">${esc(label)}</a></td>`;
  const phone = o.person?.phone?.replace(/[^\d+]/g, "");
  const dir = o.event?.where ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.event.where)}` : null;
  const row = (icon: string, label: string, body: string) => `<tr><td style="width:34px;vertical-align:top;padding:10px 0;font-size:20px;">${icon}</td><td style="padding:10px 0;border-bottom:1px solid #eeebfa;font-family:Arial,Helvetica,sans-serif;"><div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#8a86a6;">${esc(label)}</div><div style="font-size:16px;line-height:1.45;color:#1b1830;margin-top:2px;">${body}</div></td></tr>`;
  const details = [
    o.event ? (o.event.title.trim().toLowerCase() === o.title.trim().toLowerCase() ? row("🗓️", "When", esc(o.event.when)) : row("🗓️", "Event", `${esc(o.event.title)}<br><span style="color:#6a6786;font-size:14px;">${esc(o.event.when)}</span>`)) : "",
    o.event?.where ? row("📍", "Where", `${esc(o.event.where)}${dir ? ` &nbsp;<a href="${esc(dir)}" style="color:#6d5ae6;font-size:14px;font-weight:700;text-decoration:none;">Directions</a>` : ""}`) : "",
    o.person ? row("👤", "With", `${esc(o.person.name)}${phone ? ` &nbsp;<a href="tel:${esc(phone)}" style="color:#6d5ae6;font-size:14px;font-weight:700;text-decoration:none;">Call</a>` : ""}`) : "",
  ].join("");
  const later = (o.later ?? []).slice(0, 3);
  const laterHtml = later.length ? `<p style="margin:24px 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#7b63e8;">Later today</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${later.map((l) => `<tr><td style="padding:9px 0;border-bottom:1px solid #eeebfa;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#33305a;"><span style="display:inline-block;min-width:76px;font-weight:700;color:#6d5ae6;">${esc(l.time)}</span>${esc(l.title)}</td></tr>`).join("")}</table>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Reminder</title></head>
<body style="margin:0;padding:0;background:#f3f0fb;-webkit-text-size-adjust:100%;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(o.title)} · ${esc(o.whenTime)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0fb;padding:24px 12px;"><tr><td align="center">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="background:#8f7bff;background-image:linear-gradient(135deg,#6d5ae6 0%,#8fa4ff 60%,#ffc9a8 120%);border-radius:26px 26px 0 0;padding:26px 30px 28px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.85);">🔔 Reminder · ${esc(o.whenDay)}</div>
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:54px;line-height:1.05;color:#ffffff;margin-top:10px;letter-spacing:-1px;">${esc(o.whenTime)}</div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:26px 30px 10px;font-family:Arial,Helvetica,sans-serif;">
    <p style="margin:0 0 6px;font-size:15px;color:#6a6786;">Hi ${esc(o.firstName)}, you asked me to remind you:</p>
    <div style="border-left:4px solid #6d5ae6;background:#f8f6ff;border-radius:0 16px 16px 0;padding:16px 18px;margin:8px 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:#1b1830;">${esc(o.title)}</div>
    ${details ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${details}</table>` : ""}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;"><tr>${btn("Open Mila", `${o.appUrl}/`)}${dir ? btn("Directions", dir, false) : ""}${phone ? btn("Call", `tel:${phone}`, false) : ""}</tr></table>
    ${laterHtml}
    <p style="margin:26px 0 22px;font-size:13px;line-height:1.5;color:#8a86a6;">This is the reminder you asked Mila to send. Manage your reminders in Mila → Calendar.</p>
  </td></tr>
  <tr><td style="background:#1b1830;border-radius:0 0 26px 26px;padding:20px 30px;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#ffffff;">Mila</div>
    <div style="font-size:12px;line-height:1.6;color:#8d8aa8;margin-top:8px;">Automated message: please don't reply, replies aren't monitored. For help, open Help &amp; support inside Mila. <a href="${site}/privacy" style="color:#c9bbff;text-decoration:none;">Privacy</a> · <a href="${site}/terms" style="color:#c9bbff;text-decoration:none;">Terms</a></div>
  </td></tr>
 </table>
</td></tr></table></body></html>`;
  const text = `Reminder · ${o.whenDay} ${o.whenTime}\n\n${o.title}\n${o.event ? `\n${o.event.title} · ${o.event.when}${o.event.where ? `\n${o.event.where}` : ""}` : ""}${o.person ? `\nWith ${o.person.name}${o.person.phone ? ` (${o.person.phone})` : ""}` : ""}${later.length ? `\n\nLater today:\n${later.map((l) => `${l.time}  ${l.title}`).join("\n")}` : ""}\n\nOpen Mila: ${o.appUrl}/`;
  return { subject: `🔔 ${o.title} · ${o.whenTime}`, text, html };
}
