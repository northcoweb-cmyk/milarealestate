import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PublicSky } from "../src/components/public-sky";

// Regression (Oct 16): Sky read the app context unconditionally, so every signed-out page that shows the sky
// (/welcome, /claim, /onboarding) returned HTTP 500 "useApp outside provider" and nobody could sign in.
test("the sky renders on signed-out pages, with no AppProvider", () => {
  const html = renderToString(createElement(PublicSky));
  assert.ok(html.length > 0);
});
