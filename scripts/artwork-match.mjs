// Identity matching for costume / form artwork. Pure functions: nothing here downloads, approves or publishes an image.
//
// A candidate is only ever as strong as its evidence, and the output status is never "approved":
//   source page  -> pm<dex>.<f|c><CODE>.icon.png named on a Leek Duck event page next to the alt text "Pikachu wearing a sun crown"
//   PokeMiners   -> that exact file exists in the pogo_assets tree (compact index from inventory-pokeminers.mjs)
//   game master  -> a formSettings form SPECIES_CODE exists and is flagged isCostume
// Approval additionally needs somebody to look at the bytes (see docs/asset-inventory/candidate-queue.json).
import { parseIconPath } from './inventory-pokeminers.mjs';

export const AVATAR_ITEM = /\b(tee|t-?shirt|shirt|pants|jacket|hoodie|jersey|shorts|skirt|dress|backpack|helmet|glasses|sunglasses|socks|shoes|sneakers|boots|gloves|bag|cap|beanie|poncho|cape|scarf|outfit|pose)\b/i;
/** True for trainer clothing such as "GO Wild Area 2026 Tee (Purple)". Never a Pokémon costume. */
export function isAvatarItemName(name) { return AVATAR_ITEM.test(String(name || '')) && !/\bwearing\b/i.test(String(name || '')); }

export const slug = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** "Pikachu wearing a sun crown" -> "sun crown"; "Gengar wearing a Spooky Festival costume" -> "spooky festival". */
export function costumeLabelFromAlt(alt, species = '') {
  let s = String(alt || '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const m = /\bwearing\s+(?:a|an|the)?\s*(.+)$/i.exec(s); if (!m) return '';
  s = m[1].replace(/\s+costume$/i, '').replace(/\s+\(.*\)$/, '').trim();
  return species && s.toLowerCase() === String(species).toLowerCase() ? '' : s;
}

const IMG = /<img\b[^>]*>/gi;
const attr = (tag, name) => { const m = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(tag); return m ? m[1] : ''; };
const ICON_URL = /^https:\/\/cdn\.leekduck\.com\/assets\/img\/pokemon_icons_crop\/(pm\d+(?:\.[A-Za-z0-9_]+)*\.icon\.png)$/;

/** Every costumed Pokémon icon an event page names: { dex, prefix, code, shiny, alt, label, file, imageUrl }. */
export function extractIconRefs(html) {
  const seen = new Set(), out = [];
  for (const tag of String(html || '').match(IMG) || []) {
    const src = attr(tag, 'src'), m = ICON_URL.exec(src); if (!m) continue;
    const r = parseIconPath('Images/Pokemon/Addressable Assets/' + m[1]); if (!r || !r.code) continue;
    const alt = attr(tag, 'alt'), key = m[1] + '|' + alt; if (seen.has(key)) continue; seen.add(key);
    out.push({ dex: r.dex, prefix: r.prefix, code: r.code, shiny: r.shiny, alt, label: costumeLabelFromAlt(alt), file: m[1], imageUrl: src });
  }
  return out;
}

/** Game-master form table: "PIKACHU|GOFEST_2024_STIARA" -> { form, isCostume }. Accepts the parsed latest.json array. */
export function gameMasterForms(templates) {
  const map = new Map();
  for (const t of templates || []) {
    const fs = t && t.data && t.data.formSettings; if (!fs || !fs.pokemon) continue;
    for (const f of fs.forms || []) {
      const form = String(f.form || ''), prefix = fs.pokemon + '_';
      if (form.startsWith(prefix)) map.set(fs.pokemon + '|' + form.slice(prefix.length), { form, isCostume: !!f.isCostume });
    }
  }
  return map;
}

const speciesKey = n => String(n || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * Build reviewable candidates from event pages that are not yet in the live manifest.
 * dexNames: [[25,"Pikachu"], ...] (public/dex.json). index: parsed pokeminers-index.json. gm: gameMasterForms() map or null.
 */
export function candidatesFromPage({ html, pageUrl, dexNames, index, gm = null, known = new Set(), now = '' }) {
  const names = new Map((dexNames || []).map(p => [Number(p[0]), String(p[1])]));
  const out = [];
  for (const r of extractIconRefs(html)) {
    const species = names.get(r.dex); if (!species || !r.label) continue;
    const key = r.dex + '|' + slug(r.label) + '|' + r.prefix + r.code;
    if (known.has(key)) continue;
    const flags = (index && index.pokemon && index.pokemon[r.dex] && index.pokemon[r.dex][r.prefix + r.code]) || '';
    const form = gm ? gm.get(speciesKey(species) + '|' + r.code) : null;
    const inPokeMiners = { normal: flags.includes('n'), shiny: flags.includes('s') };
    const evidence = ['source page names ' + r.file + ' for "' + r.alt + '"',
      inPokeMiners.normal ? 'file present in PokeMiners/pogo_assets index' : 'NOT in the PokeMiners index snapshot (not yet datamined or different name)',
      form ? 'game master form ' + form.form + (form.isCostume ? ' (isCostume)' : ' (not flagged isCostume)') : gm ? 'no matching game-master form' : 'game master not checked'];
    out.push({ id: slug(species) + '-' + slug(r.label), dex: r.dex, species, kind: 'costume', costume: slug(r.label), label: r.label,
      asset: { prefix: r.prefix, code: r.code }, sourcePage: pageUrl || '', observedAt: now, inPokeMiners, gameMaster: form ? { form: form.form, isCostume: form.isCostume } : null,
      status: 'candidate', evidence,
      // Machine checks only ever reach "candidate"; a person still has to look at the pixels.
      strength: inPokeMiners.normal && form && form.isCostume ? 'source+pokeminers+gamemaster' : inPokeMiners.normal ? 'source+pokeminers' : 'source-only' });
  }
  return out;
}

/** Costume / Gigantamax identities named by an events catalogue that have no usable art yet. */
export function missingIdentities(events, manifestEntries, keyOf) {
  const out = new Map();
  for (const ev of events || []) for (const p of ev.pokemon || []) {
    const dex = Number(p.speciesId); if (!dex) continue;
    if (p.costumeId && p.label) {
      if (isAvatarItemName(p.name)) continue;
      const req = { dex, kind: 'costume', costume: slug(p.label), shiny: false }, k = keyOf(req);
      if (!manifestEntries[k] || manifestEntries[k].status !== 'approved') out.set(k, { dex, name: p.name, costume: req.costume, label: p.label, event: ev.eventId });
    }
  }
  return [...out.values()];
}
