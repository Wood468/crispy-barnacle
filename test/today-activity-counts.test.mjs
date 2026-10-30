import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const LIB = require("../public/lib.js");
const dash = fs.readFileSync(new URL("../public/dash.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("Today live summary separates in-game and in-person activity without dropping overseas events", () => {
  const counts = LIB.liveActivityCounts(
    [{ kind: "raid" }, { kind: "max" }, { kind: "person" }],
    [{ scope: "global" }, { scope: "regional" }, { scope: "regional" }]
  );
  assert.deepEqual(counts, { inGame: 3, inPerson: 3, total: 6 });
});

test("Today keeps live regional events visible in the Happening now group", () => {
  assert.match(dash, /var regionalToday = regList\(\)\.filter\(function \(e\) \{ return e\.start <= t && e\.end > t; \}\)/);
  assert.match(dash, /phaseGroup\('Happening now', liveToday\.length \+ regionalToday\.length/);
  assert.match(html, /id="day-inperson-count"/);
  assert.match(html, /<span>In person<\/span>/);
});
