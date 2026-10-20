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
  function placeTokens(place) {
    var out = {};
    fold(place).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').forEach(function (w) { w = stem(w); if (w.length > 2 && !GENERIC_PLACE[w]) out[w] = 1; });
    return out;
  }
  function day(x) { if (typeof x === 'number') return Math.floor(x / 864e5); var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(x || '')); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : NaN; }
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
  return { same: same, judge: judge, groups: groups, tokens: tokens, placeTokens: placeTokens };
});
