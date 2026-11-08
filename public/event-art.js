/* One artwork rule for Today, Schedule and Event Details. Data-driven: any imported event is resolved the same way.
   'official' only when a verified banner exists for this exact event, year and place; otherwise a category-themed banner.
   Official artwork is never invented, never from another year or place, and never a generic/default site image. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GOEVENTART = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var GENERIC = /default|placeholder|no[-_]?image|logo|favicon|sprite|avatar|share[-_]?card|og[-_]?default/i;
  /* Hosts that carry event-specific key art. Mirrored R2 copies under /img/ext/ keep the source file name, so the same checks apply. */
  var HOSTS = [
    { re: /^https:\/\/cdn\.leekduck\.com\/assets\/img\/events\/article-images\/(\d{4})\//i, source: 'Leek Duck', needsSlug: true },
    { re: /^https:\/\/cdn\.leekduck\.com\/assets\/img\/events\/[a-z0-9-]+\.(?:jpe?g|png|webp)$/i, source: 'Leek Duck', needsSlug: true, needsYear: true },
    { re: /^https:\/\/(?:www\.)?pokemongo\.com\/.+\.(?:jpe?g|png|webp)(?:\?|$)/i, source: 'Pokémon GO (official)', needsSlug: false },
    { re: /^https:\/\/(?:lh3\.googleusercontent\.com|cdn\.pokemongolive\.com|storage\.googleapis\.com\/pokemongolive)\//i, source: 'Pokémon GO (official)', needsSlug: false },
    { re: /^\/img\/ext\/([\w.-]+)$/i, source: 'Mirrored event art', needsSlug: true, mirrored: true }
  ];
  function words(v) { return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(function (w) { return w.length >= 4 && !/^(pokemon|event|events|2026|2027|2025|with|from|raid|battles|battle)$/.test(w); }); }
  function yearOf(v) { var m = /(\d{4})/.exec(typeof v === 'string' ? v : v instanceof Date ? v.toISOString() : ''); return m ? +m[1] : 0; }
  function iso(v) { try { return v && v.toISOString ? v.toISOString() : typeof v === 'string' ? v : ''; } catch (e) { return ''; } }
  function evYears(ev) { var s = yearOf(iso(ev.start) || iso(ev.s)), e = yearOf(iso(ev.end) || iso(ev.e)); return [s, e].filter(Boolean); }
  /* Verify one candidate URL for one event. Returns provenance or null. */
  function verify(url, ev) {
    if (typeof url !== 'string' || !url || GENERIC.test(url.split('?')[0])) return null;
    if (/default|placeholder/i.test(url)) return null;
    for (var i = 0; i < HOSTS.length; i++) {
      var h = HOSTS[i], m = h.re.exec(url); if (!m) continue;
      var years = evYears(ev), inUrl = (url.match(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/g) || []).map(function (x) { return +x.replace(/\D/g, ''); });
      /* A year in the URL must be the event's own year (a late-December event may belong to the next year's article). */
      if (inUrl.length && years.length && !inUrl.some(function (y) { return years.indexOf(y) >= 0 || years.indexOf(y - 1) >= 0 && y - 1 >= years[0]; })) return null;
      if (h.needsYear && !inUrl.length) return null;
      if (h.needsSlug) {
        var slug = words(decodeURIComponent(url.replace(/^https:\/\/[^/]+/, '')).replace(/\//g, ' ').replace(/[-_.]/g, ' '));
        var name = words(ev.name || ev.title), place = words(ev.region || ev.place || '');
        var hit = name.filter(function (w) { return slug.indexOf(w) >= 0; }).length;
        /* The article folder must share the event's distinctive words; an event with a place also needs that place in the folder name. */
        if (!hit) return null;
        if (place.length && !place.some(function (w) { return slug.indexOf(w) >= 0; })) return null;
      }
      return { source: h.source, url: url, mirrored: !!h.mirrored };
    }
    return null;
  }
  var THEMES = {
    raid:      { key: 'raid', label: 'Raid', icon: '/ico/g/raid.webp', c1: '#7a1620', c2: '#2a0d16', accent: '#ff6b6b' },
    max:       { key: 'max', label: 'Max Battle', icon: '/ico/g/powerup.webp', c1: '#4b2a9a', c2: '#190f3a', accent: '#b69cff' },
    cd:        { key: 'cd', label: 'Community Day', icon: '/ico/g/event.webp', c1: '#9a4a10', c2: '#2e1606', accent: '#ffb066' },
    person:    { key: 'person', label: 'In person', icon: '/ico/g/event.webp', c1: '#1f4fa8', c2: '#0c1b3d', accent: '#7fb0ff' },
    pass:      { key: 'pass', label: 'GO Pass', icon: '/ico/pass.webp', c1: '#8a6a00', c2: '#2a2000', accent: '#ffd43b' },
    research:  { key: 'research', label: 'Research', icon: '/ico/g/event.webp', c1: '#0f6b5f', c2: '#062a26', accent: '#5fe0cc' },
    spot:      { key: 'spot', label: 'Spotlight', icon: '/ico/shiny.webp', c1: '#8a2f78', c2: '#2a0d27', accent: '#ff8fe0' },
    event:     { key: 'event', label: 'Event', icon: '/ico/g/event.webp', c1: '#3a3f8f', c2: '#14173a', accent: '#a9b3ff' }
  };
  function theme(ev) {
    var n = String(ev && (ev.name || ev.title) || ''), k = ev && ev.kind || '';
    if (/go pass/i.test(n)) return THEMES.pass;
    if (k === 'max' || /max battle|dynamax|max monday/i.test(n)) return THEMES.max;
    if (k === 'cd' || /community day/i.test(n)) return THEMES.cd;
    if (k === 'person' || /wild area|safari|go fest|go tour|in[- ]person|night out/i.test(n) || ev && ev.region && !/^global$/i.test(ev.region)) return THEMES.person;
    if (k === 'raid' || /raid/i.test(n)) return THEMES.raid;
    if (k === 'spot' || /spotlight/i.test(n)) return THEMES.spot;
    if (/research/i.test(n)) return THEMES.research;
    return THEMES.event;
  }
  /* candidates: ordered image URLs the caller has (event image, catalogue image, source-poster image). */
  function resolve(ev, candidates) {
    var list = [].concat(candidates || [], ev && ev.img ? [ev.img] : [], ev && ev.image ? [ev.image] : []);
    for (var i = 0; i < list.length; i++) {
      var c = typeof list[i] === 'string' ? { url: list[i] } : list[i];
      var prov = c && verify(c.url, ev || {});
      if (prov) {
        var years = evYears(ev || {}), place = ev && (ev.region || ev.place) || '';
        return { kind: 'official', src: c.url, alt: (ev && (ev.name || ev.title) || 'Event') + ' official artwork', focal: '50% 40%',
          provenance: { source: c.source || prov.source, url: c.pageUrl || prov.url, imageUrl: prov.url, verifiedFor: [ev && (ev.name || ev.title), years[0] || '', place].filter(Boolean).join(' / ') } };
      }
    }
    return { kind: 'themed', theme: theme(ev || {}), alt: '', focal: '50% 40%', provenance: null };
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* Banner markup. The themed layer is always present but hidden while an official image is expected, so a failed load only toggles a class (no layout shift). */
  function banner(art, opts) {
    opts = opts || {};
    var t = art.kind === 'official' ? theme(opts.ev || {}) : art.theme, ar = opts.aspect || '16 / 9', accent = opts.accent || '';
    var themed = '<span class="ev-art-theme" aria-hidden="true" style="--c1:' + t.c1 + ';--c2:' + t.c2 + ';--ac:' + t.accent + '"><img class="ev-art-ico" alt="" src="' + esc(t.icon) + '" data-err="rm"><b>' + esc(t.label) + '</b>' + (accent ? '<span class="ev-art-accent">' + accent + '</span>' : '') + '</span>';
    var img = art.kind === 'official' ? '<img class="ev-art-img" alt="' + esc(art.alt) + '" src="' + esc(art.src) + '" decoding="async" data-err="banner" style="object-fit:' + (opts.fit || 'contain') + ';object-position:' + art.focal + '">' : '';
    var prov = art.provenance ? ' data-art-source="' + esc(art.provenance.source) + '" data-art-verified="' + esc(art.provenance.verifiedFor) + '"' : '';
    return '<figure class="ev-art ev-art--' + art.kind + (opts.cls ? ' ' + opts.cls : '') + '" style="--ar:' + ar + '" data-art-kind="' + art.kind + '"' + prov + '>' + themed + img + '</figure>';
  }
  function fail(img) { var f = img && img.closest && img.closest('.ev-art'); if (f) { f.classList.add('is-failed'); f.setAttribute('data-art-kind', 'themed'); f.removeAttribute('data-art-source'); } if (img && img.remove) img.remove(); }
  return { resolve: resolve, verify: verify, theme: theme, banner: banner, fail: fail, THEMES: THEMES };
}));
