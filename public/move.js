/* Move badges: the type icon and colour of the MOVE's own type (never the Pokémon's), an explicit "Type unknown" fallback,
   and an Elite TM tag only where sourced move data says that Pokémon needs one. Data: /moves.json (built by tools/build-moves.py).
   Until the data has loaded, a move shows as plain text: never as unknown, never with a guessed type. */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var TY = {"Normal":{"c":"#A8A77A","f":"#0A0E15","p":"<circle cx=\"12\" cy=\"12\" r=\"5\"/>"},"Fire":{"c":"#EE8130","f":"#0A0E15","p":"<path d=\"M12 3c1 4 5 5.5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 .3 1.5 1 2 2 2-1-3 0-6 1-8z\"/>"},"Water":{"c":"#6390F0","f":"#0A0E15","p":"<path d=\"M12 3.5s6 6 6 10.5a6 6 0 01-12 0C6 9.5 12 3.5 12 3.5z\"/>"},"Electric":{"c":"#F7D02C","f":"#0A0E15","p":"<path d=\"M13 3L6 13.5h5L10 21l8-11h-5z\"/>"},"Grass":{"c":"#7AC74C","f":"#0A0E15","p":"<path d=\"M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l8-8\"/>"},"Ice":{"c":"#96D9D6","f":"#0A0E15","p":"<path d=\"M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9\"/>"},"Fighting":{"c":"#C22E28","f":"#fff","p":"<path d=\"M7 11V8a2 2 0 014 0v-.5a2 2 0 014 0V8a2 2 0 014 0v5a6 6 0 01-6 6h-1a5 5 0 01-5-5z\"/>"},"Poison":{"c":"#A33EA1","f":"#fff","p":"<path d=\"M12 4c4 0 7 3 7 7 0 2-1 3-2 4v3h-3v-2h-4v2H7v-3c-1-1-2-2-2-4 0-4 3-7 7-7z\"/>"},"Ground":{"c":"#E2BF65","f":"#0A0E15","p":"<path d=\"M3 19l6-11 4 6 2-3 6 8z\"/>"},"Flying":{"c":"#A98FF3","f":"#0A0E15","p":"<path d=\"M3 14c4-1 6-4 9-8 3 4 5 7 9 8-4 0-6 1-9 5-3-4-5-5-9-5z\"/>"},"Psychic":{"c":"#F95587","f":"#0A0E15","p":"<path d=\"M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12z\"/><circle cx=\"12\" cy=\"12\" r=\"2.5\"/>"},"Bug":{"c":"#A6B91A","f":"#0A0E15","p":"<path d=\"M12 6c3 0 5 2 5 5v3a5 5 0 01-10 0v-3c0-3 2-5 5-5zM12 6v13M5 10l-2-2M19 10l2-2\"/>"},"Rock":{"c":"#B6A136","f":"#0A0E15","p":"<path d=\"M12 3l8 9-8 9-8-9z\"/>"},"Ghost":{"c":"#735797","f":"#fff","p":"<path d=\"M6 20V11a6 6 0 0112 0v9l-3-2-3 2-3-2z\"/>"},"Dragon":{"c":"#6F35FC","f":"#fff","p":"<path d=\"M4 18c5 0 7-3 8-7 1 4 3 7 8 7-3-2-4-6-3-12-2 2-3 3-5 3S9 8 7 6c1 6 0 10-3 12z\"/>"},"Dark":{"c":"#705746","f":"#fff","p":"<path d=\"M18 14.5A7.5 7.5 0 019.5 6a7.5 7.5 0 108.5 8.5z\"/>"},"Steel":{"c":"#B7B7CE","f":"#0A0E15","p":"<path d=\"M12 3l7 4v10l-7 4-7-4V7z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>"},"Fairy":{"c":"#D685AD","f":"#0A0E15","p":"<path d=\"M12 3l2 6 6 3-6 3-2 6-2-6-6-3 6-3z\"/>"}};
  var D = null, IDX = null;
  function nk(s) { return String(s || '').toLowerCase().replace(/\u00e9/g, 'e').replace(/[^a-z0-9]+/g, ''); }
  function sk(s) { return (String(s || '').toLowerCase().replace(/\u00e9/g, 'e').match(/[a-z0-9]+/g) || []).sort().join(' '); }   // same as tools/build-moves.py key()
  function build() {
    IDX = {}; Object.keys(D.types).forEach(function (n) { IDX[nk(n)] = D.types[n]; });
    Object.keys(D.aliases || {}).forEach(function (a) { var t = D.types[D.aliases[a]]; if (t) IDX[nk(a)] = t; });
    D.fastSet = {}; (D.fast || []).forEach(function (n) { D.fastSet[nk(n)] = 1; });
    D.ambig = {}; Object.keys(D.ambiguous || {}).forEach(function (n) { D.ambig[nk(n)] = D.ambiguous[n]; });
  }
  // The move's type: from the table, else a type the caller was given by a named source, else null (unknown).
  function typeOf(name, hint) { if (!IDX) return hint && TY[hint] ? hint : null; var t = IDX[nk(name)]; return t || (hint && TY[hint] && !D.ambig[nk(name)] ? hint : null); }
  function isElite(pokemon, move) {
    if (!D || !pokemon) return false; var l = D.elite[sk(pokemon)]; if (!l) return false;
    var k = nk(move); return l.some(function (n) { return nk(n) === k; });
  }
  function badge(type, name) {
    if (type && TY[type]) return '<img class="mty mty-img" role="img" aria-label="' + type + ' type" src="/ico/g/type-' + type.toLowerCase() + '.webp" alt="" title="' + type + '" width="20" height="20" loading="lazy">';
    return '<i class="mty unk" role="img" aria-label="Type unknown"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 9a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 4M12 17v.5"/></svg></i>';
  }
  // html(moveName, typeHint?, pokemonName?): the badge, the name, and an Elite TM tag when sourced data supports it.
  function html(name, hint, pokemon) {
    if (!D) return '<span class="mvb"><b>' + esc(name) + '</b></span>';
    var t = typeOf(name, hint), elite = isElite(pokemon, name), fast = !!D.fastSet[nk(name)];
    return '<span class="mvb">' + badge(t, name) + '<b>' + esc(name) + '</b>' + (elite ? '<span class="etm" aria-label="Needs an Elite ' + (fast ? 'Fast' : 'Charged') + ' TM"><img src="/ico/g/elite-' + (fast ? 'fast' : 'charged') + '-tm.webp" alt="" width="22" height="16" loading="lazy">Elite TM</span>' : '') + '</span>';
  }
  var ready = fetch('/moves.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
    if (j && j.types && j.elite) { D = j; build(); document.dispatchEvent(new Event('gomoves')); } return !!D;
  });
  window.GOMOVE = { html: html, typeOf: typeOf, isElite: isElite, ready: ready, loaded: function () { return !!D; }, data: function () { return D; } };
})();
