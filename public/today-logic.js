/* Pure logic for the Today and Event Details redesign. No DOM access, so it is unit tested in Node.
   - Done (per occurrence) storage, undo and pruning
   - Shiny boost versus ordinary shiny availability
   - Splitting multi-boss names, and a form-aware artwork classifier
   - Venue time zones and dual (viewer + venue) time text */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GOTODAYLOGIC = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- Done: hides one occurrence of an event from Today, nothing else ---------- */
  var DONE_KEY = 'gofn-today-done-v1';
  function stamp(value) {
    var ms = value instanceof Date ? +value : typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
  }
  /* The key is the event id plus the start of that occurrence, so a recurring event (a weekly Raid Hour) is only hidden once. */
  function doneKey(id, start) {
    var s = stamp(start);
    return id && s ? String(id) + '@' + s : '';
  }
  /* Reads the Done map without ever treating unreadable data as empty-and-writable: `corrupt` is true when the stored value is not a JSON object, so a later write must not silently replace it. */
  function readDoneState(storage) {
    var raw = null;
    try { raw = storage.getItem(DONE_KEY); } catch (e) { return { map: {}, corrupt: false, unreadable: true, raw: null }; }
    if (raw == null || raw === '') return { map: {}, corrupt: false, unreadable: false, raw: null };
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { map: parsed, corrupt: false, unreadable: false, raw: raw };
    } catch (e) { /* fall through */ }
    return { map: {}, corrupt: true, unreadable: false, raw: raw };
  }
  function readDone(storage) { return readDoneState(storage).map; }
  function writeDone(storage, map) {
    try { storage.setItem(DONE_KEY, JSON.stringify(map)); return true; } catch (e) { return false; }
  }
  /* Before replacing an unreadable value, keep a copy under another key. If that copy cannot be made, the write is refused. */
  function keepCorruptCopy(storage, raw) {
    try {
      var name = DONE_KEY + '-corrupt', existing = storage.getItem(name);
      if (existing === raw) return true;
      if (existing != null) name += '-' + Date.now();
      storage.setItem(name, raw); return true;
    } catch (e) { return false; }
  }
  function isDone(map, id, start) { var k = doneKey(id, start); return !!k && !!map[k]; }
  /* Entries older than a week past the occurrence end are dropped so the store never grows without bound. */
  function pruneDone(map, nowMs) {
    var out = {};
    Object.keys(map || {}).forEach(function (k) {
      var e = map[k];
      if (e && typeof e === 'object' && Number.isFinite(e.end) && e.end < nowMs - 7 * 864e5) return;
      out[k] = e;
    });
    return out;
  }
  /* Both return {ok, ...}: ok is true only when the value was really written (or there was nothing to change). */
  function tryMarkDone(storage, id, start, end, nowMs) {
    var key = doneKey(id, start); if (!key) return { ok: false, key: '', error: 'invalid' };
    var state = readDoneState(storage);
    if (state.unreadable) return { ok: false, key: key, error: 'storage' };
    if (state.corrupt && !keepCorruptCopy(storage, state.raw)) return { ok: false, key: key, error: 'storage' };
    var map = pruneDone(state.map, nowMs || Date.now());
    map[key] = { at: nowMs || Date.now(), end: Number.isFinite(+end) ? +end : null };
    return writeDone(storage, map) ? { ok: true, key: key } : { ok: false, key: key, error: 'storage' };
  }
  function tryUndoDone(storage, key) {
    var state = readDoneState(storage);
    if (state.unreadable) return { ok: false, removed: false, error: 'storage' };
    if (!key || !state.map[key]) return { ok: true, removed: false };
    if (state.corrupt) return { ok: false, removed: false, error: 'storage' };
    var map = {}; Object.keys(state.map).forEach(function (k) { if (k !== key) map[k] = state.map[k]; });
    return writeDone(storage, map) ? { ok: true, removed: true } : { ok: false, removed: false, error: 'storage' };
  }
  /* Compatibility wrappers: markDone returns the key only when saved ('' otherwise); undoDone is true only when an entry was removed and saved. */
  function markDone(storage, id, start, end, nowMs) { var r = tryMarkDone(storage, id, start, end, nowMs); return r.ok ? r.key : ''; }
  function undoDone(storage, key) { var r = tryUndoDone(storage, key); return r.ok && r.removed; }
  function doneList(storage) {
    var map = readDone(storage);
    return Object.keys(map).map(function (k) { return { key: k, id: k.slice(0, k.lastIndexOf('@')), start: k.slice(k.lastIndexOf('@') + 1), at: map[k] && map[k].at }; });
  }


  /* Today-only Hide is separate from Done and uses the same exact occurrence key. */
  var HIDE_KEY = 'gofn-today-hidden-v1';
  function readHideState(storage) {
    var raw;
    try { raw = storage.getItem(HIDE_KEY); } catch (e) { return { map: {}, unreadable: true }; }
    if (raw == null || raw === '') return { map: {}, corrupt: false };
    try {
      var map = JSON.parse(raw);
      if (map && typeof map === 'object' && !Array.isArray(map)) return { map: map, corrupt: false };
    } catch (e) { /* keep the original on corruption */ }
    return { map: {}, corrupt: true, raw: raw };
  }
  function readHidden(storage) { return readHideState(storage).map; }
  function isHiddenToday(map, id, start) { var k = doneKey(id, start); return !!k && !!(map && map[k]); }
  function writeHidden(storage, map) {
    try { var raw = JSON.stringify(map); storage.setItem(HIDE_KEY, raw); return storage.getItem(HIDE_KEY) === raw; }
    catch (e) { return false; }
  }
  function tryHideToday(storage, id, start, end, nowMs) {
    var key = doneKey(id, start);
    if (!key) return { ok: false, error: 'invalid' };
    var state = readHideState(storage);
    if (state.unreadable) return { ok: false, error: 'storage' };
    if (state.corrupt) {
      try {
        var backup = HIDE_KEY + '-corrupt';
        if (storage.getItem(backup) !== state.raw) {
          if (storage.getItem(backup) != null) backup += '-' + Date.now();
          storage.setItem(backup, state.raw);
          if (storage.getItem(backup) !== state.raw) return { ok: false, error: 'storage' };
        }
      } catch (e) { return { ok: false, error: 'storage' }; }
    }
    var map = pruneDone(state.map, nowMs || Date.now());
    map[key] = { at: nowMs || Date.now(), end: Number.isFinite(+end) ? +end : null };
    return writeHidden(storage, map) ? { ok: true, key: key } : { ok: false, error: 'storage' };
  }
  function tryRestoreHidden(storage, key) {
    var state = readHideState(storage);
    if (state.unreadable || state.corrupt) return { ok: false, error: 'storage' };
    if (!key || !state.map[key]) return { ok: true, restored: false };
    var map = {}; Object.keys(state.map).forEach(function (k) { if (k !== key) map[k] = state.map[k]; });
    return writeHidden(storage, map) ? { ok: true, restored: true } : { ok: false, error: 'storage' };
  }

  /* ---------- Shiny: a boost needs an explicit confirmation; ordinary availability never implies one ---------- */
  var BOOST_LABEL = /\b(boost(?:ed)?|increased|higher|better)\b[^.]{0,30}\bshiny\b|\bshiny\b[^.]{0,30}\b(boost(?:ed)?|odds? (?:are )?(?:boosted|increased)|chance (?:is )?(?:boosted|increased))/i;
  /* Returns 'boosted' | 'debut' | 'available' | 'none'. Inputs are only fields that state the fact:
     highlight.type === 'boosted-shiny', item.boostedShiny === true, or a label that itself says the odds are boosted. */
  function shinyKind(item) {
    if (!item || typeof item !== 'object') return 'none';
    var label = String(item.label || ''), type = String(item.type || '').toLowerCase();
    if (type === 'boosted-shiny' || item.boostedShiny === true || item.boosted === true || BOOST_LABEL.test(label)) return 'boosted';
    if (type === 'new-shiny' || /\b(shiny debut|new shiny)\b/i.test(label)) return 'debut';
    if (item.shiny === true || item.shiny === 1 || item.shiny === 'yes' || item.canBeShiny === true) return 'available';
    return 'none';
  }

  /* ---------- Multi-boss strings: "A and B", "A, B and C" ---------- */
  var XY_PAIR = /^(Mega|Primal)\s+(.+?)\s+X\s+and\s+Y$/i;
  function splitNames(value) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return [];
    var xy = XY_PAIR.exec(text);
    if (xy) return [xy[1] + ' ' + xy[2] + ' X', xy[1] + ' ' + xy[2] + ' Y'];
    /* Split on top-level commas and "and"/"&", never inside parentheses. */
    var parts = [], depth = 0, cur = '';
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '(') depth++; else if (c === ')') depth = Math.max(0, depth - 1);
      if (depth === 0 && (c === ',' || c === '&')) { parts.push(cur); cur = ''; continue; }
      cur += c;
    }
    parts.push(cur);
    var out = [];
    parts.forEach(function (p) {
      var depthSplit = [], d = 0, buf = '', words = p.split(' ');
      words.forEach(function (w) {
        if (d === 0 && /^and$/i.test(w) && buf) { depthSplit.push(buf.trim()); buf = ''; return; }
        for (var j = 0; j < w.length; j++) { if (w[j] === '(') d++; else if (w[j] === ')') d = Math.max(0, d - 1); }
        buf += (buf ? ' ' : '') + w;
      });
      if (buf) depthSplit.push(buf.trim());
      depthSplit.forEach(function (s) { s = s.replace(/^and\s+/i, '').trim(); if (s) out.push(s); });
    });
    return out.filter(function (s, i, a) { return a.indexOf(s) === i; });
  }

  /* ---------- Form-aware artwork ---------- */
  /* kind: base | mega | primal | gigantamax | dynamax | shadow | regional | costume | form.
     exact: the picture must be this form's own; ordinary species artwork is never an acceptable substitute.
     The asset itself comes from /api/art (which never falls back to the species for an exact form); this tells the page
     what to do when that asset is missing: show the base sprite only with a visible "Form art unavailable" label. */
  var REGIONAL = { alolan: 'Alolan', galarian: 'Galarian', hisuian: 'Hisuian', paldean: 'Paldean' };
  function classifyArt(input) {
    var o = typeof input === 'string' ? { name: input } : (input || {});
    var raw = String(o.name || o.n || '').replace(/\s+/g, ' ').trim();
    var paren = (/\(([^)]+)\)\s*$/.exec(raw) || [])[1] || '';
    var core = raw.replace(/\s*\([^)]*\)\s*$/, '').trim(), m;
    var res = { name: raw, base: core, kind: 'base', exact: false, form: paren || '', label: '' };
    /* The art Worker treats every explicit Unown glyph as exact, including
       bare "Unown D" and "Unown !" names without a parenthesised form.
       Keep the UI fallback contract aligned so unavailable exact artwork
       displays a labelled base sprite instead of silently disappearing. */
    var unown = /^Unown\s*(?:\(\s*([A-Z!?]|exclamation(?:\s+mark)?|question(?:\s+mark)?)(?:\s+form)?\s*\)|([A-Z!?])(?:\s*\(\s*([A-Z!?]|exclamation|question)\s*\))?|\s*(exclamation(?:\s+mark)?|question(?:\s+mark)?))$/i.exec(raw);
    if (unown) {
      var glyph = function (s) { s = s.toLowerCase().replace(/\s+mark$/, ''); return s === '!' ? 'exclamation' : s === '?' ? 'question' : s; };
      var form = glyph(unown[1] || unown[2] || unown[4]);
      var mismatch = !!unown[3] && glyph(unown[3]) !== form;
      res.kind = 'form'; res.base = 'Unown'; res.exact = true;
      res.form = mismatch ? '' : (form === 'exclamation' ? '!' : form === 'question' ? '?' : form.toUpperCase());
      res.label = mismatch ? 'Unown form' : 'Unown ' + res.form;
    }
    /* Source feeds may lead with the form. Keep exact artwork and the
       unavailable-art badge aligned with the Worker for both spellings. */
    else if ((m = /^(Roaming|Chest)\s+Form\s+Gimmighoul$/i.exec(core))) {
      res.kind = 'form'; res.base = 'Gimmighoul'; res.exact = true;
      res.label = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' Form'; res.form = res.label;
    }
    else if ((m = /^Gigantamax\s+(.+)$/i.exec(core))) { res.kind = 'gigantamax'; res.base = m[1]; res.exact = true; res.label = 'Gigantamax'; }
    else if ((m = /^Crowned\s+(Sword|Shield)\s+(Zacian|Zamazenta)$/i.exec(core)) && ((m[1].toLowerCase()==='sword'&&m[2].toLowerCase()==='zacian')||(m[1].toLowerCase()==='shield'&&m[2].toLowerCase()==='zamazenta'))) { res.kind = 'form'; res.base = m[2]; res.exact = true; res.label = 'Crowned ' + (m[1].toLowerCase()==='sword'?'Sword':'Shield'); }
    else if ((m = /^(White|Black) Kyurem$/i.exec(core))) { res.kind = 'form'; res.base = 'Kyurem'; res.exact = true; res.label = m[1] + ' Kyurem'; }
    else if ((m = /^Dynamax\s+(.+)$/i.exec(core))) { res.kind = 'dynamax'; res.base = m[1]; res.exact = false; res.label = 'Dynamax'; }
    else if ((m = /^Shadow\s+(.+)$/i.exec(core))) { res.kind = 'shadow'; res.base = m[1]; res.exact = false; res.label = 'Shadow'; }
    else if ((m = /^Mega\s+(.+?)(?:\s+([XY]))?$/i.exec(core))) { res.kind = 'mega'; res.base = m[1]; res.exact = true; res.label = 'Mega' + (m[2] ? ' ' + m[2].toUpperCase() : ''); }
    else if ((m = /^Primal\s+(.+)$/i.exec(core))) { res.kind = 'primal'; res.base = m[1]; res.exact = true; res.label = 'Primal'; }
    else if ((m = /^(Alolan|Galarian|Hisuian|Paldean)\s+(.+)$/i.exec(core))) { res.kind = 'regional'; res.base = m[2]; res.exact = true; res.label = REGIONAL[m[1].toLowerCase()]; }
    /* Forme-first names match the Worker's exact PokeAPI variety resolver.
       A missing exact image must show a form-unavailable label, never silently
       present the ordinary species sprite as the named Forme. */
    else if ((m = /^(Normal|Attack|Defense|Speed|Origin|Altered|Incarnate|Therian|Land|Sky)\s+Forme\s+(.+)$/i.exec(core))) {
      res.kind = 'form'; res.base = m[2].trim(); res.exact = true;
      res.label = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' Forme';
      res.form = res.label;
    }
    if (o.dynamax && res.kind === 'base') res.kind = 'dynamax';
    if (o.shadow && res.kind === 'base') res.kind = 'shadow';
    if (o.costume || o.costumeId) { res.kind = res.kind === 'base' ? 'costume' : res.kind; res.exact = true; res.label = res.label || o.label || paren || 'Costume'; }
    else if (paren && res.kind === 'base') { res.kind = 'form'; res.exact = true; res.label = paren; }
    return res;
  }
  /* What the page shows for an exact form whose own asset is missing. */
  function artFallback(classified) {
    return classified && classified.exact ? { show: 'base-with-label', chip: classified.kind === 'costume' ? 'Costume art unavailable' : 'Form art unavailable' } : { show: 'asset', chip: '' };
  }

  /* ---------- Venue time zones ---------- */
  /* Explicit, single-zone venues only. A place that spans zones (Europe, Indonesia in general) is deliberately absent. */
  var VENUE_ZONES = [
    ['sendai', 'Asia/Tokyo'], ['tohoku', 'Asia/Tokyo'], ['tokyo', 'Asia/Tokyo'], ['japan', 'Asia/Tokyo'],
    ['mexico city', 'America/Mexico_City'], ['boston', 'America/New_York'], ['chicago', 'America/Chicago'], ['los angeles', 'America/Los_Angeles'],
    ['taipei', 'Asia/Taipei'], ['kaohsiung', 'Asia/Taipei'], ['taiwan', 'Asia/Taipei'], ['south korea', 'Asia/Seoul'], ['seoul', 'Asia/Seoul'],
    ['singapore', 'Asia/Singapore'], ['kuala lumpur', 'Asia/Kuala_Lumpur'], ['jakarta', 'Asia/Jakarta'], ['bangkok', 'Asia/Bangkok'],
    ['hong kong', 'Asia/Hong_Kong'], ['india', 'Asia/Kolkata'],
    ['philippines', 'Asia/Manila'], ['malaysia', 'Asia/Kuala_Lumpur'], ['england', 'Europe/London'], [', uk', 'Europe/London'],
    ['germany', 'Europe/Berlin'], ['france', 'Europe/Paris'], ['spain', 'Europe/Madrid'], ['netherlands', 'Europe/Amsterdam'], ['belgium', 'Europe/Brussels'], ['sweden', 'Europe/Stockholm']
  ];
  function validZone(zone) { try { new Intl.DateTimeFormat('en', { timeZone: zone }); return typeof zone === 'string' && !!zone; } catch (e) { return false; } }
  /* An explicit tz on the record always wins; the place table is only a fallback for records that have none. */
  function venueZone(item) {
    if (!item) return '';
    var explicit = item.tz || item.timeZone || item.timezone;
    if (explicit && validZone(explicit)) return explicit;
    var place = String(item.place || item.where || '').toLowerCase();
    if (!place || /play from anywhere|worldwide|global/.test(place)) return '';
    for (var i = 0; i < VENUE_ZONES.length; i++) if (place.indexOf(VENUE_ZONES[i][0]) >= 0) return VENUE_ZONES[i][1];
    return '';
  }
  var ABBR = { 'Asia/Tokyo': 'JST', 'America/Mexico_City': 'CST', 'Asia/Seoul': 'KST', 'Asia/Taipei': 'CST (Taiwan)', 'Asia/Kolkata': 'IST', 'Asia/Singapore': 'SGT', 'Asia/Hong_Kong': 'HKT', 'Asia/Kuala_Lumpur': 'MYT', 'Asia/Jakarta': 'WIB', 'Asia/Bangkok': 'ICT' };
  function zoneAbbr(zone, ms) {
    if (ABBR[zone]) return ABBR[zone];
    try {
      var parts = new Intl.DateTimeFormat('en-AU', { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date(ms));
      var tz = parts.filter(function (p) { return p.type === 'timeZoneName'; })[0];
      return tz ? tz.value : zone;
    } catch (e) { return zone; }
  }
  function fmt(ms, zone, opts) { return new Intl.DateTimeFormat('en-AU', Object.assign({ timeZone: zone }, opts)).format(new Date(ms)); }
  function dayText(ms, zone) { return fmt(ms, zone, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', ''); }
  function clockText(ms, zone) { return fmt(ms, zone, { hour: 'numeric', minute: '2-digit' }).replace(/\s?([ap])m/i, function (_, a) { return ' ' + a.toLowerCase() + 'm'; }); }
  /* Both zones for an instant range. Returns { viewer, venue, sameZone, venueZone } text lines, DST-safe because every
     conversion goes through Intl with IANA zones. venue is '' when there is no distinct venue zone. */
  function dualTime(range, venueTz, viewerTz) {
    viewerTz = viewerTz || 'Australia/Melbourne';
    function line(zone) {
      var s = range.start, e = range.end, la = zoneAbbr(zone, s), lb = zoneAbbr(zone, e);
      var sd = dayText(s, zone), ed = dayText(e, zone);
      /* If a DST change falls inside the range the two ends carry different labels. */
      var startClock = clockText(s, zone) + (la !== lb ? ' ' + la : ''), endClock = clockText(e, zone);
      var text = sd === ed ? sd + ', ' + startClock + ' – ' + endClock : sd + ', ' + startClock + ' – ' + ed + ', ' + endClock;
      return text + ' ' + lb;
    }
    var same = !venueTz || venueTz === viewerTz;
    return { viewer: line(viewerTz), venue: same ? '' : line(venueTz), sameZone: same, venueZone: same ? '' : venueTz, viewerZone: viewerTz };
  }
  /* Date-only in-person events: the days are the venue's own calendar days. Optional daily hours (from a verified source)
     are converted to the viewer's zone for each day's start so a DST change inside the range is honoured. */
  function venueDays(startDay, endDay, venueTz, viewerTz, hours) {
    viewerTz = viewerTz || 'Australia/Melbourne';
    var s = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDay), e = /^(\d{4})-(\d{2})-(\d{2})/.exec(endDay || startDay);
    if (!s || !e) return null;
    function civil(m) { return Date.UTC(+m[1], +m[2] - 1, +m[3]); }
    var from = civil(s), to = civil(e);
    var label = function (ms) { return new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ms)).replace(',', ''); };
    var days = label(from) + (to > from ? ' – ' + label(to) : '');
    var out = { days: days, venueZone: venueTz || '', venueLabel: '', viewerLine: '' };
    if (venueTz) out.venueLabel = zoneAbbr(venueTz, from + 12 * 36e5);
    if (venueTz && hours && /^\d{1,2}:\d{2}$/.test(hours.from) && /^\d{1,2}:\d{2}$/.test(hours.to)) {
      var hh = hours.from.split(':').map(Number), th = hours.to.split(':').map(Number);
      var a = wallToInstant(s, hh, venueTz), b = wallToInstant(s, th, venueTz);
      out.venueHours = clockText(a, venueTz) + ' – ' + clockText(b, venueTz) + ' ' + out.venueLabel;
      if (venueTz !== viewerTz) out.viewerLine = dayText(a, viewerTz) + ', ' + clockText(a, viewerTz) + ' – ' + clockText(b, viewerTz) + ' ' + zoneAbbr(viewerTz, a) + (to > from ? ' (first day; later days shift with each zone’s clock)' : '');
    }
    return out;
  }
  /* Wall-clock time in a zone to a UTC instant (single pass correction, fine away from the zone's DST gap). */
  function wallToInstant(dateMatch, hm, zone) {
    var guess = Date.UTC(+dateMatch[1], +dateMatch[2] - 1, +dateMatch[3], hm[0], hm[1]);
    function offset(ms) {
      var p = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).reduce(function (a, x) { a[x.type] = x.value; return a; }, {});
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
    }
    var t = guess - offset(guess);
    return guess - offset(t);
  }

  /* ---------- Venue bonus times: attach only to the event they are about ---------- */
  function normName(v) { return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function dayOnly(v) { var m = /^(\d{4}-\d{2}-\d{2})/.exec(typeof v === 'string' ? v : new Date(v).toISOString()); return m ? m[1] : ''; }
  function shiftDay(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  /* items: /api/venue-times rows. An item belongs to an event only when the full normalised names are equal AND its date lies within the
     event's own days (one day of slack for zone offsets). A shared three-word prefix ("Pokemon Night Out") is never enough: London and Los Angeles differ. */
  function matchVenueTimes(items, ev) {
    var name = normName(ev && ev.name), s = dayOnly(ev && ev.start), e = dayOnly(ev && ev.end) || s;
    if (!name || !s) return [];
    return (items || []).filter(function (i) { return i && normName(i.name) === name && i.date >= shiftDay(s, -1) && i.date <= shiftDay(e, 1); });
  }
  /* "expected" notes mean the hours are not confirmed: they may be shown, but only as unconfirmed. */
  function venueTimeUnconfirmed(item) { return !!item && /expected|not confirmed|unconfirmed|tbc|tba/i.test(String(item.note || '')); }

  /* ---------- Research reward wording ---------- */
  /* Field Research rewards are alternatives (one is received from the pool); timed and special research steps give every listed reward. */
  function researchRewardLabel(category, count) {
    var n = +count || 0;
    if (category === 'field') return n > 1 ? 'One of ' + n + ' possible rewards' : n === 1 ? '1 possible reward' : 'No rewards listed';
    return n + ' reward' + (n === 1 ? '' : 's');
  }

  /* ---------- Countdown ---------- */
  function countdownText(ms, nowMs, live) {
    var d = ms - nowMs; if (d <= 0) return live ? 'Ended' : 'Started';
    var m = Math.ceil(d / 6e4), h = Math.floor(m / 60), days = Math.floor(h / 24); /* rounds up like every other countdown, so Today and Schedule agree to the minute */
    var body = days >= 2 ? days + 'd ' + (h % 24) + 'h' : days === 1 ? '1d ' + (h % 24) + 'h' : h >= 1 ? h + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') : Math.max(1, m) + 'm';
    return live ? 'Ends in ' + body : 'Starts in ' + body;
  }

  /* ---------- Card type: major (artwork card) / raid (medium) / minor (compact row) ---------- */
  function cardType(ev) {
    var kind = ev && ev.kind || '', name = String(ev && ev.name || ''), span = +ev.span || 0, feat = +ev.featuredCount || 0;
    if (kind === 'raid' || kind === 'max') return span >= 3 * 864e5 && /\b(day|weekend|trails|fest|tour)\b/i.test(name) ? 'major' : 'raid';
    /* The importer normalizes worldwide GO Fest/Tour/Wild Area formats to 'global'.
       They are flagships, not minor bonus rows. */
    if (kind === 'cd' || kind === 'person' || kind === 'global') return 'major';
    if (kind === 'spot' || kind === 'pvp' || kind === 'twitch') return 'minor';
    /* Several featured encounters warrant a major card; elapsed duration alone
       must not turn a one-Pokémon activity into a giant generic illustration. */
    if (kind === 'event' || kind === 'debut') return feat >= 2 ? 'major' : 'minor';
    return 'minor';
  }

  return {
    DONE_KEY: DONE_KEY, doneKey: doneKey, readDone: readDone, readDoneState: readDoneState, tryMarkDone: tryMarkDone, tryUndoDone: tryUndoDone, isDone: isDone, markDone: markDone, undoDone: undoDone, pruneDone: pruneDone, doneList: doneList,
    HIDE_KEY: HIDE_KEY, readHideState: readHideState, readHidden: readHidden, isHiddenToday: isHiddenToday, tryHideToday: tryHideToday, tryRestoreHidden: tryRestoreHidden,
    shinyKind: shinyKind, splitNames: splitNames, classifyArt: classifyArt, artFallback: artFallback,
    researchRewardLabel: researchRewardLabel, venueZone: venueZone, matchVenueTimes: matchVenueTimes, venueTimeUnconfirmed: venueTimeUnconfirmed, dualTime: dualTime, venueDays: venueDays, zoneAbbr: zoneAbbr, countdownText: countdownText, cardType: cardType
  };
}));
