// GO Field Notes: static site (public/) plus two small APIs.
//   GET /api/art?n=<Pokémon name>   Pokémon artwork, looked up on PokeAPI and cached at the edge.
//   GET|PUT /api/dex                Your Own / Hundo marks, kept in D1 behind the SYNC_PIN secret.
//   GET /api/shinies               Pokémon that can be shiny in events over the next three weeks (from Leek Duck's event data).
//   GET /api/world                  Leek Duck's Wild Area, Tour and Fest events, refreshed nightly (the app adds any new ones to its world list).
//   GET /api/pvp                    PvP top picks for Great, Ultra and Master League (PvPoke rankings, refreshed nightly).
//   GET /api/calendar.ics          Subscribable calendar of events, spotlight and raid hours, Max Battle weeks (floating local times).
//   GET /api/unreleased             Status of every tracked unreleased Pokémon, worked out nightly (public).
//   GET /api/datamine               What the nightly datamine watch found (public). POST /api/datamine/run (PIN) runs it now.
//   GET /api/events                 Phase 1 pipeline: events grouped across sources, with trust status, times, regions and attribution (public).
//   GET /api/events/history?id=     Change history of one report.   GET /api/sources  Source health, worked out from the data itself (public).
//   GET /api/pipeline/preview       Dry run: fetches and validates Leek Duck now, writes nothing.   POST /api/pipeline/run (PIN) runs and stores it.
//   The pipeline's nightly run is OFF unless the PIPELINE variable is "1"; the tables are only created by the PIN-protected run.
// A daily cron compares the PokeMiners game master with the last copy it saw and reads Pokémon GO Hub's datamine feed.

import { runBackup } from "./backup.js";
import * as pipe from "./pipeline.js";
import * as us from "./userstate.js";
import * as nt from "./notify.js";
import * as tgm from "./telegram.js";
import * as auth from "./auth.js";
import * as jobs from "./jobs.js";
import { ogImage, OG_HOSTS } from "./og.js";
import { IMAGE_CSP_HOSTS } from "./image-policy.js";
import { venueItems, venueFor, describeVenue } from "./venue-times.js";
export { ogImage };

const ART_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/";
const POKEAPI = "https://pokeapi.co/api/v2/";
// Costume icons (pm<dex>.f<COSTUME>.icon.png, shiny: .s.icon.png) come from the PokeMiners game-asset mirror, when a costume has been published there.
const COSTUME_BASE = "https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/Addressable%20Assets/";
const DAY = 86400;

// Pictures taken from other sites (/img/ext/) and community infographics (/infographics/) can live in an R2 bucket instead of the
// repository. Active only when the MEDIA binding exists; a picture not found there is served from the site files as before.
export async function mediaFromR2(request, env, url) {
  if (!env.MEDIA || (request.method !== "GET" && request.method !== "HEAD")) return null;
  if (!/^\/(infographics|img\/ext)\//.test(url.pathname)) return null;
  let key;
  try { key = decodeURIComponent(url.pathname.slice(1)); } catch { return null; }
  if (key.includes("..") || key.includes("\\")) return null;
  const obj = await env.MEDIA.get(key);
  if (!obj) return null;
  const h = new Headers();
  if (obj.writeHttpMetadata) obj.writeHttpMetadata(h);
  if (obj.httpEtag) h.set("etag", obj.httpEtag);
  h.set("cache-control", "public, max-age=86400");
  return new Response(request.method === "HEAD" ? null : obj.body, { headers: h });
}

const handler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/art" && request.method === "GET") return art(request, env, ctx, url);
      if (url.pathname === "/api/og" && request.method === "GET") return ogGet(url, ctx);
      if (url.pathname === "/api/guide" && request.method === "GET") return guideGet(url, ctx);
      if (url.pathname === "/api/dex") return dex(request, env);
      if (url.pathname === "/api/datamine") return datamineGet(env);
      if (url.pathname === "/api/unreleased") return unreleasedGet(env);
      if (url.pathname === "/api/calendar.ics") return calendar(env);
      if (url.pathname === "/api/pvp") return pvpGet(env);
      if (url.pathname === "/api/world") return worldGet(env);
      if (url.pathname === "/api/shinies") return shiniesGet(env);
      if (url.pathname === "/api/datamine/run") return datamineRun(request, env);
      if (url.pathname === "/api/events" && request.method === "GET") return eventsGet(env, url);
      if (url.pathname === "/api/events/history" && request.method === "GET") return historyGet(env, url);
      if (url.pathname === "/api/sources" && request.method === "GET") return sourcesGet(env);
      if (url.pathname === "/api/pipeline/preview" && request.method === "GET") return pipelinePreview(env);
      if (url.pathname === "/api/pipeline/run") return pipelineRun(request, env);
      if (url.pathname === "/api/ig-decisions") return igDecisions(request, env);
      if (url.pathname === "/api/tg-inbox") return tgInbox(request, env);
      if (url.pathname === "/api/worker-health") return env.DB ? json({ heartbeat: await jobs.heartbeat(env) }) : json({ heartbeat: null });
      if (url.pathname === "/api/discord-sent") return discordSentRoute(request, env);
      if (url.pathname === "/api/prices-private" && request.method === "GET") return pricesPrivate(request, env);
      if (url.pathname === "/api/places-private" && request.method === "GET") return placesPrivate(request, env);
      if (url.pathname === "/api/jobs/run" && request.method === "POST") return jobsRun(request, env, url);
      if (url.pathname === "/api/telegram/hook" && request.method === "POST") return telegramHook(request, env);
      if (url.pathname.startsWith("/api/auth/")) return authRoutes(request, env, url);
      if (url.pathname === "/api/userstate") return userstate(request, env, url);
      if (url.pathname === "/api/userstate/init") return userstateInit(request, env);
      if (url.pathname === "/api/notify/status") return notifyStatus(request, env);
      if (url.pathname === "/api/notify/test") return notifyTest(request, env);
      if (url.pathname === "/api/notify/test-reminder") return notifyTestReminder(request, env);
      if (url.pathname === "/api/venue-times" && request.method === "GET") return venueTimesGet(url, env);
      if (url.pathname === "/api/notify/run") return notifyRun(request, env);
      if (url.pathname === "/api/notify/push-key") return pushKey(request, env);
      if (url.pathname === "/api/notify/subscribe") return pushSubscribe(request, env);
      if (url.pathname === "/api/notify/latest" && request.method === "GET") return notifyLatest(env, url);
      if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "Something went wrong." }, 500);
    }
    const media = await mediaFromR2(request, env, url);
    if (media) return media;
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    // One hourly cron ("30 * * * *", the free plan allows few). Every hour: the "starting soon" check. At 20:30 UTC the nightly work
    // (datamine, pipeline, notifications) as it always was, and on Sundays at that time the Monday summary.
    const when = new Date(event.scheduledTime || Date.now());
    const nightly = !event.cron || event.cron === "30 20 * * *" || when.getUTCHours() === 20;
    if (env.DB) ctx.waitUntil(jobs.runHourly(env, when).then((r) => console.log("jobs", JSON.stringify(r))).catch((e) => console.error("jobs", e)));
    if (env.DB && nightly) ctx.waitUntil(runDatamine(env).catch((e) => console.error("datamine", e)));
    if (nightly) ctx.waitUntil(runBackup(env, when).then((r) => console.log("backup", JSON.stringify(r))).catch((e) => console.error("backup", e)));
    if (nightly) ctx.waitUntil((async () => {
      try {
        if (env.DB && env.PIPELINE === "1") await runPipelineNow(env);
        if (env.DB && env.NOTIFY === "1") await notifyNow(env);
      } catch (e) { console.error("pipeline/notify", e); }
    })());
  },
};

// Browser security headers on every response. script-src allows only our own files (no inline scripts or handlers); inline styles are still allowed. The rest of the policy still stops framing, plugins, form hijacking and calls to other sites (so a stolen PIN has nowhere to go).
export const SECURITY_HEADERS = {
  "content-security-policy": `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: ${IMAGE_CSP_HOSTS.join(" ")}; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "strict-transport-security": "max-age=31536000",
};
export function withSecurityHeaders(res) {
  if (!res || res.status === 101) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}
export default {
  fetch: async (request, env, ctx) => withSecurityHeaders(await handler.fetch(request, env, ctx)),
  scheduled: (event, env, ctx) => handler.scheduled(event, env, ctx),
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

// ---------------------------------------------------------------- artwork

const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.'’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// "Mega Charizard X" -> ["charizard-mega-x", "charizard"], "Gigantamax Duraludon" -> ["duraludon-gmax", "duraludon"] ...
export function artCandidates(raw) {
  let n = String(raw || "").trim().replace(/\s+/g, " ");
  const paren = (n.match(/\(([^)]+)\)/) || [])[1] || "";
  n = n.replace(/\([^)]*\)/g, "").trim();
  let suffix = "";
  let m;
  n = n.replace(/^(Shadow|Dynamax|Astronaut) /i, "");
  if ((m = n.match(/^Gigantamax (.+)$/i))) { n = m[1]; suffix = "gmax"; }
  else if ((m = n.match(/^Mega (.+?)(?: ([XY]))?(?: and [XY])?$/i))) { n = m[1]; suffix = "mega" + (m[2] ? "-" + m[2].toLowerCase() : ""); }
  else if ((m = n.match(/^Primal (.+)$/i))) { n = m[1]; suffix = "primal"; }
  else if ((m = n.match(/^Origin Forme (.+)$/i))) { n = m[1]; suffix = "origin"; }
  else if ((m = n.match(/^(Galarian|Hisuian|Alolan|Paldean) (.+)$/i))) { n = m[2]; suffix = { galarian: "galar", hisuian: "hisui", alolan: "alola", paldean: "paldea" }[m[1].toLowerCase()]; }
  const base = slug(n);
  if (!base) return { base: "", list: [] };
  const form = paren ? slug(paren) : "";
  const list = [];
  if (suffix && form) list.push(`${base}-${suffix}-${form}`);
  if (suffix) list.push(`${base}-${suffix}`);
  if (form) list.push(`${base}-${form}`);
  list.push(base);
  return { base, list: [...new Set(list)] };
}

// The main picture on an event's own page (its og:image), so an event can show a real image even when no infographic is on file.
// Pokebattler raid guides: each has a visual guide by CaptGoldfish. Guide pages are /raids/guides/BOSS_NAME, "Mega X" is X_MEGA.
export function guideSlug(name) {
  let n = String(name || "").trim();
  if (!/^[\p{L}0-9 .'’\-]{2,40}$/u.test(n)) return "";
  const mega = /^(Mega|Primal)\s+/i.test(n);
  n = n.replace(/^(Mega|Primal)\s+/i, "").replace(/\s+[XY]$/i, "");
  const slug = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return slug ? slug + (mega ? "_MEGA" : "") : "";
}
// Mega X/Y forms have no single known page name, so try the likely ones in order; a miss just means no image.
function baseGuideSlugs(name) {
  const base = guideSlug(name);
  if (!base) return [];
  const xy = /^(?:Mega|Primal)\s+.*\s+([XY])$/i.exec(String(name).trim());
  if (!xy) return [base];
  const b = base.replace(/_MEGA$/, ""), L = xy[1].toUpperCase();
  return [b + "_MEGA_" + L, b + "_" + L + "_MEGA", base];
}
// Tries the likely Pokebattler page names in order (a miss just means no image). Handles the cases a plain name gets wrong:
// "Mega Charizard X and Y" (one slot, two Pokémon: the X guide), named forms ("Zacian (Hero)" is ZACIAN_HERO_FORM, "Origin Forme Giratina"),
// and Pokémon whose page ends in _RAID (Xurkitree). Shadow bosses are left as they were.
export function guideSlugs(name) {
  let n = String(name || "").trim();
  if (!n || /^shadow\s/i.test(n)) return baseGuideSlugs(n);
  n = n.replace(/^((?:Mega|Primal)\s+.*?)\s+X\s+and\s+Y$/i, "$1 X");
  let form = "", m;
  if ((m = /^(.+?)\s*\(([A-Za-z]{3,12})\)$/.exec(n))) { n = m[1].trim(); form = m[2]; }
  else if ((m = /^([A-Za-z]{3,12})\s+Forme\s+(.+)$/i.exec(n))) { form = m[1]; n = m[2].trim(); }
  const base = baseGuideSlugs(n);
  if (!base.length) return [];
  if (form) { const b = guideSlug(n), f = form.toUpperCase(); return [b + "_" + f + "_FORM", b + "_" + f]; }
  const mega = /^(Mega|Primal)\s/i.test(n);
  return mega ? base : [...base, base[0] + "_RAID"];
}
export function guideImage(html) {
  const m = String(html || "").match(/https:\/\/static\.pokebattler\.com\/CaptGoldfish\/[A-Za-z0-9_\-]*Raid_Guide[A-Za-z0-9_\-]*\.(?:jpe?g|png|webp)/i);
  return m ? m[0] : "";
}
async function guideGet(url, ctx) {
  const slugs = guideSlugs(url.searchParams.get("boss") || "");
  if (!slugs.length) return json({ url: "" }, 400);
  let slug = slugs[0], page = "https://www.pokebattler.com/raids/guides/" + slug;
  const cache = caches.default, key = new Request(url.origin + "/api/guide?boss=" + slug);
  const hit = await cache.match(key);
  if (hit) return hit;
  let img = "";
  for (const sl of slugs) {
    try {
      const pg = "https://www.pokebattler.com/raids/guides/" + sl;
      const r = await fetch(pg, { cf: { cacheTtl: DAY, cacheEverything: true }, headers: { "user-agent": "GO-Field-Notes/1.0 (+https://pogo.michaelpuff.com)" } });
      if (r.ok) { img = guideImage((await r.text()).slice(0, 600000)); if (img) { page = pg; slug = sl; break; } }
    } catch {}
  }
  const res = json({ url: img, page, creator: "CaptGoldfish", source: "Pokebattler" }, 200);
  res.headers.set("cache-control", `public, max-age=${img ? DAY : 900}`);
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// Leek Duck puts a "Graphic" (raid guide, event graphic) on many event pages, hosted under /assets/img/events/. Icons and the banner are excluded.
export function pageGraphics(html) {
  const banner = ogImage(html), out = [];
  for (const m of String(html || "").matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    let u = m[1].trim().replace(/&amp;/g, "&").replace(/ /g, "%20");
    if (!/^https:\/\/(cdn\.)?leekduck\.com\/assets\/img\/events\//i.test(u) || /\/events\/icons\//i.test(u) || !/\.(jpe?g|png|webp)(\?|$)/i.test(u)) continue;
    if (u === banner || /default\.(jpe?g|png|webp)/i.test(u) || out.includes(u)) continue;
    out.push(u);
  }
  return out.slice(0, 3);
}
async function ogGet(url, ctx) {
  let u;
  try { u = new URL(url.searchParams.get("u") || ""); } catch { return json({ image: "" }, 400); }
  if (u.protocol !== "https:" || !OG_HOSTS.includes(u.hostname)) return json({ image: "" }, 400);
  const cache = caches.default, key = new Request(url.origin + "/api/og?u=" + encodeURIComponent(u.href));
  const hit = await cache.match(key);
  if (hit) return hit;
  let image = "", graphics = [];
  try {
    const r = await fetch(u.href, { cf: { cacheTtl: DAY, cacheEverything: true }, headers: { "user-agent": "GO-Field-Notes/1.0 (+https://pogo.michaelpuff.com)" } });
    if (r.ok) { const html = (await r.text()).slice(0, 400000); image = ogImage(html); graphics = pageGraphics(html); }
  } catch {}
  const res = json({ image, graphics }, 200);
  res.headers.set("cache-control", `public, max-age=${image ? DAY : 600}`);
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function pokeId(path) {
  const r = await fetch(POKEAPI + path, { cf: { cacheTtl: 30 * DAY, cacheEverything: true } });
  if (!r.ok) return 0;
  const d = await r.json();
  return Number(d.id) || 0;
}

async function art(request, env, ctx, url) {
  const name = (url.searchParams.get("n") || "").slice(0, 60);
  if (!/^[\p{L}0-9 ()'’.\-]+$/u.test(name)) return new Response("Bad name", { status: 400 });
  const shiny = url.searchParams.get("shiny") === "1";
  const shadow = url.searchParams.get("shadow") === "1";
  const dynamax = url.searchParams.get("dynamax") === "1";
  const gigantamax = /^Gigantamax\s/i.test(name);
  const costume = (url.searchParams.get("c") || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 40);
  const cache = caches.default;
  const key = new Request(url.origin + "/api/art?n=" + encodeURIComponent(name.toLowerCase()) + (shiny ? "&shiny=1" : "") + (shadow ? "&shadow=1" : "") + (dynamax ? "&dynamax=1" : "") + (costume ? "&c=" + costume : ""));
  const hit = await cache.match(key);
  if (hit) return hit;

  const { base, list } = artCandidates(name);
  let id = 0;
  for (const c of list) { id = await pokeId("pokemon/" + c); if (id) break; }
  if (!id && base) id = await pokeId("pokemon-species/" + base);

  let img = null;
  const sources = [];
  if (id && costume && id < 1100) sources.push(`${COSTUME_BASE}pm${id}.f${costume}${shiny ? ".s" : ""}.icon.png`); // costume art, only for base species
  // Shadow and Dynamax have no sprite of their own in the game files (the `_11` icons are costume art, e.g. a party hat),
  // so they use the normal artwork and the page draws the Shadow aura / Max smoke around it.
  if (id && dynamax && gigantamax && id < 1100) sources.push(`${COSTUME_BASE}pm${id}.fGIGANTAMAX${shiny ? ".s" : ""}.icon.png`);
  // A costume or Gigantamax sprite that does not exist is never swapped for ordinary artwork. The UI removes the image on 404.
  if (id && !costume && !(dynamax && gigantamax)) sources.push(`${ART_BASE}${shiny ? "shiny/" : ""}${id}.png`);
  for (const src of sources) {
    const r = await fetch(src, { cf: { cacheTtl: 30 * DAY, cacheEverything: true } });
    if (r.ok) { img = await r.arrayBuffer(); break; }
  }
  if (!img) {
    const miss = new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=600" } });
    ctx.waitUntil(cache.put(key, miss.clone()));
    return miss;
  }
  const res = new Response(img, { headers: { "content-type": "image/png", "cache-control": `public, max-age=${30 * DAY}, immutable` } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// ---------------------------------------------------------------- marks (Own / Hundo)

async function ensure(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS dex (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS pin_fails (at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS pin_fails_ip (ip_hash TEXT NOT NULL, at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS pin_fails_ip_lookup ON pin_fails_ip (ip_hash, at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS pin_fails_ip_cleanup ON pin_fails_ip (at)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS dm_state (k TEXT PRIMARY KEY, v TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS dm_new (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, dex INTEGER, seen INTEGER NOT NULL)"),
  ]);
}

async function same(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const p = new Uint8Array(x), q = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i];
  return diff === 0;
}

function cleanMarks(o, max = 400) {
  const out = {};
  if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const k of Object.keys(o).slice(0, max)) if (k.length <= 80 && o[k]) out[k] = 1;
  }
  return out;
}

// Best-attacker extras, keyed by name: { "Mega Lucario": { s: 1 shiny, x: 1 maxed out, v: 1 waiting on a move | 2 move learned } }
export function cleanBt(o) {
  const out = {};
  if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const k of Object.keys(o).slice(0, 500)) {
      const v = o[k]; if (k.length > 80 || !v || typeof v !== "object") continue;
      const e = {}; if (v.s) e.s = 1; if (v.x) e.x = 1; if (v.v === 1 || v.v === 2) e.v = v.v;
      if (Object.keys(e).length) out[k] = e;
    }
  }
  return out;
}

// Pokédex checklist marks, keyed by dex number: { own: {"25":1}, shiny: {...}, ... }
const DEX_CATS = ["own", "shiny", "lucky", "shadow", "purified", "hundo"];
function cleanDexMarks(m) {
  const out = {};
  for (const c of DEX_CATS) {
    out[c] = {};
    const src = m && typeof m === "object" ? m[c] : null;
    if (src && typeof src === "object" && !Array.isArray(src)) {
      for (const k of Object.keys(src).slice(0, 1200)) if (/^\d{1,4}$/.test(k) && +k >= 1 && +k <= 1100 && src[k]) out[c][k] = 1;
    }
  }
  for (const c of DEX_CATS) if (c !== "own") for (const k of Object.keys(out[c])) out.own[k] = 1; // anything marked is owned
  return out;
}

// Returns a Response when the PIN check fails, otherwise null. Throttle each source IP independently
// so one visitor cannot lock every legitimate device out. Store only a SHA-256 digest of the IP.
async function gate(request, env) {
  if (!env.SYNC_PIN) return json({ error: "Not switched on." }, 404); // unset secret (e.g. preview deploys): never match "undefined"
  await ensure(env);
  const now = Date.now();
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const ipHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM pin_fails_ip WHERE ip_hash = ? AND at > ?").bind(ipHash, now - 10 * 60 * 1000).first();
  if (n >= 10) return json({ error: "Too many wrong PINs from this address. Try again in 10 minutes." }, 429);
  const given = String(request.headers.get("x-pin") || "");
  if (!given || !(await same(given, env.SYNC_PIN))) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO pin_fails_ip (ip_hash, at) VALUES (?, ?)").bind(ipHash, now),
      env.DB.prepare("DELETE FROM pin_fails_ip WHERE at < ?").bind(now - 24 * 3600 * 1000),
    ]);
    return json({ error: "Wrong PIN." }, 401);
  }
  return null;
}

// Who is asking? The owner (sync PIN in x-pin, exactly as before) or an invited person with a session cookie.
// Returns { uid, owner, email } or { denied: Response }.
export async function whoIs(request, env) {
  if (request.headers.get("x-pin")) { const d = await gate(request, env); return d ? { denied: d } : { uid: "me", owner: true }; }
  const u = await auth.sessionUser(env.DB, request, Date.now());
  return u ? { uid: "u" + u.id, email: u.email } : { denied: json({ error: "Sign in first." }, 401) };
}
const ipHashOf = async request => auth.sha256(request.headers.get("cf-connecting-ip") || "unknown");
const withCookie = (res, tok, maxAge) => { res.headers.append("set-cookie", auth.sessionCookie(tok, maxAge)); return res; };
// The Indonesian (Rp) store prices and the Rp to A$ rate are for the owner only: a valid sync PIN, never an invited person's session.
// POST /api/jobs/run?job=soon|weekly&dry=1 (PIN). Runs one Telegram job now; dry=1 only shows what it would send.
async function jobsRun(request, env, url) {
  if (!request.headers.get("x-pin")) return json({ error: "Owner only." }, 401);
  const denied = await gate(request, env); if (denied) return denied;
  const dry = url.searchParams.get("dry") === "1", job = url.searchParams.get("job");
  if (!env.DB) return json({ error: "No database." }, 503);
  try {
    if (job === "weekly") return json(await jobs.runWeekly(env, { dry }));
    if (job === "soon") return json(await jobs.runSoon(env, { dry }));
    if (job === "discord") return json(await jobs.runDiscord(env));
  } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
  return json({ error: "job must be soon, weekly or discord" }, 400);
}

// Owner-only data is kept in the R2 bucket (private/places.json, private/prices.json), never in the public repo.
async function privateFile(env, name) {
  try { const o = env.MEDIA && await env.MEDIA.get("private/" + name + ".json"); if (o) return await o.json(); } catch (e) {}
  return name === "places" ? { places: [] } : { prices: [], tiers_idr: {} };
}
// Hotspot places: owner (sync PIN) or an invited, signed-in person. Never in the public site files.
async function placesPrivate(request, env) {
  if (!env.DB) return json({ error: "Not switched on." }, 503);
  const who = await whoIs(request, env); if (who.denied) return who.denied;
  const res = json(await privateFile(env, "places"), 200); res.headers.set("cache-control", "private, no-store"); return res;
}
async function pricesPrivate(request, env) {
  if (!request.headers.get("x-pin")) return json({ error: "Owner only." }, 401);
  const denied = await gate(request, env); if (denied) return denied;
  const res = json(await privateFile(env, "prices"), 200); res.headers.set("cache-control", "private, no-store"); return res;
}
async function authRoutes(request, env, url) {
  if (!env.DB || !env.SYNC_PIN) return json({ error: "Not switched on." }, 404);
  const p = url.pathname.replace("/api/auth/", ""), now = Date.now();
  if (p === "me" && request.method === "GET") {
    const who = await whoIs(request, env).catch(() => ({ denied: 1 }));
    return json(who.denied ? { signedIn: false } : { signedIn: true, owner: !!who.owner, email: who.email || "" });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!/^application\/json/.test(request.headers.get("content-type") || "")) return json({ error: "Bad request." }, 400);
  let body; try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  if (p === "register" || p === "login") {
    const r = await (p === "register" ? auth.register : auth.login)(env.DB, body || {}, await ipHashOf(request), now);
    return r.error ? json({ error: r.error }, r.status) : withCookie(json({ ok: true, email: r.email }), r.token);
  }
  if (p === "logout") { await auth.endSession(env.DB, request).catch(() => {}); return withCookie(json({ ok: true }), "0".repeat(64), 0); }
  // Owner-only below (sync PIN).
  const denied = await pinned(request, env); if (denied) return denied;
  if (p === "invite") return json(await auth.createInvite(env.DB, body && body.note, now));
  if (p === "create") { const r = await auth.setUser(env.DB, body || {}, now); return r.error ? json({ error: r.error }, r.status) : json({ ok: true, email: r.email, created: r.created }); }
  if (p === "users") return json({ users: await auth.listUsers(env.DB) });
  if (p === "remove") return json({ ok: await auth.removeUser(env.DB, body && body.email) });
  return json({ error: "Not found." }, 404);
}

async function dex(request, env) {
  if (!env.SYNC_PIN || !env.DB) return json({ error: "Sync is not switched on." }, 404);
  if (request.method !== "GET" && request.method !== "PUT") return json({ error: "Method not allowed." }, 405);
  const who = await whoIs(request, env);
  if (who.denied) return who.denied;
  const snapshot = (row) => {
    if (!row) return { have: {}, hundo: {}, m: cleanDexMarks({}), bt: {}, updated: 0 };
    let d = {}; try { d = JSON.parse(row.data); } catch { /* ignore */ }
    return { have: d.have || {}, hundo: d.hundo || {}, m: cleanDexMarks(d.m), bt: cleanBt(d.bt), updated: row.updated || 0 };
  };

  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT data, updated FROM dex WHERE id = ?").bind(who.uid).first();
    return json(snapshot(row));
  }

  let body; try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Bad request." }, 400);
  // New clients send the version returned by GET. Reject old whole-document writes: an old
  // tab must not overwrite marks saved by a newer device while it was offline.
  if (!Object.prototype.hasOwnProperty.call(body, "baseUpdated")) return json({ error: "Refresh the app before syncing your marks." }, 428);
  const baseUpdated = Number(body.baseUpdated);
  if (!Number.isSafeInteger(baseUpdated) || baseUpdated < 0) return json({ error: "Bad sync version." }, 400);

  const have = cleanMarks(body.have), hundo = cleanMarks(body.hundo);
  for (const k of Object.keys(hundo)) have[k] = 1; // a hundo is always owned
  const now = Date.now();
  const updated = Number.isFinite(body.updated) ? Math.max(1, Math.min(Math.floor(body.updated), now + 60000)) : now;
  const data = JSON.stringify({ have, hundo, m: cleanDexMarks(body.m), bt: cleanBt(body.bt) });
  const existing = await env.DB.prepare("SELECT data, updated FROM dex WHERE id = ?").bind(who.uid).first();
  if (!existing && baseUpdated !== 0) return json({ error: "conflict", ...snapshot(null) }, 409);

  // Compare-and-swap is performed in the upsert itself, not just in a preceding read, so two
  // devices cannot both write against the same revision. The revision always moves forward.
  const write = await env.DB.prepare("INSERT INTO dex (id, data, updated) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated = MAX(excluded.updated, dex.updated + 1) WHERE dex.updated = ?")
    .bind(who.uid, data, updated, baseUpdated).run();
  if (!write.meta || write.meta.changes !== 1) {
    const current = await env.DB.prepare("SELECT data, updated FROM dex WHERE id = ?").bind(who.uid).first();
    return json({ error: "conflict", ...snapshot(current) }, 409);
  }
  const saved = await env.DB.prepare("SELECT updated FROM dex WHERE id = ?").bind(who.uid).first();
  return json({ ok: true, updated: saved ? saved.updated : updated });
}

// ---------------------------------------------------------------- datamine watch

const GAME_MASTER = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json";
const HUB_FEED = "https://pokemongohub.net/post/tag/datamine/feed/";
const EVENTS = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json"; // Leek Duck's events, mirrored as JSON
const RELEASED = "https://pogoapi.net/api/v1/released_pokemon.json"; // community list of species already in GO

// Only the entries worth watching: Pokémon and forms, Mega/Primal evolutions, and moves.
// "V0800_POKEMON_NECROZMA_ULTRA" -> {kind:"pokemon", dex:800, name:"Necrozma Ultra"}
export function classify(id) {
  let m;
  if ((m = id.match(/^V(\d{4})_POKEMON_([A-Z0-9_]+)$/))) return { kind: "pokemon", dex: +m[1], name: pretty(m[2]) };
  if ((m = id.match(/^TEMPORARY_EVOLUTION_V(\d{4})_POKEMON_([A-Z0-9_]+)$/))) return { kind: "mega", dex: +m[1], name: pretty(m[2]) };
  if ((m = id.match(/^V(\d{4})_MOVE_([A-Z0-9_]+)$/))) return { kind: "move", dex: +m[1], name: pretty(m[2]) };
  return null;
}
const pretty = (s) => s.toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export function watchedIds(text) {
  const out = new Set();
  const re = /\n {8}"templateId":\s*"([^"]+)"/g; // top level entries only
  let m;
  while ((m = re.exec(text))) if (classify(m[1])) out.add(m[1]);
  return out;
}

export function parseFeed(xml) {
  const items = [];
  for (const block of String(xml).split("<item>").slice(1, 11)) {
    const get = (t) => ((block.match(new RegExp("<" + t + ">(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</" + t + ">")) || [])[1] || "").trim();
    const title = get("title").replace(/&#8217;|&#039;/g, "'").replace(/&amp;/g, "&").replace(/&#8211;/g, "-");
    const link = get("link");
    if (title && /^https:\/\//.test(link)) items.push({ title, link, date: Date.parse(get("pubDate")) || 0 });
  }
  return items;
}

export async function runDatamine(env) {
  await ensure(env);
  const now = Date.now();
  const log = [];
  try {
    const r = await fetch(GAME_MASTER, { cf: { cacheTtl: 0 } });
    if (!r.ok) throw new Error("game master " + r.status);
    const ids = watchedIds(await r.text());
    if (ids.size < 500) throw new Error("game master looked wrong (" + ids.size + " entries)"); // never overwrite with a bad download
    const prev = await env.DB.prepare("SELECT v FROM dm_state WHERE k = 'ids'").first();
    if (prev) {
      const old = new Set(JSON.parse(prev.v));
      const fresh = [...ids].filter((i) => !old.has(i));
      const stmts = fresh.slice(0, 500).map((i) => { const c = classify(i); return env.DB.prepare("INSERT OR IGNORE INTO dm_new (id, kind, name, dex, seen) VALUES (?, ?, ?, ?, ?)").bind(i, c.kind, c.name, c.dex, now); });
      if (stmts.length) await env.DB.batch(stmts);
      log.push("new:" + fresh.length);
    } else {
      await env.DB.prepare("INSERT OR REPLACE INTO dm_state (k, v) VALUES ('since', ?)").bind(String(now)).run();
      log.push("baseline:" + ids.size);
    }
    await env.DB.prepare("INSERT OR REPLACE INTO dm_state (k, v) VALUES ('ids', ?)").bind(JSON.stringify([...ids])).run();
    await env.DB.prepare("INSERT OR REPLACE INTO dm_state (k, v) VALUES ('checked', ?)").bind(String(now)).run();
  } catch (e) { log.push("game master failed: " + e.message); console.error(e); }
  try {
    const r = await fetch(HUB_FEED, { headers: { "user-agent": "go-field-notes/1.0 (personal tracker)" } });
    if (r.ok) {
      const posts = parseFeed(await r.text());
      if (posts.length) await env.DB.prepare("INSERT OR REPLACE INTO dm_state (k, v) VALUES ('posts', ?)").bind(JSON.stringify(posts)).run();
      log.push("posts:" + posts.length);
    } else log.push("feed " + r.status);
  } catch (e) { log.push("feed failed: " + e.message); }
  try { log.push(await updatePvp(env, now)); } catch (e) { log.push("pvp failed: " + e.message); console.error(e); }
  try { log.push(await updateUnreleased(env, now)); } catch (e) { log.push("unreleased failed: " + e.message); console.error(e); }
  return log;
}

// ---- status of the tracked unreleased list (data.json -> upcoming.dd), promoted automatically, never demoted:
//   Not announced -> Datamined (name appears in a new game-data entry or a Pokémon GO Hub datamine headline)
//   -> Announced (name appears in a current or future Leek Duck event)
const rank = { "Not announced": 0, Datamined: 1, Announced: 2 };
const speciesOf = (n) => n.replace(/^(Gigantamax|Mega|Dynamax)\s+/i, "").replace(/\s*\(.*\)\s*/, "").trim();
const lc = (x) => String(x).toLowerCase();

function eventText(e) {
  const names = [e.name];
  (function walk(o) { if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === "name" && typeof v === "string") names.push(v); else walk(v); } })(e.extraData);
  return names.join(" | ");
}

export function trackedItems(data) {
  const out = [];
  for (const sec of (data.upcoming && data.upcoming.dd) || []) {
    const walk = (g, label) => {
      for (const i of g.items || []) out.push({ s: sec.id, g: label, n: i.n, base: g.status, skip: i.art && i.art.length === 0 });
      for (const sub of g.groups || []) walk(sub, sub.label);
    };
    for (const g of sec.groups) walk(g, "");
  }
  return out;
}

// Species whose debut event has already started, from our own dated events (data.json events with a Debut tag or DEBUT highlights).
// The community released list can lag by weeks, and a later event (Minior's next shower) must not turn a Pokémon that is already in the game back into "Announced".
export function debutedSpecies(events, nowMs) {
  const out = new Map();
  for (const e of events || []) {
    const start = Date.parse(e && e.s);
    if (!Number.isFinite(start) || start > nowMs) continue;
    const add = (n) => { const k = lc(speciesOf(String(n))); if (k.length > 2 && !out.has(k)) out.set(k, e.t || "an event"); };
    for (const h of e.highlights || []) { const m = h && h.type === "debut" && /^\s*DEBUT\s*[·:-]\s*(.+)$/i.exec(String(h.label || "")); if (m) add(m[1].split("(")[0].trim()); }
    if ((e.tags || []).includes("Debut")) for (const a of e.art || []) add(a);
  }
  return out;
}

export function computeStatuses(items, events, posts, fresh, released, nowMs, debuts = new Map()) {
  const live = events.filter((e) => e.start && Date.parse(e.start) + 3 * 86400000 >= nowMs);
  const out = [];
  for (const it of items) {
    const rec = { s: it.s, n: it.n, status: it.base };
    const sp = lc(speciesOf(it.n));
    if (!it.skip && sp.length > 2) {
      const need = it.s === "dynamax" ? /dynamax/i : it.s === "giga" || /^Gigantamax /i.test(it.n) ? /gigantamax/i : /^Mega /i.test(it.n) ? /mega/i : null;
      // A Pokémon named in an event that has already started (a spawn, raid boss or hatch) is in the game, whatever any later event says.
      if (it.s === "unreleased" && !need) {
        const started = events.find((e) => e.start && Date.parse(e.start) <= nowMs && lc(eventText(e)).includes(sp));
        if (started) { rec.status = "Released"; rec.srcLabel = "In the game: " + started.name; rec.srcUrl = started.link; out.push(rec); continue; }
      }
      if (it.s === "unreleased" && !need && debuts.has(sp)) { rec.status = "Released"; rec.srcLabel = "Debuted in " + debuts.get(sp); out.push(rec); continue; }
      if (it.s === "unreleased" && !/^Mega /i.test(it.n) && released.has(sp)) { rec.status = "Released"; rec.srcLabel = "Listed as released by PoGoAPI"; out.push(rec); continue; }
      const ev = live.find((e) => { const t = eventText(e); return lc(t).includes(sp) && (!need || need.test(t)); });
      const post = posts.find((p) => lc(p.title).includes(sp) && (!need || need.test(p.title)) && p.date > nowMs - 120 * 86400000);
      const dm = fresh.find((f) => lc(f.name).includes(sp));
      let status = rec.status, when = 0, srcLabel = "", srcUrl = "";
      if (rank[status] <= 1 && (post || dm)) { status = "Datamined"; if (post) { srcLabel = "Pokémon GO Hub: " + post.title; srcUrl = post.link; when = post.date; } else { srcLabel = "PokéMiners game data"; when = dm.seen; } }
      if (ev) { status = "Announced"; srcLabel = ev.name; srcUrl = ev.link; when = Date.parse(ev.start); }
      if (status !== rec.status || ev || srcLabel) Object.assign(rec, { status, when, srcLabel, srcUrl });
    }
    out.push(rec);
  }
  return out;
}

// What changed since the last run, for the Leaks tab's "This week". The first ever run records nothing.
export function statusChanges(prev, tracked, items, nowMs) {
  if (!prev) return [];
  const base = new Map(tracked.map((t) => [t.s + "|" + t.n, t.base]));
  const was = new Map((prev.items || []).map((i) => [i.s + "|" + i.n, i.status]));
  const out = [];
  for (const i of items) {
    const k = i.s + "|" + i.n, before = prev.snap ? prev.snap[k] : (was.get(k) ?? base.get(k));
    if (before && before !== i.status) out.push({ s: i.s, n: i.n, from: before, to: i.status, at: nowMs, label: i.srcLabel || "" });
  }
  return out;
}
// Once a Pokémon has been seen as Released it stays Released, even if the event that proved it later drops out of the feeds.
export function keepReleased(prev, items) {
  if (!prev) return items;
  const label = new Map((prev.items || []).map((i) => [i.s + "|" + i.n, i]));
  for (const i of items) {
    const k = i.s + "|" + i.n, before = prev.snap ? prev.snap[k] : (label.get(k) || {}).status;
    if (before === "Released" && i.status !== "Released") { i.status = "Released"; i.srcLabel = (label.get(k) || {}).srcLabel || "In the game"; i.srcUrl = (label.get(k) || {}).srcUrl || ""; }
  }
  return items;
}

async function updateUnreleased(env, now) {
  if (!env.ASSETS) return "unreleased: no assets";
  const data = await (await env.ASSETS.fetch(new Request("https://assets.local/data.json"))).json();
  let events = []; try { const r = await fetch(EVENTS); if (r.ok) events = await r.json(); } catch { /* keep going */ }
  let released = new Set(); try { const r = await fetch(RELEASED); if (r.ok) { const j = await r.json(); const names = Object.values(j).map((x) => lc(x.name || "")); if (names.length > 800) released = new Set(names); } } catch { /* optional source */ }
  const st = {};
  for (const r of (await env.DB.prepare("SELECT k, v FROM dm_state WHERE k = 'posts'").all()).results) st[r.k] = r.v;
  let posts = []; try { posts = JSON.parse(st.posts || "[]"); } catch { /* ignore */ }
  const fresh = (await env.DB.prepare("SELECT name, seen FROM dm_new ORDER BY seen DESC LIMIT 500").all()).results;
  const wanted = Array.isArray(events) ? events.filter((e) => e.start && /^(wild-area|pokemon-go-tour|go-fest|safari-zone|city-safari)$/.test(e.eventType)).map((e) => ({ t: e.name, s: e.start, e: e.end, link: e.link, type: e.eventType })) : [];
  if (wanted.length) await env.DB.prepare("INSERT OR REPLACE INTO dm_state (k, v) VALUES ('world', ?)").bind(JSON.stringify(wanted)).run();
  const shin = shinyList(Array.isArray(events) ? events : [], now);
  if (shin.length) await env.DB.prepare("INSERT OR REPLACE INTO dm_state (k, v) VALUES ('shiny', ?)").bind(JSON.stringify(shin)).run();
  const tracked = trackedItems(data);
  let prev = null; try { const row = await env.DB.prepare("SELECT v FROM dm_state WHERE k = 'unrel'").first(); if (row) prev = JSON.parse(row.v); } catch { /* first run */ }
  const items = keepReleased(prev, computeStatuses(tracked, Array.isArray(events) ? events : [], posts, fresh, released, now, debutedSpecies(data.events, now)));
  const changes = [...statusChanges(prev, tracked, items, now), ...((prev && prev.changes) || [])].filter((c) => c.at > now - 60 * 86400000).slice(0, 100);
  const snap = Object.fromEntries(items.map((i) => [i.s + "|" + i.n, i.status]));
  await env.DB.prepare("INSERT OR REPLACE INTO dm_state (k, v) VALUES ('unrel', ?)").bind(JSON.stringify({ updated: now, events: events.length, released: released.size, items: items.filter((i) => i.srcLabel || i.status === "Released"), snap, changes })).run();
  return "unreleased:" + items.length + " (events " + events.length + ", released list " + released.size + ")";
}

async function unreleasedGet(env) {
  if (!env.DB) return json({ error: "Not switched on." }, 404);
  await ensure(env);
  const row = await env.DB.prepare("SELECT v FROM dm_state WHERE k = 'unrel'").first();
  const body = row ? JSON.parse(row.v) : { updated: 0, items: [] };
  delete body.snap; // internal: the last status of every tracked item
  const res = json(body);
  res.headers.set("cache-control", "public, max-age=600");
  return res;
}

async function datamineGet(env) {
  if (!env.DB) return json({ error: "Not switched on." }, 404);
  await ensure(env);
  const st = {};
  for (const r of (await env.DB.prepare("SELECT k, v FROM dm_state WHERE k IN ('checked','since','posts')").all()).results) st[r.k] = r.v;
  const items = (await env.DB.prepare("SELECT id, kind, name, dex, seen FROM dm_new ORDER BY seen DESC, dex DESC LIMIT 300").all()).results;
  let posts = []; try { posts = JSON.parse(st.posts || "[]"); } catch { /* ignore */ }
  const res = json({ checked: +st.checked || 0, since: +st.since || 0, items, posts });
  res.headers.set("cache-control", "public, max-age=600");
  return res;
}

async function datamineRun(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!env.SYNC_PIN || !env.DB) return json({ error: "Not switched on." }, 404);
  const denied = await gate(request, env);
  if (denied) return denied;
  return json({ ok: true, log: await runDatamine(env) });
}

// ---------------------------------------------------------------- calendar (.ics)

const icsText = (t) => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (iso) => iso.replace(/[-:]/g, "").slice(0, 15); // 2026-10-10T14:00 -> 20261010T1400 + 00
const day = (iso) => iso.slice(0, 10).replace(/-/g, "");
const nextDay = (iso) => { const d = new Date(iso.slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10).replace(/-/g, ""); };

function fold(line) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let i = 0, first = true;
  while (i < bytes.length) {
    let n = first ? 75 : 74;
    if (i + n < bytes.length) while (n > 0 && (bytes[i + n] & 0xc0) === 0x80) n--; // never split a multi-byte character
    out.push((first ? "" : " ") + dec.decode(bytes.slice(i, i + n)));
    i += n; first = false;
  }
  return out.join("\r\n");
}

// Times are "floating" (no time zone) because Pokémon GO events happen at 6 pm or 2 pm wherever you are.
export function buildIcs(data, nowMs = Date.now()) {
  const stampNow = new Date(nowMs).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GO Field Notes//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:GO Field Notes", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"];
  const cutoff = new Date(nowMs - 7 * 86400000).toISOString().slice(0, 10);
  const add = (uid, title, start, end, desc, alarm, allDay) => {
    if ((end || start).slice(0, 10) < cutoff) return;
    lines.push("BEGIN:VEVENT", "UID:" + uid + "@pogo.michaelpuff.com", "DTSTAMP:" + stampNow, "SUMMARY:" + icsText(title));
    if (allDay) lines.push("DTSTART;VALUE=DATE:" + day(start), "DTEND;VALUE=DATE:" + nextDay(end || start));
    else lines.push("DTSTART:" + stamp(start) + "00", "DTEND:" + stamp(end) + "00");
    if (desc) lines.push("DESCRIPTION:" + icsText(desc));
    if (alarm) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsText(title), "TRIGGER:-PT" + alarm + "M", "END:VALARM");
    lines.push("END:VEVENT");
  };
  for (const e of data.events || []) {
    const allDay = e.s.endsWith("T00:00") && e.e.endsWith("T23:59");
    const hours = (Date.parse(e.e + ":00Z") - Date.parse(e.s + ":00Z")) / 3600000;
    add("ev-" + e.id, e.t, e.s, e.e, (e.p || []).join(" "), !allDay && hours <= 8 ? 30 : 0, allDay);
  }
  for (const x of data.spotlight || []) add("spot-" + x.d, x.n + " Spotlight Hour", x.d + "T18:00", x.d + "T19:00", x.b || "", 30);
  for (const x of data.raidHour || []) add("raidhour-" + x.d, x.n + " Raid Hour", x.d + "T18:00", x.d + "T19:00", "", 30);
  for (const w of data.worldEvents || []) if (w.kind === "event") add("world-" + w.s + "-" + w.t.replace(/[^A-Za-z0-9]+/g, "-"), "World: " + w.t, w.s, w.e || w.s, w.where + (w.note ? ". " + w.note : ""), 0, true);
  for (const [a, b, n] of data.maxBattles || []) add("max-" + a, "Max Battles: Dynamax " + n, a, b, "Weekly Max Battle Pokémon at Power Spots.", 0, true);
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

async function calendar(env) {
  const data = await (await env.ASSETS.fetch(new Request("https://assets.local/data.json"))).json();
  return new Response(buildIcs(data), { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "public, max-age=1800", "content-disposition": "inline; filename=go-field-notes.ics" } });
}

// ---------------------------------------------------------------- PvP rankings (PvPoke)

const PVP = { great: 1500, ultra: 2500, master: 10000 };
const pvpUrl = (cp) => `https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-${cp}.json`;
const moveName = (id) => String(id).toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").replace(/ Plus$/i, "+");

export function trimRankings(list, n = 40) {
  return (Array.isArray(list) ? list : []).slice(0, n).map((x) => ({
    name: x.speciesName, score: x.score, fast: moveName((x.moveset || [])[0] || ""), charged: (x.moveset || []).slice(1).map(moveName),
  }));
}

async function updatePvp(env, now) {
  const out = {};
  for (const [lg, cp] of Object.entries(PVP)) {
    const r = await fetch(pvpUrl(cp));
    if (!r.ok) throw new Error("pvpoke " + cp + " " + r.status);
    const t = trimRankings(await r.json());
    if (t.length < 20) throw new Error("pvpoke " + cp + " looked wrong");
    out[lg] = t;
  }
  await env.DB.prepare("INSERT OR REPLACE INTO dm_state (k, v) VALUES ('pvp', ?)").bind(JSON.stringify({ updated: now, leagues: out })).run();
  return "pvp:ok";
}

async function pvpGet(env) {
  if (!env.DB) return json({ error: "Not switched on." }, 404);
  await ensure(env);
  const row = await env.DB.prepare("SELECT v FROM dm_state WHERE k = 'pvp'").first();
  if (!row) return json({ error: "Not ready." }, 404);
  const res = json(JSON.parse(row.v));
  res.headers.set("cache-control", "public, max-age=1800");
  return res;
}

async function worldGet(env) {
  if (!env.DB) return json({ error: "Not switched on." }, 404);
  await ensure(env);
  const row = await env.DB.prepare("SELECT v FROM dm_state WHERE k = 'world'").first();
  const res = json({ events: row ? JSON.parse(row.v) : [] });
  res.headers.set("cache-control", "public, max-age=1800");
  return res;
}

// Pokémon that Leek Duck's data says can be shiny in events starting between 3 days ago and 3 weeks ahead.
export function shinyList(events, nowMs) {
  const out = [], seen = new Set();
  for (const e of events) {
    if (!e.start || /Z$/.test(e.start)) continue; // floating local times only
    const t = Date.parse(e.start + (e.start.length <= 16 ? ":00Z" : "Z").replace("ZZ", "Z"));
    if (!(t >= nowMs - 3 * 86400000 && t <= nowMs + 21 * 86400000)) continue;
    (function walk(o) {
      if (!o || typeof o !== "object") return;
      if (o.canBeShiny === true && typeof o.name === "string") {
        const k = o.name + "|" + e.name;
        if (!seen.has(k)) { seen.add(k); out.push({ n: o.name, s: e.start, e: e.end || "", src: e.name, link: e.link, type: e.eventType }); }
      }
      for (const v of Object.values(o)) walk(v);
    })(e.extraData);
  }
  return out.slice(0, 150);
}

async function shiniesGet(env) {
  if (!env.DB) return json({ error: "Not switched on." }, 404);
  await ensure(env);
  const row = await env.DB.prepare("SELECT v FROM dm_state WHERE k = 'shiny'").first();
  const res = json({ items: row ? JSON.parse(row.v) : [] });
  res.headers.set("cache-control", "public, max-age=1800");
  return res;
}

// ---------------------------------------------------------------- Phase 1 pipeline (see src/pipeline.js)

async function assetData(env, file = "data.json") {
  try { return await (await env.ASSETS.fetch(new Request("https://assets.local/" + file))).json(); } catch { return {}; }
}
async function runPipelineNow(env) {
  return pipe.runPipeline(env.DB, Date.now(), (u, o) => fetch(u, o), await assetData(env));
}
// Which environment is this? ENVIRONMENT is set only by the [previews.vars] block in wrangler.toml, so production reports "production".
const envInfo = (env) => ({ environment: env.ENVIRONMENT === "preview" ? "preview" : "production", database: !!env.DB });
const noStore = (res, secs) => { res.headers.set("cache-control", secs ? `public, max-age=${secs}` : "no-store"); return res; };

async function eventsGet(env, url) {
  if (!env.DB || !(await pipe.pipelineReady(env.DB))) {
    // Live, read-only fallback: fetch and validate the upstream feed without creating tables or storing anything.
    const preview = await readOnlyPreview(env);
    if (preview.leekduck && preview.leekduck.ok && Array.isArray(preview.events) && preview.events.length >= 10) {
      let events = preview.events.map((e) => ({ ...e, reports: [{ source: "leekduck", status: e.status, link: e.link }] }));
      if (url.searchParams.get("type")) events = events.filter((e) => e.type === url.searchParams.get("type"));
      return noStore(json({ ...envInfo(env), enabled: true, readOnly: true, events, sources: [{ id: "leekduck", name: "Leek Duck (via ScrapedDuck)", state: "read_only_preview", lastChecked: preview.at }], note: "Live read-only preview. Nothing is stored; the background pipeline remains off." }), 300);
    }
    return noStore(json({ ...envInfo(env), enabled: false, readOnly: true, events: [], sources: [], note: "The live feed could not be validated. The app is using its curated data.json fallback; no data was stored." }), 60);
  }
  const res = await pipe.listEvents(env.DB, Date.now(), { type: url.searchParams.get("type") || "", includePast: url.searchParams.get("past") === "1" });
  return noStore(json({ ...envInfo(env), enabled: true, readOnly: false, ...res }), 300);
}
async function historyGet(env, url) {
  if (!env.DB || !(await pipe.pipelineReady(env.DB))) return json({ history: [] });
  return noStore(json({ history: await pipe.eventHistory(env.DB, String(url.searchParams.get("id") || "")) }), 300);
}
async function sourcesGet(env) {
  if (!env.DB || !(await pipe.pipelineReady(env.DB))) {
    const preview = await readOnlyPreview(env);
    if (preview.leekduck && preview.leekduck.ok && Array.isArray(preview.events) && preview.events.length >= 10) {
      const checked = preview.at;
      const sources = [{ id: "leekduck", name: "Leek Duck (via ScrapedDuck)", kind: "community", state: "fresh", lastOk: checked, lastChecked: checked, lastChanged: null, sourceUpdated: null, failStreak: 0, note: "Fetched and validated in read-only mode. No database writes; the background pipeline remains off." }];
      return noStore(json({ ...envInfo(env), enabled: true, readOnly: true, now: Date.now(), feed: { state: "fresh", lastSuccess: checked, lastAttempt: checked, note: "Read-only live preview; nothing is stored." }, sources }), 300);
    }
    return noStore(json({ ...envInfo(env), enabled: false, readOnly: true, sources: [], note: "Live feed unavailable; showing the curated snapshot." }), 60);
  }
  const now = Date.now(), sources = await pipe.listSources(env.DB, now);
  return noStore(json({ ...envInfo(env), enabled: true, readOnly: false, now, feed: pipe.feedFreshness(sources, now), sources }), 300);
}
let previewMemo = { at: 0, body: null };
async function readOnlyPreview(env) {
  const now = Date.now();
  const cachedOk = previewMemo.body && previewMemo.body.leekduck && previewMemo.body.leekduck.ok;
  // Cache healthy feeds for five minutes; retry failed fetches rather than pinning a transient outage.
  if (!cachedOk || now - previewMemo.at > 5 * 60 * 1000) previewMemo = { at: now, body: await pipe.preview((u, o) => fetch(u, o), await assetData(env), now) };
  return previewMemo.body;
}
async function pipelinePreview(env) { // read-only: never touches D1
  return noStore(json(await readOnlyPreview(env)), 0);
}
async function pipelineRun(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!env.SYNC_PIN || !env.DB) return json({ error: "Not switched on." }, 404);
  const denied = await gate(request, env);
  if (denied) return denied;
  return json({ ok: true, log: await runPipelineNow(env) });
}

// ---------------------------------------------------------------- Phase 4: synced personal state (PIN)

async function pinned(request, env) {
  if (!env.SYNC_PIN || !env.DB) return json({ error: "Sync is not switched on." }, 404);
  return gate(request, env);
}
// Infographic review: the owner approves or rejects pictures in the app; the nightly job reads these decisions.
// Reading is public (ids and event names only). Writing needs the sync PIN.
export function cleanDecision(b) {
  const id = String(b && b.id || ""), status = String(b && b.status || "");
  if (!/^[a-z0-9:_.-]{1,90}$/i.test(id) || !["approved", "rejected", "reset", "unlinked", "week", "month"].includes(status)) return null;
  // An infographic can sit on several events: ids are comma-separated, titles are separated by " | ", in the same order.
  const eventId = String(b.eventId || "").slice(0, 700), eventTitle = String(b.eventTitle || "").replace(/[<>]/g, "").slice(0, 900);
  if (status === "approved" && !/^[\w:.-]{1,90}(,[\w:.-]{1,90}){0,7}$/.test(eventId)) return null;
  return { id, status, eventId: status === "approved" ? eventId : "", eventTitle: status === "approved" ? eventTitle : "" };
}
async function igDecisions(request, env) {
  if (!env.DB) return json({ decisions: [] });
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS ig_decisions (id TEXT PRIMARY KEY, status TEXT NOT NULL, event_id TEXT NOT NULL, event_title TEXT NOT NULL, at INTEGER NOT NULL)").run();
  if (request.method === "GET") {
    const rows = (await env.DB.prepare("SELECT id, status, event_id, event_title, at FROM ig_decisions ORDER BY at DESC LIMIT 500").all()).results || [];
    return json({ decisions: rows.map(r => ({ id: r.id, status: r.status, eventId: r.event_id, eventTitle: r.event_title, at: r.at })) });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const denied = await pinned(request, env); if (denied) return denied;
  let body; try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  const d = cleanDecision(body); if (!d) return json({ error: "Bad decision." }, 400);
  if (d.status === "reset") await env.DB.prepare("DELETE FROM ig_decisions WHERE id = ?").bind(d.id).run();
  else await env.DB.prepare("INSERT INTO ig_decisions (id, status, event_id, event_title, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, event_id = excluded.event_id, event_title = excluded.event_title, at = excluded.at").bind(d.id, d.status, d.eventId, d.eventTitle, Date.now()).run();
  return json({ ok: true });
}
// Taps on the Approve / Reject buttons under infographics in Telegram (see telegram.js). Stored like a tap in the app.
const INBOX_SQL = "CREATE TABLE IF NOT EXISTS tg_inbox (id TEXT PRIMARY KEY, file_id TEXT NOT NULL, caption TEXT NOT NULL, msg INTEGER NOT NULL, at INTEGER NOT NULL)";
// Pictures sent to the bot. Only the infographic check (which holds the bot token) may read or clear them: it proves that with the same
// token-derived handshake Telegram uses. GET lists them; POST { ids } clears the ones it has taken.
// Read by the infographic check (same token-derived handshake as the inbox): which Telegram message holds each picture the Worker forwarded.
async function discordSentRoute(request, env) {
  if (!env.DB || !env.TELEGRAM_BOT_TOKEN || request.method !== "GET") return json({ error: "Not switched on." }, 404);
  const given = request.headers.get("x-hook-secret") || "", want = await tgm.hookSecret(env.TELEGRAM_BOT_TOKEN);
  if (given.length !== want.length || [...given].reduce((d, ch, i) => d | (ch.charCodeAt(0) ^ want.charCodeAt(i)), 0) !== 0) return json({ error: "Not allowed." }, 401);
  return json({ sent: await jobs.discordSent(env) });
}
async function tgInbox(request, env) {
  if (!env.DB || !env.TELEGRAM_BOT_TOKEN) return json({ error: "Not switched on." }, 404);
  const given = request.headers.get("x-hook-secret") || "", want = await tgm.hookSecret(env.TELEGRAM_BOT_TOKEN);
  if (given.length !== want.length || [...given].reduce((d, ch, i) => d | (ch.charCodeAt(0) ^ want.charCodeAt(i)), 0) !== 0) return json({ error: "Not allowed." }, 401);
  await env.DB.prepare(INBOX_SQL).run();
  if (request.method === "GET") return json({ items: ((await env.DB.prepare("SELECT id, file_id, caption, msg, at FROM tg_inbox ORDER BY at LIMIT 20").all()).results || []).map(r => ({ id: r.id, fileId: r.file_id, caption: r.caption, msg: r.msg, at: r.at })) });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  let body; try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  for (const id of (Array.isArray(body.ids) ? body.ids : []).slice(0, 20)) if (/^[a-z0-9_-]{1,64}$/i.test(String(id))) await env.DB.prepare("DELETE FROM tg_inbox WHERE id = ?").bind(String(id)).run();
  return json({ ok: true });
}
async function telegramHook(request, env) {
  if (!env.DB) return json({ error: "Not switched on." }, 404);
  const r = await tgm.handleHook(request, {
    env, fetchFn: (u, o) => fetch(u, o), queue: await assetData(env, "infographic-queue.json"),
    current: async id => { try { const r = await env.DB.prepare("SELECT id, status, event_id, event_title FROM ig_decisions WHERE id = ?").bind(id).first(); return r ? { id: r.id, status: r.status, eventId: r.event_id, eventTitle: r.event_title } : null; } catch { return null; } },
    saveInbox: async ph => { await env.DB.prepare(INBOX_SQL).run(); await env.DB.prepare("INSERT OR IGNORE INTO tg_inbox (id, file_id, caption, msg, at) VALUES (?, ?, ?, ?, ?)").bind(ph.uniq, ph.fileId, ph.caption, ph.msgId || 0, Date.now()).run(); },
    save: async d => {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS ig_decisions (id TEXT PRIMARY KEY, status TEXT NOT NULL, event_id TEXT NOT NULL, event_title TEXT NOT NULL, at INTEGER NOT NULL)").run();
      const c = cleanDecision(d); if (!c) return;
      if (c.status === "reset") { await env.DB.prepare("DELETE FROM ig_decisions WHERE id = ?").bind(c.id).run(); return; }
      await env.DB.prepare("INSERT INTO ig_decisions (id, status, event_id, event_title, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, event_id = excluded.event_id, event_title = excluded.event_title, at = excluded.at").bind(c.id, c.status, c.eventId, c.eventTitle, Date.now()).run();
    }
  });
  return json({ ok: r.status === 200 }, r.status);
}
async function userstateInit(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const denied = await pinned(request, env); if (denied) return denied;
  await pipe.migrate(env.DB, Date.now()); // additive migrations only
  return json({ ok: true });
}
async function userstate(request, env, url) {
  if (request.method !== "GET" && request.method !== "PUT") return json({ error: "Method not allowed." }, 405);
  if (!env.SYNC_PIN || !env.DB) return json({ error: "Sync is not switched on." }, 404);
  const who = await whoIs(request, env); if (who.denied) return who.denied;
  const uid = who.owner ? "" : who.uid;
  if (!(await us.stateReady(env.DB))) return json({ enabled: false, note: "Run /api/userstate/init once to create the table." });
  const now = Date.now();
  let applied = null;
  if (request.method === "PUT") {
    let body; try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
    const { entries, rejected } = us.cleanEntries(body, now);
    applied = { ...(await us.writeEntries(env.DB, entries, uid)), rejected: rejected.length };
  }
  const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
  return json({ enabled: true, now, entries: await us.readAll(env.DB, since, uid), applied });
}

// ---------------------------------------------------------------- Phase 5: notifications

async function notifyNow(env) {
  return nt.runNotify(env, env.DB, Date.now(), (u, o) => fetch(u, o), { listEvents: pipe.listEvents, pageFetch: (u, o) => fetch(u, o), dexList: (await assetData(env, "dex.json")) || [] });
}
async function notifyStatus(request, env) {
  const denied = await pinned(request, env); if (denied) return denied;
  const ready = await nt.notifyReady(env.DB);
  const out = { tablesCreated: ready, switchedOn: env.NOTIFY === "1", telegramConfigured: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID), pushConfigured: !!(env.VAPID_PUBLIC && env.VAPID_PRIVATE) };
  if (ready) {
    out.pushKeyInDatabase = !!(await env.DB.prepare("SELECT 1 AS x FROM notif_state WHERE k='vapid'").first());
    out.pushDevices = (await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subs").first()).n;
    out.recent = (await env.DB.prepare("SELECT kind, level, title, created_at, telegram, push FROM notif_sent ORDER BY created_at DESC LIMIT 10").all()).results;
    const lr = await env.DB.prepare("SELECT v FROM notif_state WHERE k='last_run'").first(); out.lastRun = lr ? Number(lr.v) : null;
  }
  return json(out);
}
async function notifyTest(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const denied = await pinned(request, env); if (denied) return denied;
  const tg = await nt.sendTelegram(env, "GO Field Notes: test message. If you can read this, Telegram alerts are connected.", (u, o) => fetch(u, o));
  return json({ telegram: tg });
}
async function notifyTestReminder(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const denied = await pinned(request, env); if (denied) return denied;
  return json(await jobs.runTestReminder(env, { pageFetch: (u, o) => fetch(u, o) }));
}
// Return venue and viewer clocks separately. The requested IANA zone is validated; invalid values fall back safely.
function venueViewerTimeZone(url) {
  const requested = (url.searchParams.get("tz") || "").trim().slice(0, 64);
  if (!requested) return "Australia/Melbourne";
  try { new Intl.DateTimeFormat("en-AU", { timeZone: requested }).format(0); return requested; }
  catch { return "Australia/Melbourne"; }
}
async function venueTimesGet(url, env) {
  const details = await assetData(env, "event-details.json"), all = venueItems(details);
  const viewerTimeZone = venueViewerTimeZone(url);
  let out;
  if (url.searchParams.get("all") === "1") {
    const cut = Date.now() - 2 * 864e5;
    const dateOf = ms => new Intl.DateTimeFormat("en-CA", { timeZone: viewerTimeZone }).format(new Date(ms));
    out = all.filter(v => v.ms > cut).slice(0, 40).map(v => ({
      name: v.name, date: dateOf(v.ms), ms: v.ms, endMs: v.endMs || 0, link: v.link || "",
      ...describeVenue(v, viewerTimeZone)
    }));
  } else {
    const name = (url.searchParams.get("name") || "").slice(0, 200), day = s => /^\d{4}-\d\d-\d\d/.test(s || "") ? s.slice(0, 10) : "";
    const hit = venueFor(name, day(url.searchParams.get("start")), day(url.searchParams.get("end")), all, viewerTimeZone);
    const own = hit.filter(v => v.name.toLowerCase() === name.toLowerCase());
    out = (own.length ? own : hit).slice(0, 4).map(v => ({
      name: v.name, ms: v.ms, endMs: v.endMs || 0, link: v.link || "",
      ...describeVenue(v, viewerTimeZone)
    }));
  }
  const res = json({ items: out });
  res.headers.set("cache-control", "public, max-age=600");
  return res;
}
async function notifyRun(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const denied = await pinned(request, env); if (denied) return denied;
  return json({ ok: true, log: await notifyNow(env) });
}
async function pushKey(request, env) {
  const denied = await pinned(request, env); if (denied) return denied;
  if (!(await nt.notifyReady(env.DB))) return json({ error: "Create the tables first (run /api/userstate/init)." }, 409);
  let k = await nt.vapidKeys(env, env.DB);
  if (!k && request.method === "POST") k = await nt.vapidCreate(env.DB);
  return json(k ? { publicKey: k.pub, source: k.from } : { publicKey: null });
}
async function pushSubscribe(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const denied = await pinned(request, env); if (denied) return denied;
  let b; try { b = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  if (!nt.okPushEndpoint(b && b.endpoint)) return json({ error: "That push address isn't from a known push service." }, 400);
  const id = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(b.endpoint)))].map((x) => x.toString(16).padStart(2, "0")).join("");
  await env.DB.prepare("INSERT INTO push_subs (id, endpoint, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, fail_count = 0").bind(id, b.endpoint, Date.now()).run();
  return json({ ok: true, id });
}
// The service worker reads the newest message back using the hash of its own push address as a key.
async function notifyLatest(env, url) {
  const s = url.searchParams.get("s") || "";
  if (!env.DB || !/^[0-9a-f]{64}$/.test(s) || !(await nt.notifyReady(env.DB))) return json({ error: "Not found." }, 404);
  if (!(await env.DB.prepare("SELECT 1 AS x FROM push_subs WHERE id = ?").bind(s).first())) return json({ error: "Not found." }, 404);
  const r = await env.DB.prepare("SELECT title, body, url, created_at FROM notif_sent WHERE created_at > ? ORDER BY created_at DESC LIMIT 1").bind(Date.now() - 6 * 3600 * 1000).first();
  return json(r || { title: "GO Field Notes", body: "Something changed. Open the app.", url: null });
}
