// Keeps a copy of each official announcement we cite (pokemongo.com news), so the text survives if the post is edited or removed.
// Saves plain text to data/archive/<slug>.txt (kept in R2 by scripts/r2-sync.sh, not in git). Pages already saved are skipped.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
const DIR = "data/archive";
export function slugFor(url) { return url.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 120).toLowerCase(); }
export function pagesIn(value, out = new Set()) {
  if (typeof value === "string") { for (const m of value.matchAll(/https:\/\/(?:www\.)?pokemongo\.com\/[^\s"'<>)]*news\/[a-z0-9-]+/gi)) out.add(m[0]); }
  else if (Array.isArray(value)) value.forEach(v => pagesIn(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach(v => pagesIn(v, out));
  return out;
}
export function toText(html) {
  return String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
async function main() {
  await mkdir(DIR, { recursive: true });
  const urls = new Set();
  for (const f of ["public/data.json", "public/world-events.json", "public/event-info.json", "data/watch-pages.json"]) { try { pagesIn(JSON.parse(await readFile(f, "utf8")), urls); } catch { /* optional */ } }
  let saved = 0, skipped = 0, failed = 0;
  for (const u of urls) {
    const file = DIR + "/" + slugFor(u) + ".txt";
    if (await access(file).then(() => true, () => false)) { skipped++; continue; }
    try {
      const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (go-field-notes archive)" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) { failed++; continue; }
      const text = toText(await r.text());
      if (text.length < 200) { failed++; continue; }
      await writeFile(file, "Saved " + new Date().toISOString().slice(0, 10) + " from " + u + "\n\n" + text.slice(0, 60000) + "\n");
      saved++;
    } catch { failed++; }
  }
  console.log(`Archive: ${saved} saved, ${skipped} already kept, ${failed} could not be read.`);
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
