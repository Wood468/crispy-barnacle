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
