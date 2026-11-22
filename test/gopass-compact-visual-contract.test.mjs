import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = file => readFileSync(new URL('../public/' + file, import.meta.url), 'utf8');

test('GO Pass puts actual milestone previews in a compact swipeable rail', () => {
  const render = source('event-components.js');
  const css = source('go-pass-navigation.css');
  assert.match(render, /class="ue-pass-highlights" aria-label="Published milestone rewards"/);
  assert.match(render, /Swipe for more/);
  assert.match(css, /\.ue-pass \.ue-pass-highlights\{[^}]*overflow-x:auto/);
  assert.match(css, /scroll-snap-type:x proximity/);
  assert.match(css, /\.ue-pass \.ue-pass-highlight\{[^}]*flex:0 0 min/);
});

test('full published rank data remains available behind independent disclosures', () => {
  const render = source('event-components.js');
  assert.match(render, /<details class="ue-pass-range"/);
  assert.match(render, /listWithGaps\(list,start,end\)/);
  assert.match(render, /ue-pass-rank" data-rank=/);
  assert.match(render, /ue-pass-gap-between/);
});

test('optional GO Pass finder keeps exact published-rank links and avoids fabricated rewards', () => {
  const nav = source('go-pass-navigation.js');
  assert.match(nav, /ue-pass-finder/);
  assert.match(nav, /function indexRewardEntries/);
  assert.match(nav, /No published reward entry for Rank/);
});
