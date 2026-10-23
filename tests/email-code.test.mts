import test from "node:test";
import assert from "node:assert/strict";
const env = process.env as Record<string, string | undefined>;
env.SESSION_SECRET = "test-secret-for-email-codes";
const { makeChallenge, checkChallenge, emailCodeRequired, codeEmail } = await import("../src/lib/email-code");

test("a fresh code verifies, for that email only, in any letter case", () => {
  const ch = makeChallenge("Dana@Example.com");
  assert.match(ch.code, /^\d{6}$/);
  assert.equal(checkChallenge("dana@example.com", ch.token, ch.code), "ok");
  assert.equal(checkChallenge("someone.else@example.com", ch.token, ch.code), "bad");
});

test("wrong, malformed, tampered and expired codes are refused", () => {
  const ch = makeChallenge("dana@example.com", 1_000_000);
  const wrong = String((Number(ch.code) + 1) % 1_000_000).padStart(6, "0");
  assert.equal(checkChallenge("dana@example.com", ch.token, wrong, 1_000_500), "bad");
  assert.equal(checkChallenge("dana@example.com", ch.token, "12345", 1_000_500), "bad");
  assert.equal(checkChallenge("dana@example.com", ch.token, "abcdef", 1_000_500), "bad");
  assert.equal(checkChallenge("dana@example.com", undefined, ch.code, 1_000_500), "bad");
  const [n, e, s] = ch.token.split(".");
  assert.equal(checkChallenge("dana@example.com", `${n}.${Number(e) + 600_000}.${s}`, ch.code, 1_000_500), "bad", "a stretched expiry breaks the signature");
  assert.equal(checkChallenge("dana@example.com", ch.token, ch.code, 1_000_000 + 10 * 60_000 + 1), "expired");
  assert.equal(checkChallenge("dana@example.com", ch.token, ch.code, 1_000_000 + 10 * 60_000 - 1), "ok");
});

test("every challenge has its own code, and the email shows it", () => {
  const codes = new Set(Array.from({ length: 30 }, () => makeChallenge("dana@example.com").code));
  assert.ok(codes.size > 20);
  const m = codeEmail("123456", "Dana <b>X</b>");
  assert.match(m.subject, /123456/); assert.match(m.text, /123456/); assert.doesNotMatch(m.html, /<b>X/);
});

test("the code is required only where it can work, and can be switched off", () => {
  const was = { k: env.RESEND_API_KEY, r: env.REQUIRE_EMAIL_CODE };
  try {
    delete env.RESEND_API_KEY; delete env.REQUIRE_EMAIL_CODE;
    assert.equal(emailCodeRequired(true), false, "no mail service, no gate (nobody gets locked out)");
    env.RESEND_API_KEY = "re_x";
    assert.equal(emailCodeRequired(true), true);
    assert.equal(emailCodeRequired(false), false, "local dev has no gate");
    env.REQUIRE_EMAIL_CODE = "off";
    assert.equal(emailCodeRequired(true), false);
  } finally { if (was.k === undefined) delete env.RESEND_API_KEY; else env.RESEND_API_KEY = was.k; if (was.r === undefined) delete env.REQUIRE_EMAIL_CODE; else env.REQUIRE_EMAIL_CODE = was.r; }
});
