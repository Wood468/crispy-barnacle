/* Universal event contract v1. Pure, dependency-free helpers; not wired into the live renderer. */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./event-clock.js') : root.GOEventClock);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GOEventContract = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (clock) {
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
      var next = { key: key, speciesId: str(p.speciesId), formId: str(p.formId)==='base'?null:str(p.formId)||null, costumeId: str(p.costumeId)==='none'?null:str(p.costumeId)||null, shiny: ['yes','no','unknown'].indexOf(p.shiny) >= 0 ? p.shiny : 'unknown', assetKey: str(p.assetKey) || null, name: str(p.name) || str(p.speciesId), label: str(p.label) || null, debut: typeof p.debut==='boolean'?p.debut:null, boostedShiny: typeof p.boostedShiny==='boolean'?p.boostedShiny:null, collectionName: str(p.collectionName) || str(p.name) || str(p.speciesId) };
      if (pokemon[key] && JSON.stringify(pokemon[key]) !== JSON.stringify(next)) throw new Error('Conflicting identity: ' + key);
      pokemon[key] = next;
    });
    var activityIds=new Set(['main']), activities=[], activityById={};
    (raw.activities||[]).forEach(function(a){
      if(!a||!str(a.id))throw Error('Activity requires stable id');
      if(activityById[a.id])throw Error('Duplicate activity id: '+a.id);
      var copy=JSON.parse(JSON.stringify(a));
      if(copy.schedule){
        if(!copy.schedule.timeBasis){copy.schedule.timeBasis=/(Z|[+-]\d{2}:\d{2})$/.test(copy.schedule.start)?'instant':raw.schedule&&raw.schedule.timeBasis;}
        if(copy.schedule.timeBasis==='local'&&!copy.schedule.timeZone&&raw.schedule)copy.schedule.timeZone=raw.schedule.timeZone;
        clock.range(copy.schedule,copy.schedule.timeBasis==='player-local'?'Australia/Melbourne':undefined);
      }
      activityById[a.id]=copy;activityIds.add(a.id);activities.push(copy);
    });
    activities.forEach(function(a){
      if(a.parentId&&!activityIds.has(a.parentId))throw Error('Unknown activity parent: '+a.parentId);
      var walk=a,parents=new Set();while(walk&&walk.parentId&&walk.parentId!=='main'){if(parents.has(walk.id))throw Error('Activity cycle');parents.add(walk.id);walk=activityById[walk.parentId];}
    });
    var declared=(raw.encounters||[]).slice();
    activities.forEach(function(a){(a.pokemonRefs||[]).forEach(function(key){declared.push({identityKey:key,method:a.kind,activityId:a.id,access:a.access});});});
    (raw.pokemon||[]).forEach(function(p){(p.methods||[]).forEach(function(method){declared.push({identityKey:identity(p),method:method});});});
    declared.forEach(function (e) {
      var key = str(e.identityKey).toLowerCase(), method = str(e.method), activity = str(e.activityId) || 'main';
      if(!activityIds.has(activity))throw Error('Unknown encounter activity: '+activity);
      if (!pokemon[key]) throw new Error('Encounter references unknown Pokémon: ' + key);
      if (METHODS.indexOf(method) < 0) throw new Error('Unknown encounter method: ' + method);
      var edge = [key, method, activity, str(e.access) || 'unknown'].join('|');
      if (seen[edge]) return;
      seen[edge] = true;
      encounters.push({ identityKey: key, method: method, activityId: activity, access: str(e.access) || 'unknown' });
    });
    encounters.sort(function (a,b) { return [a.method,a.activityId,a.identityKey,a.access].join('|').localeCompare([b.method,b.activityId,b.identityKey,b.access].join('|')); });
    var groups = {};
    encounters.forEach(function (e) { (groups[e.method] || (groups[e.method] = [])).push(e); });
    var schedule = raw.schedule || null;
    if (schedule) {
      if (!str(schedule.start) || !str(schedule.end)) throw Error('Schedule requires start and end');
      if (['local','instant','player-local'].indexOf(schedule.timeBasis)<0) throw Error('Schedule requires local or instant timeBasis');
      if (schedule.timeBasis==='instant' && (!/(Z|[+-]\d{2}:\d{2})$/.test(schedule.start)||!/(Z|[+-]\d{2}:\d{2})$/.test(schedule.end))) throw Error('Instant schedule requires timezone offsets');
      clock.range(schedule, schedule.timeBasis==='player-local'?'Australia/Melbourne':undefined);
    }
    var aliases = Array.from(new Set((raw.aliases || []).map(str).filter(Boolean))).sort();
    var optional = {};
    ['activities','bonuses','research','passes','tickets','sources'].forEach(function (k) { optional[k] = Array.isArray(raw[k]) ? raw[k].slice() : []; });
    return { schemaVersion: 1, eventId: str(raw.eventId), aliases: aliases, family: str(raw.family) || classify(raw.title,raw.kind), title: str(raw.title), dateText: str(raw.dateText), completeness: raw.completeness==='complete'?'complete':'partial', lifecycle: str(raw.lifecycle) || 'announced', attendance: str(raw.attendance)||(raw.inPerson===true||raw.scope==='in-person'?'in-person':''), location: raw.location || null, image: str(raw.image) || null, notes: Array.isArray(raw.notes)?raw.notes.slice():[], internalValidation: Object.assign({warnings:[],lifecycleDeclared:typeof raw.lifecycle==='string'},raw.internalValidation||{}), schedule: schedule, activities: activities, bonuses: optional.bonuses, research: optional.research, passes: optional.passes, tickets: optional.tickets, sources: optional.sources, pokemon: Object.keys(pokemon).sort().map(function (k) { return pokemon[k]; }), encounters: encounters, groups: groups };
  }
  function classify(title,kind) {
    var text=String(kind||'')+' '+String(title||'');
    if(/go pass/i.test(text))return 'go-pass';
    var families=[['community-day',/community day/i],['raid-hour',/raid hour/i],['raid-day',/raid day/i],['spotlight-hour',/spotlight hour/i],['max-battles',/max (monday|battle)|gigantamax|dynamax/i],['go-fest',/go fest/i],['wild-area',/wild area/i],['go-tour',/go tour/i],['city-safari',/city safari/i],['safari-zone',/safari zone/i],['go-pass',/go pass/i],['season',/season/i],['go-battle-league',/battle league/i]];
    var hit=families.find(function(f){return f[1].test(text);});return hit?hit[0]:'other';
  }
  return { identity: identity, normalize: normalize, classify: classify, methods: METHODS.slice() };
}));
