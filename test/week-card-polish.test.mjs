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
  assert.match(css, /\.week-day-count\{padding:3px var\(--space-2\)/);
});



function cssRule(source, selector) {
  const start = source.lastIndexOf(selector + "{");
  if (start < 0) return "";
  const end = source.indexOf("}", start);
  return end < 0 ? "" : source.slice(start, end + 1);
}

test("Schedule week strip contains 44px day targets inside its own narrow-screen scroller", () => {
  const weekRule = cssRule(css, ".wk-days ");
  assert.ok(weekRule.includes("overflow-x:auto;"), "the seven-day strip must contain its intrinsic columns instead of widening the page");
  assert.ok(weekRule.includes("width:100%;"));
  assert.ok(weekRule.includes("min-width:0;"));
  assert.ok(weekRule.includes("max-width:100%;"));
  assert.ok(weekRule.includes("overscroll-behavior-x:contain;"));
  const dayRule = cssRule(css, ".wd ");
  assert.ok(dayRule.includes("min-width: 44px;"));
  assert.ok(dayRule.includes("scroll-snap-align:start;"));
});

test("Schedule event-card actions wrap instead of forcing a 412px mobile footer", () => {
  assert.ok(css.includes("@media(max-width:520px){\\n  .week-day-events{min-width:0;max-width:100%}"));
  assert.ok(css.includes(".evc.cmp .evc-foot{\\n    display:flex;\\n    flex-wrap:wrap;"));
  assert.ok(css.includes(".evc.cmp .evc-foot .more{\\n    flex:1 1 6rem;\\n    min-width:44px;"));
  assert.ok(css.includes("min-height:44px;\\n    height:auto;\\n    padding:0 6px;"));
  assert.ok(css.includes(".evc.cmp .evc-foot .star{\\n    flex:0 0 44px;\\n    width:44px;"));
  assert.ok(css.includes("min-width:44px;\\n    min-height:44px;"));
  assert.ok(!css.includes("grid-template-columns:minmax(0,1fr) minmax(0,1fr) 42px"));
});

test("Schedule event headers wrap beside a fixed 44px hide target on narrow screens", () => {
  assert.ok(css.includes("@media(max-width:520px){\\n  .week-day-events{min-width:0;max-width:100%}"));
  assert.ok(css.includes(".evc.cmp{min-width:0;max-width:100%;box-sizing:border-box}"));
  assert.ok(css.includes(".evc.cmp .evc-top{\\n    display:grid;\\n    grid-template-columns:minmax(0,1fr) 44px;"));
  assert.ok(css.includes("grid-template-areas:\"kind hide\" \"count hide\";"));
  assert.ok(css.includes(".evc.cmp .evc-top .cdn{\\n    grid-area:count;\\n    min-width:0;\\n    max-width:100%;\\n    white-space:normal;\\n    overflow-wrap:anywhere;"));
  assert.ok(css.includes(".evc.cmp .evc-top .hide-x{\\n    grid-area:hide;\\n    justify-self:end;\\n    align-self:center;\\n    width:44px;\\n    height:44px;\\n    margin:0;"));
});
