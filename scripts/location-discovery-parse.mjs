// Pure parsing helpers for the community location discovery workflow.
// Kept separate from the scheduled network/file-writing script so regressions can be tested safely.
const decodeEntities = s => String(s || "").replace(/&(amp|lt|gt|quot|apos|#x2F|#39);/g, entity => {
  const name = entity.slice(1, -1);
  return ({
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    "#x2F": "/",
    "#39": "'"
  })[name] ?? entity;
});

const clean = s => decodeEntities(s)
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export const redditSearchUrl = eventName => {
  const url = new URL("https://www.reddit.com/search.rss");
  const query = '"' + String(eventName || "").slice(0, 70) + '" (coordinates OR coords OR hotspot OR "where to play" OR "best place")';
  url.searchParams.set("q", query);
  url.searchParams.set("sort", "new");
  url.searchParams.set("t", "month");
  return url;
};

export const coords = text => {
  const out = [];
  const re = /(?<![\d.])(-?\d{1,2}\.\d{3,})(?![\d.])\s*[,; ]\s*(?<![\d.])(-?\d{1,3}\.\d{3,})(?![\d.])/g;
  let m;
  while ((m = re.exec(String(text || ""))) !== null) {
    const lat = Number(m[1]), lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) out.push({ lat, lng });
  }
  return out;
};

export const xmlItems = xml => {
  const blocks = [...String(xml || "").matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  return blocks.map(m => {
    const body = m[2];
    const field = n => {
      const raw = (body.match(new RegExp("<" + n + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + n + ">", "i")) || [, ""])[1];
      return clean(raw.replace(/^<!\[CDATA\[|\]\]>$/g, ""));
    };
    const href = (body.match(/<link\b[^>]*href=["']([^"']+)["']/i) || [, ""])[1];
    return {
      title: field("title"),
      link: field("link") || href,
      desc: field("description") || field("content") || field("summary")
    };
  });
};
