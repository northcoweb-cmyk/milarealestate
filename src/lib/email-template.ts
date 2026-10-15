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
    <div style="font-size:12px;line-height:1.6;color:#8d8aa8;margin-top:14px;">This is an automated message, so please don't reply to this email: replies aren't monitored. To reach us, open Help &amp; support inside Mila (we reply within 48 to 72 hours). Mila is a product of NorthCo Designs.</div>
  </td></tr>
 </table>
</td></tr></table></body></html>`;
}
