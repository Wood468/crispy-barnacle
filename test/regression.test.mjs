// Existing behaviour that Phase 1 must not change.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import worker, { cleanDecision, classify, watchedIds, ogImage, pageGraphics, guideSlug, guideSlugs, guideImage } from "../src/worker.js";
import { makeDB, feed, raid, cd } from "./helpers.mjs";

const dataJson = fs.readFileSync(new URL("../public/data.json", import.meta.url), "utf8");
const ASSETS = { fetch: async (req) => (String(req.url || req).endsWith("data.json") ? new Response(dataJson) : new Response("<html>asset</html>")) };
const gm = (extra = []) => "[\r\n" + [...Array.from({ length: 600 }, (_, i) => `V${String(i + 1).padStart(4, "0")}_POKEMON_MON${i}`), ...extra].map((id) => `    {\r\n        "templateId": "${id}",\r\n        "data": {}\r\n    }`).join(",\r\n") + "\r\n]";
const mkEnv = (over = {}) => ({ DB: makeDB(), SYNC_PIN: "1234", ASSETS, ...over });
const call = (env, path, init = {}) => worker.fetch(new Request("https://x" + path, init), env, { waitUntil() {} });
let remote = {};
globalThis.fetch = async (u) => { u = String(u); for (const [k, v] of Object.entries(remote)) if (u.includes(k)) return typeof v === "function" ? v() : new Response(v); return new Response("nope", { status: 404 }); };

test("wrangler.toml: cron, route, assets and D1 binding are unchanged", () => {
  const t = fs.readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(t, /crons = \["30 \* \* \* \*"\]/); assert.equal((t.match(/crons = \[([^\]]*)\]/)[1].match(/"/g) || []).length, 2, "exactly one cron: the free plan allows very few"); assert.match(t, /pogo\.michaelpuff\.com/); assert.match(t, /run_worker_first = \["\/api\/\*"\]/); assert.match(t, /binding = "DB"/);
  assert.ok(!/PIPELINE/.test(t), "pipeline stays off: no variable enabling it is set");
});

test("dex sync: PIN required, marks round-trip, wrong PIN throttled after 10 attempts", async () => {
  const env = mkEnv();
  assert.equal((await call(env, "/api/dex")).status, 401);
  assert.equal((await call(env, "/api/dex", { headers: { "x-pin": "1234" } })).status, 200);
  const put = await call(env, "/api/dex", { method: "PUT", headers: { "x-pin": "1234" }, body: JSON.stringify({ have: { Mew: 1 }, hundo: { Mewtwo: 1 }, m: { own: { 25: 1 } }, updated: 5, baseUpdated: 0 }) });
  assert.equal(put.status, 200);
  const got = await (await call(env, "/api/dex", { headers: { "x-pin": "1234" } })).json();
  assert.equal(got.have.Mew, 1); assert.equal(got.have.Mewtwo, 1, "a hundo implies owned"); assert.equal(got.m.own["25"], 1);
  const e2 = mkEnv(); let last = 0;
  for (let i = 0; i < 11; i++) last = (await call(e2, "/api/dex", { headers: { "x-pin": "bad" } })).status;
  assert.equal(last, 429); assert.equal((await call(e2, "/api/dex", { headers: { "x-pin": "1234" } })).status, 429);
});

test("datamine: first run is a baseline, later runs record only new entries, bad downloads never overwrite", async () => {
  const env = mkEnv();
  remote = { "game_masters": gm(), "pokemongohub": "<rss><channel></channel></rss>", "ScrapedDuck": "[]", "pogoapi": "{}", "pvpoke": "[]" };
  const run = () => call(env, "/api/datamine/run", { method: "POST", headers: { "x-pin": "1234" } });
  assert.equal((await call(env, "/api/datamine/run", { method: "POST" })).status, 401);
  assert.equal((await run()).status, 200);
  assert.equal((await (await call(env, "/api/datamine")).json()).items.length, 0, "baseline records nothing as new");
  remote["game_masters"] = gm(["V0900_POKEMON_NEWMON", "TEMPORARY_EVOLUTION_V0807_POKEMON_ZERAORA_MEGA"]);
  await run();
  const names = (await (await call(env, "/api/datamine")).json()).items.map((i) => i.name).sort();
  assert.deepEqual(names, ["Newmon", "Zeraora Mega"]);
  remote["game_masters"] = "<html>oops</html>"; await run();
  const kept = await env.DB.prepare("SELECT length(v) n FROM dm_state WHERE k='ids'").first();
  assert.ok(kept.n > 1000, "id list kept after a bad download");
  assert.equal(classify("V0800_POKEMON_NECROZMA_ULTRA").name, "Necrozma Ultra"); assert.equal(watchedIds(gm()).size, 600);
});

test("Shadow and Dynamax use ordinary artwork (the page adds the aura); costume/G-Max never fall back", async () => {
  const previous = globalThis.caches;
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  try {
    remote = {
      "pokeapi.co/api/v2/pokemon/thundurus": JSON.stringify({ id: 642 }),
      "pokeapi.co/api/v2/pokemon/sizzlipede": JSON.stringify({ id: 850 }),
      // The game's `_11` icon files are costume art (a party hat), never a Shadow sprite, so they must not be requested.
      "pokemon_icon_642_11.png": "party hat Thundurus",
      "official-artwork/642.png": "ordinary Thundurus artwork",
      "official-artwork/850.png": "ordinary Sizzlipede artwork",
    };
    const shadow = await call(mkEnv(), "/api/art?n=Thundurus&shadow=1");
    assert.equal(shadow.status, 200);
    assert.equal(await shadow.text(), "ordinary Thundurus artwork", "Shadow shows the normal sprite; the aura is drawn by the page");
    const max = await call(mkEnv(), "/api/art?n=Sizzlipede&dynamax=1");
    assert.equal(max.status, 200);
    assert.equal(await max.text(), "ordinary Sizzlipede artwork", "Dynamax shows the normal sprite; the Max smoke is drawn by the page");
    const gmax = await call(mkEnv(), "/api/art?n=Gigantamax%20Sizzlipede&dynamax=1");
    assert.equal(gmax.status, 404, "a missing Gigantamax sprite must not show normal artwork");
  } finally {
    if (previous === undefined) delete globalThis.caches; else globalThis.caches = previous;
  }
});

test("page graphics: finds the raid guide graphic, skips icons, banner and default art", () => {
  const html = '<meta property="og:image" content="https://cdn.leekduck.com/assets/img/events/yveltal-2.jpg"><img src="https://cdn.leekduck.com/assets/img/events/icons/raids.png"><img src="https://cdn.leekduck.com/assets/img/events/yveltal-2.jpg"><img src="https://cdn.leekduck.com/assets/img/events/raids/2026.10.06 - Yveltal Raid Guide.jpg"><img src="https://cdn.leekduck.com/assets/img/events/mega-default.jpg"><img src="https://evil.test/assets/img/events/x.jpg">';
  assert.deepEqual(pageGraphics(html), ["https://cdn.leekduck.com/assets/img/events/raids/2026.10.06%20-%20Yveltal%20Raid%20Guide.jpg"]);
  assert.deepEqual(pageGraphics("<html></html>"), []);
});

test("Pokebattler guide slugs and image pick-up", () => {
  assert.equal(guideSlug("Mega Blastoise"), "BLASTOISE_MEGA");
  assert.equal(guideSlug("Yveltal"), "YVELTAL");
  assert.equal(guideSlug("Mega Charizard X"), "CHARIZARD_MEGA");
  assert.equal(guideSlug("../etc"), "");
  assert.deepEqual(guideSlugs("Mega Charizard X"), ["CHARIZARD_MEGA_X", "CHARIZARD_X_MEGA", "CHARIZARD_MEGA"]);
  assert.deepEqual(guideSlugs("Mega Blastoise"), ["BLASTOISE_MEGA"]);
  assert.deepEqual(guideSlugs("../etc"), []);
  assert.deepEqual(guideSlugs("Zacian (Hero)"), ["ZACIAN_HERO_FORM", "ZACIAN_HERO"]);
  assert.deepEqual(guideSlugs("Origin Forme Giratina"), ["GIRATINA_ORIGIN_FORM", "GIRATINA_ORIGIN"]);
  assert.deepEqual(guideSlugs("Mega Charizard X and Y"), ["CHARIZARD_MEGA_X", "CHARIZARD_X_MEGA", "CHARIZARD_MEGA"]);
  assert.deepEqual(guideSlugs("Xurkitree"), ["XURKITREE", "XURKITREE_RAID"]);
  assert.deepEqual(guideSlugs("Yveltal"), ["YVELTAL", "YVELTAL_RAID"]);
  assert.deepEqual(guideSlugs("Shadow Landorus (Incarnate)"), []);
  assert.equal(guideImage('<a href="https://static.pokebattler.com/CaptGoldfish/Mega_Blastoise_Raid_Guide4.jpg">x</a><img src="https://static.pokebattler.com/CaptGoldfish/Mega_Blastoise_Article_Thumbnail.jpg">'), "https://static.pokebattler.com/CaptGoldfish/Mega_Blastoise_Raid_Guide4.jpg");
  assert.equal(guideImage("<html></html>"), "");
});

test("og:image parser reads the event picture and ignores non-https", () => {
  assert.equal(ogImage('<head><meta property="og:image" content="https://cdn.leekduck.com/x.jpg?a=1&amp;b=2"></head>'), "https://cdn.leekduck.com/x.jpg?a=1&b=2");
  assert.equal(ogImage('<meta content="https://a.test/i.png" property="og:image">'), "https://a.test/i.png");
  assert.equal(ogImage('<meta property="og:image" content="http://a.test/i.png">'), "");
  assert.equal(ogImage("<html></html>"), "");
});

test("Gigantamax uses the real PokeMiners G-Max asset path", async () => {
  const previous = globalThis.caches;
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  try {
    remote = {
      "pokeapi.co/api/v2/pokemon/charizard": JSON.stringify({ id: 6 }),
      "pm6.fGIGANTAMAX.icon.png": "Gigantamax Charizard artwork",
      "official-artwork/6.png": "ordinary Charizard artwork",
    };
    const r = await call(mkEnv(), "/api/art?n=Gigantamax%20Charizard&dynamax=1");
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "Gigantamax Charizard artwork");
  } finally {
    if (previous === undefined) delete globalThis.caches; else globalThis.caches = previous;
  }
});

test("PWA caches public shell offline but never caches API responses", () => {
  const sw = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const pwa = fs.readFileSync(new URL("../public/pwa.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/, "private and live API responses must bypass service-worker caching");
  assert.match(sw, /request\.mode === 'navigate' \? await cache\.match\(url\.pathname === '\/' \? '\/' : url\.pathname\)/, "offline navigation checks the requested cached path");
  assert.match(sw, /request\.mode === 'navigate' \? await cache\.match\('\/offline\.html'\)/, "offline navigation has a human-readable fallback");
  assert.match(sw, /gofn-shell-v145/, "shell cache is versioned");
  assert.match(pwa, /serviceWorker\.register\('\/sw\.js'\)/, "the app registers its service worker");
  assert.match(html, /<script src="\/pwa\.js"><\/script>/, "the registration script is loaded");
});

test("existing public routes still answer, unknown API paths still 404", async () => {
  const env = mkEnv();
  for (const p of ["/api/unreleased", "/api/world", "/api/shinies", "/api/datamine"]) assert.equal((await call(env, p)).status, 200, p);
  assert.equal((await call(env, "/api/pvp")).status, 404, "unchanged: /api/pvp is 404 until the first nightly run, and the app falls back to pvp.json");
  const ics = await call(env, "/api/calendar.ics"); assert.equal(ics.status, 200); assert.match(await ics.text(), /BEGIN:VCALENDAR/);
  assert.equal((await call(env, "/api/nothing")).status, 404);
  assert.equal((await call(env, "/")).status, 200);
});

test("new routes are safe before the pipeline has ever run: no tables are created by reading", async () => {
  const env = mkEnv();
  for (const p of ["/api/events", "/api/sources", "/api/events/history?id=x"]) assert.equal((await call(env, p)).status, 200, p);
  assert.equal((await (await call(env, "/api/events")).json()).enabled, false);
  assert.equal(await env.DB.prepare("SELECT 1 x FROM sqlite_master WHERE name='items'").first(), null, "GET must not create tables");
  assert.equal((await call(env, "/api/pipeline/run", { method: "POST" })).status, 401, "running needs the PIN");
  assert.equal((await call(env, "/api/pipeline/run")).status, 405);
});

test("read-only event endpoints fail closed for unavailable, malformed, or insufficient feeds", async () => {
  const env = mkEnv();
  const cases = [
    ["HTTP failure", () => new Response("upstream unavailable", { status: 503 })],
    ["malformed JSON", () => new Response("{not-json", { headers: { "content-type": "application/json" } })],
    ["insufficient event count", () => new Response(JSON.stringify([raid()]), { headers: { "content-type": "application/json" } })],
  ];
  for (const [label, response] of cases) {
    remote = { "ScrapedDuck/data/events.json": response };
    const events = await (await call(env, "/api/events")).json();
    assert.equal(events.enabled, false, label + ": invalid feed must not be marked enabled");
    assert.equal(events.readOnly, true, label + ": endpoint stays explicitly read-only");
    assert.deepEqual(events.events, [], label + ": invalid feed events must not leak through");
    assert.match(events.note, /curated data\.json fallback/i, label + ": disclose curated fallback");
    const sources = await (await call(env, "/api/sources")).json();
    assert.equal(sources.enabled, false, label + ": source status must not claim freshness");
    assert.equal(sources.readOnly, true);
    assert.match(sources.note, /curated snapshot/i);
    assert.equal(await env.DB.prepare("SELECT 1 x FROM sqlite_master WHERE name='items'").first(), null, label + ": GET must not create pipeline tables");
  }
  assert.equal((await call(env, "/api/pipeline/preview")).status, 200);
  assert.equal(await env.DB.prepare("SELECT 1 x FROM sqlite_master WHERE name='items'").first(), null, "preview remains read-only after feed failures");
});

test("preview writes nothing; the PIN-protected run creates tables and stores events; existing dex untouched", async () => {
  const env = mkEnv();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS dex (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)").run();
  await env.DB.prepare("INSERT INTO dex VALUES ('me','{\"have\":{\"Mew\":1}}',1)").run();
  // Dates relative to now so this does not start failing once the sample Community Day is in the past.
  const soon = (h) => new Date(Date.now() + h * 3600000).toISOString().slice(0, 19) + ".000";
  const f = feed([raid({ start: soon(-24), end: soon(24 * 5) }), cd({ start: soon(24), end: soon(27) })], 60);
  remote = { "ScrapedDuck/data/events.json": JSON.stringify(f), "api.github.com": JSON.stringify({ commit: { committer: { date: new Date().toISOString() } } }) };
  const pv = await (await call(env, "/api/pipeline/preview")).json();
  assert.equal(pv.leekduck.ok, true);
  const live = await (await call(env, "/api/events")).json();
  assert.equal(live.enabled, true, "validated upstream events are available even while the storage pipeline is off");
  assert.equal(live.readOnly, true, "the fallback must be explicitly read-only");
  assert.ok(live.events.length >= 10, "the live event feed is served to the app");
  assert.ok(live.events.every((e) => Array.isArray(e.reports) && e.reports[0].source === "leekduck"), "source attribution is preserved");
  const freshness = await (await call(env, "/api/sources")).json();
  assert.equal(freshness.enabled, true); assert.equal(freshness.readOnly, true);
  assert.equal(freshness.feed.state, "fresh", "freshness reports the validated read-only fetch");
  assert.equal(await env.DB.prepare("SELECT 1 x FROM sqlite_master WHERE name='items'").first(), null, "read-only live events did not create tables");
  const run = await call(env, "/api/pipeline/run", { method: "POST", headers: { "x-pin": "1234" } });
  assert.equal(run.status, 200); const log = (await run.json()).log; assert.equal(log.leekduck.ok, true);
  const ev = await (await call(env, "/api/events")).json();
  assert.equal(ev.enabled, true); assert.ok(ev.events.find((e) => /Zorua/.test(e.name)));
  const src = await (await call(env, "/api/sources")).json();
  assert.deepEqual(src.sources.map((s) => s.id).sort(), ["curated", "leekduck"]);
  assert.equal((await env.DB.prepare("SELECT data FROM dex WHERE id='me'").first()).data, '{"have":{"Mew":1}}');
});

test("nightly cron: datamine always runs; the pipeline only runs when PIPELINE=1", async () => {
  remote = { "game_masters": gm(), "pokemongohub": "<rss/>", "ScrapedDuck/data/events.json": JSON.stringify(feed()), "api.github.com": "{}", "pogoapi": "{}", "pvpoke": "[]" };
  const wait = async (env) => { const ps = []; await worker.scheduled({}, env, { waitUntil: (p) => ps.push(p) }); await Promise.all(ps); };
  const off = mkEnv(); await wait(off);
  assert.ok(await off.DB.prepare("SELECT 1 x FROM dm_state WHERE k='ids'").first(), "datamine ran");
  assert.equal(await off.DB.prepare("SELECT 1 x FROM sqlite_master WHERE name='items'").first(), null, "pipeline did not run");
  const on = mkEnv({ PIPELINE: "1" }); await wait(on);
  assert.ok(await on.DB.prepare("SELECT 1 x FROM sqlite_master WHERE name='items'").first());
  assert.ok((await on.DB.prepare("SELECT COUNT(*) n FROM items").first()).n >= 12);
});

test("one source failing does not block the other", async () => {
  const env = mkEnv();
  remote = { "ScrapedDuck/data/events.json": () => new Response("rate limited", { status: 429 }), "api.github.com": "{}" };
  const run = await (await call(env, "/api/pipeline/run", { method: "POST", headers: { "x-pin": "1234" } })).json();
  assert.equal(run.log.leekduck.ok, false); assert.equal(run.log.curated.ok, true);
  const src = (await (await call(env, "/api/sources")).json()).sources;
  assert.equal(src.find((s) => s.id === "leekduck").state, "failing");
});

test("environment banner data: production by default, preview only where the previews block sets ENVIRONMENT", async () => {
  const prod = await (await call(mkEnv(), "/api/sources")).json();
  assert.equal(prod.environment, "production"); assert.equal(prod.database, true);
  const pre = await (await call(mkEnv({ ENVIRONMENT: "preview" }), "/api/sources")).json();
  assert.equal(pre.environment, "preview"); assert.equal(pre.database, true);
  const none = await (await call({ ENVIRONMENT: "preview", ASSETS }, "/api/sources")).json();
  assert.equal(none.environment, "preview"); assert.equal(none.database, false, "a preview with no database says so");
  assert.equal((await (await call(mkEnv({ ENVIRONMENT: "anything-else" }), "/api/events")).json()).environment, "production", "only the exact value 'preview' counts");
  const html = fs.readFileSync(new URL("../public/sources.js", import.meta.url), "utf8");
  assert.match(html, /PREVIEW \\u2014 STAGING DATABASE/); assert.match(html, /NO DATABASE/);
});

test("wrangler.toml guard: any previews block uses its own real D1 id and carries no routes, triggers or secrets", () => {
  const t = fs.readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const i = t.indexOf("[previews");
  if (i < 0) return; // not added yet
  const prev = t.slice(i);
  const id = /database_id\s*=\s*"([0-9a-f-]{36})"/.exec(prev);
  assert.ok(id && id[1] !== "00000000-0000-0000-0000-000000000000", "preview D1 needs a real staging database id");
  assert.match(prev, /database_name\s*=\s*"go-field-notes-staging"/);
  assert.ok(!/^\s*(routes?|crons|triggers|SYNC_PIN|PIPELINE)\b|\[triggers\]/m.test(prev), "no routes, cron, PIN or pipeline switch inside previews");
  assert.ok(!/\[\[d1_databases\]\]/.test(prev), "production D1 binding is not repeated in previews");
  const top = t.slice(0, i);
  assert.match(top, /crons = \["30 \* \* \* \*"\]/); assert.ok(!/go-field-notes-staging/.test(top));
});

test("stylesheets have balanced braces so no @media block swallows later rules", () => {
  for (const f of ["dash.css", "styles.css"]) {
    const css = fs.readFileSync(new URL("../public/" + f, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.equal(css.split("{").length, css.split("}").length, f + " has unbalanced braces");
  }
});

test("infographic decisions are validated before they reach the database", () => {
  assert.deepEqual(cleanDecision({ id: "discord:123", status: "approved", eventId: "fm", eventTitle: "Fall <b>Marathon" }), { id: "discord:123", status: "approved", eventId: "fm", eventTitle: "Fall bMarathon" });
  assert.equal(cleanDecision({ id: "x y", status: "approved", eventId: "a" }), null);
  assert.equal(cleanDecision({ id: "ok", status: "approved" }), null);
  assert.equal(cleanDecision({ id: "ok", status: "whatever" }), null);
  assert.deepEqual(cleanDecision({ id: "ok", status: "rejected", eventId: "zz" }), { id: "ok", status: "rejected", eventId: "", eventTitle: "" });
});

import { cleanBt } from "../src/worker.js";
test("best-attacker extras keep only known fields", () => {
  assert.deepEqual(cleanBt({ "Mega Lucario": { s: 1, x: 0, v: 2, junk: 5 }, bad: 7, "Empty": {} }), { "Mega Lucario": { s: 1, v: 2 } });
});

test('own copies of pictures (/img/ext/) pass every address check that guards event pictures', async () => {
  const fs = await import('node:fs');
  for (const f of ['dash.js', 'detail.js', 'infographic.js']) assert.ok(fs.readFileSync(new URL('../public/' + f, import.meta.url), 'utf8').includes('\\/img\\/ext\\/'), f);
});


test("home attention cards navigate, refresh infographic counts, and hide empty update history", () => {
  const dash = fs.readFileSync(new URL("../public/dash.js", import.meta.url), "utf8");
  const review = fs.readFileSync(new URL("../public/review.js", import.meta.url), "utf8");
  const updates = fs.readFileSync(new URL("../public/whatsnew.js", import.meta.url), "utf8");
  assert.match(dash, /title:'Live & starting soon'/);
  assert.match(dash, /key === 'review'.*subnav-saved/s, "review action navigates directly rather than clicking a possibly hidden badge");
  assert.match(dash, /gofn-review-updated/);
  assert.match(review, /dispatchEvent\(new Event\('gofn-review-updated'\)\)/, "approval changes immediately refresh the home action centre");
  assert.match(updates, /Event changes/);
  assert.match(updates, /eventSnapshot/);
  assert.match(updates, /if \(!total\).*box\.hidden = true/s, "no empty recent-updates card or stale reopen control");
});
