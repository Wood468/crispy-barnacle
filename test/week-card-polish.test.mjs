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
  const mobileStart = css.indexOf("@media(max-width:520px){\n  .evc.cmp .evc-foot{");
  assert.notEqual(mobileStart, -1, "the compact footer override must be scoped to mobile");
  const mobileEnd = css.indexOf("\n}\n", mobileStart);
  const mobile = css.slice(mobileStart, mobileEnd + 3);
  const footer = cssRule(mobile, ".evc.cmp .evc-foot");
  const more = cssRule(mobile, ".evc.cmp .evc-foot .more");
  const star = cssRule(mobile, ".evc.cmp .evc-foot .star");
  assert.ok(footer.includes("display:flex;") && footer.includes("flex-wrap:wrap;"));
  assert.ok(more.includes("flex:1 1 6rem;") && more.includes("min-width:44px;") && more.includes("min-height:44px;") && more.includes("white-space:normal;"));
  assert.ok(star.includes("flex:0 0 44px;") && star.includes("width:44px;") && star.includes("min-width:44px;") && star.includes("min-height:44px;"));
  assert.ok(!mobile.includes("grid-template-columns:minmax(0,1fr) minmax(0,1fr) 42px"));
});


test("Schedule event headers wrap beside a fixed 44px hide target on narrow screens", () => {
  const mobileStart = css.indexOf("@media(max-width:520px){" + String.fromCharCode(10) + "  .week-day-events{");
  assert.notEqual(mobileStart, -1, "narrow Schedule card constraints must be scoped to mobile");
  const mobileEnd = css.indexOf(String.fromCharCode(10) + "}" + String.fromCharCode(10), mobileStart);
  const mobile = css.slice(mobileStart, mobileEnd + 3);
  const days = cssRule(mobile, ".week-day-events");
  const card = cssRule(mobile, ".evc.cmp");
  const top = cssRule(mobile, ".evc.cmp .evc-top");
  const countdown = cssRule(mobile, ".evc.cmp .evc-top .cdn");
  const hide = cssRule(mobile, ".evc.cmp .evc-top .hide-x");
  assert.ok(days.includes("min-width:0;") && days.includes("max-width:100%;"));
  assert.ok(card.includes("min-width:0;") && card.includes("max-width:100%;"));
  assert.ok(top.includes("display:grid;") && top.includes("grid-template-columns:minmax(0,1fr) 44px;") && top.includes("min-width:0;"));
  assert.ok(countdown.includes("white-space:normal;") && countdown.includes("overflow-wrap:anywhere;"));
  assert.ok(hide.includes("width:44px;") && hide.includes("height:44px;") && hide.includes("margin:0;"));
});
