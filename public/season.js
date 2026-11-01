/* Season and GO Pass banners above "For you". Tap one to open details; the full Leek Duck poster loads there on demand. */
(function () {
  'use strict';
  var items = [], evs = [], deadlines = [];
  var esc = window.GOLIB.esc;
  function render() {
    var tab = document.getElementById('tab-now'), sec = document.getElementById('foryou-sec');
    if (!tab || !sec) return;
    var host = document.getElementById('seasonbar');
    if (!host) { host = document.createElement('div'); host.id = 'seasonbar'; host.className = 'seasonbar'; tab.insertBefore(host, document.getElementById('weekahead') || sec); }
    var now = Date.now(), live = items.filter(function (i) { return new Date(i.s) <= now && now < new Date(i.e); });
    host.hidden = !live.length;
    var html = live.map(function (i) {
      var left = Math.max(0, Math.ceil((new Date(i.e) - now) / 864e5)), tot = new Date(i.e) - new Date(i.s), pct = Math.min(100, Math.max(0, Math.round((now - new Date(i.s)) / tot * 100)));
      var wk = i.label === 'GO Pass' ? 'Week ' + Math.min(Math.ceil((now - new Date(i.s)) / 6048e5), Math.ceil(tot / 6048e5)) + ' of ' + Math.ceil(tot / 6048e5) : pct + '% through';
      return '<button type="button" class="ssn-card" data-open="' + esc(i.id) + '" title="Open details to view the full poster"><span class="ssn-t"><small>' + esc(i.label) + '</small><b>' + esc(i.name) + '</b><em><strong class="ssn-d">' + left + '</strong> ' + (left === 1 ? 'day left' : 'days left') + ' · ' + wk + '</em><i class="ssn-bar"><u style="width:' + pct + '%"></u></i></span></button>';
    }).join('');
    if (host.dataset.h !== html) { host.dataset.h = html; host.innerHTML = html; }
  }
  var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function strip() {
    var tab = document.getElementById('tab-now'), sec = document.getElementById('foryou-sec');
    if (!tab || !sec || !window.GODASH || !GODASH.events) return;
    var host = document.getElementById('weekahead');
    if (!host) { host = document.createElement('section'); host.id = 'weekahead'; host.className = 'weekahead'; tab.insertBefore(host, sec); }
    var evs = GODASH.events().filter(function (e) { return e.start && e.end && (e.end - e.start) < 10 * 864e5 && !(GODASH.kindHidden ? GODASH.kindHidden(e.kind) : e.kind === 'pvp') && !(GODASH.kindHidden && GODASH.kindHidden('pvp') && /(great|ultra|master) league|battle league|\bcup\b/i.test(e.name || '')); }), t0 = new Date(); t0.setHours(0, 0, 0, 0);
    var cols = [];
    for (var d = 0; d < 7; d++) {
      var a = new Date(t0.getTime() + d * 864e5), b = new Date(a.getTime() + 864e5);
      var hit = evs.filter(function (e) { return e.start < b && e.end > a; }).sort(function (x, y) { return x.start - y.start; });
      cols.push('<div class="wk-d' + (d === 0 ? ' today' : '') + '"><h4>' + (d === 0 ? 'Today' : DAY[a.getDay()] + ' ' + a.getDate()) + '</h4>' + (hit.length ? hit.slice(0, 4).map(function (e) { return '<button type="button" class="wk-e" data-open="' + esc(e.id) + '">' + esc(e.name) + '</button>'; }).join('') + (hit.length > 4 ? '<small>+' + (hit.length - 4) + ' more</small>' : '') : '<small class="none">Nothing</small>') + '</div>');
    }
    var wh = '<h2 class="sec2">Week ahead</h2><div class="wk-row">' + cols.join('') + '</div>';
    if (host.dataset.h !== wh) { host.dataset.h = wh; host.innerHTML = wh; }
  }
  /* The live feed can arrive after the page loads: keep trying for a while, so the strip never stays on a first "Nothing". */
  window.addEventListener('load', function () { var n = 0, h = setInterval(function () { try { strip(); } catch (e) { } if (++n > 40) clearInterval(h); }, 750); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) try { strip(); } catch (e) { } });
  document.addEventListener('gofn-state', function () { try { strip(); } catch (e) { } });
  fetch('/season.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j) return; items = j.items || [];
    deadlines = (j.deadlines || []).map(function (d) {
      if (!d || typeof d !== 'object') return null;
      var start = new Date(d.s), end = new Date(d.e);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start ||
          !d.name || !d.title || !d.action || !d.source || String(d.url || '').indexOf('https://') !== 0) return null;
      return Object.assign({}, d, { start: start, end: end });
    }).filter(Boolean);
    var tries = 0;
    (function mk() {
      if (!window.GODASH || !GODASH.mkEvent) { if (tries++ < 40) return setTimeout(mk, 150); return; }
      evs = items.map(function (i) { return GODASH.mkEvent({ id: i.id, name: i.name, kind: 'event', s: i.s, e: i.e, tags: [], status: 'official_confirmed', source: 'Leek Duck', link: i.url, notes: [], featured: [], img: i.img, season: i });  }).filter(Boolean);
      window.GOSEASON = { events: function () { return evs; }, deadlines: function () { return deadlines; } };
      document.dispatchEvent(new Event('gofn-season-ready'));
      render();
    })();
  }).catch(function () { });
  document.addEventListener('gofn-state', function () { try { render(); } catch (e) { } });
})();
