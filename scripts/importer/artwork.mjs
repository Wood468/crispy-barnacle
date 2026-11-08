import artwork from '../../public/event-art.js';

const normalize = url => String(url || '').replace(/\/?$/, '/');
function officialPageMatches(event, sourceUrl) {
  if (normalize(event.link) === normalize(sourceUrl)) return true;
  let slug;
  try { slug = new URL(sourceUrl).pathname.split('/').filter(Boolean).pop().toLowerCase(); } catch { return false; }
  const year = String(event.start || '').slice(0, 4);
  const mentionedYears = slug.match(/20\d{2}/g) || [];
  if (mentionedYears.length && (!year || mentionedYears.some(value => value !== year))) return false;
  const words = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(word => word.length >= 4 && !/^(pokemon|event|events|2025|2026|2027|with|from|raid|battles|battle|area)$/.test(word));
  const title = String(event.t || event.name || '');
  const variant = words(title.split(':').slice(1).join(':'));
  const distinctive = words(title);
  return distinctive.filter(word => slug.includes(word)).length >= 2 && (!variant.length || variant.some(word => slug.includes(word)));
}

// An image belongs to its source article, not to every event mentioned by it.
// Opaque official CDN filenames need the event's own linked article as evidence.
export function selectArtwork(event, results, { retrievedAt = null } = {}) {
  const subject = { name: event.t || event.name, start: event.start, end: event.end, region: event.region || event.place || '' };
  const candidates = results.flatMap(result => {
    const { image, source } = result;
    if (!image || !source) return [];
    if (/^https:\/\/cdn\.leekduck\.com\//i.test(image) && source.id !== 'leekduck') return [];
    const opaque = /^https:\/\/(?:lh3\.googleusercontent\.com|cdn\.pokemongolive\.com|storage\.googleapis\.com\/pokemongolive)\//i.test(image);
    if (opaque && (source.id !== 'official' || !officialPageMatches(event, source.url))) return [];
    const verified = artwork.verify(image, subject);
    if (!verified) return [];
    return [{ image, source, priority: source.id === 'official' ? 0 : source.id === 'leekduck' ? 1 : 2 }];
  }).sort((a, b) => a.priority - b.priority);
  const chosen = candidates[0];
  return chosen ? { image: chosen.image, imageProvenance: { source: chosen.source.name, sourceUrl: chosen.source.url, imageUrl: chosen.image, checkedFor: subject.name, checkedAt: new Date().toISOString().slice(0, 10), ...(retrievedAt ? { retrievedAt } : {}) } } : { image: null, imageProvenance: null };
}
