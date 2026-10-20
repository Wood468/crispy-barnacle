/* Purchase planner: what is in the Pokemon GO web store now (tickets, GO Passes, ticket boxes), how long before the event
   each one was listed, and a tick-list that totals several purchases into one buying session.
   Store data comes from /store-log.json (written by the store watcher); events from GODASH.events(). Nothing is typed in here. */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var STOP = /^(ultra|ticket|tickets|box|deluxe|pass|go|pokemon|the|and|of|day|ranks?|global|bundle|pack|\d+|20\d\d)$/;
  var KEY = 'gofn-buyplan', plan = {}, LOG = null, DET = {}, PR = null, EXT = [];
  /* Store item name -> product id in prices.json. Prices shown are always A$: the Rp price converted when this device has the owner's
     private prices, otherwise the verified Australian price or Australian tier. US$ is never shown. */
  function productFor(name) {
    var n = String(name).toLowerCase(), pre = /october/.test(n) ? 'oct' : /fall marathon/.test(n) ? 'fall' : '';
    if (pre && /go pass deluxe/.test(n)) return 'go-pass-' + pre + (/ultra box/.test(n) ? '-ultrabox' : /\+\s*(\d+) ranks/.test(n) ? '-deluxe-' + n.match(/\+\s*(\d+) ranks/)[1] : '-deluxe');
    if (/wild area 2026: global/.test(n)) return 'wild-area-2026-global-ultra-box';
    return 'store-' + n.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function audOf(r) {
    var v = PR && window.GOLIB ? GOLIB.priceView(PR, productFor(r.name), new Date().toISOString().slice(0, 10)) : null, m = v && v.main.match(/A\$([\d.]+)/);
    if (m && v.kind !== 'notfound' && (v.kind === 'converted' || !(PR && PR.owner))) return { n: parseFloat(m[1]), main: v.main, sub: v.kind === 'converted' ? 'from the Rp price' + (v.sub ? ' · ' + v.sub.toLowerCase() : '') : (PR && PR.owner ? 'No Rp price recorded yet · ' : '') + (v.kind === 'native' ? 'Australian store price' : v.sub) };
    var u = String(r.price || '').match(/([\d.]+)/), t = u && window.GOLIB ? GOLIB.audify('US$' + u[1]) : '';
    m = t.match(/A\$([\d.]+)/);
    var us = u && window.GOLIB && PR && PR.owner ? GOLIB.rpEstimate(PR, u[1]) : null, tm = t.match(/A\$([\d.]+)/);
    if (us) return { n: us.aud, main: '≈ A$' + us.aud.toFixed(2), sub: (us.basis === 'seen' ? 'Rp tier seen in the store' : 'estimated from the Rp trend') + (tm ? ' · AU store ≈ A$' + tm[1] : ''), est: true };
    var noRp = PR && PR.owner ? 'No Rp price recorded yet · ' : '';
    return m ? { n: parseFloat(m[1]), main: t, sub: noRp + 'Australian store tier' } : { n: null, main: 'A$ not confirmed', sub: noRp.replace(/ · $/, '') };
  }
  function load() { try { plan = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { plan = {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(plan)); } catch (e) { } }
  function toks(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function (w) { return w && !STOP.test(w); }); }
    function dstr(ms) { var d = new Date(ms); return d.getDate() + ' ' + MON[d.getMonth()]; }
  /* Pass names carry the month ("GO Pass Deluxe: October") so the month is kept as a token on both sides. */
  function matchEvent(name, evs, now) {
    var t = toks(name); if (!t.length) return null; var best = null, bs = 0;
    evs.forEach(function (e) {
      if (!e.end || e.end.getTime() < now - 2 * DAY) return;
      var et = toks(e.name), n = 0; if (!et.length) return;
      et.forEach(function (w) { if (t.indexOf(w) >= 0) n++; });
      var sc = n / Math.max(et.length, t.length);
      if (n && sc > bs) { bs = sc; best = e; }
    });
    return bs >= 0.5 ? best : null;
  }
  function build(evs, now) {
    var watch = LOG.watchStart ? Date.parse(LOG.watchStart) : 0, rows = [], used = {};
    LOG.items.filter(function (i) { return !i.goneAt; }).forEach(function (i) {
      var ev = matchEvent(i.name, evs, now), first = Date.parse(i.firstSeen), precise = first > watch + 3600e3;
      if (ev) used[ev.id] = 1;
      rows.push({ id: i.slug, name: i.name, price: i.price, aud: audOf({ name: i.name, price: i.price }), ev: ev, first: first, precise: precise, lead: ev && precise ? Math.round((ev.start.getTime() - first) / DAY) : null });
    });
    rows.sort(function (a, b) { return (a.ev ? a.ev.start : 9e15) - (b.ev ? b.ev.start : 9e15); });
    var soon = evs.filter(function (e) {
      if (used[e.id] || e.start.getTime() < now || e.start.getTime() > now + 50 * DAY || e.scope === 'global' && false) return false;
      var d = DET[e.id] || DET[String(e.id).replace(/^cur:/, '')]; if (!d || !d.fields) return false;
      return ['tickets', 'dates', 'bonuses'].some(function (k) { return (d.fields[k] || []).some(function (t) { return /(event|ultra|battle day|go pass deluxe)[^.]*ticket|ticket box|ultra box|pass deluxe/i.test(t.text); }); });
    }).sort(function (a, b) { return a.start - b.start; });
    var gone = LOG.items.filter(function (i) { return i.goneAt; });
    return { rows: rows, soon: soon, gone: gone, watch: watch };
  }
  function render(host, m, now) {
    var leads = m.rows.filter(function (r) { return r.lead != null; }).map(function (r) { return r.lead; }).sort(function (a, b) { return a - b; });
    var sel = m.rows.filter(function (r) { return plan[r.id]; }), tot = sel.reduce(function (s, r) { return s + (r.aud.n || 0); }, 0), unp = sel.filter(function (r) { return r.aud.n == null; }).length;
    var h = '<div class="by-list">' + m.rows.map(function (r) {
      var when = r.ev ? esc(r.ev.name) + ' · ' + (r.ev.start.getTime() <= now ? 'on now, ends ' + dstr(r.ev.end) : 'starts ' + dstr(r.ev.start)) : 'Not tied to a single listed event';
      var seen = r.precise ? 'Listed ' + dstr(r.first) + (r.lead != null ? ' · <b>' + r.lead + ' day' + (r.lead === 1 ? '' : 's') + ' before the event</b>' : '') : 'Listed by ' + dstr(m.watch) + ' (we only started watching then)';
      return '<label class="by-r"><input type="checkbox" data-by="' + esc(r.id) + '"' + (plan[r.id] ? ' checked' : '') + '><span class="by-t"><b>' + esc(r.name) + '</b><small>' + when + '</small><small>' + seen + '</small></span><span class="by-p">' + esc(r.aud.main) + '<small>' + esc(r.aud.sub) + '</small></span></label>';
    }).join('') + '</div>';
    if (!m.rows.length) h = '<p class="note">Nothing from the store is logged yet.</p>';
    var bar = '<div class="by-tot"><b>' + (sel.length ? sel.length + ' selected · ≈ A$' + tot.toFixed(2) + (unp ? ' + ' + unp + ' unpriced' : '') : 'Tick items to plan one buying session') + '</b>' + (sel.length ? '<span>' + sel.map(function (r) { return esc(r.name); }).join(' + ') + '</span><a class="by-go" href="https://store.pokemongo.com" target="_blank" rel="noopener">Open store</a>' : '') + '</div>';
    var s = '';
    if (m.soon.length) s += '<h4>Announced, not in the store yet</h4><div class="by-list">' + m.soon.map(function (e) { return '<div class="by-r by-soon"><span class="by-t"><b>' + esc(e.name) + '</b><small>Starts ' + dstr(e.start) + ' · the official post mentions a ticket or paid pass; it is not listed in the store yet</small></span></div>'; }).join('') + '</div>';
    var stat = leads.length >= 3 ? 'Listed a median of ' + leads[Math.floor(leads.length / 2)] + ' days before the event (' + leads.length + ' measured, range ' + leads[0] + '–' + leads[leads.length - 1] + ').'
      : 'Lead times build up as the watcher sees new items appear' + (leads.length ? ' (' + leads.length + ' measured so far).' : '.');
    var g = m.gone.length ? '<p class="note">Left the store: ' + m.gone.slice(0, 6).map(function (i) { return esc(i.name) + ' (' + dstr(Date.parse(i.goneAt)) + ')'; }).join(', ') + '</p>' : '';
    var ext = EXT.length ? '<h4>Bought on the Niantic ticketing site, not in the web store</h4><div class="by-list">' + EXT.map(function (x) {
      return '<div class="by-r by-ext"><span class="by-t"><b>' + esc(x.name) + '</b><small>' + esc(x.when) + ' · ' + esc(x.price) + '</small><small>' + esc(x.note || '') + '</small><a class="by-go" href="' + esc(x.url) + '" target="_blank" rel="noopener">Open ticket site</a></span></div>';
    }).join('') + '</div><p class="note">These prices are in local currency and are not in the A$ total above.</p>' : '';
    host.innerHTML = bar + h + s + ext + '<p class="note">' + esc(stat) + ' All prices in A$. Checked ' + esc(new Date(LOG.updated).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })) + '.</p>' + g;
    host.querySelectorAll('[data-by]').forEach(function (c) { c.addEventListener('change', function () { if (c.checked) plan[c.dataset.by] = 1; else delete plan[c.dataset.by]; save(); render(host, m, now); }); });
  }
  function go() {
    var host = document.getElementById('buy-body'); if (!host) return; load();
    Promise.all([(window.GOLIB ? GOLIB.loadPrices() : Promise.resolve(null)).then(function (d) { PR = d; }).catch(function () { }).then(function () { return fetch('/store-log.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }); }), fetch('/tickets-external.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { EXT = (j && j.items) || []; }).catch(function () { }).then(function () { return fetch('/event-details.json'); }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })]).then(function (a) {
      if (!a[0] || !a[0].items) return; LOG = a[0]; DET = (a[1] && a[1].events) || {};
      var n = 0, t = setInterval(function () {
        var evs = window.GODASH && GODASH.events ? GODASH.events() : null;
        if (evs && evs.length || ++n > 40) { clearInterval(t); var now = Date.now(); render(host, build(evs || [], now), now); document.getElementById('buy-sec').hidden = false; }
      }, 300);
    }).catch(function () { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
