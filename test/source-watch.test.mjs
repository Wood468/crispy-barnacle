import test from "node:test";
import assert from "node:assert/strict";
import { parseFeed, review, mentioned, allFeedsFailed } from "../scripts/source-watch.mjs";

const now = Date.parse("2026-10-18T00:00:00Z");
const rss = `<rss><channel>
<item><title>Shiny Bramblin?</title><link>https://x/1</link><pubDate>Fri, 16 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Rowlet wearing a costume</p>]]></description></item>
<item><title>Old shiny news</title><link>https://x/2</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item>
<item><title>Cut off mid-feed</title><link>https://x/3</link><pubDate>Fri, 16 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[never closed`;
const atom = `<feed><entry><title>Add Zubat top hat assets</title><link href="https://g/1"/><updated>2026-10-17T01:00:00Z</updated></entry></feed>`;
const dex = [[41, "Zubat", 1], [722, "Rowlet", 7], [946, "Bramblin", 9]];

test("parses RSS items, Atom entries and ignores a truncated item", () => {
  const items = parseFeed(rss);
  assert.equal(items.length, 2);
  assert.equal(items[0].summary, "Rowlet wearing a costume");
  assert.equal(parseFeed(atom)[0].link, "https://g/1");
});
test("finds Pokémon names without matching inside other words", () => {
  assert.deepEqual(mentioned("Shiny Bramblin and Rowlet", ["Rowlet", "Bramblin", "Owl"]), ["Bramblin", "Rowlet"].sort((a, b) => b.length - a.length));
  assert.deepEqual(mentioned("Crowlet", ["Rowlet"]), []);
});
test("keeps recent keyword items and marks Pokémon our data lacks", () => {
  const costumes = { pictures: { "zubat|top hat": "x" }, shiny: {}, missing: [] };
  const r = review({ items: parseFeed(rss).concat(parseFeed(atom)), dex, costumes, dataText: "rowlet costume", now, weak: true });
  assert.equal(r.length, 2);
  const a = r.find(i => /Bramblin/.test(i.title));
  assert.deepEqual(a.notInOurData, ["Bramblin"]);
  const z = r.find(i => /Zubat/.test(i.title));
  assert.deepEqual(z.notInOurData, []);
});

test("drops other games and plain debut posts, keeps them on weak (commit) feeds", () => {
  const costumes = { pictures: {}, shiny: {}, missing: [] };
  const items = [
    { title: "Rowlet debut in Pokémon Sleep with shiny", link: "a", date: now - 1e6, summary: "" },
    { title: "Bramblin debut guide", link: "b", date: now - 1e6, summary: "" },
    { title: "Add Zubat icons", link: "c", date: now - 1e6, summary: "" }
  ];
  assert.equal(review({ items, dex, costumes, dataText: "", now }).length, 0);
  assert.deepEqual(review({ items, dex, costumes, dataText: "", now, weak: true }).map(i => i.link), ["b", "c"]);
});
test("names come from the title when it has any", () => {
  const r = review({ items: [{ title: "Shiny Zubat", link: "a", date: now - 1e6, summary: "Rowlet and Bramblin also appear" }], dex, costumes: { pictures: {}, shiny: {}, missing: [] }, dataText: "", now });
  assert.deepEqual(r[0].pokemon, ["Zubat"]);
});

test("source-watch fails only when every configured feed is unavailable", () => {
  assert.equal(allFeedsFailed([{ id: "hub", state: "error" }, { id: "reddit", state: "error" }]), true);
  assert.equal(allFeedsFailed([{ id: "hub", state: "ok" }, { id: "reddit", state: "error" }]), false);
  assert.equal(allFeedsFailed([]), true);
});
