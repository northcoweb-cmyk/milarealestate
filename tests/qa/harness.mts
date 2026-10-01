// QA harness: spins up isolated agent accounts at arbitrary clocks/time zones and checks universal invariants after every turn.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { partsIn } from "../../src/lib/time";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-qa-"));
process.env.MILA_DATA_DIR = dir;
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;

const { createTestStore } = await import("../../src/lib/db/store");
export const store: any = createTestStore(dir, true);
const { createProfile } = await import("../../src/lib/users");
const { seedDemoData } = await import("../../src/lib/db/seed");
const { handleTurn } = await import("../../src/lib/agent/engine");
const { getBalance } = await import("../../src/lib/credits");

export const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "Pacific/Honolulu"];

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const pick = <T,>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)];

let counter = 0;
export interface Agent {
  id: string; tz: string; now: Date; profile: any; log: string[]; seedIds: Set<string>; seedNames: Set<string>;
  say: (message: string, extra?: any) => Promise<any>;
  act: (action: any) => Promise<any>;
}

export async function newAgent(opts: { now: Date; tz: string; seed?: boolean }): Promise<Agent> {
  (globalThis as any).__milaNow = opts.now;
  const n = ++counter;
  const prof = await createProfile({ email: `qa${n}@test.dev`, full_name: "Sarah Carter" });
  await store.update("profiles", prof.id, prof.id, { timezone: opts.tz, location: "Gaithersburg, MD", primary_market: "Montgomery County, MD", onboarded: true });
  const profile = await store.get("profiles", prof.id, prof.id);
  if (opts.seed !== false) await seedDemoData(profile);
  const seedIds = new Set<string>((await store.list("calendar_events", prof.id)).map((e: any) => e.id));
  const agent: Agent = {
    seedIds, seedNames: new Set<string>((await store.list("contacts", prof.id)).map((c: any) => c.name)), id: prof.id, tz: opts.tz, now: opts.now, profile, log: [],
    say: async (message, extra = {}) => { (globalThis as any).__milaNow = opts.now; agent.log.push("> " + message); const r = await handleTurn(profile, { message, ...extra }); agent.log.push("< " + r.milaMessage.content); return r; },
    act: async (action) => { (globalThis as any).__milaNow = opts.now; agent.log.push("> [action] " + JSON.stringify(action).slice(0, 120)); const r = await handleTurn(profile, { action }); agent.log.push("< " + r.milaMessage.content); return r; },
  };
  return agent;
}

// ------------------------------------------------------------------ helpers for scenarios
export const blocks = (r: any, type: string) => r.milaMessage.blocks.filter((b: any) => b.type === type);
export const text = (r: any) => r.milaMessage.content + " " + JSON.stringify(r.milaMessage.blocks);
export const events = (a: Agent) => store.list("calendar_events", a.id).then((l: any[]) => l.filter((e) => e.status === "confirmed"));
export const local = (iso: string, tz: string) => partsIn(new Date(iso), tz);

// ------------------------------------------------------------------ invariants (checked after EVERY turn)
const BAD_STRINGS = ["undefined", "NaN", "[object Object]", "Invalid Date", "null null", "$NaN", "NaN:"];

function overlapPairs(evs: any[]) {
  let n = 0;
  for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length; j++)
    if (new Date(evs[i].start_at) < new Date(evs[j].end_at) && new Date(evs[j].start_at) < new Date(evs[i].end_at)) n++;
  return n;
}

export interface Snapshot { overlaps: number; contacts: number; eventIds: Set<string> }
export async function snapshot(a: Agent): Promise<Snapshot> {
  const evs = await events(a);
  return { overlaps: overlapPairs(evs), contacts: (await store.list("contacts", a.id)).length, eventIds: new Set(evs.map((e: any) => e.id)) };
}

export async function checkInvariants(a: Agent, r: any, before: Snapshot, ms: number, allow: { overlap?: boolean; contactDelete?: boolean; pastEvent?: boolean } = {}): Promise<string[]> {
  const f: string[] = [];
  const out = JSON.stringify(r.milaMessage);
  if (typeof r.milaMessage.content !== "string") f.push("reply content is not a string");
  if (!r.milaMessage.content?.trim() && !r.milaMessage.blocks?.length) f.push("empty reply (no text, no blocks)");
  for (const b of BAD_STRINGS) if (out.includes(b)) f.push(`reply leaks "${b}": ${out.slice(Math.max(0, out.indexOf(b) - 60), out.indexOf(b) + 60)}`);
  if (/\{\{[A-Z_]+\}\}/.test(out)) f.push("reply leaks template variable");
  if (ms > 4000) f.push(`slow turn: ${ms}ms`);

  const evs = await events(a);
  for (const e of evs) {
    const s = new Date(e.start_at), en = new Date(e.end_at);
    if (Number.isNaN(s.getTime()) || Number.isNaN(en.getTime())) f.push(`event "${e.title}" has invalid dates`);
    else {
      if (en <= s) f.push(`event "${e.title}" ends before it starts`);
      if (en.getTime() - s.getTime() > 24 * 3_600_000) f.push(`event "${e.title}" is longer than 24h`);
      if (!before.eventIds.has(e.id) && !allow.pastEvent && s.getTime() < a.now.getTime() - 60_000 && e.source === "mila") f.push(`event "${e.title}" was created in the past (${e.start_at})`);
      const h = local(e.start_at, a.tz).h;
      if (!before.eventIds.has(e.id) && (h < 5) ) f.push(`event "${e.title}" created at ${h}:00 local (suspicious hour)`);
    }
  }
  if (!allow.overlap) { const o = overlapPairs(evs); if (o > before.overlaps) f.push(`double-booking: overlapping confirmed events increased ${before.overlaps} -> ${o}`); }

  const contacts: any[] = await store.list("contacts", a.id);
  if (!allow.contactDelete && contacts.length < before.contacts) f.push(`contacts decreased ${before.contacts} -> ${contacts.length} without an approved delete`);
  for (const c of contacts) if (!c.name?.trim()) f.push("contact with empty name");
  const emails = contacts.filter((c) => c.email).map((c) => c.email.toLowerCase());
  const dup = emails.find((e, i) => emails.indexOf(e) !== i);
  if (dup) f.push(`duplicate contact email ${dup}`);

  const drafts: any[] = await store.list("email_drafts", a.id);
  for (const d of drafts) {
    if (d.status === "sent") f.push("email marked sent although Gmail is not connected");
    const bad = BAD_STRINGS.find((b) => d.body.includes(b) || d.subject.includes(b));
    if (bad) f.push(`draft "${d.subject}" contains "${bad}"`);
    if (/\{\{(?!first_name)[A-Za-z_]+\}\}/.test(d.body)) f.push(`draft "${d.subject}" leaks a template variable`);
  }
  const tasks: any[] = await store.list("tasks", a.id);
  for (const t of tasks) { if (!t.title?.trim()) f.push("task with empty title"); for (const b of BAD_STRINGS) if (`${t.title} ${t.subtitle}`.includes(b)) f.push(`task "${t.title}" contains "${b}"`); }
  const rems: any[] = await store.list("reminders", a.id);
  for (const m of rems) if (Number.isNaN(new Date(m.remind_at).getTime())) f.push("reminder with invalid time");

  const tx: any[] = await store.list("credit_transactions", a.id);
  const bal = await getBalance(a.id);
  if (bal !== tx.reduce((n, t) => n + t.delta, 0)) f.push("credit balance disagrees with ledger");
  if (bal < 0) f.push("negative credit balance");
  const approvals: any[] = await store.list("approvals", a.id);
  for (const ap of approvals) if (ap.status === "executed" && /send_/.test(ap.payload.tool) && !ap.result) f.push("send approval executed with no result");
  return f;
}
