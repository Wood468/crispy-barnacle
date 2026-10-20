import test from "node:test";
import assert from "node:assert/strict";
import { parseIntlRange, prettySlug, entryFromIntlPage, discoverIntl, INTL_PATTERN } from "../scripts/importer/intl.mjs";

test("local dates: Japanese, Korean and Chinese ranges", () => {
  assert.deepEqual(parseIntlRange("2026年10月19日（月）〜11月1日（日）", 2026), { start: "2026-10-19", end: "2026-11-01" });
  assert.deepEqual(parseIntlRange("2026년 10월 19일 ~ 11월 1일", 2026), { start: "2026-10-19", end: "2026-11-01" });
  assert.deepEqual(parseIntlRange("2026年10月19日至11月1日", 2026), { start: "2026-10-19", end: "2026-11-01" });
  assert.deepEqual(parseIntlRange("12月28日〜1月3日", 2026), { start: "2026-12-28", end: "2027-01-03" });
  assert.deepEqual(parseIntlRange("10月31日（土）14:00〜17:00", 2026), { start: "2026-10-31", end: "2026-10-31" });
  assert.equal(parseIntlRange("no dates here", 2026), null);
});

test("name from the page address", () => {
  assert.equal(prettySlug("202610aeonmall-halloween"), "Aeonmall Halloween");
  assert.ok(INTL_PATTERN.test("https://pokemongo.com/ja/news/202610aeonmall-halloween/"));
  assert.ok(!INTL_PATTERN.test("https://pokemongo.com/en/news/202610aeonmall-halloween/"));
});

const page = (url, title, text) => ({ url, title, lines: [{ text }] });

test("AEON MALL Halloween (Japanese page only) becomes a regional Japan entry", () => {
  const e = entryFromIntlPage(page("https://pokemongo.com/ja/news/202610aeonmall-halloween/", "全国のイオンモールで『ポケモン GO』のハロウィンイベントを楽しもう！ — Pokémon GO",
    "開催期間 2026年10月19日（月）〜11月1日（日） 参加店舗のポケストップでルアーモジュールの効果が2時間に"), "2026-10-19");
  assert.equal(e.scope, "regional"); assert.equal(e.place, "Japan"); assert.equal(e.area, "Asia");
  assert.equal(e.start, "2026-10-19"); assert.equal(e.end, "2026-11-01"); assert.equal(e.source, "official");
});

test("a Japanese page about a global event is not made a Japan-only event", () => {
  assert.equal(entryFromIntlPage(page("https://pokemongo.com/ja/news/community-day-october-2026/", "コミュニティ・デイ", "期間限定 2026年10月25日"), "2026-10-19"), null);
  assert.equal(entryFromIntlPage(page("https://pokemongo.com/ja/news/halloween-2026-part-two/", "ハロウィン 第2部", "2026年10月27日〜11月1日 期間限定で登場"), "2026-10-19"), null);
});

test("discovery lists only local news pages and survives a failing list", async () => {
  const html = '<a href="/ja/news/202610aeonmall-halloween">x</a><a href="/ja/news/community-day-oct">y</a><a href="/en/news/foo-bar-baz">z</a>';
  const { found, status } = await discoverIntl(async u => { if (u.includes("/ko/")) throw new Error("HTTP 500"); return html; }, ["https://pokemongo.com/ja/news/watched-mall-page"]);
  assert.deepEqual(found.map(f => f.url).sort(), ["https://pokemongo.com/ja/news/202610aeonmall-halloween/", "https://pokemongo.com/ja/news/watched-mall-page/"].sort());
  assert.equal(status.ko.error, "HTTP 500"); assert.ok(status.ja.listed >= 1);
});

import { parseWesternRange } from "../scripts/importer/intl.mjs";
test("European and Thai dates", () => {
  const r = { start: "2026-10-19", end: "2026-10-25" };
  assert.deepEqual(parseWesternRange("du 19 au 25 octobre 2026", 2026), r);
  assert.deepEqual(parseWesternRange("vom 19. bis 25. Oktober 2026", 2026), r);
  assert.deepEqual(parseWesternRange("del 19 al 25 de octubre de 2026", 2026), r);
  assert.deepEqual(parseWesternRange("dal 19 al 25 ottobre 2026", 2026), r);
  assert.deepEqual(parseWesternRange("de 19 a 25 de outubro de 2026", 2026), r);
  assert.deepEqual(parseWesternRange("19 – 25 ตุลาคม 2569", 2026), r); // Thai Buddhist year
  assert.deepEqual(parseWesternRange("19 octobre 2026 au 1 novembre 2026", 2026), { start: "2026-10-19", end: "2026-11-01" });
  assert.deepEqual(parseWesternRange("28 décembre au 3 janvier", 2026), { start: "2026-12-28", end: "2027-01-03" });
  assert.deepEqual(parseWesternRange("31 de outubro", 2026), { start: "2026-10-31", end: "2026-10-31" });
  assert.equal(parseWesternRange("sin fechas", 2026), null);
});

test("pages in the new languages: in-person ones become entries, global ones do not", () => {
  const pg = (loc, slug, title, text) => ({ url: `https://pokemongo.com/${loc}/news/${slug}/`, title, lines: [{ text }] });
  const de = entryFromIntlPage(pg("de", "halloween-einkaufszentrum", "Halloween im Einkaufszentrum", "Vor Ort in teilnehmenden Einkaufszentren vom 19. bis 25. Oktober 2026"), "2026-10-19");
  assert.equal(de.scope, "regional"); assert.equal(de.start, "2026-10-19"); assert.equal(de.area, "Europe");
  const pt = entryFromIntlPage(pg("pt_br", "evento-no-shopping", "Evento no shopping", "Nos shopping centers participantes de 19 a 25 de outubro de 2026, presencial"), "2026-10-19");
  assert.equal(pt.place, "Brazil"); assert.equal(pt.end, "2026-10-25");
  const th = entryFromIntlPage(pg("th", "mall-halloween", "อีเวนต์ฮาโลวีน", "ที่ห้างสรรพสินค้าที่เข้าร่วม 19 – 25 ตุลาคม 2569"), "2026-10-19");
  assert.equal(th.start, "2026-10-19"); assert.equal(th.area, "Asia");
  assert.equal(entryFromIntlPage(pg("fr", "journee-communautaire", "Journée communautaire", "Le 25 octobre 2026, partout dans le monde"), "2026-10-19"), null);
  assert.equal(entryFromIntlPage(pg("es", "dia-de-la-comunidad", "Día de la Comunidad", "El 25 de octubre de 2026 en todo el mundo"), "2026-10-19"), null);
});
