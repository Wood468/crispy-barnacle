/* Infographic review: pictures the matcher was not sure about wait here. One tap links a picture to an event (add as many events as you like), unlinks one, or discards it.
   Decisions are saved to the site (sync PIN needed to write) and the next scheduled run attaches approved pictures to their events. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.GOLIB.esc;
  var items = [], decided = {}, decs = {}, msg = '', shown = 10, loadToken = 0, loadedForOwner = false;
  function pin() { try { return localStorage.getItem('gofn-pin') || ''; } catch (e) { return ''; } }
  function isOwner() { return document.documentElement.getAttribute('data-role') === 'owner'; }
  function hideOwnerUi() {
    loadToken++; loadedForOwner = false; items = []; decided = {}; decs = {}; msg = '';
    var a = $('hireview'); if (a) a.hidden = true;
    var c = $('igcount'); if (c) c.hidden = true;
    var b = $('igbanner'); if (b) b.remove();
    var d = $('igdiscord'); if (d) d.remove();
    var h = $('igreview'); if (h) h.remove();
    var menu = $('hmenu'); if (menu) menu.classList.remove('has-new');
    var saved = document.querySelector('nav.tabs button[data-tab="saved"]'); if (saved) saved.classList.remove('has-new');
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  function eventOptions() {
    var X = window.GODASH; if (!X) return '';
    var t = Date.now(), list = X.events().concat(X.raidSlots ? X.raidSlots() : [], X.worldEvents ? X.worldEvents() : [], X.regionalEvents ? X.regionalEvents() : []).filter(function (e) { return e.end.getTime() > t && e.start.getTime() < t + 200 * 864e5; });
    /* The same event held in two lists (our own card and the world list) is offered once: the shared rule in dedupe.js, first copy wins. */
    if (window.GODEDUPE) {
      var asEv = function (e) { return { id: e.id, name: e.name, place: e.place || '', start: +e.start, end: +e.end }; }, gone = {};
      GODEDUPE.groups(list.map(asEv), null).forEach(function (g) { g.dupes.forEach(function (d) { gone[d.event.id] = 1; }); });
      list = list.filter(function (e) { return !gone[e.id]; });
    }
    list.sort(function (a, b) { return a.start - b.start; });
    var fmt = function (d) { return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); };
    /* A tour or series with several stops ("Pokémon RUN 30: Taichung", "Pokémon RUN 30: Kaohsiung") gets one "All" choice, for a graphic that covers every stop. */
    var by = {}; list.forEach(function (e) { var m = /^(.{4,}?):\s/.exec(e.name); if (m) (by[m[1]] = by[m[1]] || []).push(e); });
    var all = Object.keys(by).filter(function (k) { return by[k].length > 1; }).map(function (k) {
      return '<option value="series:' + esc(k) + '" data-ids="' + esc(by[k].map(function (e) { return e.id; }).join(',')) + '" data-t="' + esc(by[k].map(function (e) { return e.name; }).join(' | ')) + '">★ All ' + esc(k) + ' (' + by[k].length + ' stops)</option>';
    }).join('');
    return all + list.map(function (e) { return '<option value="' + esc(e.id) + '" data-t="' + esc(e.name) + '">' + esc(e.name) + ' · ' + fmt(e.start) + '</option>'; }).join('');
  }
  /* The chosen option as a list of events: one event, or every stop of a series. */
  function picks(o) {
    var ids = o.getAttribute('data-ids'); if (!ids) return [{ id: o.value, title: o.getAttribute('data-t') }];
    var ts = o.getAttribute('data-t').split(' | '); return ids.split(',').map(function (x, i) { return { id: x, title: ts[i] || x }; });
  }
  function linkedOf(id) {
    var d = decs[id]; if (!d || d.status !== 'approved' || !d.eventId) return [];
    var ids = String(d.eventId).split(','), ts = String(d.eventTitle || '').split(' | ');
    return ids.map(function (x, i) { return { id: x, title: ts[i] || x }; });
  }
  function linkedCard(it) {
    var L = linkedOf(it.id);
    return '<article class="igr" data-id="' + esc(it.id) + '">'
      + '<a class="igr-img" href="' + esc(it.image) + '" target="_blank" rel="noopener"><img src="' + esc(it.image) + '" alt="' + esc(it.title || 'Infographic') + '" loading="lazy"></a>'
      + '<div class="igr-b"><b>' + esc(it.title || 'Untitled graphic') + '</b>'
      + '<div class="igr-g">' + L.map(function (l, n) { return '<button type="button" class="pill all" data-ig-unlink="' + n + '" aria-label="Unlink from ' + esc(l.title) + '">' + esc(l.title) + ' ✕</button>'; }).join('') + '</div>'
      + '<div class="igr-o"><select aria-label="Link to another event"><option value="">Also link to…</option>' + eventOptions() + '</select><button type="button" class="pill" data-ig-add>Add</button><button type="button" class="pill" data-ig-no>Discard</button></div>'
      + '<div class="igr-o"><button type="button" class="pill" data-ig-ov="week">📅 This week\'s picture</button><button type="button" class="pill" data-ig-ov="month">🗓 Month overview</button></div>'
      + '</div></article>';
  }
  function card(it) {
    var live = {}, liveN = {}; if (window.GODASH) GODASH.events().concat(GODASH.raidSlots ? GODASH.raidSlots() : [], GODASH.worldEvents ? GODASH.worldEvents() : [], GODASH.regionalEvents ? GODASH.regionalEvents() : []).forEach(function (e) { if (e.end.getTime() > Date.now()) { live[e.id] = 1; live[String(e.id).replace(/^[a-z]+:/, '')] = 1; liveN[String(e.name).toLowerCase()] = 1; } });
    /* Events that have already finished are not offered. */
    var g = (it.guesses || []).filter(function (x) { return x.eventId && (!window.GODASH || live[x.eventId] || live[String(x.eventId).replace(/^[a-z]+:/, '')] || liveN[String(x.eventTitle || '').toLowerCase()]); }).slice(0, 3);
    return '<article class="igr" data-id="' + esc(it.id) + '">'
      + '<a class="igr-img" href="' + esc(it.image) + '" target="_blank" rel="noopener"><img src="' + esc(it.image) + '" alt="' + esc(it.title || 'Infographic') + '" loading="lazy"></a>'
      + '<div class="igr-b"><b>' + esc(it.title || 'Untitled graphic') + '</b>' + '<small>' + esc(it.source === 'telegram' ? 'Telegram inbox' : it.source === 'discord' ? 'Discord' : it.source || 'Source unknown') + (it.publishedAt ? ' · Posted ' + esc(String(it.publishedAt).slice(0, 10)) : '') + (it.history ? ' · older post' : '') + '</small>'
      + (it.note ? '<small>' + esc(it.note) + '</small>' : '')
      + (it.text ? '<details class="igr-ocr"><summary>Read image text</summary><p>' + esc(it.text) + '</p></details>' : '')
      + (it.signals && it.signals.length ? '<div class="igr-s">' + it.signals.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') + '</div>' : '')
      + '<div class="igr-g">' + (g.length ? g.map(function (x) { return '<button type="button" class="pill all" data-ig-ok="' + esc(x.eventId) + '" data-t="' + esc(x.eventTitle) + '">Approve: ' + esc(x.eventTitle) + '</button>'; }).join('') : '<small>No likely event found.</small>') + '</div>'
      + '<div class="igr-o"><select aria-label="Choose another event"><option value="">Another event…</option>' + eventOptions() + '</select><button type="button" class="pill" data-ig-pick>Approve</button><button type="button" class="pill" data-ig-no>Discard</button></div>'
      + '<div class="igr-o"><button type="button" class="pill" data-ig-ov="week">📅 This week\'s picture</button><button type="button" class="pill" data-ig-ov="month">🗓 Month overview</button></div>'
      + (safeUrl(it.post) ? '<small><a href="' + esc(it.post) + '" target="_blank" rel="noopener noreferrer">Original post</a>' + (it.creator ? ' · ' + esc(it.creator) : '') + '</small>' : '')
      + '</div></article>';
  }
  function render() {
    if (!isOwner()) { hideOwnerUi(); return; }
    var host = $('igreview'); if (!host) return;
    var open = items.filter(function (i) { return !decided[i.id]; }).sort(function (a, b) { return String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')); });
    var dot = $('hmenu'); if (dot) dot.classList.toggle('has-new', open.length > 0);
    var sv = document.querySelector('nav.tabs button[data-tab="saved"]'); if (sv) sv.classList.toggle('has-new', open.length > 0);
    banner(open.length);
    var linked = items.filter(function (i) { return linkedOf(i.id).length; });
    if (!open.length && !msg && !linked.length) { host.hidden = true; host.innerHTML = ''; return; }
    host.hidden = false;
    var kl = document.getElementById('iglinked'), keepLinked = !!(kl && kl.open);
    host.innerHTML = '<details class="dd" open><summary>Infographic review <span class="cnt">' + open.length + '</span></summary><div class="body">'
      + '<p class="note" style="margin:0 0 8px">Discord and Telegram pictures appear here until you link them. Check the image text and date before approving; nothing is attached to an event until you approve it.</p>'
      + (msg ? '<p class="igr-msg" role="status">' + esc(msg) + '</p>' : '') + open.slice(0, shown).map(card).join('') + (open.length > shown ? '<button type="button" class="pill all" data-ig-more="1">Show 10 more (' + (open.length - shown) + ' left)</button>' : '') + '</div></details>'
      + (linked.length ? '<details class="dd"' + (keepLinked ? ' open' : '') + ' id="iglinked"><summary>Linked infographics <span class="cnt">' + linked.length + '</span></summary><div class="body"><p class="note" style="margin:0 0 8px">Tap ✕ to unlink from one event, add more events, or discard. Changes reach the event within a few hours.</p>' + linked.map(linkedCard).join('') + '</div></details>' : '');
  }
  function send(it, status, eventId, title, note) {
    if (!isOwner()) { hideOwnerUi(); return; }
    if (!pin()) { msg = 'Set your Sync PIN in Menu → Sync & accounts before reviewing.'; render(); return; }
    fetch('/api/ig-decisions', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pin': pin() }, body: JSON.stringify({ id: it.id, status: status, eventId: eventId || '', eventTitle: title || '' }) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); decided[it.id] = status; decs[it.id] = { id: it.id, status: status, eventId: eventId || '', eventTitle: title || '' }; if (status === 'unlinked') delete decided[it.id]; msg = note || (status === 'approved' ? 'Linked. It will appear on the event after the next scheduled update.' : status === 'unlinked' ? 'Unlinked. It is back in the review list.' : 'Discarded.'); render(); document.dispatchEvent(new Event('gofn-review-updated')); })
      .catch(function () { msg = 'Could not save that decision. Check your sync PIN and connection.'; render(); });
  }
  function setLinks(it, list) {
    if (!list.length) return send(it, 'unlinked');
    send(it, 'approved', list.map(function (l) { return l.id; }).join(','), list.map(function (l) { return l.title; }).join(' | '));
  }
  function banner(n) {
    if (!isOwner()) { hideOwnerUi(); return; }
    var action = $('hireview'), count = $('igcount');
    if (action) { action.hidden = n < 1; action.classList.toggle('has-pending', n > 0); action.setAttribute('aria-label', n + ' infographic' + (n === 1 ? '' : 's') + ' waiting for review'); action.title = n + ' infographic' + (n === 1 ? '' : 's') + ' waiting for review'; }
    if (count) { count.hidden = n < 1; count.textContent = n > 99 ? '99+' : String(n); }
    var b = $('igbanner');
    if (!n) { if (b) b.hidden = true; return; }
    if (!b) { var tab = document.getElementById('tab-now'); if (!tab) return; b = document.createElement('button'); b.type = 'button'; b.id = 'igbanner'; b.className = 'igbanner'; tab.insertBefore(b, tab.firstChild); }
    b.hidden = false; b.textContent = '🖼 ' + n + ' infographic' + (n === 1 ? '' : 's') + ' waiting for your review · Review now →';
  }
  function gotoReview() {
    if (!isOwner()) return;
    var t = document.querySelector('nav.tabs button[data-tab="saved"]'); if (t) t.click();
    setTimeout(function () { var m = document.querySelector('#subnav-saved [data-sub="menu"]'); if (m) m.click(); setTimeout(function () { var h = $('igreview'); if (h && !h.hidden) h.scrollIntoView({ block: 'start' }); }, 150); }, 80);
  }
  document.addEventListener('click', function (e) { if (e.target.closest && (e.target.closest('#igbanner') || e.target.closest('#hireview'))) gotoReview(); });
  window.addEventListener('hashchange', function () { if (location.hash === '#review') gotoReview(); });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-ig-more]')) { shown += 10; return render(); }
    var card = e.target.closest && e.target.closest('.igr'); if (!card) return;
    var it = items.filter(function (i) { return i.id === card.getAttribute('data-id'); })[0]; if (!it) return;
    var ok = e.target.closest('[data-ig-ok]');
    if (ok) return send(it, 'approved', ok.getAttribute('data-ig-ok'), ok.getAttribute('data-t'));
    var un = e.target.closest('[data-ig-unlink]');
    if (un) { var L = linkedOf(it.id), gone = L[Number(un.getAttribute('data-ig-unlink'))]; return setLinks(it, L.filter(function (x) { return x !== gone; })); }
    if (e.target.closest('[data-ig-add]')) {
      var s2 = card.querySelector('select'), o2 = s2 && s2.options[s2.selectedIndex];
      if (!o2 || !o2.value) { msg = 'Choose an event first.'; return render(); }
      var L2 = linkedOf(it.id); picks(o2).forEach(function (pk) { if (!L2.some(function (x) { return x.id === pk.id; })) L2.push(pk); });
      return setLinks(it, L2);
    }
    var ov = e.target.closest('[data-ig-ov]');
    if (ov) return send(it, ov.getAttribute('data-ig-ov'), '', '', ov.getAttribute('data-ig-ov') === 'week' ? 'Set as this week\'s picture. It shows under At a glance after the next scheduled update.' : 'Set as the month overview. It shows under At a glance after the next scheduled update.');
    if (e.target.closest('[data-ig-no]')) return send(it, 'rejected');
    if (e.target.closest('[data-ig-pick]')) {
      var sel = card.querySelector('select'), o = sel && sel.options[sel.selectedIndex];
      if (!o || !o.value) { msg = 'Choose an event first.'; return render(); }
      var pk = picks(o); send(it, 'approved', pk.map(function (x) { return x.id; }).join(','), pk.map(function (x) { return x.title; }).join(' | '));
    }
  });
  /* "Check Discord now": the Worker looks at the Discord channel straight away instead of waiting for the hourly run, and says what it did. */
  /* The review box lives at the top of the Menu tab; it is created here the first time it is needed (the button must not wait for the picture list to load). */
  function ensureHost() {
    var h = $('igreview'); if (h) return h;
    var m = $('sub-menu'); if (!m) return null;
    h = document.createElement('div'); h.id = 'igreview'; h.hidden = true; m.insertBefore(h, m.firstChild); return h;
  }
  function mountDiscord() {
    if (!isOwner()) return;
    var host = ensureHost(); if (!host || $('igdiscord')) return;
    var p = document.createElement('p'); p.id = 'igdiscord'; p.className = 'note'; p.style.margin = '0 0 10px';
    p.innerHTML = '<button type="button" class="pill" id="igdiscord-btn">Check Discord now</button> <span id="igdiscord-msg" role="status"></span>';
    host.parentNode.insertBefore(p, host);
    $('igdiscord-btn').addEventListener('click', function () {
      var out = $('igdiscord-msg'), b = $('igdiscord-btn');
      if (!isOwner() || !pin()) { out.textContent = 'Set your Sync PIN in Menu → Sync & accounts first.'; return; }
      b.disabled = true; out.textContent = 'Checking…';
      fetch('/api/jobs/run?job=discord', { method: 'POST', headers: { 'x-pin': pin() } })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) { out.textContent = !x.ok ? 'Could not check: ' + (x.j.error || 'try again') : (x.j.sent && x.j.sent.length ? 'Sent ' + x.j.sent.length + ' picture' + (x.j.sent.length === 1 ? '' : 's') + ' to Telegram.' : 'Nothing to send: ' + (x.j.note || 'no new pictures') + '.'); })
        .catch(function () { out.textContent = 'Could not reach the site.'; })
        .then(function () { b.disabled = false; });
    });
  }
  function load() {
    if (!isOwner()) { hideOwnerUi(); return; }
    if (loadedForOwner) return;
    loadedForOwner = true;
    var token = ++loadToken;
    mountDiscord();
    Promise.all([
      fetch('/infographic-queue.json?t=' + Math.floor(Date.now() / 600000)).then(function (r) { return r.ok ? r.json() : { items: [] }; }).catch(function () { return { items: [] }; }),
      fetch('/api/ig-decisions').then(function (r) { return r.ok ? r.json() : { decisions: [] }; }).catch(function () { return { decisions: [] }; })
    ]).then(function (R) {
      if (token !== loadToken || !isOwner()) { hideOwnerUi(); return; }
      items = R[0].items || []; (R[1].decisions || []).forEach(function (d) { decs[d.id] = d; if (d.status === 'approved' || d.status === 'rejected' || d.status === 'week' || d.status === 'month') decided[d.id] = d.status; });
      if (!ensureHost()) return;
      render(); document.dispatchEvent(new Event('gofn-review-updated'));
      if (location.hash === '#review') gotoReview();
    });
  }
  document.addEventListener('gofn-owner-state', function (e) {
    if (e.detail && e.detail.role === 'owner') load(); else hideOwnerUi();
  });
  if (window.GODASH) load(); else document.addEventListener('DOMContentLoaded', load);
})();
