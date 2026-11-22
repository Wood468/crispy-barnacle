import test from "node:test";
import assert from "node:assert/strict";
import { parseVenueTimes } from "../src/venue-times.js";

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
