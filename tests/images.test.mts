import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-img-"));
process.env.MILA_DATA_DIR = dir;
const { isPrivateIp, robotsAllows, assertPublicUrl, FetchBlocked } = await import("../src/lib/images/safe-fetch.ts");
const { extractFromHtml, pullListingPhotos } = await import("../src/lib/images/listing.ts");
const { createTestStore } = await import("../src/lib/db/store.ts");
const store: any = createTestStore(dir, true);

test("SSRF guard rejects private and unusual targets", async () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "0.0.0.0", "100.64.0.1"]) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) assert.ok(!isPrivateIp(ip), ip);
  for (const u of ["http://localhost/x", "http://127.0.0.1/x", "http://[::1]/x", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "ftp://example.com/x", "http://example.com:8080/x", "http://user:pw@example.com/", "http://foo.internal/x"]) {
    await assert.rejects(() => assertPublicUrl(new URL(u)), (e: any) => e instanceof FetchBlocked, u);
  }
});

test("robots.txt rules", () => {
  assert.equal(robotsAllows("User-agent: *\nDisallow: /", "/listing/1"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /private\nAllow: /private/ok", "/private/ok/x"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /private", "/public"), true);
  assert.equal(robotsAllows("User-agent: MilaBot\nDisallow: /\n\nUser-agent: *\nAllow: /", "/x"), false);
  assert.equal(robotsAllows("", "/x"), true);
});

test("extracts og:image, twitter:image and JSON-LD images; skips logos/svg", () => {
  const html = `<html><head>
    <meta property="og:image" content="https://cdn.example.com/a.jpg?x=1&amp;y=2">
    <meta name="twitter:image" content="/b.jpg">
    <meta property="og:image" content="https://cdn.example.com/logo.png">
    <link rel="image_src" href="//cdn.example.com/c.jpg">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SingleFamilyResidence","image":["https://cdn.example.com/d.jpg",{"url":"https://cdn.example.com/e.webp"}],"address":{"streetAddress":"123 Main Street","addressLocality":"Gaithersburg","addressRegion":"MD","postalCode":"20877"}}</script>
    <script type="application/ld+json">{ broken json</script></head></html>`;
  const r = extractFromHtml(html, "https://site.example.com/listing/1");
  assert.deepEqual(r.images, ["https://cdn.example.com/a.jpg?x=1&y=2", "https://site.example.com/b.jpg", "https://cdn.example.com/c.jpg", "https://cdn.example.com/d.jpg", "https://cdn.example.com/e.webp"]);
  assert.equal(r.address?.city, "Gaithersburg");
});

test("end-to-end pull from a local listing page (private fetch enabled for tests only)", async () => {
  process.env.MILA_ALLOW_PRIVATE_FETCH = "1";
  const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(30_000, 7)]);
  const png2 = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(30_000, 9)]);
  const server = http.createServer((req, res) => {
    const u = req.url ?? "/";
    if (u === "/robots.txt") { res.setHeader("content-type", "text/plain"); res.end("User-agent: *\nDisallow: /blocked\n"); return; }
    if (u.startsWith("/listing")) { res.setHeader("content-type", "text/html"); res.end(`<meta property="og:image" content="/p1.png"><meta name="twitter:image" content="/p2.png"><meta property="og:image" content="/p1.png"><script type="application/ld+json">{"@type":"House","address":{"streetAddress":"123 Main Street","addressLocality":"Gaithersburg","addressRegion":"MD","postalCode":"20877"}}</script>`); return; }
    if (u === "/p1.png") { res.setHeader("content-type", "image/png"); res.end(png); return; }
    if (u === "/p2.png") { res.setHeader("content-type", "image/png"); res.end(png2); return; }
    if (u.startsWith("/forbidden")) { res.statusCode = 403; res.end("no"); return; }
    if (u.startsWith("/blocked")) { res.setHeader("content-type", "text/html"); res.end("<meta property=og:image content=/p1.png>"); return; }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const prop = await store.insert("properties", "u1", { address: "123 Main Street", city: null, state: null, zip: null, county: null, list_price: null, beds: null, baths: null, sqft: null, listing_url: null, description: null, verified: false, is_demo: false });
  try {
    const ok = await pullListingPhotos(store, "u1", prop, base + "/listing/1");
    assert.equal(ok.added, 2); assert.equal(ok.filledCity, true);
    const imgs = (await store.list("property_images", "u1")).filter((i: any) => i.property_id === prop.id);
    assert.equal(imgs.length, 2); assert.ok(imgs.every((i: any) => i.source === "listing" && i.url.startsWith("/api/files/")));
    assert.equal((await store.get("properties", "u1", prop.id)).city, "Gaithersburg");
    const again = await pullListingPhotos(store, "u1", (await store.get("properties", "u1", prop.id)), base + "/listing/1");
    assert.equal(again.added, 0, "same photos are not duplicated");
    assert.equal((await pullListingPhotos(store, "u1", prop, base + "/forbidden")).reason, "blocked");
    assert.equal((await pullListingPhotos(store, "u1", prop, base + "/blocked/x")).reason, "robots");
    assert.equal((await pullListingPhotos(store, "u1", prop, "not a url")).reason, "bad_link");
  } finally { server.close(); delete process.env.MILA_ALLOW_PRIVATE_FETCH; }
  // with the test override removed, the same local URL is refused
  const refused = await pullListingPhotos(store, "u1", prop, "http://127.0.0.1:1/listing");
  assert.equal(refused.reason, "bad_link");
});
