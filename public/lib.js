/* GO Field Notes shared helpers. Plain JS so the same file runs in the browser (window.GOLIB) and in node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GOLIB = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Escape untrusted values for HTML text and quoted attribute values. Validate URLs separately.
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var FORM_WORDS = { alolan: 'alola', galarian: 'galar', hisuian: 'hisui', paldean: 'paldea', primal: 'primal', gigantamax: 'gmax', mega: 'mega' };

  // "Mega Charizard X" -> {base:"Charizard", key:"mega-x"}; "Alolan Vulpix" -> {base:"Vulpix", key:"alola"}.
  // Shadow and Dynamax are not forms in the catalogue: they come back as `special` with key null.
  function parseForm(name) {
    var n = String(name || '').trim().replace(/\s*\(.*\)\s*$/, ''), key = null, special = null;
    var m = /^(Mega|Primal|Gigantamax|Alolan|Galarian|Hisuian|Paldean|Shadow|Dynamax|Purified)\s+(.*)$/i.exec(n);
    if (m) {
      var w = m[1].toLowerCase(); n = m[2];
      if (w === 'shadow' || w === 'dynamax' || w === 'purified') special = w; else key = FORM_WORDS[w];
      if (key === 'mega') { var xy = /\s+([XY])$/i.exec(n); if (xy) { key = 'mega-' + xy[1].toLowerCase(); n = n.slice(0, xy.index); } }
    }
    return { base: n.trim(), key: key, special: special };
  }
  function formId(dex, key) { return dex + ':' + key; }

  // Synced entries look like { "form:25:alola": {v:1, t:1700000000000} }. v === null is a deletion (kept so it can sync).
  // Newest timestamp wins per entry, so two devices editing different things never overwrite each other.
  function merge(a, b) {
    var out = {}, k;
    for (k in a) out[k] = a[k];
    for (k in b) { if (!out[k] || (b[k].t || 0) >= (out[k].t || 0)) out[k] = b[k]; }
    return out;
  }

  // Reconcile local user-state after a sync response. Acknowledged writes clear their dirty
  // flag; newer server values win; concurrent local edits and equal-timestamp conflicts are
  // preserved and queued for another write.
  function reconcileSync(local, server, dirty, sent, now) {
    var entries = merge(local || {}, server || {}), nextDirty = {}, upload = {};
    Object.keys(dirty || {}).forEach(function (k) { nextDirty[k] = 1; });
    Object.keys(nextDirty).forEach(function (k) {
      var current = local && local[k], remote = server && server[k], sentValue = sent && sent[k];
      if (!current) { delete nextDirty[k]; return; }
      var changedDuringRequest = !!sentValue && JSON.stringify(current) !== JSON.stringify(sentValue);
      if (changedDuringRequest) {
        if (remote && current.t <= remote.t) current.t = remote.t + 1;
        entries[k] = current; nextDirty[k] = 1; upload[k] = current;
      } else if (sentValue && remote && JSON.stringify(remote) === JSON.stringify(sentValue)) {
        entries[k] = remote; delete nextDirty[k];
      } else if (remote && remote.t > current.t) {
        entries[k] = remote; delete nextDirty[k];
      } else if (remote && remote.t === current.t && JSON.stringify(remote) !== JSON.stringify(current)) {
        current.t = Math.max(now, remote.t + 1);
        entries[k] = current; nextDirty[k] = 1; upload[k] = current;
      } else if (!remote || remote.t < current.t) {
        entries[k] = current; nextDirty[k] = 1; upload[k] = current;
      } else {
        entries[k] = remote || current; delete nextDirty[k];
      }
    });
    // Also upload local-only or locally newer entries that were not marked dirty (for example
    // state migrated from an older localStorage key during startup).
    Object.keys(entries).forEach(function (k) {
      if (nextDirty[k]) return;
      var current = local && local[k], remote = server && server[k];
      if (current && (!remote || remote.t < current.t)) {
        entries[k] = current; nextDirty[k] = 1; upload[k] = current;
      }
    });
    return { entries: entries, dirty: nextDirty, upload: upload };
  }

  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/♀/g, 'f').replace(/♂/g, 'm').replace(/[^a-z0-9]/g, ''); }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i], best = i;
      for (j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < best) best = cur[j]; }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  // dexList: [[dex, name, ...], ...]. Returns {dex,name,score,how} or null. A tie between two species is never guessed.
  function matchName(text, dexList) {
    var t = norm(text); if (t.length < 4) return null;
    var best = [], i;
    for (i = 0; i < dexList.length; i++) {
      var nm = norm(dexList[i][1]), score = 0, how = '';
      if (nm === t) { score = 1; how = 'exact'; }
      else if (nm.length >= 6 && lev(t, nm, 2) <= (nm.length >= 9 ? 2 : 1)) { score = 0.8; how = 'close spelling'; }
      else if (t.length >= 5 && nm.indexOf(t) === 0 && nm.length - t.length <= 3) { score = 0.6; how = 'cut-off name'; }
      if (score) best.push({ dex: dexList[i][0], name: dexList[i][1], score: score, how: how });
    }
    if (!best.length) return null;
    best.sort(function (x, y) { return y.score - x.score; });
    if (best.length > 1 && best[1].score === best[0].score) return { ambiguous: true, options: best.slice(0, 3), score: 0.3, how: 'could be several' };
    return best[0];
  }

  // Turns raw OCR text into candidate Pokemon names. CP numbers, HP bars and dates are dropped.
  function candidates(text) {
    var seen = {}, out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var clean = line.replace(/\bCP\s*\d+/gi, ' ').replace(/\d+\s*\/\s*\d+/g, ' ').replace(/[0-9_|~=*<>\[\]{}()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!clean) return;
      var words = clean.split(' '), tries = [clean], i;
      for (i = 0; i < words.length; i++) tries.push(words[i]);
      for (i = 0; i + 1 < words.length; i++) tries.push(words[i] + ' ' + words[i + 1]);
      tries.forEach(function (w) { var k = norm(w); if (k.length >= 4 && !seen[k]) { seen[k] = 1; out.push(w); } });
    });
    return out;
  }

  // Review queue rows from OCR/pasted text. Only exact matches are 'high'; ambiguous names are 'unclear' and carry their options.
  function buildQueue(text, dexList, ownIds) {
    var rows = [], seen = {};
    candidates(text).forEach(function (c) {
      var m = matchName(c, dexList); if (!m) return;
      if (m.ambiguous) { rows.push({ text: c, conf: 'unclear', options: m.options, how: m.how }); return; }
      if (seen[m.dex]) return; seen[m.dex] = 1;
      rows.push({ text: c, dex: m.dex, name: m.name, conf: m.score >= 1 ? 'high' : m.score >= 0.8 ? 'medium' : 'low', how: m.how, already: !!(ownIds && ownIds[m.dex]) });
    });
    return rows;
  }


  // ---------- prices ----------
  // Shows the approximate A$ cost from the Indonesian (Rp) price, never from a US price. Data lives in prices.json.
  function fmtRp(n) { return 'Rp ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtMoney(sym, n) { return sym + (Math.round(n * 100) / 100).toFixed(2); }
  var SYM = { USD: 'US$', AUD: 'A$', EUR: '€', GBP: '£', JPY: '¥' };
  function latest(list, product, currency, region) {
    var best = null;
    (list || []).forEach(function (p) {
      if (p.product !== product || p.currency !== currency || (region && p.region !== region)) return;
      if (!(p.amount > 0)) return;
      if (!best || String(p.observed) > String(best.observed)) best = p;
    });
    return best;
  }
  function dayDiff(a, b) { return Math.abs(Date.parse(a) - Date.parse(b)) / 864e5; }
  // Returns {kind, main, sub, save, note, refs}. kinds: converted | native | notfound | none.
  function priceView(data, product, nowIso) {
    var prices = (data && data.prices) || [], fx = data && data.fx;
    var idr = latest(prices, product, 'IDR', 'ID');
    var aud = null; prices.forEach(function (p) { if (p.product === product && p.currency === 'AUD' && p.region === 'AU' && p.verified === true && p.amount > 0 && (!aud || String(p.observed) > String(aud.observed))) aud = p; });
    var refs = [];
    prices.forEach(function (p) { if (p.product === product && p.currency !== 'IDR' && !(p.currency === 'AUD' && p.region === 'AU')) refs.push({ text: 'Published ' + fmtMoney(SYM[p.currency] || p.currency + ' ', p.amount), source: p.source, observed: p.observed, note: p.note || '' }); });
    if (idr && fx && fx.from === 'IDR' && fx.to === 'AUD' && fx.rate > 0) {
      var approx = Math.round(idr.amount * fx.rate * 100) / 100;
      // The Rp amount is never shown. The only comparison is a verified A$ price for the same product, close in time.
      var comparable = aud && dayDiff(aud.observed, idr.observed) <= 14 ? aud : null;
      var out = { kind: 'converted', main: '≈ ' + fmtMoney('A$', approx), sub: comparable ? 'Originally ' + fmtMoney('A$', comparable.amount) + ' in Australia' : '', save: '', note: 'Rate ' + fx.source + ', ' + fx.observed + '. Rp price: ' + idr.source + ', ' + idr.observed + '.', refs: refs };
      if (nowIso && dayDiff(nowIso, fx.observed) > 3) out.note += ' The rate is more than 3 days old.';
      if (comparable) {
        out.note += ' Australian price: ' + comparable.source + ', ' + comparable.observed + '.';
        if (comparable.amount > approx) {
          var sv = Math.round((comparable.amount - approx) * 100) / 100;
          out.save = 'Save ' + fmtMoney('A$', sv) + ' (' + Math.round(sv / comparable.amount * 100) + '%)';
        }
      }
      return out;
    }
    if (aud) return { kind: 'native', main: fmtMoney('A$', aud.amount), sub: 'Published in A$' + (aud.note ? ', ' + aud.note.toLowerCase() : ''), save: '', note: aud.source + ', ' + aud.observed, refs: [] };
    var usd = prices.filter(function (p) { return p.product === product && p.currency === 'USD' && p.amount > 0; })[0];
    var tier = usd && AUT[Number(usd.amount).toFixed(2)];
    if (tier) return { kind: 'tier', main: (tier.basis === 'verified' ? '' : '≈ ') + fmtMoney('A$', tier.aud), sub: 'Australian store tier for this price', save: '', note: 'Australian store tier: ' + tier.seen, refs: [] };
    if (refs.length) return { kind: 'notfound', main: 'A$ price not confirmed', sub: '', save: '', note: '', refs: refs };
    return { kind: 'none', main: 'Price not published', sub: '', save: '', note: '', refs: [] };
  }

  // US$ to A$: Pokémon GO prices everything in store tiers, and the Australian tier for a US$ tier is the same every time.
  // Tiers are listed in prices.json (tiers_au) with how each was confirmed; nothing is converted by exchange rate.
  var AUT = {};
  function setTiers(t) { AUT = (t && t.map) || {}; }
  function audify(text) {
    return String(text).replace(/US\$\s?(\d+(?:\.\d\d)?)\*?(\s?\((?:or )?(?:the )?equivalent[^)]*\))?/gi, function (m, n) {
      var t = AUT[Number(n).toFixed(2)];
      return t ? (t.basis === 'verified' ? '' : '≈ ') + 'A$' + Number(t.aud).toFixed(2) : 'A$ price not confirmed';
    });
  }
  try { if (typeof fetch === 'function' && typeof window !== 'undefined') fetch('/prices.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d) setTiers(d.tiers_au); }).catch(function () { }); } catch (e) { }

  // Public prices, plus the owner's private Indonesian (Rp) prices when the sync PIN is on this device (never for anyone else).
  function loadPrices() {
    var pin = ''; try { pin = localStorage.getItem('gofn-pin') || ''; } catch (e) { }
    var pub = fetch('/prices.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    if (!pin) return pub;
    return Promise.all([pub, fetch('/api/prices-private', { headers: { 'x-pin': pin }, cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })]).then(function (a) {
      var d = a[0]; if (!d || !a[1]) return d;
      return Object.assign({}, d, { fx: a[1].fx, prices: (d.prices || []).concat(a[1].prices || []), tiers_idr: a[1].tiers_idr, rp_per_usd: a[1].rp_per_usd, owner: true });
    });
  }

  // A hand-written "nothing known yet" line. Once live data has details for the same event, these lines are wrong and are dropped.
  var PLACEHOLDER = /^(listed on (the|our) (season )?calendar\b|on the calendar,? but\b)|\b(no bosses|details to come|not announced|not yet announced|not published|to be announced)\b/i;
  function isPlaceholder(t) { return PLACEHOLDER.test(String(t || '').trim()); }
  // The real event (Leek Duck / official page) for one rotating raid boss, so a boss on the Raids tab opens its own event page.
  // events: [{id, name, start, end}]. label: '5★' | 'Mega' | 'Shadow'.
  var BOSS_STOP = { mega: 1, shadow: 1, forme: 1, incarnate: 1, and: 1, x: 1, y: 1 };
  function raidEventFor(events, boss, label, startMs, endMs) {
    var want = String(boss || '').toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z0-9]+/).filter(function (w) { return w && !BOSS_STOP[w]; });
    if (!want.length) return null;
    var tier = label === 'Mega' ? /mega raids/i : label === 'Shadow' ? /shadow raids/i : /5-star/i, hit = null;
    (events || []).forEach(function (e) {
      if (hit || !e || !/^leekduck:/.test(String(e.id)) || !tier.test(e.name || '')) return;
      var s = +e.start, en = +e.end; if (!(s < endMs && en > startMs)) return;
      var have = String(e.name).toLowerCase().split(/[^a-z0-9]+/);
      if (want.every(function (w) { return have.indexOf(w) >= 0; })) hit = e;
    });
    return hit;
  }
  // Rp price for a US$ list tier. Exact when that tier has been seen in the Indonesian store, otherwise the observed trend
  // (Rp is about 5,025 x the US$ price). Owner only: needs the private Rp data. Returns {idr, aud, basis, seen} or null.
  function rpEstimate(data, usd) {
    var fx = data && data.fx, T = data && data.tiers_idr, m = data && data.rp_per_usd, u = Number(usd);
    if (!(u > 0) || !fx || !(fx.rate > 0) || !T || !m) return null;
    var t = T[u.toFixed(2)], idr = t ? t.idr : Math.round(u * m.typical / 500) * 500;
    return { idr: idr, aud: Math.round(idr * fx.rate * 100) / 100, basis: t ? 'seen' : 'modelled', seen: t ? t.seen : '' };
  }
  // Split the Today live total into game events and real-world in-person events. Regional
  // events remain visible; this only makes the summary count more informative.
  function liveActivityCounts(events, regional) {
    var inGame = 0, inPerson = 0;
    (events || []).forEach(function (event) {
      if (!event) return;
      if (event.kind === 'person') inPerson++; else inGame++;
    });
    (regional || []).forEach(function (event) {
      if (!event) return;
      if (event.scope === 'global') inGame++; else inPerson++;
    });
    return { inGame: inGame, inPerson: inPerson, total: inGame + inPerson };
  }

  return { esc: esc, rpEstimate: rpEstimate, raidEventFor: raidEventFor, isPlaceholder: isPlaceholder, audify: audify, setTiers: setTiers, loadPrices: loadPrices, priceView: priceView, fmtRp: fmtRp, buildQueue: buildQueue, parseForm: parseForm, formId: formId, merge: merge, reconcileSync: reconcileSync, norm: norm, lev: lev, matchName: matchName, candidates: candidates, liveActivityCounts: liveActivityCounts };
}));
