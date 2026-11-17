import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildWeekly, weeklyLocalAssetReady, selectWeeklyForPublication } from '../scripts/g47ix-publish.mjs';

const now = Date.parse('2026-11-17T00:00:00Z');
const media = id => '/infographics/g47ix/' + id + '.webp';
const record = (id, title, stamp, options = {}) => ({
  id, title, stagedPath: media(id), publishedAt: stamp, reviewStatus: 'weekly', ...options,
});
const old = record('t2', 'GO Weekly T 2', '2026-11-09T07:30:20Z', { overview: 'week', decision: '' });
const newest = record('t16', 'GO Weekly T16', '2026-11-16T07:30:34Z', { overview: 'week', decision: '' });
const month = record('nov', 'NOV CONTENT G47IX', '2026-10-30T07:30:54Z', { overview: 'month', decision: '' });
const pick = (entries, assetReady) => buildWeekly({ candidates: entries }, now, assetReady === undefined ? {} : { assetReady }).items;

test('regression: missing newly approved T16 must not suppress restored older T2', () => {
  assert.equal(pick([old, newest])[0]?.id, 't16', 'legacy date-first pick reproduces the failing validation path');
  const actual = pick([old, newest], p => p === old.stagedPath);
  assert.deepEqual(actual.map(x => x.id), ['t2']);
  assert.equal(actual[0].image, old.stagedPath);
});

test('restored T16 replaces T2; legacy callers retain their existing selection rules', () => {
  assert.equal(pick([old, newest], p => p === newest.stagedPath || p === old.stagedPath)[0].id, 't16');
  assert.equal(pick([old, newest])[0].id, 't16');
});

test('if no weekly art can be verified locally, omit it rather than publish a broken URL', () => {
  assert.deepEqual(pick([old, newest], () => false), []);
  assert.deepEqual(pick([], () => true), []);
});

test('monthly image remains isolated while missing weekly art falls back', () => {
  const actual = pick([newest, old, month], p => p === month.stagedPath || p === old.stagedPath);
  assert.deepEqual(actual.map(x => [x.kind, x.id]), [['week', 't2'], ['month', 'nov']]);
  assert.deepEqual(pick([newest, old, month], p => p === month.stagedPath).map(x => x.id), ['nov']);
});

test('rejected candidate never selected; asset check does not alter owner decisions', () => {
  const rejected = { ...newest, decision: 'rejected' };
  const pending = { ...newest, decision: 'pending' };
  assert.equal(pick([rejected, old], () => true)[0].id, 't2');
  // Existing publisher policy does not make pending a licence to publish; this
  // regression ONLY verifies file availability, leaving owner/security policy
  // unchanged for separate approval.
  assert.equal(pick([pending, old], () => true)[0].id, 't16');
});

test('asset callback exceptions and uncertain results fail closed', () => {
  const reg = { candidates: [old, newest] };
  assert.equal(buildWeekly(reg, now, { assetReady: p => p === old.stagedPath ? true : (() => { throw Error('lost R2'); })() }).items[0].id, 't2');
  assert.deepEqual(pick([newest], () => undefined), []);
  assert.deepEqual(pick([newest], () => 1), [], 'non-boolean availability must not be assumed true');
});

test('eligibility check is immutable, does not reclassify or invent a creator', () => {
  const reg = { candidates: [old, newest, month] };
  const copy = JSON.stringify(reg);
  buildWeekly(reg, now, { assetReady: () => false });
  assert.equal(JSON.stringify(reg), copy);
  assert.equal(reg.candidates[1].creator, undefined);
});

test('real local path requires nonempty restored media bytes and rejects traversal', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gofn-weekly-asset-'));
  try {
    mkdirSync(join(temp, 'infographics', 'g47ix'), { recursive: true });
    const file = media('safe-id');
    assert.equal(weeklyLocalAssetReady(file, temp), false);
    writeFileSync(join(temp, file.slice(1)), Buffer.from('WEBP'));
    assert.equal(weeklyLocalAssetReady(file, temp), true);
    const zero = media('empty');
    writeFileSync(join(temp, zero.slice(1)), '');
    assert.equal(weeklyLocalAssetReady(zero, temp), false);
    mkdirSync(join(temp, media('directory').slice(1)));
    assert.equal(weeklyLocalAssetReady(media('directory'), temp), false);
    for (const bad of [
      '/infographics/g47ix/../secret.webp',
      '/infographics/g47ix/../../private.json',
      '/infographics/g47ix/safe-id.webp?token=private',
      '/infographics/g47ix/other/file.webp',
      '/infographics/g47ix/.hidden.webp',
      '/img/ext/other.webp', 'https://example.test/private.webp', '', null,
    ]) assert.equal(weeklyLocalAssetReady(bad, temp), false, String(bad));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('scheduled CLI uses local restored-file guard, without modifying registry or rights policy', () => {
  const source = readFileSync(new URL('../scripts/g47ix-publish.mjs', import.meta.url), 'utf8');
  assert.match(source, /const \{ weekly: safeWeekly, held \} = selectWeeklyForPublication\(reg, asOf, p => weeklyLocalAssetReady\(p\)\)/);
  assert.match(source, /await writeFile\(WEEKLY, JSON\.stringify\(safeWeekly, null, 1\)/);
  assert.match(source, /selected picture\(s\) held because their local files were not restored/);
  assert.doesNotMatch(source, /assetReady: .*mediaFromR2|assetReady: .*download\(/, 'no image fetch performed by this guard');
});

test('publisher keeps last-known-good weekly when new media is missing but old bytes exist', () => {
  const reg = { candidates: [old, newest, month] };
  const before = JSON.stringify(reg);
  const { weekly, held } = selectWeeklyForPublication(reg, now,
    p => p === old.stagedPath || p === month.stagedPath);
  assert.deepEqual(weekly.items.map(x => x.id), ['t2', 'nov']);
  assert.equal(held, 1, 'newest weekly was withheld in favour of restored older artwork');
  assert.equal(JSON.stringify(reg), before, 'the source and review statuses are never mutated');
});

test('complete and partial R2 outages halt publication before changing the last-known-good public feed', () => {
  const reg = { candidates: [old, newest, month] };
  assert.throws(() => selectWeeklyForPublication(reg, now, () => false),
    /previous public feed retained/);
  assert.throws(() => selectWeeklyForPublication(reg, now, p => p === month.stagedPath),
    /previous public feed retained/, 'missing weekly cannot be silently omitted when month still exists');
  assert.throws(() => selectWeeklyForPublication(reg, now, p => p === old.stagedPath),
    /previous public feed retained/, 'missing month cannot be silently omitted when week is restored');
  assert.deepEqual(selectWeeklyForPublication({ candidates: [] }, now, () => false).weekly.items, [],
    'no available candidate in registry is different from an interrupted restore');
});

test('publisher legacy callers have unchanged weekly ranking without a local-file callback', () => {
  const result = selectWeeklyForPublication({ candidates: [old, newest] }, now, undefined);
  assert.equal(result.weekly.items[0].id, 't16');
  assert.equal(result.held, 0);
});

test('end-to-end CLI preserves old weekly when newest is missing; restores newest when bytes return', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gofn-weekly-cli-'));
  try {
    mkdirSync(join(temp, 'data')); mkdirSync(join(temp, 'public', 'infographics', 'g47ix'), { recursive: true });
    const write = (file, value) => writeFileSync(join(temp, file), JSON.stringify(value));
    write('data/g47ix-infographics-review.json', { candidates: [old, newest] });
    write('public/event-info.json', { events: {} });
    write('public/data.json', { events: [], rotation: [] });
    write('public/weekly.json', { updated: '2026-11-09', items: [{ kind: 'week', id: 't2', image: old.stagedPath }] });
    writeFileSync(join(temp, 'public', old.stagedPath.slice(1)), 'VALID_LOCAL_OLD');
    const script = new URL('../scripts/g47ix-publish.mjs', import.meta.url).pathname;
    const invoke = () => spawnSync(process.execPath, [script], { cwd: temp, encoding: 'utf8', timeout: 15000 });
    let run = invoke();
    assert.equal(run.status, 0, (run.stderr || '') + (run.stdout || ''));
    let weekly = JSON.parse(readFileSync(join(temp, 'public/weekly.json'), 'utf8'));
    assert.equal(weekly.items[0].id, 't2', 'CLI does not publish missing T16');
    assert.match(run.stderr, /selected picture\(s\) held/);
    writeFileSync(join(temp, 'public', newest.stagedPath.slice(1)), 'VALID_LOCAL_NEW');
    run = invoke();
    assert.equal(run.status, 0, (run.stderr || '') + (run.stdout || ''));
    weekly = JSON.parse(readFileSync(join(temp, 'public/weekly.json'), 'utf8'));
    assert.equal(weekly.items[0].id, 't16', 'CLI chooses newest once local bytes exist');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('end-to-end CLI on complete R2 restore failure leaves committed weekly bytes unchanged', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gofn-weekly-cli-failure-'));
  try {
    mkdirSync(join(temp, 'data')); mkdirSync(join(temp, 'public', 'infographics', 'g47ix'), { recursive: true });
    const write = (file, value) => writeFileSync(join(temp, file), JSON.stringify(value));
    write('data/g47ix-infographics-review.json', { candidates: [old, newest] });
    write('public/event-info.json', { events: {} });
    write('public/data.json', { events: [], rotation: [] });
    const prior = JSON.stringify({ updated: '2026-11-09', items: [{ kind: 'week', id: 't2', image: old.stagedPath }] });
    writeFileSync(join(temp, 'public/weekly.json'), prior);
    const script = new URL('../scripts/g47ix-publish.mjs', import.meta.url).pathname;
    const run = spawnSync(process.execPath, [script], { cwd: temp, encoding: 'utf8', timeout: 15000 });
    assert.equal(run.status, 1, (run.stderr || '') + (run.stdout || ''));
    assert.match(run.stderr, /previous public feed retained/);
    assert.equal(readFileSync(join(temp, 'public/weekly.json'), 'utf8'), prior,
      'no media: CLI throws before overwriting the last-good feed');
    assert.doesNotMatch(run.stderr, /\/infographics\/g47ix\/|discord\.com/,
      'failure message must not leak source URLs or media identifiers');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
