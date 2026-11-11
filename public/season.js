/* Season and GO Pass banners above "For you". Tap one to open details; the full Leek Duck poster loads there on demand. */
(function () {
  'use strict';
  var items = [], evs = [], deadlines = [];
  var esc = window.GOLIB.esc;
  var CLOCK=window.GOEventClock;
  function pd(value){return CLOCK.parseDate(value);}
  function seasonThumbnailPath(id, image) {
    var slug = String(id || '').replace(/^season:/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    var value = String(image || '');
    if (!slug || !value) return '';
    var hash = 2166136261;
    for (var n = 0; n < value.length; n++) { hash ^= value.charCodeAt(n); hash = Math.imul(hash, 16777619); }
    return '/season-thumbs/season-' + slug + '-' + (hash >>> 0).toString(16).padStart(8, '0') + '.webp';
  }
  function render() {
    var tab = document.getElementById('tab-now'), sec = document.getElementById('foryou-sec');
    if (!tab || !sec) return;
    var host = document.getElementById('seasonbar');
    if (!host) { host = document.createElement('div'); host.id = 'seasonbar'; host.className = 'seasonbar'; tab.insertBefore(host, document.getElementById('weekahead') || sec); }
    var now = Date.now(), live = items.filter(function (i) { return pd(i.s) <= now && now < pd(i.e); });
    host.hidden = !live.length;
    var html = live.map(function (i) {
      var left = Math.max(0, Math.ceil((pd(i.e) - now) / 864e5)), tot = pd(i.e) - pd(i.s), pct = Math.min(100, Math.max(0, Math.round((now - pd(i.s)) / tot * 100)));
      var wk = i.label === 'GO Pass' ? 'Week ' + Math.min(Math.ceil((now - pd(i.s)) / 6048e5), Math.ceil(tot / 6048e5)) + ' of ' + Math.ceil(tot / 6048e5) : pct + '% through';
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
    var evs = GODASH.events().filter(function (e) { return e.start && e.end && (e.end - e.start) < 10 * 864e5 && !(GODASH.kindHidden ? GODASH.kindHidden(e.kind) : e.kind === 'pvp') && !(GODASH.kindHidden && GODASH.kindHidden('pvp') && /(great|ultra|master) league|battle league|\bcup\b/i.test(e.name || '')); }), t0 = CLOCK.startDay(new Date());
    var cols = [];
    for (var d = 0; d < 7; d++) {
      var a = CLOCK.addDays(t0,d), b = CLOCK.addDays(a,1);
      var hit = evs.filter(function (e) { return e.start < b && e.end > a; }).sort(function (x, y) { return x.start - y.start; });
      cols.push('<div class="wk-d' + (d === 0 ? ' today' : '') + '"><h4>' + (d === 0 ? 'Today' : DAY[CLOCK.fields(a).weekday] + ' ' + CLOCK.fields(a).day) + '</h4>' + (hit.length ? hit.slice(0, 4).map(function (e) { return '<button type="button" class="wk-e" data-open="' + esc(e.id) + '">' + esc(e.name) + '</button>'; }).join('') + (hit.length > 4 ? '<small>+' + (hit.length - 4) + ' more</small>' : '') : '<small class="none">Nothing</small>') + '</div>');
    }
    var wh = '<h2 class="sec2">Week ahead</h2><div class="wk-row">' + cols.join('') + '</div>';
    if (host.dataset.h !== wh) { host.dataset.h = wh; host.innerHTML = wh; }
  }
  /* The live feed can arrive after the page loads: keep trying for a while, so the strip never stays on a first "Nothing". */
  window.addEventListener('load', function () { var n = 0, h = setInterval(function () { try { strip(); } catch (e) { } if (++n > 40) clearInterval(h); }, 750); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) try { strip(); } catch (e) { } });
  document.addEventListener('gofn-state', function () { try { strip(); } catch (e) { } });
  function json(u) { return window.GOLIB.jsonOrNull(u); }
  Promise.all([json('/season.json'), json('/event-moves.json')]).then(function (loaded) {
    var j = loaded[0], moveData = loaded[1];
    if (!j) return; items = j.items || [];
    var moveDeadlines = (moveData && Array.isArray(moveData.moves) ? moveData.moves : []).map(function (m) {
      if (!m || !Array.isArray(m.sources) || !m.id || !m.move || !m.eventName) return null;
      var source = m.sources.filter(function (s) {
        return s && s.trust === 'official' && s.name && String(s.url || '').indexOf('https://') === 0;
      })[0];
      if (!source) return null;
      var start = String(m.windowStart || ''), end = String(m.windowEnd || '');
      var startDate = pd(start), endDate = pd(end);
      if (!start || !end || !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) return null;
      var action = m.acquisition === 'EVOLVE' ? 'evolve by' : m.acquisition === 'CATCH' ? 'catch by' : '';
      if (!action) return null;
      var moveKind = m.moveKind === 'fast' ? 'Fast Attack' : m.moveKind === 'charged' ? 'Charged Attack' : '';
      var qualifier = m.acquisition === 'EVOLVE'
        ? ['Evolve', m.pokemon, m.evolutionTarget ? '→ ' + m.evolutionTarget : '', 'for', m.move, moveKind ? '(' + moveKind + ')' : ''].filter(Boolean).join(' ')
        : ['Catch', m.pokemon || 'a Pokémon', 'for', m.move, moveKind ? '(' + moveKind + ')' : ''].filter(Boolean).join(' ');
      return {
        id: 'exclusive-move:' + m.id, name: m.eventName, title: 'Exclusive move window ends',
        action: action, qualifier: qualifier, s: start, e: end,
        source: source.name, url: source.url, sourceTrust: source.trust
      };
    }).filter(Boolean);
    deadlines = (j.deadlines || []).concat(moveDeadlines).map(function (d) {
      if (!d || typeof d !== 'object') return null;
      var start = pd(d.s), end = pd(d.e);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start ||
          !d.name || !d.title || !d.action || !d.source || String(d.url || '').indexOf('https://') !== 0) return null;
      return Object.assign({}, d, { start: start, end: end });
    }).filter(Boolean);
    var tries = 0;
    (function mk() {
      if (!window.GODASH || !GODASH.mkEvent) { if (tries++ < 40) return setTimeout(mk, 150); return; }
      evs = items.map(function (i) {
        var season = Object.assign({}, i, { thumbnail: seasonThumbnailPath(i.id, i.img) });
        return GODASH.mkEvent({ id: i.id, name: i.name, kind: 'event', s: i.s, e: i.e, tags: [], status: 'official_confirmed', source: /^https:\/\/(?:www\.)?pokemongo\.com\//i.test(i.url || '') ? 'Pokémon GO (official)' : 'Leek Duck', link: i.url, notes: i.notes || [], featured: [], img: i.img, season: season });
      }).filter(Boolean);
      window.GOSEASON = { events: function () { return evs; }, deadlines: function () { return deadlines; } };
      document.dispatchEvent(new Event('gofn-season-ready'));
      render();
    })();
  }).catch(function () { });
  document.addEventListener('gofn-state', function () { try { render(); } catch (e) { } });
})();
