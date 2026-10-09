// A public or commercial place is never quietly saved as someone's home.
import test from "node:test";
import assert from "node:assert/strict";
import { landmarkAsk } from "../src/lib/agent/handlers/location.ts";

test("a landmark asks home, commercial or land, and resends with the answer", () => {
  const out = landmarkAsk("Add a listing at 1100 Congress Ave, Austin, TX 78701, 3 bed 2 bath, $749,000", "1100 Congress Avenue", "Texas State Capitol")!;
  assert.match(out.text, /Texas State Capitol on the map/);
  const btns = (out.blocks[0] as any).buttons;
  assert.equal(btns.length, 3);
  assert.match(btns[1].action.text, /\(it's a commercial property\)$/);
});
test("no question when she already said what it is, or when the map knows no landmark", () => {
  assert.equal(landmarkAsk("Add a commercial listing at 1100 Congress Ave", "1100 Congress Avenue", "Texas State Capitol"), null);
  assert.equal(landmarkAsk("Add a listing at 1100 Congress Ave (it's a home)", "1100 Congress Avenue", "Texas State Capitol"), null);
  assert.equal(landmarkAsk("Add a listing at 12 Oak St", "12 Oak Street", null), null);
});
