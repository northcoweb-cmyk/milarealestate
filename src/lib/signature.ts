import type { Profile } from "./types";

/** Who the agent is on every public post: name, license credentials, phones, email, team and brokerage. */
export interface BrandInfo { credentials: string; license: string; cell: string; office: string; email: string; team: string; pfp: string | null }
export const emptyBrand = (): BrandInfo => ({ credentials: "", license: "", cell: "", office: "", email: "", team: "", pfp: null });
export const brandOf = (p: Pick<Profile, "settings">): BrandInfo => ({ ...emptyBrand(), ...(p.settings.brand ?? {}) });

/**
 * "Ryan Stillwell | MD Realtor® C. 301.509.7280 | o. 202.243.7700 ryan@example.com Coalition Properties Group at Keller Williams Properties"
 * Every part after the name is optional, so teams, solo agents and different brokerages all come out right.
 */
/** 3015097280 / 301.509.7280 / +1 301 509 7280 → (301) 509-7280. Anything that isn't a 10-digit US number is left as typed. */
export function prettyPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw.trim();
}
export function buildSignature(p: Pick<Profile, "full_name" | "brokerage" | "settings">): string {
  const b = brandOf(p);
  const cred = [b.credentials.trim(), b.license.trim() ? `Lic# ${b.license.trim()}` : ""].filter(Boolean).join(" ");
  const head = [p.full_name.trim(), cred].filter(Boolean).join(" | ");
  const affil = b.team.trim() && p.brokerage?.trim() ? `${b.team.trim()} at ${p.brokerage.trim()}` : b.team.trim() || p.brokerage?.trim() || "";
  return [head + (b.cell.trim() ? ` C. ${prettyPhone(b.cell)}` : "") + (b.office.trim() ? ` | o. ${prettyPhone(b.office)}` : ""), b.email.trim(), affil].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Removes a trailing signature (so a caption can be re-shaped or re-signed). */
export function stripSignature(caption: string, sig: string): string {
  const t = caption.trimEnd();
  return sig && t.endsWith(sig) ? t.slice(0, t.length - sig.length).trimEnd() : t;
}

/** Puts the signature at the very end of the caption, trimming the body (never the signature) if the platform limit needs room. Safe to call twice. */
export function withSignature(caption: string, sig: string, limit = 2200): string {
  if (!sig) return caption;
  const body = stripSignature(caption, sig);
  const room = limit - sig.length - 2;
  const fitted = body.length > room ? body.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, "") + "…" : body;
  return `${fitted}\n\n${sig}`;
}

const CLOSING = /^(warmly|warm regards|best|best regards|kind regards|regards|sincerely|thanks|thank you|cheers|talk soon|all the best|take care|with appreciation|looking forward)[,!.]?$/i;
/**
 * Ends an email with exactly one closing and one signature block (name, role, brokerage). The writing model often adds its own
 * "Warmly, Name" and the app adds the signature too; this keeps the closing word and removes every repeated name or brokerage line.
 */
export function finishEmailBody(body: string, p: Pick<Profile, "full_name" | "brokerage" | "role">): string {
  const mine = new Set([p.full_name, p.brokerage, p.role].filter(Boolean).map((x) => String(x).trim().toLowerCase()));
  const sig = [p.full_name, p.role && p.role !== "Agent" ? p.role : null, p.brokerage].filter(Boolean).join("\n");
  const lines = body.replace(/\s+$/, "").split("\n");
  let closing = "Best,";
  const tail = Math.max(0, lines.length - 8);
  let cut = lines.length;
  for (let i = lines.length - 1; i >= tail; i--) {
    const t = lines[i].trim();
    if (CLOSING.test(t)) { closing = t.endsWith(",") ? t : t.replace(/[!.]$/, "") + ","; cut = i; break; }
  }
  if (cut === lines.length) { while (cut > 0 && (!lines[cut - 1].trim() || mine.has(lines[cut - 1].trim().toLowerCase()))) cut--; }
  return `${lines.slice(0, cut).join("\n").replace(/\s+$/, "")}\n\n${closing}\n${sig}`;
}
