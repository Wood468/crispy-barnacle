import { SOURCES, EVENT_WORDS } from "./sources.mjs";
import { decode } from "./text.mjs";

const UA = "GO-Field-Notes-Importer/1.0 (+https://pogo.michaelpuff.com; reads public event write-ups, links back to every source)";
export async function get(url, ms = 20000) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml" }, signal: AbortSignal.timeout(ms), redirect: "follow" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return (await r.text()).slice(0, 900000);
}
export function linksFrom(body, base) {
  const out = [], seen = new Set();
  for (const m of String(body).matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u; try { u = new URL(decode(m[1]), base); } catch { continue; }
    u.hash = ""; u.search = "";
    const href = u.href.replace(/\/?$/, "/");
    if (!seen.has(href)) { seen.add(href); out.push({ url: href, title: decode(m[2].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim() }); }
  }
  return out;
}
export function feedItems(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const t = (m[0].match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "", l = (m[0].match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || "";
    const title = decode(t.replace(/<!\[CDATA\[|\]\]>/g, "")).trim(), url = decode(l.replace(/<!\[CDATA\[|\]\]>/g, "")).trim();
    if (url) out.push({ url: url.replace(/\/?$/, "/"), title });
  }
  return out;
}
// Returns { found: [{source, url, title}], status: { id: {listed, error} } }. A source that fails is reported, never fatal.
export async function discover(fetcher = get) {
  const found = [], status = {};
  for (const s of SOURCES) {
    status[s.id] = { listed: 0, error: "" };
    for (const list of s.lists) {
      try {
        const body = await fetcher(list);
        const items = /<rss|<feed|<channel/i.test(body.slice(0, 600)) ? feedItems(body) : linksFrom(body, list);
        for (const it of items) if (s.pattern.test(it.url) && (it.title ? EVENT_WORDS.test(it.title + " " + it.url) : true) && !found.some(f => f.url === it.url)) { found.push({ source: s.id, url: it.url, title: it.title }); status[s.id].listed++; }
        if (status[s.id].listed) break;
      } catch (e) { status[s.id].error = e.message; }
    }
  }
  return { found, status };
}
