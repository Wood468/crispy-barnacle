import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/store-watch.yml', import.meta.url), 'utf8');

function step(name) {
  const escaped = name.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&');
  const match = workflow.match(new RegExp('^      - name: ' + escaped + '\\n([\\s\\S]*?)(?=^      - name: |^    [a-zA-Z_-]+:|$(?![\\s\\S]))', 'm'));
  assert.ok(match, 'missing workflow step: ' + name);
  return match[1];
}

test('stale alert executes even after upstream failure but not after cancellation', () => {
  const alert = step('Warn if the snapshot has gone stale');
  assert.match(alert, /^        if: \x24\{\{ !cancelled\(\) \}\}$/m);
  assert.match(alert, /run: node scripts\/store-watch\.mjs --stale-alert/);
  assert.doesNotMatch(alert, /continue-on-error:\s*true/);
});

test('fresh snapshot failures do not process or publish stale catalogue', () => {
  for (const name of ['Refresh verified Australian catalogue when snapshot explicitly uses A\x24', 'Regional price review (no screenshots, never fails the watch)', 'Tell me about anything new']) {
    assert.match(step(name), /^        if: \x24\{\{ steps\.read\.outputs\.fresh == 'true' \}\}$/m, name);
  }
});
