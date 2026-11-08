// Read-only PokeMiners path inventory. Never downloads, publishes or approves an asset.
//   node scripts/inventory-pokeminers.mjs [out.json]                 GitHub tree API (needs api.github.com)
//   node scripts/inventory-pokeminers.mjs --tree-file ls-tree.txt [out.json] [--commit <sha>]
//       ls-tree.txt is `git ls-tree -r HEAD` of a blobless clone, which works wherever git over HTTPS does:
//       git clone --depth 1 --filter=blob:none --no-checkout https://github.com/PokeMiners/pogo_assets.git && git -C pogo_assets ls-tree -r HEAD
import { writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const FOLDERS = ['Images/Pokemon/', 'Images/Clothing/', '3D Assets/Clothing/'];
const ICON = /^Images\/Pokemon\/Addressable Assets\/pm(\d+)((?:\.[A-Za-z0-9_]+?)*)\.icon\.png$/;

/** pm<dex>[.<f|c><CODE>][.g2][.s].icon.png  ->  { dex, prefix, code, female, shiny } or null. */
export function parseIconPath(path) {
  const m = ICON.exec(path); if (!m) return null;
  const segs = m[2].split('.').filter(Boolean); let prefix = '', code = '', female = false, shiny = false;
  for (const s of segs) {
    if (s === 's') shiny = true; else if (s === 'g2') female = true;
    else if (/^[cf][A-Za-z0-9_]+$/.test(s) && !code) { prefix = s[0]; code = s.slice(1); } else return null;
  }
  return { dex: Number(m[1]), prefix, code, female, shiny };
}

/** Compact, committed availability index: dex -> "<prefix><CODE>" -> flags (n normal, s shiny, g female normal, h female shiny). Metadata only. */
export function buildIndex(paths) {
  const pokemon = {}; let icons = 0;
  for (const p of paths) {
    const r = parseIconPath(p); if (!r) continue; icons++;
    const d = (pokemon[r.dex] ||= {}), k = r.code ? r.prefix + r.code : '';
    const f = r.female ? (r.shiny ? 'h' : 'g') : (r.shiny ? 's' : 'n');
    d[k] = (d[k] || '') + f;
  }
  for (const d of Object.values(pokemon)) for (const k of Object.keys(d)) d[k] = [...d[k]].sort().join('');
  return { pokemon, icons };
}

export function treeFileToPaths(text) {
  return String(text).split('\n').map(l => l.split('\t')[1]).filter(Boolean);
}

async function main() {
  const args = process.argv.slice(2), take = flag => { const i = args.indexOf(flag); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const treeFile = take('--tree-file'), commit = take('--commit') || null, target = args[0] || '/tmp/gofn-pokeminers-inventory.json';
  let paths, treeSha = commit, source;
  if (treeFile) { paths = treeFileToPaths(await readFile(treeFile, 'utf8')); source = 'git ls-tree -r HEAD (blobless clone)'; }
  else {
    source = 'https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/master?recursive=1';
    const response = await fetch(source, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'go-field-notes-asset-inventory' } });
    if (!response.ok) throw new Error('GitHub tree request failed: ' + response.status + ' (try --tree-file)');
    const data = await response.json();
    if (data.truncated) throw new Error('GitHub tree was truncated; inventory would be incomplete');
    paths = data.tree.filter(x => x.type === 'blob').map(x => x.path); treeSha = data.sha;
  }
  const wanted = paths.filter(p => FOLDERS.some(f => p.startsWith(f))).sort();
  const idx = buildIndex(paths);
  const out = { schemaVersion: 2, source, sourceCommit: treeSha, generatedAt: new Date().toISOString(),
    note: 'Metadata only. Presence of a path is not identity, rights or approval.', pathCount: wanted.length, iconCount: idx.icons,
    clothing: wanted.filter(p => p.startsWith('Images/Clothing/')).length, pokemon: idx.pokemon };
  await writeFile(target, JSON.stringify(out) + '\n');
  console.log('Read-only inventory: ' + wanted.length + ' paths, ' + idx.icons + ' Pokémon icons -> ' + target);
  console.log('No assets downloaded or approved. Verify identity, bytes and rights separately.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exit(1); });
