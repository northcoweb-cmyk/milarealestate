// An email ends with one closing and one signature, however the draft was written.
import test from "node:test";
import assert from "node:assert/strict";
import { finishEmailBody } from "../src/lib/signature.ts";

const me = { full_name: "Admin Tester", role: "Agent", brokerage: "Keller Williams" } as never;
const count = (s: string, w: string) => s.split(w).length - 1;

test("the model's own sign-off plus a repeated name collapses to one", () => {
  const out = finishEmailBody("Hi Dana,\n\nThanks for coming by.\n\nWarmly,\nAdmin Tester\nKeller Williams\nAdmin Tester", me);
  assert.equal(count(out, "Admin Tester"), 1);
  assert.equal(count(out, "Keller Williams"), 1);
  assert.match(out, /Warmly,\nAdmin Tester\nKeller Williams$/);
});

test("a body with no sign-off gets a closing and the signature", () => {
  const out = finishEmailBody("Hi Dana,\n\nThanks for coming by.", me);
  assert.match(out, /Thanks for coming by\.\n\nBest,\nAdmin Tester\nKeller Williams$/);
});

test("a name written alone at the end is not doubled", () => {
  const out = finishEmailBody("Hi Dana,\n\nSee you Friday.\n\nAdmin Tester", me);
  assert.equal(count(out, "Admin Tester"), 1);
});

test("text in the middle that mentions the name is left alone", () => {
  const out = finishEmailBody("Hi Dana,\n\nAdmin Tester here with your update.\n\nCheers,\nAdmin Tester", me);
  assert.equal(count(out, "Admin Tester"), 2);
  assert.match(out, /^Hi Dana,\n\nAdmin Tester here/);
});
