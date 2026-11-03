#!/usr/bin/env node
// Lightweight integrity checks for generated/public data. Runs even when a change only updates JSON.
import { readdir, readFile, access } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const PUBLIC = join(ROOT, "public");
const errors = [];
const warnings = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);

async function jsonFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await jsonFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

const files = await jsonFiles(PUBLIC);
const parsed = new Map();
for (const file of files) {
  const name = relative(ROOT, file).split(sep).join("/");
  try {
    parsed.set(name, JSON.parse(await readFile(file, "utf8")));
  } catch (e) {
    fail(name, `invalid JSON (${e.message})`);
  }
}

const data = parsed.get("public/data.json");
if (!data || typeof data !== "object" || !Array.isArray(data.events)) {
  fail("public/data.json", "expected an object with an events array");
} else {
  const ids = new Set();
  for (const [i, ev] of data.events.entries()) {
    const where = `public/data.json events[${i}]`;
    if (!ev || typeof ev !== "object" || Array.isArray(ev)) {
      fail(where, "expected an event object");
      continue;
    }
    if (typeof ev.id !== "string" || !ev.id.trim()) fail(where, "missing event id");
    else if (ids.has(ev.id)) fail(where, `duplicate event id "${ev.id}"`);
    else ids.add(ev.id);
    if (typeof ev.t !== "string" || !ev.t.trim()) fail(where, "missing event title (t)");
    for (const key of ["s", "e"]) {
      if (ev[key] == null || ev[key] === "") {
        if (key === "s") fail(where, "missing event start (s)");
        continue;
      }
      if (typeof ev[key] !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(ev[key]) || Number.isNaN(Date.parse(ev[key]))) {
        fail(where, `invalid ${key === "s" ? "start" : "end"} date "${ev[key]}"`);
      }
    }
    if (ev.s && ev.e && !Number.isNaN(Date.parse(ev.s)) && !Number.isNaN(Date.parse(ev.e)) && Date.parse(ev.e) < Date.parse(ev.s)) {
      fail(where, "event end is before its start");
    }
    if (ev.sourceUrl) {
      try { if (new URL(ev.sourceUrl).protocol !== "https:") fail(where, "sourceUrl must use HTTPS"); }
      catch { fail(where, "sourceUrl is not a valid URL"); }
    }
  }
}

// Raid rotation windows are local wall-clock times; source URLs must point to Leek Duck event pages.
const rotations = data && data.rotation;
if (rotations != null) {
  if (!Array.isArray(rotations)) fail("public/data.json rotation", "expected an array");
  else {
    const validLocalTime = value => typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
    for (const [i, row] of rotations.entries()) {
      const where = `public/data.json rotation[${i}]`;
      if (!row || typeof row !== "object" || Array.isArray(row)) { fail(where, "expected a rotation object"); continue; }
      if (!validLocalTime(row.s)) fail(where, "start must be a local YYYY-MM-DDTHH:mm value");
      if (!validLocalTime(row.e)) fail(where, "end must be a local YYYY-MM-DDTHH:mm value");
      if (validLocalTime(row.s) && validLocalTime(row.e) && Date.parse(row.e) <= Date.parse(row.s)) fail(where, "rotation end must be after start");
      if (row.sourceUrl != null) {
        try {
          const u = new URL(row.sourceUrl);
          if (typeof row.sourceUrl !== "string" || u.protocol !== "https:" || u.hostname !== "leekduck.com" || !/^\/events\/[a-z0-9-]+\/?$/i.test(u.pathname)) {
            fail(where, "sourceUrl must be an HTTPS Leek Duck event page");
          }
        } catch { fail(where, "sourceUrl is not a valid URL"); }
      }
    }
  }
}

// event-info.json: start / end / dateSource are optional (they tell one instance of a recurring event from the next). When present they must be well formed.
const evInfo = parsed.get("public/event-info.json");
if (evInfo && evInfo.events && typeof evInfo.events === "object") {
  const isDay = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  for (const [key, e] of Object.entries(evInfo.events)) {
    const where = `public/event-info.json events["${key}"]`;
    if (!e || typeof e !== "object") continue;
    if (e.start != null && !isDay(e.start)) fail(where, `start must be YYYY-MM-DD, got "${e.start}"`);
    if (e.end != null && !isDay(e.end)) fail(where, `end must be YYYY-MM-DD, got "${e.end}"`);
    if (e.end != null && e.start == null) fail(where, "end without start");
    if (isDay(e.start) && isDay(e.end) && e.end < e.start) fail(where, "end is before start");
    if (e.dateSource != null && (typeof e.dateSource !== "string" || !e.dateSource.trim())) fail(where, "dateSource must be a non-empty string");
    if (e.dateSource != null && e.start == null) fail(where, "dateSource without start (a source for a date that is not there)");
    if (e.start != null && e.dateSource == null) fail(where, "a dated entry must say where the date came from (dateSource)");
  }
}


// Regional world-event provenance is rendered directly in the app; malformed source objects must never reach it.
const worldEvents = parsed.get("public/world-events.json");
if (worldEvents != null) {
  if (!worldEvents || !Array.isArray(worldEvents.events)) fail("public/world-events.json", "expected an events array");
  else {
    const ids = new Set();
    for (const [i, event] of worldEvents.events.entries()) {
      const where = `public/world-events.json events[${i}]`;
      if (!event || typeof event !== "object" || Array.isArray(event)) { fail(where, "expected an event object"); continue; }
      if (typeof event.id !== "string" || !event.id.trim()) fail(where, "missing event id");
      else if (ids.has(event.id)) fail(where, `duplicate event id "${event.id}"`);
      else ids.add(event.id);
      if (typeof event.name !== "string" || !event.name.trim()) fail(where, "missing event name");
      if (event.mode != null && !["in-game", "in-person"].includes(event.mode)) fail(where, "mode must be 'in-game' or 'in-person' when present");
      if (event.mode && event.scope === "global") fail(where, "global events use scope 'global' and do not need a regional mode override");
      if (!Array.isArray(event.sources) || !event.sources.length) { fail(where, "expected at least one source record"); continue; }
      for (const [j, source] of event.sources.entries()) {
        const sourceWhere = where + ` sources[${j}]`;
        if (!source || typeof source !== "object" || Array.isArray(source)) { fail(sourceWhere, "expected a source object"); continue; }
        for (const key of ["id", "name", "url"]) {
          if (typeof source[key] !== "string" || !source[key].trim()) fail(sourceWhere, key + " must be a non-empty string");
        }
        if (typeof source.url === "string") {
          try { if (new URL(source.url).protocol !== "https:") fail(sourceWhere, "source URL must use HTTPS"); }
          catch { fail(sourceWhere, "source URL is invalid"); }
        }
      }
    }
  }
}

const regionalEvents = parsed.get("public/regional-events.json");
if (regionalEvents != null) {
  if (!regionalEvents || !Array.isArray(regionalEvents.events)) fail("public/regional-events.json", "expected an events array");
  else for (const [i, event] of regionalEvents.events.entries()) {
    const where = `public/regional-events.json events[${i}]`;
    if (!event || typeof event !== "object" || Array.isArray(event)) { fail(where, "expected an event object"); continue; }
    if (event.mode != null && !["in-game", "in-person"].includes(event.mode)) fail(where, "mode must be 'in-game' or 'in-person' when present");
    if (event.mode && event.scope === "global") fail(where, "global events use scope 'global' and do not need a regional mode override");
    if (event.source != null && typeof event.source !== "string") {
      if (!event.source || typeof event.source !== "object" || Array.isArray(event.source)) fail(where, "source must be a source id or source object");
      else {
        const label = event.source.name || event.source.label;
        if (typeof label !== "string" || !label.trim()) fail(where, "source object needs a non-empty name or label");
        if (typeof event.source.url !== "string" || !event.source.url.trim()) fail(where, "source object needs its own URL");
        else { try { if (new URL(event.source.url).protocol !== "https:") fail(where, "source object URL must use HTTPS"); } catch { fail(where, "source object URL is invalid"); } }
      }
    }
    if (event.url != null) {
      try { if (new URL(event.url).protocol !== "https:") fail(where, "event URL must use HTTPS"); }
      catch { fail(where, "event URL is invalid"); }
    }
  }
}

let picturesRestored = false; try { await access(join(PUBLIC, "infographics")); picturesRestored = true; } catch { /* pictures are in R2 */ }
const weekly = parsed.get("public/weekly.json");
if (weekly != null) {
  if (!weekly || !Array.isArray(weekly.items)) fail("public/weekly.json", "expected an items array");
  else for (const [i, item] of weekly.items.entries()) {
    const where = `public/weekly.json items[${i}]`;
    if (typeof item.image !== "string" || !/^\/infographics\/[\w./-]+$/.test(item.image) || item.image.includes("..")) {
      fail(where, "image must be a safe local /infographics/ path");
      continue;
    }
    const target = resolve(PUBLIC, "." + item.image);
    if (!target.startsWith(PUBLIC + sep)) {
      fail(where, "image path escapes the public directory");
      continue;
    }
    // Pictures live in the R2 bucket, not in git: the file is only checked when a run has restored them (public/infographics exists).
    if (picturesRestored) { try { await access(target); } catch { fail(where, `image file does not exist: ${item.image}`); } }
    if (item.post) {
      try { if (new URL(item.post).protocol !== "https:") fail(where, "post URL must use HTTPS"); }
      catch { fail(where, "post is not a valid URL"); }
    }
  }
}

// Tickets sold outside the web store: eventEnd controls expiry; registration and sale windows are distinct, and explicit availability is dated and sourced.
const ext = parsed.get("public/tickets-external.json");
if (ext) {
  const day = /^\d{4}-\d\d-\d\d$/;
  if (!Array.isArray(ext.items)) fail("public/tickets-external.json", "expected an items array");
  else {
    const seen = new Set();
    for (const [i, x] of ext.items.entries()) {
      const where = `public/tickets-external.json items[${i}]`;
      if (!x || typeof x !== "object") { fail(where, "not an object"); continue; }
      if (!x.id || seen.has(x.id)) fail(where, "needs a unique id"); else seen.add(x.id);
      for (const k of ["name", "when", "price"]) if (!x[k]) fail(where, `${k} is required`);
      try { if (new URL(x.url).protocol !== "https:") fail(where, "url must use HTTPS"); } catch { fail(where, "url is not a valid URL"); }
      if (!day.test(x.eventEnd || "")) fail(where, "eventEnd must be YYYY-MM-DD, or the entry would never expire");
      const isDay = value => typeof value === "string" && day.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
      const isInstant = value => {
        const m = typeof value === "string" && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
        if (!m || !isDay(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4] || 0) > 59) return false;
        if (m[5] !== "Z") { const off = m[5].slice(1).split(":").map(Number); if (off[0] > 14 || off[1] > 59 || (off[0] === 14 && off[1] !== 0)) return false; }
        return !Number.isNaN(Date.parse(value));
      };
      for (const k of ["eventStart", "saleStart", "saleEnd", "observed"]) if (x[k] && !isDay(x[k])) fail(where, k + " must be a real YYYY-MM-DD date");
      for (const k of ["registrationStart", "registrationEnd"]) if (x[k] && !isInstant(x[k])) fail(where, k + " must be an ISO date-time with an explicit timezone");
      if (x.saleStart && x.saleEnd && x.saleStart > x.saleEnd) fail(where, "saleStart is after saleEnd");
      if (x.registrationStart && x.registrationEnd && Date.parse(x.registrationStart) > Date.parse(x.registrationEnd)) fail(where, "registrationStart is after registrationEnd");
      if (!!x.registrationStart !== !!x.registrationEnd) fail(where, "registrationStart and registrationEnd must be supplied together");
      if ((x.registrationStart || x.registrationEnd) && (typeof x.registrationTimeZone !== "string" || !x.registrationTimeZone.trim())) fail(where, "a registration window needs its source timezone label");
      if (x.eventStart && x.eventEnd && x.eventStart > x.eventEnd) fail(where, "eventStart is after eventEnd");
      if (x.availability != null && !["available", "sold-out", "unknown"].includes(x.availability)) fail(where, "availability must be available, sold-out or unknown");
      if (x.availability != null && !isDay(x.observed)) fail(where, "explicit availability needs an observed YYYY-MM-DD date");
      if (x.observed && (!Array.isArray(x.sources) || !x.sources.length)) fail(where, "an observed source date needs at least one source URL");
      if (x.sources != null) {
        if (!Array.isArray(x.sources)) fail(where, "sources must be an array of HTTPS URLs");
        else for (const [j, source] of x.sources.entries()) {
          try { if (typeof source !== "string" || new URL(source).protocol !== "https:") fail(where, "sources[" + j + "] must be an HTTPS URL"); }
          catch { fail(where, "sources[" + j + "] is not a valid HTTPS URL"); }
        }
      }
    }
  }
}

if (errors.length) {
  console.error(`Data validation failed with ${errors.length} error(s):`);
  for (const e of errors) console.error("::error::" + e);
  process.exitCode = 1;
} else {
  console.log(`Data validation passed: parsed ${parsed.size}/${files.length} public JSON files; checked ${data.events.length} curated events.`);
}
for (const w of warnings) console.warn(w);
