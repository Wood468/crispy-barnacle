import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateManifest } from '../scripts/validate-artwork-manifest.mjs';
const rd = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const dex = rd('../public/dex.json'), queue = rd('../docs/asset-inventory/candidate-queue.json'), live = rd('../public/artwork-manifest.json');
const clone = () => structuredClone(live);
const run = m => validateManifest(m, { dex, queue });
const withEntry = (key, entry) => { const m = clone(); m.entries[key] = entry; m.counts.entries = Object.keys(m.entries).length; return m; };
const any = (errors, re) => assert.ok(errors.some(e => re.test(e)), errors.join('\n') || 'no errors');

test('the committed manifest (89 entries) is valid', () => { assert.equal(Object.keys(live.entries).length, 89); assert.deepEqual(run(live), []); });
test('a Shiny entry may not reuse the normal image or file', () => {
  const m = clone(), k = '25|normal|costume|sun-crown|shiny', n = '25|normal|costume|sun-crown|regular';
  m.entries[k] = { ...m.entries[k], sha256: m.entries[n].sha256, url: m.entries[n].url }; any(run(m), /reuses the normal image/);
  const p = clone(); p.entries[k].sourcePath = p.entries[n].sourcePath; any(run(p), /\.s\.icon/);
});
test('a Shiny entry needs its regular entry', () => { const m = clone(); delete m.entries['12|normal|gigantamax||regular']; any(run(m), /without its regular entry/); });
test('avatar clothing is never a Pokémon costume (Wild Area tee, Sinistea bow stay unapproved)', () => {
  const base = live.entries['25|normal|costume|sun-crown|regular'];
  any(run(withEntry('25|normal|costume|go-wild-area-2026-tee-purple|regular', { ...base, label: 'GO Wild Area 2026 Tee (Purple)', sha256: 'a'.repeat(64), url: '/img/ext/x.png', source: 'legacy', review: 'legacy-live-not-reviewed' })), /trainer clothing/);
  any(run(withEntry('854|normal|costume|bow|regular', { ...base, label: 'bow', sha256: 'b'.repeat(64), url: '/img/ext/y.png', source: 'legacy', review: 'legacy-live-not-reviewed' })), /Sinistea bow/);
});
test('Gigantamax is only valid for species that have the form, with no costume', () => {
  const g = live.entries['12|normal|gigantamax||regular'];
  any(run(withEntry('1|normal|gigantamax||regular', { ...g, sha256: 'c'.repeat(64), url: '/img/ext/z.png' })), /no Gigantamax form/);
});
test('Shadow and Dynamax are not stored as artwork entries', () => {
  const g = live.entries['12|normal|gigantamax||regular'];
  any(run(withEntry('25|normal|shadow||regular', { ...g, sha256: 'd'.repeat(64), url: '/img/ext/s.png' })), /labelled treatments/);
});
test('keys must be canonical, known species, unique by url and checksummed; review records are required', () => {
  const g = live.entries['12|normal|gigantamax||regular'];
  any(run(withEntry('99999|normal|gigantamax||regular', { ...g, sha256: 'e'.repeat(64), url: '/img/ext/n.png' })), /not in public\/dex/);
  any(run(withEntry('3|normal|gigantamax||regular', { ...g })), /duplicates/);
  const m = clone(); delete m.entries['12|normal|gigantamax||regular'].sha256; any(run(m), /sha256 missing/);
  const r = clone(); delete r.entries['12|normal|gigantamax||regular'].review; any(run(r), /review record missing/);
  const p = clone(); p.entries['196|normal|costume|sun-scarf|regular'].reviewedBy = ''; any(run(p), /visual review record/);
});
