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

test("Today keeps overseas events visible and separates live from later-today regional activity", () => {
  assert.match(dash, /var todayRegional = regList\(\)\.filter\(function \(e\) \{ return e\.start < endDay && e\.end > dayStart; \}\)/);
  assert.match(dash, /var liveRegional = todayRegional\.filter\(function \(e\) \{ return e\.start <= t && e\.end > t; \}\)/);
  assert.match(dash, /var laterRegional = todayRegional\.filter\(function \(e\) \{ return e\.start > t; \}\)/);
  assert.match(dash, /phaseGroup\('Happening now', liveToday\.length \+ liveRegional\.length/);
  assert.match(dash, /phaseGroup\('Later today', laterToday\.length \+ laterRegional\.length/);
  assert.match(dash, /function worldDate\(value, endOfDay\)/);
  assert.match(html, /id="day-inperson-count"/);
  assert.match(html, /<b id="day-inperson-count">0<\/b> in person/); // Batch 1: counts are one text line in the brief
  assert.match(html, /id="today-focus-strip"/);
});

test("regional in-person entries are not suppressed by in-game deduplication", () => {
  const regionalGuard = dash.indexOf("if (x.scope !== 'global') return true;");
  const globalDedupe = dash.indexOf("GODEDUPE.same", regionalGuard);
  assert.ok(regionalGuard >= 0 && globalDedupe > regionalGuard);
});
