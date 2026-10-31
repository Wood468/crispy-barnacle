/* "New since your last visit" on the first page: events that were not in the list the last time you dismissed this note,
   plus what changed in the Leaks tab (now in the game, moved up, new in the game files, datamine posts).
   What you have seen lives only in this browser (localStorage). The first visit just records the events; leaks show the last 7 days. */
(function () {
  'use strict';
  var KEY = 'gofn-seen-events', LKEY = 'gofn-seen-leaks', SKEY = 'gofn-seen-event-snapshots', DAY = 864e5, box = null;
  function load() { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); return j && Array.isArray(j.ids) ? j : null; } catch (e) { return null; } }
  function save(ids) { try { localStorage.setItem(KEY, JSON.stringify({ ids: ids, at: Date.now() })); } catch (e) { } }
  function loadLeaks() { try { var j = JSON.parse(localStorage.getItem(LKEY) || 'null'); return j && +j.at ? j : null; } catch (e) { return null; } }
  function saveLeaks() { try { localStorage.setItem(LKEY, JSON.stringify({ at: Date.now() })); } catch (e) { } }
  var esc = window.GOLIB.esc;
  function relevant(e) { return e && e.id && !/^cur:(spot|rh)-/.test(e.id) && e.kind !== 'rotation'; }
  function eventValue(v) {
    if (v == null) return '';
    var d = v instanceof Date ? v : new Date(v);
    return !isNaN(+d) ? d.toISOString() : String(v);
  }
  function eventSnapshot(e) {
    return JSON.stringify({
      name: e.name || e.t || e.title || '',
      start: eventValue(e.start || e.s),
      end: eventValue(e.end || e.e),
      place: e.place || e.location || '',
      bonuses: e.p || e.bonuses || [],
      details: e.description || e.details || ''
    });
  }
  function loadSnapshots() {
    try { var j = JSON.parse(localStorage.getItem(SKEY) || 'null'); return j && typeof j === 'object' ? j : null; } catch (e) { return null; }
  }
  function saveSnapshots(snapshot) { try { localStorage.setItem(SKEY, JSON.stringify(snapshot || {})); } catch (e) { } }
  function safe(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }

  // What changed in the Leaks data since `since` (ms). R = /api/unreleased, M = /api/datamine, N = /datamine-news.json (any may be null).
  function leakGroups(R, M, N, since) {
    var ch = ((R && R.changes) || []).filter(function (c) { return c.at >= since; });
    var rel = ch.filter(function (c) { return c.to === 'Released'; }), up = ch.filter(function (c) { return c.to !== 'Released'; });
    var finds = ((M && M.items) || []).filter(function (x) { return x.seen >= since; });
    var posts = [];
    ((M && M.posts) || []).forEach(function (p) { if (p.date && p.date >= since) posts.push({ t: p.title, l: p.link, d: p.date }); });
    ((N && N.items) || []).forEach(function (p) { var d = Date.parse(p.date); if (d >= since) posts.push({ t: p.title, l: p.link, d: d }); });
    posts.sort(function (a, b) { return b.d - a.d; });
    var groups = [];
    if (rel.length) groups.push({ label: 'Now in Pokémon GO', items: rel.map(function (c) { return { t: c.n }; }) });
    if (up.length) groups.push({ label: 'Moved up', items: up.map(function (c) { return { t: c.n + ' (' + c.to + ')' }; }) });
    if (finds.length) groups.push({ label: 'New in the game files', items: finds.map(function (x) { return { t: x.name }; }) });
    if (posts.length) groups.push({ label: 'Datamine posts', items: posts.slice(0, 4).map(function (p) { return { t: p.t, l: safe(p.l) }; }) });
    return groups;
  }

  var HKEY = 'gofn-whatsnew-history';
  function loadHistory() { try { var h = JSON.parse(localStorage.getItem(HKEY) || 'null'); return h && h.html ? h : null; } catch (e) { return null; } }
  function saveHistory(html, total) { try { localStorage.setItem(HKEY, JSON.stringify({ html: html, total: total, at: Date.now() })); } catch (e) { } }
  var st = { evDone: false, ids: [], fresh: [], changed: [], snapshot: {}, leaks: null };
  function buildHtml() {
    var nLeaks = st.leaks.reduce(function (n, g) { return n + g.items.length; }, 0), total = st.fresh.length + st.changed.length + nLeaks;
    var h = '<details class="wn-det" open><summary><b>New since your last visit</b> <span class="wn-n">' + total + '</span></summary>';
    if (st.fresh.length) h += '<div class="wn-list"><span class="wn-h">New events</span>' + st.fresh.slice(0, 12).map(function (e) { return '<a href="#event=' + encodeURIComponent(e.id) + '">' + esc(e.name || e.id) + '</a>'; }).join('') + (st.fresh.length > 12 ? '<span>+' + (st.fresh.length - 12) + ' more</span>' : '') + '</div>';
    if (st.changed.length) h += '<div class="wn-list"><span class="wn-h">Event changes</span>' + st.changed.slice(0, 12).map(function (x) { return '<a href="#event=' + encodeURIComponent(x.id) + '">' + esc(x.name) + ' · details changed</a>'; }).join('') + (st.changed.length > 12 ? '<span>+' + (st.changed.length - 12) + ' more</span>' : '') + '</div>';
    st.leaks.forEach(function (g) {
      h += '<div class="wn-list"><span class="wn-h">' + esc(g.label) + '</span>' + g.items.slice(0, 8).map(function (i) { return i.l ? '<a href="' + esc(i.l) + '" target="_blank" rel="noopener noreferrer">' + esc(i.t) + '</a>' : '<a href="#leaks" class="wn-leaks">' + esc(i.t) + '</a>'; }).join('') + (g.items.length > 8 ? '<span>+' + (g.items.length - 8) + ' more</span>' : '') + '</div>';
    });
    return h + '</details>';
  }
  function mount() {
    var anchor = document.getElementById('fresh-line'); if (!anchor || !anchor.parentNode) return;
    if (!box) { box = document.createElement('div'); box.className = 'whatsnew'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Recent updates'); anchor.parentNode.insertBefore(box, anchor.nextSibling); }
    var total = st.fresh.length + st.changed.length + st.leaks.reduce(function (n, g) { return n + g.items.length; }, 0);
    if (!total) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = buildHtml() + '<div class="wn-actions"><button type="button" class="pill wn-ok">Got it</button></div>';
    box.hidden = false;
    box.querySelector('.wn-ok').addEventListener('click', function () {
      save(st.ids); saveLeaks(); saveSnapshots(st.snapshot); saveHistory(buildHtml(), total);
      box.hidden = true; box.innerHTML = '';
    });
    Array.prototype.forEach.call(box.querySelectorAll('.wn-leaks'), function (a) { a.addEventListener('click', function (e) { e.preventDefault(); var b = document.getElementById('menu-leaks'); if (b) b.click(); }); });
  }
  function render() {
    if (!st.evDone || st.leaks === null) return;
    var total = st.fresh.length + st.changed.length + st.leaks.reduce(function (n, g) { return n + g.items.length; }, 0);
    if (!total) { if (box) { box.hidden = true; box.innerHTML = ''; } save(st.ids); saveLeaks(); return; }
    mount();
  }
  function run(list) {
    var current = {};
    list.filter(relevant).forEach(function (e) { current[e.id] = eventSnapshot(e); });
    st.snapshot = current;
    st.ids = list.filter(relevant).map(function (e) { return e.id; });
    var seen = load(), previous = loadSnapshots();
    if (!seen) { save(st.ids); saveSnapshots(current); }
    else {
      var had = {}; seen.ids.forEach(function (i) { had[i] = 1; });
      var now = Date.now();
      st.fresh = list.filter(function (e) { return relevant(e) && !had[e.id] && (!e.end || +new Date(e.end) > now); });
      if (!previous) saveSnapshots(current); // Upgrade older browser state without reporting every existing event as changed.
      else st.changed = list.filter(function (e) { return relevant(e) && previous[e.id] && previous[e.id] !== current[e.id] && (!e.end || +new Date(e.end) > now); }).map(function (e) { return { id: e.id, name: e.name || e.t || e.title || e.id }; });
    }
    st.evDone = true; render();
  }
  function getJson(u) { return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function loadLeakChanges() {
    var last = loadLeaks(), since = Math.max(last ? last.at : 0, Date.now() - 14 * DAY);
    if (!last) since = Date.now() - 7 * DAY;
    return Promise.all([getJson('/api/unreleased'), getJson('/api/datamine'), getJson('/datamine-news.json')]).then(function (r) { st.leaks = leakGroups(r[0], r[1], r[2], since); render(); }).catch(function () { st.leaks = []; render(); });
  }
  window.GOWN = { leakGroups: leakGroups, reopen: function () { mount(); var d = box && box.querySelector('.wn-det'); if (d) d.open = true; } };
  if (typeof fetch === 'function') loadLeakChanges(); else st.leaks = [];
  var tries = 0;
  (function wait() {
    var X = window.GODASH, list = X && X.events ? X.events() : [];
    if (list && list.length >= 10) { try { run(list); } catch (e) { st.evDone = true; render(); } return; }
    if (++tries < 40) setTimeout(wait, 500); else { st.evDone = true; render(); }
  })();
})();
