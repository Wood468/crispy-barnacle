/* "Store prices" in Events: every store- item with an Rp price, converted to A$ at the sourced rate and set against the
   verified Australian price. All numbers come from /prices.json through LIB.priceView, nothing is typed in here. */
(function () {
  'use strict';
  var esc = window.GOLIB.esc;
  /* Picture for each item: the game's own item art where I have it, the site's own icons otherwise. */
  var ICO = [[/max potion/i, '/ico/i/max-potion.webp'], [/max revive/i, '/ico/i/max-revive.webp'], [/golden razz/i, '/ico/i/golden-razz.webp'], [/silver pinap/i, '/ico/i/silver-pinap.webp'],
    [/remote raid pass/i, '/ico/g/raidpass.webp'], [/battle pass/i, '/ico/pass.webp'], [/lucky egg/i, '/ico/g/lucky.webp'], [/star piece/i, '/ico/dust.webp'], [/incubator/i, '/ico/egg.webp'],
    [/max particle/i, 'PARTICLE'], [/pok.?coins/i, '/ico/xp.webp'], [/box|pack/i, '/ico/g/event.webp']];
  function icon(label) {
    for (var i = 0; i < ICO.length; i++) if (ICO[i][0].test(label)) { var u = ICO[i][1] === 'PARTICLE' ? (window.GODASH && GODASH.IMG_PARTICLE) : ICO[i][1]; return u ? '<img class="sp-i" src="' + esc(u) + '" alt="" width="28" height="28" loading="lazy" decoding="async" data-err="rm">' : ''; }
    return '';
  }
  function build(data) {
    var seen = {}, groups = {}, order = [];
    (data.prices || []).forEach(function (p) {
      if (!/^store-/.test(p.product) || seen[p.product] || p.currency !== 'IDR') return; seen[p.product] = 1;
      var v = window.GOLIB.priceView(data, p.product, new Date().toISOString().slice(0, 10));
      var au = v.sub.match(/A\$([\d.]+)/), sv = v.save.match(/\((\d+)%\)/);
      var g = p.group || 'Other'; if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push({ label: p.label || p.product, main: v.main, au: au ? 'A$' + au[1] : '', save: v.save, pct: sv ? +sv[1] : 0 });
    });
    if (!order.length) return '';
    var fx = data.fx || {};
    return '<details class="storep"><summary>Store prices <small>Indonesia vs Australia</small></summary>'
      + order.map(function (g) {
        return '<h4>' + esc(g) + '</h4>' + groups[g].map(function (r) {
          return '<div class="sp-r"><span class="sp-n">' + icon(r.label) + esc(r.label) + '</span><b class="sp-a">' + esc(r.main) + '</b><span class="sp-o">' + esc(r.au) + '</span>' + (r.save ? '<span class="sv">' + esc(r.save) + '</span>' : '<span></span>') + '</div>';
        }).join('');
      }).join('')
      + '<p class="note">Rp prices read from the Indonesian web store and converted at ' + esc(String(fx.rate)) + ' A$ per Rp (' + esc(fx.source || '') + ', ' + esc(fx.observed || '') + '). Australian prices from the Australian store. Nothing is converted from US prices.</p></details>';
  }
  var COINS_KEY = 'gofn-store-coins-v1';
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function when(iso) { var d = new Date(iso + 'T00:00:00Z'); return isNaN(d) ? String(iso) : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  function chan(p) { var R = window.GORegionalPrices; return R.REGIONS[p.region] + ' ' + R.CHANNELS[p.channel]; }
  /* One price cell. Verified prices are plain; estimates always say "Estimate", show a range, a confidence and their basis. */
  function priceCell(p) {
    var R = window.GORegionalPrices;
    if (!p) return '<span class="sp-regional-value sp-none">Not calibrated</span>';
    if (p.basis === 'estimate') {
      return '<span class="sp-regional-value sp-est"><b>Estimate</b> ' + esc(R.fmt(p.min, p.currency) + ' to ' + R.fmt(p.max, p.currency)) + ' <small>' + esc(p.confidence) + ' confidence</small>'
        + '<small class="sp-basis">' + esc(chan(p) + '. Basis: ' + p.basisText + '. Not a checkout price.') + '</small></span>';
    }
    return '<span class="sp-regional-value sp-ver"><b>' + esc(R.fmt(p.amount, p.currency)) + '</b> <small>' + esc((p.basis === 'verified' ? 'Verified' : 'Recorded, not re-checked') + ' ' + chan(p) + ', ' + when(p.observed)) + '</small></span>';
  }
  function cheapestHtml(obs, balance) {
    var R = window.GORegionalPrices, packs = obs.filter(function (o) { return o.kind === 'coins' && o.coins && o.status === 'verified'; }).map(function (o) { return { coins: o.coins, amount: o.amount, currency: o.currency, oneTime: !!o.oneTime }; });
    var products = obs.filter(function (o) { return o.region === 'ID' && o.status === 'verified' && /pass|ultra/i.test(o.product); });
    return products.map(function (o) {
      var r = R.cheapest({ region: 'ID', product: o.product }, obs, { coinBalance: balance, packs: packs });
      var b = r.best; if (!b) return '';
      return '<div class="sp-r sp-regional-row"><span class="sp-n">' + esc(o.product) + '</span><span class="sp-regional-value"><b>' + esc(R.fmt(b.cash, b.currency)) + '</b> <small>'
        + esc((b.isEstimate ? 'Estimate. ' : '') + 'cheapest: ' + b.channelLabel + (b.coinsUsed ? ', using ' + b.coinsUsed + ' coins' : '') + (b.leftoverCoins > 0 ? '; ' + b.leftoverCoins + ' coins left unused' : '')) + '</small></span></div>';
    }).join('');
  }
  // One source-backed catalogue; do not repeat legacy savings or claim a cheapest option.
  function regional(data) {
    var R = window.GORegionalPrices;
    if (!R || !Array.isArray(data.regional) || !data.regional.length) return '';
    var items = R.catalogue(data.prices || [], data.regional);
    if (!items.length) return '';
    function regionCell(label, value) {
      return '<div class="spc-region"><span class="spc-region-name">' + label + '</span>' + value + '</div>';
    }
    var cards = items.map(function (p) {
      var aud = p.aud > 0
        ? '<strong>A$' + Number(p.aud).toFixed(2) + '</strong><small>Observed ' + esc(when(p.observed)) + '</small>'
        : '<span class="spc-missing">Not observed</span>';
      return '<article class="spc-card"><div class="spc-heading">' + icon(p.label)
        + '<h4>' + esc(p.label) + '</h4></div><div class="spc-regions">'
        + regionCell('Australia · Web', aud)
        + regionCell('Indonesia · Web', priceCell(p.indonesia))
        + regionCell('India · in-app', priceCell(p.india))
        + '</div></article>';
    }).join('');
    return '<details class="storep storep-regional spc-catalogue"><summary>Regional prices <small>Compare available store prices</small></summary>'
      + '<p class="spc-intro">Observed prices are dated snapshots, not live checkout quotes. Estimates are labelled and never treated as confirmed savings. Missing prices are not assumed.</p>'
      + '<div class="spc-grid">' + cards + '</div></details>';
  }
  function go() {
    var host = document.getElementById('evsource'); if (!host || !window.GOLIB) return;
    GOLIB.loadPrices().then(function (d) {
      if (!d || !d.owner) return; /* the Rp store list is for the owner only */ var h = regional(d); if (!h) return;
      var el = document.getElementById('storep-host');
      if (!el) { el = document.createElement('div'); el.id = 'storep-host'; host.parentNode.insertBefore(el, host); }
      el.innerHTML = h;
    }).catch(function () { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
