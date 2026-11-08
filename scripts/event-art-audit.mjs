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
  return { id: ev.id, name: ev.name, year: String(ev.start || '').slice(0, 4) || null,
    start: ev.start || null, end: ev.end || null, location: ev.region || local?.location || null,
    artwork: image, source, status: image ? 'verified_event_art' : 'illustrated_fallback',
    suppliedImage: ev.image || null,
    suppliedImageAccepted: !!ev.image && artwork.verify(ev.image, subject) !== null };
});
const verified = rows.filter(row => row.status === 'verified_event_art').length;
console.log(JSON.stringify({ auditedAt: new Date().toISOString(), total: rows.length, verified, fallback: rows.length - verified, events: rows }, null, 2));
