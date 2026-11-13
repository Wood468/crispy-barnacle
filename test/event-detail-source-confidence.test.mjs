import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const detail = fs.readFileSync(new URL("../public/detail.js", import.meta.url), "utf8");

test("event detail trust badges never turn an unknown trust value into Community", () => {
  const match = detail.match(/function trust\(t\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, "trust renderer exists");
  const renderTrust = new Function("t", match[1]);
  assert.match(renderTrust("official"), />Official</);
  assert.match(renderTrust("community"), />Community</);
  assert.match(renderTrust(""), /st-u/);
  assert.match(renderTrust(null), /Trust not labelled/);
});

test("event detail claim attribution reads trust from source metadata", () => {
  assert.match(detail, /records\.some\(function \(s\) \{ return s\.trust === 'official'; \}\)/);
  assert.match(detail, /records\.some\(function \(s\) \{ return s\.trust === 'community'; \}\)/);
  assert.match(detail, /Source trust not labelled/);
});

test("multi-source claim attribution says corroborated rather than confirmed", () => {
  assert.match(detail, /ids\.length > 1 \? 'Corroborated'/);
  assert.doesNotMatch(detail, /ids\.length > 1 \? 'Cross-referenced'/);
  const data = JSON.parse(fs.readFileSync(new URL("../public/event-details.json", import.meta.url), "utf8"));
  let confirmed = 0, corroborated = 0;
  const walk = value => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "status" && child === "confirmed") confirmed++;
      if (key === "status" && child === "corroborated") corroborated++;
      walk(child);
    }
  };
  walk(data);
  assert.equal(confirmed, 0, "generated claim statuses must not overstate community corroboration as confirmation");
  assert.ok(corroborated > 0, "the current snapshot retains corroborated multi-source claims");
});

test("event detail does not substitute the dataset snapshot date for a source-check date", () => {
  assert.match(detail, /var sourceChecked = \(primarySource && \(primarySource\.observed \|\| primarySource\.checked\)\) \|\| ev\.seen \|\| '';/);
  assert.doesNotMatch(detail, /sourceChecked\s*=.*G\.D\.asOf/);
});

const detailCss = fs.readFileSync(new URL("../public/dash.css", import.meta.url), "utf8");

test("event detail duplicate claims merge attribution before category HTML is rendered", () => {
  const match = detail.match(/function dedupeSourceGroups\(fields\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, "cross-category claim grouping helper exists");
  const dedupe = new Function("fields", "CATS", "tidy", "BOILER", match[1]);
  const groups = dedupe({
    bonuses: [
      { text: "2× Catch XP. Incense lasts twice as long.", sources: ["leekduck", "leekduck"], status: "community" }
    ],
    raids: [
      { text: "2× Catch XP.", sources: ["niantic", "leekduck"], status: "official" }
    ],
    shiny: [
      { text: "Shiny chance boosted for event spawns.", sources: ["community"], status: "community" }
    ]
  }, [["bonuses", "Bonuses"], ["raids", "Raids"], ["shiny", "Shiny"]],
  (t) => String(t).replace(/\s+([.,;:!?])/g, "$1").replace(/\s+/g, " ").trim(),
  /^prices are in usd|availability of event tickets|^claim all unlocked/i);

  assert.equal(groups.bonuses.length, 2, "separate sentences remain visible");
  assert.deepEqual(groups.bonuses[0].sources, ["leekduck", "niantic"], "duplicate source IDs are collapsed and later sources are retained");
  assert.equal(groups.bonuses[0].status, "official", "official claim evidence is not lost when the duplicate appears in a later category");
  assert.equal(groups.raids.length, 0, "the duplicate sentence is still displayed only once");
  assert.equal(groups.shiny.length, 1, "unrelated claims remain in their original category");
});

test("event detail uses explicit mixed-trust attribution instead of implying every source is official", () => {
  assert.match(detail, /official && community \? 'Official \+ community'/);
  assert.match(detail, /var grouped = dedupeSourceGroups\(d\.fields\);/);
});

test("event detail categories use a consistent accessible line-icon treatment", () => {
  const map = detail.match(/var CATICON = (\{[\s\S]*?\});\n  function categoryIcon/);
  const fn = detail.match(/function categoryIcon\(key\) \{([\s\S]*?)\n  \}/);
  assert.ok(map, "category icon path map exists");
  assert.ok(fn, "category icon renderer exists");
  const icons = new Function("return (" + map[1] + ");")();
  const render = new Function("key", "CATICON", fn[1]);
  const categories = ["tickets", "bonuses", "featured", "raids", "eggs", "research", "shiny", "moves", "costumes", "dates"];
  for (const category of categories) {
    assert.ok(icons[category], "missing icon path for " + category);
    assert.match(render(category, icons), /<span class="evd-icon" aria-hidden="true">/);
    assert.match(render(category, icons), /<svg class="ci"/);
  }
  assert.match(detailCss, /\.evd-icon\{[^}]*width:28px/);
  assert.match(detailCss, /\.evd-grp \.ci,[^}]*width:15px/);
});

test("future source trust values remain unknown and cannot inject badge markup", () => {
  const match = detail.match(/function trust\(t\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, "trust renderer exists");
  const renderTrust = new Function("t", match[1]);
  for (const val of ["unverified", "partner", "OFFICIAL", "Community", "<img src=x onerror=alert(1)>", undefined, 0, false]) {
    assert.equal(renderTrust(val), '<span class="st st-u">Trust not labelled</span>');
  }
});

test("curated event attribution uses actual guarded fallback expressions and preserves overrides", () => {
  const dash = fs.readFileSync(new URL("../public/dash.js", import.meta.url), "utf8");
  const lines = dash.split("\n");
  const officialLine = lines.find(line => line.includes("function isOfficialUrl(u) {"));
  const safeLine = lines.find(line => line.includes("function safeUrl(u) {"));
  assert.ok(officialLine && safeLine, "dashboard contains both URL validators");
  const body = line => line.slice(line.indexOf("{") + 1, line.lastIndexOf("}"));
  const isOfficialUrl = new Function("u", body(officialLine));
  const actualSafe = new Function("u", "window", body(safeLine));
  const safeUrl = u => actualSafe(u, { GOLIB: { isPrivateLink: () => false } });
  const anchor = "highlights: Array.isArray(x.highlights) ? x.highlights : [],";
  const offset = dash.indexOf(anchor);
  assert.ok(offset >= 0, "curated event default attribution exists");
  const section = dash.slice(offset, offset + 650);
  const fields = section.match(/\n\s*status:\s*([^\n]+),\n\s*source:\s*([^\n]+),\n\s*link:/);
  assert.ok(fields, "actual curated status and source expressions are adjacent");
  const status = new Function("x", "safeUrl", "isOfficialUrl", "return (" + fields[1] + ");");
  const source = new Function("x", "safeUrl", "isOfficialUrl", "return (" + fields[2] + ");");
  const infer = x => [status(x, safeUrl, isOfficialUrl), source(x, safeUrl, isOfficialUrl)];
  const official = ["official_confirmed", "Official Pokémon GO announcement"];
  const community = ["community_reported", "Curated community calendar"];
  for (const url of ["https://pokemongo.com/news", "https://www.pokemongo.com/news"])
    assert.deepEqual(infer({ sourceUrl: url }), official);
  for (const url of [
    "https://leekduck.com/events", "https://pokemongo.com.evil.example/news",
    "https://fake-pokemongo.com/news", "http://pokemongo.com/news", "", null
  ])
    assert.deepEqual(infer({ sourceUrl: url }), community);
  assert.deepEqual(infer({
    sourceUrl: "https://pokemongo.com/news",
    status: "community_reported", source: "Owner-supplied source"
  }), ["community_reported", "Owner-supplied source"], "explicit attribution takes precedence");
});

test("official-source inference rejects non-HTTPS and credentialed URLs", () => {
  const dash = fs.readFileSync(new URL("../public/dash.js", import.meta.url), "utf8");
  const lines = dash.split("\n");
  const officialLine = lines.find(line => line.trim().startsWith("function isOfficialUrl(u) {"));
  const safeLine = lines.find(line => line.trim().startsWith("function safeUrl(u) {"));
  assert.ok(officialLine && safeLine, "actual dashboard URL validators exist");
  const body = line => line.slice(line.indexOf("{") + 1, line.lastIndexOf("}"));
  const isOfficialUrl = new Function("u", body(officialLine));
  const actualSafe = new Function("u", "window", body(safeLine));
  const safeUrl = u => actualSafe(u, { GOLIB: { isPrivateLink: () => false } });
  const anchor = "highlights: Array.isArray(x.highlights) ? x.highlights : [],";
  const offset = dash.indexOf(anchor);
  assert.ok(offset >= 0, "actual curated attribution exists");
  const fields = dash.slice(offset, offset + 650).match(/\n\s*status:\s*([^\n]+),\n\s*source:\s*([^\n]+),\n\s*link:/);
  assert.ok(fields, "actual status/source fallback expressions exist");
  const status = new Function("x", "safeUrl", "isOfficialUrl", "return (" + fields[1] + ");");
  const source = new Function("x", "safeUrl", "isOfficialUrl", "return (" + fields[2] + ");");
  const infer = x => [status(x, safeUrl, isOfficialUrl), source(x, safeUrl, isOfficialUrl)];
  for (const url of ["https://pokemongo.com/news", "https://www.pokemongo.com/news",
    "https://NEWS.POKEMONGO.COM/path", "https://pokemongo.com:443/news"]) {
    assert.equal(isOfficialUrl(url), true, url);
    assert.deepEqual(infer({ sourceUrl: url }), ["official_confirmed", "Official Pokémon GO announcement"]);
  }
  for (const url of ["http://pokemongo.com/news", "http://www.pokemongo.com/news",
    "https://evil@pokemongo.com/news", "https://evil:pw@pokemongo.com",
    "https://:pw@www.pokemongo.com/news", "https://%65vil@www.pokemongo.com/news",
    "https://pokemongo.com@evil.example/news", "https://pokemongo.com.evil.example/news",
    "https://evilpokemongo.com/news", "javascript:alert(1)", "//pokemongo.com/news",
    "not a url", "", null, undefined, false, 42, {}, [], ["https://pokemongo.com/news"]]) {
    assert.equal(isOfficialUrl(url), false, String(url));
    assert.deepEqual(infer({ sourceUrl: url }), ["community_reported", "Curated community calendar"], String(url));
  }
  assert.deepEqual(infer({ sourceUrl: "https://evil@pokemongo.com/news",
    status: "community_reported", source: "Owner-supplied source" }),
    ["community_reported", "Owner-supplied source"], "explicit attribution remains authoritative");
});

test("cpRows safely handles missing or malformed rosters and renders properly", () => {
  const dash = fs.readFileSync(new URL("../public/dash.js", import.meta.url), "utf8");
  const line = dash.split("\n").find(l => l.includes("function cpRows(ev) {"));
  assert.ok(line, "cpRows function exists");
  const body = dash.slice(dash.indexOf("function cpRows(ev) {"));
  const endIdx = body.indexOf("  /* ---------- kinds:");
  assert.ok(endIdx >= 0, "cpRows extent found");
  const cpRowsFn = new Function("hundoLabels", "esc", body.slice(0, endIdx) + "\n  return cpRows(ev);\n");
  const hundo = (ev, f) => "<span>" + f.name + "</span>";
  const esc = s => s;

  assert.equal(cpRowsFn(hundo, esc, null), "");
  assert.equal(cpRowsFn(hundo, esc, {}), "");
  assert.equal(cpRowsFn(hundo, esc, { featured: null }), "");
  assert.equal(cpRowsFn(hundo, esc, { featured: "not-an-array" }), "");
  assert.equal(cpRowsFn(hundo, esc, { featured: [null, {}, { name: "Pikachu" }, { name: "Pikachu" }] }), '<div class="cp-rows"><div class="cp-row"><b>Catch CP</b><span>Pikachu</span></div></div>');
});
