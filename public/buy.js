/* Purchase planner: what is in the Pokemon GO web store now (tickets, GO Passes, ticket boxes), how long before the event
   each one was listed, and a tick-list that totals several purchases into one buying session.
   Store data comes from /store-log.json (written by the store watcher); events from GODASH.events(). Nothing is typed in here. */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var STOP = /^(ultra|ticket|tickets|box|deluxe|pass|go|pokemon|the|and|of|day|ranks?|global|bundle|pack|\d+|20\d\d)$/;
  var KEY = 'gofn-buyplan', plan = {}, LOG = null, PR = null, EXT = [];
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
  /* Ticks live in the app's synced state as "pref:buy:<item>" = "plan" or "bought", so the phone and the PC agree and the Worker can
     send a last-chance message for items you planned. The old per-device list is imported once. */
  var VIEW = null;
  function ST() { return window.GOSTATE || null; }
  function bkey(id) { return 'pref:buy:' + id; }
  function mark(id) { var s = ST(), v = s ? s.get(bkey(id)) : plan[id]; return v === 'bought' ? 'bought' : v ? 'plan' : ''; }
  function setMark(id, v) { var s = ST(); if (s) s.set(bkey(id), v || undefined); else { if (v) plan[id] = v; else delete plan[id]; save(); } }
  function load() {
    try { plan = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { plan = {}; }
    var s = ST(); if (!s) return;
    Object.keys(plan).forEach(function (id) { if (s.get(bkey(id)) === undefined) s.set(bkey(id), plan[id] === 'bought' ? 'bought' : 'plan'); });
    if (Object.keys(plan).length) { plan = {}; save(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(plan)); } catch (e) { } }
  /* "Ends in about 4 hours" from the estimated end time the watcher saved; urgent inside six hours. */
  function untilStr(ms, now) {
    var h = (ms - now) / 36e5;
    if (h <= 0) return 'Ending now';
    if (h < 1) return 'Ends in under an hour';
    if (h < 48) return 'Ends in about ' + Math.round(h) + ' hour' + (Math.round(h) === 1 ? '' : 's');
    return 'Ends in about ' + Math.round(h / 24) + ' days';
  }
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
  /* Tickets sold outside the web store (/tickets-external.json). An entry disappears the day after its event ends. The optional sale window
     decides the chip: opens soon, on sale, or closed. Dates are plain days, read as the player's own day. */
  function dayMs(s) { var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; }
  function extEntries(items, now) {
    return (items || []).map(function (x) {
      var e0 = dayMs(x.eventStart), e1 = dayMs(x.eventEnd), s0 = dayMs(x.saleStart), s1 = dayMs(x.saleEnd), status, chip;
      if (e1 != null && now >= e1 + DAY) return null;
      if (s0 != null && now < s0) { status = 'soon'; chip = 'Sale opens ' + dstr(s0); }
      else if (s1 != null && now >= s1 + DAY) { status = 'closed'; chip = 'Sale closed ' + dstr(s1) + ' · check for resale or extra days'; }
      else if (s0 != null || s1 != null) { status = 'open'; chip = 'On sale now' + (s1 != null ? ' · until ' + dstr(s1) : ''); }
      else { status = 'unknown'; chip = 'Check the ticket site for availability'; }
      return { x: x, status: status, chip: chip, sort: e0 != null ? e0 : e1 != null ? e1 : 9e15 };
    }).filter(Boolean).sort(function (a, b) { return a.sort - b.sort; });
  }
  function build(evs, now) {
    var watch = LOG.watchStart ? Date.parse(LOG.watchStart) : 0, rows = [];
    LOG.items.filter(function (i) { return !i.goneAt; }).forEach(function (i) {
      var ev = matchEvent(i.name, evs, now), first = Date.parse(i.firstSeen), precise = first > watch + 3600e3;
      rows.push({ id: i.slug, name: i.name, price: i.price, href: i.href || '', endsAt: i.endsAt ? Date.parse(i.endsAt) : null, aud: audOf({ name: i.name, price: i.price }), ev: ev, first: first, precise: precise, lead: ev && precise ? Math.round((ev.start.getTime() - first) / DAY) : null });
    });
    rows.sort(function (a, b) { return (a.ev ? a.ev.start : 9e15) - (b.ev ? b.ev.start : 9e15); });
    return { rows: rows, watch: watch };
  }
  function render(host, m, now) {
    var leads = m.rows.filter(function (r) { return r.lead != null; }).map(function (r) { return r.lead; }).sort(function (a, b) { return a - b; });
    var sel = m.rows.filter(function (r) { return mark(r.id) === 'plan'; }), bought = m.rows.filter(function (r) { return mark(r.id) === 'bought'; }).length, tot = sel.reduce(function (s, r) { return s + (r.aud.n || 0); }, 0), unp = sel.filter(function (r) { return r.aud.n == null; }).length;
    var h = '<div class="by-list">' + m.rows.map(function (r) {
      var when = r.ev ? esc(r.ev.name) + ' · ' + (r.ev.start.getTime() <= now ? 'on now, ends ' + dstr(r.ev.end) : 'starts ' + dstr(r.ev.start)) : 'Not tied to a single listed event';
      var seen = r.precise ? 'Listed ' + dstr(r.first) + (r.lead != null ? ' · <b>' + r.lead + ' day' + (r.lead === 1 ? '' : 's') + ' before the event</b>' : '') : 'Listed by ' + dstr(m.watch) + ' (we only started watching then)';
      var st = mark(r.id), ends = r.endsAt ? untilStr(r.endsAt, now) : '', urgent = r.endsAt && r.endsAt - now < 6 * 36e5;
      return '<label class="by-r' + (st === 'bought' ? ' by-done' : '') + '"><input type="checkbox" data-by="' + esc(r.id) + '"' + (st === 'plan' ? ' checked' : '') + (st === 'bought' ? ' disabled' : '') + '><span class="by-t"><b>' + esc(r.name) + '</b>' + (ends && st !== 'bought' ? '<small class="by-end' + (urgent ? ' by-urgent' : '') + '">' + esc(ends) + '</small>' : '') + '<small>' + when + '</small><small>' + seen + '</small><span class="by-acts"><a class="by-lnk" href="' + esc('https://store.pokemongo.com' + (r.href || '')) + '" target="_blank" rel="noopener">Open in store</a><button type="button" class="pill" data-bought="' + esc(r.id) + '">' + (st === 'bought' ? 'Bought ✓ (undo)' : 'Mark bought') + '</button></span></span><span class="by-p">' + esc(r.aud.main) + '<small>' + esc(r.aud.sub) + '</small></span></label>';
    }).join('') + '</div>';
    if (!m.rows.length) h = '<p class="note">Nothing from the store is logged yet.</p>';
    var bar = '<div class="by-tot"><b>' + (sel.length ? sel.length + ' selected · ≈ A$' + tot.toFixed(2) + (unp ? ' + ' + unp + ' unpriced' : '') : 'Tick items to plan one buying session') + (bought ? ' · ' + bought + ' bought' : '') + '</b>' + (sel.length ? '<span>' + sel.map(function (r) { return esc(r.name); }).join(' + ') + '</span><a class="by-go" href="https://store.pokemongo.com" target="_blank" rel="noopener">Open store</a>' : '') + '</div>';
    var stat = leads.length >= 3 ? 'Listed a median of ' + leads[Math.floor(leads.length / 2)] + ' days before the event (' + leads.length + ' measured, range ' + leads[0] + '–' + leads[leads.length - 1] + ').'
      : 'Lead times build up as the watcher sees new items appear' + (leads.length ? ' (' + leads.length + ' measured so far).' : '.');
    var ex = extEntries(EXT, now);
    var ext = ex.length ? '<h4>Sold on the Niantic ticketing site</h4><p class="note">Not in the web store, so not in the A$ total. Prices are in local currency.</p><div class="by-list">' + ex.map(function (r) {
      var x = r.x;
      return '<div class="by-r by-ext"><span class="by-t"><b>' + esc(x.name) + '</b><small class="by-chip by-st-' + r.status + '">' + esc(r.chip) + '</small><small>' + esc(x.when) + ' · ' + esc(x.price) + '</small>' + (x.note ? '<small>' + esc(x.note) + '</small>' : '') + '<a class="by-lnk" href="' + esc(x.url) + '" target="_blank" rel="noopener">Open ticket site</a></span></div>';
    }).join('') + '</div>' : '';
    host.innerHTML = bar + h + ext + '<p class="note">' + esc(stat) + ' All prices in A$. Store list last changed ' + esc(new Date(LOG.updated).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })) + '.</p>';
    host.querySelectorAll('[data-by]').forEach(function (c) { c.addEventListener('change', function () { setMark(c.dataset.by, c.checked ? 'plan' : ''); render(host, m, now); }); });
    host.querySelectorAll('[data-bought]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); var id = b.dataset.bought; setMark(id, mark(id) === 'bought' ? '' : 'bought'); render(host, m, now); }); });
  }
  function go() {
    var host = document.getElementById('buy-body'); if (!host) return; load();
    (window.GOLIB ? GOLIB.loadPrices() : Promise.resolve(null)).then(function (d) { PR = d; }).catch(function () { })
      .then(function () { return fetch('/tickets-external.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { EXT = (j && j.items) || []; }).catch(function () { }); })
      .then(function () { return fetch('/store-log.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }); }).then(function (log) {
      if (!log || !log.items) return; LOG = log;
      var n = 0, t = setInterval(function () {
        var evs = window.GODASH && GODASH.events ? GODASH.events() : null;
        if (evs && evs.length || ++n > 40) { clearInterval(t); var now = Date.now(), model = build(evs || [], now); VIEW = { host: host, m: model }; render(host, model, now); document.getElementById('buy-sec').hidden = false; }
      }, 300);
    }).catch(function () { });
  }
  window.GOBUY = { extEntries: extEntries, untilStr: untilStr };
  document.addEventListener('gofn-state', function () { if (VIEW && LOG) render(VIEW.host, VIEW.m, Date.now()); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
