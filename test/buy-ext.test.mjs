import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

// Load the planner script with just enough of a browser to reach its pure helpers.
const require = createRequire(import.meta.url);
const win = { GOLIB: require("../public/lib.js") };
const ctx = vm.createContext({ window: win, document: { readyState: "complete", getElementById: () => null, addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} }, Date, Math, JSON, String, Number, Object, Array, RegExp, URL });
vm.runInContext(readFileSync(new URL("../public/buy.js", import.meta.url), "utf8"), ctx);
const { extEntries, untilStr, dayMs, instantMs, officialSourceUrl, sourceLinks, sourceChecked } = win.GOBUY;

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const SENDAI = { id: "s", name: "Sendai", eventStart: "2026-11-06", eventEnd: "2026-11-08", registrationStart: "2026-09-11T08:00:00+09:00", registrationEnd: "2026-09-15T07:59:00+09:00", registrationTimeZone: "JST", availability: "unknown", observed: "2026-11-03" };
const MEXICO = { id: "m", name: "Mexico City", eventStart: "2026-11-06", eventEnd: "2026-11-08" };

test("tickets sold elsewhere: registration is not mislabeled as the ticket-sale window", () => {
  const chips = now => extEntries([SENDAI, MEXICO], now).map(r => r.status);
  assert.deepEqual(chips(at(2026, 9, 1)), ["soon", "unknown"]);
  assert.deepEqual(chips(at(2026, 9, 12)), ["open", "unknown"]);
  assert.equal(extEntries([SENDAI], Date.parse("2026-09-15T08:58:00+10:00"))[0].status, "open", "registration remains open before 7:59 am JST");
  assert.equal(extEntries([SENDAI], Date.parse("2026-09-15T09:00:00+10:00"))[0].status, "unknown", "registration closes at the published instant, not midnight");
  assert.deepEqual(chips(at(2026, 10, 20)), ["unknown", "unknown"]);
  assert.match(extEntries([SENDAI], at(2026, 10, 20))[0].chip, /Registration ended 15 Sep JST · ticket availability unconfirmed/);
  assert.deepEqual(chips(at(2026, 11, 8, 23)), ["unknown", "unknown"], "still listed on the last day of the event");
  assert.deepEqual(chips(at(2026, 11, 9, 1)), [], "gone the day after the event");
});

test("sale windows retain their original opening and closing behaviour", () => {
  const sale = { ...MEXICO, saleStart: "2026-09-11", saleEnd: "2026-09-15" };
  assert.equal(extEntries([sale], at(2026, 9, 1))[0].status, "soon");
  assert.equal(extEntries([sale], at(2026, 9, 12))[0].status, "open");
  assert.equal(extEntries([sale], at(2026, 9, 20))[0].status, "closed");
});

test("explicit ticket availability is shown only when recorded", () => {
  assert.equal(extEntries([{...MEXICO, availability:"available"}], at(2026,11,3))[0].chip, "Tickets available");
  assert.equal(extEntries([{...MEXICO, availability:"sold-out"}], at(2026,11,3))[0].status, "closed");
  assert.equal(extEntries([{...MEXICO, availability:"unknown"}], at(2026,11,3))[0].status, "unknown");
});

test("published GO Wild Area records reflect the official source checks on 3 Nov 2026", () => {
  const data = JSON.parse(readFileSync(new URL("../public/tickets-external.json", import.meta.url), "utf8"));
  const rows = extEntries(data.items, at(2026,11,3));
  const sendai = rows.find(r => r.x.id === "wild-area-sendai");
  const mexico = rows.find(r => r.x.id === "wild-area-mexico-city");
  assert.equal(sendai.status, "unknown");
  assert.match(sendai.chip, /Registration ended 15 Sep JST · ticket availability unconfirmed/);
  assert.equal(mexico.status, "open");
  assert.equal(mexico.chip, "Tickets available");
  assert.equal(sendai.x.observed, "2026-11-03");
  assert.equal(mexico.x.observed, "2026-11-03");
});

test("official source links allow only HTTPS Pokémon GO pages and de-duplicate URLs", () => {
  assert.equal(officialSourceUrl("https://pokemongo.com/en/gowildarea"), "https://pokemongo.com/en/gowildarea");
  assert.equal(officialSourceUrl("https://www.pokemongo.com/en/gowildarea"), "https://www.pokemongo.com/en/gowildarea");
  for (const bad of ["http://pokemongo.com/en/gowildarea", "https://pokemongo.com.evil.test/x", "https://pokemongo.com@evil.test/x", "https://evil.test/x", "javascript:alert(1)"]) {
    assert.equal(officialSourceUrl(bad), "");
  }
  const html = sourceLinks({name:"Example",sources:["https://pokemongo.com/en/gowildarea","https://pokemongo.com/en/gowildarea","https://evil.test/"]});
  assert.equal((html.match(/<a\b/g)||[]).length, 1);
  assert.match(html, /Official event details/);
  assert.doesNotMatch(html, /evil\.test/);
});

test("source-check dates must be valid and cannot be in the future", () => {
  assert.match(sourceChecked({observed:"2026-11-03"}, at(2026,11,3)), /Official source checked 3 Nov 2026/);
  assert.equal(sourceChecked({observed:"2026-11-04"}, at(2026,11,3)), "");
  assert.equal(sourceChecked({observed:"2026-02-31"}, at(2026,11,3)), "");
  assert.equal(dayMs("2026-02-31"), null);
  assert.equal(dayMs("2026-11-03"), at(2026,11,3,0));
  assert.equal(instantMs("2026-09-15T07:59:00+09:00"), Date.parse("2026-09-15T07:59:00+09:00"));
  assert.equal(instantMs("2026-09-15T07:59:00"), null);
  assert.equal(instantMs("2026-02-31T07:59:00+09:00"), null);
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
