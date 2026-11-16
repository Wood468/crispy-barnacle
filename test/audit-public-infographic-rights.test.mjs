import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
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

test('current repository public feeds can be audited offline without logging source media', () => {
  const repo = new URL('../', import.meta.url).pathname;
  // The fixture is shipped by the repository in CI. Local standalone contract
  // testing may not include public data; synthetic tests above cover that case.
  const files = ['public/event-info.json', 'public/weekly.json', 'public/infographic-queue.json', 'data/g47ix-infographics-review.json'];
  if (!files.every(p => existsSync(join(repo, p)))) return;
  const { report, exitCode } = runAudit(repo);
  assert.equal(exitCode, 0);
  assert.equal(report.publicG47ixReferences,
    report.totals.eventReferences + report.totals.bossGuideReferences + report.totals.weeklyReferences + report.totals.queueReferences);
  assert.equal(report.totals.explicitlyAttributedG47ixReferences + report.totals.namespaceOnlyReferences, report.publicG47ixReferences);
  assert.doesNotMatch(JSON.stringify(report), /discord\.com\/channels\/|cdn\.discordapp\.com|\/infographics\/g47ix\/discord-/i);
});


test('next weekly publisher selection flags pending replacement before public/weekly.json changes', () => {
  const oldImage = path('old-week');
  const nextImage = path('next-week');
  const result = audit({
    weekly: { items: [{ kind: 'week', image: oldImage }] },
    registry: registry(
      { stagedPath: oldImage, overview: 'week', creator: 'G47IX', decision: '' },
      { stagedPath: nextImage, reviewStatus: 'weekly', decision: 'pending', creator: '' }),
    projectedWeekly: { items: [{ kind: 'week', image: nextImage }] },
  });
  assert.equal(result.totals.pendingWeeklyReferences, 0, 'currently committed owner-selected feed is unchanged');
  assert.equal(result.totals.projectedWeeklyChanges, 1);
  assert.equal(result.totals.projectedPendingWeeklyPromotions, 1);
  assert.equal(result.totals.projectedUnattributedWeeklyPromotions, 1);
  assert.equal(result.totals.weeklyReferences, 1, 'projection does not count as public yet');
  assert.equal(result.publicG47ixReferences, 1);
});

test('unchanged projected weekly and owner-selected replacements do not false-positive approval risk', () => {
  const current = { kind: 'week', image: path('old') };
  const newer = { kind: 'week', image: path('new') };
  const candidates = registry(
    { stagedPath: current.image, overview: 'week', creator: 'G47IX', decision: '' },
    { stagedPath: newer.image, overview: 'week', creator: 'G47IX', decision: '' },
  );
  const shared = { weekly: { items: [current] }, registry: candidates };
  let a = audit({ ...shared, projectedWeekly: { items: [current] } });
  assert.equal(a.totals.projectedWeeklyChanges, 0);
  a = audit({ ...shared, projectedWeekly: { items: [newer] } });
  assert.equal(a.totals.projectedWeeklyChanges, 1);
  assert.equal(a.totals.projectedPendingWeeklyPromotions, 0);
  assert.equal(a.totals.projectedUnattributedWeeklyPromotions, 0);
});

test('the real publisher projection reports a pending weekly candidate without publishing it', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gofn-audit-weekly-'));
  try {
    mkdirSync(join(temp, 'public'));
    mkdirSync(join(temp, 'data'));
    const write = (p, value) => writeFileSync(join(temp, p), JSON.stringify(value));
    const now = Date.now();
    const old = path('secret-old-week-427'), newer = path('secret-next-week-427');
    const earlier = new Date(now - 8 * 86400000).toISOString();
    const recent = new Date(now - 3600000).toISOString();
    write('public/event-info.json', { events: {} });
    write('public/weekly.json', { items: [{ kind: 'week', image: old }] });
    write('public/infographic-queue.json', { items: [] });
    write('data/g47ix-infographics-review.json', { candidates: [
      { id: 'old', title: 'GO Weekly old', stagedPath: old, overview: 'week', publishedAt: earlier, decision: '' },
      { id: 'next', title: 'GO Weekly newer', stagedPath: newer, publishedAt: recent, decision: 'pending', reviewStatus: 'weekly' },
    ] });
    const { report, exitCode } = runAudit(temp);
    assert.equal(exitCode, 0);
    assert.equal(report.totals.weeklyReferences, 1);
    assert.equal(report.totals.projectedWeeklyChanges, 1);
    assert.equal(report.totals.projectedPendingWeeklyPromotions, 1);
    assert.equal(report.totals.projectedUnattributedWeeklyPromotions, 1);
    assert.doesNotMatch(JSON.stringify(report), /\/infographics\/g47ix\/|secret-(?:old|next)-week-427/, 'no private candidate IDs leak');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
