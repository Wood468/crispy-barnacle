/**
 * Final-source invariant: keep explicitly dated and sourced curated Raid/Max
 * schedule identities after page imports, duplicate joins and line corrections.
 *
 * Some source image lists name the base Pokémon even when the published event
 * schedule names Crowned/Dynamax forms. This pass applies only to a matching
 * curated event's verified, typed activities. It never rewrites player/Collection
 * data or adds form claims from unspecified source prose.
 */
import {reconcileActivityEncounters} from './encounters.mjs';

export function restoreVerifiedCuratedForms(out, curatedEvents, options={}) {
  if (!out || !Array.isArray(curatedEvents)) return [];
  const changed = [];
  for (const event of curatedEvents) {
    if (!event || typeof event.id !== 'string' || !Array.isArray(event.activities) || !event.activities.length) continue;
    const details = out[event.id];
    if (!details || !Array.isArray(details.pokemon) || !Array.isArray(details.encounters)) continue;
    const original = {
      pokemon: details.pokemon,
      encounters: details.encounters,
      encounterConflicts: details.encounterConflicts || []
    };
    const next = reconcileActivityEncounters(original, event.activities, options);
    if (next === original) continue;
    const before = JSON.stringify(original.pokemon) + JSON.stringify(original.encounters);
    const after = JSON.stringify(next.pokemon) + JSON.stringify(next.encounters);
    if (before === after) continue;
    // Keep all source, research, bonus, ticket and image fields untouched.
    out[event.id] = {
      ...details,
      pokemon: next.pokemon,
      encounters: next.encounters,
      encounterConflicts: next.encounterConflicts
    };
    changed.push(event.id);
  }
  return changed;
}
