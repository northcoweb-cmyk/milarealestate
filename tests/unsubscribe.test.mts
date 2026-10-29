import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// A stand-in for the database: one profile that carries a win-back token.
const T = "a".repeat(40);
const profile = { id: "11111111-1111-1111-1111-111111111111", settings: { lapsed: { token: T }, keep: 1 } as Record<string, any> };
let seen = "";
const srv = http.createServer((req, res) => {
  seen = req.url ?? "";
  if (req.method === "GET") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(seen.includes(`token=eq.${T}`) ? [profile] : [])); return; }
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { profile.settings = JSON.parse(b).settings; res.end("[]"); });
});

test("unsubscribe link opts the person out, keeps the rest of settings, and rejects bad tokens", async () => {
  await new Promise<void>((r) => srv.listen(0, r));
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${(srv.address() as any).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
  const { GET } = await import("../src/app/api/unsubscribe/route.ts");
  const bad = await GET(new Request("https://x.test/api/unsubscribe?t=nope"));
  assert.equal(bad.status, 404);
  const miss = await GET(new Request(`https://x.test/api/unsubscribe?t=${"b".repeat(40)}`));
  assert.equal(miss.status, 404);
  const ok = await GET(new Request(`https://x.test/api/unsubscribe?t=${T}`));
  assert.equal(ok.status, 200);
  assert.equal(profile.settings.lapsed.optout, true);
  assert.equal(profile.settings.keep, 1);
  srv.close();
});
