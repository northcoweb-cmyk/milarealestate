import test from "node:test";
import assert from "node:assert/strict";
import { codeSwitchedOff, requiredCode } from "../src/lib/access-code.ts";
import { seatCap, seatsLeft } from "../src/lib/seats.ts";

test("the access code switches off at 8:00 AM Eastern on launch day and not a minute before", () => {
  delete process.env.ACCESS_CODE_OFF_AT;
  assert.equal(codeSwitchedOff(new Date("2026-10-20T07:59:00-04:00").getTime()), false);
  assert.equal(codeSwitchedOff(new Date("2026-10-20T08:00:00-04:00").getTime()), true);
  process.env.ACCESS_CODE_OFF_AT = "never";
  assert.equal(codeSwitchedOff(new Date("2030-01-01T00:00:00Z").getTime()), false);
  delete process.env.ACCESS_CODE_OFF_AT;
});

test("seat cap defaults to 25 and counts only real accounts", async () => {
  delete process.env.SEAT_CAP;
  assert.equal(seatCap(), 25);
  process.env.SEAT_CAP = "0";
  assert.equal((await seatsLeft()).open, false);
  delete process.env.SEAT_CAP;
  void requiredCode;
});
