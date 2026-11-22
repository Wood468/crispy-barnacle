import test from "node:test";
import assert from "node:assert/strict";
import { parseVenueTimes, venueItems, describeVenue } from "../src/venue-times.js";

const parse = clock => parseVenueTimes(`Date: November 10, 2026 Event time: ${clock} GMT`);

test("venue parser rejects out-of-range clock components rather than normalizing them", () => {
  for (const clock of ["12:99 p.m.", "13:00 p.m.", "0:30 a.m.", "11:60 p.m.", "99:00 a.m."]) {
    assert.equal(parse(clock), null, `invalid clock accepted: ${clock}`);
  }
});

test("venue parser retains legitimate 12-hour boundaries and half-hour times", () => {
  assert.equal(parse("12:00 a.m.")?.start, Date.parse("2026-11-10T00:00:00Z"));
  assert.equal(parse("12:00 p.m.")?.start, Date.parse("2026-11-10T12:00:00Z"));
  assert.equal(parse("11:59 p.m.")?.start, Date.parse("2026-11-10T23:59:00Z"));
  assert.equal(parse("7:30 p.m.")?.start, Date.parse("2026-11-10T19:30:00Z"));
});

test("venue parser rejects malformed range endpoints without publishing a partial event", () => {
  for (const clock of ["7:30 p.m. to 12:99 p.m.", "7:30 p.m. to 13:00 p.m.", "7:30 p.m. to 0:30 a.m."]) {
    assert.equal(parse(clock), null, `invalid range accepted: ${clock}`);
  }
});

test("venue parser preserves source timezone offset checks for overseas events", () => {
  const winter = parseVenueTimes("Date: November 10, 2026 Event time: 7:30 p.m. PST");
  assert.equal(winter?.start, Date.parse("2026-11-11T03:30:00Z"));
  assert.equal(parseVenueTimes("Date: November 10, 2026 Event time: 7:30 p.m. PDT"), null);
});

// A malformed three-digit minute field must not be parsed as a valid start-only time.
test("venue parser fails closed when a malformed range cannot match the optional endpoint", () => {
  for (const clock of ["7:30 p.m. to 9:999 p.m.", "7:30 p.m. until 8:123 a.m.", "7:30 p.m. – 9:999 p.m.", "7:30 p.m. TO 9:999 p.m.", "7:30 p.m. UNTIL 9:999 p.m."]) {
    assert.equal(parse(clock), null, `malformed range silently truncated: ${clock}`);
  }
});


test("show-only venue time cannot masquerade as confirmed Pokémon GO gameplay", () => {
  const dateText = "Date: November 10, 2026 Pokémon GO gameplay hours: 7:30 p.m. to 9:999 p.m. Event time: 6:00 p.m. GMT";
  const parsed = parseVenueTimes(dateText);
  assert.equal(parsed?.official, false, "malformed gameplay hours must not become official");
  assert.equal(parsed?.start, Date.parse("2026-11-10T18:00:00Z"), "retain separately valid show time");
  const events = venueItems({events: {"test:show-only": {name:"Pokémon Night Out London", fields:{dates:[{text:dateText}]}, sources:[]}}});
  assert.equal(events.length, 1);
  assert.equal(events[0].unconfirmed, true, "show clock must not be published as confirmed gameplay");
  assert.match(describeVenue(events[0]).note, /not confirmed/i);
});

test("explicit valid gameplay hours remain confirmed and override the show clock", () => {
  const text = "Date: November 10, 2026 Pokémon GO gameplay hours: 7:30 p.m. to 9:00 p.m. Event time: 6:00 p.m. GMT";
  const events = venueItems({events: {"test:gameplay": {name:"Pokémon Night Out London", fields:{dates:[{text}]}, sources:[]}}});
  assert.equal(events.length, 1);
  assert.equal(events[0].ms, Date.parse("2026-11-10T19:30:00Z"));
  assert.equal(events[0].unconfirmed, false);
});
