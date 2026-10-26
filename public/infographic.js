/* Event infographic viewer. Uses curated event data and Pokémon artwork already in GO Field Notes.
   If a trusted direct infographic image URL is supplied as event.infographicUrl, display it alongside the summary. */
(function () {
  'use strict';
  var X = window.GODASH, G = window.GO;
  if (!X || !G) return;
  var esc = G.esc;
  function safe(u) { return typeof u === 'string' && (/^https:\/\//.test(u) || /^\/img\/ext\/[\w.-]+$/.test(u) || /^\/infographics\/[\w.\/-]+$/.test(u)) ? u : ''; }
  var INFO = null;
  /* Pictures you approved that the 2-hourly publish has not attached yet. Their image is already on the site and the decision is in
     the database, so they show on the event straight away; once published they come from event-info.json and drop out of this list. */
  var PENDING = [];
  function loadPending() {
    return Promise.all([
      fetch('/infographic-queue.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
      fetch('/api/ig-decisions', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    ]).then(function (a) {
      var items = (a[0] && a[0].items) || [], dec = (a[1] && a[1].decisions) || [];
      PENDING = [];
      dec.filter(function (d) { return d.status === 'approved' && d.eventId; }).forEach(function (d) {
        var it = items.filter(function (i) { return i.id === d.id; })[0];
        if (!it || !safe(it.image)) return;
        var ids = String(d.eventId).split(','), ts = String(d.eventTitle || '').split(' | ');
        ids.forEach(function (id, n) {
          var title = ts[n] || id;
          PENDING.push({ eventId: id, eventTitle: title, img: { label: 'Infographic · ' + (it.creator || 'G47IX'), url: it.image, source: it.creator || 'G47IX', sourceUrl: it.post || '', alt: title + ' infographic' } });
        });
      });
    });
  }
  function pendingFor(ev) {
    var bares = [ev.id].concat(ev.aliasIds || []).map(function (i) { return String(i || '').replace(/^[a-z]+:/, ''); });
    return PENDING.filter(function (p) { return bares.indexOf(String(p.eventId).replace(/^[a-z]+:/, '')) > -1; }).map(function (p) { return p.img; });
  }
  /* fresh: ignore what this page already loaded and ask the network again (the "Check infographic" button, and coming back to the app). */
  function loadInfo(fresh) {
    if (INFO && !fresh) return Promise.resolve(INFO);
    return Promise.all([
      /* A failed fetch (offline, server error, bad JSON) must not wipe what the page already has: null means "keep the old INFO". */
      fetch('/event-info.json', { cache: fresh ? 'reload' : 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      loadPending()
    ]).then(function (a) { var ev = a[0] && a[0].events; if (ev && typeof ev === 'object') INFO = ev; return INFO || {}; });
  }
  /* Every event the page knows, so the title fallback can tell "this is the next instance" from "this is the same event". */
  function otherEvents() {
    return [].concat(X.events() || [], X.regionalEvents ? X.regionalEvents() : [], X.worldEvents ? X.worldEvents() : []);
  }
  function eventInfo(ev, all) {
    var bare = String(ev.id || '').replace(/^[a-z]+:/, '');
    var hit = (window.GODEDUPE && GODEDUPE.findEventInfo ? GODEDUPE.findEventInfo(ev, all, otherEvents()) : (all[ev.id] || all[bare])) || {};
    var extra = pendingFor(ev);
    if (!extra.length) return hit;
    var have = (hit.infographics || []).map(function (i) { return i.url; });
    return Object.assign({}, hit, { infographics: (hit.infographics || []).concat(extra.filter(function (i) { return have.indexOf(i.url) < 0; })) });
  }
  function evById(id) { return X.events().filter(function (e) { return e.id === id; })[0] || (X.raidSlots ? X.raidSlots().filter(function (e) { return e.id === id; })[0] : null) || (X.worldEvents ? X.worldEvents().filter(function (e) { return e.id === id; })[0] : null) || (X.regionalEvents ? X.regionalEvents().filter(function (e) { return e.id === id; })[0] : null); }
  /* The card button (data-igcard) shows what we know: a small picture of the infographic when there is one, or an always-on
     "Check infographic" button when there is not. Other buttons (details page, raid rows) keep the text button. */
  function cardButton(button, ev, id, thumb) {
    var name = ev ? ev.name : 'event';
    button.classList.remove('info-unavailable');
    button.disabled = false;
    button.removeAttribute('aria-disabled');
    button.hidden = false;
    if (thumb && button.getAttribute('data-igbad') === thumb) thumb = ''; /* that picture failed to load: do not try it again */
    if (thumb) {
      button.classList.add('info-available', 'igthumb'); button.classList.remove('igcheck');
      button.removeAttribute('data-igcheck'); button.setAttribute('data-infographic', id);
      button.setAttribute('aria-label', 'Open infographic for ' + name); button.title = 'View infographic';
      var img = button.querySelector('img');
      if (!img || img.getAttribute('src') !== thumb) {
        button.innerHTML = '';
        img = document.createElement('img'); img.setAttribute('loading', 'lazy'); img.setAttribute('decoding', 'async'); img.setAttribute('width', '44'); img.setAttribute('height', '44'); img.alt = '';
        img.addEventListener('error', function () { if (button.querySelector('img') !== img || img.getAttribute('src') !== thumb) return; /* a late error from a picture that was already replaced */ button.setAttribute('data-igbad', thumb); cardButton(button, ev, id, ''); });
        img.src = thumb; button.appendChild(img);
      }
    } else {
      button.classList.remove('info-available', 'igthumb'); button.classList.add('igcheck');
      button.removeAttribute('data-infographic'); button.setAttribute('data-igcheck', id);
      button.setAttribute('aria-label', 'Check for an infographic for ' + name); button.title = 'Look again for an infographic';
      if (button.getAttribute('data-igmsg') !== '1') button.textContent = 'Check infographic';
    }
  }
  function syncButtons(all) {
    var buttons = document.querySelectorAll('[data-infographic], [data-igcard]');
    Array.prototype.forEach.call(buttons, function (button) {
      var id = button.getAttribute('data-igcard') || button.getAttribute('data-infographic');
      var ev = evById(id);
      var extra = ev ? eventInfo(ev, all) : {};
      var images = (extra.infographics || []).filter(function (item) { return item && safe(item.url); });
      var direct = ev && safe(ev.infographicUrl || ev.infographic);
      /* Every event opens something real. A published poster (green) when one is on file; otherwise the event's own
         picture from its Leek Duck / pokemongo.com page, with the bonuses and highlights below it. */
      var poster = !!(images.length || direct);
      if (button.hasAttribute('data-igcard')) { cardButton(button, ev, id, poster ? (images[0] ? images[0].url : direct) : ''); return; }
      if (ev && ev.world) { button.hidden = !poster; if (poster) { button.textContent = '▧'; button.classList.add('info-available'); } return; }
      button.hidden = false;
      button.disabled = false;
      button.classList.toggle('info-available', poster);
      button.classList.remove('info-unavailable');
      button.textContent = '▧ Infographic';
      button.setAttribute('aria-label', 'Open infographic for ' + (ev ? ev.name : 'event'));
      button.setAttribute('aria-disabled', 'false');
      button.title = poster ? 'View published infographic' : 'View event picture and summary';
    });
  }
  /* The button keeps its button role; the result is read out through one hidden status region. The region is created at startup (a live
     region added at the moment of the first message is often not announced), and each message is set on a later tick after the text was
     cleared, so the same message twice in a row is read twice. */
  var announceTimer = 0;
  function liveRegion() {
    var r = document.getElementById('iglive');
    if (!r && document.body) { r = document.createElement('div'); r.id = 'iglive'; r.className = 'vh-live'; r.setAttribute('role', 'status'); r.setAttribute('aria-live', 'polite'); document.body.appendChild(r); }
    return r;
  }
  function announce(text) {
    var r = liveRegion(); if (!r) return;
    if (announceTimer) { clearTimeout(announceTimer); announceTimer = 0; }
    r.textContent = '';
    if (text) announceTimer = setTimeout(function () { announceTimer = 0; r.textContent = text; }, 50);
  }
  /* "Check infographic": look again, ignoring everything this page already loaded. Found: open it. Not found: say so on the button. */
  function recheck(button) {
    var id = button.getAttribute('data-igcheck'), ev = evById(id);
    if (!ev || button.getAttribute('data-igbusy') === '1') return;
    if (button._igTimer) { clearTimeout(button._igTimer); button._igTimer = 0; button.removeAttribute('data-igmsg'); announce(''); }
    button.setAttribute('data-igbusy', '1'); button.textContent = 'Checking…';
    loadInfo(true).then(function (all) {
      button.removeAttribute('data-igbusy');
      var found = ((eventInfo(ev, all).infographics || []).some(function (i) { return i && safe(i.url); })) || !!safe(ev.infographicUrl || ev.infographic);
      syncButtons(all);
      if (found) { open(id); return; }
      button.setAttribute('data-igmsg', '1'); button.textContent = 'No infographic found yet'; announce('No infographic found yet');
      button._igTimer = setTimeout(function () { button._igTimer = 0; button.removeAttribute('data-igmsg'); button.textContent = 'Check infographic'; announce(''); }, 3500);
    }).catch(function () { button.removeAttribute('data-igbusy'); button.textContent = 'Check infographic'; });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && INFO) loadInfo(true).then(function (all) { syncButtons(all); }); });
  function watchButtons() {
    loadInfo().then(function (all) {
      syncButtons(all);
      if (window.MutationObserver && !window.__goInfoButtonObserver) {
        window.__goInfoButtonObserver = new MutationObserver(function (mutations) {
          /* Ignore the button text/class/disabled mutations made by syncButtons itself.
             Only rescan when an event card or infographic button is newly inserted. */
          var addedCard = mutations.some(function (mutation) {
            return Array.prototype.some.call(mutation.addedNodes, function (node) {
              return node.nodeType === 1 && (node.matches('[data-infographic], [data-igcard], .pc') || (node.querySelector && node.querySelector('[data-infographic], [data-igcard], .pc')));
            });
          });
          if (addedCard) syncButtons(INFO || all);
        });
        window.__goInfoButtonObserver.observe(document.body, { childList: true, subtree: true });
      }
    });
  }
  function close(silent) {
    var o = document.getElementById('goinfo');
    if (!o || o.hidden) return;
    o.hidden = true;
    document.body.style.overflow = '';
    if (silent !== true && window.GONAV) window.GONAV.popped();
  }
  function open(id) {
    var ev = evById(id);
    if (!ev) return;
    loadInfo().then(function (allInfo) { return loadPending().then(function () { render(ev, eventInfo(ev, allInfo)); }); });
  }
  function render(ev, extra) {
    var k = X.kindOf(ev), host = document.getElementById('goinfo'), wasOpen = !!host && !host.hidden;
    if (!host) {
      host = document.createElement('div'); host.id = 'goinfo'; host.className = 'goinfo';
      host.setAttribute('role', 'dialog'); host.setAttribute('aria-modal', 'true'); host.setAttribute('aria-label', 'Event infographic');
      document.body.appendChild(host);
    }
    var mons = (ev.featured || []).filter(function (f, i, a) {
      return f && f.name && a.findIndex(function (x) { return x && x.name === f.name; }) === i;
    }).slice(0, 8);
    var images = (extra.infographics || []).filter(function (x) { return x && safe(x.url); });
    var direct = safe(ev.infographicUrl || ev.infographic);
    if (!images.length && direct) images.push({ label: ev.name + ' infographic', url: direct, source: ev.source || 'Event source', sourceUrl: ev.link || '', alt: ev.name + ' infographic' });
    var link = safe(ev.link);
    var html = '<div class="goinfo-panel" style="--k:' + esc(k[1]) + ';--kf:' + esc(k[2]) + '">'
      + '<div class="goinfo-top"><b>GO Field Notes · Event infographic</b><button type="button" class="goinfo-close" data-infoclose aria-label="Close infographic">×</button></div>';
    if (images.length) html += images.map(function (im) { var sourceUrl = safe(im.sourceUrl); return '<section class="goinfo-poster"><div class="goinfo-poster-top">' + esc(im.label || 'Event infographic') + (im.source ? ' · ' + esc(im.source) : '') + '</div><img src="' + esc(im.url) + '" alt="' + esc(im.alt || (ev.name + ' event infographic')) + '" style="display:block;width:100%;height:auto;max-height:78vh;object-fit:contain" loading="lazy">' + (sourceUrl ? '<a class="goinfo-source" href="' + esc(sourceUrl) + '" target="_blank" rel="noopener noreferrer">View creator/source</a>' : '') + '</section>'; }).join('');
    html += '<div class="goinfo-art"><span class="goinfo-kind">' + esc(k[0]) + '</span><h2>' + esc(ev.name) + '</h2><p class="goinfo-date">' + esc(X.whenText(ev)) + '</p><p>' + esc(X.countdown(ev)) + '</p>';
    if (mons.length) html += '<div class="goinfo-pokemon">' + mons.map(function (f) {
      return '<div class="goinfo-mon">' + (X.monArt ? X.monArt(ev, f, 'ea') : G.art(f.name, 'ea')) + '<b>' + esc(f.name) + '</b>' + (f.costume ? '<small>Costume</small>' : '') + (f.shiny ? '<small>Shiny available</small>' : '') + '</div>';
    }).join('') + '</div>';
    if (!mons.length && X.specialArt) html += '<div class="goinfo-pokemon">' + X.specialArt(ev) + '</div>';
    html += '</div><div class="goinfo-sections">';
    if (ev.bonuses && ev.bonuses.length) html += '<section class="goinfo-section"><h3>Bonuses</h3><div class="goinfo-bonuses">' + ev.bonuses.map(G.bonusChip).join('') + '</div></section>';
    if (ev.notes && ev.notes.length) html += '<section class="goinfo-section"><h3>Event highlights</h3><ul>' + ev.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></section>';
    html += '<section class="goinfo-section"><h3>More community graphics</h3><p class="goinfo-source"><a href="https://x.com/g47ix" target="_blank" rel="noopener noreferrer">G47IX on X</a> · <a href="https://www.instagram.com/g47ix" target="_blank" rel="noopener noreferrer">Instagram</a> · <a href="https://www.pokebattler.com/raids/guides" target="_blank" rel="noopener noreferrer">Pokebattler raid guides</a></p></section>';
    html += '<section class="goinfo-section"><h3>Remember</h3><p>Check the event details and source for changes, ticket requirements and exact bonuses.</p>'
      + '<p class="goinfo-source">' + esc(ev.source || 'GO Field Notes schedule') + (link ? ' · <a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Open source</a>' : '') + '</p></section></div></div>';
    host.innerHTML = html; host.hidden = false; document.body.style.overflow = 'hidden';
    if (!wasOpen && window.GONAV) window.GONAV.push();
    var boss = ev.kind === 'raid' ? (ev.featured || []).filter(function (f) { return f && f.name && f.role !== 'shiny_form'; })[0] : null;
    if (!images.length && boss) {
      fetch('/api/guide?boss=' + encodeURIComponent(boss.name)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var top = host.querySelector('.goinfo-top'); if (!d || !safe(d.url) || !top || host.hidden) return;
        var sec = document.createElement('section'); sec.className = 'goinfo-poster';
        sec.innerHTML = '<div class="goinfo-poster-top">Raid guide · ' + esc(boss.name) + ' · Pokebattler (CaptGoldfish)</div><img src="' + esc(d.url) + '" alt="' + esc(boss.name) + ' raid guide infographic" style="display:block;width:100%;height:auto;max-height:78vh;object-fit:contain" data-err="prm">' + (safe(d.page) ? '<a class="goinfo-source" href="' + esc(d.page) + '" target="_blank" rel="noopener noreferrer">Open the full guide on Pokebattler</a>' : '');
        host.querySelector('.goinfo-art') ? host.querySelector('.goinfo-art').parentNode.insertBefore(sec, host.querySelector('.goinfo-art')) : top.parentNode.appendChild(sec);
      }).catch(function () {});
    }
    var ogHost = link && /^https:\/\/(www\.)?(leekduck|pokemongo)\.com\//.test(link);
    if (!images.length && ogHost) {
      fetch('/api/og?u=' + encodeURIComponent(link)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var top = host.querySelector('.goinfo-top'); if (!d || !top || host.hidden) return;
        var src = /leekduck/.test(link) ? 'Leek Duck' : 'pokemongo.com';
        var items = (d.graphics || []).filter(safe).map(function (u) { return { url: u, label: 'Infographic · ' + src }; });
        if (!items.length && safe(d.image)) items.push({ url: d.image, label: 'Event picture · ' + src });
        var anchor = top;
        items.forEach(function (im) {
          var sec = document.createElement('section'); sec.className = 'goinfo-poster';
          sec.innerHTML = '<div class="goinfo-poster-top">' + esc(im.label) + '</div><img src="' + esc(im.url) + '" alt="' + esc(ev.name) + '" style="display:block;width:100%;height:auto;max-height:78vh;object-fit:contain" data-err="prm"><a class="goinfo-source" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Open the full event page</a>';
          anchor.parentNode.insertBefore(sec, anchor.nextSibling); anchor = sec;
        });
      }).catch(function () {});
    }
    var closeBtn = host.querySelector('[data-infoclose]'); if (closeBtn) closeBtn.focus();
  }
  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('[data-igcheck]');
    if (c) { e.preventDefault(); e.stopPropagation(); recheck(c); return; }
    var b = e.target.closest && e.target.closest('[data-infographic]');
    if (b) { e.preventDefault(); e.stopPropagation(); open(b.getAttribute('data-infographic')); return; }
    if (e.target.closest && e.target.closest('[data-infoclose]')) { close(); return; }
    var host = document.getElementById('goinfo');
    if (host && e.target === host) close();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  if (document.body) liveRegion(); else document.addEventListener('DOMContentLoaded', liveRegion);
  watchButtons();
  window.GOINFOGRAPHIC = { open: open, close: close };
})();