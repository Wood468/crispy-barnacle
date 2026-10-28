// Scheduled discovery of community-reported Pokémon GO event play locations.
// Reads the current regional event feed, searches public Reddit RSS, and writes sourced candidates
// into public/places.json only when an event, coordinate pair and source permalink are all present.
// No API credentials, scraping bypasses, or fabricated coordinates.
import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../public/", import.meta.url);
const WORLD = JSON.parse(await readFile(new URL("world-events.json", ROOT), "utf8"));
const FILE = new URL("places.json", ROOT);
const DATA = JSON.parse(await readFile(FILE, "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x2F;/g, "/").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const coords = text => {
  const out = [], re = /(-?\d{1,2}\.\d{3,})\s*[,; ]\s*(-?\d{1,3}\.\d{3,})/g; let m;
  while ((m = re.exec(text)) !== null) {
    const lat = Number(m[1]), lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) out.push({ lat, lng });
  }
  return out;
};
const decode = s => clean(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'");
const xmlItems = xml => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
  const field = n => decode((m[1].match(new RegExp("<" + n + "[^>]*>([\\s\\S]*?)<\/" + n + ">")) || [,""])[1].replace(/^<!\[CDATA\[|\]\]>$/g, ""));
  return { title: field("title"), link: field("link"), desc: field("description") };
};
const seen = new Set(DATA.places.map(p => p.id));
let added = 0, checked = 0, errors = [];
const upcoming = (WORLD.events || []).filter(e => e && e.id && e.name && e.place && e.start && !/worldwide|play from anywhere|participating .* malls|airports/i.test(e.place)).slice(0, 80);
for (const ev of upcoming) {
  const query = encodeURIComponent('"' + ev.name.slice(0, 70) + '" (coordinates OR coords OR hotspot OR "where to play" OR "best place")');
  const url = "https://www.reddit.com/search.rss?q=" + query + "&sort=new&t=month";
  try {
    const res = await fetch(url, { headers: { "user-agent": "GOFieldNotesLocationDiscovery/1.0 (public event research; contact: project repository)", accept: "application/atom+xml, application/rss+xml" } });
    if (!res.ok) { errors.push("Reddit HTTP " + res.status); continue; }
    const xml = await res.text();
    for (const post of xmlItems(xml)) {
      if (!post.link || !/^https:\/\/(www\.)?reddit\.com\//.test(post.link)) continue;
      const body = post.title + " " + post.desc;
      if (!ev.name.toLowerCase().split(/\W+/).filter(x => x.length > 3).some(t => body.toLowerCase().includes(t))) continue;
      for (const point of coords(body)) {
        const id = "reddit-" + ev.id.replace(/[^a-z0-9-]/gi, "-").toLowerCase() + "-" + point.lat.toFixed(4).replace(".", "p") + "-" + point.lng.toFixed(4).replace(".", "p");
        if (seen.has(id)) continue;
        DATA.places.push({
          id, name: ev.place, city: ev.place.split(",")[0].replace(/\s*\([^)]*\)/g, "").trim(), country: "",
          lat: point.lat, lng: point.lng, type: "Community-reported play location",
          role: "Community-shared coordinates associated with " + ev.name + ". Treat as a suggested play area, not an official event pin.",
          tags: ["Raids", "Gyms", "PokéStops"],
          sources: [{ label: "Reddit community report", url: post.link, vouches: "Post/comment contains coordinates in discussion of " + ev.name, trust: "community" }],
          coords: { label: "Reddit community report", url: post.link, note: "Community-reported coordinates. Not an official event pin; confirm the spot before travelling." },
          verified: new Date().toISOString().slice(0, 10), route: null,
          events: [{ name: ev.name, from: ev.start, to: ev.end || ev.start }]
        });
        seen.add(id); added++;
      }
    }
    checked++;
    await sleep(1200);
  } catch (e) { errors.push(String(e.message || e).slice(0, 160)); }
}
if (added) {
  DATA.updated = new Date().toISOString().slice(0, 10);
  await writeFile(FILE, JSON.stringify(DATA, null, 2) + "\n");
}
console.log(JSON.stringify({ checkedEvents: checked, candidateLocationsAdded: added, errors: errors.slice(0, 10) }, null, 2));
