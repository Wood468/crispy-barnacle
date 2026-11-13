#!/usr/bin/env node
// Read-only inventory coverage. Manifest absence is NOT proof that /api/art fails.
// This report never approves images, changes runtime art, or treats Dynamax as a separate sprite.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const PRIORITY_FORMS = Object.freeze([
  { dex: 888, name: 'Crowned Sword Zacian', kind: 'exact-form' },
  { dex: 889, name: 'Crowned Shield Zamazenta', kind: 'exact-form' },
  { dex: 895, name: 'Dynamax Regidrago', kind: 'labelled-treatment' },
  { dex: 379, name: 'Dynamax Registeel', kind: 'labelled-treatment' },
  { dex: 380, name: 'Dynamax Latias', kind: 'labelled-treatment' },
  { dex: 381, name: 'Dynamax Latios', kind: 'labelled-treatment' },
]);

export function auditPriorityArtwork(manifest, targets = PRIORITY_FORMS) {
  const entries = manifest?.entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new TypeError('manifest.entries must be an object');
  if (!Array.isArray(targets)) throw new TypeError('targets must be an array');
  const rows = targets.map(target => {
    if (!Number.isInteger(target?.dex) || target.dex <= 0 || !['exact-form', 'labelled-treatment'].includes(target.kind) || !target.name) {
      throw new TypeError('invalid priority form target');
    }
    const matching = Object.entries(entries).filter(([key]) => key.startsWith(target.dex + '|'));
    const approved = matching.filter(([, entry]) => entry?.status === 'approved').map(([key]) => key);
    return {
      dex: target.dex, name: target.name, kind: target.kind,
      manifestEntries: matching.length, approvedEntries: approved.length,
      // An approved costume/Gigantamax entry does not establish Crowned art coverage.
      status: target.kind === 'labelled-treatment'
        ? 'treatment-not-separate-manifest-art'
        : 'exact-form-needs-independent-api-and-rights-review',
      note: target.kind === 'labelled-treatment'
        ? 'Dynamax uses labelled species art; check runtime mode badge separately.'
        : 'Do not infer exact Crowned coverage from ordinary, costume or Gigantamax entries.',
    };
  });
  return { schemaVersion: 1, readOnly: true, source: 'public/artwork-manifest.json', rows };
}

async function main() {
  const manifest = JSON.parse(await readFile('public/artwork-manifest.json', 'utf8'));
  process.stdout.write(JSON.stringify(auditPriorityArtwork(manifest), null, 2) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
