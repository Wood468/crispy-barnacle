/* One rule for "is this the same event?", shared by the importer (Node), the daily audit (Node) and the app (browser).
   Events look like { name, place, scope, start, end } with start/end as 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' strings, or ms numbers.
   same(a, b) returns { verdict: 'same' | 'maybe' | 'different', why } so each caller can be strict (act only on 'same')
   or helpful (list the 'maybe' ones for a person or the daily check to decide). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GODEDUPE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var STOP = {}; ('the a an and of to in on at for is are will be with during from that this you your can all more new news event events update updated ' +
    'pokemon go celebrate enjoy get join explore discover returns return debut debuts announcement announced part one two as into by it its x vs 2025 2026 2027').split(' ').forEach(function (w) { STOP[w] = 1; });
  /* Short names and the long names they stand for. Both sides expand, so "ESA" and "European Space Agency" share tokens. */
  var ALIAS = { esa: ['european', 'space', 'agency'], gofest: ['go', 'fest'], cd: ['community', 'day'], mad: ['max', 'battle', 'day'] };
  var GENERIC_PLACE = { usa: 1, uk: 1, japan: 1, taiwan: 1, korea: 1, south: 1, north: 1, spain: 1, europe: 1, asia: 1, america: 1, americas: 1, oceania: 1, worldwide: 1, global: 1, city: 1, and: 1, the: 1, of: 1 };
  function fold(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function stem(w) { return w.length > 4 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w; }
  function tokens(name) {
    var out = {}, parts = fold(name).replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
    parts.forEach(function (w) {
      if (!w) return;
      (ALIAS[w] || [w]).forEach(function (x) { x = stem(x); if (x.length > 1 && !STOP[x] && !/^\d+$/.test(x)) out[x] = 1; });
    });
    return out;
  }
  /* A strict, order-free title key for the live feed: "Halloween 2026, Part One" and "Pokémon GO Halloween 2026 Part I" both give
     "2026 1 halloween part"; "Giratina (Origin Forme) Raid Hour" and "Origin Forme Giratina Raid Hour" give the same key.
     Only the exact same set of words matches, so "Pikachu Spotlight Hour" and "Eevee Spotlight Hour" stay apart. */
  var NUM = { i: 1, one: 1, ii: 2, two: 2, iii: 3, three: 3, iv: 4, four: 4, v: 5, five: 5 };
  function titleKey(name) {
    var words = fold(name).replace(/pokemon go/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(function (w) { return w && w !== 'the'; });
    return words.map(function (w) { return NUM[w] ? String(NUM[w]) : w; }).sort().join(' ');
  }
  function placeTokens(place) {
    var out = {};
    fold(place).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').forEach(function (w) { w = stem(w); if (w.length > 2 && !GENERIC_PLACE[w]) out[w] = 1; });
    return out;
  }
  function day(x) {
    // Date objects and timestamps are instants; compare the calendar day the viewer actually sees.
    // Date-only strings stay timezone-independent and are read directly from their YYYY-MM-DD text.
    if (typeof x === 'string') { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(x); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : NaN; }
    if (typeof x === 'number') x = new Date(x);
    return x instanceof Date && !isNaN(x.getTime()) ? Math.floor(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 864e5) : NaN;
  }
  function size(o) { return Object.keys(o).length; }
  function shared(a, b) { var n = 0; for (var k in a) if (b[k]) n++; return n; }
  function dates(a, b) {
    var as = day(a.start), ae = day(a.end != null && a.end !== '' ? a.end : a.start), bs = day(b.start), be = day(b.end != null && b.end !== '' ? b.end : b.start);
    if (isNaN(as) || isNaN(bs)) return 'unknown';
    if (isNaN(ae)) ae = as; if (isNaN(be)) be = bs;
    var lo = Math.max(as, bs), hi = Math.min(ae, be), overlap = hi - lo + 1;
    if (overlap <= 0) return 'apart';
    var shortest = Math.max(1, Math.min(ae - as, be - bs) + 1);
    var closeStart = Math.abs(as - bs) <= 2;
    if (closeStart && overlap / shortest >= 0.6) return 'match';
    return overlap / shortest >= 0.6 ? 'overlap' : 'apart';
  }
  /* Places differ when both name one and share no distinctive word, and neither title mentions the other's place. */
  function placeConflict(a, b, ta, tb) {
    var pa = placeTokens(a.place), pb = placeTokens(b.place);
    if (!size(pa) || !size(pb)) return false;
    if (shared(pa, pb)) return false;
    for (var k in pa) if (tb[k]) return false;
    for (var j in pb) if (ta[j]) return false;
    return true;
  }
  /* A title that names a known place ("Sendai") the other event does not mention anywhere is a different event, even when the
     rest of the title matches ("GO Wild Area: Sendai" vs "GO Wild Area 2026 Mexico City"). The known places are every place in the lists being compared. */
  function titleNamesOtherPlace(ta, other, tOther, gaz) {
    var named = Object.keys(ta).filter(function (k) { return gaz[k]; });
    if (!named.length) return false;
    var po = placeTokens(other.place);
    return !named.some(function (k) { return tOther[k] || po[k]; });
  }
  /* One place is the other's country or region ("Malaysia" / "Kuala Lumpur, Malaysia"): the same stop written at two levels. */
  function nested(a, b) {
    var pa = placeTokens(a.place), pb = placeTokens(b.place), na = size(pa), nb = size(pb);
    if (!na || !nb || na === nb) return false;
    var small = na < nb ? pa : pb, big = na < nb ? pb : pa;
    for (var k in small) if (!big[k]) return false;
    return true;
  }
  function same(a, b, gaz) {
    gaz = gaz || {};
    var ta = tokens(a.name), tb = tokens(b.name), na = size(ta), nb = size(tb);
    if (!na || !nb) return { verdict: 'different', why: 'no usable words in a title' };
    var d = dates(a, b);
    if (d === 'apart') return { verdict: 'different', why: 'dates do not overlap' };
    if (placeConflict(a, b, ta, tb)) return { verdict: 'different', why: 'different places' };
    var sh = shared(ta, tb), min = Math.min(na, nb), ratio = sh / min;
    if (!nested(a, b) && (titleNamesOtherPlace(ta, b, tb, gaz) || titleNamesOtherPlace(tb, a, ta, gaz))) return { verdict: 'different', why: 'titles name different places' };
    if (d === 'match' && sh >= 1 && nested(a, b)) return { verdict: 'same', why: 'same dates, same series, one place inside the other' };
    if (d === 'match' && sh >= 2 && ratio >= 0.6) return { verdict: 'same', why: 'same dates, ' + sh + ' shared words (' + Math.round(ratio * 100) + '%)' };
    if (d === 'match' && sh >= 1 && min <= 3 && ratio >= 0.6) return { verdict: 'same', why: 'same dates, short matching titles' };
    if (d === 'overlap' && sh >= 2 && ratio >= 0.75) return { verdict: 'same', why: 'overlapping dates, ' + sh + ' shared words' };
    if ((d === 'match' || d === 'overlap') && sh >= 1 && ratio >= 0.34) return { verdict: 'maybe', why: 'dates fit and ' + sh + ' shared word' + (sh > 1 ? 's' : '') };
    if (d === 'unknown' && sh >= 2 && ratio >= 0.75) return { verdict: 'maybe', why: 'no dates on one side, titles alike' };
    return { verdict: 'different', why: 'titles share too little' };
  }
  /* Every event list is checked against the people's own rulings: ids or titles the owner said are the same / different. */
  function key(e) { return fold(e.id || e.name).replace(/[^a-z0-9]+/g, '-'); }
  function ruled(rules, a, b) {
    var ka = key(a), kb = key(b), na = key({ name: a.name }), nb = key({ name: b.name });
    function has(list) { return (list || []).some(function (p) { var x = (p || []).map(function (s) { return fold(s).replace(/[^a-z0-9]+/g, '-'); }); return (x.indexOf(ka) >= 0 || x.indexOf(na) >= 0) && (x.indexOf(kb) >= 0 || x.indexOf(nb) >= 0) && x[0] !== x[1]; }); }
    if (has(rules && rules.different)) return 'different';
    if (has(rules && rules.same)) return 'same';
    return null;
  }
  function judge(a, b, rules, gaz) { var r = ruled(rules, a, b); return r ? { verdict: r, why: 'ruled by you' } : same(a, b, gaz); }
  /* Group a list into events that are the same: returns [{ keep, dupes: [{ event, why }] }] for the groups with more than one entry. */
  function groups(list, rules, rank) {
    var used = {}, out = [], gaz = {};
    list.forEach(function (e) { for (var k in placeTokens(e.place)) gaz[k] = 1; });
    for (var i = 0; i < list.length; i++) {
      if (used[i]) continue;
      var g = { keep: list[i], dupes: [], maybe: [] };
      for (var j = i + 1; j < list.length; j++) {
        if (used[j]) continue;
        var r = judge(list[i], list[j], rules, gaz);
        if (r.verdict === 'same') { g.dupes.push({ event: list[j], why: r.why }); used[j] = 1; }
        else if (r.verdict === 'maybe') g.maybe.push({ event: list[j], why: r.why });
      }
      if (g.dupes.length && rank) { var all = [g.keep].concat(g.dupes.map(function (d) { return d.event; })).sort(function (x, y) { return rank(y) - rank(x); }); g.keep = all[0]; g.dupes = all.slice(1).map(function (e) { return { event: e, why: 'same event' }; }); }
      if (g.dupes.length || g.maybe.length) out.push(g);
    }
    return out;
  }
  /* Which entries of event-info.json belong to this card? The file is keyed by whatever id the picture was attached under ("trek",
     "cur:wag", "leekduck:halloween-2026-part-1"), but a card can carry another id: our own "cur:" copy and the live "leekduck:" copy of one
     event are merged into a single card (the card keeps one id; aliasIds lists the others). So match on every id the card has (with or
     without a "cur:" / "leekduck:" prefix), on the article address in the card's link, and, when none of those has a picture, on the
     same title (word order, "Part One" / "Part I", punctuation and case ignored). All matching pictures are pooled. */
  function bareId(id) { return String(id || '').replace(/^[a-z]+:/, '').toLowerCase(); }
  function slugOf(u) { var p = String(u || '').split(/[?#]/)[0].split('/').filter(Boolean); return (p.pop() || '').toLowerCase(); }
  /* The title fallback must not hand one instance of a recurring event the pictures of another ("Super Mega Raid Day" in October vs
     November, a repeat "Zorua Community Day"). event-info.json entries carry no dates, so two signals are used, and a title match is
     only accepted when neither says "different instance":
       1. another event in the list (`others`) owns that entry by its id and its dates do not overlap this card's dates;
       2. the entry's own id / article address / picture sources name a month and year ("october-2026", "2026-10-14") that is
          more than a month away from the card's start. */
  var MONTH_WORDS = { january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sept: 8, sep: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11 };
  /* Month and year an entry's id / address / picture sources name. Split on anything that is not a letter or digit and match whole
     tokens only, so "marvel-2026" is not March and "decorations-2026" is not December. */
  function hintOf(k, entry) {
    var text = [k, entry && entry.source && entry.source.url].concat(((entry && entry.infographics) || []).map(function (g) { return g && g.sourceUrl; })).join(' ').toLowerCase();
    var t = text.split(/[^a-z0-9]+/);
    for (var i = 0; i + 1 < t.length; i++) {
      if (Object.prototype.hasOwnProperty.call(MONTH_WORDS, t[i]) && /^20\d\d$/.test(t[i + 1])) return +t[i + 1] * 12 + MONTH_WORDS[t[i]];
    }
    var m = /(?:^|\D)(20\d\d)-(\d\d)-\d\d(?!\d)/.exec(text);
    return m && +m[2] >= 1 && +m[2] <= 12 ? +m[1] * 12 + (+m[2] - 1) : null;
  }
  /* Month of a card's start. Cards carry local-time Dates (built from "YYYY-MM-DD" strings in the browser's zone), so a Date or a
     timestamp is read in local time, the same month the card shows; a date string is read straight from its text. Reading a Date in UTC
     would turn a 1 December 00:00 start in Melbourne into November. */
  function monthOf(x) {
    if (typeof x === 'string') { var m = /^(\d{4})-(\d{2})-\d{2}/.exec(x); return m && +m[2] >= 1 && +m[2] <= 12 ? +m[1] * 12 + (+m[2] - 1) : null; }
    if (typeof x === 'number') x = new Date(x);
    return x instanceof Date && !isNaN(x.getTime()) ? x.getFullYear() * 12 + x.getMonth() : null;
  }
  function otherInstance(ev, k, entry, others) {
    var h = hintOf(k, entry), m = monthOf(ev.start);
    if (h != null && m != null && Math.abs(h - m) > 1) return true;
    var bk = bareId(k);
    return (others || []).some(function (o) {
      if (!o || !o.id || o.id === ev.id || (ev.aliasIds || []).indexOf(o.id) > -1) return false;
      var theirs = [o.id].concat(o.aliasIds || []).some(function (i) { return bareId(i) === bk; });
      return theirs && dates(ev, o) === 'apart';
    });
  }
  function findEventInfo(ev, all, others) {
    all = all || {}; ev = ev || {};
    var bares = {}; [ev.id].concat(ev.aliasIds || []).forEach(function (i) { if (i) bares[bareId(i)] = 1; });
    var slug = slugOf(ev.link); if (slug.indexOf('-') > 0) bares[slug] = 1;
    var keys = Object.keys(all).filter(function (k) { return bares[bareId(k)] && all[k]; });
    var withPics = function (list) { return list.filter(function (k) { return (all[k].infographics || []).length; }); };
    if (!withPics(keys).length && ev.name) {
      var tk = titleKey(ev.name);
      Object.keys(all).forEach(function (k) {
        if (keys.indexOf(k) < 0 && all[k] && (all[k].names || []).some(function (n) { return titleKey(n) === tk; }) && !otherInstance(ev, k, all[k], others)) keys.push(k);
      });
    }
    if (!keys.length) return null;
    if (keys.length === 1) return all[keys[0]];
    var seen = {}, pics = [];
    keys.forEach(function (k) { (all[k].infographics || []).forEach(function (g) { if (g && !seen[g.url]) { seen[g.url] = 1; pics.push(g); } }); });
    return Object.assign({}, all[keys[0]], { infographics: pics });
  }
  return { same: same, judge: judge, groups: groups, tokens: tokens, titleKey: titleKey, placeTokens: placeTokens, findEventInfo: findEventInfo };
});
