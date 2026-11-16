import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { auditPublicInfographicRights, runAudit } from '../scripts/audit-public-infographic-rights.mjs';

const path = id => '/infographics/g47ix/' + id + '.webp';
const event = (url, source = 'G47IX') => ({ url, source });
const registry = (...candidates) => ({ candidates });
const audit = (changes = {}) => auditPublicInfographicRights(changes);

test('empty and malformed optional inputs are safe and do not imply permission', () => {
  const empty = audit();
  assert.equal(empty.publicG47ixReferences, 0);
  assert.equal(empty.requiresRightsReview, false);
  assert.equal(audit({ eventInfo: { events: { a: null } }, weekly: { items: 'wrong' }, queue: { items: {} }, registry: { candidates: null } }).publicG47ixReferences, 0);
});

test('counts actual G47IX event and raid-guide references separately', () => {
  const result = audit({ eventInfo: { events: { a: { infographics: [event(path('a')), event('/img/ext/other.png', 'Leek Duck')] } }, pokemonGuides: [{ infographics: [event(path('b'))] }] } });
  assert.equal(result.totals.eventReferences, 1);
  assert.equal(result.totals.bossGuideReferences, 1);
  assert.equal(result.totals.uniqueMediaPaths, 2);
  assert.equal(result.requiresRightsReview, true);
});

test('dedupes repeated public media paths without hiding references', () => {
  const result = audit({
    eventInfo: { events: { a: { infographics: [event(path('a') + '?ex=one')] }, b: { infographics: [event(path('a') + '?ex=two')] } } },
    weekly: { items: [{ image: path('a'), kind: 'week' }] },
    registry: registry({ stagedPath: path('a'), overview: 'week' }),
  });
  assert.equal(result.publicG47ixReferences, 3);
  assert.equal(result.totals.uniqueMediaPaths, 1);
  assert.equal(result.totals.pendingWeeklyReferences, 0);
});

test('newer staged weekly pending image is not mistaken for owner publication approval', () => {
  const result = audit({
    weekly: { items: [{ image: path('t16'), kind: 'week' }] },
    registry: registry({ stagedPath: path('t16'), reviewStatus: 'weekly', decision: 'pending' }),
  });
  assert.equal(result.totals.pendingWeeklyReferences, 1);
  assert.equal(result.requiresRightsReview, true);
});

test('explicit weekly owner selection is distinguished from an unreviewed candidate', () => {
  const result = audit({
    weekly: { items: [{ image: path('t2'), kind: 'week' }] },
    registry: registry({ stagedPath: path('t2'), reviewStatus: 'weekly', overview: 'week', decision: '' }),
  });
  assert.equal(result.totals.pendingWeeklyReferences, 0);
  assert.equal(result.requiresRightsReview, true, 'owner selection does not prove redistribution rights');
});

test('pending overrides a contradictory overview field; unknown weekly candidates are flagged', () => {
  const result = audit({
    weekly: { items: [{ image: path('a'), kind: 'week' }, { image: path('missing'), kind: 'week' }] },
    registry: registry({ stagedPath: path('a'), overview: 'week', decision: 'pending' }),
  });
  assert.equal(result.totals.pendingWeeklyReferences, 1);
  assert.equal(result.totals.unmatchedWeeklyReferences, 1);
});

test('queue creator attribution gaps are counted without printing titles, URLs or message IDs', () => {
  const privateUrl = 'https://discord.com/channels/guild/secret/123?token=very-secret';
  const result = audit({ queue: { items: [
    { image: path('x'), creator: '', post: privateUrl, title: privateUrl, source: 'discord' },
    { image: path('y'), creator: 'G47IX', post: privateUrl },
  ] } });
  assert.equal(result.totals.queueReferences, 2);
  assert.equal(result.totals.namespaceOnlyReferences, 1);
  assert.equal(result.totals.explicitlyAttributedG47ixReferences, 1);
  assert.equal(result.totals.missingQueueCreatorAttribution, 1);
  const log = JSON.stringify(result);
  assert.doesNotMatch(log, /very-secret|discord\.com|guild|\/infographics\/g47ix\/x/);
});

test('source labels are recognised even for external references, but unique media only counts local paths', () => {
  const result = audit({ eventInfo: { events: { a: { infographics: [event('https://example.org/a.png', 'G47IX')] } } } });
  assert.equal(result.totals.eventReferences, 1);
  assert.equal(result.totals.uniqueMediaPaths, 0);
});

test('non-G47IX art is excluded and contradicting source labels on G47IX paths are included', () => {
  const result = audit({ eventInfo: { events: { a: { infographics: [
    event('/img/ext/ld.png', 'Leek Duck'),
    event(path('a'), 'Leek Duck'),
    event('/infographics/else/b.png', 'G47IX'),
  ] } } } });
  assert.equal(result.totals.eventReferences, 2);
  assert.equal(result.totals.sourceLabelPathMismatch, 1);
  assert.equal(result.totals.explicitlyAttributedG47ixReferences, 1);
  assert.equal(result.totals.namespaceOnlyReferences, 1);
});

test('offline CLI remains report-only by default, with opt-in failure and no logged media IDs', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gofn-audit-'));
  try {
    mkdirSync(join(temp, 'public'));
    mkdirSync(join(temp, 'data'));
    const write = (p, value) => writeFileSync(join(temp, p), JSON.stringify(value));
    write('public/event-info.json', { events: { a: { infographics: [event(path('secret-name'))] } } });
    write('public/weekly.json', { items: [] });
    write('public/infographic-queue.json', { items: [] });
    write('data/g47ix-infographics-review.json', { candidates: [] });
    assert.equal(runAudit(temp).exitCode, 0);
    assert.equal(runAudit(temp, true).exitCode, 2);
    const script = new URL('../scripts/audit-public-infographic-rights.mjs', import.meta.url);
    const cmd = spawnSync(process.execPath, [script.pathname, '--fail-on-public'], { cwd: temp, encoding: 'utf8' });
    assert.equal(cmd.status, 2);
    assert.equal(JSON.parse(cmd.stdout).totals.eventReferences, 1);
    assert.doesNotMatch(cmd.stdout + cmd.stderr, /secret-name|\/infographics\/g47ix\//);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('malformed JSON reports safely with a nonzero exit and without leaking source', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gofn-audit-invalid-'));
  try {
    mkdirSync(join(temp, 'public'));
    mkdirSync(join(temp, 'data'));
    writeFileSync(join(temp, 'public/event-info.json'), '{VERY_PRIVATE_TOKEN');
    const script = new URL('../scripts/audit-public-infographic-rights.mjs', import.meta.url);
    const cmd = spawnSync(process.execPath, [script.pathname], { cwd: temp, encoding: 'utf8' });
    assert.equal(cmd.status, 2);
    assert.doesNotMatch(cmd.stdout + cmd.stderr, /VERY_PRIVATE_TOKEN/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
