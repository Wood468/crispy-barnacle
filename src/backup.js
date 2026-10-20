// Nightly backup, run from the Worker's nightly cron. Writes everything in the D1 database (your marks, accounts, sync state)
// plus the owner-only files to the R2 bucket under backups/<date>/, and keeps the newest 30 days. Nothing under backups/ is ever served:
// the Worker only serves /infographics/* and /img/ext/* from R2.
const KEEP_DAYS = 30;
export async function runBackup(env, when = new Date()) {
  if (!env.DB || !env.MEDIA) return { skipped: "no database or bucket" };
  const day = when.toISOString().slice(0, 10), prefix = "backups/" + day + "/";
  const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results || [];
  const dump = {}; let rows = 0;
  for (const t of tables) {
    const r = (await env.DB.prepare('SELECT * FROM "' + String(t.name).replace(/"/g, "") + '"').all()).results || [];
    dump[t.name] = r; rows += r.length;
  }
  await env.MEDIA.put(prefix + "d1.json", JSON.stringify({ taken: when.toISOString(), tables: dump }), { httpMetadata: { contentType: "application/json" } });
  let files = 0;
  for (const name of ["prices", "places"]) {
    const o = await env.MEDIA.get("private/" + name + ".json");
    if (o) { await env.MEDIA.put(prefix + "private-" + name + ".json", await o.text(), { httpMetadata: { contentType: "application/json" } }); files++; }
  }
  // Drop days older than KEEP_DAYS.
  const cutoff = new Date(when.getTime() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  const listed = await env.MEDIA.list({ prefix: "backups/" });
  const old = (listed.objects || []).map(o => o.key).filter(k => { const d = /^backups\/(\d{4}-\d\d-\d\d)\//.exec(k); return d && d[1] < cutoff; });
  for (const k of old) await env.MEDIA.delete(k);
  return { day, tables: tables.length, rows, files, removed: old.length };
}
