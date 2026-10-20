// Regenerates src/migrations.js from migrations/NNNN_name.sql so the reviewable files and the code can't drift.
import fs from "node:fs";
const dir = new URL("../migrations/", import.meta.url);
const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
const items = files.map((f) => { const [, n, name] = f.match(/^(\d{4})_(.+)\.sql$/); return `  { version: ${+n}, name: ${JSON.stringify(name)}, sql: ${JSON.stringify(fs.readFileSync(new URL(f, dir), "utf8").trim())} },`; });
fs.writeFileSync(new URL("../src/migrations.js", import.meta.url), "// Versioned, additive migrations. migrations/*.sql is the reviewable copy; src/migrations.js is generated from it (node tools/gen_migrations.mjs); a test fails if they drift apart.\nexport const MIGRATIONS = [\n" + items.join("\n") + "\n];\n");
console.log(files.length, "migrations");
