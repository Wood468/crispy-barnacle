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
  /* One source-backed catalogue. Never show unsupported cross-currency savings. */
  function regional(data) {
    var R = window.GORegionalPrices;
    if (!R || !Array.isArray(data.regional) || !data.regional.length) return '';
    var items = R.catalogue(data.prices || [], data.regional);
    if (!items.length) return '';
    function cell(label, price, fallback) {
      return '<div class="sp-market"><span class="sp-market-label">' + label + '</span>' +
        (price || '<span class="sp-none">' + fallback + '</span>') + '</div>';
    }
    function au(p) {
      return p.aud > 0
        ? '<span class="sp-regional-value sp-ver"><b>A$' + p.aud.toFixed(2) + '</b><small>Observed ' + esc(when(p.observed)) + '</small></span>'
        : '';
    }
    return '<details class="storep storep-regional" open><summary>Store prices <small>Australia · Indonesia · India</small></summary>' +
      '<p class="sp-intro">Compare observed regional prices. Estimates and older records are labelled; prices are not live checkout quotes.</p>' +
      '<div class="sp-catalogue">' + items.map(function (p) {
        return '<article class="sp-product"><div class="sp-product-head">' + icon(p.label) +
          '<strong>' + esc(p.label) + '</strong></div><div class="sp-markets">' +
          cell('Australia · Web', au(p), 'Not observed') +
          cell('Indonesia · Web', p.indonesia ? priceCell(p.indonesia) : '', 'Not observed') +
          cell('India · in-app', p.india ? priceCell(p.india) : '', 'Not observed') +
          '</div></article>';
      }).join('') + '</div></details>';
  }
  function go() {
    var host = document.getElementById('evsource'); if (!host || !window.GOLIB) return;
    GOLIB.loadPrices().then(function (d) {
      if (!d || !d.owner) return; // Owner-only regional prices stay private.
      var h = regional(d);
      var el = document.getElementById('storep-host');
      if (!h) { if (el) el.remove(); return; }
      if (!el) { el = document.createElement('div'); el.id = 'storep-host'; host.parentNode.insertBefore(el, host); }
      el.innerHTML = h;
    }).catch(function () { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
