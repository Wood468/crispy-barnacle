import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const review=readFileSync(new URL('../public/review.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/dash.css',import.meta.url),'utf8');
const render=review.slice(review.indexOf('  function render() {'),review.indexOf('  function send(it,'));
const cards=review.slice(review.indexOf('  function card(it,'),review.indexOf('  function render() {'));
const handlers=review.slice(review.indexOf("    var bossSave = e.target.closest('[data-ig-boss-save]');"));

test('exact scheduled boss selector appears before optional collapsed event suggestions',()=>{
  assert.match(cards,/\+ bossControls\(it, choices\)[\s\S]*igr-event-suggestions/);
  assert.match(cards,/details class="igr-event-suggestions"/);
  assert.match(cards,/Suggested event links \('/);
  assert.match(cards,/data-ig-ok=/);
  assert.match(cards,/aria-label="Choose another event"/);
  assert.match(cards,/data-ig-no/);
  assert.match(cards,/data-ig-ov=/);
  assert.doesNotMatch(cards,/<details class="igr-event-suggestions" open/);
});

test('render calculates exact roster and event options once and reuses both for open and linked cards',()=>{
  assert.match(render,/var eligibleBosses = exactScheduledChoices\(\), eligibleEvents = eventOptions\(\)/);
  assert.match(render,/return card\(it, eligibleBosses, eligibleEvents\)/);
  assert.match(render,/return linkedCard\(it, eligibleBosses, eligibleEvents\)/);
  assert.match(review,/function bossControls\(it, choices\)/);
  assert.doesNotMatch(review,/function currentBossChoices\(/);
  assert.doesNotMatch(review,/function bossFormCompatible\(/);
});

test('approval revalidates current live/upcoming roster, not cached card selections',()=>{
  assert.match(handlers,/exactScheduledChoices\(\)\.filter\(function \(row\)/);
  assert.match(handlers,/row\.value === field\.value && !!field\.value/);
  assert.match(handlers,/var target = matches\[0\]\.target/);
  assert.match(review,/data-ig-boss-choice/);
  assert.doesNotMatch(review,/data-ig-boss-name|data-ig-boss-form|data-ig-boss-mode/);
});

test('event suggestions are touch-sized, keyboard focusable, and use shared design tokens',()=>{
  assert.match(css,/\.igr-event-suggestions>summary:focus-visible/);
  assert.match(css,/\.igr-event-suggestions>summary\{[^}]*min-height:44px/);
  assert.match(css,/\.igr-event-suggestions \.igr-g \.pill\{[^}]*min-height:44px/);
  assert.match(css,/\.igr-event-suggestions\{[^}]*var\(--radius-md\)/);
  assert.match(css,/\.igr-event-suggestions \.igr-g\{[^}]*var\(--space-3\)/);
});

test('event approval and additional event links select the event field, never the first Pokémon dropdown',()=>{
  assert.match(handlers,/card\.querySelector\('select\[aria-label="Choose another event"\]'\)/);
  assert.match(handlers,/card\.querySelector\('select\[aria-label="Link to another event"\]'\)/);
  assert.doesNotMatch(handlers,/card\.querySelector\('select'\)/);
});
