import test from "node:test";
import assert from "node:assert/strict";
import { wordingFlags } from "../src/lib/content/guardrails.ts";
import { buildPost, CATEGORIES } from "../src/lib/content/templates.ts";

test("risky wording is flagged for review, ordinary property facts are not", () => {
  assert.ok(wordingFlags("Perfect for young families!").length);
  assert.ok(wordingFlags("Great schools nearby in a safe neighborhood").length);
  assert.ok(wordingFlags("The best deal in town, guaranteed").length);
  assert.ok(wordingFlags("Prices are up 12% this year").length);
  assert.equal(wordingFlags("12 Oak Lane, Rockville, MD. $650,000. 4 bd, 3 ba, 2,400 sq ft. Open house Sunday 1 to 3.").length, 0);
});

test("Mila's own templates never produce flagged wording on their own", () => {
  for (const c of CATEGORIES) {
    for (let v = 0; v < 6; v++) {
      const b = buildPost({ category: c.key, platform: "instagram", name: "Sarah", variant: v, market: "Rockville, MD", property: c.needsProperty ? { address: "12 Oak Lane", city: "Rockville", state: "MD", zip: "20850", facts: ["$650,000", "4 bd"], details: [], descriptors: [], fullAddress: "12 Oak Lane, Rockville, MD 20850", placeLine: "Rockville, MD 20850" } : null } as never);
      const text = b.caption + " " + b.slides.map((s) => `${s.headline} ${s.sub ?? ""}`).join(" ");
      assert.deepEqual(wordingFlags(text), [], `${c.key} v${v}: ${text.slice(0, 120)}`);
    }
  }
});
