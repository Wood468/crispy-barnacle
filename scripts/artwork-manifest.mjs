// Builds public/artwork-manifest.json, the single machine-readable artwork manifest (the #360 flat-key contract, extended with provenance).
//   node scripts/artwork-manifest.mjs            rewrite the manifest from the legacy costume map + candidate queue + PokeMiners index
//   node scripts/artwork-manifest.mjs --check    exit 1 if the committed manifest is stale (CI-safe, offline)
// Inputs never create an approved entry on their own: queue items need approvedAsset (a person looked at the bytes), legacy entries are
// the pictures the site already served before the manifest existed and are labelled as such.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const A = createRequire(import.meta.url)('../public/variant-art.js');
const { variantKey, slug, SAFE_URL } = A;

const POLICY = 'Exact variant art only. A missing costume or Gigantamax picture is shown as the ordinary species picture with a visible badge, never as another costume or form. Shadow and Dynamax are labelled treatments of the species picture. Trainer clothing is never a Pokémon costume. No Shiny boost is ever inferred from ordinary Shiny availability.';
const SOURCES = {
  pokeminers: { name: 'PokeMiners/pogo_assets', url: 'https://github.com/PokeMiners/pogo_assets', rights: 'Niantic / The Pokémon Company / Nintendo / Game Freak IP, educational-use mirror. Reached only through the same-origin /api/art edge proxy; never committed or redistributed here.' },
  legacy: { name: 'Pictures mirrored to R2 before this manifest (Serebii / Dittobase via scripts/costumes.mjs + scripts/mirror-images.mjs)', rights: 'Existing repository policy; not re-reviewed by the manifest pipeline.' }
};

export function legacyEntries({ costumes, dex, previous = {} }) {
  const byName = new Map((dex || []).map(p => [String(p[1]).toLowerCase(), Number(p[0])])), out = {};
  const add = (key, url, extra) => { if (!SAFE_URL.test(url)) return; out[key] = { status: 'approved', url, source: 'legacy', review: 'legacy-live-not-reviewed', rights: SOURCES.legacy.rights, sha256: (previous[key] && previous[key].url === url && previous[key].sha256) || '', ...(previous[key] && previous[key].url === url && previous[key].bytes ? { bytes: previous[key].bytes } : {}), ...extra }; };
  const c = costumes || {};
  for (const [sec, shiny] of [['pictures', false], ['shiny', true]]) for (const [k, url] of Object.entries(c[sec] || {})) {
    const [name, label] = k.split('|'), dexNo = byName.get(name); if (!dexNo || !label) continue;
    add(variantKey({ dex: dexNo, kind: 'costume', costume: slug(label), shiny }), url, { label });
  }
  for (const [sec, shiny] of [['gmax', false], ['gmaxShiny', true]]) for (const [k, url] of Object.entries(c[sec] || {})) {
    const dexNo = byName.get(k.replace(/^gigantamax\s+/, '')); if (!dexNo) continue;
    add(variantKey({ dex: dexNo, kind: 'gigantamax', shiny }), url, {});
  }
  return out;
}

export function queueEntries(queue) {
  const out = {};
  for (const it of (queue && queue.items) || []) {
    const a = it.approvedAsset; if (!a || it.status !== 'approved' || it.kind !== 'costume') continue;
    for (const shiny of [false, true]) {
      const f = shiny ? a.shiny : a.normal; if (!f) continue;
      const url = A.costumeRoute({ base: it.species }, a.asset, shiny);
      if (!a.review || a.review.status !== 'visually-confirmed' || !/^[0-9a-f]{64}$/.test(f.sha256 || '')) throw new Error(it.id + ': approved asset needs a visual review and a sha256');
      out[variantKey({ dex: it.dex, form: it.form || 'normal', kind: 'costume', costume: it.costume, shiny })] = {
        status: 'approved', url, source: a.source, label: it.label, review: 'visually-confirmed', reviewedBy: a.review.by, reviewedOn: a.review.date,
        asset: a.asset.prefix + a.asset.code, sourcePath: f.path, sourceCommit: a.sourceCommit, blobSha: f.blobSha, sha256: f.sha256, bytes: f.bytes, width: f.width, height: f.height, rights: a.rights, queueId: it.id };
    }
  }
  return out;
}

export function gigantamaxDex(index) {
  return Object.keys((index && index.pokemon) || {}).filter(d => Object.prototype.hasOwnProperty.call(index.pokemon[d], 'fGIGANTAMAX')).map(Number).sort((a, b) => a - b);
}

export function buildManifest({ costumes, queue, index, dex, previous }) {
  const prevEntries = (previous && previous.entries) || {};
  const entries = { ...legacyEntries({ costumes, dex, previous: prevEntries }), ...queueEntries(queue) };
  const sorted = Object.fromEntries(Object.keys(entries).sort().map(k => [k, entries[k]]));
  return { schemaVersion: 2, policy: POLICY, sources: SOURCES,
    pokeminers: { sourceCommit: (index && index.sourceCommit) || '', gigantamax: gigantamaxDex(index) },
    counts: { entries: Object.keys(sorted).length, visuallyConfirmed: Object.values(sorted).filter(e => e.review === 'visually-confirmed').length },
    entries: sorted };
}

async function main() {
  const rd = async f => JSON.parse(await readFile(f, 'utf8'));
  const [costumes, queue, index, dex] = await Promise.all([rd('public/costumes.json'), rd('docs/asset-inventory/candidate-queue.json'), rd('docs/asset-inventory/pokeminers-index.json'), rd('public/dex.json')]);
  let previous = null; try { previous = await rd('public/artwork-manifest.json'); } catch { /* first run */ }
  const next = JSON.stringify(buildManifest({ costumes, queue, index, dex, previous }), null, 1) + '\n';
  if (process.argv.includes('--check')) { if (!previous || JSON.stringify(previous, null, 1) + '\n' !== next) { console.error('public/artwork-manifest.json is stale: run node scripts/artwork-manifest.mjs'); process.exit(1); } console.log('artwork manifest is current'); return; }
  await writeFile('public/artwork-manifest.json', next);
  const m = JSON.parse(next); console.log('artwork manifest: ' + m.counts.entries + ' entries, ' + m.counts.visuallyConfirmed + ' visually confirmed, ' + m.pokeminers.gigantamax.length + ' PokeMiners Gigantamax species');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exit(1); });
