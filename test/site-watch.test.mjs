import test from "node:test";
import assert from "node:assert/strict";
import { goLinks, fresh, message } from "../scripts/site-watch.mjs";

const html = `<a href="/us/news/a">Pokémon GO Fest 2027 announced for Chicago</a><a href="/us/news/b">New Pokémon TCG set</a>
<a href="/info/1">『ポケモンGO』ハロウィンイベント開催</a><a href="/x"><img alt="Pokémon GO"></a><a href="/y">Pokémon GO</a>`;
test("only links whose title names Pokémon GO are kept", () => {
  const l = goLinks(html, "https://www.pokemon.com/us/news");
  assert.deepEqual(l.map(x => x.url), ["https://www.pokemon.com/us/news/a/", "https://www.pokemon.com/info/1/"]);
});
test("links already seen are not new", () => {
  const l = goLinks(html, "https://www.pokemon.com/us/news");
  assert.deepEqual(fresh(l, { "https://www.pokemon.com/us/news/a/": "2026-10-01" }).map(x => x.url), ["https://www.pokemon.com/info/1/"]);
});
test("the Telegram message names the site and each post", () => {
  const m = message([{ title: "Pokémon GO Fest 2027", url: "https://x/a/", site: "Pokemon.com (US)" }]);
  assert.match(m, /Pokemon\.com \(US\)/); assert.match(m, /Pokémon GO Fest 2027\nhttps:\/\/x\/a\//);
});
