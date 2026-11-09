import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/today.js', import.meta.url), 'utf8');
function body(name, next) {
  const start = source.indexOf('function ' + name + '(');
  const end = source.indexOf('function ' + next + '(', start);
  assert.ok(start >= 0 && end > start, name + ' must exist');
  return source.slice(start, end);
}

test('major and raid cards share the same location and overseas chip', () => {
  assert.match(body('cardMajor', 'cardRaid'), /placeChip\(ctx, ev\)/);
  assert.match(body('cardRaid', 'cardMinor'), /placeChip\(ctx, ev\)/);
});

test('compact cards explicitly label overseas regions', () => {
  const minor = body('cardMinor', 'card');
  assert.match(minor, /ctx\.overseas\(ev\)/);
  assert.match(minor, /Overseas/);
});

test('overseas event rows remain visible independently of normal feed cards', () => {
  const reg = body('regRow', 'weekRow');
  assert.match(reg, /r\.overseas/);
  assert.match(reg, /Overseas/);
});
