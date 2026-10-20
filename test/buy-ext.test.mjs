import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Load the planner script with just enough of a browser to reach its pure helpers (no element on the page, so it does nothing else).
const win = {};
const ctx = vm.createContext({ window: win, document: { readyState: "complete", getElementById: () => null, addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} }, Date, Math, JSON, String, Number, Object, Array, RegExp });
vm.runInContext(readFileSync(new URL("../public/buy.js", import.meta.url), "utf8"), ctx);
const { extEntries, untilStr } = win.GOBUY;

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const SENDAI = { id: "s", name: "Sendai", eventStart: "2026-11-06", eventEnd: "2026-11-08", saleStart: "2026-09-11", saleEnd: "2026-09-15" };
const MEXICO = { id: "m", name: "Mexico City", eventStart: "2026-11-06", eventEnd: "2026-11-08" };

test("tickets sold elsewhere: chip follows the sale window and the entry expires after the event", () => {
  const chips = now => extEntries([SENDAI, MEXICO], now).map(r => r.status);
  assert.deepEqual(chips(at(2026, 9, 1)), ["soon", "unknown"]);
  assert.deepEqual(chips(at(2026, 9, 12)), ["open", "unknown"]);
  assert.deepEqual(chips(at(2026, 10, 20)), ["closed", "unknown"]);
  assert.match(extEntries([SENDAI], at(2026, 10, 20))[0].chip, /Sale closed 15 Sep · check for resale/);
  assert.deepEqual(chips(at(2026, 11, 8, 23)), ["closed", "unknown"], "still listed on the last day of the event");
  assert.deepEqual(chips(at(2026, 11, 9, 1)), [], "gone the day after the event");
});

test("tickets sold elsewhere: sorted by event date, and bad input does not break it", () => {
  const later = { id: "l", name: "Later", eventStart: "2026-12-01", eventEnd: "2026-12-02" };
  const early = { id: "e", name: "Early", eventStart: "2026-11-01", eventEnd: "2026-11-02" };
  assert.deepEqual(extEntries([later, early], at(2026, 10, 20)).map(r => r.x.id), ["e", "l"]);
  assert.equal(extEntries(undefined, Date.now()).length, 0);
  assert.equal(extEntries([{ id: "n", name: "No dates" }], Date.now()).length, 1, "an entry with no dates stays until someone adds eventEnd");
});

test("countdown wording", () => {
  const now = at(2026, 10, 20);
  assert.equal(untilStr(now - 1, now), "Ending now");
  assert.equal(untilStr(now + 30 * 6e4, now), "Ends in under an hour");
  assert.equal(untilStr(now + 4 * 36e5, now), "Ends in about 4 hours");
  assert.equal(untilStr(now + 36e5, now), "Ends in about 1 hour");
  assert.equal(untilStr(now + 5 * 864e5, now), "Ends in about 5 days");
});
