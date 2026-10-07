import test from "node:test";
import assert from "node:assert/strict";
const env = process.env as Record<string, string | undefined>;
const { codeMatches, requiredCode, codeLocked, recordBadCode, resetCodeLimits } = await import("../src/lib/access-code");

test("production requires the launch code unless SIGNUP_ACCESS_CODE overrides it", () => {
  const was = { n: env.NODE_ENV, c: env.SIGNUP_ACCESS_CODE };
  try {
    env.NODE_ENV = "production"; delete env.SIGNUP_ACCESS_CODE;
    assert.equal(requiredCode(), "3725");
    assert.equal(codeMatches("3725"), true); assert.equal(codeMatches(" 3725 "), true);
    for (const bad of ["", "3724", "37250", undefined, null, 3725, "abcd"]) assert.equal(codeMatches(bad), false, String(bad));
    env.SIGNUP_ACCESS_CODE = "99-open";
    assert.equal(codeMatches("3725"), false); assert.equal(codeMatches("99-open"), true);
  } finally { env.NODE_ENV = was.n; if (was.c === undefined) delete env.SIGNUP_ACCESS_CODE; else env.SIGNUP_ACCESS_CODE = was.c; }
});

test("local development has no gate, so demos and tests keep working", () => {
  const was = { n: env.NODE_ENV, c: env.SIGNUP_ACCESS_CODE };
  try { env.NODE_ENV = "development"; delete env.SIGNUP_ACCESS_CODE; assert.equal(requiredCode(), null); assert.equal(codeMatches("anything"), true); }
  finally { env.NODE_ENV = was.n; if (was.c !== undefined) env.SIGNUP_ACCESS_CODE = was.c; }
});

test("wrong guesses lock a visitor out, then the lock expires", () => {
  resetCodeLimits(); const t = 1_000_000;
  for (let i = 0; i < 5; i++) recordBadCode("1.2.3.4", t);
  assert.equal(codeLocked("1.2.3.4", t), false);
  recordBadCode("1.2.3.4", t);
  assert.equal(codeLocked("1.2.3.4", t), true);
  assert.equal(codeLocked("5.6.7.8", t), false);          // other visitors unaffected
  assert.equal(codeLocked("1.2.3.4", t + 31 * 60_000), false);
  resetCodeLimits();
});

test("a flood of wrong guesses across many visitors locks everyone briefly", () => {
  resetCodeLimits(); const t = 2_000_000;
  for (let i = 0; i < 80; i++) recordBadCode(`9.9.9.${i}`, t);
  assert.equal(codeLocked("1.1.1.1", t), true);
  assert.equal(codeLocked("1.1.1.1", t + 61 * 60_000), false);
  resetCodeLimits();
});
