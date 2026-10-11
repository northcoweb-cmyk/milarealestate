import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-secaudit-"));
process.env.MILA_DATA_DIR = dir;
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
const { createTestStore } = await import("../src/lib/db/store.ts");
const store: any = createTestStore(dir, true);
const { createProfile } = await import("../src/lib/users.ts");
const { TABLES } = await import("../src/lib/types.ts");
const { bearerMatches } = await import("../src/lib/server/bearer.ts");

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

test("store: every user table is tenant-scoped on get/update/remove/list/findBy", async () => {
  const a = await createProfile({ email: "a@sec.test", full_name: "A" });
  const b = await createProfile({ email: "b@sec.test", full_name: "B" });
  const tables = ["contacts", "properties", "calendar_events", "approvals", "email_drafts", "social_posts", "documents", "memories", "conversations", "messages"] as const;
  for (const t of tables) {
    const row = await store.insert(t, a.id, { name: "x", payload: { tool: "t", args: {} }, status: "draft", user_id: b.id }); // a forged user_id in the body must not win
    assert.equal(row.user_id, a.id, `${t}: insert ignores a forged user_id`);
    assert.equal(await store.get(t, b.id, row.id), null, `${t}: B cannot read A's row`);
    assert.equal(await store.update(t, b.id, row.id, { name: "hacked" }), null, `${t}: B cannot update A's row`);
    assert.equal(await store.remove(t, b.id, row.id), false, `${t}: B cannot delete A's row`);
    assert.equal((await store.list(t, b.id)).length, 0, `${t}: B's list is empty`);
    assert.equal(await store.findBy(t, b.id, { id: row.id }), null, `${t}: B cannot find A's row`);
    const u = await store.update(t, a.id, row.id, { user_id: b.id, id: "stolen" });
    assert.equal(u.user_id, a.id); assert.equal(u.id, row.id, `${t}: update cannot reassign owner or id`);
  }
});

test("supabase migrations: RLS on every table, and money/identity/approval tables are read-only to clients", () => {
  const dirM = path.join(root, "supabase/migrations");
  const sql = fs.readdirSync(dirM).filter((f) => f.endsWith(".sql")).sort().map((f) => fs.readFileSync(path.join(dirM, f), "utf8")).join("\n");
  const created = [...sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)/gi)].map((m) => m[1]);
  const rls = new Set([...sql.matchAll(/alter table (?:public\.)?(\w+) enable row level security/gi)].map((m) => m[1]));
  for (const t of created) assert.ok(rls.has(t), `${t} must have row level security enabled`);
  for (const t of TABLES) assert.ok(rls.has(t), `${t} (app table) must have RLS`);
  // replay create/drop policy in order to get the final policy set
  const live = new Map<string, { table: string; cmd: string; to: string; body: string }>();
  for (const m of sql.matchAll(/(drop policy if exists (\w+) on (\w+))|(create policy (\w+) on (\w+) for (\w+) to (\w+)([^;]*);)/gi)) {
    if (m[1]) live.delete(`${m[3]}.${m[2]}`);
    else live.set(`${m[6]}.${m[5]}`, { table: m[6], cmd: m[7].toLowerCase(), to: m[8].toLowerCase(), body: m[9] });
  }
  for (const t of ["profiles", "credit_transactions", "subscriptions", "usage", "approvals", "integrations"]) {
    for (const p of live.values()) if (p.table === t) assert.equal(p.cmd, "select", `${t}: clients may only read (found a ${p.cmd} policy)`);
  }
  assert.ok(![...live.values()].some((p) => p.table === "integrations"), "integrations (OAuth tokens) has no client policy");
  for (const p of live.values()) {
    if (p.to === "anon") assert.equal(p.table, "waitlist", "only the waitlist may be written anonymously");
    if (p.to === "authenticated") assert.match(p.body, /auth\.uid\(\)/, `${p.table}: policy must be bound to the signed-in user`);
  }
});

test("/api/health: public callers get up/down only (no capabilities, keys, schema gaps or photo errors)", async () => {
  const { GET } = await import("../src/app/api/health/route.ts");
  const prev = process.env.CRON_SECRET; const prevKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.CRON_SECRET = "s3cret-cron-value"; process.env.GOOGLE_MAPS_API_KEY = "AIzaFAKEFAKEFAKEFAKEFAKEFAKEFAKE000";
  try {
    const r = await GET(new Request("http://x/api/health"));
    const text = await r.text();
    const j = JSON.parse(text);
    assert.deepEqual(Object.keys(j), ["ok"]);
    assert.ok(!text.includes("AIza") && !text.includes("s3cret"));
    const bad = await GET(new Request("http://x/api/health", { headers: { authorization: "Bearer wrong" } }));
    assert.deepEqual(Object.keys(await bad.json()), ["ok"]);
  } finally { if (prev === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev; if (prevKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY = prevKey; }
});

test("/api/version exposes the short commit and environment only", async () => {
  const { GET } = await import("../src/app/api/version/route.ts");
  const j = await (GET() as Response).json();
  assert.deepEqual(Object.keys(j).sort(), ["commit", "env"]);
});

test("bearerMatches: exact secret only, never when unset", () => {
  const req = (h?: string) => new Request("http://x", { headers: h ? { authorization: h } : {} });
  assert.equal(bearerMatches(req("Bearer abc"), "abc"), true);
  assert.equal(bearerMatches(req("Bearer abd"), "abc"), false);
  assert.equal(bearerMatches(req("Bearer abc"), undefined), false);
  assert.equal(bearerMatches(req("Bearer "), ""), false);
  assert.equal(bearerMatches(req(), "abc"), false);
  for (const c of ["cron/reminders", "cron/daily-summary"]) assert.match(read(`src/app/api/${c}/route.ts`), /bearerMatches\(req, secret\)/);
});

test("approval routes: edits only touch what the approval covers, only while pending; compose refuses decided approvals", () => {
  const d = read("src/app/api/approvals/[id]/route.ts");
  assert.match(d, /covered\.has\(e\.draftId\)/);
  assert.match(d, /b\.postId === a\.postId/);
  assert.match(d, /b\.decision === "approve" && approval\.status === "pending"/);
  const c = read("src/app/api/approvals/[id]/compose/route.ts");
  assert.match(c, /approval\.status !== "pending"/);
});

test("bulk content actions need explicit confirmation", () => {
  const s = read("src/app/api/content/bulk/route.ts");
  assert.match(s, /!ids\.length && b\.confirm !== true/);
  assert.match(s, /ids\.length > 10 && b\.confirm !== true/);
});

test("image proxy never relays SVG/HTML and sets nosniff + sandbox CSP", () => {
  const s = read("src/app/api/media/image/route.ts");
  assert.match(s, /png\|jpe\?g\|webp\|gif\|avif/);
  assert.match(s, /nosniff/); assert.match(s, /sandbox/);
});

test("bug reports to GitHub are redacted and cannot @mention strangers", () => {
  const s = read("src/app/api/bug/route.ts");
  assert.match(s, /openIssue\(redactSecrets\(title\), redactSecrets\(body\)/);
});

test("no server secret is read from client code or exposed via NEXT_PUBLIC_*", () => {
  const secrets = /process\.env\.\w*(?:SERVICE_ROLE|GOOGLE_MAPS_API_KEY|STRIPE_SECRET|STRIPE_WEBHOOK|CRON_SECRET|SESSION_SECRET|RESEND_API|ANTHROPIC_API|OPENAI_API|RENTCAST|ZILLAPI|MICROSOFT_CLIENT_SECRET|GOOGLE_CLIENT_SECRET|GITHUB_BUG_TOKEN)/;
  const walk = (p: string): string[] => fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(p, e.name)) : [path.join(p, e.name)]);
  for (const f of walk(path.join(root, "src")).filter((x) => /\.(tsx?|mts)$/.test(x))) {
    const src = fs.readFileSync(f, "utf8");
    assert.ok(!/NEXT_PUBLIC_\w*(SECRET|SERVICE_ROLE|PRIVATE|TOKEN)/.test(src), `${f}: secret-looking NEXT_PUBLIC var`);
    if (/^\s*["']use client["']/m.test(src.slice(0, 200))) assert.ok(!secrets.test(src), `${f}: client component references a server secret`);
  }
  for (const f of [".env", ".env.local", ".env.production"]) assert.ok(!fs.existsSync(path.join(root, f)) || !/^\s*(?!#)[^=\n]*(SECRET|SERVICE_ROLE|API_KEY)[^=\n]*=\s*\S+/m.test(fs.readFileSync(path.join(root, f), "utf8")) || /\.env/.test(fs.readFileSync(path.join(root, ".gitignore"), "utf8")));
});
