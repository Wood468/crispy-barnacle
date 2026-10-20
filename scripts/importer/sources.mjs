// Where event write-ups come from, most trusted first. Add a source by adding an entry; nothing else changes.
export const SOURCES = [
  { id: "official", name: "Pokémon GO (official)", trust: "official", hosts: ["pokemongo.com", "www.pokemongo.com"],
    lists: ["https://pokemongo.com/en/news", "https://pokemongo.com/news"], pattern: /^https:\/\/(www\.)?pokemongo\.com\/(en\/)?(post|news)\/[a-z0-9-]{6,}\/?$/i },
  { id: "leekduck", name: "Leek Duck", trust: "community", hosts: ["leekduck.com", "www.leekduck.com"],
    lists: ["https://leekduck.com/events/"], pattern: /^https:\/\/(www\.)?leekduck\.com\/events\/[a-z0-9-]{4,}\/?$/i },
  { id: "hub", name: "Pokémon GO Hub", trust: "community", hosts: ["pokemongohub.net", "www.pokemongohub.net"],
    lists: ["https://pokemongohub.net/feed/"], pattern: /^https:\/\/pokemongohub\.net\/post\/(event|news|article|guide)\/[a-z0-9-]{6,}\/?$/i }
];
export const sourceFor = url => { try { const h = new URL(url).hostname; return SOURCES.find(s => s.hosts.includes(h)) || null; } catch { return null; } };
export const EVENT_WORDS = /event|community day|spotlight|raid|max battle|max monday|fest|wild area|hatch|research|go pass|safari|tour|season|meteor|halloween|debut|dynamax|gigantamax|pok[eé]mon[ -]run|\brun\b|apac|anniversary|in-person|live-event/i;
