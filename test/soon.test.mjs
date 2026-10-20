import test from "node:test";
import assert from "node:assert/strict";
import { startingSoon, messageFor as soonMessage, pending as soonPending, quiet as soonQuiet, melbourneNow } from "../scripts/soon.mjs";
test("starting soon: finds things 10-75 minutes away, once, and keeps quiet at night", () => {
  const data = {
    events: [{ id: "cd", t: "Zorua Community Day", s: "2026-10-10T14:00", e: "2026-10-10T17:00", art: ["Zorua"] }, { id: "gbl", t: "Great League event", s: "2026-10-10T14:30", e: "2026-10-10T17:00" }, { id: "season", t: "Season", s: "2026-10-10T14:00", e: "2026-12-01T10:00" }],
    spotlight: [{ d: "2026-10-10", n: "Elgyem", b: "2x catch Candy" }], raidHour: [{ d: "2026-10-10", n: "Dialga" }],
    rotation: [{ s: "2026-10-10T10:00", five: "Xerneas", mega: "Mega Victreebel", shadow: "Shadow Thundurus, to Oct 6" }],
  };
  const at = t => Date.parse(t + ":00Z");
  assert.deepEqual(startingSoon(data, at("2026-10-10T13:00")).map(i => i.id), ["ev:cd:2026-10-10T14:00"]);
  assert.deepEqual(startingSoon(data, at("2026-10-10T13:55")).map(i => i.id), []);
  assert.deepEqual(startingSoon(data, at("2026-10-10T17:00")).map(i => i.id), ["spot:2026-10-10", "rh:2026-10-10"]);
  const rot = startingSoon(data, at("2026-10-10T09:00"))[0];
  assert.equal(rot.id, "rot:2026-10-10T10:00"); assert.match(soonMessage(rot, at("2026-10-10T09:00")), /5★ Xerneas · Mega Victreebel · Shadow Thundurus/);
  assert.match(soonMessage(startingSoon(data, at("2026-10-10T13:00"))[0], at("2026-10-10T13:00")), /Community Day starts in about an hour \(2pm–5pm\)/);
  assert.equal(soonPending(startingSoon(data, at("2026-10-10T17:00")), { sent: ["rh:2026-10-10"] }).length, 1);
  assert.ok(soonQuiet(at("2026-10-10T23:00")) && soonQuiet(at("2026-10-10T06:00")) && !soonQuiet(at("2026-10-10T17:00")));
  assert.ok(Number.isFinite(melbourneNow()));
});

test("starting soon: messages link straight to the event", () => {
  const data = { events: [{ id: "zorua", t: "Zorua Community Day", s: "2026-10-10T14:00", e: "2026-10-10T17:00" }], raidHour: [{ d: "2026-10-10", n: "Dialga" }] };
  const at = t => Date.parse(t + ":00Z");
  assert.match(soonMessage(startingSoon(data, at("2026-10-10T13:00"))[0], at("2026-10-10T13:00")), /#event=cur%3Azorua$/);
  assert.match(soonMessage(startingSoon(data, at("2026-10-10T17:00"))[0], at("2026-10-10T17:00")), /#event=cur%3Arh-2026-10-10$/);
});
