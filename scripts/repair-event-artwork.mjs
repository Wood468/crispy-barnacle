#!/usr/bin/env node
// Recheck a generated detail snapshot against a public API event snapshot.
// Only artwork fields change; encounter, research and collection data stay intact.
import { readFile, writeFile } from 'node:fs/promises';
import { selectArtwork } from './importer/artwork.mjs';

const [feedPath, detailsPath, outputPath] = process.argv.slice(2);
if (!feedPath || !detailsPath || !outputPath) throw Error('Usage: node scripts/repair-event-artwork.mjs api-events.json event-details.json output.json');
const feed = JSON.parse(await readFile(feedPath, 'utf8'));
const details = JSON.parse(await readFile(detailsPath, 'utf8'));
const curated = new Map((JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8')).events || []).map(event => [event.id, event]));
let cleared = 0, attributed = 0;
for (const event of feed.events || feed) {
  const local = curated.get(String(event.id || '').replace(/^curated:/, ''));
  const link = event.link || (event.reports || []).find(report => report.link)?.link || local?.sourceUrl || '';
  const id = 'leekduck:' + link.split('/').filter(Boolean).pop();
  const record = details.events[event.id] || details.events[local?.id] || details.events[id];
  if (!record?.image) continue;
  const original = record.image;
  const imageHost = new URL(original).hostname;
  const sourceId = imageHost === 'cdn.leekduck.com' ? 'leekduck' : 'official';
  const sources = (record.sources || []).filter(source => source.id === sourceId && (sourceId !== 'leekduck' || source.url.replace(/\/?$/, '/') === link.replace(/\/?$/, '/')));
  const choice = selectArtwork({ t: event.name, start: event.start, end: event.end, region: event.region || local?.location, link }, sources.map(source => ({ image: original, source })), { retrievedAt: record.updated || null });
  record.image = choice.image;
  record.imageProvenance = choice.imageProvenance;
  if (record.normalizedEvent?.image === original) record.normalizedEvent.image = choice.image;
  if (choice.image) attributed++; else cleared++;
}
await writeFile(outputPath, JSON.stringify(details, null, 1) + '\n');
console.log(JSON.stringify({ attributed, cleared }));
