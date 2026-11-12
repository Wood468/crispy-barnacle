/* "Store prices" in Events: every store- item with an Rp price, converted to A$ at the sourced rate and set against the
   verified Australian price. All numbers come from /prices.json through LIB.priceView, nothing is typed in here. */
(function () {
  'use strict';
  var esc = window.GOLIB.esc;
  /* Picture for each item: the game's own item art where I have it, the site's own icons otherwise. */
  /* Only exact, checked item artwork. A PokéCoin is not XP, an Incubator
     is not an Egg, and a Star Piece is not a Stardust icon. When no exact
     asset exists, an honest category token is preferable to a wrong picture. */
  var ICO = [
    [/^max potions?(?:\s*[×x]\s*\d+)?$/i, '/ico/i/max-potion.webp'],
    [/^max revives?(?:\s*[×x]\s*\d+)?$/i, '/ico/i/max-revive.webp'],
    [/^golden razz berr(?:y|ies)(?:\s*[×x]\s*\d+)?$/i, '/ico/i/golden-razz.webp'],
    [/^silver pinap berr(?:y|ies)(?:\s*[×x]\s*\d+)?$/i, '/ico/i/silver-pinap.webp'],
    [/^lucky eggs?(?:\s*[×x]\s*\d+)?$/i, '/ico/g/lucky.webp']
  ];
  function kindToken(label) {
    if (/pok[eé]coins?/i.test(label)) return '◎';
    if (/storage|item bag|bag upgrade|capacity/i.test(label)) return '↑';
    if (/^go pass|monthly.*pass|(?:event|admission).*ticket/i.test(label)) return 'PASS';
    if (/star pieces?/i.test(label)) return 'SP';
    if (/incubator/i.test(label)) return 'INC';
    if (/max particle/i.test(label)) return 'MP';
    if (/\bbox\b|\bbundle\b|\bpack\b/i.test(label)) return '▣';
    return '';
  }
  function icon(label) {
    var token = kindToken(label);
    for (var i = 0; i < ICO.length; i++) if (ICO[i][0].test(label)) {
      return '<img class="sp-i" src="' + esc(ICO[i][1]) + '" alt="" width="28" height="28" loading="lazy" decoding="async" data-sp-fallback="' + esc(token || '·') + '">';
    }
    return token ? '<span class="sp-i-token" aria-hidden="true">' + esc(token) + '</span>' : '';
  }
  function priority(p) {
    var label = String(p.label || ''), group = String(p.group || ''), kind = String(p.kind || '');
    if (/ticket|event.pass|monthly.pass|go pass/i.test(label + ' ' + group + ' ' + kind)) return 'passes';
    if (/storage|item bag|bag upgrade|capacity/i.test(label + ' ' + group + ' ' + kind)) return 'storage';
    if (/pok[eé]coins?|\bcoins?\b/i.test(label + ' ' + group + ' ' + kind)) return 'coins';
    if (/\bbox\b|\bbundle\b/i.test(label + ' ' + group)) return 'boxes';
    return 'items';
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
    if (!p) return '<span class="sp-regional-value sp-none" title="No sourced price observed for this region and channel">Not observed</span>';
    if (p.basis === 'estimate') {
      return '<span class="sp-regional-value sp-est"><b>Estimate ' + esc(R.fmt(p.min, p.currency) + '–' + R.fmt(p.max, p.currency)) + '</b>'
        + '<small>' + esc(p.confidence) + ' confidence · not a checkout price</small>'
        + '<small class="sp-basis">' + esc('Based on ' + p.basisText + ' · ' + chan(p)) + '</small></span>';
    }
    var state = p.basis === 'verified' ? 'Verified' : 'Recorded · not re-checked';
    var source = state + ' · ' + chan(p) + ' · ' + when(p.observed);
    return '<span class="sp-regional-value sp-ver" aria-label="' + esc(R.fmt(p.amount, p.currency) + '. ' + source) + '"><b>' + esc(R.fmt(p.amount, p.currency)) + '</b>'
      + '<small>' + esc(state + ' · ' + when(p.observed)) + '</small></span>';
  }
  function cheapestHtml(obs, balance) {
    var R = window.GORegionalPrices, packs = obs.filter(function (o) { return o.kind === 'coins' && o.coins && o.status === 'verified'; }).map(function (o) { return { coins: o.coins, amount: o.amount, currency: o.currency, oneTime: !!o.oneTime }; });
    var products = obs.filter(function (o) { return o.region === 'ID' && o.status === 'verified' && /pass|ultra/i.test(o.product); });
    return products.map(function (o) {
      var r = R.cheapest({ region: 'ID', product: o.product }, obs, { coinBalance: balance, packs: packs });
      var b = r.best; if (!b) return '';
      return '<div class="sp-r sp-regional-row"><span class="sp-n">' + esc(o.product) + '</span><span class="sp-regional-value"><b>' + esc(R.fmt(b.cash, b.currency)) + '</b> <small>'
        + esc('Lowest verified observed: ' + b.channelLabel + ', checked ' + when(b.price.observed) + (b.coinsUsed ? ', using ' + b.coinsUsed + ' coins' : '') + (b.leftoverCoins > 0 ? '; ' + b.leftoverCoins + ' coins left unused' : '') + '. Not a live checkout quote.') + '</small></span></div>';
    }).join('');
  }
  /* Product-first regional comparison. One card per known item, with price provenance
     close to the number; optional purchasing maths stays behind a disclosure. */
  function regional(data) {
    var R = window.GORegionalPrices; if (!R || !data.regional || !data.regional.length) return '';
    var obs = data.regional, items = R.catalogue(data.prices || [], obs);
    var balance = Math.max(0, parseInt(lsGet(COINS_KEY), 10) || 0);
    function productCard(p) {
      var au = p.aud > 0
        ? '<span class="sp-regional-value sp-ver"><b>' + esc(R.fmt(p.aud, 'AUD')) + '</b><small>Verified · ' + esc(when(p.observed)) + '</small></span>'
        : '<span class="sp-regional-value sp-none">Not observed</span>';
      var search = (p.label + ' ' + p.group).toLowerCase();
      return '<article class="sp-product" data-sp-product data-sp-name="' + esc(search) + '">'
        + '<header class="sp-product-head"><span class="sp-product-name">' + icon(p.label) + '<b>' + esc(p.label) + '</b></span><small class="sp-product-group">' + esc(p.group) + '</small></header>'
        + '<div class="sp-market-grid">'
        + '<div class="sp-market sp-market-au"><span class="sp-market-label">Australia <small>Web</small></span>' + au + '</div>'
        + '<div class="sp-market"><span class="sp-market-label">Indonesia <small>Web</small></span>' + priceCell(p.indonesia) + '</div>'
        + '<div class="sp-market"><span class="sp-market-label">India <small>in-app</small></span>' + priceCell(p.india) + '</div>'
        + '</div></article>';
    }
    return '<details class="storep storep-regional"><summary>Regional Store prices <small>' + items.length + ' products · AU / ID / IN</small></summary>'
      + '<p class="sp-intro">Official Store observations by country and channel. Prices are dated, not live checkout quotes. Estimates are clearly marked.</p>'
      + '<label class="sp-search"><span>Find a product</span><input type="search" data-sp-search placeholder="Search items, passes or bundles" aria-label="Search Store products" autocomplete="off"></label>'
      + '<p class="sp-results" data-sp-results aria-live="polite">' + items.length + ' products</p>'
      + '<div class="sp-catalogue">' + items.map(productCard).join('') + '</div>'
      + '<details class="sp-compare-more"><summary>Lowest verified observed options <small>Advanced comparison</small></summary>'
      + '<p class="note">Only verified, directly comparable offers qualify. Recorded and modelled prices cannot win. Your existing PokéCoins may reduce cash cost; estimates are never checkout quotes.</p>'
      + '<label class="sp-coins">PokéCoins in hand <input type="number" inputmode="numeric" min="0" step="1" value="' + balance + '" data-sp-coins aria-label="PokéCoins you already hold"></label>'
      + '<div data-sp-cheapest>' + cheapestHtml(obs, balance) + '</div></details></details>';
  }
  function go() {
    var host = document.getElementById('evsource'); if (!host || !window.GOLIB) return;
    GOLIB.loadPrices().then(function (d) {
      if (!d || !d.owner) return; /* the Rp store list is for the owner only */ var h = regional(d) || build(d); /* Prefer the complete regional catalogue; avoid repeating the older IDR summary. */ if (!h) return;
      var el = document.getElementById('storep-host');
      if (!el) { el = document.createElement('div'); el.id = 'storep-host'; host.parentNode.insertBefore(el, host); }
      el.innerHTML = h;
      var search = el.querySelector('[data-sp-search]');
      if (search) search.addEventListener('input', function () {
        var q = search.value.trim().toLowerCase(), shown = 0;
        el.querySelectorAll('[data-sp-product]').forEach(function (card) {
          var match = (card.getAttribute('data-sp-name') || '').includes(q);
          card.hidden = !match; if (match) shown++;
        });
        var result = el.querySelector('[data-sp-results]');
        if (result) result.textContent = shown + (shown === 1 ? ' product' : ' products') + ' shown';
      });
      var inp = el.querySelector('[data-sp-coins]');
      if (inp) inp.addEventListener('input', function () {
        var n = Math.max(0, parseInt(inp.value, 10) || 0); lsSet(COINS_KEY, String(n));
        el.querySelector('[data-sp-cheapest]').innerHTML = cheapestHtml(d.regional, n);
      });
    }).catch(function () { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
