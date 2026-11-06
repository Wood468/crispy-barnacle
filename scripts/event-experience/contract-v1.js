/* Universal event contract v1. Pure, dependency-free helpers; not wired into the live renderer. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GOEventContract = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var METHODS = ['wild', 'raid', 'max', 'egg', 'incense', 'research', 'lure', 'photobomb', 'other'];
  function str(x) { return typeof x === 'string' ? x.trim() : ''; }
  function identity(p) {
    if (!p || !str(p.speciesId)) throw new Error('speciesId is required');
    return [str(p.speciesId).toLowerCase(), str(p.formId).toLowerCase() || 'base', str(p.costumeId).toLowerCase() || 'none'].map(encodeURIComponent).join(':');
  }
  function normalize(raw) {
    if (!raw || raw.schemaVersion !== 1 || !str(raw.eventId)) throw new Error('Invalid v1 event');
    var seen = Object.create(null), pokemon = Object.create(null), encounters = [];
    (raw.pokemon || []).forEach(function (p) {
      var key = identity(p);
      if (pokemon[key] && JSON.stringify(pokemon[key]) !== JSON.stringify(p)) throw new Error('Conflicting identity: ' + key);
      pokemon[key] = { key: key, speciesId: str(p.speciesId), formId: str(p.formId) || null, costumeId: str(p.costumeId) || null, shiny: ['yes','no','unknown'].indexOf(p.shiny) >= 0 ? p.shiny : 'unknown', assetKey: str(p.assetKey) || null };
    });
    (raw.encounters || []).forEach(function (e) {
      var key = str(e.identityKey).toLowerCase(), method = str(e.method), activity = str(e.activityId) || 'main';
      if (!pokemon[key]) throw new Error('Encounter references unknown Pokémon: ' + key);
      if (METHODS.indexOf(method) < 0) throw new Error('Unknown encounter method: ' + method);
      var edge = [key, method, activity, str(e.access) || 'all'].join('|');
      if (seen[edge]) return;
      seen[edge] = true;
      encounters.push({ identityKey: key, method: method, activityId: activity, access: str(e.access) || 'all' });
    });
    encounters.sort(function (a,b) { return [a.method,a.activityId,a.identityKey,a.access].join('|').localeCompare([b.method,b.activityId,b.identityKey,b.access].join('|')); });
    var groups = {};
    encounters.forEach(function (e) { (groups[e.method] || (groups[e.method] = [])).push(e); });
    var schedule = raw.schedule || null;
    if (schedule) {
      if (!str(schedule.start) || !str(schedule.end)) throw new Error('Schedule requires start and end');
      if (['local','instant'].indexOf(schedule.timeBasis) < 0) throw new Error('Schedule requires local or instant timeBasis');
      if (schedule.timeBasis === 'instant' && (!/(Z|[+-]\\d{2}:\\d{2})$/.test(schedule.start) || !/(Z|[+-]\\d{2}:\\d{2})$/.test(schedule.end))) throw new Error('Instant schedule requires timezone offsets');
      if (schedule.timeBasis === 'local' && (!str(schedule.timeZone) || !/^[A-Za-z_]+\\/[A-Za-z_]+/.test(schedule.timeZone))) throw new Error('Local schedule requires IANA timeZone');
      if (Date.parse(schedule.start) >= Date.parse(schedule.end)) throw new Error('Schedule end must follow start');
    }
    var aliases = Array.from(new Set((raw.aliases || []).map(str).filter(Boolean))).sort();
    var optional = {};
    ['activities','bonuses','research','passes','tickets','sources'].forEach(function (k) { optional[k] = Array.isArray(raw[k]) ? raw[k].slice() : []; });
    return { schemaVersion: 1, eventId: str(raw.eventId), aliases: aliases, family: str(raw.family) || 'other', title: str(raw.title), schedule: schedule, activities: optional.activities, bonuses: optional.bonuses, research: optional.research, passes: optional.passes, tickets: optional.tickets, sources: optional.sources, pokemon: Object.keys(pokemon).sort().map(function (k) { return pokemon[k]; }), encounters: encounters, groups: groups };
  }
  return { identity: identity, normalize: normalize, methods: METHODS.slice() };
}));
