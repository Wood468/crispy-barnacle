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

if (errors.length) {
  console.error(`Data validation failed with ${errors.length} error(s):`);
  for (const e of errors) console.error("::error::" + e);
  process.exitCode = 1;
} else {
  console.log(`Data validation passed: parsed ${parsed.size}/${files.length} public JSON files; checked ${data.events.length} curated events.`);
}
for (const w of warnings) console.warn(w);
