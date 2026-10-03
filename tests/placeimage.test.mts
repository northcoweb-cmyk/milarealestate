import test from "node:test";
import assert from "node:assert/strict";
import { placeImage } from "../src/lib/server/place-image.ts";
import { googleHint } from "../src/lib/server/google-hints.ts";

process.env.GOOGLE_MAPS_API_KEY = "gk-test";
const real = globalThis.fetch;
const png = () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const mock = (h: (u: URL) => Response) => { globalThis.fetch = (async (url: any, init: any) => { const u = new URL(String(url)); return u.hostname.endsWith("googleapis.com") ? h(u) : real(url, init); }) as typeof fetch; };

test("a house with Street View coverage gets the street photo", async () => {
  mock((u) => u.pathname.endsWith("/metadata") ? json({ status: "OK" }) : u.pathname.endsWith("/streetview") ? png() : json({}, 404));
  const r = await placeImage("123 Main St, Rockville, MD");
  assert.ok(r.ok && r.source === "streetview");
});

test("no Street View coverage falls back to a satellite view of the lot instead of an empty card", async () => {
  mock((u) => u.pathname.endsWith("/metadata") ? json({ status: "ZERO_RESULTS" }) : u.pathname.endsWith("/staticmap") ? png() : json({}, 404));
  const r = await placeImage("1 Rural Rd, Frederick, MD");
  assert.ok(r.ok && r.source === "satellite");
});

test("when Google refuses the key, the reason comes back (not a silent blank) and maps to plain steps", async () => {
  mock(() => json({ status: "REQUEST_DENIED", error_message: "This API project is not authorized to use this API." }));
  const r = await placeImage("123 Main St, Rockville, MD");
  assert.ok(!r.ok && r.status === "REQUEST_DENIED" && /not authorized/.test(r.message));
  assert.match(googleHint("Street View Static API", r.status, r.message) ?? "", /Library → search “Street View Static API” → Enable/);
  assert.match(googleHint("x", "REQUEST_DENIED", "API keys with referer restrictions cannot be used with this API.") ?? "", /Application restrictions” to None/);
  assert.match(googleHint("x", "REQUEST_DENIED", "You must enable Billing on the Google Cloud Project") ?? "", /billing/i);
  assert.equal(googleHint("x", "OK", "fine"), null);
});

test("no key → a clear NO_KEY, never a crash", async () => {
  const k = process.env.GOOGLE_MAPS_API_KEY; delete process.env.GOOGLE_MAPS_API_KEY;
  try { const r = await placeImage("123 Main St"); assert.ok(!r.ok && r.status === "NO_KEY"); } finally { process.env.GOOGLE_MAPS_API_KEY = k; globalThis.fetch = real; }
});
