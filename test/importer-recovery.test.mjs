import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryDecision, recoverStaleImporter } from '../scripts/importer-recovery.mjs';

const now = Date.parse('2026-11-11T04:00:00Z');
const stale = { id: 'event-importer.yml', state: 'stale', lastSuccess: '2026-11-10T13:03:24Z' };
const run = (status, created_at) => ({ status, created_at });

test('only the known stale importer is eligible for dispatch', () => {
  assert.equal(recoveryDecision({ ...stale, state: 'fresh' }, [], now).dispatch, false);
  assert.equal(recoveryDecision({ ...stale, id: 'store-watch.yml' }, [], now).dispatch, false);
  assert.equal(recoveryDecision(stale, null, now).dispatch, false);
  assert.equal(recoveryDecision(stale, [run('completed', '2026-11-10T13:01:33Z')], now).dispatch, true);
});
test('in-flight and delayed GitHub jobs prevent a duplicate import', () => {
  assert.equal(recoveryDecision(stale, [run('in_progress', '2026-11-10T12:00:00Z')], now).reason, 'importer-already-active');
  for (const status of ['queued', 'requested', 'waiting', 'pending'])
    assert.equal(recoveryDecision(stale, [run(status, '2026-11-10T13:00:00Z')], now).dispatch, false);
  assert.equal(recoveryDecision(stale, [run('failure', '2026-11-11T03:30:00Z')], now).reason, 'recent-importer-attempt');
  assert.equal(recoveryDecision(stale, [run('completed', '2026-11-11T02:01:00Z')], now).reason, 'recent-importer-attempt');
  assert.equal(recoveryDecision(stale, [run('completed', '2026-11-11T02:00:00Z')], now).dispatch, true);
});
test('recovery dispatches only existing event-importer workflow on main', async () => {
  const calls = [];
  const request = async (url, opts) => {
    calls.push({ url, ...opts });
    if (calls.length === 1) return { ok: true, json: async () => ({ workflow_runs: [run('completed', '2026-11-10T13:01:33Z')] }) };
    return { ok: true, status: 204 };
  };
  const outcome = await recoverStaleImporter(stale, { repository: 'Wood468/crispy-barnacle', token: 'fixture-token', request, now });
  assert.equal(outcome.status, 'dispatched');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, undefined);
  assert.match(calls[0].url, /\/actions\/workflows\/event-importer\.yml\/runs\?per_page=10$/);
  assert.equal(calls[1].method, 'POST');
  assert.match(calls[1].url, /\/actions\/workflows\/event-importer\.yml\/dispatches$/);
  assert.deepEqual(JSON.parse(calls[1].body), { ref: 'main' });
  assert.ok(!JSON.stringify(outcome).includes('fixture-token'));
});
test('read API failures, invalid repo and fresh state do not dispatch', async () => {
  let requests = 0;
  const fail = async () => { requests++; return { ok: false, status: 403 }; };
  assert.deepEqual(await recoverStaleImporter(stale, { repository: 'Wood468/crispy-barnacle', token: 'fixture', request: fail, now }),
    { status: 'unavailable', reason: 'run-history-http-403' });
  assert.equal(requests, 1);
  await recoverStaleImporter(stale, { repository: '../other', token: 'fixture', request: fail, now });
  await recoverStaleImporter({ ...stale, state: 'fresh' }, { repository: 'Wood468/crispy-barnacle', token: 'fixture', request: fail, now });
  assert.equal(requests, 1);
});
test('recent or active job suppresses the actual dispatch request', async () => {
  const calls = [];
  const request = async (url) => { calls.push(url); return { ok: true, json: async () => ({ workflow_runs: [run('queued', '2026-11-11T03:45:00Z')] }) }; };
  const outcome = await recoverStaleImporter(stale, { repository: 'Wood468/crispy-barnacle', token: 'fixture', request, now });
  assert.equal(outcome.status, 'skipped');
  assert.equal(outcome.reason, 'importer-already-active');
  assert.equal(calls.length, 1);
});
