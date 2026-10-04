/** Links that open the person's own email app (or webmail) with a message already written. No sending happens on our side. */
export interface Compose { to?: string[]; bcc?: string[]; subject: string; body: string }

// Mail apps and phones cap how long a link can be; past this we still open it but also copy the full text.
export const MAILTO_SAFE_LENGTH = 1800;

const enc = (s: string) => encodeURIComponent(s).replace(/%0A/g, "%0D%0A");
const list = (a?: string[]) => (a ?? []).filter(Boolean).map((e) => e.trim()).join(",");

export function mailtoUrl(c: Compose): string {
  const q = [`subject=${enc(c.subject)}`, `body=${enc(c.body)}`, c.bcc?.length ? `bcc=${encodeURIComponent(list(c.bcc))}` : ""].filter(Boolean).join("&");
  return `mailto:${encodeURIComponent(list(c.to)).replace(/%40/g, "@").replace(/%2C/g, ",")}?${q}`;
}

/** Gmail on the web, opened on the right account (`authuser`) so the message goes out from the address the agent signs in with. */
export function gmailUrl(c: Compose, account?: string | null): string {
  const p = new URLSearchParams({ view: "cm", fs: "1", su: c.subject, body: c.body });
  if (c.to?.length) p.set("to", list(c.to));
  if (c.bcc?.length) p.set("bcc", list(c.bcc));
  if (account) p.set("authuser", account);
  return `https://mail.google.com/mail/?${p.toString()}`;
}

export const isTooLongForLink = (c: Compose) => mailtoUrl(c).length > MAILTO_SAFE_LENGTH;
