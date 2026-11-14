import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const published = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
const events = published.events || [];

test('source-backed Modern Jacket Machamp Shiny eligibility survives curated Global summary', () => {
  // Official source: https://pokemongo.com/gowildarea/global
  // Independent confirmation: https://leekduck.com/events/pokemon-go-wild-area-2026-global/
  // The '*' means Shiny-eligible; it does NOT assert boosted costume-specific odds.
  const global = events.find(e => e.id === 'wag');
  // Archived catalogues may eventually remove the 2026 event. Do not force
  // an expired event to remain published solely to keep this regression green.
  if (global) {
    assert.match(global.sourceUrl || '', /^https:\/\/pokemongo\.com\/(?:en\/)?gowildarea\/global\/?$/i);
    const text = (global.p || []).filter(s => /Machamp wearing a modern jacket/i.test(s));
    assert.equal(text.length, 1, 'retain the precise Global raid summary exactly once');
    assert.match(text[0], /three-star raids on Saturday and Sunday and may be Shiny\./i,
      'the official source confirms costume Shiny eligibility on both days');
    assert.doesNotMatch(text[0], /boosted Shiny|increased Shiny (?:odds|chance|rate)/i,
      'eligibility does not prove a costume-specific boost');
  }
  for (const e of events) {
    for (const text of e.p || []) {
      if (!/Machamp wearing a modern jacket/i.test(text)) continue;
      assert.doesNotMatch(text, /official event page does not confirm (?:it can be Shiny|this)/i,
        'obsolete official-source denial must not return in future curated entries');
    }
  }
});
