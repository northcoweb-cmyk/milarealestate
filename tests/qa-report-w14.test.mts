import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { GOOGLE_SCOPES, disconnectGoogleService, saveConnection } from "../src/lib/integrations/google.ts";
import { encrypt } from "../src/lib/integrations/crypto.ts";

const now = new Date("2026-10-19T19:00:00Z");

async function connectAll(userId: string) {
  const scopes = [...GOOGLE_SCOPES.base, ...GOOGLE_SCOPES.calendar, ...GOOGLE_SCOPES.contacts, ...GOOGLE_SCOPES.sheets];
  return store.insert("integrations", userId, { provider: "google", status: "connected", account_label: "a@x.com", scopes, token_encrypted: encrypt(JSON.stringify({ access_token: "t", expires_at: Date.now() + 3_600_000 })), error: null, connected_at: new Date().toISOString() } as never) as Promise<any>;
}

test("W14: disconnecting Google Calendar leaves Contacts and Sheets connected", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const row = await connectAll(a.id);
  const r = await disconnectGoogleService(a.id, "calendar");
  assert.deepEqual(r.remaining.sort(), ["contacts", "sheets"]);
  const after = (await store.get("integrations", a.id, row.id)) as any;
  assert.ok(after, "the connection row is still there");
  assert.ok(!after.scopes.some((s: string) => GOOGLE_SCOPES.calendar.includes(s)));
  assert.ok(GOOGLE_SCOPES.contacts.every((s) => after.scopes.includes(s)) && GOOGLE_SCOPES.sheets.every((s) => after.scopes.includes(s)));
});

test("W14: disconnecting the last service removes the connection; reconnecting one service does not bring back one you turned off", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await connectAll(a.id);
  await disconnectGoogleService(a.id, "calendar");
  // Google reports every permission ever granted, including calendar; only the service asked for now is added back
  const everything = [...GOOGLE_SCOPES.base, ...GOOGLE_SCOPES.calendar, ...GOOGLE_SCOPES.contacts, ...GOOGLE_SCOPES.sheets];
  await saveConnection(a.id, { access_token: "t2", expires_at: Date.now() + 3_600_000 }, everything, ["sheets"]);
  const row = ((await store.list("integrations", a.id)) as any[])[0];
  assert.ok(!row.scopes.some((s: string) => GOOGLE_SCOPES.calendar.includes(s)), "calendar stays off");
  await disconnectGoogleService(a.id, "contacts");
  const last = await disconnectGoogleService(a.id, "sheets");
  assert.deepEqual(last.remaining, []);
  assert.equal(((await store.list("integrations", a.id)) as any[]).length, 0);
});
