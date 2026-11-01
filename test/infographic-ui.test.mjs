// Behaviour of public/infographic.js (card buttons, refresh, recheck) run against a tiny fake DOM, no browser needed.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const code = readFileSync(new URL("../public/infographic.js", import.meta.url), "utf8");
const GODEDUPE = createRequire(import.meta.url)("../public/dedupe.js");

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this._text = ""; this.cls = new Set(); this.hidden = false; this.disabled = false; this.style = {}; this.title = ""; this.on = {};
    const self = this; this.classList = { add: (...c) => c.forEach((x) => self.cls.add(x)), remove: (...c) => c.forEach((x) => self.cls.delete(x)), contains: (c) => self.cls.has(c), toggle: (c, f) => (f ? self.cls.add(c) : self.cls.delete(c)) }; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; } hasAttribute(k) { return k in this.attrs; }
  set src(v) { this.attrs.src = v; } get src() { return this.attrs.src; }
  set id(v) { this.attrs.id = v; } get id() { return this.attrs.id; }
  set textContent(v) { this.children = []; this._text = String(v); } get textContent() { return this._text; }
  set innerHTML(v) { this.children = []; this._text = ""; }
  appendChild(c) { this.children.push(c); return c; }
  querySelector(sel) {
    if (sel === "img") return this.children.find((c) => c.tag === "img") || null;
    const m = /^img\[([\w-]+)\]$/.exec(sel);
    return m ? this.children.find((c) => c.tag === "img" && c.hasAttribute(m[1])) || null : null;
  }
  addEventListener(t, f) { this.on[t] = f; }
  closest(sel) { const m = /^\[([\w-]+)\]$/.exec(sel); return m && this.hasAttribute(m[1]) ? this : null; }
}

function setup({ events, info }) {
  const buttons = [], docListeners = {}, timers = [];
  let live = null, fetches = 0;
  const net = { info, failMs: -1 };                       // what /event-info.json answers: object | "500" | "throw" | "badjson"
  const document = {
    hidden: false, body: { style: {}, appendChild: (c) => { if (c.id === "iglive") live = c; return c; } },
    querySelectorAll: () => buttons.filter((b) => b.hasAttribute("data-infographic") || b.hasAttribute("data-igcard")),
    getElementById: (id) => (id === "iglive" ? live : null), createElement: (t) => new El(t),
    addEventListener: (t, f) => { docListeners[t] = f; },
  };
  const fetch = (url) => {
    if (/event-info/.test(url)) {
      fetches++;
      if (net.info === "throw") return Promise.reject(new Error("offline"));
      if (net.info === "500") return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      if (net.info === "badjson") return Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("bad")) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(net.info) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  };
  const X = { events: () => events, raidSlots: () => [], kindOf: () => ["Event", "#000", "#fff"], whenText: () => "", countdown: () => "" };
  const window = { GODASH: X, GO: { esc: (s) => String(s), art: () => "", bonusChip: () => "" }, GODEDUPE };
  window.window = window;
  const ctx = vm.createContext({ window, GODEDUPE, document, fetch, console, Promise, setTimeout: (f, ms) => { if (ms === net.failMs) throw new Error("timer failed"); timers.push({ f, ms, dead: false, ran: false }); return timers.length; }, clearTimeout: (n) => { if (timers[n - 1]) timers[n - 1].dead = true; } });
  const runTimers = (ms) => timers.forEach((t) => { if (!t.dead && !t.ran && (ms == null || t.ms === ms)) { t.ran = true; t.f(); } });
  vm.runInContext(code, ctx);
  const card = (id) => { const b = new El("button"); b.setAttribute("data-igcard", id); buttons.push(b); return b; };
  return { card, docListeners, timers, runTimers, net, get live() { return live; }, get fetches() { return fetches; }, click: (b) => docListeners.click({ target: b, preventDefault() {}, stopPropagation() {} }), refresh: () => docListeners.visibilitychange() };
}
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };
const day = (n) => new Date(Date.UTC(2026, 10, n));
const withPic = { events: { a: { names: ["Alpha"], infographics: [{ url: "https://example.com/a.jpg", label: "A" }] } } };

async function loaded(extra = {}) {
  const t = setup({ events: [{ id: "a", name: "Alpha", start: day(1), end: day(2) }, { id: "b", name: "Beta", start: day(3), end: day(4) }], info: withPic, ...extra });
  const a = t.card("a"), b = t.card("b");
  await settle(); // the observer-less first sync runs after the first load
  t.docListeners.visibilitychange && t.refresh(); await settle();
  return { t, a, b };
}

test("loadInfo(true): a failed refresh keeps the pictures already loaded", async () => {
  for (const bad of ["500", "throw", "badjson", { nothing: 1 }]) {
    const { t, a } = await loaded();
    assert.ok(a.classList.contains("igthumb"), "starts as a thumbnail");
    t.net.info = bad; const before = t.fetches;
    t.refresh(); await settle();
    assert.ok(t.fetches > before, "the refresh really ran: " + JSON.stringify(bad));
    assert.ok(a.classList.contains("igthumb") && !a.classList.contains("igcheck"), "thumbnail survives a bad refresh: " + JSON.stringify(bad));
  }
});

test("a good refresh still replaces what is loaded", async () => {
  const { t, a } = await loaded();
  t.net.info = { events: {} }; t.refresh(); await settle();
  assert.ok(a.classList.contains("igcheck"), "an empty but valid file is believed");
});

test("a thumbnail that cannot load turns into Check infographic, once", async () => {
  const { t, a } = await loaded();
  const img = a.querySelector("img"); assert.ok(img && img.on.error);
  img.on.error();
  assert.ok(a.classList.contains("igcheck") && !a.classList.contains("igthumb"));
  assert.equal(a.textContent, "Check infographic");
  assert.equal(a.querySelector("img"), null);
  t.refresh(); await settle();                // a later sync must not put the broken picture back
  assert.ok(a.classList.contains("igcheck") && a.querySelector("img") === null);
});

test("a late error from a thumbnail that was already replaced does not break the new one", async () => {
  const { t, a } = await loaded();
  const old = a.querySelector("img");
  t.net.info = { events: { a: { names: ["Alpha"], infographics: [{ url: "https://example.com/a2.jpg", label: "A" }] } } };
  t.refresh(); await settle();
  const fresh = a.querySelector("img");
  assert.ok(fresh && fresh !== old && fresh.getAttribute("src") === "https://example.com/a2.jpg", "thumbnail was replaced");
  old.on.error();                             // the first picture reports its failure after being replaced
  assert.ok(a.classList.contains("igthumb") && !a.classList.contains("igcheck"), "working thumbnail stays");
  assert.equal(a.querySelector("img"), fresh);
  assert.equal(a.getAttribute("data-igbad"), null);
  fresh.on.error();                           // the current picture failing still falls back
  assert.ok(a.classList.contains("igcheck"));
});

test("Check infographic: keeps button semantics, announces separately, resets on re-tap, ignores taps while checking", async () => {
  const { t, b } = await loaded();
  assert.ok(t.live && t.live.getAttribute("role") === "status" && t.live.getAttribute("aria-live") === "polite", "live region exists from startup, before any message");
  assert.equal(t.live.textContent, "");
  assert.equal(b.getAttribute("data-igcheck"), "b");
  const before = t.fetches;
  t.click(b); t.click(b);                      // second tap while the first check is in flight
  assert.equal(b.textContent, "Checking…");
  await settle();
  assert.equal(t.fetches - before, 1, "one network check only");
  assert.equal(b.textContent, "No infographic found yet");
  assert.equal(b.getAttribute("role"), null, "button role is not replaced");
  assert.equal(t.live.textContent, "", "the message is set on a later tick, after the region was cleared");
  t.runTimers(50);
  assert.equal(t.live.textContent, "No infographic found yet");
  const resetTimer = t.timers.find((x) => x.ms === 3500); assert.ok(resetTimer && !resetTimer.dead);
  t.click(b);                                  // tap during the message: old timer cancelled; the next result clears the region first so the same text is read again
  assert.ok(resetTimer.dead, "old reset timer really cancelled");
  await settle();
  assert.equal(t.live.textContent, "", "the region is emptied before the identical message is set again (fails if announce() stops clearing)");
  t.runTimers(50);
  assert.equal(t.live.textContent, "No infographic found yet", "an identical message is announced again");
  assert.equal(b.textContent, "No infographic found yet");
  const ranBefore = t.timers.filter((x) => x.ran && x.ms === 3500).length; t.runTimers(3500); // fires every timer that is still alive: the cancelled one must not, so only the new one runs
  assert.equal(t.timers.filter((x) => x.ran && x.ms === 3500).length - ranBefore, 1, "only the new reset timer fired");
  assert.ok(!resetTimer.ran);
  assert.equal(b.textContent, "Check infographic");
  assert.equal(b.getAttribute("data-igmsg"), null);
  assert.equal(t.live.textContent, "", "after the reset the stale message is gone from the live region");
});

test("Check infographic: one button's reset timer or re-tap never drops another button's announcement", async () => {
  const { t, a, b } = await loaded({ info: { events: {} } });
  assert.ok(a.classList.contains("igcheck") && b.classList.contains("igcheck"));
  t.click(a); await settle(); t.runTimers(50);
  assert.equal(t.live.textContent, "No infographic found yet");
  const aReset = t.timers.find((x) => x.ms === 3500 && !x.dead && !x.ran); assert.ok(aReset);
  t.click(b); await settle();                  // B's check ends: its announcement is pending (50 ms tick not run yet)
  assert.equal(b.textContent, "No infographic found yet");
  const pending = t.timers.filter((x) => x.ms === 50 && !x.ran && !x.dead);
  assert.equal(pending.length, 1, "B's announcement is pending");
  aReset.ran = true; aReset.f();               // A's reset fires now
  assert.equal(a.textContent, "Check infographic", "A resets its own text");
  assert.ok(!pending[0].dead, "A's reset did not cancel B's pending announcement");
  t.runTimers(50);
  assert.equal(t.live.textContent, "No infographic found yet", "B's message reached the live region");
  // Re-tapping A while B's message is pending does not cancel it either.
  t.click(b); await settle();
  const pendingB = t.timers.filter((x) => x.ms === 50 && !x.ran && !x.dead);
  assert.equal(pendingB.length, 1);
  t.click(a);                                  // a is idle: starts a new check; nothing is announced or cancelled yet
  assert.ok(!pendingB[0].dead, "starting another button's check leaves a pending announcement alone");
  await settle();                              // A's check ends: the latest announce() wins and replaces B's pending one
  assert.ok(pendingB[0].dead, "A's finished check supersedes B's pending announcement");
  const pendingA = t.timers.filter((x) => x.ms === 50 && !x.ran && !x.dead);
  assert.equal(pendingA.length, 1, "exactly one announcement is pending, nothing stuck");
  t.runTimers(50);
  assert.equal(t.live.textContent, "No infographic found yet");
  t.runTimers(3500);                           // every reset fires: the last announcer's clears the region
  assert.equal(t.live.textContent, "", "nothing is left stuck in the live region");
  assert.equal(a.textContent, "Check infographic");
  assert.equal(b.textContent, "Check infographic");
});

test("Check infographic: a reset clears the region only for the button whose message is there", async () => {
  const { t, a, b } = await loaded({ info: { events: {} } });
  t.click(a); await settle(); t.runTimers(50);
  const aReset = t.timers.find((x) => x.ms === 3500 && !x.dead && !x.ran);
  t.click(b); await settle(); t.runTimers(50);   // B's identical text is now in the region
  const bReset = t.timers.find((x) => x.ms === 3500 && !x.dead && !x.ran && x !== aReset);
  aReset.ran = true; aReset.f();
  assert.equal(a.textContent, "Check infographic");
  assert.equal(t.live.textContent, "No infographic found yet", "A's reset leaves B's current message alone");
  t.click(a); await settle();                    // A announces again: pending, region empty
  const aReset2 = t.timers.find((x) => x.ms === 3500 && !x.dead && !x.ran && x !== bReset);
  bReset.ran = true; bReset.f();
  const pending = t.timers.filter((x) => x.ms === 50 && !x.ran && !x.dead);
  assert.equal(pending.length, 1, "B's reset did not cancel A's pending announcement");
  t.runTimers(50);
  assert.equal(t.live.textContent, "No infographic found yet", "A's message still arrives");
  aReset2.ran = true; aReset2.f();
  assert.equal(t.live.textContent, "", "A's own reset clears it");
});

// ---- re-tap during "No infographic found yet": the button's own announcement must not outlive its cancelled reset timer ----
const withPicB = { events: { b: { names: ["Beta"], infographics: [{ url: "https://example.com/b.jpg", label: "B" }] } } };
const NOPE = "No infographic found yet";

test("re-tap during the message, then the check finds a picture: the live region ends empty", async () => {
  const { t, b } = await loaded({ info: { events: {} } });
  t.click(b); await settle(); t.runTimers(50);
  assert.equal(t.live.textContent, NOPE);
  const reset = t.timers.find((x) => x.ms === 3500 && !x.dead && !x.ran);
  t.net.info = withPicB;                         // the picture has been published meanwhile
  t.click(b); assert.ok(reset.dead, "the reset timer was cancelled");
  await settle(); t.runTimers(50);
  assert.equal(t.live.textContent, "", "no stale message left with nobody to clear it");
  t.runTimers(3500);
  assert.equal(t.live.textContent, "");
});

test("re-tap during the message, then the check errors: the live region ends empty", async () => {
  const events = [{ id: "a", name: "Alpha", start: day(1), end: day(2) }, { id: "b", name: "Beta", start: day(3), end: day(4) }];
  let boom = false;
  Object.defineProperty(events, Symbol.isConcatSpreadable, { get() { if (boom) throw new Error("boom"); return true; } });
  const t = setup({ events, info: { events: {} } });
  t.card("a"); const b = t.card("b"); await settle();
  t.click(b); await settle(); t.runTimers(50);
  assert.equal(t.live.textContent, NOPE);
  boom = true; t.click(b); await settle(); t.runTimers(50);
  assert.equal(b.textContent, "Check infographic", "the error path resets the button");
  assert.equal(b.getAttribute("data-igbusy"), null);
  assert.equal(t.live.textContent, "", "no stale message after the error");
});

test("the start of a re-tap empties the button's own message at once (landed or still pending)", async () => {
  const { t, b } = await loaded({ info: { events: {} } });
  t.click(b); await settle(); t.runTimers(50);
  assert.equal(t.live.textContent, NOPE);
  t.click(b);                                    // check still in flight (no await): the region must already be empty
  assert.equal(t.live.textContent, "", "landed message released at the start of the re-tap");
  await settle(); t.runTimers(50); t.runTimers(3500);
  assert.equal(t.live.textContent, "");
  t.click(b); await settle();                    // new announcement pending
  const pending = t.timers.filter((x) => x.ms === 50 && !x.ran && !x.dead); assert.equal(pending.length, 1);
  t.click(b);                                    // check still in flight: the pending message is cancelled, not left to land
  assert.ok(pending[0].dead, "own pending announcement cancelled at the start of the re-tap");
  t.runTimers(50);
  assert.equal(t.live.textContent, "", "cancelled message never lands while the check runs");
});

test("narrow window: the check ends within 50 ms of a re-tap (found): the live region ends empty", async () => {
  const { t, b } = await loaded({ info: { events: {} } });
  t.click(b); await settle();                    // announcement pending, 50 ms tick not run yet
  t.net.info = withPicB;
  t.click(b); await settle();                    // re-tap; the check finds a picture inside the 50 ms window
  t.runTimers(50);
  assert.equal(t.live.textContent, "", "no stale 'No infographic found yet' with nobody to clear it");
  t.runTimers(3500);
  assert.equal(t.live.textContent, "");
});

test("narrow window: the check errors within 50 ms of a re-tap: the live region ends empty", async () => {
  const events = [{ id: "a", name: "Alpha", start: day(1), end: day(2) }, { id: "b", name: "Beta", start: day(3), end: day(4) }];
  let boom = false;
  Object.defineProperty(events, Symbol.isConcatSpreadable, { get() { if (boom) throw new Error("boom"); return true; } });
  const t = setup({ events, info: { events: {} } });
  t.card("a"); const b = t.card("b"); await settle();
  t.click(b); await settle();                    // pending
  boom = true; t.click(b); await settle(); t.runTimers(50);
  assert.equal(b.textContent, "Check infographic");
  assert.equal(t.live.textContent, "");
});

test("the catch path releases a message the button had just announced", async () => {
  const { t, b } = await loaded({ info: { events: {} } });
  t.net.failMs = 3500;                           // the failure comes after announce(): the region holds this button's NEW message
  t.click(b); await settle();
  assert.equal(b.textContent, "Check infographic", "the error path resets the button");
  assert.equal(b.getAttribute("data-igbusy"), null);
  assert.equal(b._igToken, 0, "token released");
  assert.equal(b.getAttribute("data-igmsg"), null, "the message flag is cleared so syncButtons can reset the text");
  t.runTimers(50);
  assert.equal(t.live.textContent, "", "fails if the catch path does not release its own message");
});

test("a repeated identical message is still read again, and taps during a check are ignored", async () => {
  const { t, b } = await loaded({ info: { events: {} } });
  t.click(b); await settle(); t.runTimers(50);
  assert.equal(t.live.textContent, NOPE);
  const before = t.fetches;
  t.click(b);
  assert.equal(t.live.textContent, "", "the re-tap empties the old message at once (releaseOwn), before any new announce");
  t.click(b); await settle();
  assert.equal(t.fetches - before, 1, "second tap during the check ignored");
  assert.equal(t.live.textContent, "", "still empty until the new text lands");
  t.runTimers(50);
  assert.equal(t.live.textContent, NOPE);
});

test("two buttons: A's re-tap and A's found/clear never clear or cancel B's current or pending message", async () => {
  const { t, a, b } = await loaded({ info: { events: {} } });
  t.click(a); await settle(); t.runTimers(50);
  t.click(b); await settle();                    // B's announcement is pending
  const pendingB = t.timers.filter((x) => x.ms === 50 && !x.ran && !x.dead);
  assert.equal(pendingB.length, 1);
  t.net.info = { events: { a: { names: ["Alpha"], infographics: [{ url: "https://example.com/a.jpg", label: "A" }] } } };
  t.click(a);                                    // A re-taps (its reset timer is cancelled): B's pending message stays
  assert.ok(!pendingB[0].dead, "A's re-tap did not cancel B's pending announcement");
  await settle();                                // A's check finds its picture
  assert.ok(!pendingB[0].dead, "A's found path did not cancel B's pending announcement");
  t.runTimers(50);
  assert.equal(t.live.textContent, NOPE, "B's message is current in the region");
  t.net.info = { events: {} };
  t.click(a); await settle();                    // A re-taps again with B's message current; A announces afterwards
  t.runTimers(50);
  t.runTimers(3500);
  assert.equal(t.live.textContent, "", "nothing stuck");
});

test("two buttons: A's re-tap leaves B's current message in the region", async () => {
  const { t, a, b } = await loaded({ info: { events: {} } });
  t.click(a); await settle(); t.runTimers(50);
  t.click(b); await settle(); t.runTimers(50);   // B's message is the current one
  assert.equal(t.live.textContent, NOPE);
  t.net.info = { events: { a: { names: ["Alpha"], infographics: [{ url: "https://example.com/a.jpg", label: "A" }] } } };
  t.click(a);                                    // A's token is stale: releasing it must not touch the region
  assert.equal(t.live.textContent, NOPE, "A's re-tap did not clear B's message");
  await settle();
  assert.equal(t.live.textContent, NOPE, "A's found path did not clear B's message");
});
