/* Persistent, explicitly approved Pokémon guide selectors; no event inference. */
(function (root, factory) {
  var api = factory();
  root.GOPOKEMONGUIDESLOGIC = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}), function () {
  'use strict';
  var MODES = ['normal','shadow','dynamax','gigantamax','mega','primal'];
  function valid(t) {
    return !!t && typeof t === 'object' && !Array.isArray(t) &&
      typeof t.pokemonId === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(t.pokemonId) &&
      (t.formId == null || (typeof t.formId === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(t.formId))) &&
      MODES.indexOf(t.battleMode) >= 0;
  }
  function identity(t) { return [t.pokemonId, t.formId || '', t.battleMode].join('|'); }
  function entries(published, queue, decisions) {
    var map = Object.create(null), seen = Object.create(null);
    function add(target, image, pending) {
      if (!valid(target) || !image || typeof image.url !== 'string') return;
      var k = identity(target), imgKey = k + '|' + image.url;
      if (seen[imgKey]) return; seen[imgKey] = true;
      if (!map[k]) map[k] = {pokemonId:target.pokemonId, formId:target.formId || null,
        battleMode:target.battleMode, infographics:[]};
      map[k].infographics.push({url:image.url, alt:image.alt || 'Pokémon guide',
        source:image.source || '', sourceUrl:image.sourceUrl || '', pending:!!pending});
    }
    (Array.isArray(published) ? published : []).slice(0,1000).forEach(function (g) {
      if (!valid(g)) return;
      (Array.isArray(g.infographics) ? g.infographics : []).slice(0,20).forEach(function (im) { add(g, im, false); });
    });
    var items = Array.isArray(queue) ? queue : [], decisionsList = Array.isArray(decisions) ? decisions : [];
    decisionsList.slice(0,500).forEach(function (d) {
      if (!d || d.status !== 'approved' || !Array.isArray(d.targets)) return;
      var source = items.filter(function (i) { return i && i.id === d.id; })[0];
      if (!source || typeof source.image !== 'string') return;
      d.targets.filter(function (t) { return t && t.type === 'raid-boss'; }).forEach(function (t) {
        add(t, {url:source.image, alt:source.title || 'Pokémon guide',
          source:source.creator || '', sourceUrl:source.post || ''}, true);
      });
    });
    return Object.keys(map).sort().map(function (key) { return map[key]; });
  }
  function label(g, dex, forms) {
    var number = Number(g.pokemonId);
    var mon = (Array.isArray(dex) ? dex : []).filter(function (d) { return d && +d[0] === number; })[0];
    var base = mon ? mon[1] : '#' + g.pokemonId;
    var form = (Array.isArray(forms) ? forms : []).filter(function (f) { return f && +f[0] === number && f[1] === g.formId; })[0];
    var name = form ? String(form[2]) : (g.formId ? g.formId : '');
    var mode = g.battleMode;
    if (mode === 'mega' || mode === 'primal' || mode === 'gigantamax') {
      return (name || mode.charAt(0).toUpperCase() + mode.slice(1)) + ' ' + base;
    }
    return (mode === 'normal' ? '' : mode.charAt(0).toUpperCase() + mode.slice(1) + ' ') + base + (name ? ' (' + name + ')' : '');
  }
  return {valid:valid, identity:identity, entries:entries, label:label};
});
