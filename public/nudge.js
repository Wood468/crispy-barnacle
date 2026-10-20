/* A small strip at the top of Now, only when something needs you: infographics waiting for approval, or an
   event where the sources disagree. Each note can be dismissed, and comes back only if something new turns up. */
(function () {
  'use strict';
  var KEY = 'gofn-nudge-off';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function off() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function dismiss(k) { var l = off(); if (l.indexOf(k) < 0) l.push(k); try { localStorage.setItem(KEY, JSON.stringify(l.slice(-60))); } catch (e) { } render(); }
  var notes = [];
  function render() {
    var host = document.getElementById('nudge'); if (!host) return;
    var hidden = off(), show = notes.filter(function (n) { return hidden.indexOf(n.key) < 0; });
    host.hidden = !show.length;
    host.innerHTML = show.map(function (n) {
      return '<div class="nudge-i"><span class="nudge-t">' + esc(n.text) + '</span>' + n.action + '<button type="button" class="nudge-x" data-nudge-x="' + esc(n.key) + '" aria-label="Dismiss">✕</button></div>';
    }).join('');
  }
  function json(u) { return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function init() {
    var now = document.getElementById('tab-now'); if (!now) return;
    if (!document.getElementById('nudge')) { var d = document.createElement('div'); d.id = 'nudge'; d.hidden = true; now.insertBefore(d, now.firstChild); }
    Promise.all([json('/infographic-queue.json?t=' + Math.floor(Date.now() / 600000)), json('/api/ig-decisions'), json('/event-details.json')]).then(function (R) {
      /* The infographic review banner lives in review.js and updates as you decide; a second banner here went stale. */
      var X = window.GODASH, evs = X ? X.events() : [], t = Date.now();
      Object.keys((R[2] && R[2].events) || {}).forEach(function (id) {
        var e = R[2].events[id]; if (!(e.conflicts || []).length) return;
        var nm = String(e.name || '').toLowerCase();
        var ev = evs.filter(function (x) { var n = String(x.name).toLowerCase(); return x.end.getTime() > t && (n.indexOf(nm) > -1 || nm.indexOf(n) > -1); })[0]; if (!ev) return;
        notes.push({ key: 'cf:' + id + ':' + e.conflicts.length, text: 'Sources disagree about ' + ev.name + ' (' + e.conflicts.map(function (c) { return c.field; }).filter(function (f, i, a) { return a.indexOf(f) === i; }).join(', ') + ').', action: '<button type="button" class="nudge-go" data-open="' + esc(ev.id) + '">See</button>' });
      });
      render();
    });
  }
  document.addEventListener('click', function (e) {
    var x = e.target.closest && e.target.closest('[data-nudge-x]'); if (x) return dismiss(x.getAttribute('data-nudge-x'));
    if (e.target.closest && e.target.closest('[data-nudge-menu]')) { var m = document.getElementById('hmenu'); if (m) m.click(); }
  });
  if (window.GODASH) init(); else document.addEventListener('DOMContentLoaded', init);
})();
