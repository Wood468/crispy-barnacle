// The main picture on an event page (its og:image). Shared by the Worker routes and the Telegram reminders.
export const OG_HOSTS = ["leekduck.com", "www.leekduck.com", "pokemongo.com", "www.pokemongo.com"];
export function ogImage(html) {
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  for (const t of tags) {
    if (!/(?:property|name)\s*=\s*["']og:image["']/i.test(t)) continue;
    const m = t.match(/content\s*=\s*["']([^"']+)["']/i);
    if (m && /^https:\/\//i.test(m[1])) return m[1].replace(/&amp;/g, "&");
  }
  return "";
}

// The event page's own picture, or "" when there is none. Only leekduck.com / pokemongo.com pages are read.
export async function eventImage(page, f = fetch) {
  let u; try { u = new URL(page || ""); } catch { return ""; }
  if (u.protocol !== "https:" || !OG_HOSTS.includes(u.hostname)) return "";
  try { const r = await f(u.href, { cf: { cacheTtl: 86400, cacheEverything: true }, headers: { "user-agent": "GO-Field-Notes/1.0 (+https://pogo.michaelpuff.com)" } }); return r.ok ? ogImage((await r.text()).slice(0, 400000)) : ""; } catch { return ""; }
}
