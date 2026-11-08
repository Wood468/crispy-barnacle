#!/usr/bin/env node
// Offline integrity validator for public/artwork-manifest.json (CI-safe). `--fetch` additionally re-downloads every image and compares sha256
// (legacy R2 copies from the live site, PokeMiners files from the pinned commit); that mode needs network and is for audits, not CI.
//   node scripts/validate-artwork-manifest.mjs [--fetch] [--site https://pogo.michaelpuff.com]
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const V = createRequire(import.meta.url)('../public/variant-art.js');

/** Species with a Gigantamax form in the games (Pokémon GO releases them a few at a time; a manifest key for any other species is wrong). */
export const GIGANTAMAX_SPECIES = [3, 6, 9, 12, 25, 52, 68, 94, 99, 131, 133, 143, 569, 809, 812, 815, 818, 823, 826, 834, 839, 841, 842, 844, 849, 851, 858, 861, 869, 879, 884, 892];
/** Identities that must never become manifest entries until an authorised source is found (see #364). */
export const BLOCKED = [{ dex: 854, why: 'Sinistea bow is unapproved' }];

// Words that only ever name trainer clothing. (Scarf, jacket, cap, crown... are real Pokémon costumes: Espeon sun scarf, Machamp modern jacket.)
const AVATAR_ONLY = /\b(tee|t-?shirt|shirt|pants|shorts|skirt|dress|sneakers|shoes|boots|gloves|backpack|hoodie|outfit|pose|avatar)\b/i;
const isAvatarItemName = n => AVATAR_ONLY.test(String(n || ''));
const sha = buf => createHash('sha256').update(buf).digest('hex');
const SHA = /^[0-9a-f]{64}$/;

export function validateManifest(manifest, { dex = [], queue = { items: [] } } = {}) {
  const errors = [], err = (k, m) => errors.push(k + ': ' + m);
  const entries = (manifest && manifest.entries) || {}, keys = Object.keys(entries);
  const names = new Map(dex.map(p => [Number(p[0]), p[1]]));
  const queueById = new Map((queue.items || []).map(i => [i.id, i]));
  if (manifest.counts && manifest.counts.entries !== keys.length) err('counts', 'entries ' + manifest.counts.entries + ' != ' + keys.length);
  if (manifest.counts && manifest.counts.visuallyConfirmed !== keys.filter(k => entries[k].review === 'visually-confirmed').length) err('counts', 'visuallyConfirmed does not match');
  const seenUrl = new Map(), seenSha = new Map(), canonical = new Set();
  for (const key of keys) {
    const e = entries[key], bits = key.split('|');
    if (bits.length !== 5) { err(key, 'key must have 5 parts'); continue; }
    const [d, form, kind, costume, shinyPart] = bits, dexNo = Number(d);
    let rebuilt = ''; try { rebuilt = V.variantKey({ dex: dexNo, form, kind, costume: costume || undefined, shiny: shinyPart === 'shiny' }); } catch (x) { err(key, x.message); continue; }
    if (rebuilt !== key || !['regular', 'shiny'].includes(shinyPart)) err(key, 'key is not canonical (' + rebuilt + ')');
    if (canonical.has(key.toLowerCase())) err(key, 'duplicate key'); canonical.add(key.toLowerCase());
    if (!names.has(dexNo)) err(key, 'dex number ' + dexNo + ' is not in public/dex.json');
    if (!['costume', 'gigantamax'].includes(kind)) err(key, 'only costume and gigantamax art is stored; Shadow and Dynamax are labelled treatments of the species picture, not entries');
    if (kind === 'gigantamax') { if (costume) err(key, 'Gigantamax key carries a costume'); if (!GIGANTAMAX_SPECIES.includes(dexNo)) err(key, 'species has no Gigantamax form'); }
    if (kind === 'costume') {
      if (!costume || costume !== V.slug(costume)) err(key, 'costume must be a non-empty slug');
      if (isAvatarItemName(costume.replace(/-/g, ' ')) || isAvatarItemName(e.label)) err(key, 'trainer clothing is not a Pokémon costume');
      if (e.label && V.slug(e.label) !== costume) err(key, 'label "' + e.label + '" does not match costume slug');
    }
    for (const b of BLOCKED) if (dexNo === b.dex && kind === 'costume' && /bow/.test(costume)) err(key, b.why);
    if (/purple/.test(costume) && /tee|wild-area/.test(costume)) err(key, 'GO Wild Area 2026 Tee (Purple) is avatar clothing and unapproved');
    if (e.status !== 'approved') err(key, 'status is ' + e.status);
    if (typeof e.url !== 'string' || !V.SAFE_URL.test(e.url)) err(key, 'unsafe or missing url');
    if (!SHA.test(e.sha256 || '')) err(key, 'sha256 missing');
    if (!e.rights) err(key, 'rights missing');
    if (seenUrl.has(e.url)) err(key, 'url duplicates ' + seenUrl.get(e.url)); seenUrl.set(e.url, key);
    if (e.sha256) { if (seenSha.has(e.sha256)) err(key, 'sha256 duplicates ' + seenSha.get(e.sha256)); seenSha.set(e.sha256, key); }
    if (!manifest.sources || !manifest.sources[e.source]) err(key, 'unknown source ' + e.source);
    if (!e.review) err(key, 'review record missing');
    if (e.source === 'legacy' && e.review !== 'legacy-live-not-reviewed') err(key, 'legacy entries are labelled legacy-live-not-reviewed');
    if (e.source === 'pokeminers') {
      if (e.review !== 'visually-confirmed' || !e.reviewedBy || !e.reviewedOn) err(key, 'PokeMiners entry needs a visual review record');
      if (!/^[0-9a-f]{40}$/.test(e.sourceCommit || '') || !/^[0-9a-f]{40}$/.test(e.blobSha || '')) err(key, 'sourceCommit/blobSha missing');
      const m = /^Images\/Pokemon\/Addressable Assets\/pm(\d+)\.f([A-Z0-9_]+?)(\.s)?\.icon\.png$/.exec(e.sourcePath || '');
      if (!m) err(key, 'sourcePath is not a PokeMiners costume icon');
      else {
        if (Number(m[1]) !== dexNo) err(key, 'sourcePath dex ' + m[1] + ' != key dex ' + dexNo);
        if (!!m[3] !== (shinyPart === 'shiny')) err(key, 'Shiny entries must use the .s.icon file and regular entries the normal file (no Shiny derived from a normal image)');
        if (e.asset !== 'f' + m[2] && e.asset !== m[2]) err(key, 'asset ' + e.asset + ' does not match sourcePath');
      }
      const q = queueById.get(e.queueId);
      if (!q) err(key, 'queue item ' + e.queueId + ' missing');
      else {
        if (q.status !== 'approved' || !q.approvedAsset || !q.approvedAsset.review || q.approvedAsset.review.status !== 'visually-confirmed') err(key, 'queue item is not visually approved');
        if (q.dex !== dexNo || q.costume !== costume) err(key, 'queue identity ' + q.dex + '/' + q.costume + ' differs from key');
        const f = q.approvedAsset && (shinyPart === 'shiny' ? q.approvedAsset.shiny : q.approvedAsset.normal);
        if (!f || f.sha256 !== e.sha256) err(key, 'sha256 differs from the approved queue record');
      }
    }
    if (shinyPart === 'shiny') {
      const sibling = entries[[d, form, kind, costume, 'regular'].join('|')];
      if (sibling && (sibling.sha256 === e.sha256 || sibling.url === e.url)) err(key, 'Shiny entry reuses the normal image');
      if (!sibling) err(key, 'Shiny entry without its regular entry');
    }
    if (e.url && /shiny=1/.test(e.url) !== (shinyPart === 'shiny') && e.url.startsWith('/api/art')) err(key, 'url shiny flag disagrees with key');
  }
  return errors;
}

export async function fetchCheck(manifest, site = 'https://pogo.michaelpuff.com') {
  const problems = [], ok = [];
  for (const [key, e] of Object.entries(manifest.entries)) {
    let url;
    if (e.source === 'pokeminers') url = 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/' + e.sourceCommit + '/' + e.sourcePath.split('/').map(encodeURIComponent).join('/');
    else url = e.url.startsWith('/') ? site + e.url : e.url;
    try {
      const r = await fetch(url); if (!r.ok) { problems.push(key + ': HTTP ' + r.status + ' ' + url); continue; }
      const got = sha(Buffer.from(await r.arrayBuffer()));
      if (got !== e.sha256) problems.push(key + ': sha256 mismatch (' + got.slice(0, 12) + ' != ' + e.sha256.slice(0, 12) + ') ' + url); else ok.push(key);
    } catch (x) { problems.push(key + ': ' + x.message); }
  }
  return { ok: ok.length, problems };
}

async function main() {
  const rd = async f => JSON.parse(await readFile(f, 'utf8'));
  const [manifest, dex, queue] = await Promise.all([rd('public/artwork-manifest.json'), rd('public/dex.json'), rd('docs/asset-inventory/candidate-queue.json')]);
  const errors = validateManifest(manifest, { dex, queue });
  if (process.argv.includes('--fetch')) {
    const i = process.argv.indexOf('--site'), r = await fetchCheck(manifest, i > 0 ? process.argv[i + 1] : undefined);
    console.log('fetched sha256 matches: ' + r.ok + '/' + Object.keys(manifest.entries).length); errors.push(...r.problems);
  }
  if (errors.length) { console.error('Artwork manifest validation failed (' + errors.length + '):'); for (const e of errors) console.error('::error::' + e); process.exit(1); }
  console.log('Artwork manifest valid: ' + Object.keys(manifest.entries).length + ' entries');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exit(1); });
