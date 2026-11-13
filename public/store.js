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
    [/^incense$/i, '/ico/incense.webp'],
    [/^elite fast tm(?:s)?(?:\s*[×x]\s*\d+)?$/i, '/ico/g/elite-fast-tm.webp'],
    [/^elite charged tm(?:s)?(?:\s*[×x]\s*\d+)?$/i, '/ico/g/elite-charged-tm.webp'],
    [/^raid pass(?:es)?(?:\s*[×x]\s*\d+)?$/i, '/ico/g/raidpass.webp']
  ];
  function kindToken(label) {
    if (/pok[eé]coins?/i.test(label)) return '◎';
    if (/storage|item bag|bag upgrade|capacity/i.test(label)) return '↑';
    if (/^(?:remote )?raid pass(?:es)?(?:\s*[×x]\s*\d+)?$|^premium battle pass(?:es)?(?:\s*[×x]\s*\d+)?$/i.test(label)) return 'PASS';
    if (/^elite (?:fast|charged) tm(?:s)?(?:\s*[×x]\s*\d+)?$/i.test(label)) return 'TM';
    if (/^go[- ]pass|monthly.*pass|(?:event|admission).*ticket/i.test(label)) return 'PASS';
    if (/lucky eggs?/i.test(label)) return 'LE';
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
    if (/\bboxes?\b|\bbundles?\b/i.test(label + ' ' + group)) return 'boxes';
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
  /* The approximate AUD reference goes ABOVE the local checkout currency. */
  function audPlaceholder(p, quotes) {
    var FX = window.GOStoreFX;
    var amount = FX && FX.display ? FX.display(p.basis === 'estimate'
      ? { currency: p.currency, min: p.min, max: p.max }
      : { currency: p.currency, amount: p.amount }, quotes) : null;
    var min = p.basis === 'estimate' ? p.min : p.amount;
    var attrs = ' data-sp-aud-currency="' + esc(p.currency) + '" data-sp-aud-min="' + esc(min) + '"';
    if (p.basis === 'estimate') attrs += ' data-sp-aud-max="' + esc(p.max) + '"';
    var title = amount ? 'Reference exchange rate: ' + amount.source + ', ' + amount.observed + '; not a checkout price'
      : 'Australian dollar reference conversion not available';
    return '<strong class="sp-aud-equivalent"' + attrs + ' title="' + esc(title) + '">'
      + esc(amount ? amount.text : 'A$ rate unavailable') + '</strong>';
  }
  /* Exact observed local prices are preserved, and estimates retain ranges. */
  function priceCell(p, quotes) {
    var R = window.GORegionalPrices;
    if (!p) return '<span class="sp-regional-value sp-none" title="No sourced price observed for this region and channel">Not observed</span>';
    if (p.basis === 'estimate') {
      return '<span class="sp-regional-value sp-est">' + audPlaceholder(p, quotes)
        + '<b class="sp-local-price">Estimate ' + esc(R.fmt(p.min, p.currency) + '–' + R.fmt(p.max, p.currency)) + '</b>'
        + '<small>' + esc(p.confidence) + ' confidence · not a checkout price</small>'
        + '<small class="sp-basis">' + esc('Based on ' + p.basisText + ' · ' + chan(p)) + '</small></span>';
    }
    var state = p.basis === 'verified' ? 'Verified' : 'Recorded · not re-checked';
    var source = state + ' · ' + chan(p) + ' · ' + when(p.observed);
    return '<span class="sp-regional-value sp-ver" aria-label="' + esc(R.fmt(p.amount, p.currency) + '. ' + source) + '">'
      + audPlaceholder(p, quotes)
      + '<b class="sp-local-price">' + esc(R.fmt(p.amount, p.currency)) + '</b>'
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
    var R = window.GORegionalPrices; if (!R) return '';
    /* Official verified AU Web Store offers stay available even when the
       regional observation feed is empty, delayed or unavailable. */
    var obs = Array.isArray(data.regional) ? data.regional : [];
    var prices = Array.isArray(data.prices) ? data.prices : [];
    var items = R.catalogue(prices, obs);
    if (!items.length) return '';
    var balance = Math.max(0, parseInt(lsGet(COINS_KEY), 10) || 0);
    var comparableOffers = cheapestHtml(obs, balance);
    var sections = [
      { id: 'passes', label: 'Passes & tickets', open: true },
      { id: 'storage', label: 'Storage upgrades', open: true },
      { id: 'coins', label: 'PokéCoins', open: true },
      { id: 'boxes', label: 'Boxes & bundles', open: false },
      { id: 'items', label: 'Items & other', open: false }
    ];
    var bySection = {};
    sections.forEach(function (s) { bySection[s.id] = []; });
    items.forEach(function (p) { bySection[priority(p)].push(p); });
    function productCard(p) {
      var au = p.aud > 0
        ? '<span class="sp-regional-value sp-ver"><b>' + esc(R.fmt(p.aud, 'AUD')) + '</b><small>Verified · ' + esc(when(p.observed)) + '</small></span>'
        : '<span class="sp-regional-value sp-none" title="No verified Australian Web Store price observed">Not observed</span>';
      var search = (p.label + ' ' + p.product + ' ' + p.group + ' ' + priority(p)).toLowerCase();
      var identityNote = p.ambiguousSku
        ? '<small class="sp-source-id-note">Distinct official SKU: ' + esc(p.product) + ' · other-region price cannot be matched safely</small>'
        : p.regionalUnmatched
          ? '<small class="sp-source-id-note">Regional observation · no exact AU SKU pairing established</small>'
          : p.sourceIdOnly
            ? '<small class="sp-source-id-note">Official AU observation · exact SKU; item name not recorded</small>' : '';
      return '<article class="sp-product" data-sp-product data-sp-name="' + esc(search) + '">'
        + '<header class="sp-product-head"><span class="sp-product-name">' + icon(p.label) + '<b>' + esc(p.label) + '</b></span>'
        + identityNote + '</header>'
        + '<div class="sp-market-grid">'
        + '<div class="sp-market sp-market-au"><span class="sp-market-label">Australia <small>Web</small></span>' + au + '</div>'
        + '<div class="sp-market"><span class="sp-market-label">Indonesia <small>Web</small></span>' + priceCell(p.indonesia, data.audQuotes) + '</div>'
        + '<div class="sp-market"><span class="sp-market-label">India <small>in-app</small></span>' + priceCell(p.india, data.audQuotes) + '</div>'
        + '</div></article>';
    }
    var catalogue = sections.filter(function (s) { return bySection[s.id].length; }).map(function (s) {
      return '<details class="sp-group" data-sp-group="' + s.id + '" data-sp-default-open="' + (s.open ? 'yes' : 'no') + '"' + (s.open ? ' open' : '') + '>'
        + '<summary>' + esc(s.label) + ' <small>' + bySection[s.id].length + ' products</small></summary>'
        + '<div class="sp-group-items">' + bySection[s.id].map(productCard).join('') + '</div></details>';
    }).join('');
    return '<details class="storep storep-regional" open><summary>Regional Store prices <small>' + items.length + ' products · AU / ID / IN</small></summary>'
      + '<p class="sp-intro">Dated Store observations, not live checkout quotes. Approximate A$ values use <a href="https://www.exchangerate-api.com/" target="_blank" rel="noopener noreferrer">ExchangeRate-API</a> reference rates. “Not observed” means no sourced price for that region.</p>'
      + '<label class="sp-search"><span>Find a product</span><input type="search" data-sp-search placeholder="Search passes, storage, coins or items" aria-label="Search Store products" autocomplete="off"></label>'
      + '<p class="sp-results" data-sp-results aria-live="polite">' + items.length + ' products · ' + sections.filter(function (s) {return bySection[s.id].length;}).length + ' categories</p>'
      + '<div class="sp-catalogue">' + catalogue + '</div>'
      + (comparableOffers ? '<details class="sp-compare-more"><summary>Lowest verified observed options <small>Advanced comparison</small></summary>'
      + '<p class="note">Only verified, directly comparable offers qualify. Recorded and modelled prices cannot win. Your existing PokéCoins may reduce cash cost; estimates are never checkout quotes.</p>'
      + '<label class="sp-coins">PokéCoins in hand <input type="number" inputmode="numeric" min="0" step="1" value="' + balance + '" data-sp-coins aria-label="PokéCoins you already hold"></label>'
      + '<div data-sp-cheapest>' + comparableOffers + '</div></details>' : '') + '</details>';
  }
  function go() {
    var host = document.getElementById('evsource'); if (!host || !window.GOLIB) return;
    GOLIB.loadPrices().then(async function (d) {
      if (!d || !d.owner) return; /* Owner-only regional prices stay private. */
      /* Render local observed prices immediately; an external FX request must
         never delay the Store, including when a provider hangs. */
      var h = regional(d) || build(d); /* Prefer the complete regional catalogue; avoid repeating the older IDR summary. */ if (!h) return;
      var el = document.getElementById('storep-host');
      if (!el) { el = document.createElement('div'); el.id = 'storep-host'; host.parentNode.insertBefore(el, host); }
      el.innerHTML = h;
      /* FX is reference-only. Hydrate each existing AUD placeholder in place,
         preserving search, disclosure and coin controls while offline. */
      if (window.GOStoreFX && Array.isArray(d.regional) && d.regional.length) {
        var fetcher = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
        window.GOStoreFX.retrieve(fetcher, d.fx).then(function (quotes) {
          if (!el.querySelectorAll) return;
          el.querySelectorAll('[data-sp-aud-currency]').forEach(function (node) {
            var currency = node.getAttribute('data-sp-aud-currency');
            var min = Number(node.getAttribute('data-sp-aud-min'));
            var max = node.getAttribute('data-sp-aud-max');
            var converted = window.GOStoreFX.display({
              currency: currency, min: min, max: max == null ? null : Number(max)
            }, quotes);
            if (!converted) return;
            node.textContent = converted.text;
            node.setAttribute('title', 'Approximate AUD reference · ' + converted.source
              + ' · ' + converted.observed + ' · not a checkout price');
            var note = document.createElement('small');
            note.className = 'sp-aud-source';
            note.textContent = 'FX · ' + when(converted.observed);
            node.appendChild(note);
          });
        }).catch(function () { /* Keep original regional prices visible. */ });
      }
      var search = el.querySelector('[data-sp-search]');
      if (search) search.addEventListener('input', function () {
        var q = search.value.trim().toLowerCase(), shown = 0;
        el.querySelectorAll('[data-sp-group]').forEach(function (group) {
          var count = 0;
          group.querySelectorAll('[data-sp-product]').forEach(function (card) {
            var match = (card.getAttribute('data-sp-name') || '').includes(q);
            card.hidden = !match; if (match) { shown++; count++; }
          });
          group.hidden = !count;
          if (q && count) group.open = true;
          else if (!q) group.open = group.getAttribute('data-sp-default-open') === 'yes';
        });
        var result = el.querySelector('[data-sp-results]');
        if (result) result.textContent = shown + (shown === 1 ? ' product' : ' products') + ' shown';
      });
      /* Capture an exact-asset load failure and substitute an honest token.
         Never leave a broken image or substitute an unrelated product image. */
      if (el.addEventListener) el.addEventListener('error', function (event) {
        var bad = event.target;
        if (!bad || !bad.matches || !bad.matches('img.sp-i')) return;
        var fallback = document.createElement('span');
        fallback.className = 'sp-i-token';
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = bad.getAttribute('data-sp-fallback') || '·';
        bad.replaceWith(fallback);
      }, true);
      var inp = el.querySelector('[data-sp-coins]');
      if (inp) inp.addEventListener('input', function () {
        var n = Math.max(0, parseInt(inp.value, 10) || 0); lsSet(COINS_KEY, String(n));
        el.querySelector('[data-sp-cheapest]').innerHTML = cheapestHtml(d.regional, n);
      });
    }).catch(function () { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
