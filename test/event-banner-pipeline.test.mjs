import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { buildCatalogue } = require('../scripts/event-experience/build-catalogue.cjs');
const Art = require('../public/event-art.js');
const UI = require('../public/event-components.js');
const { pageArtworkIndex } = await import('../scripts/importer/artwork.mjs');
const { announcementFromPage } = await import('../scripts/importer/announcements.mjs');

const dex = [[25, 'Pikachu', 1]];
const LD = 'https://cdn.leekduck.com/assets/img/events/article-images/2027/2027-02-01-winter-showcase-2027/winter-showcase-2027.jpg';
const officialUrl = 'https://pokemongo.com/news/winter-showcase-2027';
const ldUrl = 'https://leekduck.com/events/winter-showcase-2027/';
const og = image => '<html><head><meta property="og:image" content="' + image + '"></head><body><h2>Wild encounters</h2><ul><li>Pikachu</li></ul></body></html>';
const leek = { source: 'leekduck', url: ldUrl, title: 'Winter Showcase 2027', html: og(LD), fields: {} };
const official = { source: 'official', url: officialUrl, title: 'Winter Showcase', html: og('https://lh3.googleusercontent.com/winter-showcase-hero'), fields: {} };
const hub = { source: 'hub', url: 'https://pokemongohub.net/post/event/winter-showcase/', title: 'Hub', html: og('https://pokemongohub.net/x.jpg'), fields: {} };

test('page artwork index keeps official and Leek Duck page images with provenance, never hub or foreign hosts', () => {
  const index = pageArtworkIndex([leek, official, hub], {}, '2027-01-20T00:00:00Z');
  assert.deepEqual(Object.keys(index).sort(), ['https://leekduck.com/events/winter-showcase-2027/', 'https://pokemongo.com/news/winter-showcase-2027/']);
  const entry = index['https://pokemongo.com/news/winter-showcase-2027/'];
  assert.equal(entry.source, 'Pokémon GO (official)'); assert.equal(entry.sourceUrl, officialUrl); assert.equal(entry.retrievedAt, '2027-01-20T00:00:00Z');
});

test('a temporarily unreadable page keeps its banner for 45 days; a page read without an image drops it', () => {
  const first = pageArtworkIndex([leek], {}, '2027-01-20T00:00:00Z');
  assert.ok(pageArtworkIndex([], first, '2027-02-10T00:00:00Z')['https://leekduck.com/events/winter-showcase-2027/'], 'outage retains');
  assert.equal(Object.keys(pageArtworkIndex([], first, '2027-04-10T00:00:00Z')).length, 0, 'expired');
  assert.equal(Object.keys(pageArtworkIndex([{ ...leek, html: '<html></html>' }], first, '2027-02-10T00:00:00Z')).length, 0, 'read, no image');
});

const curated = { id: 'winter', t: 'Winter Showcase', s: '2027-02-01T10:00', e: '2027-02-05T20:00', art: ['Pikachu'], sourceUrl: ldUrl };
const source = url => ({ id: url.includes('leekduck') ? 'leekduck' : 'official', name: 'src', url });
const detailsFor = ({ image = null, withProvenance = true } = {}) => ({ events: { winter: { name: 'Winter Showcase', sources: [source(ldUrl), source(officialUrl)], ...(withProvenance ? { image, imageProvenance: image ? { source: 'Leek Duck', sourceUrl: ldUrl, imageUrl: image } : null } : {}) } } });

test('importer page art to catalogue to Today and Details: a new event gets its promotional artwork automatically', () => {
  const artwork = { pages: pageArtworkIndex([leek, official], {}, '2027-01-20T00:00:00Z') };
  const result = buildCatalogue({ dex, data: { events: [curated] }, details: detailsFor(), artwork });
  const model = result.events.find(e => e.eventId === 'winter');
  assert.equal(model.image, LD, 'Leek Duck article image selected for the event');
  // Today and Details resolve the very same image through the one artwork rule
  const art = Art.resolve({ name: model.title, start: model.schedule?.start || model.internalValidation.legacyDates.start, end: model.internalValidation.legacyDates.end }, [{ url: model.image, pageUrl: ldUrl }]);
  assert.equal(art.kind, 'official'); assert.equal(art.src, LD); assert.equal(art.provenance.url, ldUrl);
  assert.ok(UI.render(model, {}).includes('Winter Showcase'));
});

test('a future announcement page with an og:image is published with its banner and provenance-checkable URL', () => {
  const announcement = announcementFromPage({ ...leek, html: og(LD) + '', fields: {} }, { dex });
  assert.ok(announcement, 'announcement created');
  assert.equal(announcement.image, LD);
  const result = buildCatalogue({ dex, details: { events: { [announcement.eventId]: { name: announcement.title, normalizedEvent: announcement, image: LD, imageProvenance: { source: 'Leek Duck', sourceUrl: ldUrl, imageUrl: LD } } } } });
  assert.equal(result.events[0].image, LD);
});

test('alias merge never loses the verified banner, whichever record carries it', () => {
  const importerRecord = { image: LD, imageProvenance: { source: 'Leek Duck', sourceUrl: ldUrl, imageUrl: LD }, name: 'Winter Showcase 2027', sources: [source(ldUrl)], normalizedEvent: { schemaVersion: 1, eventId: 'leekduck:winter-showcase-2027', title: 'Winter Showcase 2027', lifecycle: 'announced', sources: [source(ldUrl)], image: LD, schedule: null, pokemon: [], encounters: [], activities: [] } };
  for (const withProvenance of [true, false]) {
    const details = { events: { 'leekduck:winter-showcase-2027': importerRecord, ...detailsFor({ withProvenance }).events } };
    const result = buildCatalogue({ dex, data: { events: [curated] }, details, aliases: { same: [['winter', 'leekduck:winter-showcase-2027']] } });
    const matches = result.events.filter(e => /Winter Showcase/.test(e.title));
    assert.equal(matches.length, 1, 'one record');
    assert.equal(matches[0].image, LD, 'banner kept (curated record reviewed with no image: ' + withProvenance + ')');
  }
});

test('records that share a Leek Duck page share its verified banner, distinct events do not', () => {
  const donor = { id: 'leekduck:winter-showcase-2027', name: 'Winter Showcase 2027', sources: [source(ldUrl)], image: LD, imageProvenance: { source: 'Leek Duck', sourceUrl: ldUrl, imageUrl: LD } };
  const other = { id: 'unrelated', t: 'Spring Garden Party', s: '2027-02-02T10:00', e: '2027-02-03T10:00', sourceUrl: 'https://leekduck.com/events/spring-garden-party-2027/' };
  const details = { events: { 'leekduck:winter-showcase-2027': { ...donor, normalizedEvent: { schemaVersion: 1, eventId: donor.id, title: donor.name, lifecycle: 'announced', sources: donor.sources, image: LD, schedule: null, pokemon: [], encounters: [], activities: [] } } } };
  const result = buildCatalogue({ dex, data: { events: [curated, other] }, details, artwork: { pages: pageArtworkIndex([leek], {}, '2027-01-20T00:00:00Z') } });
  assert.equal(result.events.find(e => e.eventId === 'unrelated').image || null, null, 'a different event is not given the banner');
});

test('generic, wrong-year and wrong-event images are still rejected', () => {
  const ev = { name: 'Winter Showcase', start: '2027-02-01T10:00', end: '2027-02-05T20:00' };
  assert.equal(Art.verify('https://cdn.leekduck.com/assets/img/events/events-default-img.jpg', ev), null);
  assert.equal(Art.verify(LD.replaceAll('2027', '2026'), ev), null);
  assert.equal(Art.verify('https://cdn.leekduck.com/assets/img/events/article-images/2027/2027-02-01-other-festival-2027/key-art.jpg', ev), null);
  const artwork = { pages: { [ldUrl]: { image: LD.replaceAll('2027', '2026') } } };
  const result = buildCatalogue({ dex, data: { events: [curated] }, details: detailsFor(), artwork });
  assert.equal(result.events.find(e => e.eventId === 'winter').image || null, null);
});

test('published catalogue keeps the real Into the Wild banner and every shown banner is verifiable at render time', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../public/events-v1.json', import.meta.url), 'utf8'));
  const into = catalogue.events.find(e => e.eventId === 'into');
  assert.match(into.image, /2026-11-09-into-the-wild-2026\/into-the-wild-2026\.jpg$/);
  const dates = into.schedule;
  assert.equal(Art.resolve({ name: into.title, start: dates.start, end: dates.end }, [into.image]).kind, 'official');
  // The Machamp research card cites the Into the Wild page but is a different event: it must not borrow the banner.
  const research = catalogue.events.find(e => /Gigantamax Machamp Power Up/i.test(e.title) && e.image);
  assert.ok(!research || !/into-the-wild/.test(research.image));
});

test('an unattributed legacy image yields to the official page whose address names the event', () => {
  const globalPage = 'https://pokemongo.com/en/gowildarea/global', news = 'https://pokemongo.com/news/gowa-global-europe-2026';
  const own = { id: 'wag', t: 'GO Wild Area: Global', s: '2026-11-14T10:00', e: '2026-11-15T18:00' };
  const details = { events: { wag: { name: 'GO Wild Area: Global', image: 'https://lh3.googleusercontent.com/ambassador-photo', sources: [source(news), source(globalPage)] } } };
  const artwork = { pages: { [news + '/']: { image: 'https://lh3.googleusercontent.com/ambassador-photo' }, [globalPage + '/']: { image: 'https://lh3.googleusercontent.com/wild-area-hero' } } };
  const result = buildCatalogue({ dex, data: { events: [own] }, details, artwork });
  assert.equal(result.events.find(e => e.eventId === 'wag').image, 'https://lh3.googleusercontent.com/wild-area-hero');
});

const policy = JSON.parse(readFileSync(new URL('../data/artwork-policy.json', import.meta.url), 'utf8'));
const AMB = 'https://lh3.googleusercontent.com/community-ambassador-photo', SERIES = 'https://lh3.googleusercontent.com/mall-series-hero';
const ambassadorPage = 'https://pokemongo.com/news/gowa-global-europe-2026', mallPage = 'https://pokemongo.com/news/apac-mall-exploration-2026';

test('community ambassador photography is never event artwork, even when a record already carries it', () => {
  const meetup = { id: 'karlsruhe', t: 'GO Wild Area Global Meetup: Karlsruhe', s: '2026-11-14', e: '2026-11-15', sourceUrl: ambassadorPage };
  const details = { events: { karlsruhe: { name: meetup.t, image: AMB, sources: [source(ambassadorPage)] } } };
  const artwork = { pages: { [ambassadorPage + '/']: { image: AMB, sourceUrl: ambassadorPage } } };
  const result = buildCatalogue({ dex, data: { events: [meetup] }, details, artwork, artworkPolicy: policy });
  assert.equal(result.events.find(e => e.eventId === 'karlsruhe').image || null, null, 'themed card instead of photography');
  const future = buildCatalogue({ dex, data: { events: [{ ...meetup, id: 'future-meetup', t: 'Community Meetups: Oslo', sourceUrl: 'https://pokemongo.com/news/community-meetups-oslo-2026' }] }, artwork: { pages: { 'https://pokemongo.com/news/community-meetups-oslo-2026/': { image: AMB } } }, artworkPolicy: policy });
  assert.equal(future.events[0].image || null, null, 'a future ambassador-photography page is rejected by the generic rule');
});

test('a named installment never takes the whole event or a sibling event page art', () => {
  const globalEvent = { id: 'wag', t: 'GO Wild Area: Global', s: '2026-11-14T10:00', e: '2026-11-15T18:00' };
  const meetup = { id: 'stockholm', t: 'GO Wild Area Global Meetup: Stockholm', s: '2026-11-14', e: '2026-11-15' };
  const page = 'https://pokemongo.com/en/gowildarea/global';
  const details = { events: { wag: { name: globalEvent.t, sources: [source(page)] }, stockholm: { name: meetup.t, sources: [source('https://pokemongo.com/news/no-image-news'), source(page)] } } };
  const result = buildCatalogue({ dex, data: { events: [globalEvent, meetup] }, details, artwork: { pages: { [page + '/']: { image: 'https://lh3.googleusercontent.com/wild-area-hero' } } }, artworkPolicy: policy });
  assert.ok(result.events.find(e => e.eventId === 'wag').image);
  assert.equal(result.events.find(e => e.eventId === 'stockholm').image || null, null);
});

test('Mall Exploration series artwork is shared across locations and clearly identified; other events are unaffected', () => {
  const mk = (id, place, s, e) => ({ id, t: 'Pokémon 30th Anniversary Mall Exploration: ' + place, s, e });
  const events = [mk('m1', 'Changi', '2026-11-07', '2026-11-08'), mk('m2', 'CDO Downtown', '2027-03-13', '2027-03-28'), { id: 'other', t: 'Pokémon Night Out: London', s: '2026-11-10', e: '2026-11-11' }];
  const result = buildCatalogue({ dex, data: { events }, artwork: { pages: { [mallPage + '/']: { image: SERIES, sourceUrl: mallPage } } }, artworkPolicy: policy });
  for (const id of ['m1', 'm2']) {
    const model = result.events.find(e => e.eventId === id);
    assert.equal(model.image, SERIES, id);
    assert.equal(model.internalValidation.artScope, 'series');
    assert.equal(model.internalValidation.artSourceUrl, mallPage);
  }
  assert.equal(result.events.find(e => e.eventId === 'other').image || null, null);
  // without the reviewed allowlist the same data gets no shared art for the 2027 location
  const strict = buildCatalogue({ dex, data: { events }, artwork: { pages: { [mallPage + '/']: { image: SERIES, sourceUrl: mallPage } } } });
  assert.equal(strict.events.find(e => e.eventId === 'm2').image || null, null);
});

test('merged records keep an accurate status and "reference" is never a user-facing status', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../public/events-v1.json', import.meta.url), 'utf8'));
  for (const id of ['into', 'twilightwishes', 'smr2']) {
    const model = catalogue.events.find(e => e.eventId === id);
    assert.notEqual(model.lifecycle, 'reference', id);
    assert.equal(model.lifecycle, 'announced', id);
  }
  const importerRecord = { name: 'Winter Showcase 2027', sources: [source(ldUrl)], normalizedEvent: { schemaVersion: 1, eventId: 'leekduck:winter-showcase-2027', title: 'Winter Showcase 2027', lifecycle: 'reference', sources: [source(ldUrl)], schedule: null, pokemon: [], encounters: [], activities: [] } };
  const result = buildCatalogue({ dex, data: { events: [curated] }, details: { events: { 'leekduck:winter-showcase-2027': importerRecord } }, aliases: { same: [['winter', 'leekduck:winter-showcase-2027']] } });
  assert.equal(result.events.find(e => e.eventId === 'winter').lifecycle, 'announced');
  for (const model of catalogue.events) {
    const html = UI.render(model, {});
    assert.ok(!/class="[^"]*(?:status|lifecycle|state)[^"]*"[^>]*>\s*reference\s*</i.test(html), model.eventId);
    assert.ok(!/\bStatus:?\s*reference\b/i.test(html), model.eventId);
  }
});
