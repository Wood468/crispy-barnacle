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
    return +new Date(value.length === 10 ? value + 'T00:00' : value);
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
  function options(data, dex, nowMs, splitBosses) {
    if (!data || !Array.isArray(dex) || !Number.isFinite(nowMs) || typeof splitBosses !== 'function') return [];
    var byName = Object.create(null), allowed = Object.create(null);
    dex.forEach(function (row) {
      if (!Array.isArray(row) || !Number.isInteger(row[0]) || typeof row[1] !== 'string') return;
      var key = row[1].trim().toLocaleLowerCase();
      if (Object.prototype.hasOwnProperty.call(byName, key)) byName[key] = null;
      else byName[key] = row;
    });
    function add(raw, fallbackMode, start, end) {
      var from = dateMs(start), until = dateMs(end);
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
        if (!allowed[id]) allowed[id] = { dex: mon, modes: [] };
        if (allowed[id].modes.indexOf(mode) < 0) allowed[id].modes.push(mode);
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
        if (tier.day && Number.isFinite(dateMs(r.s)) && dateMs(r.s) > dateMs(s)) s = r.s;
        if (tier.day && Number.isFinite(dateMs(r.e)) && dateMs(r.e) < dateMs(e)) e = r.e;
        tier.names.forEach(function (name) { add(name, 'dynamax', s, e); });
      });
    });
    return Object.keys(allowed).map(function (id) { return allowed[id]; })
      .sort(function (a, b) { return a.dex[1].localeCompare(b.dex[1]); });
  }
  return { options: options, speciesName: speciesName };
});
