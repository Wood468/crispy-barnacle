import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const dash = fs.readFileSync(new URL("../public/dash.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../public/dash.css", import.meta.url), "utf8");

test("This Week uses its own compact event-card variant without changing other views", () => {
  assert.match(dash, /group\.events\.map\(function \(e\) \{ return card\(e, \{ week: true \}\); \}\)/);
  assert.match(dash, /var week = !!opt\.week/);
  assert.match(dash, /week \? ' week-card' : ''/);
  assert.match(css, /\.week-day-events>\.week-card/);
});

test("This Week cards keep their primary actions thumb-sized and readable", () => {
  assert.match(css, /\.week-day-events>\.week-card\.evc\.cmp \.evc-foot \.more\{min-height:44px/);
  assert.match(css, /\.week-day-events>\.week-card\.evc\.cmp \.evc-foot \.star\{[^}]*min-height:44px/);
  assert.match(css, /\.week-day-events>\.week-card \.evc-title-row h3\{font-size:1\.28rem/);
  assert.match(css, /\.week-day-count\{padding:3px 8px/);
});
