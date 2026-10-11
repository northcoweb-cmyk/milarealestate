// Held-out evaluation framework: multi-turn conversations scored on STORE STATE (calendar, contacts, tasks, approvals, drafts, properties,
// memories), not just reply text. Deterministic and mocked: rule-based agent, mocked clock, local file store, no live model, no network.
import { newAgent, checkInvariants, snapshot, store, events as confirmedEvents, type Agent } from "../qa/harness.mts";

export type Dim = "interp" | "clarify" | "outcome" | "subtask" | "factual" | "honest" | "draft" | "ui";
export const DIMS: { key: Dim; label: string }[] = [
  { key: "interp", label: "interpretation + entity selection" },
  { key: "clarify", label: "necessary / unnecessary clarification" },
  { key: "outcome", label: "database / tool outcome correctness" },
  { key: "subtask", label: "requested-subtask completion" },
  { key: "factual", label: "factual support / uncertainty" },
  { key: "honest", label: "honest status wording" },
  { key: "draft", label: "draft usefulness" },
  { key: "ui", label: "UI / mobile (not measurable here)" },
];

export interface Check { dim: Dim; ok: boolean; msg: string }
export const check = (dim: Dim, ok: unknown, msg: string): Check => ({ dim, ok: !!ok, msg });

export type Category =
  | "cancel-replace-move" | "entity-ambiguity" | "short-bursts" | "interrupted-clarification" | "edits-after-approval" | "compose-no-send"
  | "draft-only" | "bulk-out-of-office" | "credit-exhausted" | "feedback-not-entity" | "time-anchors" | "call-summaries" | "preferences"
  | "untrusted-import" | "multi-part" | "security" | "property-facts" | "integrations" | "conversations" | "speech-slang" | "content-requests";

export interface Session {
  a: Agent; id: string; tz: string; now: Date;
  /** every reply so far */
  replies: any[]; last: any;
  say(msg: string, extra?: any): Promise<any>;
  act(action: any): Promise<any>;
  setNow(d: Date): void;
  /** raw handleTurn with a specific conversation id */
  sayIn(conversationId: string, msg: string): Promise<any>;
  turnMs: number[]; creditsSpent: number;
}

export interface Turn {
  say?: string; act?: any | ((s: Session) => any); run?: (s: Session) => Promise<void> | void; files?: { name: string; mime: string; body: string }[];
  /** checks on this turn's reply and the store */
  expect?: (r: any, s: Session) => Promise<Check[] | Check | void> | Check[] | Check | void;
  allow?: { overlap?: boolean; contactDelete?: boolean; pastEvent?: boolean };
  /** a turn that is expected to be answered with a question must not auto-answer the city prompt */
  noAutoCity?: boolean;
}

export interface EvalScenario {
  id: string; category: Category; title: string;
  /** NOT used for tuning: written before the first run and only inspected afterwards */
  heldOut?: boolean;
  /** explicit non-implementations are listed, never faked as passes */
  status?: "not_implemented"; reason?: string;
  now?: string; tz?: string; seed?: boolean;
  setup?: (s: Session) => Promise<void>;
  turns: Turn[];
  /** end-to-end assertions on store state */
  assert?: (s: Session) => Promise<Check[]> | Check[];
  dims: Dim[];
  /** where this scenario's coverage lives when it is also covered by a dedicated test file */
  see?: string;
}

// ------------------------------------------------------------------ session
export async function makeSession(sc: { now?: string; tz?: string; seed?: boolean }): Promise<Session> {
  const tz = sc.tz ?? "America/New_York";
  const now = new Date(sc.now ?? "2026-10-11T14:00:00Z"); // Sunday 10:00 ET
  const a = await newAgent({ now, tz, seed: sc.seed ?? false });
  const { handleTurn } = await import("../../src/lib/agent/engine");
  const s: Session = {
    a, id: a.id, tz, now, replies: [], last: null, turnMs: [], creditsSpent: 0,
    setNow: (d) => { s.now = d; (globalThis as any).__milaNow = d; },
    say: async (msg, extra = {}) => {
      (globalThis as any).__milaNow = s.now; a.log.push("> " + msg);
      let r = await handleTurn(a.profile, { message: msg, ...extra }); a.log.push("< " + r.milaMessage.content);
      if (!extra.noAutoCity && /^What city (?:and state )?is .+ in\?/i.test(r.milaMessage.content)) { a.log.push("> Gaithersburg, MD"); r = await handleTurn(a.profile, { message: "Gaithersburg, MD" }); a.log.push("< " + r.milaMessage.content); }
      s.last = r; s.replies.push(r); return r;
    },
    act: async (action) => { (globalThis as any).__milaNow = s.now; a.log.push("> [action] " + JSON.stringify(action).slice(0, 140)); const r = await handleTurn(a.profile, { action }); a.log.push("< " + r.milaMessage.content); s.last = r; s.replies.push(r); return r; },
    sayIn: async (conversationId, msg) => { (globalThis as any).__milaNow = s.now; a.log.push(`> [${conversationId.slice(0, 4)}] ${msg}`); const r = await handleTurn(a.profile, { message: msg, conversationId }); a.log.push("< " + r.milaMessage.content); s.last = r; s.replies.push(r); return r; },
  };
  return s;
}

// ------------------------------------------------------------------ store helpers
export const list = (s: Session, table: string): Promise<any[]> => store.list(table, s.id);
export const allEvents = (s: Session) => list(s, "calendar_events");
export const active = (s: Session) => confirmedEvents(s.a) as Promise<any[]>;
export const contacts = (s: Session) => list(s, "contacts");
export const tasks = (s: Session) => list(s, "tasks");
export const drafts = (s: Session) => list(s, "email_drafts");
export const approvals = (s: Session) => list(s, "approvals");
export const props = (s: Session) => list(s, "properties");
export const memories = (s: Session) => list(s, "memories");
export const pendingApprovals = async (s: Session) => (await approvals(s)).filter((x) => x.status === "pending");

export const buttons = (r: any): any[] => (r?.milaMessage?.blocks ?? []).flatMap((b: any) => b.buttons ?? []);
export const btn = (r: any, re: RegExp) => buttons(r).find((b) => re.test(b.label));
export const approvalButton = (r: any) => buttons(r).find((b) => b.approvalId);
export const blocksOf = (r: any, type: string): any[] => (r?.milaMessage?.blocks ?? []).filter((b: any) => b.type === type);
export const reply = (r: any): string => r?.milaMessage?.content ?? "";
export const whole = (r: any): string => reply(r) + " " + JSON.stringify(r?.milaMessage?.blocks ?? []);
/** Did Mila ask the user something (instead of doing it)? A reassurance like "Wrong?" on an undo card after an action does not count. */
export const isQuestion = (r: any) => {
  const blocks: any[] = r?.milaMessage?.blocks ?? [];
  if (/\?/.test(reply(r))) return true;
  if (blocks.some((b) => b.type === "event" && /added|updated|moved|canceled/i.test(b.status ?? ""))) return false;
  return blocks.some((b) => /\?/.test(`${b.title ?? ""} ${b.body ?? ""}`) || b.type === "questions" || (b.type === "contacts" && /which/i.test(b.title ?? "")) || (b.type === "choice" && (b.buttons ?? []).length > 1));
};
export const hasTitleMatch = (evs: any[], re: RegExp) => evs.filter((e) => re.test(e.title));
export const localParts = (iso: string, tz: string) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { y: +g("year"), m: +g("month"), d: +g("day"), h: +g("hour"), mi: +g("minute"), wd: g("weekday") };
};

// ------------------------------------------------------------------ universal wording checks (every turn)
const SENT_CLAIM = /\b(?:i(?:'ve| have)?|we(?:'ve)?) (?:just )?(?:sent|emailed|texted|messaged)\b|\b(?:email|message|text|draft)s? (?:was |were |has been |have been )?sent\b|\bsent (?:it|them|the (?:email|message|text|draft)|your (?:email|message))\b|\bsuccessfully sent\b/i;
export async function universal(s: Session, r: any, before: Awaited<ReturnType<typeof snapshot>>, ms: number, allow?: Turn["allow"]): Promise<Check[]> {
  const out: Check[] = [];
  // a multi-day "Out of office" block is deliberately longer than a day (the QA harness flags every other >24h event as a parse error)
  for (const m of await checkInvariants(s.a, r, before, Math.min(ms, 3999), allow ?? {})) if (!/^event "Out of office" is longer than 24h/.test(m)) out.push(check("outcome", false, "invariant: " + m));
  const t = reply(r);
  const sentDraft = (await drafts(s)).some((d) => d.status === "sent");
  if (SENT_CLAIM.test(t) && !sentDraft) {
    // quoting what the agent asked ("Did you send it?") is fine; asserting it is not
    const hit = SENT_CLAIM.exec(t)![0];
    if (!/\?\s*$/.test(t.slice(Math.max(0, t.indexOf(hit) - 40)).split(/[.!]/)[0] ?? "")) out.push(check("honest", false, `claims something was sent without Gmail/Outlook ("${hit}")`));
  }
  if (/\b(?:i (?:just )?(?:heard|listened to) (?:the|your|that) call|from the recording|i (?:was|am) on the call)\b/i.test(t)) out.push(check("honest", false, "claims to have heard a call"));
  return out;
}

// ------------------------------------------------------------------ run one scenario
export interface ScenarioResult {
  id: string; category: string; title: string; heldOut: boolean; status: "pass" | "fail" | "not_implemented"; reason?: string;
  checks: Check[]; failures: string[]; log: string[]; turnMs: number[]; creditsSpent: number; dims: Dim[];
}

export async function runScenario(sc: EvalScenario): Promise<ScenarioResult> {
  const base = { id: sc.id, category: sc.category, title: sc.title, heldOut: !!sc.heldOut, dims: sc.dims };
  if (sc.status === "not_implemented") return { ...base, status: "not_implemented", reason: sc.reason, checks: [], failures: [], log: [], turnMs: [], creditsSpent: 0 };
  const s = await makeSession(sc);
  const checks: Check[] = [];
  const push = (c: Check[] | Check | void) => { for (const x of ([] as Check[]).concat(c ?? [])) checks.push(x); };
  const { getBalance } = await import("../../src/lib/credits");
  const bal0 = await getBalance(s.id);
  try {
    await sc.setup?.(s);
    for (const t of sc.turns) {
      if (t.run) { await t.run(s); if (!t.say && !t.act && !t.expect) continue; }
      const before = await snapshot(s.a);
      const t0 = Date.now();
      let r: any = s.last;
      if (t.say !== undefined) {
        let extra: any = t.noAutoCity ? { noAutoCity: true } : {};
        if (t.files) {
          const { putFile } = await import("../../src/lib/files");
          const { randomUUID } = await import("node:crypto");
          const ids: string[] = [];
          for (const f of t.files) {
            const id = randomUUID();
            const sp = await putFile(s.id, id, Buffer.from(f.body), f.mime);
            await store.insert("documents", s.id, { id, name: f.name, kind: /\.(csv|tsv)$/.test(f.name) ? "csv" : "text", mime: f.mime, size_bytes: f.body.length, storage_path: sp, text_content: null, extracted: null, property_id: null, contact_id: null, summary: null });
            ids.push(id);
          }
          extra = { ...extra, attachmentIds: ids };
        }
        r = await s.say(t.say, extra);
      } else if (t.act !== undefined) r = await s.act(typeof t.act === "function" ? t.act(s) : t.act);
      const ms = Date.now() - t0;
      s.turnMs.push(ms);
      push(await universal(s, r, before, ms, t.allow));
      if (t.expect) push(await t.expect(r, s));
    }
    if (sc.assert) push(await sc.assert(s));
  } catch (e: any) {
    push(check("outcome", false, "EXCEPTION: " + String(e?.stack ?? e).split("\n").slice(0, 3).join(" | ")));
  }
  const spent = bal0 - (await getBalance(s.id));
  const failures = checks.filter((c) => !c.ok).map((c) => `[${c.dim}] ${c.msg}`);
  return { ...base, status: failures.length ? "fail" : "pass", checks, failures, log: s.a.log, turnMs: s.turnMs, creditsSpent: spent };
}

// ------------------------------------------------------------------ direct seeding (so a scenario about X is not polluted by the flow that creates Y)
export async function seedContact(s: Session, c: { name: string; email?: string | null; phone?: string | null; type?: string; notes?: string | null; last_contact_at?: string | null }) {
  return store.insert("contacts", s.id, { name: c.name, email: c.email ?? null, phone: c.phone ?? null, type: c.type ?? "buyer", status: "active", tags: [], notes: c.notes ?? null, preferences: {}, location: null, budget_min: null, budget_max: null, timeline: null, source: "eval", importance: 2, last_contact_at: c.last_contact_at ?? null, next_action: null, next_action_at: null, avatar_color: "#6c5ce7" });
}
export async function seedProperty(s: Session, p: { address: string; city?: string; state?: string; zip?: string; list_price?: number | null; beds?: number | null; baths?: number | null; sqft?: number | null; verified?: boolean }) {
  return store.insert("properties", s.id, { address: p.address, city: p.city ?? null, state: p.state ?? null, zip: p.zip ?? null, county: null, list_price: p.list_price ?? null, beds: p.beds ?? null, baths: p.baths ?? null, sqft: p.sqft ?? null, listing_url: null, description: null, verified: p.verified ?? false, is_demo: false });
}
export async function seedEvent(s: Session, e: { title: string; kind?: string; start: string; end: string; location?: string | null; property_id?: string | null; contact_id?: string | null }) {
  return store.insert("calendar_events", s.id, { title: e.title, kind: e.kind ?? "meeting", start_at: new Date(e.start).toISOString(), end_at: new Date(e.end).toISOString(), location: e.location ?? null, property_id: e.property_id ?? null, contact_id: e.contact_id ?? null, status: "confirmed", source: "mila", external_id: null, synced_at: null, workflow_run_id: null, notes: null });
}
/** UTC instant for a local wall-clock time in the session's zone */
export async function localAt(s: Session, y: number, m: number, d: number, h: number, mi = 0) {
  const { zonedToUtc } = await import("../../src/lib/time");
  return zonedToUtc(y, m, d, h, mi, s.tz);
}
export const iso = (d: Date) => d.toISOString();
export const hm = (iso: string, tz: string) => { const p = localParts(iso, tz); return `${p.m}/${p.d} ${p.h}:${String(p.mi).padStart(2, "0")}`; };
export { store };
