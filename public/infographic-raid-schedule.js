/* Published, dated Raid/Max Battle entries only. Never infer a boss from poster text. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GOINFOGRAPHICRAIDPICKER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var MODES = ['normal', 'shadow', 'mega', 'primal', 'dynamax', 'gigantamax'];
  function dateMs(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(value)) return NaN;
    var d = new Date(value.length === 10 ? value + 'T00:00' : value);
    if (!Number.isFinite(+d)) return NaN;
    var day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return day === value.slice(0, 10) ? +d : NaN;
  }
  function nextDay(value) {
    var start = dateMs(value);
    if (!Number.isFinite(start)) return '';
    var d = new Date(start);
    if (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') !== value) return '';
    var next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0') + '-' + String(next.getDate()).padStart(2, '0');
  }
  /* Explicit canonical species names only, after removing known battle/form
     annotations. No arbitrary substring or caption matching. */
  function speciesName(value) {
    return String(value || '').trim()
      .replace(/^(?:Shadow|Dynamax|Gigantamax|Mega|Primal)\s+/i, '')
      .replace(/^(?:Crowned Sword|Crowned Shield|White|Black|Alolan|Galarian|Hisuian|Paldean)\s+/i, '')
      .replace(/\s+\((?:Origin|Altered|Normal|Attack|Defense|Speed)(?: Forme)?\)$/i, '')
      .replace(/\s+\((?:Incarnate|Therian)(?: Forme)?\)$/i, '')
      .replace(/\s+[XY]$/i, '').trim();
  }
  function modeOf(value, fallback) {
    var s = String(value || '');
    if (/^Gigantamax\s/i.test(s)) return 'gigantamax';
    if (/^Dynamax\s/i.test(s)) return 'dynamax';
    if (/^Primal\s/i.test(s)) return 'primal';
    if (/^Mega\s/i.test(s)) return 'mega';
    if (/^Shadow\s/i.test(s)) return 'shadow';
    return fallback;
  }
  function options(data, dex, nowMs, splitBosses, parseClock) {
    if (!data || !Array.isArray(dex) || !Number.isFinite(nowMs) || typeof splitBosses !== 'function') return [];
    function instant(value) {
      if (!Number.isFinite(dateMs(value))) return NaN;
      if (typeof parseClock !== 'function') return dateMs(value);
      var parsed = parseClock(value);
      return Number.isFinite(+parsed) ? +parsed : NaN;
    }
    var byName = Object.create(null), allowed = Object.create(null);
    dex.forEach(function (row) {
      if (!Array.isArray(row) || !Number.isInteger(row[0]) || typeof row[1] !== 'string') return;
      var key = row[1].trim().toLocaleLowerCase();
      if (Object.prototype.hasOwnProperty.call(byName, key)) byName[key] = null;
      else byName[key] = row;
    });
    function add(raw, fallbackMode, start, end) {
      var from = instant(start), until = instant(end);
      if (!Number.isFinite(from) || !Number.isFinite(until) || from >= until || until <= nowMs) return;
      var names = splitBosses(raw);
      if (!Array.isArray(names)) return;
      names.slice(0, 20).forEach(function (name) {
        if (typeof name !== 'string' || !name.trim()) return;
        var mode = modeOf(name, fallbackMode);
        if (MODES.indexOf(mode) < 0) return;
        var mon = byName[speciesName(name).toLocaleLowerCase()];
        if (!mon) return;
        var id = String(mon[0]);
        if (!allowed[id]) allowed[id] = { dex: mon, modes: [], variants: [] };
        if (allowed[id].modes.indexOf(mode) < 0) allowed[id].modes.push(mode);
        var existing = allowed[id].variants.filter(function (v) { return v.name === name && v.battleMode === mode; })[0];
        var phase = from <= nowMs ? 'live' : 'upcoming';
        if (!existing) allowed[id].variants.push({ name: name, battleMode: mode, phase: phase });
        else if (phase === 'live') existing.phase = 'live';
      });
    }
    (Array.isArray(data.rotation) ? data.rotation : []).forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      add(r.five, 'normal', r.s, r.e);
      add(r.mega, 'mega', r.s, r.e);
      add(r.shadow, 'shadow', r.s, r.e);
      var low = r.low;
      if (!low || typeof low !== 'object') return;
      ['one', 'three', 'shadowOne', 'shadowThree'].forEach(function (tier) {
        (Array.isArray(low[tier]) ? low[tier] : []).forEach(function (name) {
          add(name, tier.indexOf('shadow') === 0 ? 'shadow' : 'normal', r.s, r.e);
        });
      });
    });
    (Array.isArray(data.events) ? data.events : []).forEach(function (ev) {
      if (!ev || !Array.isArray(ev.raidDays)) return;
      ev.raidDays.forEach(function (day) {
        if (!day || !nextDay(day.date)) return;
        var s = day.date + 'T00:00', e = nextDay(day.date) + 'T00:00';
        (Array.isArray(day.five) ? day.five : []).forEach(function (name) { add(name, 'normal', s, e); });
        (Array.isArray(day.max) ? day.max : []).forEach(function (name) { add(name, 'dynamax', s, e); });
      });
    });
    (Array.isArray(data.maxBattles) ? data.maxBattles : []).forEach(function (row) {
      if (!Array.isArray(row) || !nextDay(row[1])) return;
      add(row[2], 'dynamax', row[0] + 'T00:00', nextDay(row[1]) + 'T00:00');
    });
    (Array.isArray(data.maxRosters) ? data.maxRosters : []).forEach(function (r) {
      if (!r || !Array.isArray(r.tiers)) return;
      r.tiers.forEach(function (tier) {
        if (!tier || !Array.isArray(tier.names)) return;
        var s = tier.day ? tier.day + 'T00:00' : r.s;
        var e = tier.day && nextDay(tier.day) ? nextDay(tier.day) + 'T00:00' : r.e;
        /* A daily boss ends no later than its parent event; do not display
           a 5-star Max roster after the event's published closing hour. */
        if (tier.day && Number.isFinite(instant(r.s)) && instant(r.s) > instant(s)) s = r.s;
        if (tier.day && Number.isFinite(instant(r.e)) && instant(r.e) < instant(e)) e = r.e;
        tier.names.forEach(function (name) { add(name, 'dynamax', s, e); });
      });
    });
    return Object.keys(allowed).map(function (id) { return allowed[id]; })
      .sort(function (a, b) { return a.dex[1].localeCompare(b.dex[1]); });
  }
  /* Compare an explicitly named form with source-backed form labels. Exact
     Pokémon + modifier matching prevents White Kyurem being saved as base or
     Black, and prevents Mega X artwork from attaching to Mega Y. */
  function descriptor(name, species) {
    var raw = String(name || '').trim()
      .replace(/^(?:Shadow|Dynamax|Gigantamax|Mega|Primal)\s+/i, '');
    var base = String(species || '');
    var at = base ? raw.toLocaleLowerCase().indexOf(base.toLocaleLowerCase()) : -1;
    if (at >= 0) raw = raw.slice(0, at) + raw.slice(at + base.length);
    return raw.replace(/\bforme?\b/gi, '').replace(/[^a-z0-9]+/gi, '').toLowerCase();
  }
  function formMatches(form, mode) {
    if (!Array.isArray(form)) return false;
    if (mode === 'gigantamax') return form[3] === 'gmax';
    if (mode === 'primal') return form[1] === 'primal';
    if (mode === 'mega') return form[3] === 'mega' && form[1] !== 'primal';
    return form[3] !== 'gmax' && form[3] !== 'mega' && form[3] !== 'primal';
  }
  function targetChoices(data, dex, forms, detailData, nowMs, splitBosses, parseClock) {
    if (!Array.isArray(forms)) forms = [];
    var candidates = options(data, dex, nowMs, splitBosses, parseClock), sourceForms = [];
    var events = detailData && detailData.events;
    if (events && typeof events === 'object' && !Array.isArray(events)) {
      Object.keys(events).slice(0, 500).forEach(function (key) {
        (Array.isArray(events[key] && events[key].pokemon) ? events[key].pokemon : []).slice(0, 600).forEach(function (p) {
          if (p && /^\d{1,4}$/.test(String(p.speciesId || '')) &&
              /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(p.formId || '') &&
              typeof p.name === 'string') sourceForms.push(p);
        });
      });
    }
    var byId = Object.create(null);
    candidates.forEach(function (entry) {
      var mon = entry.dex, species = mon[1];
      (entry.variants || []).forEach(function (v) {
        var modifier = descriptor(v.name, species);
        var mode = v.battleMode;
        var formId = null;
        if (modifier) {
          var found = sourceForms.filter(function (p) {
            return +p.speciesId === +mon[0] && descriptor(p.name, species) === modifier;
          });
          /* A literal match to the scheduled label is more reliable than an
             alternate punctuation alias in a different source record. */
          var exact = found.filter(function (p) { return p.name.toLowerCase() === v.name.toLowerCase(); });
          if (exact.length) found = exact;
          var ids = [];
          found.forEach(function (p) { if (ids.indexOf(p.formId) < 0) ids.push(p.formId); });
          if (ids.length === 1) formId = ids[0];
          if (!formId) {
            var matching = forms.filter(function (f) {
              return +f[0] === +mon[0] && formMatches(f, mode) &&
                (descriptor(f[2], species) === modifier || descriptor(f[1], species) === modifier);
            });
            if (matching.length === 1) formId = matching[0][1];
          }
          if (!formId) return; /* Special form unknown: never silently use base. */
        } else if (['mega','primal','gigantamax'].indexOf(mode) >= 0) {
          var generic = forms.filter(function (f) {
            return +f[0] === +mon[0] && formMatches(f, mode) && !descriptor(f[2], species);
          });
          if (generic.length !== 1) return;
          formId = generic[0][1];
        }
        var target = { type: 'raid-boss', pokemonId: String(mon[0]).padStart(3, '0'),
          formId: formId, battleMode: mode };
        var value = [target.pokemonId, target.formId || '', target.battleMode].join('|');
        var item = { value: value, name: v.name, battleMode: mode,
          phase: v.phase, target: target };
        if (!byId[value] || (v.phase === 'live' && byId[value].phase !== 'live')) byId[value] = item;
      });
    });
    return Object.keys(byId).map(function (key) { return byId[key]; })
      .sort(function (a, b) {
        return (a.phase === b.phase ? 0 : a.phase === 'live' ? -1 : 1) ||
          a.name.localeCompare(b.name) || a.battleMode.localeCompare(b.battleMode);
      });
  }
  /* Persistent guides can outlive the source rotation. Match visible Battle
     rows to approved Pokémon/form/mode identity, not similar-looking names. */
  function matchesTarget(raw, mode, target, dex) {
    if (!target || typeof target.pokemonId !== 'string' || !Array.isArray(dex) ||
        mode !== target.battleMode) return false;
    var mon = dex.filter(function (row) {
      return row && String(row[0]).padStart(3, '0') === target.pokemonId;
    })[0];
    if (!mon || typeof raw !== 'string' ||
        speciesName(raw).toLocaleLowerCase() !== String(mon[1]).toLocaleLowerCase()) return false;
    var modifier = descriptor(raw, mon[1]);
    var form = String(target.formId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (mode === 'mega') form = form === 'mega' ? '' : form.replace(/^mega/, '');
    if (mode === 'primal' && form === 'primal') form = '';
    if (mode === 'gigantamax' && form === 'gmax') form = '';
    return modifier === form;
  }
  return { options: options, speciesName: speciesName, targetChoices: targetChoices,
    descriptor: descriptor, matchesTarget: matchesTarget };

});
