import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.MILA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mila-fb-"));
const { getStore } = await import("../src/lib/db/store");

test("feedback rows are stored per person and never shown to someone else", async () => {
  const s = getStore();
  const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
  await s.insert("feedback", a, { kind: "wrong", target: "chat", target_id: "m1", note: "Wrong price", snippet: "Listed at $500k", page: "/" });
  await s.insert("feedback", b, { kind: "useful", target: "chat", target_id: "m2", note: null, snippet: null, page: null });
  const mine = await s.list("feedback", a);
  assert.equal(mine.length, 1); assert.equal(mine[0].kind, "wrong"); assert.equal(mine[0].note, "Wrong price");
  assert.equal((await s.list("feedback", b)).length, 1);
  assert.equal((await s.listAll("feedback")).length, 2);
});
