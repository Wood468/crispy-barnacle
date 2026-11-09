/* GO Field Notes shared helpers. Plain JS so the same file runs in the browser (window.GOLIB) and in node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GOLIB = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Expand only explicit source group labels; keep form names intact for artwork and tracking.
  function raidBossNames(value) {
    var name=String(value||'').replace(/, to .*/, '').trim();
    if(!name)return [];
    if(/^Mega Charizard X and Y$/i.test(name))return ['Mega Charizard X','Mega Charizard Y'];
    if(/^Deoxys \(all four Formes\)$/i.test(name))return ['Deoxys (Normal Forme)','Deoxys (Attack Forme)','Deoxys (Defense Forme)','Deoxys (Speed Forme)'];
    return name.split(/\s+and\s+/i).map(function(n){return n.trim();}).filter(Boolean);
  }

  /* Raid / Max Battle window state. Pure (milliseconds in, text out) so boundaries are testable: at the start instant the window is
     live, at the end instant it has ended, and the remaining time never rounds a live window up to "0m left". */
  function windowDur(ms) {
    var m = Math.max(1, Math.ceil(ms / 60000));
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h' + (m % 60 && h < 6 ? ' ' + (m % 60) + 'm' : '');
    var d = Math.floor(h / 24); return d + 'd' + (h % 24 && d < 4 ? ' ' + (h % 24) + 'h' : '');
  }
  function raidWindowState(startMs, endMs, nowMs) {
    if (!isFinite(startMs) || !isFinite(endMs) || endMs <= startMs) return { phase: 'unknown', text: '' };
    if (nowMs >= endMs) return { phase: 'ended', text: 'Ended' };
    if (nowMs >= startMs) return { phase: 'live', text: 'Ends in ' + windowDur(endMs - nowMs) };
    return { phase: 'soon', text: 'Starts in ' + windowDur(startMs - nowMs) };
  }
  /* Curated per-tier Max Battle rosters (data.json maxRosters). Only an entry whose window overlaps the event and whose title matches is used;
     nothing is inferred from species. */
  function maxRosterFor(rosters, eventName, startMs, endMs) {
    var name = norm(eventName || '');
    return (rosters || []).filter(function (r) {
      var rs = Date.parse(r.s), re = Date.parse(r.e);
      return r && r.event && norm(r.event) === name && Array.isArray(r.tiers) && (!isFinite(rs) || !isFinite(re) || (rs < endMs && re > startMs));
    })[0] || null;
  }

  // Filter the existing collection opportunities without inferring new ownership or changing order.
  function filterOpportunities(rows, query, mode, followed) {
    var q = norm(query || '');
    return (rows || []).filter(function (row) {
      if (mode === 'need' && row.o.state !== 'missing') return false;
      if (mode === 'following' && !followed(row.name)) return false;
      return !q || norm([row.name, row.o.base].concat(row.evs.map(function (e) { return e.name; })).join(' ')).indexOf(q) >= 0;
    });
  }

  // Only a task's own checked date establishes verification age, never dataset asOf.
  function researchCheckedText(value, now) {
    var day = typeof value === 'string' ? value.slice(0, 10) : '';
    var ms = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(day + 'T00:00:00Z') : NaN;
    var clock = now == null ? Date.now() : now;
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== day || ms > clock) return 'Source check date unavailable';
    var age = Math.floor((clock - ms) / 864e5);
    return 'Checked ' + day + (age > 21 ? ' · source check may be out of date' : age > 7 ? ' · source check may be due' : '');
  }

  // How old a recorded refresh time is. Thresholds are in hours: the event importer runs hourly, so a day without a refresh means it failed;
  // the hand-curated snapshot is edited by hand, so it gets days. A missing, unparsable or future time is "unknown", never "fresh".
  var FRESH_LIMITS = { importer: { fresh: 6, stale: 24 }, curated: { fresh: 72, stale: 168 } };
  function ageText(ms) { var m = Math.round(ms / 60000); return m < 2 ? 'just now' : m < 120 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; }
  function freshnessOf(value, now, kind) {
    var lim = FRESH_LIMITS[kind] || FRESH_LIMITS.importer, clock = now == null ? Date.now() : now;
    var ms = typeof value === 'number' ? value : (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? Date.parse(value.length === 10 ? value + 'T12:00:00Z' : value) : NaN);
    if (!Number.isFinite(ms) || ms <= 0 || ms > clock + 5 * 60000) return { state: 'unknown', ageMs: null, label: 'Update time not recorded' };
    var age = Math.max(0, clock - ms), hours = age / 3600000;
    if (hours <= lim.fresh) return { state: 'fresh', ageMs: age, label: 'Updated ' + ageText(age) };
    if (hours <= lim.stale) return { state: 'delayed', ageMs: age, label: 'Update delayed \u00b7 last updated ' + ageText(age) };
    return { state: 'stale', ageMs: age, label: 'May be out of date \u00b7 last updated ' + ageText(age) };
  }
  // Three different reasons a value is absent. Never merged into one "unknown".
  var MISSING = { 'not-announced': 'Not announced yet', 'not-in-source': 'Not available from source', unverified: 'Unverified' };
  function missingLabel(reason) { return MISSING[reason] || MISSING.unverified; }

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
  /* One request per JSON URL per page load. The first caller's request is shared by everyone who asks for the same URL (with the same fetch options) within maxAge (default 30 s), each caller getting its own freshly parsed copy so nobody can mutate another's data.
     A failed request (network error, non-2xx, bad JSON) is dropped at once, so the next caller tries again. opts.fresh skips the shared copy and replaces every shared copy of that URL; opts.init is passed to fetch for the request that actually goes out.
     The shared copy is keyed by URL plus the fetch options that change what comes back (method, headers, credentials). A caller that forces the network (cache: reload / no-store) never takes a copy that was fetched without that, but a forced copy serves everyone; the soft modes (default, no-cache) share one copy.
     A request that never answers is not kept longer than maxAge: later callers start their own, and opts.timeout (ms) makes one caller stop waiting (the shared request is dropped too, so the next caller does not inherit the hang). */
  var JSON_CACHE = {}, WRITE_SEQ = 0;
  function initKey(init) {
    if (!init) return '';
    var h = init.headers, hk = '';
    if (h) {
      var pairs = [];
      if (typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach(function (v, k) { pairs.push([String(k).toLowerCase(), String(v)]); });
      else if (Array.isArray(h)) h.forEach(function (x) { pairs.push([String(x[0]).toLowerCase(), String(x[1])]); });
      else Object.keys(h).forEach(function (k) { pairs.push([k.toLowerCase(), String(h[k])]); });
      pairs.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
      hk = JSON.stringify(pairs);
    }
    var k = [init.method || '', init.credentials || '', init.mode || '', hk].join('|');
    return k === '|||' ? '' : k;
  }
  /* A request that writes (any method but GET, or one with a body) is never shared or kept: each caller sends its own. */
  function isWrite(init) { return !!init && (init.body != null || (!!init.method && String(init.method).toUpperCase() !== 'GET')); }
  function getJson(url, opts) {
    opts = opts || {};
    var maxAge = opts.maxAge == null ? 30000 : opts.maxAge, write = isWrite(opts.init), key = write ? 'write\n' + url + '\n' + (++WRITE_SEQ) : url + '\n' + initKey(opts.init), hit = JSON_CACHE[key], now = Date.now(), entry;
    var forced = !!opts.init && (opts.init.cache === 'reload' || opts.init.cache === 'no-store');
    if (hit && !opts.fresh && now - hit.t < maxAge && (hit.forced || !forced)) entry = hit;
    else {
      if (opts.fresh) Object.keys(JSON_CACHE).forEach(function (k) { if (k.indexOf(url + '\n') === 0) delete JSON_CACHE[k]; });
      var p = fetch(url, opts.init).then(function (r) { if (!r.ok) throw new Error(url + ' HTTP ' + r.status); return r.text(); });
      entry = { t: now, p: p, forced: forced };
      if (!write) { JSON_CACHE[key] = entry; p.catch(function () { if (JSON_CACHE[key] === entry) delete JSON_CACHE[key]; }); }
    }
    var waiting = entry.p, timer = null;
    if (opts.timeout > 0) {
      waiting = Promise.race([entry.p, new Promise(function (_, reject) {
        timer = setTimeout(function () { if (JSON_CACHE[key] === entry) delete JSON_CACHE[key]; reject(new Error(url + ' timed out')); }, opts.timeout);
      })]);
    }
    return waiting.then(function (text) {
      if (timer && typeof clearTimeout === 'function') clearTimeout(timer);
      try { return JSON.parse(text); } catch (e) { if (JSON_CACHE[key] === entry) delete JSON_CACHE[key]; throw e; }
    }, function (e) { if (timer && typeof clearTimeout === 'function') clearTimeout(timer); throw e; });
  }
  function jsonOrNull(url, opts) { return getJson(url, opts).catch(function () { return null; }); }
  try { if (typeof fetch === 'function' && typeof window !== 'undefined') jsonOrNull('/prices.json').then(function (d) { if (d) setTiers(d.tiers_au); }); } catch (e) { }

  // Public prices, plus the owner's private Indonesian (Rp) prices when the sync PIN is on this device (never for anyone else).
  function loadPrices() {
    var pin = ''; try { pin = localStorage.getItem('gofn-pin') || ''; } catch (e) { }
    var pub = jsonOrNull('/prices.json');
    if (!pin) return pub;
    return Promise.all([pub, fetch('/api/prices-private', { headers: { 'x-pin': pin }, cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })]).then(function (a) {
      var d = a[0]; if (!d || !a[1]) return d;
      return Object.assign({}, d, { fx: a[1].fx, prices: (d.prices || []).concat(a[1].prices || []), tiers_idr: a[1].tiers_idr, rp_per_usd: a[1].rp_per_usd, regional: a[1].regional || [], owner: true });
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
  // Regional entries are in-person by default. An explicit mode:'in-game' marks a
  // region-locked gameplay event with no physical venue, so it belongs with game activity.
  function isInPersonWorldEvent(event) {
    return !!event && event.scope !== 'global' && event.mode !== 'in-game';
  }
  function isRegionalInGameEvent(event) {
    return !!event && event.scope !== 'global' && event.mode === 'in-game';
  }
  function liveActivityCounts(events, regional) {
    var inGame = 0, inPerson = 0;
    (events || []).forEach(function (event) {
      if (!event) return;
      if (event.kind === 'person') inPerson++; else inGame++;
    });
    (regional || []).forEach(function (event) {
      if (!event) return;
      if (isInPersonWorldEvent(event)) inPerson++; else inGame++;
    });
    return { inGame: inGame, inPerson: inPerson, total: inGame + inPerson };
  }

  /* Links that only work for the person who owns the Discord server (discord.com/channels/...) are useless to everyone else.
     publicLink() returns the first candidate that is an https link a visitor can actually open, or '' when none is. */
  function isPrivateLink(u) {
    if (typeof u !== 'string') return false;
    var raw = u.trim();
    if (!/^https?:/i.test(raw)) return false;
    var host = '', path = '';
    try {
      /* Browsers read a backslash as a slash, so the URL parser is used instead of a pattern: userinfo, trailing dots, ports and case are all dealt with. */
      var url = new URL(raw);
      host = url.hostname.toLowerCase().replace(/\.+$/, ''); path = url.pathname;
      try { path = decodeURIComponent(path); } catch (e2) { }
      path = path.replace(/\/{2,}/g, '/');
    } catch (e) {
      /* Cannot be parsed: anything that looks like a Discord channel link is treated as private rather than shown. */
      /* The host part may carry userinfo, any subdomain, a trailing dot and a port (even an invalid one such as :99999); the path must start with /channels. */
      var flat = raw.replace(/\\/g, '/'); try { flat = decodeURIComponent(flat); } catch (e3) { }
      return /^https?:\/*(?:[^\/?#@]*@)?(?:[a-z0-9-]+\.)*(?:discord|discordapp)\.com\.*(?::[^\/?#]*)?\/+channels(?:[\/?#]|$)/i.test(flat);
    }
    var onDiscord = ['discord.com', 'discordapp.com'].some(function (d) { return host === d || host.slice(-(d.length + 1)) === '.' + d; });
    return onDiscord && /^\/channels(\/|$)/i.test(path);
  }
  function publicLink() {
    for (var i = 0; i < arguments.length; i++) {
      var u = arguments[i];
      if (typeof u === 'string' && /^https:\/\//i.test(u) && !isPrivateLink(u)) return u;
    }
    return '';
  }

  /* ---------- storage safety for Collection data (gofn-dex-v1, gofn-us-v1, gofn-stamp) ----------
     readJsonKeep never treats an unreadable value as "nothing saved": it keeps a copy under <key>-corrupt[-time] and reports it.
     reportSave shows one non-blocking alert while any write is failing, and clears it once every writer succeeds again. */
  function readJsonKeep(storage, key) {
    var raw;
    try { raw = storage.getItem(key); } catch (e) { return { value: null, corrupt: false, unreadable: true, kept: false }; }
    if (raw == null || raw === '') return { value: null, corrupt: false, unreadable: false, kept: false };
    try { return { value: JSON.parse(raw), corrupt: false, unreadable: false, kept: false }; } catch (e) { /* keep a copy below */ }
    var kept = false;
    try {
      var name = key + '-corrupt', existing = storage.getItem(name);
      if (existing === raw) kept = true;
      else { if (existing != null) name += '-' + Date.now(); storage.setItem(name, raw); kept = true; }
    } catch (e) { kept = false; }
    return { value: null, corrupt: true, unreadable: false, kept: kept };
  }
  var SAVE_MESSAGE = 'Couldn\u2019t save \u2014 storage is full or unavailable. Changes stay on screen for this session only.';
  var failing = {}, retryFns = {}, alertDismissed = false;
  function reportSave(source, ok, retry) {
    if (typeof document === 'undefined') return ok;
    if (ok) { delete failing[source]; delete retryFns[source]; } else { failing[source] = 1; retryFns[source] = retry; }
    var el = document.getElementById('gofn-storage-alert'), any = Object.keys(failing).length > 0;
    if (!any) { if (el) el.hidden = true; alertDismissed = false; return ok; }
    if (!ok) alertDismissed = false;
    if (alertDismissed) return ok;
    if (!el) {
      el = document.createElement('div'); el.id = 'gofn-storage-alert'; el.className = 'storage-alert'; el.setAttribute('role', 'alert');
      el.innerHTML = '<span class="storage-alert-msg"></span><button type="button" class="storage-alert-retry">Try again</button><button type="button" class="storage-alert-x" aria-label="Dismiss">\u00d7</button>';
      el.querySelector('.storage-alert-retry').addEventListener('click', function () {
        Object.keys(retryFns).forEach(function (k) { try { retryFns[k] && retryFns[k](); } catch (e) { /* still failing */ } });
      });
      el.querySelector('.storage-alert-x').addEventListener('click', function () { alertDismissed = true; el.hidden = true; });
      document.body.appendChild(el);
    }
    el.querySelector('.storage-alert-msg').textContent = SAVE_MESSAGE;
    el.hidden = false;
    return ok;
  }
  function failingSources() { return Object.keys(failing); }

  return { readJsonKeep: readJsonKeep, reportSave: reportSave, failingSources: failingSources, SAVE_MESSAGE: SAVE_MESSAGE, raidBossNames: raidBossNames, raidWindowState: raidWindowState, maxRosterFor: maxRosterFor, researchCheckedText: researchCheckedText, freshnessOf: freshnessOf, missingLabel: missingLabel, filterOpportunities: filterOpportunities, isPrivateLink: isPrivateLink, publicLink: publicLink, esc: esc, rpEstimate: rpEstimate, raidEventFor: raidEventFor, isPlaceholder: isPlaceholder, audify: audify, setTiers: setTiers, loadPrices: loadPrices, getJson: getJson, jsonOrNull: jsonOrNull, priceView: priceView, fmtRp: fmtRp, buildQueue: buildQueue, parseForm: parseForm, formId: formId, merge: merge, reconcileSync: reconcileSync, norm: norm, lev: lev, matchName: matchName, candidates: candidates, isInPersonWorldEvent: isInPersonWorldEvent, isRegionalInGameEvent: isRegionalInGameEvent, liveActivityCounts: liveActivityCounts };
}));
