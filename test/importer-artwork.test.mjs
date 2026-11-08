import test from 'node:test';
import assert from 'node:assert/strict';
import { selectArtwork } from '../scripts/importer/artwork.mjs';
import { appEvents } from '../scripts/importer/run.mjs';

const event = { t: 'GO Wild Area: Sendai', start: '2026-11-06T10:00:00Z', end: '2026-11-08T18:00:00Z', link: 'https://pokemongo.com/en/post/go-wild-area-sendai-2026/' };
const official = { id: 'official', name: 'Pokémon GO (official)', url: event.link };
const leekduck = { id: 'leekduck', name: 'Leek Duck', url: 'https://leekduck.com/events/go-wild-area-sendai-2026/' };
const duckArt = 'https://cdn.leekduck.com/assets/img/events/article-images/2026/go-wild-area-sendai-2026/key-art.jpg';

test('selects the official event article over a secondary source and keeps its original attribution', () => {
  const selected = selectArtwork(event, [
    { image: duckArt, source: leekduck },
    { image: 'https://lh3.googleusercontent.com/event-poster', source: official }
  ]);
  assert.equal(selected.image, 'https://lh3.googleusercontent.com/event-poster');
  assert.equal(selected.imageProvenance.sourceUrl, event.link);
});

test('does not borrow opaque official art from a related article', () => {
  const selected = selectArtwork(event, [
    { image: 'https://lh3.googleusercontent.com/related-event', source: { ...official, url: 'https://pokemongo.com/en/post/go-wild-area-global-2026/' } },
    { image: duckArt, source: leekduck }
  ]);
  assert.equal(selected.image, duckArt);
  assert.equal(selected.imageProvenance.source, 'Leek Duck');
});

test('accepts an exact official article when the feed links to a secondary page', () => {
  const selected = selectArtwork({ ...event, link: leekduck.url }, [
    { image: 'https://lh3.googleusercontent.com/sendai-event-poster', source: official }
  ]);
  assert.equal(selected.imageProvenance.sourceUrl, official.url);
});

test('rejects previous year, generic and a different event before selecting art', () => {
  const selected = selectArtwork(event, [
    { image: duckArt.replaceAll('2026', '2025'), source: leekduck },
    { image: 'https://cdn.leekduck.com/assets/img/events/events-default-img.jpg', source: leekduck },
    { image: duckArt.replaceAll('sendai', 'mexico-city'), source: leekduck }
  ]);
  assert.equal(selected.image, null);
  assert.equal(selected.imageProvenance, null);
});

test('the importer joins a curated live event to its canonical ID and keeps its primary source link', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ json: async () => ({ events: [{ id: 'curated:sendai', name: 'GO Wild Area: Sendai', start: event.start, end: event.end, reports: [] }] }) });
  try {
    const events = await appEvents();
    const sendai = events.filter(item => item.id === 'sendai');
    assert.equal(sendai.length, 1);
    assert.equal(sendai[0].link, 'https://pokemongo.com/en/gowildarea/sendai');
  } finally { globalThis.fetch = originalFetch; }
});
