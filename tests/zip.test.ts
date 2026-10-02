import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeZip } from "../src/lib/content/zip";
import { PALETTES, formatFor, pickTheme } from "../src/lib/content/design";

test("makeZip produces a valid archive with folders and exact contents", async () => {
  const blob = makeZip([
    { name: "01-instagram-just-listed/slide-1.png", data: new Uint8Array([137, 80, 78, 71, 1, 2, 3, 250, 251]) },
    { name: "01-instagram-just-listed/caption.txt", data: new TextEncoder().encode("Just Listed! 🏡") },
  ]);
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  const file = join(dir, "a.zip");
  writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
  try { execFileSync("unzip", ["-tq", file], { stdio: "pipe" }); } catch (e) { assert.fail("unzip rejected the archive: " + (e as Error).message); }
  const caption = execFileSync("unzip", ["-p", file, "01-instagram-just-listed/caption.txt"]).toString("utf8");
  assert.equal(caption, "Just Listed! 🏡");
});

test("every theme picked exists, and platforms get the right image shape", () => {
  for (const c of ["just_listed", "open_house", "price_improvement", "just_sold", "buyer_tip", "personal_brand"]) for (let v = 0; v < 8; v++) assert.ok(PALETTES.some((p) => p.key === pickTheme(c, v)), `${c}/${v}`);
  assert.equal(formatFor("instagram"), "portrait");
  assert.equal(formatFor("tiktok"), "story");
  assert.equal(formatFor("linkedin"), "landscape");
});

import { LAYOUTS, pickLayout } from "../src/lib/content/design";
test("consecutive posts get different layouts, and photo-only layouts need a photo", () => {
  for (const hasPhoto of [false, true]) {
    const seen: string[] = [];
    for (let seed = 0; seed < 12; seed++) { seen.push(pickLayout(hasPhoto, seed)); if (seed) assert.notEqual(seen[seed], seen[seed - 1]); }
    if (!hasPhoto) assert.ok(!seen.includes("cinema"));
    assert.ok(new Set(seen).size >= (hasPhoto ? 9 : 8));
  }
  assert.ok(LAYOUTS.length >= 9);
});
