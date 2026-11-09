import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/event-components.js', import.meta.url), 'utf8');
const start = source.indexOf('function sourceHighlights(model)');
const end = source.indexOf('function render(model,ctx)', start);
assert.ok(start >= 0 && end > start, 'source-backed highlights must be present');
const sourceHighlights = vm.runInNewContext(
  '(function(value,esc){' + source.slice(start,end) + ';return sourceHighlights;})',
) (
  row => typeof row === 'string' ? row : (row?.text || row?.title || ''),
  value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
);
const details = JSON.parse(readFileSync(new URL('../public/event-details.json', import.meta.url), 'utf8'));
const into = {internalValidation:{fields:details.events.into.fields}};

test('Into the Wild sourced hours and Bottle Cap appear on Overview', () => {
  const html = sourceHighlights(into);
  assert.match(html, /Daily Raid &amp; Max Battle hours/);
  assert.match(html, /6pm to 7pm/);
  assert.match(html, /Silver Bottle Cap/);
  assert.match(html, /Coin Bag/);
});

test('no guessed highlights for events without source fields', () => {
  assert.equal(sourceHighlights({internalValidation:{fields:{}}}), '');
});

test('source text is escaped and unsafe status is excluded', () => {
  const html = sourceHighlights({internalValidation:{fields:{
    featured:[{text:'Silver Bottle Cap <script>alert(1)</script>',status:'rejected'}],
    bonuses:[{text:'Shiny Gimmighoul via Coin Bag <img>',status:'verified'}]
  }}});
  assert.doesNotMatch(html, /Silver Bottle Cap/);
  assert.match(html, /&lt;img&gt;/);
});
