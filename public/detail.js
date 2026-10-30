/* Event detail: what the event includes, passes and tickets, prices, and where each fact came from.
   Data comes from /event-info.json and /prices.json, so adding or fixing an entry never needs a code change. */
(function () {
  'use strict';
  var G = window.GO, X = window.GODASH, LIB = window.GOLIB;
  if (!G || !X || !LIB) return;
  var esc = G.esc, DATA = null, opener = null;
  function $(id) { return document.getElementById(id); }
  /* Moves an event hands out for a limited time (public/event-moves.json). Shown only here and only while the window is open; never part of a Pokémon's normal moveset. */
  var EVM = [];
  function evMovesHtml(ev, highlightTarget) {
    var L = EVM.filter(function (m) { return m.eventId === ev.id; });
    if (!L.length) return '';
    var rows = L.map(function (m) {
      var until = m.windowEnd ? new Date(m.windowEnd) : null, open = !until || isNaN(until) || until.getTime() > Date.now();
      var when = until && !isNaN(until) ? (open ? 'until ' : 'ended ') + until.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
      var what = m.acquisition === 'EVOLVE'
        ? 'Evolve <b>' + esc(m.pokemon) + '</b>' + (m.evolutionTarget ? ' into <b>' + esc(m.evolutionTarget) + '</b>' : '') + ' to get <b>' + esc(m.move) + '</b>' + (m.moveKind ? ' (' + esc(m.moveKind) + ' attack)' : '')
        : (m.pokemon ? '<b>' + esc(m.pokemon) + '</b>' : 'Pokémon') + ' caught in the event will know <b>' + esc(m.move) + '</b>';
      var tag = m.acquisition === 'EVOLVE' ? '<span class="pill all">Evolve project: have a ' + esc(m.pokemon) + ' ready</span> ' : '';
      return '<div class="evd-row"><div class="v"><p>' + what + (when ? ' <small>' + esc(when) + '</small>' : '') + '</p>' + tag + '</div></div>';
    }).join('');
    return '<h3 class="sec2"' + (highlightTarget ? ' id="evd-highlights"' : '') + '>Event-only moves</h3><div class="evd-card">' + rows + '</div><p class="note">Temporary: not part of the normal moveset, and no Elite TM needed while the window is open.</p>';
  }
  function load() {
    if (DATA) return Promise.resolve(DATA);
    function j(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
    var placesP = window.GOPLACES_READY ? window.GOPLACES_READY.then(function (places) { return places && places.load ? places.load() : null; }) : (window.GOPLACES ? window.GOPLACES.load() : null);
    return Promise.all([j('/event-info.json'), (window.GOLIB ? GOLIB.loadPrices() : j('/prices.json')), placesP, j('/event-details.json'), j('/event-moves.json')]).then(function (a) { EVM = (a[4] && a[4].moves) || []; DATA = { info: a[0] || { events: {}, passes: {} }, prices: a[1] || { prices: [], fx: null }, details: (a[3] && a[3].events) || {} }; return DATA; });
  }
  function fmtDay(iso) { var d = new Date(iso + 'T12:00'); return isNaN(d) ? esc(iso) : d.getDate() + ' ' + G.MON[d.getMonth()]; }
  function safe(u) { return typeof u === 'string' && (/^https:\/\//.test(u) || /^\/img\/ext\/[\w.-]+$/.test(u)) ? u : ''; }
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
  function ownChip(name, costume) {
    var o = X.ownState(name, costume);
    if (o.state === 'unreleased') return '<span class="own own-unk" title="Not released in Pokémon GO yet">Not out yet</span>';
    if (o.state === 'have') return '<span class="own own-have">Have</span>';
    if (o.state === 'missing' && o.tk) return '<span class="own own-need">Need</span>';
    return '';
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
    var D = DATA.details || {}; if (D[ev.id]) return D[ev.id];
    var n = LIB.norm(ev.name), hit = null;
    Object.keys(D).forEach(function (k) { if (LIB.norm(D[k].name) === n) hit = D[k]; });
    return hit;
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
        var kind = official && community ? 'Official + community' : official ? 'Official source' : ids.length > 1 ? 'Cross-referenced' : community ? 'Community source' : 'Source trust not labelled';
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
  function seasonPage(ev) {
    var si = ev.season; if (!si) return '';
    var d = findDetails(ev) || { fields: {} }, F = d.fields || {};
    var rank = function (list) { return (list || []).map(function (x) { return x.text; }).filter(function (t) { return /^rank \d+/i.test(t); }); };
    var ico = function (src) { return '<img class="ci" src="' + esc(src) + '" alt="" loading="lazy" data-err="rm">'; };
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
    var rewards = rows.length ? '<details class="evd-rk" open><summary>First 10 ranks</summary><div class="ss-scroll"><table class="ss-tab"><thead><tr><th>Rank</th><th>Free</th><th>Deluxe</th></tr></thead><tbody>' + rows.slice(0, 10).map(rowHtml).join('') + '</tbody></table></div></details>'
      + (rows.length > 10 ? '<details class="evd-rk"><summary>All ' + rows.length + ' rank rewards</summary><div class="ss-scroll"><table class="ss-tab"><thead><tr><th>Rank</th><th>Free</th><th>Deluxe</th></tr></thead><tbody>' + rows.slice(10).map(rowHtml).join('') + '</tbody></table></div></details>' : '') : '';
    // prices
    var prices = (F.tickets || []).map(function (x) { return tidy(x.text); }).filter(function (t) { return /US\$/.test(t) && !/^rank/i.test(t); });
    var priceHtml = prices.length ? '<ul>' + prices.map(function (t) { return '<li>' + window.GORICH(passPrice(esc(t), ev)) + '</li>'; }).join('') + '</ul>' : '';
    // tasks and points
    var pts = (si.points || []).length ? '<div class="ss-pts">' + si.points.map(function (p) { return '<span class="ss-pt"><b>' + p[1] + '</b><i>pts</i> ' + esc(p[0]) + '<small>' + esc(p[2]) + '</small></span>'; }).join('') + '</div><p class="note">Up to 250 extra points a day: win a raid (100), hatch an Egg (40), catch a Pokémon (5).</p>' : '';
    var out = '';
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
    var c = D0.filter(function (x) { return (x.sourceUrl && slugOf(x.sourceUrl) === sl && sl.indexOf('-') > 0) || LIB.norm(x.t) === n; })[0];
    if (c) {
      if (!(out.featured && out.featured.length)) out.featured = (c.art || []).map(function (a) { a = typeof a === 'string' ? { n: a } : a; return { name: a.n, costume: !!a.costume, shiny: !!a.shiny, label: a.label, role: 'featured' }; });
      if (!(out.bonuses && out.bonuses.length)) out.bonuses = (c.bonuses || []).slice();
      if (!(out.notes && out.notes.length)) out.notes = (c.p || []).filter(function (t) { return !(window.GOLIB && GOLIB.isPlaceholder && GOLIB.isPlaceholder(t)); });
    }
    var d = findDetails(ev);
    if (d && d.fields && !(out.featured && out.featured.length)) {
      var seen = {}, mons = [];
      (d.fields.featured || []).forEach(function (it) {
        var t = tidy(it.text), m = /^([A-Z][A-Za-z'’.\- ]{2,24}?)(?: \(([^)]*)\))?$/.exec(t);
        if (!m || /\b(core colors?|will|shower|event)\b/i.test(t)) return;
        var k = m[1].toLowerCase(); if (seen[k]) return; seen[k] = 1; mons.push({ name: m[1], label: m[2] ? m[2] : undefined, role: 'featured' });
      });
      if (mons.length) out.featured = mons;
    }
    return out;
  }
  function hasDetails(ev) { var d = findDetails(ev); return !!(d && d.fields && Object.keys(d.fields).some(function (k) { return (d.fields[k] || []).length; })); }
  function render(ev) {
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
    var hasMoveHighlights = EVM.some(function (m) { return m.eventId === ev.id; });
    var hasFeaturedHighlights = (ev.featured || []).some(function (f) { return f && f.role !== 'shiny_form'; });
    var hasHighlights = hasBonusHighlights || hasMoveHighlights || hasFeaturedHighlights;
    var highlightOnMoves = !hasBonusHighlights && hasMoveHighlights;
    var highlightOnFeatured = !hasBonusHighlights && !hasMoveHighlights && hasFeaturedHighlights;
    var h = '<div class="evd-bar"><button type="button" class="hbtn" id="evd-x" aria-label="Close event details"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><span class="tag">EVENT DETAIL</span>'
      + '<button type="button" class="pill info-open" data-infographic="' + esc(ev.id) + '">▧ Infographic</button>'
      + '<button type="button" class="pill" data-evlink="' + esc(ev.id) + '" aria-label="Share a link to this event">🔗 Link</button>'
      + '<button type="button" class="star' + (saved ? ' on' : '') + '" data-save="' + esc(ev.id) + '" aria-pressed="' + saved + '" aria-label="' + (saved ? 'Remove from saved' : 'Save event and get a Telegram reminder') + '" title="Saved events send you a Telegram reminder">' + (saved ? '★' : '☆') + '</button></div>';
    h += '<label class="evd-lead"' + (saved ? '' : ' hidden') + '>🔔 Remind me <select data-lead="' + esc(ev.id) + '" aria-label="When to remind me">' + [['', 'Morning of the event'], ['1440', '1 day before'], ['180', '3 hours before'], ['60', '1 hour before'], ['off', 'Don\'t remind me']].map(function (o) { return '<option value="' + o[0] + '"' + (String(X.usGet('pref:lead:' + ev.id) || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
    if (ev.img) h += '<img class="evd-banner" src="' + esc(ev.img) + '" alt="" referrerpolicy="no-referrer" data-err="rm">';
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
    if (ev.bonuses && ev.bonuses.length) h += '<h3 class="sec2" id="evd-highlights">Bonuses</h3><div class="bonuses">' + ev.bonuses.map(function (b) { var chip = G.bonusChip(b); var img = /max particle/i.test(b) ? X.IMG_PARTICLE : /power spot/i.test(b) ? X.IMG_POWERSPOT : ''; return img ? chip.replace(/<(svg|img)[\s\S]*?(<\/svg>|>)(?=<b>|<span>)/, '<img class="gi gi-pic" src="' + esc(img) + '" alt="" loading="lazy" data-err="rm">') : chip; }).join('') + '</div>';
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
    if (e && ((Array.isArray(e.tickets) && e.tickets.length) || (Array.isArray(e.alsoRunning) && e.alsoRunning.length))) {
      h += '<h3 class="sec2">Passes &amp; tickets <span class="m">all optional</span></h3><p class="note">Ticket prices and availability can vary by region. Check the in-game shop for the price available to your account.</p>';
      h += (e.tickets || []).map(passCard).join('');
      if (e.alsoRunning && e.alsoRunning.length) h += '<h3 class="sec2">Also running: GO Pass</h3>' + e.alsoRunning.map(passCard).join('');
      h += '<p class="note">Gigantamax Day, Mega Day and in-person tickets use this same card when an event has one.</p>';
    }
    h += ev.season ? seasonPage(ev) : sourcesBlock(ev);
    if (venues.length) h += '<h3 class="sec2" id="evd-locations">Locations &amp; routes <span class="m">sourced venues</span></h3><div class="evd-card evd-venues">' + venues.map(function (p) { return '<article class="evd-venue"><div><b>' + esc(p.name) + '</b><small>' + esc([p.city, p.region, p.country].filter(Boolean).join(', ')) + '</small><span class="note">' + esc(p.type || 'Event location') + '</span></div><div class="evd-venue-actions"><button type="button" class="pill" data-copycoord="' + esc(p.lat.toFixed(6) + ',' + p.lng.toFixed(6)) + '">Copy coordinates</button><button type="button" class="pill" data-places="' + esc(p.id) + '">Place details</button>' + (p.route && safeGpx(p.route.file) && safe(p.route.url) && p.route.verified ? '<a class="pill all" href="' + esc(safeGpx(p.route.file)) + '" download>Download route GPX</a>' : '') + '</div></article>'; }).join('') + '<div class="evd-venue-foot"><button type="button" class="pill all" data-gpx="' + venues.map(function (p) { return esc(p.id); }).join(',') + '" data-gpxname="' + esc(ev.name) + '"' + (venues.length > 1 ? ' data-gpxorder="1"' : '') + '>Download venue points GPX</button><p class="note">' + (venues.length > 1 ? 'Sourced venue points in this event; this is a list of stops, not a walking route.' : 'A GPX waypoint for this venue, not a walking route.') + '</p></div></div>';
    h += '<h3 class="sec2" id="evd-sources">Where this comes from</h3><div class="evd-card"><div class="evd-row"><span class="k">Schedule</span><div class="v"><p>' + X.statusChip(ev) + ' ' + esc(ev.source || '') + '</p></div></div>'
      + (e ? '<div class="evd-row"><span class="k">Details</span><div class="v">' + srcLine(e.source) + '</div></div>' : '') + '</div>'
      + '<p class="note">Source checked: ' + esc(sourceChecked || 'date unavailable') + ' · <span class="src-fresh" data-age="' + (sourceAge === null ? 'unknown' : sourceAge) + '">' + sourceFresh + '</span>' + (leekDuckSource ? '. Leek Duck is treated as a trusted primary Pokémon GO community source; it is distinct from a Niantic announcement.' : '') + '</p>'
      + '<p class="note">If sources disagree the event is marked Conflicting. Official and community information is never merged.</p>';
    return h;
  }

  /* Featured Pokémon, grouped by what is special about each one in this event. */
  var SVG = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; };
  var TAGS = {
    debut: { t: 'Debut', i: SVG('M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z') },
    shinydebut: { t: 'Shiny debut', i: '<img src="/ico/shiny.webp" alt="" loading="lazy">' },
    maxdebut: { t: 'Dynamax debut', i: SVG('M13 2L4 14h7l-1 8 9-12h-7z') },
    boostedshiny: { t: 'Boosted shiny', i: '<span class="tg-w"><img src="/ico/shiny.webp" alt="" loading="lazy"><i>+</i></span>' },
    shiny: { t: 'Shiny', i: '<img src="/ico/shiny.webp" alt="" loading="lazy">' },
    incense: { t: 'Incense', i: '<img src="/ico/incense.webp" alt="" loading="lazy">' },
    costume: { t: 'Costume', i: SVG('M8 3l-5 3 2 4 2-1v11h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z') },
    power: { t: 'Mega, Max & moves', i: '<img src="/ico/g/mega.webp" alt="" loading="lazy">' },
    raid: { t: 'Raid boss', i: '<img src="/ico/g/raid.webp" alt="" loading="lazy">' },
    egg: { t: 'Hatches', i: '<img src="/ico/g/egg-5km.webp" alt="" loading="lazy">' },
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
        return '<div class="evd-f"><span>' + X.monArt(ev, f, 'ea') + '</span><div class="evd-fm"><b>' + esc(f.name) + '</b>' + (tags ? '<div class="tgs">' + tags + '</div>' : '') + (f.label ? '<small>' + esc(f.label) + '</small>' : '') + (r.sp.line ? '<small class="ln">' + esc(r.sp.line) + '</small>' : '') + '</div>' + ownChip(f.name, f.costume) + '</div>';
      }).join('') + '</div>';
    }).join('');
  }
  function close(silent) { var o = $('evd'); if (!o || o.hidden) return; o.hidden = true; document.body.style.overflow = ''; if (opener && opener.isConnected && opener.focus) opener.focus(); if (silent !== true && window.GONAV) window.GONAV.popped(); }
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
      hero.parentNode.insertBefore(im, hero);
    }).catch(function () {});
  }
  /* In-person events with a venue time (Night Out): when the in-game bonuses start, in your time, matching the Telegram reminders. */
  function addBonusTime(o, ev) {
    var day = function (v) { return v ? (typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10)) : ''; };
    fetch('/api/venue-times?name=' + encodeURIComponent(ev.name || '') + '&start=' + encodeURIComponent(day(ev.start)) + '&end=' + encodeURIComponent(day(ev.end))).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var when = o.querySelector('.evc-when'); if (!d || !d.items || !d.items.length || !when || o.hidden || o.querySelector('.evd-bonus')) return;
      var p = document.createElement('p'); p.className = 'evd-bonus'; p.style.cssText = 'margin:6px 0;font-weight:600';
      p.innerHTML = d.items.map(function (i) { return '🎯 ' + (d.items.length > 1 ? esc(String(i.name).replace(/^.* - /, '')) + ': ' : 'Bonuses start ') + (d.items.length > 1 ? 'bonuses start ' : '') + esc(i.day + ', ' + i.show) + ' your time' + (i.note ? ' <small>(' + esc(i.note) + ')</small>' : ''); }).join('<br>');
      when.parentNode.insertBefore(p, when.nextSibling);
    }).catch(function () {});
  }
  /* The same bonus-start time on the cards in the list: cards carry an empty line, filled once the venue times have loaded. */
  var venueAll = null;
  function words3(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 3).join(' '); }
  function shiftDay(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  function fillBonus() {
    var pend = document.querySelectorAll('.evc-bonus[hidden]:not([data-done])'); if (!pend.length) return;
    if (!venueAll) venueAll = window.GOVENUE || fetch('/api/venue-times?all=1').then(function (r) { return r.ok ? r.json() : { items: [] }; }).catch(function () { return { items: [] }; });
    venueAll.then(function (d) {
      var items = (d && d.items) || [];
      Array.prototype.forEach.call(document.querySelectorAll('.evc-bonus[hidden]:not([data-done])'), function (p) {
        p.setAttribute('data-done', '1');
        var n = p.getAttribute('data-bn') || '', s = p.getAttribute('data-bs') || '', e = p.getAttribute('data-be') || s;
        var own = items.filter(function (i) { return i.name.toLowerCase() === n.toLowerCase(); });
        var hit = own.length ? own : (words3(n).split(' ').length < 3 || !s ? [] : items.filter(function (i) { return words3(i.name) === words3(n) && i.date >= shiftDay(s, -1) && i.date <= shiftDay(e || s, 1); }));
        if (!hit.length) return;
        p.innerHTML = '🎯 Bonuses start ' + hit.slice(0, 3).map(function (i) { return (hit.length > 1 ? esc(String(i.name).replace(/^.* - /, '')) + ' ' : '') + esc(i.day + ', ' + i.show) + ' your time'; }).join(' · ') + (hit.length === 1 && hit[0].note ? ' <small>(' + esc(hit[0].note) + ')</small>' : '');
        p.style.cssText = 'margin:4px 0;font-weight:600'; p.hidden = false;
      });
    });
  }
  var fillTimer = 0;
  if (window.MutationObserver) new MutationObserver(function () { clearTimeout(fillTimer); fillTimer = setTimeout(fillBonus, 200); }).observe(document.body, { childList: true, subtree: true });
  fillBonus();
  function open(id, from) {
    var ev = X.events().concat(window.GOSEASON ? window.GOSEASON.events() : []).filter(function (e) { return e.id === id; })[0]; if (!ev) return;
    opener = from || document.activeElement;
    load().then(function () {
      var o = $('evd'), wasOpen = !!o && !o.hidden;
      if (!o) { o = document.createElement('div'); o.id = 'evd'; o.className = 'evd'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'evd-t'); document.body.appendChild(o); }
      var ev2 = completeEvent(ev);
      o.innerHTML = '<div class="evd-in">' + render(ev2) + '</div>';
      addBanner(o, ev2);
      addBonusTime(o, ev2);
      o.hidden = false; document.body.style.overflow = 'hidden'; o.scrollTop = 0;
      if (!wasOpen && window.GONAV) window.GONAV.push();
      var x = $('evd-x'); if (x) { x.addEventListener('click', function () { close(); }); x.focus(); }
    });
  }
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-open]'); if (b) { e.preventDefault(); open(b.dataset.open, b); } });
  /* Keep keyboard navigation inside the modal while it is open. */
  document.addEventListener('keydown', function (e) {
    var o = $('evd'); if (!o || o.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    var items = Array.prototype.slice.call(o.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')).filter(function (el) {
      return !el.closest('[hidden],[aria-hidden="true"]') && el.getClientRects().length > 0;
    });
    if (!items.length) { e.preventDefault(); var x = $('evd-x'); if (x) x.focus(); return; }
    var first = items[0], last = items[items.length - 1], active = document.activeElement;
    if (e.shiftKey && (active === first || !o.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !o.contains(active))) { e.preventDefault(); first.focus(); }
  });
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
      if (evs.some(function (e) { return e.id === id; })) { clearInterval(tm); try { history.replaceState(history.state, '', location.pathname + location.search); } catch (err) {} open(id); }
      else if (++tries > 40) { clearInterval(tm); try { history.replaceState(history.state, '', location.pathname + location.search); } catch (err) {} toast('That event is no longer listed.'); }
    }, 250);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
