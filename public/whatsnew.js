/* "New since your last visit": events that were not in the list the last time you dismissed this note.
   The list of event ids you have seen lives only in this browser (localStorage); the first visit just records it. */
(function () {
  'use strict';
  var KEY = 'gofn-seen-events', box = null;
  function load() { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); return j && Array.isArray(j.ids) ? j : null; } catch (e) { return null; } }
  function save(ids) { try { localStorage.setItem(KEY, JSON.stringify({ ids: ids, at: Date.now() })); } catch (e) { } }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function relevant(e) { return e && e.id && !/^cur:(spot|rh)-/.test(e.id) && e.kind !== 'rotation'; }
  function run(list) {
    var ids = list.filter(relevant).map(function (e) { return e.id; }), seen = load();
    if (!seen) { save(ids); return; }
    var had = {}; seen.ids.forEach(function (i) { had[i] = 1; });
    var now = Date.now(), fresh = list.filter(function (e) { return relevant(e) && !had[e.id] && (!e.end || +new Date(e.end) > now); });
    if (!fresh.length) { save(ids); return; }
    var anchor = document.getElementById('fresh-line'); if (!anchor || !anchor.parentNode) return;
    if (!box) { box = document.createElement('div'); box.className = 'whatsnew'; box.setAttribute('role', 'status'); anchor.parentNode.insertBefore(box, anchor.nextSibling); }
    box.innerHTML = '<b>New since your last visit</b> <span class="wn-n">' + fresh.length + '</span><div class="wn-list">' + fresh.slice(0, 8).map(function (e) { return '<a href="#event=' + encodeURIComponent(e.id) + '">' + esc(e.name || e.id) + '</a>'; }).join('') + (fresh.length > 8 ? '<span>+' + (fresh.length - 8) + ' more</span>' : '') + '</div><button type="button" class="pill wn-ok">Got it</button>';
    box.hidden = false;
    box.querySelector('.wn-ok').addEventListener('click', function () { save(ids); box.hidden = true; });
  }
  var tries = 0;
  (function wait() {
    var X = window.GODASH, list = X && X.events ? X.events() : [];
    if (list && list.length >= 10) { try { run(list); } catch (e) { } return; }
    if (++tries < 40) setTimeout(wait, 500);
  })();
})();
