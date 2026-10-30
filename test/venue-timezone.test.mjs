import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseVenueTimes, describeVenue, venueFor, venueItems } from "../src/venue-times.js";

const LA = "Date: October 24, 2026 Location: Intuit Dome, Los Angeles, USA Night Out show starts: 7:30 p.m. PDT (unconfirmed for Pokémon GO) Doors open: 6:00 p.m. PDT End time: To be announced";

test("venue source clock is converted with its IANA zone and DST offset", () => {
  const parsed = parseVenueTimes(LA);
  assert.ok(parsed);
  assert.equal(parsed.start, Date.parse("2026-10-25T02:30:00.000Z"));
  assert.equal(parsed.zone, "PDT");
  assert.equal(parsed.timeZone, "America/Los_Angeles");
  assert.equal(parsed.official, false);
});

test("daylight abbreviation must agree with the venue zone on the event date", () => {
  const standard = parseVenueTimes("Date: November 10, 2026 Event time: 7:30 p.m. PST");
  assert.equal(standard.start, Date.parse("2026-11-11T03:30:00.000Z"));
  assert.equal(standard.timeZone, "America/Los_Angeles");
  assert.equal(parseVenueTimes("Date: November 10, 2026 Event time: 7:30 p.m. PDT"), null,
    "a stale daylight abbreviation is rejected instead of silently using the wrong offset");
});

test("viewer and venue clocks can fall on different calendar days", () => {
  const parsed = parseVenueTimes(LA);
  const item = { ...parsed, ms: parsed.start, endMs: parsed.end };
  const melbourne = describeVenue(item, "Australia/Melbourne");
  assert.match(melbourne.venueDay, /24 Oct/);
  assert.match(melbourne.venueShow, /7:30 pm/i);
  assert.match(melbourne.day, /25 Oct/);
  assert.match(melbourne.show, /1:30 pm/i);
  assert.equal(melbourne.timeZone, "America/Los_Angeles");

  const tokyo = describeVenue(item, "Asia/Tokyo");
  assert.match(tokyo.day, /25 Oct/);
  assert.match(tokyo.show, /11:30 am/i);
});

test("venue matching uses viewer-local dates and tolerates a one-day timezone boundary", () => {
  const parsed = parseVenueTimes(LA);
  const item = { ...parsed, id: "v:la", name: "Pokémon Night Out 2026 - Los Angeles", ms: parsed.start };
  assert.equal(venueFor(item.name, "2026-10-25", "2026-10-25", [item], "Australia/Melbourne").length, 1);
  assert.equal(venueFor(item.name, "2026-10-27", "2026-10-27", [item], "Australia/Melbourne").length, 0);
});

test("reviewed manual venue time keeps its unconfirmed label and UTC zone", () => {
  const details = { events: {
    "leekduck:pokemon-night-out-london-2026": {
      name: "Pokémon Night Out 2026 - London",
      fields: { dates: [] },
      sources: [{ url: "https://leekduck.com/events/pokemon-night-out-london-2026/" }]
    }
  } };
  const [item] = venueItems(details);
  assert.equal(item.timeZone, "Etc/UTC");
  assert.equal(item.zone, "GMT");
  assert.equal(item.unconfirmed, true);
  assert.equal(item.ms, Date.parse("2026-11-10T18:00:00.000Z"));
});

test("Today and event details request viewer-local venue times and display the venue clock", () => {
  const dash = fs.readFileSync(new URL("../public/dash.js", import.meta.url), "utf8");
  const detail = fs.readFileSync(new URL("../public/detail.js", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(dash, /\/api\/venue-times\?all=1&tz=/);
  assert.match(dash, /Venue: .*venueDay/);
  assert.match(detail, /function venueTimeQuery\(\)/);
  assert.match(detail, /venueTimeLabel\(i\)/);
  assert.match(worker, /function venueViewerTimeZone\(url\)/);
  assert.match(worker, /describeVenue\(v, viewerTimeZone\)/);
});
