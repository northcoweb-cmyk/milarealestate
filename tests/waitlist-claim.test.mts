import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-wl-"));
process.env.MILA_DATA_DIR = dir;
const { getStore } = await import("../src/lib/db/store");
const { inviteFor, newInviteToken, markClaimed } = await import("../src/lib/waitlist");
const { NIL_USER } = await import("../src/lib/server/errors");

const add = (over: object = {}) => getStore().insert("waitlist", NIL_USER, { email: "pat@example.com", name: "Pat Lee", source: "instagram", status: "waiting", invite_token: null, invited_at: null, email_sent_at: null, claimed_at: null, account_id: null, ...over } as never);

test("invite tokens are long, unique and hex", () => {
  const a = newInviteToken(), b = newInviteToken();
  assert.match(a, /^[a-f0-9]{48}$/); assert.notEqual(a, b);
});

test("an invite link resolves only while it is valid", async () => {
  const token = newInviteToken();
  const e = await add({ invite_token: token, invited_at: new Date().toISOString() });
  const ok = await inviteFor(token);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.entry.email, "pat@example.com");
  assert.deepEqual(await inviteFor("nope"), { ok: false, reason: "invalid" });
  assert.deepEqual(await inviteFor(null), { ok: false, reason: "invalid" });
  assert.deepEqual(await inviteFor("a".repeat(48)), { ok: false, reason: "invalid" }); // well-formed but unknown
  await markClaimed(e, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(await inviteFor(token), { ok: false, reason: "used" });
});

test("an old invite expires, and an entry that was never invited can't be claimed", async () => {
  const old = newInviteToken();
  await add({ email: "old@example.com", invite_token: old, invited_at: new Date(Date.now() - 60 * 86_400_000).toISOString() });
  assert.deepEqual(await inviteFor(old), { ok: false, reason: "expired" });
  const never = newInviteToken();
  await add({ email: "never@example.com", invite_token: never, invited_at: null });
  assert.deepEqual(await inviteFor(never), { ok: false, reason: "expired" });
});
