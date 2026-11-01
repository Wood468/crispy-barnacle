/* "New since your last visit" on Today (never on the other tabs): events that were not in the list the last time you dismissed this note,
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
  function buildBody() {
    var h = '';
    function row(href, label, ext) { return '<a href="' + href + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + label + '</a>'; }
    function more(n, shown) { return n > shown ? '<span class="wn-more">+' + (n - shown) + ' more</span>' : ''; }
    if (st.fresh.length) h += '<div class="wn-list"><span class="wn-h">New events</span>' + st.fresh.slice(0, 12).map(function (e) { return row('#event=' + encodeURIComponent(e.id), esc(e.name || e.id)); }).join('') + more(st.fresh.length, 12) + '</div>';
    if (st.changed.length) h += '<div class="wn-list"><span class="wn-h">Event changes</span>' + st.changed.slice(0, 12).map(function (x) { return row('#event=' + encodeURIComponent(x.id), esc(x.name) + ' · details changed'); }).join('') + more(st.changed.length, 12) + '</div>';
    st.leaks.forEach(function (g) {
      h += '<div class="wn-list"><span class="wn-h">' + esc(g.label) + '</span>' + g.items.slice(0, 8).map(function (i) { return i.l ? row(esc(i.l), esc(i.t), true) : '<a href="#leaks" class="wn-leaks">' + esc(i.t) + '</a>'; }).join('') + more(g.items.length, 8) + '</div>';
    });
    return h;
  }
  /* The saved history keeps the same markup the old open note used, so the stored copy stays readable. */
  function buildHtml() {
    var nLeaks = st.leaks.reduce(function (n, g) { return n + g.items.length; }, 0), total = st.fresh.length + st.changed.length + nLeaks;
    return '<details class="wn-det" open><summary><b>New since your last visit</b> <span class="wn-n">' + total + '</span></summary>' + buildBody() + '</details>';
  }
  /* Today only: one 48px row ("N new · View") under the daily brief, with the full list one tap away. */
  function setOpen(open) {
    if (!box) return;
    var t = box.querySelector('.wn-toggle'), b = box.querySelector('.wn-body');
    if (t) t.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (b) b.hidden = !open;
    box.classList.toggle('is-open', !!open);
  }
  function mount() {
    var anchor = document.getElementById('day-brief'); if (!anchor || !anchor.parentNode) return;
    if (!box) { box = document.createElement('div'); box.className = 'whatsnew'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Recent updates'); anchor.parentNode.insertBefore(box, anchor.nextSibling); }
    var total = st.fresh.length + st.changed.length + st.leaks.reduce(function (n, g) { return n + g.items.length; }, 0);
    if (!total) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = '<div class="wn-row"><button type="button" class="wn-toggle" aria-expanded="false" aria-controls="wn-body"><span class="wn-n">' + total + ' new</span><span class="wn-sub">since your last visit</span><span class="wn-view" aria-hidden="true">View</span></button>' +
      '<button type="button" class="wn-ok" aria-label="Mark updates as seen">Got it</button></div><div class="wn-body" id="wn-body" hidden>' + buildBody() + '</div>';
    box.hidden = false;
    box.querySelector('.wn-toggle').addEventListener('click', function () { setOpen(this.getAttribute('aria-expanded') !== 'true'); });
    box.querySelector('.wn-ok').addEventListener('click', function () {
      save(st.ids); saveLeaks(); saveSnapshots(st.snapshot); saveHistory(buildHtml(), total);
      box.hidden = true; box.innerHTML = '';
      var brief = document.getElementById('day-brief'); if (brief && brief.focus) brief.focus({ preventScroll: true });
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
  window.GOWN = { leakGroups: leakGroups, reopen: function () { mount(); setOpen(true); } };
  if (typeof fetch === 'function') loadLeakChanges(); else st.leaks = [];
  var tries = 0;
  (function wait() {
    var X = window.GODASH, list = X && X.events ? X.events() : [];
    if (list && list.length >= 10) { try { run(list); } catch (e) { st.evDone = true; render(); } return; }
    if (++tries < 40) setTimeout(wait, 500); else { st.evDone = true; render(); }
  })();
})();
