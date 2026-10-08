import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.MILA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mila-ics-"));
process.env.MILA_ALLOW_PRIVATE_FETCH = "1";
process.env.INTEGRATION_ENCRYPTION_KEY = "test-key-test-key-test-key-test-key-12";
const { getStore } = await import("../src/lib/db/store");
const { saveIcsLink, syncIcs, removeIcs } = await import("../src/lib/integrations/ics");

const day = (n: number) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`; };
const ev = (uid: string, n: number, title: string) => `BEGIN:VEVENT\nUID:${uid}\nDTSTART:${day(n)}T150000Z\nDTEND:${day(n)}T160000Z\nSUMMARY:${title}\nEND:VEVENT`;
let body = `BEGIN:VCALENDAR\n${ev("a", 2, "Showing at 12 Oak")}\n${ev("b", 3, "Dentist")}\nEND:VCALENDAR`;
const srv = http.createServer((_q, r) => { r.setHeader("content-type", "text/calendar"); r.end(body); });
await new Promise<void>((ok) => srv.listen(0, ok));
const link = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/cal.ics`;
const uid = "44444444-4444-4444-8444-444444444444";

test("a calendar link imports once, updates in place, and drops what was deleted at the source", async () => {
  await saveIcsLink(uid, link);
  assert.deepEqual(await syncIcs(uid, "America/New_York"), { added: 2, updated: 0, removed: 0 });
  const s = getStore();
  const first = (await s.list("calendar_events", uid)).filter((e) => e.source === "ics");
  assert.equal(first.length, 2);
  assert.equal(first.find((e) => /Showing/.test(e.title))!.kind, "showing");
  assert.deepEqual(await syncIcs(uid, "America/New_York"), { added: 0, updated: 2, removed: 0 }, "second sync duplicates nothing");
  body = `BEGIN:VCALENDAR\n${ev("a", 2, "Showing at 12 Oak (moved)")}\nEND:VCALENDAR`;
  assert.deepEqual(await syncIcs(uid, "America/New_York"), { added: 0, updated: 1, removed: 1 });
  const after = await s.list("calendar_events", uid);
  assert.equal(after.find((e) => e.external_id === "b")!.status, "cancelled");
  assert.match(after.find((e) => e.external_id === "a")!.title, /moved/);
});

test("disconnecting removes the link and everything it brought in", async () => {
  await removeIcs(uid);
  assert.equal((await getStore().list("calendar_events", uid)).filter((e) => e.source === "ics").length, 0);
  assert.equal((await getStore().list("integrations", uid)).length, 0);
  srv.close();
});
