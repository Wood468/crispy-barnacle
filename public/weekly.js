/* G47IX's weekly "what is on this week" picture, on the home page. public/weekly.json is written by scripts/g47ix-publish.mjs.
   Tap a picture to see it full size; tap again, press Esc or use the close button to go back. */
(function () {
  'use strict';
  var sec = document.getElementById('weekly-sec'), row = document.getElementById('weekly');
  if (!sec || !row) return;
  function safe(u) { return typeof u === 'string' && /^\/infographics\/[\w.\/-]+$/.test(u) ? u : ''; }
  var esc = window.GOLIB.esc;
  function day(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
  var opener = null;
  function close() {
    var box = document.getElementById('weekly-box'); if (!box) return;
    box.remove(); document.removeEventListener('keydown', onKey);
    if (opener && opener.focus) opener.focus();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function open(list, from) {
    var it = list[0]; opener = from; close();
    var box = document.createElement('div');
    box.id = 'weekly-box'; box.className = 'weekly-box'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', it.kind === 'month' ? 'Month at a glance' : 'Week at a glance');
    box.innerHTML = '<div class="weekly-bar"><span>' + esc(it.kind === 'month' ? 'This month' : 'This week') + (it.publishedAt ? ' · ' + esc(day(it.publishedAt)) : '') + '</span>'
      + (/^https:\/\//.test(it.post || '') ? '<a href="' + esc(it.post) + '" target="_blank" rel="noopener">Original post</a>' : '')
      + '<button type="button" class="weekly-x" aria-label="Close">✕</button></div>'
      + '<div class="weekly-scroll">' + list.map(function (x) { return '<img src="' + esc(x.image) + '" alt="' + esc(x.title) + ': Pokémon GO overview">'; }).join('') + '</div>';
    box.addEventListener('click', function (e) { if (e.target === box || e.target.closest('.weekly-x') || e.target.tagName === 'IMG') close(); });
    document.body.appendChild(box); document.addEventListener('keydown', onKey);
    box.querySelector('.weekly-x').focus();
  }
  fetch('/weekly.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    var items = ((j && j.items) || []).filter(function (i) { return safe(i.image); });
    if (!items.length) return;
    var groups = [['week', 'This week', 'Week'], ['month', 'This month', 'Month']].map(function (g) {
      return { kind: g[0], label: g[1], items: items.filter(function (i) { return (i.kind || 'week') === g[0]; }) };
    }).filter(function (g) { return g.items.length; });
    row.innerHTML = groups.map(function (g, n) {
      var top = g.items[0];
      return '<button type="button" class="weekly-card" data-n="' + n + '"><span><b>' + esc(g.label) + '</b><small>' + esc(day(top.publishedAt)) + (g.items.length > 1 ? ' · ' + g.items.length + ' pictures' : '') + '</small></span></button>';
    }).join('');
    row.addEventListener('click', function (e) { var b = e.target.closest('.weekly-card'); if (b) open(groups[+b.getAttribute('data-n')].items, b); });
    sec.hidden = false;
  }).catch(function () { /* the card just stays hidden */ });
})();
