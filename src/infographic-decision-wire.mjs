/* Explicit infographic targets persisted in the existing D1 decision text column.
 * No D1 schema migration. Legacy event IDs remain unchanged; bosses are an
 * opt-in versioned envelope and are never inferred from a raid rotation ID.
 */
import { normalizeInfographicTargets, targetsFromInfographicDecision } from "../scripts/infographic-target-contract.mjs";
const PREFIX = "targets-v1:";
const MAX_TARGETS = 8;
const MAX_BYTES = 4000;
const EVENT_IDS = /^[\w:.-]{1,90}(,[\w:.-]{1,90}){0,7}$/;

export function encodeInfographicTargets(value) {
  const targets = targetsFromInfographicDecision(value);
  if (!targets.length || targets.length > MAX_TARGETS) throw new TypeError("1–8 exact infographic targets required");
  const eventId = targets.filter(t => t.type === "event").map(t => t.eventId).join(",");
  if (eventId && !EVENT_IDS.test(eventId)) throw new TypeError("Invalid infographic event IDs");
  const includesBoss = targets.some(t => t.type === "raid-boss");
  const stored = includesBoss ? PREFIX + JSON.stringify(targets) : eventId;
  if (new TextEncoder().encode(stored).length > MAX_BYTES) throw new TypeError("Infographic targets too large");
  return { stored, eventId, targets };
}
export function decodeInfographicTargets(stored) {
  if (typeof stored !== "string" || new TextEncoder().encode(stored).length > MAX_BYTES) throw new TypeError("Invalid saved infographic targets");
  if (stored.startsWith(PREFIX)) {
    let value;
    try { value = JSON.parse(stored.slice(PREFIX.length)); }
    catch { throw new TypeError("Malformed saved infographic target envelope"); }
    const targets = normalizeInfographicTargets(value);
    if (!targets.length || targets.length > MAX_TARGETS) throw new TypeError("Invalid saved infographic target count");
    const eventId = targets.filter(t => t.type === "event").map(t => t.eventId).join(",");
    return { eventId, targets };
  }
  if (stored && !EVENT_IDS.test(stored)) throw new TypeError("Malformed legacy infographic event IDs");
  return { eventId: stored, targets: stored ? targetsFromInfographicDecision({eventId: stored}) : [] };
}
