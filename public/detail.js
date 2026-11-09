/* Event detail: what the event includes, passes and tickets, prices, and where each fact came from.
   Data comes from /event-info.json and /prices.json, so adding or fixing an entry never needs a code change. */
(function () {
  'use strict';
  var G = window.GO, X = window.GODASH, LIB = window.GOLIB;
  if (!G || !X || !LIB) return;
  var esc = G.esc, DATA = null, loadPending = null, activeModel = null, opener = null, openerKey = null, openerClass = '', openerHostId = '';
  function $(id) { return document.getElementById(id); }
  /* Moves an event hands out for a limited time (public/event-moves.json). Shown only here and only while the window is open; never part of a Pokémon's normal moveset. */
  var EVM = [];
  function evMovesHtml(ev, highlightTarget) {
    var L = EVM.filter(function (m) { return m.eventId === ev.id || m.eventId === String(ev.id).replace(/^cur:/,''); });
    if (!L.length) return '';
    var rows = L.map(function (m) {
      var until = m.windowEnd ? GOEventClock.parseDate(m.windowEnd) : null, open = !until || isNaN(until) || until.getTime() > Date.now();
      var when = until && !isNaN(until) ? (open ? 'until ' : 'ended ') + until.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',timeZone:GOEventClock.viewerZone() }) : '';
      var what = m.acquisition === 'EVOLVE'
        ? 'Evolve <b>' + esc(m.pokemon) + '</b>' + (m.evolutionTarget ? ' into <b>' + esc(m.evolutionTarget) + '</b>' : '') + ' to get ' + moveHtml({name:m.move}) + (m.moveKind ? ' (' + esc(m.moveKind) + ' attack)' : '')
        : (m.pokemon ? '<b>' + esc(m.pokemon) + '</b>' : 'Pokémon') + ' caught in the event will know ' + moveHtml({name:m.move});
      var sources = (m.sources || []).filter(function (s) { return s && s.name && safe(s.url); }).map(function (s) {
        return trust(s.trust) + ' <a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name) + '</a>';
      }).join(' · ');
      var sourceLine = sources ? '<p class="evd-src">Source: ' + sources + '</p>' : '';
      var tag = m.acquisition === 'EVOLVE' ? '<span class="pill all">Evolve project: have a ' + esc(m.pokemon) + ' ready</span> ' : '';
      return '<div class="evd-row"><div class="v"><p>' + what + (when ? ' <small>' + esc(when) + '</small>' : '') + '</p>' + sourceLine + tag + '</div></div>';
    }).join('');
    return '<h3 class="sec2"' + (highlightTarget ? ' id="evd-highlights"' : '') + '>Event-only moves</h3><div class="evd-card">' + rows + '</div><p class="note">Temporary: not part of the normal moveset, and no Elite TM needed while the window is open.</p>';
  }
  function load() {
    if (DATA) return Promise.resolve(DATA);
    if (loadPending) return loadPending;
    var incomplete=false;
    // Supplemental feeds must not prevent a retained canonical event from opening.
    function optional(promise) { return new Promise(function(resolve) {
      var done=false,timer=setTimeout(function(){incomplete=true;finish(null);},8000);
      function finish(value){if(done)return;done=true;clearTimeout(timer);if(value==null)incomplete=true;resolve(value);}
      Promise.resolve(promise).then(finish,function(){finish(null);});
    }); }
    function j(u) { return window.GOLIB.jsonOrNull(u, { maxAge: 600000, init: { cache: 'no-cache' } }); }
    var placesP = window.GOPLACES_READY ? window.GOPLACES_READY.then(function (places) { return places && places.load ? places.load() : null; }) : (window.GOPLACES ? window.GOPLACES.load() : null);
    loadPending = Promise.all([j('/event-info.json'), (window.GOLIB ? GOLIB.loadPrices() : j('/prices.json')), placesP, j('/event-details.json'), j('/event-moves.json'), (window.GOEventRegistry?GOEventRegistry.ready:j('/events-v1.json'))].map(optional)).then(function (a) { EVM = (a[4] && a[4].moves) || []; if(window.GOEventAdapter&&a[5]){GOEventAdapter.configureSpecies(a[5].species||[]);GOEventAdapter.configureCostumes(a[5].costumes||[]);} DATA = { incomplete:incomplete, info: a[0] || { events: {}, passes: {} }, prices: a[1] || { prices: [], fx: null }, details: (a[3] && a[3].events) || {}, catalogue: a[5] && a[5].schemaVersion===1 ? a[5].events || [] : [] }; return DATA; });
    return loadPending;
  }
  function fmtDay(iso) { var d = new Date(iso + 'T12:00'); return isNaN(d) ? esc(iso) : d.getDate() + ' ' + G.MON[d.getMonth()]; }
  function safe(u) { return typeof u === 'string' && !(window.GOLIB && window.GOLIB.isPrivateLink(u)) && (/^https:\/\//.test(u) || /^\/img\/ext\/[\w.-]+$/.test(u)) ? u : ''; }
  function safeSeasonThumb(u) {
    return typeof u === 'string' && /^\/season-thumbs\/season-[a-z0-9-]+-[a-f0-9]{8}\.webp$/i.test(u) ? u : '';
  }
  function seasonBannerHtml() {
    /* Keep the HTML template constant; poster URLs and labels are assigned through DOM properties below. */
    return '<div data-season-banner></div>';
  }
  function loadSeasonBanner(o, ev) {
    var slot = o.querySelector('[data-season-banner]');
    if (!slot) return;
    var original = safe(ev && ev.img || activeModel && activeModel.image);
    if (!original) { slot.remove(); return; }
    var thumb = safeSeasonThumb(ev && ev.season && ev.season.thumbnail);
    var img = document.createElement('img');
    img.className = ev && ev.season ? 'evd-banner evd-banner-season' : 'evd-banner';
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';

    if (thumb) {
      var link = document.createElement('a'), triedOriginal = false;
      link.className = 'evd-banner-link';
      link.href = original;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', 'Open full-size poster for ' + String(ev && ev.name || 'event'));
      link.title = 'Open full-size poster';
      img.addEventListener('error', function () {
        if (!triedOriginal) {
          triedOriginal = true;
          img.src = original;
          return;
        }
        link.remove();
      });
      link.appendChild(img);
      slot.replaceWith(link);
      img.src = thumb;
      return;
    }

    img.setAttribute('data-err', 'rm');
    img.addEventListener('error', function () { img.remove(); }, { once: true });
    slot.replaceWith(img);
    img.src = original;
  }
  function safeGpx(u) { return typeof u === 'string' && (/^https:\/\//.test(u) || /^\/(?:gpx|routes|places)\/[\w./-]+\.gpx(?:\?[^#]*)?$/i.test(u)) ? u : ''; }
  function trust(t) {
    var official = t === 'official', community = t === 'community';
    var cls = official ? 'st-a' : community ? 'st-n' : 'st-u';
    var label = official ? 'Official' : community ? 'Community' : 'Trust not labelled';
    return '<span class="st ' + cls + '">' + label + '</span>';
  }
  function srcLine(s) {
    if (!s) return '';
    var u = safe(s.url);
    return '<p class="evd-src">' + trust(s.trust) + ' ' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(s.label) + '</a>' : esc(s.label)) + ' · read ' + fmtDay(s.observed) + '</p>';
  }
  function moveHtml(m) { return window.GOMOVE ? window.GOMOVE.html(m.name, m.type, m.pokemon) : '<b>' + esc(m.name) + '</b>'; }
  function infoRow(i) {
    var tag = i.status === 'published' ? '<span class="pub">Published</span>' : i.status === 'partial' ? '<span class="npub">Partly published</span>' : '<span class="npub">Not published</span>';
    return '<div class="evd-row"><span class="k">' + esc(i.k) + '</span><div class="v">' + tag + '<p>' + window.GORICH(esc(i.text)) + '</p>'
      + (i.moves ? '<p class="mvs">' + i.moves.map(moveHtml).join(' ') + '</p>' : '')
      + (i.note ? '<small>' + esc(i.note) + '</small>' : '') + '</div></div>';
  }
  function priceBlock(product) {
    var v = LIB.priceView(DATA.prices, product, new Date().toISOString().slice(0, 10));
    var cls = v.kind === 'converted' || v.kind === 'native' ? 'px' : 'px nf';
    return '<div class="' + cls + '" data-price-kind="' + v.kind + '"><span class="a">' + esc(v.main) + '</span>' + (v.sub ? '<span class="o">' + esc(v.sub) + '</span>' : '') + (v.save ? '<span class="sv">' + esc(v.save) + '</span>' : '') + '</div>';
  }
  function priceNote(product) {
    var v = LIB.priceView(DATA.prices, product, new Date().toISOString().slice(0, 10));
    var b = (DATA.prices.prices || []).filter(function (p) { return p.product === product && (p.currency === 'IDR' || (p.currency === 'AUD' && p.region === 'AU' && p.verified === true)); });
    var cites = b.map(function (p) { var u = safe(p.url); return (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(p.source) + '</a>' : esc(p.source)) + ', ' + fmtDay(p.observed); });
    var fx = DATA.prices.fx;
    var t = '';
    if (v.kind === 'converted' && fx) t += 'Converted at 1 Rp = A$' + fx.rate + ' (' + esc(fx.source) + ', ' + fmtDay(fx.observed) + '). ';
    if (v.kind === 'notfound') t += 'Nothing is converted from the foreign price. ';
    if (v.kind === 'tier') t += esc(v.note) + '. ';
    return (t ? '<p class="note">' + t + '</p>' : '') + (cites.length ? '<p class="evd-src">Price: ' + cites.join(' · ') + '</p>' : '');
  }
  function passCard(id) {
    var p = DATA.info.passes[id]; if (!p) return '';
    var unl = (p.unlocks || []).map(function (u) { var o = typeof u === 'string' ? { text: u } : u; return '<li class="' + (o.unpublished ? 'up' : '') + '">' + esc(o.text) + (o.unpublished ? ' <b>not listed yet</b>' : '') + '</li>'; }).join('');
    var rows = [['Optional', p.optional || 'Not stated'], ['Buy or claim by', p.buyBy || 'Not published yet']];
    if (!p.free && !p.product) rows = rows;
    if (p.releaseTime !== undefined) rows.push(['Release time', p.releaseTime || 'Not published yet']);
    (p.expires || []).forEach(function (e) { rows.push(e); });
    (p.facts || []).forEach(function (e) { rows.push(e); });
    var variants = (p.variants || []).map(function (v) { var pv = LIB.priceView(DATA.prices, v.product); return '<div class="kv"><span>' + esc(v.label) + '</span><b>' + esc(pv.main) + (pv.sub ? ' · ' + esc(pv.sub) : '') + (pv.save ? ' · ' + esc(pv.save) : '') + '</b></div>'; }).join('');
    return '<article class="tk" data-pass="' + esc(id) + '"><div class="hd"><div><h3>' + esc(p.name) + '</h3><div class="note">' + esc(p.sub || '') + '</div></div>'
      + (p.free ? '<span class="free">Free</span>' : p.product ? priceBlock(p.product) : '') + '</div>'
      + '<ul>' + unl + '</ul><div class="ft">' + rows.map(function (r) { return '<div class="kv"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + variants + '</div>'
      + (p.product ? priceNote(p.product) : '') + srcLine(p.source) + '</article>';
  }
  function icsFor(ev) {
    function f(d, utc) { var p = function (n) { return String(n).padStart(2, '0'); }; return utc ? d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + '00Z' : d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + 'T' + p(d.getHours()) + p(d.getMinutes()) + '00'; }
    var u = !!ev.utc;
    var t = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GO Field Notes//EN', 'BEGIN:VEVENT', 'UID:' + ev.id + '@gofieldnotes', 'DTSTAMP:' + f(new Date(), true), 'DTSTART:' + f(ev.start, u), 'DTEND:' + f(ev.end, u), 'SUMMARY:' + ev.name.replace(/[,;]/g, ' '), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(t);
  }
  function findInfo(ev) {
    var E = DATA.info.events || {}; if (E[ev.id]) return E[ev.id]; var bare = String(ev.id).replace(/^[a-z]+:/, ''); if (E[bare]) return E[bare];
    var n = LIB.norm(ev.name), hit = null;
    Object.keys(E).forEach(function (k) { if ((E[k].names || []).some(function (x) { return LIB.norm(x) === n; })) hit = E[k]; });
    return hit;
  }
  /* "From the sources": what several write-ups say about the event, compared. Each line shows how many sources agree. */
  var CATS = [['tickets', 'Tickets and passes'], ['bonuses', 'Bonuses'], ['featured', 'Wild and featured'], ['raids', 'Raids and Max'], ['eggs', 'Eggs'], ['research', 'Research'], ['shiny', 'Shiny'], ['moves', 'Moves'], ['costumes', 'Costumes'], ['dates', 'Dates and times']];
  function findDetails(ev) {
    var D = DATA.details || {}, ids = [];
    if (ev && ev.season && ev.season.detailId) ids.push(ev.season.detailId);
    if (ev && ev.id) { ids.push(ev.id); if(String(ev.id).indexOf('cur:')===0)ids.push(String(ev.id).slice(4)); }
    if (ev && Array.isArray(ev.detailIds)) ids = ids.concat(ev.detailIds);
    var hits = [];
    ids.filter(function (id, i, a) { return id && a.indexOf(id) === i; }).forEach(function (id) {
      if (D[id] && hits.indexOf(D[id]) < 0) hits.push(D[id]);
    });
    if (!hits.length) {
      var n = LIB.norm(ev && ev.name), hit = null;
      Object.keys(D).forEach(function (k) { if (LIB.norm(D[k].name) === n) hit = D[k]; });
      if (hit) hits.push(hit);
    }
    if (hits.length < 2) return hits[0] || null;
    var out = { name: hits[0].name, updated: "", sources: [], fields: {}, conflicts: [], gaps: [], researchTasks: [] };
    function uniquePush(list, item, key) {
      var value = key ? key(item) : JSON.stringify(item);
      if (!list.some(function (x) { return (key ? key(x) : JSON.stringify(x)) === value; })) list.push(item);
    }
    hits.forEach(function (d) {
      if (d.goPassParseWarning) { out.goPassParseWarning = d.goPassParseWarning; out.goPassRetainedAt = d.goPassRetainedAt || null; }
      if (String(d.updated || "") > out.updated) out.updated = String(d.updated || "");
      (d.sources || []).forEach(function (s) { uniquePush(out.sources, s, function (x) { return x.id + "|" + x.url; }); });
      Object.keys(d.fields || {}).forEach(function (field) {
        var list = out.fields[field] || (out.fields[field] = []);
        (d.fields[field] || []).forEach(function (item) {
          var existing = list.filter(function (x) { return x.text === item.text; })[0];
          if (existing) {
            existing.sources = Array.from(new Set((existing.sources || []).concat(item.sources || [])));
            var official = existing.status === "official" || item.status === "official";
            existing.status = official ? "official" : existing.sources.length > 1 ? "corroborated" : existing.status;
          } else list.push(Object.assign({}, item, { sources: (item.sources || []).slice() }));
        });
      });
      (d.researchTasks || []).forEach(function (task) {
        var key = JSON.stringify([task.category, task.task, task.rewards]);
        var existing = out.researchTasks.filter(function (x) { return JSON.stringify([x.category, x.task, x.rewards]) === key; })[0];
        if (existing) {
          existing.sources = Array.from(new Set((existing.sources || []).concat(task.sources || [])));
          existing.status = existing.status === "official" || task.status === "official" ? "official" : existing.sources.length > 1 ? "corroborated" : existing.status;
        } else out.researchTasks.push(Object.assign({}, task, { sources: (task.sources || []).slice() }));
      });
      (d.conflicts || []).forEach(function (x) { uniquePush(out.conflicts, x); });
      (d.gaps || []).forEach(function (x) { uniquePush(out.gaps, x); });
    });
    return out;
  }
  function srcName(d, id) { var s = (d.sources || []).filter(function (x) { return x.id === id; })[0]; return s ? s.name : id; }
  /* Matching line icons keep every event-detail category visually consistent. */
  var CATICON = {
    tickets: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7Z M12 7v10',
    bonuses: 'M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z',
    featured: 'M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z',
    raids: 'M5 4l14 16M19 4 5 20M3 3l4 4M17 17l4 4',
    eggs: 'M12 3c-3.8 0-6.5 5.2-6.5 10a6.5 6.5 0 0 0 13 0c0-4.8-2.7-10-6.5-10Z',
    research: 'M8 4h8v3h3v13H5V7h3V4Z M9 4h6v4H9z M8 12h8M8 16h6',
    shiny: 'M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3',
    moves: 'M13 2 4 13h7l-1 9 10-13h-7z',
    costumes: 'M4 10h16l-1 8H5l-1-8Z M7 10a5 5 0 0 1 10 0M10 6a2 2 0 0 1 4 0',
    dates: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 7v5l3 2'
  };
  function categoryIcon(key) {
    var path = CATICON[key] || CATICON.featured;
    return '<span class="evd-icon" aria-hidden="true"><svg class="ci" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg></span>';
  }

  /* GO Pass prices: the Australian store price when it has been checked, never a conversion from US dollars. */
  function passPrice(text, ev) {
    return text.replace(/US\$\s?(\d+(?:\.\d\d)?)\*?(\s?\((?:or )?(?:the )?equivalent[^)]*\))?/gi, function (m) {
      var low = text.toLowerCase(), key = (String(ev.id || '') + ' ' + String(ev.name || '')).toLowerCase();
      var word = (/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|fall|spring|summer|winter)/.exec(key) || [])[1] || '';
      var suffix = /\+\s?\d+\s*ranks?/.test(low) ? '-deluxe-' : /ultra/.test(low) ? '-ultrabox' : /deluxe/.test(low) ? '-deluxe' : '';
      var hit = word && suffix ? ((DATA.prices && DATA.prices.prices) || []).filter(function (p) { return p.currency === 'AUD' && p.region === 'AU' && p.verified === true && p.product.indexOf('go-pass-' + word) === 0 && (suffix === '-deluxe-' ? /-deluxe-\d+$/.test(p.product) : p.product.slice(-suffix.length) === suffix); })[0] : null;
      return hit ? '<b class="aud" title="Australian store price">A$' + Number(hit.amount).toFixed(2) + '</b>' : window.GOLIB.audify(m);
    });
  }
  function tidy(t) { return String(t).replace(/\s+([.,;:!?])/g, '$1').replace(/\s+/g, ' ').trim(); }
  var BOILER = /^prices are in usd|availability of event tickets|^claim all unlocked/i;
  // Collect every category before rendering any of them. A claim repeated in a later
  // category can then add its source attribution to the first occurrence before HTML is built.
  function dedupeSourceGroups(fields) {
    var seen = Object.create(null), groups = {};
    CATS.forEach(function (c) {
      var items = [];
      (fields[c[0]] || []).forEach(function (it) {
        if (!it || typeof it.text !== 'string') return;
        var whole = tidy(it.text);
        (/^rank \d+\b/i.test(whole) ? [whole] : whole.split(/(?<=[.!?])\s+(?=[A-Z])/)).forEach(function (sent) {
          var k = sent.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          if (k.length < 8 || BOILER.test(sent)) return;
          var ids = (it.sources || []).filter(function (id, i, a) { return typeof id === 'string' && a.indexOf(id) === i; });
          if (seen[k]) {
            ids.forEach(function (id) { if (seen[k].sources.indexOf(id) < 0) seen[k].sources.push(id); });
            if (seen[k].status !== 'official' && it.status === 'official') seen[k].status = 'official';
            return;
          }
          var item = { text: sent, sources: ids, status: it.status || '' };
          seen[k] = item;
          items.push(item);
        });
      });
      groups[c[0]] = items;
    });
    return groups;
  }
  function sourcesBlock(ev) {
    var d = findDetails(ev); if (!d || !d.fields) return '';
    var grouped = dedupeSourceGroups(d.fields);
    var groups = CATS.map(function (c) {
      var items = grouped[c[0]] || [];
      if (c[0] === 'research' && (d.researchTasks || []).length) {
        var taskStarts = d.researchTasks.map(function (task) { return tidy(task.task).toLowerCase(); });
        items = items.filter(function (item) {
          var text = tidy(item.text).toLowerCase();
          return !taskStarts.some(function (task) { return task && text.indexOf(task) === 0; });
        });
      }
      if (!items.length) return '';
      var ranks = items.filter(function (x) { return /^rank \d+\b/i.test(x.text); }).sort(function (a, b) { return parseInt(a.text.replace(/\D+/, ''), 10) - parseInt(b.text.replace(/\D+/, ''), 10); }), rest = items.filter(function (x) { return ranks.indexOf(x) < 0; });
      var fmt = function (x) { return window.GORICH(c[0] === 'tickets' ? passPrice(esc(x), ev) : esc(x)); };
      var attribution = function (it) {
        var ids = (it.sources || []).filter(function (id, i, a) { return a.indexOf(id) === i; });
        var labels = ids.map(function (id) {
          var s = (d.sources || []).filter(function (v) { return v.id === id; })[0];
          if (!s) return '';
          var u = safe(s.url);
          return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name) + '</a>' : esc(s.name);
        }).filter(Boolean);
        if (!labels.length) return '';
        var records = ids.map(function (id) { return (d.sources || []).filter(function (s) { return s.id === id; })[0]; }).filter(Boolean);
        var official = it.status === 'official' || records.some(function (s) { return s.trust === 'official'; });
        var community = records.some(function (s) { return s.trust === 'community'; });
        var kind = official && community ? 'Official + community' : official ? 'Official source' : ids.length > 1 ? 'Corroborated' : community ? 'Community source' : 'Source trust not labelled';
        return '<small class="evd-claim-source"><span>' + kind + '</span> · ' + labels.join(' · ') + '</small>';
      };
      /* "The free track includes:" followed by bare short lines becomes a label with chips. */
      var lis = [], i = 0;
      while (i < rest.length) {
        var item = rest[i], x = item.text;
        if (/:$/.test(x)) { var kids = []; i++; while (i < rest.length && /^[^.!?:]{3,60}$/.test(rest[i].text)) kids.push(rest[i++].text); lis.push(kids.length ? '<li class="sub"><span>' + fmt(x) + '</span><span class="chips">' + kids.map(function (k) { return '<em>' + fmt(k) + '</em>'; }).join('') + '</span>' + attribution(item) + '</li>' : '<li>' + fmt(x) + attribution(item) + '</li>'); continue; }
        lis.push('<li>' + fmt(x) + attribution(item) + '</li>'); i++;
      }
      var li = null;
      var rk = ranks.map(function (item) { var x = item.text; var m = /^rank (\d+)\s*(deluxe)?\W*(.*)$/i.exec(x); m = [m[0], m[1], (m[2] ? '(Deluxe) ' : '') + m[3]]; var fd = /^Free: (.*?) \| Deluxe: (.*)$/.exec(m[2]); return '<li class="rk"><b>Rank ' + esc(m[1]) + '</b> ' + (fd ? '<span class="fd"><em>Free</em> ' + window.GORICH(esc(fd[1])) + '</span><span class="fd dx"><em>Deluxe</em> ' + window.GORICH(esc(fd[2])) + '</span>' : window.GORICH(esc(m[2]))) + attribution(item) + '</li>'; }).join('');
            var ico = categoryIcon(c[0]);
      var rkBlock = ranks.length > 10 ? '</ul><details class="evd-rk"><summary>All rank rewards (' + ranks.length + ')</summary><ul>' + rk + '</ul></details><ul hidden>' : rk;
      return '<section class="evd-grp"><h4>' + ico + esc(c[1]) + '</h4><ul>' + lis.join('') + rkBlock + '</ul></section>';
    }).join('');
    if (!groups) return '';
    var conf = (d.conflicts || []).map(function (c) {
      return '<p class="srcdis"><b>Sources disagree.</b> ' + esc(c.a.sources.map(function (s) { return srcName(d, s); }).join(', ')) + ': ' + esc(c.a.text) + '. ' + esc(c.b.sources.map(function (s) { return srcName(d, s); }).join(', ')) + ': ' + esc(c.b.text) + '. Check in the game.</p>';
    }).join('');
    var links = (d.sources || []).map(function (s) { var u = safe(s.url); return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name) + '</a>' : esc(s.name); }).join(' · ');
    var many = (d.sources || []).length > 1;
    var gaps = (d.gaps || []).length ? '<p class="note">Some sources do not mention: ' + esc(d.gaps.map(function (g) { return g.field; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ')) + '. Not every write-up covers everything.</p>' : '';
    var checkedAt = String(d.updated || '').slice(0, 10), ageDays = checkedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(checkedAt + 'T00:00:00Z')) / 864e5)) : null;
    var freshness = ageDays === null || !Number.isFinite(ageDays) ? 'Update date unavailable' : ageDays <= 7 ? 'Recently updated' : ageDays <= 21 ? 'Update may be due' : 'Data may be out of date';
    var trusted = (d.sources || []).some(function (s) { return /leekduck\.com$/i.test((function(){try{return new URL(s.url).hostname;}catch(e){return '';}})()); });
    var sourceNote = trusted ? 'Leek Duck is treated as a trusted Pokémon GO community source; official Niantic announcements remain distinct.' : '';
    return '<h3 class="sec2">Event details</h3><div class="evd-card evd-groups">' + conf + groups + '</div>' + gaps + '<p class="evd-src">' + (many ? 'Compared: ' : 'Source: ') + links + (many ? '' : ' (single source, not cross-checked)') + ' · comparison data updated ' + esc(checkedAt || 'date unknown') + ' · <span class="src-fresh" data-age="' + (ageDays === null ? 'unknown' : ageDays) + '">' + freshness + '</span></p>' + (sourceNote ? '<p class="note">' + sourceNote + '</p>' : '');
  }

  /* Seasons and monthly GO Passes: their own layout, in sections with icons. Curated notes come from season.json; rank rows and prices from the compared write-ups. */
  function researchTasksHtml(ev, d) {
    var tasks = d && Array.isArray(d.researchTasks) ? d.researchTasks : [];
    if (!tasks.length) return '';
    function attribution(task) {
      var ids = (task.sources || []).filter(function (id, i, a) { return id && a.indexOf(id) === i; });
      var refs = Array.isArray(task.sourceRefs) && task.sourceRefs.length ? task.sourceRefs : ids.map(function (id) {
        return (d.sources || []).filter(function (s) { return s.id === id; })[0];
      }).filter(Boolean);
      var links = refs.map(function (source) {
        var name = source.name || source.id || '';
        var url = safe(source.url);
        return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(name) + '</a>' : esc(name);
      }).filter(Boolean);
      var label = task.status === 'official' ? 'Official' : task.status === 'corroborated' ? 'Cross-checked' : 'Single source';
      return '<details class="research-task-source"><summary>Source &amp; update</summary><small>' + label + (links.length ? ' · ' + links.join(' · ') : '') + ' · ' + esc(window.GOLIB.researchCheckedText(task.checkedAt)) + '</small></details>';
    }

    /* Only icons that exist in the repo: Stardust, XP, the two berries, Max Potion/Revive, Mega Energy (Mega symbol). */
    function itemIcon(n) { n = String(n || ''); return /stardust/i.test(n) ? '/ico/dust.webp' : /silver pinap/i.test(n) ? '/ico/i/silver-pinap.webp' : /golden razz/i.test(n) ? '/ico/i/golden-razz.webp' : /max potion/i.test(n) ? '/ico/i/max-potion.webp' : /max revive/i.test(n) ? '/ico/i/max-revive.webp' : /\bxp\b/i.test(n) ? '/ico/xp.webp' : /mega energy/i.test(n) ? '/ico/g/mega.webp' : ''; }
    function reward(item, field) {
      if (item.type === 'encounter') {
        var cp = item.cpMin && item.cpMax ? '<small>CP ' + esc(item.cpMin) + '–' + esc(item.cpMax) + '</small>' : '';
        return '<div class="research-reward" role="listitem"><span class="ue-reward-art"><span class="ue-reward-fallback" aria-hidden="true">✦</span>' + (window.GOEventAdapter?exactArt(GOEventAdapter.pokemon({name:item.name,costume:item.costume||/wearing|costume/i.test(item.name),label:item.label,formId:item.formId,costumeId:item.costumeId})):X.monArt(ev,{name:item.name,costume:/wearing|costume/i.test(item.name),role:'featured'},'ea')) + '</span><span><b>' + esc(item.name) + '</b>' + cp + '</span></div>';
      }
      var icon = itemIcon(item.name);
      return '<div class="research-reward research-reward-item" role="listitem"><span class="ue-reward-art ue-reward-item-icon" aria-hidden="true">' + (icon ? '<img alt="" loading="lazy" decoding="async" src="' + icon + '" data-err="rm">' : '<i class="ue-reward-dot"></i>') + '</span><span><b>' + (item.quantity > 1 ? esc(item.quantity) + '× ' : '') + esc(item.name) + '</b></span></div>';
    }
    /* Compact rows grouped by category. Field Research rewards are alternatives; timed and special rewards are all given. */
    var order = ['field', 'timed', 'special'], groups = {};
    tasks.forEach(function (t) { var c = order.indexOf(t.category) >= 0 ? t.category : 'other'; (groups[c] = groups[c] || []).push(t); });
    var NAME = { field: 'Field Research', timed: 'Timed Research', special: 'Special Research', other: 'Research' };
    var NOTE = { field: 'Each task gives one of its listed rewards', timed: 'Rewards are cumulative: you receive all of them', special: 'Rewards are cumulative: you receive all of them', other: '' };
    var html = order.concat(['other']).filter(function (c) { return groups[c]; }).map(function (c) {
      var rows = groups[c].map(function (task) {
        var rw = task.rewards || [], label = window.GOTODAYLOGIC ? GOTODAYLOGIC.researchRewardLabel(task.category, rw.length) : rw.length + ' rewards';
        return '<li class="research-task"><p class="rs-text">' + esc(task.task) + '</p><div class="research-rewards rs-rewards" role="list" aria-label="' + esc(label) + '">' + rw.map(function (r) { return reward(r, task.category === 'field'); }).join('') + '</div></li>';
      }).join('');
      var cites = groups[c].map(attribution).filter(function (h, i, a) { return a.indexOf(h) === i; });
      return '<div class="rs-group" data-research-category="' + c + '"><h3 class="rs-group-h">' + NAME[c] + (NOTE[c] ? ' <small>· ' + NOTE[c] + '</small>' : '') + '</h3><ul class="rs-list">' + rows + '</ul>'
        + (cites.length ? '<details class="research-task-source rs-src"><summary>Sources &amp; updates</summary>' + cites.join('').replace(/<\/?details[^>]*>|<summary>[^<]*<\/summary>/g, '') + '</details>' : '') + '</div>';
    }).join('');
    return '<section class="evd-research"><h3 class="sec2" id="evd-research-title">Research</h3>' + html
      + '<button type="button" class="pill all research-browse" data-open-research data-event-id="' + esc(ev.id) + '">Browse current research</button></section>';
  }

  function seasonPage(ev) {
    var si = ev.season; if (!si) return '';
    var d = findDetails(ev) || { fields: {} }, F = d.fields || {};
    var rank = function (list) { return (list || []).map(function (x) { return x.text; }).filter(function (t) { return /^rank \d+/i.test(t); }); };
    var ico = function (src) { return '<img class="ci" src="' + esc(src) + '" alt="" loading="lazy" decoding="async" data-err="rm">'; };
    var sec = function (title, icon, body) { return body ? '<section class="evd-grp"><h4>' + ico(icon) + esc(title) + '</h4>' + body + '</section>' : ''; };
    var ul = function (items) { return '<ul>' + items.map(function (x) { return '<li>' + window.GORICH(esc(x)) + '</li>'; }).join('') + '</ul>'; };
    // milestone bonuses by tier, free and Deluxe
    var tiers = {};
    rank(F.bonuses).forEach(function (t) { var m = /^rank (\d+)\s*(deluxe)?\W*(.*)$/i.exec(t); if (!m) return; var o = tiers[m[1]] = tiers[m[1]] || { free: [], dx: [] }; (m[2] ? o.dx : o.free).push(tidy(m[3])); });
    if (!Object.keys(tiers).length) (si.milestones || []).forEach(function (m) { tiers[m.rank] = { free: m.items, dx: [] }; });
    Object.keys(tiers).forEach(function (r) { ['free', 'dx'].forEach(function (k) { var a = tiers[r][k]; tiers[r][k] = a.filter(function (x) { return !a.some(function (y) { return y !== x && y.length * 1.5 < x.length && x.toLowerCase().indexOf(y.slice(0, 22).toLowerCase()) >= 0; }); }); }); });
    var tierHtml = Object.keys(tiers).map(Number).sort(function (a, b) { return a - b; }).map(function (r) {
      var o = tiers[r];
      return '<div class="ss-tier"><b class="ss-rank">Rank ' + r + '</b><div>' + (o.free.length ? '<p class="fd"><em>Free</em></p>' + ul(o.free) : '') + (o.dx.length ? '<p class="fd dx"><em>Deluxe</em></p>' + ul(o.dx) : '') + '</div></div>';
    }).join('');
    // rank rewards, free and Deluxe columns
    var rows = rank(F.tickets).map(function (t) { var m = /^rank (\d+)\W*(.*)$/i.exec(t), fd = /^Free: (.*?) \| Deluxe: (.*)$/.exec(m[2]); return fd ? { r: +m[1], f: fd[1], d: fd[2] } : null; }).filter(Boolean).sort(function (a, b) { return a.r - b.r; });
    var rowHtml = function (x) { return '<tr><th>' + x.r + '</th><td>' + window.GORICH(esc(x.f)) + '</td><td>' + window.GORICH(esc(x.d)) + '</td></tr>'; };
    var rewards = rows.length ? '<details class="evd-rk" open><summary>First ' + Math.min(10, rows.length) + ' published ranks</summary><div class="ss-scroll"><table class="ss-tab"><thead><tr><th>Rank</th><th>Free</th><th>Deluxe</th></tr></thead><tbody>' + rows.slice(0, 10).map(rowHtml).join('') + '</tbody></table></div></details>'
      + (rows.length > 10 ? '<details class="evd-rk"><summary>Remaining ' + (rows.length - 10) + ' published ranks</summary><div class="ss-scroll"><table class="ss-tab"><thead><tr><th>Rank</th><th>Free</th><th>Deluxe</th></tr></thead><tbody>' + rows.slice(10).map(rowHtml).join('') + '</tbody></table></div></details>' : '')
      : (si.label === 'GO Pass' ? '<p class="note">Individual rank rewards have not been published or parsed from the linked source yet. Only verified summaries and milestone bonuses are shown.</p>' : '');
    // prices
    var prices = (F.tickets || []).map(function (x) { return tidy(x.text); }).filter(function (t) { return /US\$/.test(t) && !/^rank/i.test(t); });
    var priceHtml = prices.length ? '<ul>' + prices.map(function (t) { return '<li>' + window.GORICH(passPrice(esc(t), ev)) + '</li>'; }).join('') + '</ul>' : '';
    // tasks and points
    var pts = (si.points || []).length ? '<div class="ss-pts">' + si.points.map(function (p) { return '<span class="ss-pt"><b>' + p[1] + '</b><i>pts</i> ' + esc(p[0]) + '<small>' + esc(p[2]) + '</small></span>'; }).join('') + '</div><p class="note">Up to 250 extra points a day: win a raid (100), hatch an Egg (40), catch a Pokémon (5).</p>' : '';
    var out = d.goPassParseWarning ? '<p class="note" role="status">' + esc(d.goPassParseWarning) + (d.goPassRetainedAt ? ' Saved rank snapshot: ' + esc(String(d.goPassRetainedAt).slice(0, 10)) + '.' : '') + '</p>' : '';
    out += (si.sections || []).slice(0, 1).map(function (x) { return sec(x.t, x.icon, ul(x.items)); }).join('');
    out += sec('Milestone bonuses', '/ico/xp.webp', tierHtml);
    out += sec('Rank rewards', '/ico/g/powerup.webp', rewards);
    out += sec('Tasks and points', '/ico/candy.webp', pts);
    out += sec('Prices', '/ico/pass.webp', priceHtml);
    out += (si.sections || []).slice(1).map(function (x) { return sec(x.t, x.icon, ul(x.items)); }).join('');
    var links = (d.sources || []).map(function (s) { var u = safe(s.url); return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name) + '</a>' : esc(s.name); }).join(' · ');
    return '<h3 class="sec2">' + esc(si.label === 'GO Pass' ? 'GO Pass' : 'Season') + ' details</h3><div class="evd-card evd-groups">' + out + '</div><p class="evd-src">Source: ' + (links || '<a href="' + esc(safe(si.url)) + '" target="_blank" rel="noopener noreferrer">Leek Duck</a>') + (d.updated ? ' · comparison data updated ' + esc(String(d.updated).slice(0, 10)) : '') + '. Banner picture: Leek Duck.</p>';
  }
  /* A live (Leek Duck) item can arrive without the curated write-up, pictures or bonuses even though the app holds them. Fill the gaps at display time:
     first from the curated card for the same article or name, then from the compared event write-up (short lines such as "Minior (Red Core)" are Pokémon). */
  function slugOf(u) { var p = String(u || '').split(/[?#]/)[0].split('/').filter(Boolean); return (p.pop() || '').toLowerCase(); }
  function completeEvent(ev) {
    if ((ev.featured && ev.featured.length) && (ev.bonuses && ev.bonuses.length || (ev.notes && ev.notes.length))) return ev;
    var out = Object.assign({}, ev), D0 = (G.D && G.D.events) || [], n = LIB.norm(ev.name), sl = slugOf(ev.link) || String(ev.id).split(':').pop().toLowerCase();
    var c = D0.filter(function (x) { return (x.sourceUrl && slugOf(x.sourceUrl) === sl && sl.indexOf('-') > 0) || (String(ev.id).replace(/^cur:/,'') === x.id); })[0];
    if (c) {
      if (!(out.featured && out.featured.length)) out.featured = (c.art || []).map(function (a) { a = typeof a === 'string' ? { n: a } : a; return { name: a.n, costume: !!a.costume, shiny: !!a.shiny, label: a.label, role: 'featured' }; });
      if (!(out.bonuses && out.bonuses.length)) out.bonuses = (c.bonuses || []).slice();
      if (!(out.notes && out.notes.length)) out.notes = (c.p || []).filter(function (t) { return !(window.GOLIB && GOLIB.isPlaceholder && GOLIB.isPlaceholder(t)); });
    }
    var d = findDetails(ev);
    return out;
  }
  function hasDetails(ev) { var d = findDetails(ev); return !!(d && d.fields && Object.keys(d.fields).some(function (k) { return (d.fields[k] || []).length; })); }
  function toolbarHtml(ev){
    var saved=X.isSaved(ev.id);
    var share='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
    var dots='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>';
    return '<div class="evd-bar"><button type="button" class="hbtn" id="evd-x" aria-label="Close event details"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><span class="tag">EVENT DETAIL</span>'
      + '<button type="button" class="hbtn star' + (saved ? ' on' : '') + '" data-save="' + esc(ev.id) + '" aria-pressed="' + saved + '" aria-label="Save ' + esc(ev.name) + '" title="Saved events send you a Telegram reminder">' + (saved ? '★' : '☆') + '</button>'
      + '<button type="button" class="hbtn" data-evlink="' + esc(ev.id) + '" aria-label="Copy or share a link to this event" title="Copy or share link">' + share + '</button>'
      + '<button type="button" class="hbtn" data-evmenu="' + esc(ev.id) + '" aria-haspopup="menu" aria-expanded="false" aria-label="More actions" title="More actions">' + dots + '</button></div>';
  }
  function venueHtml(ev,venues){
    if(!venues.length)return '';
    return '<h3 class="sec2" id="evd-locations">Locations &amp; routes <span class="m">sourced venues</span></h3><div class="evd-card evd-venues">' + venues.map(function (p) { return '<article class="evd-venue"><div><b>' + esc(p.name) + '</b><small>' + esc([p.city, p.region, p.country].filter(Boolean).join(', ')) + '</small><span class="note">' + esc(p.type || 'Event location') + '</span></div><div class="evd-venue-actions"><button type="button" class="pill" data-copycoord="' + esc(p.lat.toFixed(6) + ',' + p.lng.toFixed(6)) + '">Copy coordinates</button><button type="button" class="pill" data-places="' + esc(p.id) + '">Place details</button>' + (p.route && safeGpx(p.route.file) && safe(p.route.url) && p.route.verified ? '<a class="pill all" href="' + esc(safeGpx(p.route.file)) + '" download>Download route GPX</a>' : '') + '</div></article>'; }).join('') + '<div class="evd-venue-foot"><button type="button" class="pill all" data-gpx="' + venues.map(function (p) { return esc(p.id); }).join(',') + '" data-gpxname="' + esc(ev.name) + '"' + (venues.length > 1 ? ' data-gpxorder="1"' : '') + '>Download venue points GPX</button><p class="note">' + (venues.length > 1 ? 'Sourced venue points in this event; this is a list of stops, not a walking route.' : 'A GPX waypoint for this venue, not a walking route.') + '</p></div></div>';
  }
  function renderLegacy(ev) {
    var k = X.kindOf(ev), I = DATA.info, e = findInfo(ev), saved = X.isSaved(ev.id);
    var eventSources = Array.isArray(ev.sources) ? ev.sources : [];
    var primarySource = eventSources.filter(function (s) { return s && (s.id === 'official' || /(^|\.)pokemongo\.com\//i.test(s.url || '')); })[0] || eventSources[0] || (e && e.source ? e.source : null);
    var link = (primarySource && safe(primarySource.url)) || safe(ev.link) || (e && e.source ? safe(e.source.url) : '');
    var linkLabel = primarySource && primarySource.name ? 'Open ' + primarySource.name : 'Open source';
    // The dataset snapshot date is not evidence that this event's source was checked on that date.
    var sourceChecked = (primarySource && (primarySource.observed || primarySource.checked)) || ev.seen || '';
    var sourceAge = sourceChecked ? Math.max(0, Math.floor((Date.now() - Date.parse(String(sourceChecked).slice(0, 10) + 'T00:00:00Z')) / 864e5)) : null;
    var sourceFresh = sourceAge === null || !Number.isFinite(sourceAge) ? 'Check date unavailable' : sourceAge <= 7 ? 'Recently checked' : sourceAge <= 21 ? 'Worth rechecking' : 'May be out of date';
    var leekDuckSource = primarySource && /leekduck[.]com$/i.test((function(){try{return new URL(primarySource.url).hostname;}catch(e){return '';}})());
    var venues = window.GOPLACES ? window.GOPLACES.forEvent(ev) : [];
    var hasBonusHighlights = !!(ev.bonuses && ev.bonuses.length);
    var hasMoveHighlights = EVM.some(function (m) { return m.eventId === ev.id || m.eventId === String(ev.id).replace(/^cur:/,''); });
    var hasFeaturedHighlights = (ev.featured || []).some(function (f) { return f && f.role !== 'shiny_form'; });
    var hasHighlights = hasBonusHighlights || hasMoveHighlights || hasFeaturedHighlights;
    var highlightOnMoves = !hasBonusHighlights && hasMoveHighlights;
    var highlightOnFeatured = !hasBonusHighlights && !hasMoveHighlights && hasFeaturedHighlights;
    var h = toolbarHtml(ev);
    if (ev.img) h += seasonBannerHtml(ev);
    h += '<header class="evd-hero" style="--k:' + k[1] + ';--kf:' + k[2] + '"><div class="evd-art">' + X.featArts(ev, 3) + '</div><span class="kind">' + esc(k[0]) + '</span><h2 id="evd-t">' + esc(ev.name) + '</h2>'
      + '<p class="evc-when">' + esc(X.timeMeta(ev)) + '</p><p class="cdn evd-cd">' + esc(X.countdown(ev)) + '</p>' + X.signalChips(ev, 8, true) + X.cpRows(ev) + '<div class="evd-chips">' + X.statusChip(ev) + '</div></header>';
    h += '<nav class="evd-jump" aria-label="Jump to event details">' + (hasHighlights ? '<a href="#evd-highlights">Highlights</a>' : '') + '<a href="#evd-information">Details</a>' + (venues.length ? '<a href="#evd-locations">Locations</a>' : '') + '<a href="#evd-sources">Sources</a></nav>';
    h += '<p class="evd-fresh">Event data as of ' + esc(G.D.asOf || '') + '</p>';
    var scheduleNotes = e && (e.scheduleNotes || e.scheduleNote);
    if (scheduleNotes) {
      if (!Array.isArray(scheduleNotes)) scheduleNotes = [scheduleNotes];
      h += '<aside class="schedule-notes"><b>Schedule notes</b><ul>' + scheduleNotes.filter(Boolean).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></aside>';
    }
    h += '<div class="evd-btns"><a class="pill all" download="' + esc(ev.id) + '.ics" href="' + icsFor(ev) + '">Add to calendar</a>' + (link ? '<a class="pill" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(linkLabel) + '</a>' : '<span class="npub" data-nolink>No source link published</span>') + '</div>';
    if (ev.bonuses && ev.bonuses.length) h += '<h3 class="sec2" id="evd-highlights">Bonuses</h3><div class="bonuses">' + ev.bonuses.map(function (b) { var chip = G.bonusChip(b); var img = /max particle/i.test(b) ? X.IMG_PARTICLE : /power spot/i.test(b) ? X.IMG_POWERSPOT : ''; return img ? chip.replace(/<(svg|img)[\s\S]*?(<\/svg>|>)(?=<b>|<span>)/, '<img class="gi gi-pic" src="' + esc(img) + '" alt="" loading="lazy" decoding="async" data-err="rm">') : chip; }).join('') + '</div>';
    h += evMovesHtml(ev, highlightOnMoves);
    if (ev.featured && ev.featured.length) h += featuredSections(ev, highlightOnFeatured);
    h += '<h3 class="sec2" id="evd-information">What is in this event</h3>';
    if (e && Array.isArray(e.info) && e.info.length) {
      h += '<div class="evd-card">' + e.info.map(infoRow).join('') + '</div>' + srcLine(e.source);
    } else if (ev.notes && ev.notes.length) {
      // Use the concrete notes already attached to this event before falling back to an empty detail state.
      h += '<div class="evd-card">' + ev.notes.map(function (n) {
        return '<div class="evd-row"><div class="v"><p>' + window.GORICH(esc(n)) + '</p></div></div>';
      }).join('') + '</div><p class="note">Listed in this app\'s event schedule. Check the linked source for the latest complete information.</p>';
    } else if (hasDetails(ev)) {
      h += '<p class="note">Full details from the sources are listed below.</p>';
    } else {
      h += '<div class="npub-card">The schedule confirms the event name and dates, but no further details have been recorded yet. Spawns, raids, eggs, research, shiny chances, moves and forms are not confirmed here. Check the source for updates.</div>';
    }
    var researchCards = researchTasksHtml(ev, findDetails(ev));
    if (researchCards) h += researchCards;
    if (e && ((Array.isArray(e.tickets) && e.tickets.length) || (Array.isArray(e.alsoRunning) && e.alsoRunning.length))) {
      h += '<h3 class="sec2">Passes &amp; tickets <span class="m">all optional</span></h3><p class="note">Ticket prices and availability can vary by region. Check the in-game shop for the price available to your account.</p>';
      h += (e.tickets || []).map(passCard).join('');
      if (e.alsoRunning && e.alsoRunning.length) h += '<h3 class="sec2">Also running: GO Pass</h3>' + e.alsoRunning.map(passCard).join('');
      h += '<p class="note">Gigantamax Day, Mega Day and in-person tickets use this same card when an event has one.</p>';
    }
    h += ev.season ? seasonPage(ev) : sourcesBlock(ev);
    h += venueHtml(ev,venues);
    h += '<h3 class="sec2" id="evd-sources">Where this comes from</h3><div class="evd-card"><div class="evd-row"><span class="k">Schedule</span><div class="v"><p>' + X.statusChip(ev) + ' ' + esc(ev.source || '') + '</p></div></div>'
      + (e ? '<div class="evd-row"><span class="k">Details</span><div class="v">' + srcLine(e.source) + '</div></div>' : '') + '</div>'
      + '<p class="note">Source checked: ' + esc(sourceChecked || 'date unavailable') + ' · <span class="src-fresh" data-age="' + (sourceAge === null ? 'unknown' : sourceAge) + '">' + sourceFresh + '</span>' + (leekDuckSource ? '. Leek Duck is treated as a trusted primary Pokémon GO community source; it is distinct from a Niantic announcement.' : '') + '</p>'
      + '<p class="note">If sources disagree the event is marked Conflicting. Official and community information is never merged.</p>';
    return h;
  }

  function primary(html) {
    var template=document.createElement('template');template.innerHTML=html||'';
    template.content.querySelectorAll('.evd-src,.evd-claim-source,.research-task-source,.src-fresh,.pub,.npub,.st,.note[role="status"]').forEach(function(node){node.remove();});
    return template.innerHTML;
  }
  function calendarEvent(ev,model){var range=GOEventClock.range(model.schedule,GOEventClock.viewerZone());return Object.assign({},ev,{start:new Date(range.start),end:new Date(range.end),utc:true});}
  function eventWindow(model,ev) {
    if(model.lifecycle==='postponed')return 'Postponed · New dates to be announced';
    if(!model.schedule){
      if(model.dateText)return model.dateText;
      var published=model.internalValidation&&model.internalValidation.legacyDates||{};
      if(/^\d{4}-\d{2}-\d{2}$/.test(published.start||'')&&GOEventClock.valid(published.start+'T00:00',false)&&(!published.end||GOEventClock.valid(published.end.slice(0,10)+'T00:00',false))){var dates=new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short',year:'numeric'});return dates.format(new Date(published.start+'T12:00Z'))+(published.end&&published.end!==published.start?' – '+dates.format(new Date(published.end.slice(0,10)+'T12:00Z')):'')+' · Event times to be confirmed';}
      return ev.datesKnown===false?'Dates to be announced':X.timeMeta(ev);
    }
    try{
      var viewer=GOEventClock.viewerZone(),range=GOEventClock.range(model.schedule,viewer);
      function inZone(zone){var f=new Intl.DateTimeFormat('en-AU',{timeZone:zone,weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'});return f.format(new Date(range.start))+' – '+f.format(new Date(range.end));}
      if(model.schedule.timeBasis==='player-local')return inZone(viewer)+' · Local time wherever you play';
      return 'Your time: '+inZone(viewer)+(model.schedule.timeBasis==='local'&&model.schedule.timeZone!==viewer?' · Venue: '+inZone(model.schedule.timeZone):'');
    }catch(error){return 'Time needs confirmation in your selected time zone.';}
  }
  /* Overview times: the viewer's time and the event location's own time, each labelled with its zone. DST-safe (Intl + IANA zones). */
  function overviewTimes(model,ev) {
    var TL=window.GOTODAYLOGIC; if(!TL)return '';
    function row(k,v,cls){return '<div class="ue-time'+(cls?' '+cls:'')+'"><span class="k">'+esc(k)+'</span><span class="v">'+esc(v)+'</span></div>';}
    var place=(typeof model.location==='string'?model.location:model.location&&model.location.name)||ev.region||ev.place||'';
    var vz=TL.venueZone({tz:ev.tz||ev.timeZone||(model.schedule&&model.schedule.timeBasis==='local'?model.schedule.timeZone:''),place:place});
    var viewer=GOEventClock.viewerZone(),h='';
    try{
      if(model.schedule&&model.schedule.timeBasis==='player-local'){
        var r0=GOEventClock.range(model.schedule,viewer),d0=TL.dualTime(r0,'',viewer);
        h=row('Your time',d0.viewer)+row('Local time','Local time wherever you play');
      }else if(model.schedule){
        var r=GOEventClock.range(model.schedule,viewer),d=TL.dualTime(r,vz,viewer);
        h=row('Your time',d.viewer)+(d.venue?row('Event local',d.venue):'');
        if(!d.venue&&place&&!vz)h+=row('Location',place);
      }else{
        var pub=model.internalValidation&&model.internalValidation.legacyDates||{};
        if(/^\d{4}-\d{2}-\d{2}$/.test(pub.start||'')){var vd=TL.venueDays(pub.start,pub.end||pub.start,vz,viewer);h=row(vz?'Event local dates ('+vd.venueLabel+')':'Dates',vd.days)+(vd.viewerLine?row('Your time',vd.viewerLine):'')+row('Hours','Event times to be confirmed');}
      }
    }catch(error){h='';}
    if(!h){var fw=eventWindow(model,ev);if(fw)h=row('When',fw);}
    var out=h?'<div class="ue-times evc-when" role="group" aria-label="Event times">'+h+'</div>':'';
    return out+overviewFacts(model,place);
  }
  /* Key facts and debut chips from verified model fields only; absent data is simply not shown. */
  function overviewFacts(model,place){
    var facts=[];
    var priced=(model.tickets||[]).filter(function(t){return t&&t.price&&Number.isFinite(t.price.amount)&&/^[A-Z]{3}$/.test(t.price.currency);})[0];
    if(priced){try{facts.push(['Ticket',new Intl.NumberFormat('en-AU',{style:'currency',currency:priced.price.currency,currencyDisplay:'code'}).format(priced.price.amount)]);}catch(e){}}
    else if((model.tickets||[]).length)facts.push(['Tickets','Optional']);
    if((model.bonuses||[]).length)facts.push(['Bonuses',String(model.bonuses.length)]);
    if((model.research||[]).length)facts.push(['Research',String(model.research.length)]);
    var h=facts.length?'<ul class="ue-factchips" aria-label="At a glance">'+facts.map(function(f){return '<li><span>'+esc(f[0])+'</span><b>'+esc(f[1])+'</b></li>';}).join('')+'</ul>':'';
    var debuts=(model.pokemon||[]).filter(function(p){return p.debut;}).slice(0,6);
    if(debuts.length)h+='<div class="ue-debuts"><h3 class="ue-mini-h">Debuts</h3><div class="ue-chips">'+debuts.map(function(p){return '<span class="ue-chip">'+esc(displayName(p))+'</span>';}).join('')+'</div></div>';
    return h;
  }
  function heroWhen(model,ev){return eventWindow(model,ev);}
  function displayName(p){
    if(p.costumeId)return p.name;
    return GOEventAdapter.collectionName(p) || (GOLIB.parseForm(p.name).base!==p.name?p.name:p.name+(p.label?' ('+p.label+')':p.formId?' ('+p.formId+')':''));
  }
  function exactArt(p) {
    var name=displayName(p),q='/api/art?n='+encodeURIComponent(name),described=GOEventAdapter.collectionName(p);
    if(p.formId&&!p.costumeId&&!described&&GOLIB.parseForm(p.name).base===p.name)return '<span class="art costume-unavailable ea" role="img" aria-label="'+esc(name+' · form art unavailable')+'"><span>'+esc(name)+'</span><small>Form art unavailable</small></span>';
    return G.art({n:name,costume:!!p.costumeId,label:p.label||p.costumeId,asset:p.assetKey||undefined,dynamax:p.formId==='dynamax'||/-dynamax$/.test(p.formId||'')},'ea');
  }
  var currentEv=null;
  function render(ev) {
    if(!window.GOEventAdapter || !window.GOEventComponents) return renderLegacy(ev);
    var d=findDetails(ev)||{}, info=findInfo(ev)||{}, snapshot=(DATA.catalogue||[]).find(function(item){return item.eventId===ev.id || item.eventId===String(ev.id).replace(/^cur:/,'') || (item.aliases||[]).indexOf(ev.id)>=0;});
    var model=window.GOEventAdapter.adapt(ev.universalModel || Object.assign({},ev,{id:snapshot?snapshot.eventId:ev.id}),d,info);
    if(snapshot && snapshot.eventId===model.eventId)model=window.GOEventAdapter.retain(snapshot,model);
    activeModel=model;currentEv=ev;
    var venues=window.GOPLACES?GOPLACES.forEvent(ev):[];
    var tickets=(info.tickets||[]).map(passCard).join('');
    var pass=ev.season?primary(seasonPage(ev)):'';

    var calendar=null;try{if(model.schedule)calendar=calendarEvent(ev,model);}catch(error){}
    var sources=model.sources.map(function(src){var url=safe(src.url);return url?'<li><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(src.name||src.label||'Event source')+'</a></li>':'';}).filter(function(v,i,a){return v&&a.indexOf(v)===i;}).join('');
    var conflicts=(model.internalValidation&&model.internalValidation.conflicts||[]).map(function(c){var values=[c.a&&c.a.text,c.b&&c.b.text].filter(Boolean);return '<li>'+esc(c.field==='shiny'?'Shiny availability':c.field||'Event detail')+(values.length?': '+values.map(esc).join(' / '):' needs rechecking.')+'</li>';}).join('');
    var catalogue=window.GOEventRegistry&&GOEventRegistry.diagnostics?GOEventRegistry.diagnostics():{},heldUpdate=catalogue.rejectedCount||catalogue.conflicts&&catalogue.conflicts.length;
    var cands=[
      {url:safe(ev.img),pageUrl:safe(ev.artPageUrl||ev.link)||''},
      {url:safe(d.image),pageUrl:safe(d.imageProvenance&&d.imageProvenance.sourceUrl)||'',source:d.imageProvenance&&d.imageProvenance.source},
      {url:safe(model.image),pageUrl:model.image===d.image?safe(d.imageProvenance&&d.imageProvenance.sourceUrl)||'':model.image===ev.img?safe(ev.artPageUrl||ev.link)||'':''},
      {url:safe(info&&info.image)}
    ].filter(function(c){return c.url;});
    var seasonThumb=ev.season?safeSeasonThumb(ev.season.thumbnail):'';
    var art=window.GOEVENTART?GOEVENTART.resolve({name:model.title||ev.name,kind:ev.kind,region:(typeof model.location==='string'?model.location:model.location&&model.location.name)||ev.region||'',start:ev.start,end:ev.end,img:''},cands):null;
    if(art&&art.kind==='official'&&seasonThumb){art.src=seasonThumb;art.fullSrc=safe(ev.img)||art.provenance.imageUrl;}
    var accentMon=model.pokemon[0],accent=art&&accentMon?'<span class="ev-art-mon">'+exactArt(accentMon)+'</span>':'';
    if(art&&art.kind==='official'&&model.internalValidation&&model.internalValidation.artScope==='series'){art.provenance.scope='series';art.provenance.label=model.internalValidation.artLabel||'Series artwork';art.provenance.pageUrl=model.internalValidation.artSourceUrl||'';}
    var artHtml=art?GOEVENTART.banner(art,{ev:{name:ev.name||model.title,kind:ev.kind,region:ev.region},accent:accent}):'';
    var artNote=art?'<p class="note evd-art-note" data-art-provenance="'+art.kind+'">'+(art.provenance?'Event artwork: '+esc(art.provenance.source)+' · verified for '+esc(art.provenance.verifiedFor)+(safe(art.provenance.url)?' · <a href="'+esc(art.provenance.imageUrl)+'" target="_blank" rel="noopener noreferrer">image</a>':''):'Themed banner: no verified event artwork is published for this event.')+'</p>':'';
    var footer='<details class="ue-sources" id="evd-sources"><summary>Sources &amp; updates</summary>'+artNote+(heldUpdate?'<p class="note">The latest event update was held. Showing the last available information.</p>':'')+(DATA.incomplete?'<p class="note">Some supplementary event information could not be loaded. Showing the available announcement. Reload to try again.</p>':'')+'<ul>'+sources+'</ul>'+(conflicts?'<h4>Details to recheck</h4><ul>'+conflicts+'</ul>':'')+(d.updated?'<p class="note">Last update '+esc(String(d.updated).slice(0,10))+'</p>':'')+(d.goPassParseWarning?'<p class="note">The last complete GO Pass rewards have been retained while the latest update is checked.'+(d.goPassRetainedAt?' Saved rank snapshot: '+esc(String(d.goPassRetainedAt).slice(0,10))+'.':'')+'</p>':'')+'</details>';
    return window.GOEventComponents.render(model,{
      toolbar:toolbarHtml(ev).replace('<span class="tag">EVENT DETAIL</span>',''),clock:window.GOEventClock,viewerZone:GOEventClock.viewerZone(),safe:safe,rewardArt:function(item){return exactArt(GOEventAdapter.pokemon({name:item.name,costume:!!item.costume,label:item.label,formId:item.formId,costumeId:item.costumeId,asset:item.assetKey}));},artHtml:artHtml,
      when:heroWhen(model,ev),overview:overviewTimes(model,ev),artKind:function(p){var c=window.GOTODAYLOGIC&&GOTODAYLOGIC.classifyArt({name:displayName(p),costume:!!p.costumeId});return c&&c.exact?c.label||'Form':'';},countdown:model.schedule&&model.lifecycle!=='cancelled'&&model.lifecycle!=='postponed'&&ev.datesKnown!==false?X.countdown(ev):'',
      nameFor:displayName,art:G.art,artFor:exactArt,bonus:G.bonusChip,
      actions:'<div class="evd-btns">'+(calendar&&model.lifecycle!=='cancelled'&&model.lifecycle!=='postponed'?'<a class="pill all" download="event.ics" href="'+icsFor(calendar)+'">Add to calendar</a>':'')+'</div>',
      research:primary(researchTasksHtml(ev,d)),passes:pass,tickets:primary(tickets),moves:primary(evMovesHtml(ev,!model.bonuses.length)),
      locations:venueHtml(ev,venues),sources:footer
    });
  }
  /* Featured Pokémon, grouped by what is special about each one in this event. */
  var SVG = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; };
  var TAGS = {
    debut: { t: 'Debut', i: SVG('M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z') },
    shinydebut: { t: 'Shiny debut', i: '<img src="/ico/shiny.webp" alt="" loading="lazy" decoding="async">' },
    maxdebut: { t: 'Dynamax debut', i: SVG('M13 2L4 14h7l-1 8 9-12h-7z') },
    boostedshiny: { t: 'Boosted shiny', i: '<span class="tg-w"><img src="/ico/shiny.webp" alt="" loading="lazy" decoding="async"><i>+</i></span>' },
    shiny: { t: 'Shiny', i: '<img src="/ico/shiny.webp" alt="" loading="lazy" decoding="async">' },
    incense: { t: 'Incense', i: '<img src="/ico/incense.webp" alt="" loading="lazy" decoding="async">' },
    costume: { t: 'Costume', i: SVG('M8 3l-5 3 2 4 2-1v11h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z') },
    power: { t: 'Mega, Max & moves', i: '<img src="/ico/g/mega.webp" alt="" loading="lazy" decoding="async">' },
    raid: { t: 'Raid boss', i: '<img src="/ico/g/raid.webp" alt="" loading="lazy" decoding="async">' },
    egg: { t: 'Hatches', i: '<img src="/ico/g/egg-5km.webp" alt="" loading="lazy" decoding="async">' },
    wild: { t: 'Wild', i: SVG('M5 19C5 9 11 5 20 4c0 9-4 15-14 15zM5 19l8-8') }
  };
  var SECTIONS = [
    ['Debuts', ['debut', 'shinydebut', 'maxdebut']],
    ['Shiny odds', ['boostedshiny', 'shiny']],
    ['Incense', ['incense']],
    ['Costumes and visors', ['costume']],
    ['Mega, Max and moves', ['power']],
    ['Raid bosses', ['raid']],
    ['Wild and hatches', ['wild', 'egg']]
  ];
  function specials(ev, f) {
    var base = String(f.name).toLowerCase(), out = {}, line = '';
    function has(txt) { return String(txt || '').toLowerCase().indexOf(base) > -1; }
    (ev.highlights || []).forEach(function (h) {
      if (!h || !has(h.label)) return;
      var L = h.label + '';
      if (h.type === 'debut') out[/shiny/i.test(L) ? 'shinydebut' : /dynamax|gigantamax|max/i.test(L) ? 'maxdebut' : 'debut'] = 1;
      else if (h.type === 'new-shiny') out.shinydebut = 1;
      else if (h.type === 'boosted-shiny') { out.boostedshiny = 1; if (/incense/i.test(L)) out.incense = 1; }
      else if (h.type === 'incense-encounters') out.incense = 1;
      else if (h.type === 'wild-encounters') out.wild = 1;
    });
    (ev.notes || []).forEach(function (n) {
      if (!has(n)) return;
      var hit = false;
      if (/debut/i.test(n)) { out[/shiny/i.test(n) ? 'shinydebut' : /dynamax|gigantamax/i.test(n) ? 'maxdebut' : 'debut'] = 1; hit = true; }
      if (/shiny/i.test(n)) { out[/higher|boost|increase|more|better/i.test(n) ? 'boostedshiny' : 'shiny'] = 1; hit = true; }
      if (/incense/i.test(n)) { out.incense = 1; hit = true; }
      if (/mega|super max|max level|max move|charged attack|fast attack|\bmove\b|discharge/i.test(n)) { out.power = 1; hit = true; }
      if (/costume|visor|\bhat\b|outfit|wearing/i.test(n)) { out.costume = 1; hit = true; }
      if (/hatch|egg/i.test(n)) { out.egg = 1; hit = true; }
      if (hit && !line) line = n;
    });
    if (f.costume || /visor|hat|costume|outfit/i.test(f.label || '')) out.costume = 1;
    if (f.role === 'raid_boss') out.raid = 1;
    if (/^mega |^primal /i.test(f.name)) out.power = 1;
    var keys = Object.keys(out);
    return { keys: keys, line: line };
  }
  function featuredSections(ev, highlightTarget) {
    var seen = {}, mons = (ev.featured || []).filter(function (f) { if (f.role === 'shiny_form') return false; var k = f.name.toLowerCase() + '|' + (f.costume ? 1 : 0); if (seen[k]) return false; seen[k] = 1; return true; });
    var groups = SECTIONS.map(function (s) { return { title: s[0], keys: s[1], rows: [] }; }), rest = [];
    mons.forEach(function (f) {
      var sp = specials(ev, f), row = { f: f, sp: sp }, placed = false;
      for (var i = 0; i < groups.length && !placed; i++) { if (sp.keys.some(function (k) { return groups[i].keys.indexOf(k) > -1; })) { groups[i].rows.push(row); placed = true; } }
      if (!placed) rest.push(row);
    });
    groups.push({ title: groups.some(function (g) { return g.rows.length; }) ? 'Also featured' : 'Featured Pokémon', keys: [], rows: rest });
    var visibleGroups = groups.filter(function (g) { return g.rows.length; });
    return visibleGroups.map(function (g, index) {
      return '<h3 class="sec2"' + (highlightTarget && index === 0 ? ' id="evd-highlights"' : '') + '>' + esc(g.title) + '</h3><div class="evd-feat">' + g.rows.map(function (r) {
        var f = r.f, tags = r.sp.keys.map(function (k) { return '<span class="tg tg-' + k + '">' + TAGS[k].i + esc(TAGS[k].t) + '</span>'; }).join('');
        return '<div class="evd-f"><span>' + X.monArt(ev, f, 'ea') + '</span><div class="evd-fm"><b>' + esc(f.name) + '</b>' + (tags ? '<div class="tgs">' + tags + '</div>' : '') + (f.label ? '<small>' + esc(f.label) + '</small>' : '') + (r.sp.line ? '<small class="ln">' + esc(r.sp.line) + '</small>' : '') + '</div>' + '</div>';
      }).join('') + '</div>';
    }).join('');
  }
  function close(silent) { var o = $('evd'); if (!o || o.hidden) return; spyDestroy(); o.hidden = true; document.body.style.overflow = ''; try { document.dispatchEvent(new Event('gofn-detail-closed')); } catch (err) { } var target = opener; if ((!target || !target.isConnected) && openerKey) { var candidates = document.querySelectorAll('[data-open]'); for (var i = 0; i < candidates.length; i++) { var candidate = candidates[i]; if (candidate.getClientRects().length && candidate.getAttribute('data-open') === openerKey && (!openerClass || String(candidate.className || '').trim() === openerClass)) { target = candidate; break; } } } if (!target || !target.isConnected || !target.getClientRects().length) { var host = openerHostId ? $(openerHostId) : null; if (!host || !host.getClientRects().length) { host = $('home-now'); if (!host || !host.getClientRects().length) host = document.querySelector('[role="tabpanel"]:not([hidden]) h1, [role="tabpanel"]:not([hidden]) h2, [role="tabpanel"]:not([hidden]) h3'); } if (host) { if (!host.hasAttribute('tabindex')) host.setAttribute('tabindex', '-1'); target = host; } } if (target && target.isConnected && target.focus) target.focus(); opener = null; openerHostId = ''; openerKey = null; openerClass = ''; if (silent !== true && window.GONAV) window.GONAV.popped(); }
  /* The event page's own picture (its og:image), shown at the top when the event has none of its own. */
  function addBanner(o, ev) {
    if (ev.img) return;
    var link = safe(ev.link) || '', e0 = findInfo(ev), d0 = findDetails(ev);
    if (!/^https:\/\/(www\.)?(leekduck|pokemongo)\.com\//.test(link)) link = (e0 && e0.source && safe(e0.source.url)) || '';
    if (!/^https:\/\/(www\.)?(leekduck|pokemongo)\.com\//.test(link)) link = ((d0 && d0.sources || []).filter(function (x) { return x && /^https:\/\/(www\.)?(leekduck|pokemongo)\.com\//.test(x.url || ''); })[0] || {}).url || '';
    if (!link) return;
    fetch('/api/og?u=' + encodeURIComponent(link)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var hero = o.querySelector('.evd-hero'); if (!d || !hero || o.hidden || o.querySelector('.evd-banner') || !safe(d.image)) return;
      var im = document.createElement('img'); im.className = 'evd-banner'; im.alt = ''; im.referrerPolicy = 'no-referrer'; im.src = d.image; im.onerror = function () { im.remove(); };
      (hero.querySelector('.ue-hero-media') || hero).prepend(im);
    }).catch(function () {});
  }
  /* Use the viewer's IANA zone; the API also returns the venue's own clock. */
  function venueTimeQuery() {
    try { return '&tz=' + encodeURIComponent(GOEventClock.viewerZone()); }
    catch (e) { return '&tz=Australia%2FMelbourne'; }
  }
  function venueTimeLabel(i) {
    var viewer = String(i.day || '') + ', ' + String(i.show || '') + ' your time';
    var venue = i.venueDay && i.venueShow ? ' · venue: ' + i.venueDay + ', ' + i.venueShow + (i.zone ? ' ' + i.zone : '') : '';
    return esc(viewer + venue);
  }
  /* In-person events with a venue time (Night Out): when the in-game bonuses start, in your time, matching the Telegram reminders. */
  function addBonusTime(o, ev) {
    if(ev.datesKnown===false)return;
    var day = function (v) { return v ? (typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10)) : ''; };
    fetch('/api/venue-times?name=' + encodeURIComponent(ev.name || '') + '&start=' + encodeURIComponent(day(ev.start)) + '&end=' + encodeURIComponent(day(ev.end)) + venueTimeQuery()).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var host = o.querySelector('.ue-times') || o.querySelector('.ue-overview'); if (!d || !d.items || !host || o.hidden || o.querySelector('.evd-bonus')) return;
      var items = window.GOTODAYLOGIC ? GOTODAYLOGIC.matchVenueTimes(d.items, { name: ev.name, start: day(ev.start), end: day(ev.end) }) : [];
      if (!items.length) return;
      var wrap = document.createElement('div'); wrap.className = 'ue-time evd-bonus';
      items.forEach(function (i) {
        var unconfirmed = window.GOTODAYLOGIC && GOTODAYLOGIC.venueTimeUnconfirmed(i);
        var k = document.createElement('span'); k.className = 'k'; k.textContent = unconfirmed ? 'Bonuses (not confirmed)' : 'Bonuses start';
        var v = document.createElement('span'); v.className = 'v'; v.textContent = String(i.day || '') + ', ' + String(i.show || '') + ' your time' + (i.venueDay && i.venueShow && i.zone ? ' · event local: ' + i.venueDay + ', ' + i.venueShow + ' ' + i.zone : '') + (unconfirmed ? ' (expected; Pokémon GO has not confirmed the hours)' : '');
        wrap.append(k, v);
      });
      host.appendChild(wrap);
    }).catch(function () {});
  }
  /* The same bonus-start time on the cards in the list: cards carry an empty line, filled once the venue times have loaded. */
  var venueAll = null;
  function words3(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 3).join(' '); }
  function shiftDay(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  function fillBonus() {
    var pend = document.querySelectorAll('.evc-bonus[hidden]:not([data-done])'); if (!pend.length) return;
    if (!venueAll) venueAll = window.GOVENUE || fetch('/api/venue-times?all=1' + venueTimeQuery()).then(function (r) { return r.ok ? r.json() : { items: [] }; }).catch(function () { return { items: [] }; });
    venueAll.then(function (d) {
      var items = (d && d.items) || [];
      Array.prototype.forEach.call(document.querySelectorAll('.evc-bonus[hidden]:not([data-done])'), function (p) {
        p.setAttribute('data-done', '1');
        var n = p.getAttribute('data-bn') || '', s = p.getAttribute('data-bs') || '', e = p.getAttribute('data-be') || s;
        var hit = window.GOTODAYLOGIC ? GOTODAYLOGIC.matchVenueTimes(items, { name: n, start: s, end: e }) : items.filter(function (i) { return i.name.toLowerCase() === n.toLowerCase(); });
        if (!hit.length) return;
        p.innerHTML = '🎯 Bonuses start ' + hit.slice(0, 3).map(function (i) { return (hit.length > 1 ? esc(String(i.name).replace(/^.* - /, '')) + ' ' : '') + venueTimeLabel(i); }).join(' · ') + (hit.length === 1 && hit[0].note ? ' <small>(' + esc(hit[0].note) + ')</small>' : '');
        p.style.cssText = 'margin:4px 0;font-weight:600'; p.hidden = false;
      });
    });
  }
  var fillTimer = 0;
  if (window.MutationObserver) new MutationObserver(function () { clearTimeout(fillTimer); fillTimer = setTimeout(fillBonus, 200); }).observe(document.body, { childList: true, subtree: true });
  fillBonus();
  function open(id, from) {
    var ev = X.events().concat(window.GOSEASON ? window.GOSEASON.events() : []).filter(function (e) { return e.id === id; })[0];
    if(!ev){if(!DATA){load().then(function(){open(id,from);});return;}var model=window.GOEventRegistry&&GOEventRegistry.find(id);if(!model)return;ev=X.events().find(function(item){return item.id==='cur:'+model.eventId||(model.aliases||[]).indexOf(item.id)>=0;})||GOEventRegistry.display(model);}
    opener = from || document.activeElement;
    openerKey = opener && opener.getAttribute ? opener.getAttribute('data-open') : null;
    openerClass = opener && opener.classList ? String(opener.className || '').trim() : '';
    var hostEl = opener && opener.parentElement && opener.parentElement.closest ? opener.parentElement.closest('[id]') : null; openerHostId = hostEl ? hostEl.id : '';
    load().then(function () {
      var o = $('evd'), wasOpen = !!o && !o.hidden;
      if (!o) { o = document.createElement('div'); o.id = 'evd'; o.className = 'evd'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'evd-t'); document.body.appendChild(o); }
      var ev2 = completeEvent(ev),sourcePoster=findDetails(ev2);
      if(!ev2.img&&sourcePoster&&safe(sourcePoster.image))ev2=Object.assign({},ev2,{img:sourcePoster.image});
      o.innerHTML = '<div class="evd-in">' + render(ev2) + '</div>';
      addBonusTime(o, ev2);
      o.hidden = false; document.body.style.overflow = 'hidden'; o.scrollTop = 0;
      if (!wasOpen && window.GONAV) window.GONAV.push();
      var x = $('evd-x'); if (x) { x.addEventListener('click', function () { close(); }); x.focus(); }
      spyInit(o, ev2.id);
    });
  }
  document.addEventListener('click', function (e) {
    var jump = e.target.closest('.evd-jump a');
    if (jump) {
      var dialog = $('evd'), target = $(String(jump.getAttribute('href') || '').slice(1));
      if (dialog && target && dialog.contains(target)) {
        /* Native fragment navigation emits popstate and closes the modal. Keep section jumps inside it. */
        e.preventDefault();
        if(target.tagName==='DETAILS')target.open=true;
        dialog.querySelectorAll('.evd-jump a').forEach(function(link){link.removeAttribute('aria-current');});
        jump.setAttribute('aria-current','location');
        var nav=jump.parentElement;
        nav.scrollTo({left:jump.offsetLeft-(nav.clientWidth-jump.clientWidth)/2,behavior:'smooth'});
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'start' });
      }
      return;
    }
    var research = e.target.closest('[data-open-research]');
    if (research) {
      e.preventDefault();
      if (window.GOAPP && typeof window.GOAPP.openResearch === 'function') window.GOAPP.openResearch(research.getAttribute('data-event-id') || '');
      return;
    }
    var b = e.target.closest('[data-open]');
    if (b) { if(b.tagName==='A'&&(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0))return;e.preventDefault(); open(b.dataset.open, b); }
  });
  /* Keep keyboard navigation inside the modal while it is open. */
  document.addEventListener('keydown', function (e) {
    var o = $('evd'); if (!o || o.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    var items = Array.prototype.slice.call(o.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')).filter(function (el) {
      return !el.closest('[hidden],[aria-hidden="true"]') && (!el.checkVisibility || el.checkVisibility()) && el.getClientRects().length > 0;
    });
    if (!items.length) { e.preventDefault(); var x = $('evd-x'); if (x) x.focus(); return; }
    var first = items[0], last = items[items.length - 1], active = document.activeElement;
    if (e.shiftKey && (active === first || !o.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !o.contains(active))) { e.preventDefault(); first.focus(); }
  });
  /* Continuous page navigation: tapping a link scrolls to its heading, scrolling updates the active link. The overlay (#evd) is the one scroller. */
  var spy = null, savedScroll = {}, prevRestoration = null;
  function spyOffsets(o) {
    var bar = o.querySelector('.evd-bar'), nav = o.querySelector('.evd-nav'), barH = bar ? bar.offsetHeight : 0, navH = nav ? nav.offsetHeight : 0;
    o.style.setProperty('--evd-bar-h', barH + 'px'); o.style.setProperty('--evd-stack', (barH + navH) + 'px');
    return barH + navH;
  }
  function setActive(o, id) {
    var links = o.querySelectorAll('.evd-nav-link'), active = null;
    links.forEach(function (l) { var on = l.getAttribute('data-sec') === id; if (on) { l.setAttribute('aria-current', 'true'); active = l; } else l.removeAttribute('aria-current'); });
    var strip = o.querySelector('.evd-nav-scroll');
    if (active && strip) strip.scrollTo({ left: active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2, behavior: 'auto' });
    navEdges(o);
  }
  function navEdges(o) {
    var strip = o.querySelector('.evd-nav-scroll'), w = strip && strip.parentNode; if (!w) return;
    w.classList.toggle('has-left', strip.scrollLeft > 4); w.classList.toggle('has-right', strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4);
  }
  /* Which section is active: the last one whose heading has passed under the sticky stack; the last section once the page is at its bottom. */
  function computeActive(o) {
    var secs = [].slice.call(o.querySelectorAll('.evd-sec')); if (!secs.length) return '';
    var stack = spyOffsets(o), line = o.getBoundingClientRect().top + stack + 24, cur = secs[0].getAttribute('data-sec');
    secs.forEach(function (sec) { if (sec.getBoundingClientRect().top <= line) cur = sec.getAttribute('data-sec'); });
    if (o.scrollTop + o.clientHeight >= o.scrollHeight - 4) cur = secs[secs.length - 1].getAttribute('data-sec');
    return cur;
  }
  function spyInit(o, id) {
    spyDestroy();
    if (history.scrollRestoration) { prevRestoration = history.scrollRestoration; try { history.scrollRestoration = 'manual'; } catch (e) { } }
    var state = { o: o, id: id, lock: 0, raf: 0, io: null };
    function tick() { state.raf = 0; if (state.lock) return; var cur = computeActive(o); if (cur && cur !== state.cur) { state.cur = cur; setActive(o, cur); } }
    function ask() { if (!state.raf) state.raf = requestAnimationFrame(tick); }
    state.onScroll = ask; state.onResize = function () { spyOffsets(o); ask(); navEdges(o); };
    o.addEventListener('scroll', state.onScroll, { passive: true });
    window.addEventListener('resize', state.onResize); window.addEventListener('orientationchange', state.onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', state.onResize);
    if ('IntersectionObserver' in window) { state.io = new IntersectionObserver(ask, { root: o, rootMargin: '-' + spyOffsets(o) + 'px 0px 0px 0px', threshold: [0, 1] }); o.querySelectorAll('.evd-sec').forEach(function (s) { state.io.observe(s); }); }
    var strip = o.querySelector('.evd-nav-scroll'); if (strip) strip.addEventListener('scroll', function () { navEdges(o); }, { passive: true });
    spy = state; spyOffsets(o); state.cur = ''; tick();
    if (savedScroll[id]) { o.scrollTop = savedScroll[id]; tick(); }
  }
  function spyDestroy() {
    if (!spy) return; var o = spy.o;
    savedScroll[spy.id] = o.scrollTop;
    o.removeEventListener('scroll', spy.onScroll); window.removeEventListener('resize', spy.onResize); window.removeEventListener('orientationchange', spy.onResize);
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', spy.onResize);
    if (spy.io) spy.io.disconnect(); if (spy.raf) cancelAnimationFrame(spy.raf);
    if (prevRestoration && history.scrollRestoration) { try { history.scrollRestoration = prevRestoration; } catch (e) { } }
    spy = null;
  }
  function goSection(o, id, focus) {
    var h = o.querySelector('#evd-h-' + id); if (!h || !spy) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, stack = spyOffsets(o);
    var top = h.getBoundingClientRect().top - o.getBoundingClientRect().top + o.scrollTop - stack - 8;
    var max = o.scrollHeight - o.clientHeight, target = Math.max(0, Math.min(top, max));
    spy.lock = 1; spy.cur = id; setActive(o, id);
    o.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
    var done = function () { if (!spy) return; spy.lock = 0; clearTimeout(spy.t); o.removeEventListener('scrollend', done); if (focus) h.focus({ preventScroll: true }); spy.cur = ''; spy.raf = 0; spy.onScroll(); };
    o.addEventListener('scrollend', done); clearTimeout(spy.t); spy.t = setTimeout(done, reduce ? 60 : 900);
  }
  document.addEventListener('click', function (e) {
    var l = e.target.closest && e.target.closest('.evd-nav-link'); if (!l) return;
    e.preventDefault(); var o = $('evd'); if (o) goSection(o, l.getAttribute('data-sec'), true);
  });
  document.addEventListener('keydown', function (e) {
    var l = e.target.closest && e.target.closest('.evd-nav-link'); if (!l) return;
    var links = [].slice.call(l.parentNode.querySelectorAll('.evd-nav-link')), i = links.indexOf(l), n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % links.length; else if (e.key === 'ArrowLeft') n = (i - 1 + links.length) % links.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = links.length - 1;
    if (n < 0) return; e.preventDefault(); links[n].focus();
  });
  /* Event overflow menu: infographic, open source, mark done (Today). */
  function closeEvMenu(restore){var m=document.querySelector('.evd-menu');if(!m)return;var b=m.parentNode.querySelector('[data-evmenu]');m.remove();if(b){b.setAttribute('aria-expanded','false');if(restore)b.focus();}}
  document.addEventListener('click',function(e){
    var mb=e.target.closest&&e.target.closest('[data-evmenu]');
    if(!mb){if(!(e.target.closest&&e.target.closest('.evd-menu')))closeEvMenu(false);return;}
    var was=mb.getAttribute('aria-expanded')==='true';closeEvMenu(false);if(was||!currentEv)return;
    var ev=currentEv,src=safe(ev.link)||'',m=document.createElement('div');m.className='evd-menu';m.setAttribute('role','menu');
    m.innerHTML='<button type="button" role="menuitem" class="evd-menuitem" data-infographic="'+esc(ev.id)+'">Infographic</button>'+(src?'<a role="menuitem" class="evd-menuitem" href="'+esc(src)+'" target="_blank" rel="noopener noreferrer">Open source</a>':'')+'<button type="button" role="menuitem" class="evd-menuitem" data-evdone="'+esc(ev.id)+'">Mark done on Today</button>';
    mb.parentNode.appendChild(m);mb.setAttribute('aria-expanded','true');m.querySelector('[role=menuitem]').focus();
  });
  document.addEventListener('click',function(e){
    var d=e.target.closest&&e.target.closest('[data-evdone]');if(!d||!currentEv||!window.GOTODAYLOGIC)return;
    var ev=currentEv,ok=false;try{ok=!!GOTODAYLOGIC.tryMarkDone(window.localStorage,ev.id,ev.start,ev.end,Date.now()).ok;}catch(x){}
    closeEvMenu(false);toast(ok?'Hidden from Today. It stays in Schedule.':'Couldn\u2019t save \u2014 storage is full or unavailable. Nothing was hidden.');
    if(ok)try{document.dispatchEvent(new Event('gofn-today-done'));}catch(x){}
  });
  document.addEventListener('keydown',function(e){var m=document.querySelector('.evd-menu');if(!m)return;
    var items=[].slice.call(m.querySelectorAll('[role=menuitem]')),i=items.indexOf(document.activeElement);
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeEvMenu(true);}
    else if(e.key==='ArrowDown'){e.preventDefault();items[(i+1)%items.length].focus();}
    else if(e.key==='ArrowUp'){e.preventDefault();items[(i-1+items.length)%items.length].focus();}
  },true);
  /* Pokémon info sheet: accessible dialog with focus trap, Escape and focus return. */
  var sheetOpener=null;
  function closeSheet(){var sh=$('ue-sheet');if(!sh)return;sh.remove();if(sheetOpener&&sheetOpener.isConnected)sheetOpener.focus();sheetOpener=null;}
  document.addEventListener('click',function(e){
    var sh=$('ue-sheet');
    if(sh&&(e.target.closest('[data-sheet-close]')||e.target===sh)){closeSheet();return;}
    var b=e.target.closest&&e.target.closest('.ue-mon[data-info]');if(!b)return;
    var info={};try{info=JSON.parse(b.getAttribute('data-info'));}catch(x){}
    closeSheet();sheetOpener=b;
    var d=document.createElement('div');d.id='ue-sheet';d.className='ue-sheet';
    d.innerHTML='<div class="ue-sheet-card" role="dialog" aria-modal="true" aria-labelledby="ue-sheet-t"><div class="ue-sheet-art">'+b.querySelector('.ue-mon-art').innerHTML+'</div><h3 id="ue-sheet-t">'+esc(info.name||'')+'</h3><p class="ue-sheet-m">'+esc([info.method,info.badge].filter(Boolean).join(' · '))+'</p>'
      +(info.form?'<p class="ue-sheet-f">Special form: '+esc(info.form)+'</p>':'')+(info.signals&&info.signals.length?'<p>'+info.signals.map(esc).join(' · ')+'</p>':'')+(info.meta&&info.meta.length?'<p class="ue-sheet-m">'+info.meta.map(esc).join(' · ')+'</p>':'')+'<button type="button" class="pill all" data-sheet-close>Close</button></div>';
    (($('evd'))||document.body).appendChild(d);d.querySelector('[data-sheet-close]').focus();
  });
  document.addEventListener('keydown',function(e){
    var sh=$('ue-sheet');if(!sh)return;
    if(e.key==='Escape'){e.stopImmediatePropagation();e.preventDefault();closeSheet();}
    else if(e.key==='Tab'){e.stopImmediatePropagation();e.preventDefault();sh.querySelector('[data-sheet-close]').focus();}
  },true);
  /* The close button takes focus when the page opens; show its ring only for keyboard users. */
  document.addEventListener('keydown', function (e) { if (e.key === 'Tab' || e.key.indexOf('Arrow') === 0) document.documentElement.setAttribute('data-kbd', '1'); }, true);
  document.addEventListener('pointerdown', function () { document.documentElement.removeAttribute('data-kbd'); }, true);
  window.GOEVD = { close: close };
  document.addEventListener('gofn-state', function () { var o = $('evd'); if (o && !o.hidden) { var s = o.querySelector('[data-save]'); if (s) { var on = X.isSaved(s.dataset.save); s.classList.toggle('on', on); s.textContent = on ? '★' : '☆'; s.setAttribute('aria-pressed', on); var l = o.querySelector('.evd-lead'); if (l) l.hidden = !on; } } });
  document.addEventListener('change', function (e) { var sel = e.target.closest && e.target.closest('select[data-lead]'); if (!sel) return; var v = sel.value; X.usSet('pref:lead:' + sel.getAttribute('data-lead'), v === '' ? null : v); });
  window.GODETAIL = { open: open, close: close };

  /* Links to one event: https://pogo.michaelpuff.com/#event=<id>. The Link button in the event copies (or shares) one;
     opening one waits for the event list, then shows that event. An event that has ended or been replaced shows a short note. */
  function linkFor(id) { return location.origin + '/#event=' + encodeURIComponent(id); }
  function toast(msg) {
    var t = document.getElementById('evtoast');
    if (!t) { t = document.createElement('div'); t.id = 'evtoast'; t.className = 'evtoast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(function () { t.hidden = true; }, 3500);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-evlink]'); if (!b) return;
    var url = linkFor(b.getAttribute('data-evlink')), title = (document.getElementById('evd-t') || {}).textContent || 'Pokémon GO event';
    if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () {}); return; }
    var done = function () { toast('Link copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { toast(url); }); else toast(url);
  });
  function fromHash() {
    var m = /^#event=(.+)$/.exec(location.hash); if (!m) return;
    var id; try { id = decodeURIComponent(m[1]); } catch (err) { return; }
    var tries = 0, tm = setInterval(function () {
      var evs = X.events().concat(window.GOSEASON ? window.GOSEASON.events() : []);
      if (evs.some(function (e) { return e.id === id; }) || (window.GOEventRegistry&&GOEventRegistry.find(id))) { clearInterval(tm); try { history.replaceState(history.state, '', location.pathname + location.search); } catch (err) {} open(id); }
      else if (++tries > 40) { clearInterval(tm); try { history.replaceState(history.state, '', location.pathname + location.search); } catch (err) {} toast('That event is no longer listed.'); }
    }, 250);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
