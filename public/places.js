/* Places: sourced venues only. Data comes from /places.json (public venues) and /api/places-private (owner-only hotspots). No map is drawn.
   Rules: a place needs a source, coordinates and a verified date; raid activity is never shown without live evidence;
   a route GPX exists only when the place carries its source's own route file. Separately, any sourced place can be saved as a GPX of venue
   points (waypoints made from its sourced coordinates, labelled as such, never drawn up as a walking route). */
(function () {
  'use strict';
  var G = window.GO; if (!G) return;
  var esc = G.esc, DATA = null, opener = null, F = { q: '', country: '', region: '', city: '', tag: '' }, current = null;
  function $(id) { return document.getElementById(id); }
  function safe(u) { return typeof u === 'string' && /^https:\/\//.test(u) ? u : ''; }
  function pinHdr() { try { var p = localStorage.getItem('gofn-pin'); return p ? { 'x-pin': p } : {}; } catch (e) { return {}; } }
  // Public venues come from /places.json. Hotspot pins are owner-only: they load from /api/places-private for the PIN or a signed-in person, and are simply absent otherwise.
  function getJson(url, headers) { return fetch(url, { cache: 'no-cache', headers: headers || {} }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function load() {
    if (DATA) return Promise.resolve(DATA);
    return Promise.all([getJson('/places.json'), getJson('/api/places-private', pinHdr())]).then(function (r) {
      var pub = r[0], priv = r[1];
      DATA = pub && Array.isArray(pub.places) ? pub : { places: [], tags: [] };
      if (priv && Array.isArray(priv.places)) DATA.places = DATA.places.concat(priv.places);
      DATA.places = DATA.places.filter(valid); return DATA;
    });
  }
  // A place without a source, coordinates or verified date is not listed at all.
  function valid(p) {
    return p && p.name && isFinite(p.lat) && isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && p.country && p.verified && /^\d{4}-\d\d-\d\d$/.test(p.verified)
      && Array.isArray(p.sources) && p.sources.some(function (s) { return s && s.label && safe(s.url); })
      && (p.events === undefined || (Array.isArray(p.events) && p.events.every(function (e) { return e && typeof e.name === 'string' && /^\d{4}-\d\d-\d\d$/.test(e.from) && /^\d{4}-\d\d-\d\d$/.test(e.to); })));
  }
  function day(iso) { var d = new Date(iso + 'T12:00'); return isNaN(d) ? iso : d.getDate() + ' ' + G.MON[d.getMonth()] + ' ' + d.getFullYear(); }
  function localClock(p) {
    if (!p.timeZone) return '';
    try {
      return new Intl.DateTimeFormat('en-AU', { timeZone: p.timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
    } catch (e) { return ''; }
  }
  function coord(p) { return p.lat.toFixed(4).replace('-', '−') + ', ' + p.lng.toFixed(4).replace('-', '−'); }
  function plain(p) { return p.lat.toFixed(4) + ', ' + p.lng.toFixed(4); }
  function dms(p) { return Math.abs(p.lat).toFixed(4) + '° ' + (p.lat < 0 ? 'S' : 'N') + ', ' + Math.abs(p.lng).toFixed(4) + '° ' + (p.lng < 0 ? 'W' : 'E'); }
  function links(p) {
    var ll = p.lat.toFixed(5) + ',' + p.lng.toFixed(5), n = encodeURIComponent(p.name);
    return [['Apple Maps', 'https://maps.apple.com/?ll=' + ll + '&q=' + n], ['Google Maps', 'https://www.google.com/maps/search/?api=1&query=' + ll], ['OpenStreetMap', 'https://www.openstreetmap.org/?mlat=' + p.lat.toFixed(5) + '&mlon=' + p.lng.toFixed(5) + '#map=17/' + p.lat.toFixed(5) + '/' + p.lng.toFixed(5)]];
  }

  /* ---- GPX of venue points ---- */
  function x(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; }); }
  function slug(t) { return String(t || 'places').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'places'; }
  // One <wpt> per sourced place, with who vouches for it and when it was checked. With opts.order and two or more places, the same points are also
  // listed as an <rte> in the order given; the file says it joins venues and is not a walking route.
  function gpx(places, opts) {
    opts = opts || {};
    var pts = places.filter(valid), name = opts.name || 'GO Field Notes places';
    var out = ['<?xml version="1.0" encoding="UTF-8"?>', '<gpx version="1.1" creator="GO Field Notes" xmlns="http://www.topografix.com/GPX/1/1">',
      '<metadata><name>' + x(name) + '</name><desc>Venue points from the sourced Places list in GO Field Notes. Each point says who vouches for it and when it was checked. These are planning points, not routes or in-game coordinates.</desc></metadata>'];
    pts.forEach(function (p) {
      var src = p.sources[0];
      out.push('<wpt lat="' + p.lat.toFixed(6) + '" lon="' + p.lng.toFixed(6) + '"><name>' + x(p.name) + '</name><desc>' + x([p.type, p.role].filter(Boolean).join(' · ') + '. Source: ' + src.label + '. Coordinates: ' + (p.coords ? p.coords.label : src.label) + '. Checked ' + p.verified + '. A venue point for planning; check it in the game.') + '</desc><link href="' + x(safe(src.url)) + '"><text>' + x(src.label) + '</text></link></wpt>');
    });
    if (opts.order && pts.length > 1) {
      out.push('<rte><name>' + x(name) + ' (venues in order)</name><desc>The venues above joined in the order listed. This is a list of stops, not a walking route.</desc>' + pts.map(function (p) { return '<rtept lat="' + p.lat.toFixed(6) + '" lon="' + p.lng.toFixed(6) + '"><name>' + x(p.name) + '</name></rtept>'; }).join('') + '</rte>');
    }
    out.push('</gpx>');
    return out.join('\n');
  }
  function saveGpx(places, opts) {
    var pts = places.filter(valid); if (!pts.length) return false;
    try {
      var blob = new Blob([gpx(pts, opts)], { type: 'application/gpx+xml' }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = slug((opts && opts.name) || (pts.length === 1 ? pts[0].name : 'places')) + '.gpx'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000); return true;
    } catch (e) { return false; }
  }
  function uniq(list, k) { var o = {}; list.forEach(function (p) { if (p[k]) o[p[k]] = 1; }); return Object.keys(o).sort(); }
  function filtered() {
    var q = F.q.trim().toLowerCase();
    return DATA.places.filter(function (p) {
      return (!F.country || p.country === F.country) && (!F.region || p.region === F.region) && (!F.city || p.city === F.city) && (!F.tag || (p.tags || []).indexOf(F.tag) > -1)
        && (!q || [p.name, p.city, p.region, p.country].concat((p.events || []).map(function (e) { return e.name; })).join(' ').toLowerCase().indexOf(q) > -1);
    });
  }
  function sel(id, label, vals, cur) {
    return '<label class="plc-sel"><span>' + label + '</span><select id="' + id + '" aria-label="' + label + '"><option value="">Any</option>' + vals.map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select></label>';
  }
  function row(p) {
    return '<article class="plc-row"><button type="button" class="plc-open" data-place="' + esc(p.id) + '"><span class="plc-h"><b>' + esc(p.name) + '</b><span class="note">' + esc([p.city, p.region, p.country].filter(Boolean).join(', ')) + '</span></span>' + (p.tags || []).map(function (t) { return '<span class="plc-tg">' + esc(t) + '</span>'; }).join('') + '</button>'
      + '<div class="plc-meta">' + coord(p) + (localClock(p) ? '<br>Local time: ' + esc(localClock(p)) : '') + '<br>Type: ' + esc(p.type) + '<br>Source: ' + esc(p.sources[0].label) + (p.coords ? ' · coordinates: ' + esc(p.coords.label.split(',')[0]) : '') + '<br>Last verified ' + day(p.verified) + '</div>'
      + '<div class="plc-acts"><button type="button" class="pill" data-copy="' + esc(p.id) + '">Copy coordinates</button>' + (p.route ? '<a class="pill all" href="' + esc(p.route.file) + '" download>Download GPX</a>' : '<span class="npub">No route file</span>') + '</div></article>';
  }
  function listView() {
    var all = DATA.places, tags = DATA.tags && DATA.tags.length ? DATA.tags : ['Event venue', 'Community Day', 'Raids', 'Gyms', 'PokéStops'];
    var out = filtered(), groups = {};
    out.forEach(function (p) { var g = [p.city, p.region].filter(Boolean).join(', '); (groups[g] = groups[g] || []).push(p); });
    var h = '<div class="evd-bar"><button type="button" class="hbtn" id="plc-x" aria-label="Close places"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><span class="tag">MENU › PLACES</span><span style="width:44px"></span></div>'
      + '<h2 class="plc-t" id="plc-t">Places</h2><p class="note">Sourced venues and routes. No map is drawn.</p>'
      + '<label class="plc-q"><span class="sr">Search name, city or country</span><input type="search" id="plc-q" placeholder="Search name, city or country" value="' + esc(F.q) + '"></label>'
      + '<div class="plc-sels">' + sel('plc-country', 'Country', uniq(all, 'country'), F.country) + sel('plc-region', 'Region', uniq(all.filter(function (p) { return !F.country || p.country === F.country; }), 'region'), F.region) + sel('plc-city', 'City', uniq(all.filter(function (p) { return (!F.country || p.country === F.country) && (!F.region || p.region === F.region); }), 'city'), F.city) + '</div>'
      + '<div class="plc-tags" role="group" aria-label="Filter by tag"><button type="button" class="chip' + (F.tag ? '' : ' on') + '" data-tag="">All <small>' + all.length + '</small></button>'
      + tags.map(function (t) { var n = all.filter(function (p) { return (p.tags || []).indexOf(t) > -1; }).length; return '<button type="button" class="chip' + (F.tag === t ? ' on' : '') + '" data-tag="' + esc(t) + '" aria-pressed="' + (F.tag === t) + '">' + esc(t) + ' <small>' + n + '</small></button>'; }).join('') + '</div>'
      + '<p class="note">A tag with 0 stays visible so you can see what is not sourced yet.</p>';
    if (out.length) h += '<p><button type="button" class="pill all" data-gpx="' + out.map(function (p) { return esc(p.id); }).join(',') + '" data-gpxname="Places' + (F.city ? ' ' + esc(F.city) : F.country ? ' ' + esc(F.country) : '') + '">⤓ Download these ' + out.length + (out.length === 1 ? ' place' : ' places') + ' (GPX)</button></p>';
    var keys = Object.keys(groups).sort();
    h += keys.length ? keys.map(function (g) { return '<div class="sh2"><h3 class="sec2">' + esc(g) + '</h3><span class="m">' + groups[g].length + (groups[g].length === 1 ? ' place' : ' places') + '</span></div>' + groups[g].map(row).join(''); }).join('') : '<p class="empty" id="plc-none">No sourced place matches. Nothing is guessed to fill the gap.</p>';
    h += '<p class="note">Community-reported hotspot pins are general areas, not specific gyms. Raid activity and lobby fill are not live-verified. Coordinates help with planning and opening map apps; they do not change the game location.</p>'
      + '<div class="plc-nc"><b>Other countries:</b> filters list a country only once it has at least one sourced place.</div>';
    return h;
  }
  function detailView(p) {
    var h = '<div class="evd-bar"><button type="button" class="hbtn" id="plc-back" aria-label="Back to Places"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><span class="tag">PLACES › DETAIL</span><span style="width:44px"></span></div>'
      + '<h2 class="plc-t" id="plc-t">' + esc(p.name) + '</h2><p class="note">' + esc([p.city, p.region, p.country].filter(Boolean).join(', ')) + '</p>'
      + '<div class="plc-chips">' + (p.tags || []).map(function (t) { return '<span class="plc-tg">' + esc(t) + '</span>'; }).join('') + (p.type && /community-reported/i.test(p.type) ? '<span class="npub">Community reported · not live verified</span>' : '<span class="npub">No live raid evidence</span>') + '</div>'
      + (localClock(p) ? '<div class="evd-card"><b>Local time there</b><p class="note">' + esc(localClock(p)) + ' · ' + esc(p.timeZone) + '</p></div>' : '')
      + '<h3 class="sec2">Coordinates <span class="m">decimal degrees</span></h3><div class="evd-card"><div class="plc-coord">' + coord(p) + '</div><p class="note">' + dms(p) + (p.coords && p.coords.note ? ' · ' + esc(p.coords.note.charAt(0).toLowerCase() + p.coords.note.slice(1)) : '') + '</p>'
      + '<button type="button" class="pill all" data-copy="' + esc(p.id) + '">Copy coordinates</button><p class="note" id="plc-status" role="status" aria-live="polite"></p></div>'
      + '<h3 class="sec2">Open in your map app <span class="m">leaves this app</span></h3><div class="plc-links">' + links(p).map(function (l) { return '<a class="plc-lk" href="' + esc(l[1]) + '" target="_blank" rel="noopener noreferrer">' + l[0] + ' <span aria-hidden="true">↗</span></a>'; }).join('') + '</div><p class="note">Plain links with the coordinates in them. No map is drawn or embedded here.</p>'
      + '<h3 class="sec2">Route</h3><div class="evd-card">';
    if (p.route && safe(p.route.url) && p.route.file && p.route.verified) h += '<p><b>' + esc(p.route.label || 'Route') + '</b> from <a href="' + esc(p.route.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.route.author || 'the source') + '</a>, checked ' + day(p.route.verified) + '.</p><a class="pill all" href="' + esc(p.route.file) + '" download>Download GPX</a>';
    else h += '<span class="npub">No verified GPX route</span><p class="note">There is no sourced walking route for this place, and none is made up.</p>';
    h += '<p><button type="button" class="pill all" data-gpx="' + esc(p.id) + '">⤓ Download venue point (GPX)</button></p><p class="note">One point at the sourced coordinates above, with who vouches for it and when it was checked. Open it in a maps or hiking app.</p>';
    h += '</div><h3 class="sec2">Source and verification</h3><div class="evd-card">'
      + (p.role ? '<div class="evd-row"><span class="k">Role</span><div class="v"><p>' + esc(p.role) + ' · ' + p.sources.map(function (s) { return '<a href="' + esc(safe(s.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(s.label) + '</a>' + (s.trust === 'official' ? ' (official)' : ' (community)'); }).join(', ') + '</p></div></div>' : '')
      + (p.coords ? '<div class="evd-row"><span class="k">Coordinates</span><div class="v"><p>' + (safe(p.coords.url) ? '<a href="' + esc(p.coords.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.coords.label) + '</a>' : esc(p.coords.label)) + '</p></div></div>' : '')
      + '<div class="evd-row"><span class="k">Verified</span><div class="v"><p><b>' + day(p.verified) + '</b> · checked against the source page</p></div></div>'
      + '<div class="evd-row"><span class="k">Raid activity</span><div class="v"><p>Unknown. Nothing here says raids happen now.</p></div></div></div>';
    if (p.events && p.events.length) h += '<h3 class="sec2">Used by</h3>' + p.events.map(function (n) { return '<div class="evd-card"><b>' + esc(n.name) + '</b> <span class="note">' + (n.from === n.to ? day(n.from) : day(n.from) + ' to ' + day(n.to)) + '</span></div>'; }).join('');
    return h;
  }
  function paint(keepFocus) {
    var o = $('plc'); if (!o) return;
    var focusId = keepFocus && document.activeElement && document.activeElement.id;
    o.innerHTML = '<div class="evd-in">' + (current ? detailView(current) : listView()) + '</div>';
    if (focusId && $(focusId)) { var el = $(focusId); el.focus(); if (el.setSelectionRange && el.type === 'search') { var n = el.value.length; try { el.setSelectionRange(n, n); } catch (e) { /* ignore */ } } }
  }
  function byId(id) { return DATA.places.filter(function (p) { return p.id === id; })[0]; }
  function copy(id) {
    var p = byId(id); if (!p) return; var t = plain(p);
    function done(ok) { var s = $('plc-status'); if (s) s.textContent = ok ? 'Copied: ' + coord(p) : 'Could not copy. Select and copy: ' + coord(p); else if (ok) { var b = document.querySelector('[data-copy="' + id + '"]'); if (b) { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy coordinates'; }, 1800); } } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); }); else done(false);
  }
  function close() { var o = $('plc'); if (!o || o.hidden) return; o.hidden = true; var ev = $('evd'); document.body.style.overflow = ev && !ev.hidden ? 'hidden' : ''; if (opener && opener.focus) opener.focus(); }
  function open(id, from, q) {
    opener = from || document.activeElement;
    load().then(function () {
      var o = $('plc');
      if (!o) { o = document.createElement('div'); o.id = 'plc'; o.className = 'evd'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'plc-t'); document.body.appendChild(o); bind(o); }
      current = id ? byId(id) || null : null; F = { q: q || '', country: '', region: '', city: '', tag: '' };
      paint(false); o.hidden = false; document.body.style.overflow = 'hidden'; o.scrollTop = 0;
      var x = $('plc-x') || $('plc-back'); if (x) x.focus();
    });
  }
  function bind(o) {
    o.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('#plc-x')) return close();
      if (t.closest('#plc-back')) { current = null; paint(false); var f = o.querySelector('.plc-open'); if (f) f.focus(); return; }
      var op = t.closest('[data-place]'); if (op) { current = byId(op.dataset.place); paint(false); o.scrollTop = 0; var b = $('plc-back'); if (b) b.focus(); return; }
      var c = t.closest('[data-copy]'); if (c) return copy(c.dataset.copy);
      var tg = t.closest('[data-tag]'); if (tg) { F.tag = tg.dataset.tag; paint(false); }
    });
    o.addEventListener('input', function (e) { if (e.target.id === 'plc-q') { F.q = e.target.value; paint(true); } });
    o.addEventListener('change', function (e) {
      var id = e.target.id; if (id === 'plc-country') { F.country = e.target.value; F.region = ''; F.city = ''; } else if (id === 'plc-region') { F.region = e.target.value; F.city = ''; } else if (id === 'plc-city') F.city = e.target.value; else return;
      paint(true);
    });
  }
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-gpx]'); if (!g) return;
    e.preventDefault();
    load().then(function () {
      var ids = String(g.getAttribute('data-gpx')).split(','), list = ids.map(byId).filter(Boolean);
      saveGpx(list, { name: g.getAttribute('data-gpxname') || (list.length === 1 ? list[0].name : 'Places'), order: g.hasAttribute('data-gpxorder') });
    });
  });
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-places]'); if (b) { e.preventDefault(); open(b.dataset.places || '', b, b.dataset.placesq || ''); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  // An event links to a place only when its name matches exactly (ignoring case and spacing) AND its dates overlap the place's dated use.
  function nm(x) { return String(x || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function forEvent(ev) {
    if (!DATA || !ev || !ev.name || !(ev.start instanceof Date) || isNaN(ev.start)) return [];
    var s = ev.start.getTime(), e = (ev.end instanceof Date && !isNaN(ev.end) ? ev.end : ev.start).getTime();
    return DATA.places.filter(function (p) {
      return (p.events || []).some(function (x) { return nm(x.name) === nm(ev.name) && s <= new Date(x.to + 'T23:59:59').getTime() && e >= new Date(x.from + 'T00:00:00').getTime(); });
    });
  }
  load().then(function () { document.dispatchEvent(new Event('goplaces')); });
  window.GOPLACES = { open: open, close: close, load: load, forEvent: forEvent, gpx: gpx };
})();
