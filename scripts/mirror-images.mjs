// Copies every picture the app hotlinks from another website into public/img/ext/ and points the app at the copy,
// so a picture keeps working if the other site changes or goes away, and the app stops using their bandwidth.
// A picture that cannot be downloaded keeps its original address. Run: node scripts/mirror-images.mjs
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";

export const FILES = ["public/costumes.json", "public/season.json", "public/account.js", "public/dash.js", "public/event-info.json", "public/data.json", "public/world-events.json"];
const DIR = "public/img/ext/", WEB = "/img/ext/";
const IMG = /https?:\/\/[A-Za-z0-9.-]+\/[^\s"'`)\\]*?\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'`)\\]*)?/gi;

export function findUrls(text) { return [...new Set(String(text).match(IMG) || [])]; }
export function localName(url) {
  const u = new URL(url), base = decodeURIComponent(u.pathname.split("/").pop() || "img");
  const ext = (base.match(/\.(png|jpe?g|webp|gif)$/i) || [, "png"])[1].toLowerCase();
  const stem = base.replace(/\.[a-z]+$/i, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "img";
  return `${stem}-${createHash("sha1").update(url).digest("hex").slice(0, 8)}.${ext}`;
}
const exists = f => access(f).then(() => true, () => false);

export async function main(fetchFn = fetch) {
  await mkdir(DIR, { recursive: true });
  let copied = 0, kept = 0, failed = [];
  for (const f of FILES) {
    let text; try { text = await readFile(f, "utf8"); } catch { continue; }
    let out = text;
    for (const url of findUrls(text)) {
      const name = localName(url);
      if (!(await exists(DIR + name))) {
        try {
          const r = await fetchFn(url, { headers: { "user-agent": "Mozilla/5.0 go-field-notes", accept: "image/*" } });
          const type = r.headers.get("content-type") || "";
          const buf = Buffer.from(await r.arrayBuffer());
          if (!r.ok || !/^image\//.test(type) || buf.length < 100 || buf.length > 3e6) throw new Error(r.status + " " + type);
          await writeFile(DIR + name, buf); copied++;
        } catch (e) { failed.push(url + " (" + e.message + ")"); kept++; continue; }
      }
      out = out.split(url).join(WEB + name);
    }
    if (out !== text) await writeFile(f, out);
  }
  console.log(`${copied} pictures copied, ${kept} left on their original site`);
  for (const x of failed) console.log("  not copied: " + x);
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(0); });
