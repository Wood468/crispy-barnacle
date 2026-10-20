import { DatabaseSync } from "node:sqlite";
// Minimal D1 look-alike over node:sqlite, so tests run the real SQL.
export function makeDB() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql) => { let args = []; const o = { bind: (...a) => { args = a; return o; }, async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; }, async first() { return db.prepare(sql).get(...args) ?? null; }, async all() { return { results: db.prepare(sql).all(...args) }; }, _run() { db.prepare(sql).run(...args); } }; return o; };
  return { raw: db, prepare: stmt, async batch(l) { db.exec("BEGIN"); try { for (const s of l) s._run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } return []; }, async exec(sql) { db.exec(sql); } };
}
export const HOUR = 3600000, DAY = 86400000;
export const NOW = Date.parse("2026-10-09T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString().slice(0, 19) + ".000";
// A valid Leek Duck style feed: `n` filler events plus any extras.
export function feed(extra = [], n = 12) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ eventID: "filler" + i, name: "Filler Event " + i, eventType: "event", heading: "Event", link: "https://leekduck.com/events/filler" + i + "/", image: "", start: iso(NOW + (i + 1) * DAY), end: iso(NOW + (i + 1) * DAY + 3 * HOUR), extraData: { generic: { hasSpawns: false, hasFieldResearchTasks: false } } });
  return out.concat(extra);
}
export const raid = (over = {}) => ({ eventID: "mega-blastoise-raids", name: "Mega Blastoise in Mega Raids", eventType: "raid-battles", heading: "Raid Battles", link: "https://leekduck.com/events/mega-blastoise-raids/", image: "x", start: "2026-10-07T06:00:00.000", end: "2026-10-13T22:00:00.000", extraData: { raidbattles: { bosses: [{ name: "Mega Blastoise", image: "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_009_51.png", canBeShiny: true }], shinies: [{ name: "Blastoise", image: "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_009_00_shiny.png" }] } }, ...over });
export const cd = (over = {}) => ({ eventID: "october-communityday2026", name: "Zorua Community Day", eventType: "community-day", heading: "Community Day", link: "https://leekduck.com/events/october-communityday2026/", image: "x", start: "2026-10-10T14:00:00.000", end: "2026-10-10T17:00:00.000", extraData: { communityday: { spawns: [{ name: "Zorua", image: "https://cdn.leekduck.com/assets/img/pokemon_icons/pm570.icon.png" }], bonuses: [{ text: "3x Catch XP" }, { text: "2x Catch Candy" }], shinies: [{ name: "Zorua", image: "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_570_00_shiny.png" }] } }, ...over });
