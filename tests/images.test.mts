import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-img-"));
process.env.MILA_DATA_DIR = dir;
const { isPrivateIp, robotsAllows, assertPublicUrl, FetchBlocked } = await import("../src/lib/images/safe-fetch.ts");
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
