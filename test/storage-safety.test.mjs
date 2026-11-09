import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const LIB = createRequire(import.meta.url)("../public/lib.js");

function store(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: k => (data.has(k) ? data.get(k) : null), setItem(k, v) { data.set(k, String(v)); } };
}
test("readJsonKeep parses good data and treats absence as empty, not corrupt", () => {
  assert.deepEqual(LIB.readJsonKeep(store({ k: '{"a":1}' }), "k"), { value: { a: 1 }, corrupt: false, unreadable: false, kept: false });
  assert.equal(LIB.readJsonKeep(store(), "k").corrupt, false);
});
test("readJsonKeep keeps a copy of corrupt Collection data instead of losing it", () => {
  const s = store({ "gofn-dex-v1": "{not json" });
  const r = LIB.readJsonKeep(s, "gofn-dex-v1");
  assert.equal(r.corrupt, true); assert.equal(r.kept, true); assert.equal(r.value, null);
  assert.equal(s.data.get("gofn-dex-v1"), "{not json", "original is untouched");
  assert.equal(s.data.get("gofn-dex-v1-corrupt"), "{not json");
  const again = LIB.readJsonKeep(s, "gofn-dex-v1");
  assert.equal(again.kept, true);
  assert.equal([...s.data.keys()].filter(k => k.includes("-corrupt")).length, 1, "same copy is not duplicated");
});
test("readJsonKeep reports kept:false when the copy cannot be written, and unreadable storage", () => {
  const s = store({ k: "oops" });
  s.setItem = () => { throw new DOMException("full", "QuotaExceededError"); };
  assert.equal(LIB.readJsonKeep(s, "k").kept, false);
  const blocked = { getItem() { throw new DOMException("no", "SecurityError"); } };
  assert.equal(LIB.readJsonKeep(blocked, "k").unreadable, true);
});
