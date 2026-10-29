import { randomBytes } from "node:crypto";
import { brandedEmail } from "./email-template";
import { sendMail } from "./mail";
import { buildReport } from "./data";
import { table, write } from "./sb";

/**
 * People whose free trial ended and who never bought a plan. Their bookkeeping (who was emailed, hidden, unsubscribed) lives on their profile
 * under settings.lapsed, so it needs no new table. The unsubscribe token is random per person and looked up by the app's /api/unsubscribe.
 */
export interface LapsedMeta { token?: string; emailed?: { at: string; subject: string }[]; hidden?: boolean; optout?: boolean; optout_at?: string }
export interface LapsedRow { id: string; email: string; name: string; first: string; ended: string | null; last: string | null; turns: number; cost: number; meta: LapsedMeta }

const appUrl = () => (process.env.MILA_APP_URL || "https://app.milarealestate.app").replace(/\/+$/, "");
const firstName = (n: string, email: string) => (n.trim().split(/\s+/)[0] || email.split("@")[0]).replace(/^./, (c) => c.toUpperCase());

export async function lapsedList() {
  const r = await buildReport();
  const rows = r.users.filter((u) => !["paid", "trial", "none"].includes(u.state));
  const prof = rows.length ? await table<{ id: string; settings: { lapsed?: LapsedMeta } | null }>("profiles", { select: "id,settings" }) : [];
  const meta = new Map((prof ?? []).map((p) => [p.id, p.settings?.lapsed ?? {}]));
  const subs = await table<{ user_id: string; period_end: string; status: string }>("subscriptions", { select: "user_id,period_end,status" }) ?? [];
  const ended = new Map<string, string>();
  for (const s of subs) if (!ended.get(s.user_id) || s.period_end > ended.get(s.user_id)!) ended.set(s.user_id, s.period_end);
  const list: LapsedRow[] = rows.map((u) => ({ id: u.id, email: u.email, name: u.name, first: firstName(u.name, u.email), ended: ended.get(u.id) ?? null, last: u.last, turns: u.turns, cost: u.cost, meta: meta.get(u.id) ?? {} }))
    .sort((a, b) => (b.ended ?? "").localeCompare(a.ended ?? ""));
  return { list, now: r.now };
}

async function saveMeta(id: string, patch: Partial<LapsedMeta>): Promise<LapsedMeta | null> {
  const cur = (await table<{ settings: Record<string, unknown> | null }>("profiles", { select: "settings", filter: `id=eq.${encodeURIComponent(id)}` }))?.[0];
  if (!cur) return null;
  const settings = cur.settings ?? {};
  const lapsed = { ...((settings.lapsed as LapsedMeta | undefined) ?? {}), ...patch };
  const ok = await write("profiles", "PATCH", { filter: `id=eq.${encodeURIComponent(id)}`, body: { settings: { ...settings, lapsed } } });
  return ok ? lapsed : null;
}
export const setHidden = (id: string, hidden: boolean) => saveMeta(id, { hidden });

const fill = (t: string, first: string) => t.replace(/\{first\}/gi, first);

export function winbackEmail(subject: string, body: string, first: string, unsubUrl: string) {
  const text = `${fill(body, first)}\n\n—\nYou're getting this because you tried Mila. Unsubscribe: ${unsubUrl}`;
  const html = brandedEmail({ preheader: fill(subject, first), heading: fill(subject, first), body: fill(body, first), button: { label: "Open Mila", href: appUrl() }, note: "You're getting this because you tried Mila. To stop these emails, use the unsubscribe link below." })
    .replace("</body>", `<p style="text-align:center;font:12px Arial,sans-serif;color:#7a7794;margin:0 0 24px;"><a href="${unsubUrl}" style="color:#7a7794;">Unsubscribe</a></p></body>`);
  return { text, html };
}

/** Sends one note to one lapsed person (never to someone who unsubscribed) and remembers it. */
export async function sendWinback(u: LapsedRow, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (u.meta.optout) return { ok: false, error: "unsubscribed" };
  const token = u.meta.token ?? randomBytes(20).toString("hex");
  const unsub = `${appUrl()}/api/unsubscribe?t=${token}`;
  const m = winbackEmail(subject, body, u.first, unsub);
  const sent = await sendMail(u.email, fill(subject, u.first), m.text, m.html, undefined, false, { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  if (!sent.ok) return sent;
  await saveMeta(u.id, { token, emailed: [...(u.meta.emailed ?? []), { at: new Date().toISOString(), subject: fill(subject, u.first).slice(0, 120) }].slice(-20) });
  return { ok: true };
}
