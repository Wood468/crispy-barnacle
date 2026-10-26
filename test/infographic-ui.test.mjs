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
  querySelector(sel) { return sel === "img" ? this.children.find((c) => c.tag === "img") || null : null; }
  addEventListener(t, f) { this.on[t] = f; }
  closest(sel) { const m = /^\[([\w-]+)\]$/.exec(sel); return m && this.hasAttribute(m[1]) ? this : null; }
}

function setup({ events, info }) {
  const buttons = [], docListeners = {}, timers = [];
  let live = null, fetches = 0;
  const net = { info };                       // what /event-info.json answers: object | "500" | "throw" | "badjson"
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
  const ctx = vm.createContext({ window, GODEDUPE, document, fetch, console, Promise, setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: (n) => { if (timers[n - 1]) timers[n - 1].dead = true; } });
  vm.runInContext(code, ctx);
  const card = (id) => { const b = new El("button"); b.setAttribute("data-igcard", id); buttons.push(b); return b; };
  return { card, docListeners, timers, net, get live() { return live; }, get fetches() { return fetches; }, click: (b) => docListeners.click({ target: b, preventDefault() {}, stopPropagation() {} }), refresh: () => docListeners.visibilitychange() };
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

test("Check infographic: keeps button semantics, announces separately, resets on re-tap, ignores taps while checking", async () => {
  const { t, b } = await loaded();
  assert.equal(b.getAttribute("data-igcheck"), "b");
  const before = t.fetches;
  t.click(b); t.click(b);                      // second tap while the first check is in flight
  assert.equal(b.textContent, "Checking…");
  await settle();
  assert.equal(t.fetches - before, 1, "one network check only");
  assert.equal(b.textContent, "No infographic found yet");
  assert.equal(b.getAttribute("role"), null, "button role is not replaced");
  assert.equal(t.live.textContent, "No infographic found yet");
  assert.equal(t.live.getAttribute("role"), "status");
  const first = t.timers.length;
  t.click(b); await settle();                  // tap during the message: old timer cancelled, a fresh check runs
  assert.ok(t.timers[first - 1].dead, "old reset timer cleared");
  assert.equal(b.textContent, "No infographic found yet");
  t.timers[first - 1].f();                     // a stale timer firing late must not wipe the new message
  const last = t.timers[t.timers.length - 1]; assert.ok(!last.dead);
  last.f();
  assert.equal(b.textContent, "Check infographic");
  assert.equal(b.getAttribute("data-igmsg"), null);
  assert.equal(t.live.textContent, "");
});
