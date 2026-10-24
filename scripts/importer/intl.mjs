// In-person and regional events announced only on the official site in another language (for example "AEON MALL Halloween", Japan only,
// which has a Japanese write-up and no English one). The English importer cannot read these: its keywords, titles and dates are English.
// This reads the official Japanese, Korean and Traditional Chinese news lists, keeps the pages that describe an in-person event, and
// pulls the dates from the local date formats. The name is made from the page address; the daily AI check replaces it with the real
// title (same convention as the other auto-added events), and a hand-written entry for the same page is never duplicated.
import { linksFrom, get } from "./discover.mjs";
import { cleanTitle, placeOf } from "./world.mjs";

export const INTL = [
  { locale: "ja", list: "https://pokemongo.com/ja/news", place: "Japan", area: "Asia" },
  { locale: "ko", list: "https://pokemongo.com/ko/news", place: "South Korea", area: "Asia" },
  { locale: "zh_hant", list: "https://pokemongo.com/zh_hant/news", place: "Taiwan or Hong Kong", area: "Asia" },
  { locale: "de", list: "https://pokemongo.com/de/news", place: "Germany, Austria or Switzerland", area: "Europe" },
  { locale: "fr", list: "https://pokemongo.com/fr/news", place: "France or French-speaking region", area: "Europe" },
  { locale: "es", list: "https://pokemongo.com/es/news", place: "Spain or Latin America", area: "Worldwide" },
  { locale: "es_mx", list: "https://pokemongo.com/es_MX/news", place: "Mexico", area: "Americas" },
  { locale: "it", list: "https://pokemongo.com/it/news", place: "Italy", area: "Europe" },
  { locale: "pt_br", list: "https://pokemongo.com/pt_br/news", place: "Brazil", area: "Americas" },
  { locale: "th", list: "https://pokemongo.com/th/news", place: "Thailand", area: "Asia" },
];
export const INTL_PATTERN = /^https:\/\/pokemongo\.com\/(ja|ko|zh[_-]hant|de|fr|es|es[_-]mx|it|pt[_-]br|th)\/news\/([a-z0-9-]{6,})\/?$/i;

// Words that say "go to a place": malls, stores, venues, stations, airports, nationwide, limited to a region. Slug words are the English ones used in addresses.
const IN_PERSON_TEXT = /イオン|モール|全国の|店舗|会場|ポケモンセンター|サファリ|空港|駅|商業施設|スタンプラリー|地域限定|日本限定|国内限定|店舗限定|매장|몰에서|쇼핑몰|현장|전국|공항|스탬프 ?랠리|商場|商城|現場|門市|百貨|機場|車站|全台|集章|Einkaufszentrum|Filiale|Veranstaltungsort|Bahnhof|Flughafen|vor Ort|Stempelsammlung|centre commercial|magasin|aéroport|sur place|en personne|centro comercial|tienda|aeropuerto|presencial|en persona|centro commerciale|negozio|aeroporto|stazione|di persona|shopping center|loja|estação|ห้างสรรพสินค้า|ห้าง|สนามบิน|สถานที่จัดงาน|ร้านค้า|ภายในงาน/i;
// Places and attractions named in the western languages (a street, an exhibition, a parade, a stamp rally): pages for in-person events in Spain, Latin America, France, Germany, Italy and Brazil.
const IN_PERSON_WESTERN = /\b(?:avenida|paseo de|exposici[oó]n|exhibici[oó]n|desfile|recorrido|rally de sellos|sellos|evento presencial|evento en vivo|exposi[cç][aã]o|exibi[cç][aã]o|avenida|pra[cç]a|evento ao vivo|rallye|exposition|d[eé]fil[eé]|[eé]v[eé]nement sur place|Ausstellung|Umzug|Stadion|Stempelrallye|mostra|sfilata|piazza|evento dal vivo|rally dei timbri)\b/i;
const IN_PERSON_SLUG = /mall|aeon|safari|station|airport|store|stamp-rally|museum|stadium|venue/i;
const SKIP_SLUG = /community-day|spotlight|raid-hour|max-monday|battle-league|go-pass|season|maintenance|patch|update-notes|terms|privacy|support/i;

export function slugOf(url) { const m = INTL_PATTERN.exec(String(url)); return m ? m[2] : ""; }
// "202610aeonmall-halloween" -> "Aeonmall Halloween"
export function prettySlug(slug) {
  return String(slug).replace(/^\d{4,8}/, "").replace(/[-_]+/g, " ").replace(/\b\d{4}\b/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b([a-z])/g, c => c.toUpperCase());
}

const NUM = "(\\d{1,2})";
const DATE = new RegExp(`(?:(\\d{4})\\s*[年년]\\s*)?${NUM}\\s*[月월]\\s*${NUM}\\s*[日일]`, "g");
const GAP = /[〜～~\-–—ー]|から|부터|까지|至|到/;
const iso = (y, m, d) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// "2026年10月19日（月）〜11月1日（日）", "2026년 10월 19일 ~ 11월 1일", "2026年10月19日至11月1日" -> { start, end }. The first date or pair found.
export function parseIntlRange(text, year = new Date().getFullYear()) {
  const t = String(text || "").replace(/[（(][^）)]{1,6}[）)]/g, "").replace(/\s+/g, " ");
  const hits = [...t.matchAll(DATE)];
  for (let i = 0; i < hits.length; i++) {
    const a = hits[i], y1 = a[1] ? +a[1] : year, start = iso(y1, +a[2], +a[3]);
    const b = hits[i + 1];
    if (b) {
      const between = t.slice(a.index + a[0].length, b.index);
      if (between.length <= 12 && GAP.test(between)) {
        const y2 = b[1] ? +b[1] : (+b[2] < +a[2] ? y1 + 1 : y1);
        return { start, end: iso(y2, +b[2], +b[3]) };
      }
    }
    return { start, end: start };
  }
  return null;
}

// Western languages and Thai: "19 octobre 2026", "19. bis 25. Oktober", "del 19 al 25 de octubre", "dal 19 al 25 ottobre", "19 – 25 ตุลาคม 2569".
const strip = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const MONTHS = Object.fromEntries(Object.entries({
  1: ["januar", "janvier", "enero", "gennaio", "janeiro", "มกราคม"], 2: ["februar", "fevrier", "febrero", "febbraio", "fevereiro", "กุมภาพันธ์"],
  3: ["marz", "mars", "marzo", "marco", "มีนาคม"], 4: ["april", "avril", "abril", "aprile", "เมษายน"], 5: ["mai", "mayo", "maggio", "maio", "พฤษภาคม"],
  6: ["juni", "juin", "junio", "giugno", "junho", "มิถุนายน"], 7: ["juli", "juillet", "julio", "luglio", "julho", "กรกฎาคม"],
  8: ["august", "aout", "agosto", "สิงหาคม"], 9: ["september", "septembre", "septiembre", "setiembre", "settembre", "setembro", "กันยายน"],
  10: ["oktober", "octobre", "octubre", "ottobre", "outubro", "ตุลาคม"], 11: ["november", "novembre", "noviembre", "novembro", "พฤศจิกายน"],
  12: ["dezember", "decembre", "diciembre", "dicembre", "dezembro", "ธันวาคม"],
}).flatMap(([n, names]) => names.map(x => [strip(x), +n])));
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const WDAY = "(\\d{1,2})\\s*(?:º|°|\\.|er)?";
const YEAR = "(?:\\s*(?:de\\s+|del\\s+)?(\\d{4}))?";
const OF = "(?:\\s*(?:de|d'|of)\\s*|\\s+)?";
const RANGE_W = new RegExp(`(?:\\b(?:del|dal|de|vom|du|from)\\s+)?${WDAY}${OF}(${MONTH_RE})?${YEAR}\\s*(?:-|–|—|bis|au|al|a|à|até|to|ถึง)\\s*${WDAY}${OF}(${MONTH_RE})${YEAR}`);
const ONE_W = new RegExp(`${WDAY}${OF}(${MONTH_RE})${YEAR}`);
const year = y => (+y > 2400 ? +y - 543 : +y); // Thai Buddhist year
// "Desde el martes 27 de octubre a las 10:00 a.m. hasta el jueves 5 de noviembre de 2026", "Do 27 de outubro às 10h até quinta 5 de novembro": a start, some times and words, then an end.
const FROM_UNTIL = new RegExp(`(?:desde|de|a partir d[eo]l?|dal|du|vom|from)\\s+(?:el\\s+|le\\s+|il\\s+)?(?:[a-z]+\\s+)?${WDAY}${OF}(${MONTH_RE})?${YEAR}.{0,70}?\\b(?:hasta|ate|jusqu'a|jusqu'au|bis|fino al|fino a)\\s+(?:el\\s+|o\\s+|le\\s+|il\\s+|zum\\s+)?(?:[a-z]+\\s+)?${WDAY}${OF}(${MONTH_RE})${YEAR}`);
export function parseWesternRange(text, yr = new Date().getFullYear()) {
  const t = strip(text).replace(/\s+/g, " ");
  let m = RANGE_W.exec(t);
  if (m) {
    const m2 = MONTHS[m[5]], m1 = m[2] ? MONTHS[m[2]] : m2, y1 = m[3] ? year(m[3]) : (m[6] && m1 > m2 ? year(m[6]) - 1 : (m[6] ? year(m[6]) : yr)), y2 = m[6] ? year(m[6]) : (m1 > m2 ? y1 + 1 : y1);
    if (+m[1] >= 1 && +m[1] <= 31 && +m[4] >= 1 && +m[4] <= 31) return { start: iso(y1, m1, +m[1]), end: iso(y2, m2, +m[4]) };
  }
  m = FROM_UNTIL.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 31 && +m[4] >= 1 && +m[4] <= 31) {
    const m2 = MONTHS[m[5]], m1 = m[2] ? MONTHS[m[2]] : m2, y2 = m[6] ? year(m[6]) : yr, y1 = m[3] ? year(m[3]) : (m1 > m2 ? y2 - 1 : y2);
    return { start: iso(y1, m1, +m[1]), end: iso(y2, m2, +m[4]) };
  }
  m = ONE_W.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 31) { const d = iso(m[3] ? year(m[3]) : yr, MONTHS[m[2]], +m[1]); return { start: d, end: d }; }
  return null;
}

// One page -> a world-events entry when it is about an in-person or regional event, otherwise null.
export function entryFromIntlPage(page, today = new Date().toISOString().slice(0, 10)) {
  const m = INTL_PATTERN.exec(String(page.url)); if (!m) return null;
  const cfg = INTL.find(x => x.locale === m[1].toLowerCase().replace("-", "_")), slug = m[2];
  if (!cfg || SKIP_SLUG.test(slug)) return null;
  const text = (page.lines || []).map(l => l.text).join(" ");
  const title = cleanTitle(page.title || "");
  if (!(IN_PERSON_TEXT.test(title) || IN_PERSON_TEXT.test(text.slice(0, 1500)) || IN_PERSON_WESTERN.test(text.slice(0, 3000)) || IN_PERSON_SLUG.test(slug))) return null;
  const dt = title + " . " + text.slice(0, 3000), range = parseIntlRange(dt, +today.slice(0, 4)) || parseWesternRange(dt, +today.slice(0, 4)), where = placeOf(title, text.slice(0, 1500));
  return { name: prettySlug(slug) || title, place: where ? where.place : cfg.place, area: where ? where.area : cfg.area, scope: "regional", start: range ? range.start : "", end: range ? range.end : "", datesKnown: !!range, url: String(page.url).replace(/\/?$/, "/"), source: "official" };
}

// The official news list of each language -> page addresses. A list that fails is reported, never fatal.
export async function discoverIntl(fetcher = get, extraUrls = []) {
  const found = [], status = {};
  for (const cfg of INTL) {
    status[cfg.locale] = { listed: 0, error: "" };
    try {
      const body = await fetcher(cfg.list);
      for (const it of linksFrom(body, cfg.list)) {
        if (!INTL_PATTERN.test(it.url) || SKIP_SLUG.test(slugOf(it.url)) || found.some(f => f.url === it.url)) continue;
        found.push({ url: it.url, title: it.title }); status[cfg.locale].listed++;
      }
    } catch (e) { status[cfg.locale].error = e.message; }
  }
  for (const u of extraUrls) { const url = String(u).replace(/\/?$/, "/"); if (INTL_PATTERN.test(url) && !found.some(f => f.url === url)) found.push({ url, title: "" }); }
  return { found, status };
}
