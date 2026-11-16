import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditPriorityArtwork, PRIORITY_FORMS } from '../scripts/artwork-priority-coverage.mjs';

const manifest = JSON.parse(readFileSync(new URL('../public/artwork-manifest.json', import.meta.url), 'utf8'));

test('priority audit is read-only and distinguishes exact Crowned from Dynamax treatment', () => {
  const before = JSON.stringify(manifest);
  const result = auditPriorityArtwork(manifest);
  assert.equal(JSON.stringify(manifest), before);
  assert.equal(result.readOnly, true);
  assert.equal(result.rows.length, 6);
  assert.deepEqual(result.rows.map(row => row.dex), [888, 889, 895, 379, 380, 381]);
  assert.equal(result.rows.filter(row => row.kind === 'exact-form').length, 2);
  assert.equal(result.rows.filter(row => row.kind === 'labelled-treatment').length, 4);
  assert.ok(result.rows.every(row => !('runtimeWorking' in row) && !('rightsApproved' in row)));
});

test('an unrelated approved variant never claims exact Crowned art', () => {
  const input = { entries: { '888|normal|costume|party-hat|regular': { status: 'approved' } } };
  const result = auditPriorityArtwork(input, [PRIORITY_FORMS[0]]);
  assert.equal(result.rows[0].approvedEntries, 1);
  assert.equal(result.rows[0].status, 'exact-form-needs-independent-api-and-rights-review');
});

test('malformed inputs fail closed instead of producing misleading coverage', () => {
  for (const input of [null, {}, { entries: [] }, { entries: null }]) assert.throws(() => auditPriorityArtwork(input), TypeError);
  for (const target of [{ dex: -1, name: 'x', kind: 'exact-form' }, { dex: 888, name: 'x', kind: 'invented' }, { dex: 888, kind: 'exact-form' }]) {
    assert.throws(() => auditPriorityArtwork({ entries: {} }, [target]), TypeError);
  }
  assert.throws(() => auditPriorityArtwork({ entries: {} }, {}), TypeError);
});

test('empty manifest reports missing inventory, not a broken deployed API', () => {
  const rows = auditPriorityArtwork({ entries: {} }).rows;
  assert.ok(rows.every(row => row.manifestEntries === 0 && row.approvedEntries === 0));
  assert.ok(rows.every(row => !/broken|404|failed/.test(row.status)));
});
