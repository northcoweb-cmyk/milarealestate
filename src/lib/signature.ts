import type { Profile } from "./types";

/** Who the agent is on every public post: name, license credentials, phones, email, team and brokerage. */
export interface BrandInfo { credentials: string; license: string; cell: string; office: string; email: string; team: string; pfp: string | null }
export const emptyBrand = (): BrandInfo => ({ credentials: "", license: "", cell: "", office: "", email: "", team: "", pfp: null });
export const brandOf = (p: Pick<Profile, "settings">): BrandInfo => ({ ...emptyBrand(), ...(p.settings.brand ?? {}) });

/**
 * "Ryan Stillwell | MD Realtor® C. 301.509.7280 | o. 202.243.7700 ryan@example.com Coalition Properties Group at Keller Williams Properties"
 * Every part after the name is optional, so teams, solo agents and different brokerages all come out right.
 */
export function buildSignature(p: Pick<Profile, "full_name" | "brokerage" | "settings">): string {
  const b = brandOf(p);
  const cred = [b.credentials.trim(), b.license.trim() ? `Lic# ${b.license.trim()}` : ""].filter(Boolean).join(" ");
  const head = [p.full_name.trim(), cred].filter(Boolean).join(" | ");
  const affil = b.team.trim() && p.brokerage?.trim() ? `${b.team.trim()} at ${p.brokerage.trim()}` : b.team.trim() || p.brokerage?.trim() || "";
  return [head + (b.cell.trim() ? ` C. ${b.cell.trim()}` : "") + (b.office.trim() ? ` | o. ${b.office.trim()}` : ""), b.email.trim(), affil].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
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
