import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const lib = createRequire(import.meta.url)('../public/lib.js');
const source = fs.readFileSync(new URL('../public/research.js', import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-06T12:00:00Z');

test('research verification dates are task-specific, validated and age-labelled', () => {
  for (const value of [null, '', 'invalid', '2026-02-30', '2026-11-07']) {
    assert.equal(lib.researchCheckedText(value, NOW), 'Source check date unavailable');
  }
  assert.equal(lib.researchCheckedText('2026-11-06T01:00:00Z', NOW), 'Checked 2026-11-06');
  assert.equal(lib.researchCheckedText('2026-10-30', NOW), 'Checked 2026-10-30');
  assert.match(lib.researchCheckedText('2026-10-29', NOW), /may be due/);
  assert.match(lib.researchCheckedText('2026-10-16', NOW), /may be due/);
  assert.match(lib.researchCheckedText('2026-10-14', NOW), /may be out of date/);
});

function harness() {
  let clock = NOW, fail = false, pending = false;
  const requests = [], listeners = {}, attrs = {};
  const host = { innerHTML: '', setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, querySelectorAll() { return []; } };
  const status = { textContent: '' }, refresh = { setAttribute() {}, removeAttribute() {} };
  const details = { asOf: '2026-11-06', events: { fixture: { researchTasks: [{
    eventId: 'fixture', task: 'Catch 3 Pokémon', category: 'field', sources: [],
    eventWindow: { start: '2026-11-01', end: '2026-11-30' }, rewards: [{ type: 'item', name: 'Potion', quantity: 1 }]
  }] } } };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  vm.runInNewContext(source, { Date: Clock, URL, setTimeout, window: { GOLIB: { ...lib, jsonOrNull(url, opts) {
    requests.push({ url, opts });
    if (pending) return new Promise(() => {});
    return Promise.resolve(fail ? null : url.includes('event-details') ? details : { events: [{ id: 'fixture', t: 'Fixture event' }] });
  } } }, document: { getElementById(id) { return id === 'research-list' ? host : status; }, querySelector() { return refresh; }, addEventListener(type, cb) { listeners[type] = cb; } } });
  return { host, status, requests, attrs, setFail(value) { fail = value; }, setPending() { pending = true; }, advance(ms) { clock += ms; }, open() { listeners['gofn-view']({ detail: { tab: 'events', sub: 'research' } }); }, refresh() { listeners.click({ target: { closest(sel) { return !/more/.test(sel); } } }); } };
}
const settled = () => new Promise(resolve => setImmediate(resolve));

test('Research revalidates after five minutes and explicit refresh bypasses the shared cache', async () => {
  const h = harness();
  h.open(); await settled();
  assert.equal(h.requests.length, 2);
  assert.match(h.host.innerHTML, /Source check date unavailable/);
  assert.doesNotMatch(h.host.innerHTML, /Checked 2026-11-06/);
  h.open(); await settled(); assert.equal(h.requests.length, 2);
  h.advance(300001); h.open(); await settled(); assert.equal(h.requests.length, 4);
  h.refresh(); await settled(); assert.equal(h.requests.length, 6);
  assert.ok(h.requests.slice(-2).every(r => r.opts.fresh === true && r.opts.timeout === 10000));
  assert.equal(h.attrs['aria-busy'], undefined);
});

test('failed refresh retains known research and explicit retry recovers', async () => {
  const h = harness(); h.open(); await settled();
  const before = h.host.innerHTML;
  h.setFail(true); h.refresh(); await settled();
  assert.equal(h.host.innerHTML, before);
  assert.match(h.status.textContent, /previous snapshot; it may be out of date/);
  h.setFail(false); h.open(); await settled();
  assert.equal(h.requests.length, 6, 're-entry retries a failed refresh even before cache expiry');
  assert.match(h.status.textContent, /Saved source snapshot/);
});

test('initial failure offers retry and concurrent renders share one bounded load', async () => {
  const h = harness(); h.setFail(true); h.open(); await settled();
  assert.match(h.host.innerHTML, /data-research-retry/);
  h.setFail(false); h.refresh(); await settled(); assert.match(h.host.innerHTML, /Catch 3/);
  const p = harness(); p.setPending(); p.open(); p.open(); p.refresh();
  assert.equal(p.requests.length, 2);
  assert.equal(p.attrs['aria-busy'], 'true');
  assert.ok(p.requests.every(r => r.opts.timeout === 10000));
});

test('event-detail Research uses the same task-only freshness labels and escapes source text', () => {
  const detail = fs.readFileSync(new URL('../public/detail.js', import.meta.url), 'utf8');
  const body = detail.match(/function researchTasksHtml\(ev, d\) \{([\s\S]*?)\n  \}/)[1];
  const render = new Function('ev', 'd', 'esc', 'window', 'X', 'safe', 'researchReward', body);
  const html = render({ id: 'fixture' }, { updated: '2026-11-06', researchTasks: [
    { task: 'Catch <3 Pokémon', rewards: [], sources: [], checkedAt: '' },
    { task: 'Win a raid', rewards: [], sources: [], checkedAt: '2026-10-01' }
  ] }, lib.esc, { GOLIB: { researchCheckedText: value => lib.researchCheckedText(value, NOW) } }, {}, () => '', () => '');
  assert.match(html, /Source check date unavailable/);
  assert.match(html, /Checked 2026-10-01 · source check may be out of date/);
  assert.match(html, /Catch &lt;3 Pokémon/);
  assert.doesNotMatch(html, /Checked 2026-11-06/);
});
