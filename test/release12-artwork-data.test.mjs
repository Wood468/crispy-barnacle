import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import artwork from '../public/event-art.js';

const audit = JSON.parse(await readFile(new URL('../data/release1.2-artwork-audit.json', import.meta.url), 'utf8'));
const details = JSON.parse(await readFile(new URL('../public/event-details.json', import.meta.url), 'utf8')).events;
const catalogue = JSON.parse(await readFile(new URL('../public/events-v1.json', import.meta.url), 'utf8')).events;
const curated = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8')).events;

test('every current and upcoming feed row has a unique artwork decision and a dated source when verified', () => {
  assert.equal(audit.total, 44);
  assert.equal(new Set(audit.events.map(event => event.id)).size, audit.total);
  assert.equal(audit.verified + audit.fallback, audit.total);
  for (const event of audit.events) {
    if (event.status === 'verified_event_art') {
      assert.ok(event.artwork && event.source, event.name);
      assert.ok(artwork.verify(event.artwork, { name: event.name, start: event.start, end: event.end, region: event.location }), event.name);
    } else assert.equal(event.artwork, null, event.name);
  }
});

test('the wrong-year Machamp and Minior images and related Eternatus image are removed from imported details', async () => {
  for (const id of [
    'leekduck:go-wild-area-gigantamax-machamp-power-up-timed-research',
    'leekduck:eternamax-eternatus-max-battles-2026',
    'leekduck:minior-showers-eta-aquariids-2027',
    'leekduck:minior-showers-southern-delta-aquariids-2027',
    'leekduck:minior-showers-perseids-2027'
  ]) assert.equal(details[id]?.image ?? null, null, id); // a record folded into its curated twin has no image either
  const pages = JSON.parse(await readFile(new URL('../public/event-artwork.json', import.meta.url), 'utf8')).pages || {};
  // The 2026 Machamp research may carry no image, or only the artwork of an official 2026 news page that its own
  // official twin cites as a source (the Into the Wild banner); never an image from another year or page.
  const machamp = catalogue.find(event => event.eventId === 'leekduck:go-wild-area-gigantamax-machamp-power-up-timed-research');
  const twin = catalogue.find(event => /^w-go-wild-area-gigantamax-machamp/.test(event.eventId));
  const machampPages = (twin?.sources || []).filter(source => source.id === 'official').map(source => source.url.replace(/\/?$/, '/'));
  const machampOwn = machampPages.filter(url => /2026/.test(url) && !/20(?!26)\d{2}/.test(url)).map(url => pages[url]?.image).filter(Boolean);
  assert.ok((machamp?.image ?? null) === null || machampOwn.includes(machamp.image), 'Machamp image must be null or an official 2026 page image cited by its own event');
  // The 2026 Eternamax Eternatus event may carry only the artwork of its own official 2026 announcement page, never an older year's image.
  const own = pages['https://pokemongo.com/news/dynamax-trails-eternamax-eternatus-2026/']?.image || null;
  const eter = catalogue.find(event => event.eventId === 'leekduck:eternamax-eternatus-max-battles-2026')?.image ?? null;
  assert.ok(eter === null || eter === own, 'Eternatus image must be null or its own 2026 official page image');
});

test('Today uses the verified primary Sendai artwork and its original source page', () => {
  const sendai = curated.find(event => event.id === 'sendai');
  assert.equal(sendai.img, details.sendai.image);
  assert.equal(sendai.artSourceUrl.replace(/\/$/, ''), details.sendai.imageProvenance.sourceUrl.replace(/\/$/, ''));
  assert.equal(catalogue.find(event => event.eventId === 'sendai')?.image, sendai.img);
});
