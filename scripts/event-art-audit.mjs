#!/usr/bin/env node
// Audits a public event-feed snapshot with the same resolver used by the app.
import { readFile } from 'node:fs/promises';
import artwork from '../public/event-art.js';

const input = process.argv[2];
if (!input) throw Error('Usage: node scripts/event-art-audit.mjs api-events.json [event-details.json]');
const feed = JSON.parse(await readFile(input, 'utf8'));
const details = process.argv[3] ? JSON.parse(await readFile(process.argv[3], 'utf8')).events || {} : {};
const curated = new Map((JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8')).events || []).map(event => [event.id, event]));
const rows = (feed.events || feed).map(ev => {
  const local = curated.get(String(ev.id || '').replace(/^curated:/, ''));
  const link = ev.link || (ev.reports || []).find(report => report.link)?.link || local?.sourceUrl || null;
  const id = 'leekduck:' + String(link || '').split('/').filter(Boolean).pop();
  const detail = details[ev.id] || details[local?.id] || details[id] || {};
  const subject = { name: ev.name, start: ev.start, end: ev.end, region: ev.region || local?.location || '' };
  const candidates = [ev.image, detail.imageProvenance && detail.image].filter(Boolean);
  const selected = artwork.resolve(subject, candidates);
  const image = selected.kind === 'official' ? selected.src : null;
  const source = image === detail.image && detail.imageProvenance
    ? detail.imageProvenance.sourceUrl
    : image === ev.image ? link : null;
  const supplied = ev.image || null;
  const years = [String(ev.start || '').slice(0, 4), String(ev.end || '').slice(0, 4)].filter(Boolean);
  const imageYears = supplied ? supplied.match(/20\d{2}/g) || [] : [];
  const reason = image ? 'matched_event_artwork' : !supplied ? 'no_image_announced'
    : /default|placeholder|no[-_]?image|logo|favicon/i.test(supplied) ? 'generic_image'
    : imageYears.some(year => !years.includes(year)) ? 'wrong_year'
    : 'shared_or_unverifiable_image';
  return { id: ev.id, name: ev.name, year: String(ev.start || '').slice(0, 4) || null,
    start: ev.start || null, end: ev.end || null, location: ev.region || local?.location || null,
    artwork: image, source, sourceEventId: source ? source.split('/').filter(Boolean).pop() : null,
    status: image ? 'verified_event_art' : 'illustrated_fallback', reason,
    suppliedImage: supplied,
    suppliedImageAccepted: !!ev.image && artwork.verify(ev.image, subject) !== null };
});
const verified = rows.filter(row => row.status === 'verified_event_art').length;
console.log(JSON.stringify({ auditedAt: new Date().toISOString(), total: rows.length, verified, fallback: rows.length - verified, events: rows }, null, 2));
