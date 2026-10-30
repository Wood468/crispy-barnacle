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

// Preserve the source publication day separately from any independent coordinate check.
export const reportDate = value => {
  const raw = String(value || "").trim();
  if (!raw || !Number.isFinite(Date.parse(raw))) return null;
  const iso = /^(\d{4}-\d\d-\d\d)/.exec(raw);
  if (iso) return iso[1];
  const rfc = /(?:^|,\s*)(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/.exec(raw);
  if (!rfc) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months.indexOf(rfc[2]);
  if (month < 0) return null;
  return rfc[3] + "-" + String(month + 1).padStart(2, "0") + "-" + String(Number(rfc[1])).padStart(2, "0");
};

// Extract only an explicitly named city/venue and country from the event's published place string.
// Country-wide or ambiguous strings are skipped instead of writing incomplete Places records.
export const placeParts = value => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let city = "", country = "";
  if (raw.includes(",")) {
    const parts = raw.split(",").map(part => part.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    country = parts.pop().replace(/\s*\([^)]*\)/g, "").trim();
    city = parts.join(",").replace(/\s*\([^)]*\)/g, "").trim();
  } else {
    const match = /^(.+?)\s*\(([^()]*)\)$/.exec(raw);
    if (!match) return null;
    country = match[1].trim();
    city = match[2].trim();
  }
  const aliases = {
    USA: "United States",
    US: "United States",
    UK: "United Kingdom",
    England: "United Kingdom",
    Scotland: "United Kingdom",
    Wales: "United Kingdom",
    "Northern Ireland": "United Kingdom"
  };
  country = aliases[country] || country;
  if (!city || !country || city.toLowerCase() === country.toLowerCase()) return null;
  return { city, country };
};

// Parse Retry-After safely. A missing/invalid header gets a modest cooldown;
// a server-requested wait longer than five minutes defers this run to the next schedule.
export const retryAfterMs = (value, now = Date.now()) => {
  const fallback = 15_000;
  if (value == null || String(value).trim() === "") return fallback;
  const raw = String(value).trim();
  const seconds = Number(raw);
  const delay = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1000
    : Date.parse(raw) - now;
  if (!Number.isFinite(delay)) return fallback;
  if (delay > 300_000) return null;
  return Math.max(1_000, delay);
};

// Retry a rate-limited request once, using the server's cooldown when available.
// Dependencies are injectable so the retry path can be tested without network access.
export const fetchWithRateLimit = async (
  url,
  options,
  fetchImpl = globalThis.fetch,
  sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms))
) => {
  const first = await fetchImpl(url, options);
  if (first.status !== 429) return { response: first, rateLimits: 0, deferred: false, reason: null };
  const header = first.headers && typeof first.headers.get === "function" ? first.headers.get("retry-after") : null;
  const wait = retryAfterMs(header);
  if (wait === null) return { response: first, rateLimits: 1, deferred: true, reason: "long-cooldown" };
  await sleepImpl(wait);
  const retry = await fetchImpl(url, options);
  const repeated = retry.status === 429;
  return {
    response: retry,
    rateLimits: repeated ? 2 : 1,
    deferred: repeated,
    reason: repeated ? "repeated-429" : null
  };
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
    const publishedAt = field("pubDate") || field("published");
    return {
      title: field("title"),
      link: field("link") || href,
      desc: field("description") || field("content") || field("summary"),
      ...(publishedAt ? { publishedAt } : {})
    };
  });
};
