/* "New since your last visit" on the first page: events that were not in the list the last time you dismissed this note,
   plus what changed in the Leaks tab (now in the game, moved up, new in the game files, datamine posts).
   What you have seen lives only in this browser (localStorage). The first visit just records the events; leaks show the last 7 days. */
(function () {
  'use strict';
  var KEY = 'gofn-seen-events', LKEY = 'gofn-seen-leaks', DAY = 864e5, box = null;
  function load() { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); return j && Array.isArray(j.ids) ? j : null; } catch (e) { return null; } }
  function save(ids) { try { localStorage.setItem(KEY, JSON.stringify({ ids: ids, at: Date.now() })); } catch (e) { } }
  function loadLeaks() { try { var j = JSON.parse(localStorage.getItem(LKEY) || 'null'); return j && +j.at ? j : null; } catch (e) { return null; } }
  function saveLeaks() { try { localStorage.setItem(LKEY, JSON.stringify({ at: Date.now() })); } catch (e) { } }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function relevant(e) { return e && e.id && !/^cur:(spot|rh)-/.test(e.id) && e.kind !== 'rotation'; }
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
  var st = { evDone: false, ids: [], fresh: [], leaks: null };
  function buildHtml() {
    var nLeaks = st.leaks.reduce(function (n, g) { return n + g.items.length; }, 0), total = st.fresh.length + nLeaks;
    var h = '<details class="wn-det" open><summary><b>New since your last visit</b> <span class="wn-n">' + total + '</span></summary>';
    if (st.fresh.length) h += '<div class="wn-list"><span class="wn-h">New events</span>' + st.fresh.slice(0, 12).map(function (e) { return '<a href="#event=' + encodeURIComponent(e.id) + '">' + esc(e.name || e.id) + '</a>'; }).join('') + (st.fresh.length > 12 ? '<span>+' + (st.fresh.length - 12) + ' more</span>' : '') + '</div>';
    st.leaks.forEach(function (g) {
      h += '<div class="wn-list"><span class="wn-h">' + esc(g.label) + '</span>' + g.items.slice(0, 8).map(function (i) { return i.l ? '<a href="' + esc(i.l) + '" target="_blank" rel="noopener noreferrer">' + esc(i.t) + '</a>' : '<a href="#leaks" class="wn-leaks">' + esc(i.t) + '</a>'; }).join('') + (g.items.length > 8 ? '<span>+' + (g.items.length - 8) + ' more</span>' : '') + '</div>';
    });
    return h + '</details>';
  }
  function mount() {
    var anchor = document.getElementById('fresh-line'); if (!anchor || !anchor.parentNode) return;
    if (!box) { box = document.createElement('div'); box.className = 'whatsnew'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Recent updates'); anchor.parentNode.insertBefore(box, anchor.nextSibling); }
    var history = loadHistory();
    var total = st.fresh.length + st.leaks.reduce(function (n, g) { return n + g.items.length; }, 0);
    var body = total ? buildHtml() : (history ? history.html : '');
    if (!body) { box.hidden = true; return; }
    box.innerHTML = body + '<div class="wn-actions"><button type="button" class="pill wn-ok">Got it</button>' + (history ? '<button type="button" class="pill wn-reopen">View recent updates</button>' : '') + '</div>';
    box.hidden = false;
    var details = box.querySelector('.wn-det');
    if (history && !total && details) details.open = true;
    box.querySelector('.wn-ok').addEventListener('click', function () {
      save(st.ids); saveLeaks();
      var current = buildHtml();
      saveHistory(current, total);
      box.hidden = true;
    });
    var reopen = box.querySelector('.wn-reopen');
    if (reopen) reopen.addEventListener('click', function () {
      var h = loadHistory(); if (!h) return;
      var d = box.querySelector('.wn-det'); if (d) d.open = true;
      reopen.textContent = 'Showing recent updates';
    });
    Array.prototype.forEach.call(box.querySelectorAll('.wn-leaks'), function (a) { a.addEventListener('click', function (e) { e.preventDefault(); var b = document.getElementById('menu-leaks'); if (b) b.click(); }); });
  }
  function render() {
    if (!st.evDone || st.leaks === null) return;
    var total = st.fresh.length + st.leaks.reduce(function (n, g) { return n + g.items.length; }, 0);
    if (!total && !loadHistory()) { save(st.ids); saveLeaks(); return; }
    mount();
  }
  function run(list) {
    st.ids = list.filter(relevant).map(function (e) { return e.id; });
    var seen = load();
    if (!seen) save(st.ids);
    else {
      var had = {}; seen.ids.forEach(function (i) { had[i] = 1; });
      var now = Date.now(); st.fresh = list.filter(function (e) { return relevant(e) && !had[e.id] && (!e.end || +new Date(e.end) > now); });
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
