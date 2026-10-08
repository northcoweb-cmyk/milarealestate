import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.MILA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mila-bug-"));
const { isTester, testerEmails } = await import("../src/lib/testers");
const { getStore } = await import("../src/lib/db/store");

test("Sarah is a tester by default, others only when listed, matching is case-insensitive", () => {
  assert.equal(isTester("sarahpark0506@gmail.com"), true);
  assert.equal(isTester("  SarahPark0506@Gmail.com "), true);
  assert.equal(isTester("rystillwell06@gmail.com"), true);
  assert.equal(isTester("northcoweb@yahoo.com"), true);
  assert.equal(isTester("someone@else.com"), false);
  assert.equal(isTester(null), false);
  process.env.TESTER_EMAILS = "amy@x.com, Bo@Y.com";
  assert.equal(isTester("bo@y.com"), true);
  assert.ok(testerEmails().includes("amy@x.com"));
  delete process.env.TESTER_EMAILS;
});

test("a bug report keeps its category, context and fix-queue status", async () => {
  const s = getStore(), uid = "33333333-3333-4333-8333-333333333333";
  const row = await s.insert("feedback", uid, { kind: "bug", target: "bug", target_id: null, note: "Showing went on the wrong day", snippet: "Added: Showing, Friday", page: "/", category: "wrong_answer", context: { transcript: [{ role: "user", text: "showing tmr at 2" }] }, status: "open", github_issue: null } as never);
  const back = (await s.list("feedback", uid)).find((r) => r.id === row.id)!;
  assert.equal(back.kind, "bug"); assert.equal(back.status, "open");
  assert.deepEqual((back.context as any).transcript[0].text, "showing tmr at 2");
});

test("any signed-in user can report, with a lower rate cap, and an issue is filed only when a token is set", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/app/api/bug/route.ts"), "utf8");
  assert.match(src, /tester \? 60 : 10/);
  assert.match(src, /if \(!token\) return null/);
});
