import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { deriveCompleteness } from "../scripts/store-watch.mjs";

// Contract: the evidence the real Python producer emits must be accepted by the Node validator.
test("store_snapshot.py evidence block validates against the observed items", () => {
  const out = execFileSync("python3", ["-I", "-c",
    "import sys,json;sys.path.insert(0,'scripts');import store_snapshot as S;" +
    "print(json.dumps(S.build_completeness(passes=3,stable_passes=2,max_passes=20,sections=[{'name':'ITEMS','count':2},{'name':'POKECOINS','count':1}])))"],
    { encoding: "utf8" });
  const items = ["ITEMS", "ITEMS", "POKECOINS"].map((section, n) => ({ section, name: "P" + n, price: "A$1.00", href: "/purchase/item/p" + n }));
  assert.equal(deriveCompleteness({ items, completeness: JSON.parse(out) }).complete, true);
  assert.equal(deriveCompleteness({ items: items.slice(1), completeness: JSON.parse(out) }).complete, false);
});
