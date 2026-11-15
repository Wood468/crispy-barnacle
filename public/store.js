/* "Store prices" in Events: every store- item with an Rp price, converted to A$ at the sourced rate and set against the
   verified Australian price. All numbers come from /prices.json through LIB.priceView, nothing is typed in here. */
(function () {
  'use strict';
  var esc = window.GOLIB.esc;
  /* Only exact, checked item artwork. A PokéCoin is not XP, an Incubator
     is not an Egg, and a Star Piece is not a Stardust icon. When no exact
     asset exists the card simply has no image. */
  var ICO = [
    [/^max potions?(?:\s*[×x]\s*\d+)?$/i, '/ico/i/max-potion.webp'],
    [/^max revives?(?:\s*[×x]\s*\d+)?$/i, '/ico/i/max-revive.webp'],
    [/^golden razz berr(?:y|ies)(?:\s*[×x]\s*\d+)?$/i, '/ico/i/golden-razz.webp'],
    [/^silver pinap berr(?:y|ies)(?:\s*[×x]\s*\d+)?$/i, '/ico/i/silver-pinap.webp'],
    [/^incense(?:\s*[×x]\s*[1-9]\d*)?$/i, '/ico/incense.webp'],
    [/^elite fast tm(?:s)?(?:\s*[×x]\s*\d+)?$/i, '/ico/g/elite-fast-tm.webp'],
    [/^elite charged tm(?:s)?(?:\s*[×x]\s*\d+)?$/i, '/ico/g/elite-charged-tm.webp'],
    [/^raid pass(?:es)?(?:\s*[×x]\s*\d+)?$/i, '/ico/g/raidpass.webp']
  ];
  /* Exact local art only (same-origin /ico/**). With no exact asset there is no image slot at all:
     never a letter tile, a glyph, or a picture borrowed from another item. */
  function icon(label) {
    for (var i = 0; i < ICO.length; i++) if (ICO[i][0].test(label)) {
      return '<img class="sp-i" src="' + esc(ICO[i][1]) + '" alt="' + esc(label) + '" width="40" height="40" loading="lazy" decoding="async">';
    }
    return '';
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
  function storeSearchKey(value) {
    /* A user typing "pokemon" must find Pokémon/PokéCoins, even when
       the official source uses composed or decomposed accented letters. */
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function when(iso) { var d = new Date(iso + 'T00:00:00Z'); return isNaN(d) ? String(iso) : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  /* The approximate A$ reference goes ABOVE the native amount. It is an empty node until a fresh
     reference rate is available (hidden by CSS while empty); exchange-rate provenance lives in its title only.
     Modelled estimates are ranges, so they carry no A$ line. */
  function audPlaceholder(p, quotes) {
    var FX = window.GOStoreFX;
    var amount = FX && FX.display ? FX.display({ currency: p.currency, amount: p.amount }, quotes) : null;
    var attrs = ' data-sp-aud-currency="' + esc(p.currency) + '" data-sp-aud-min="' + esc(p.amount) + '"';
    var title = amount ? 'Reference exchange rate: ' + amount.source + ', ' + amount.observed + '; not a checkout price' : '';
    return '<strong class="sp-aud-equivalent"' + attrs + (title ? ' title="' + esc(title) + '"' : '') + '>'
      + esc(amount ? amount.text : '') + '</strong>';
  }
  var REGION_TITLE = { AU: 'Australia · Web Store', ID: 'Indonesia · Web Store', IN: 'India · in-app shop' };
  var REGION_NAME = { AU: 'Australia', ID: 'Indonesia', IN: 'India' };
  var FLAG = { AU: '🇦🇺', ID: '🇮🇩', IN: '🇮🇳' };
  function priceCell(region, p, quotes) {
    var R = window.GORegionalPrices, body, extra = '';
    if (!p) body = '<span class="sp-none" title="No sourced price">—<span class="sr-only">No price</span></span>';
    else if (p.basis === 'estimate') {
      /* The one honesty marker: only a modelled value carries "est." */
      extra = ' data-sp-basis="estimate"';
      body = '<b class="sp-local-price"><span class="sp-est-mark" title="Estimate, not a checkout price"><span aria-hidden="true">est.</span><span class="sr-only">Estimated </span></span> '
        + esc(R.fmt(p.min, p.currency) + '–' + Number(p.max).toLocaleString('en-AU', { maximumFractionDigits: 0 })) + '</b>';
    } else {
      /* VoiceOver reads the A$ reference before the original local price; no local-only aria-label masks it. */
      /* Recorded (not re-checked) prices are dimmed and carry a tiny "~"; only a verified price is unmarked. */
      var older = p.basis !== 'verified';
      if (older) extra = ' data-sp-basis="recorded"';
      body = (p.currency === 'AUD' ? '' : audPlaceholder(p, quotes))
        + '<b class="sp-local-price">' + (older ? '<span class="sp-older-mark"><span aria-hidden="true">~</span><span class="sr-only">Older price </span></span>' : '')
        + esc(R.fmt(p.amount, p.currency)) + '</b>';
    }
    return '<div class="sp-price' + (p && p.basis === 'estimate' ? ' sp-est' : p && p.basis !== 'verified' ? ' sp-older' : '') + '" data-sp-region="' + region + '"' + extra
      + ' title="' + esc(REGION_TITLE[region]) + '"><span class="sp-flag" aria-hidden="true">' + FLAG[region]
      + '</span><span class="sr-only">' + REGION_NAME[region] + '</span>' + body + '</div>';
  }
  /* A source-verified channel ledger for EVERY known regional product.
     Only claim a cheapest option when two or more channels share an explicit
     source SKU, exact package/bonus identity and currency; one channel is not a win. */
  function verifiedOptionsHtml(obs) {
    var R = window.GORegionalPrices, rows = Array.isArray(obs) ? obs : [];
    var observed = rows.filter(function (o) {
      return o && o.status === 'verified' && o.product && o.region && o.channel
        && o.currency && Number.isFinite(o.amount) && o.amount > 0
        && Number.isFinite(Date.parse(o.observed));
    });
    if (!observed.length) return '';
    /* Display each exact observation identity independently. A shared human
       label is NOT proof that two boxes or coin bonuses have the same SKU.
       Only an explicit verified sourceSku can authorize channel comparison. */
    var groups = new Map();
    observed.forEach(function (o) {
      var sku = typeof o.sourceSku === 'string' && /^[a-z0-9_.:-]{2,100}$/i.test(o.sourceSku)
        ? o.sourceSku.toLowerCase() : '';
      var labelKey = String(o.product).trim().toLowerCase().replace(/\s+/g, ' ');
      var key = o.region + '|' + (sku
        ? 'sku:' + sku + '|product:' + labelKey + '|promo:' + !!o.oneTime
        : 'obs:' + String(o.id || 'unidentified') + '|product:' + labelKey
          + '|channel:' + o.channel + '|currency:' + o.currency);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    });
    return Array.from(groups.values()).map(function (group) {
      var item = group[0], product = item.product, region = item.region;
      var sku = typeof item.sourceSku === 'string' && /^[a-z0-9_.:-]{2,100}$/i.test(item.sourceSku)
        ? item.sourceSku.toLowerCase() : '';
      var candidates = new Map();
      group.forEach(function (o) {
        var key = o.channel + '|' + o.currency;
        var old = candidates.get(key);
        if (!old || String(o.observed) > String(old.observed)) candidates.set(key, o);
      });
      var offers = Array.from(candidates.values());
      var sameCurrency = offers.every(function (o) { return o.currency === offers[0].currency; });
      var canCompare = !!sku && offers.length >= 2 && sameCurrency
        && offers.every(function (o) { return o.sourceSku && o.sourceSku.toLowerCase() === sku
          && o.product === product && !!o.oneTime === !!item.oneTime; });
      var validBest = canCompare ? offers.slice().sort(function (a,b) { return a.amount - b.amount; })[0] : null;
      var regionName = R.REGIONS[region] || region;
      var label = regionName + ' · ' + product;
      var observedText = offers.map(function (o) {
        return (R.CHANNELS[o.channel] || o.channel) + ': ' + R.fmt(o.amount, o.currency)
          + ', checked ' + when(o.observed);
      }).join('; ');
      var status = validBest
        ? 'Lowest verified cash price across ' + offers.length + ' exact-SKU channels: '
          + (R.CHANNELS[validBest.channel] || validBest.channel) + ' · '
          + R.fmt(validBest.amount, validBest.currency)
        : offers.length > 1 && !sameCurrency
          ? 'Different currencies: no reliable lowest-price comparison'
          : offers.length > 1
            ? 'Matching product identity not established; no lowest-price comparison'
            : 'Only one verified buying channel observed; no lowest-price comparison';
      return '<div class="sp-r sp-regional-row"' + (canCompare ? ' data-sp-compared="yes"' : '') + '><span class="sp-n">' + esc(label)
        + '</span><span class="sp-regional-value"><b>' + esc(status) + '</b><small>'
        + esc(observedText + '. Not a live checkout quote.') + '</small></span></div>';
    }).join('');
  }
  function coveragePanel(items, R) {
    var data = R.coverage(items);
    var withExactArt = items.filter(function (p) {
      return ICO.some(function (record) { return record[0].test(String(p.label || '')); });
    }).length;
    function examples(labels) {
      var unique = Array.from(new Set(labels));
      return unique.length ? ' Examples: ' + unique.slice(0, 5).map(esc).join(', ')
        + (unique.length > 5 ? ' (+' + (unique.length - 5) + ' more)' : '') + '.' : '';
    }
    return '<details class="sp-compare-more sp-coverage" data-sp-coverage>'
      + '<summary>Source coverage & refresh checklist <small>'
      + data.unlabelled.length + ' names · ' + data.unpaired.length + ' unmatched · '
      + data.reviewDue.length + ' review due</small></summary>'
      + '<p class="note">Owner-only data review. Dated observations are not live checkout offers. '
      + '“Verified” means verified on the recorded date, not available today. Review due after '
      + data.reviewDays + ' days.</p>'
      + '<ul>'
      + '<li>Verified source prices: Australia ' + data.auVerified + ', Indonesia '
      + data.idVerified + ', India ' + data.inVerified + ' of ' + data.total + ' product cards.</li>'
      + '<li>Official listings awaiting regional prices: ' + data.sourceOnly.length + '.'
      + examples(data.sourceOnly) + '</li>'
      + '<li>Missing Australian product names: ' + data.unlabelled.length + '.'
      + examples(data.unlabelled) + '</li>'
      + '<li>Regional SKU/contents not safely paired: ' + data.unpaired.length + '.'
      + examples(data.unpaired) + '</li>'
      + '<li>No observed Indonesian source price: ' + data.missingId.length
      + '; observed or modelled but not verified: ' + data.unverifiedId.length + '.</li>'
      + '<li>No observed Indian source price: ' + data.missingIn.length
      + '; recorded or estimated but not verified: ' + data.unverifiedIn.length + '.</li>'
      + '<li>Observations due for a new source check: ' + data.reviewDue.length + '.'
      + examples(data.reviewDue) + '</li>'
      + '<li>Exact item-art mappings: ' + withExactArt + ' of ' + data.total
      + '; other cards use safe category symbols until exact artwork is verified.</li>'
      + '</ul><p class="note">Record a new dated Store observation and confirm exact pack contents '
      + 'or source SKU before comparing offers. Never reuse a box image or price from a similar name.</p>'
      + '</details>';
  }
  /* Product-first regional comparison. One card per known item, with price provenance
     close to the number; optional purchasing maths stays behind a disclosure. */
  function regional(data) {
    var R = window.GORegionalPrices; if (!R) return '';
    /* Official verified AU Web Store offers stay available even when the
       regional observation feed is empty, delayed or unavailable. */
    var obs = Array.isArray(data.regional) ? data.regional : [];
    var prices = Array.isArray(data.prices) ? data.prices : [];
    var items = R.catalogue(prices, obs, undefined, window.GOStoreOfferIdentities);
    if (!items.length) return '';
    var snapshot = data.storeSnapshot && Array.isArray(data.storeSnapshot.items)
      && Array.isArray(data.storeSnapshot.gone) ? data.storeSnapshot : null;
    items.forEach(function (p) {
      p.sourceOffer = R.sourceOffer(p.label, snapshot, undefined, {
        ambiguousSku: !!(p.ambiguousSku || p.regionalUnmatched)
      });
    });
    var comparableOffers = verifiedOptionsHtml(obs);
    var reviewPanel = coveragePanel(items, R);
    var sections = [
      { id: 'passes', label: 'Passes & tickets', open: true },
      { id: 'storage', label: 'Storage upgrades', open: true },
      { id: 'coins', label: 'PokéCoins', open: true },
      { id: 'boxes', label: 'Boxes & bundles', open: false },
      { id: 'items', label: 'Items & other', open: false }
    ];
    var bySection = {}, earlier = [];
    sections.forEach(function (s) { bySection[s.id] = []; });
    items.forEach(function (p) {
      var category = priority(p), status = p.sourceOffer.status;
      /* A missing source does not remove the useful historical category list.
         An explicit retirement always leaves the main list; uncertainty for
         time-limited passes/boxes is separated, while stable items/coin/store
         upgrades remain visible but clearly marked unconfirmed. */
      if (snapshot && (status === 'archived' ||
          (status === 'unconfirmed' && (category === 'passes' || category === 'boxes'))))
        earlier.push(p);
      else bySection[category].push(p);
    });
    /* Same-name cards inside one section get a tiny disambiguator (no sentences): the lone priced
       region ("AU only") when that tells them apart, otherwise "Option N". */
    function tagDuplicates(list) {
      var byName = {};
      list.forEach(function (p) { var k = String(p.label).trim().toLowerCase(); (byName[k] || (byName[k] = [])).push(p); });
      Object.keys(byName).forEach(function (k) {
        var set = byName[k]; if (set.length < 2) return;
        var tags = set.map(function (p) {
          var have = [p.aud > 0 ? 'AU' : '', p.indonesia ? 'ID' : '', p.india ? 'IN' : ''].filter(Boolean);
          return have.length === 1 ? have[0] + ' only' : '';
        });
        var n = 0;
        set.forEach(function (p, i) {
          var unique = tags[i] && tags.filter(function (t) { return t === tags[i]; }).length === 1;
          p.tag = unique ? tags[i] : 'Option ' + (++n);
        });
      });
    }
    sections.forEach(function (s) { tagDuplicates(bySection[s.id]); });
    tagDuplicates(earlier);
    function productCard(p, inMain) {
      var unconfirmed = inMain && p.sourceOffer && p.sourceOffer.status !== 'listed';
      var search = storeSearchKey(p.label + ' ' + p.product + ' ' + p.group + ' ' + priority(p));
      var evidence = p.sourceOffer;
      return '<article class="sp-product" data-sp-product data-sp-name="' + esc(search) + '"'
        + (evidence ? ' data-sp-listing="' + esc(evidence.status) + '"' : '') + '>'
        + '<div class="sp-line">' + icon(p.label) + '<b class="sp-name">' + esc(p.label) + '</b>'
        + (p.tag ? '<small class="sp-tag">' + esc(p.tag) + '</small>' : '')
        + (unconfirmed ? '<span class="sp-unconf" data-sp-unconfirmed><span aria-hidden="true">?</span><span class="sr-only">Availability not confirmed</span></span>' : '') + '</div>'
        + '<div class="sp-prices">'
        + priceCell('AU', p.aud > 0 ? { basis: 'verified', currency: 'AUD', amount: p.aud } : null, data.audQuotes)
        + priceCell('ID', p.indonesia, data.audQuotes)
        + priceCell('IN', p.india, data.audQuotes)
        + '</div></article>';
    }
    var catalogue = sections.filter(function (s) { return bySection[s.id].length; }).map(function (s) {
      return '<details class="sp-group" data-sp-group="' + s.id + '" data-sp-default-open="' + (s.open ? 'yes' : 'no') + '"' + (s.open ? ' open' : '') + '>'
        + '<summary>' + esc(s.label) + ' <small>' + bySection[s.id].length + '</small></summary>'
        + '<div class="sp-group-items">' + bySection[s.id].map(function (p) { return productCard(p, true); }).join('') + '</div></details>';
    }).join('');
    if (snapshot && earlier.length) {
      catalogue += '<details class="sp-group sp-history" data-sp-group="earlier" data-sp-default-open="no">'
        + '<summary>Earlier offers <small>' + earlier.length + '</small></summary>'
        + '<div class="sp-group-items">' + earlier.map(function (p) { return productCard(p, false); }).join('') + '</div></details>';
    }
    /* The data-review material (coverage checklist, channel comparison) is owner-only and collapsed
       behind one quiet row at the bottom: it adds no text to the default view. */
    var legend = '<p class="sp-legend" data-sp-legend><span aria-hidden="true">~</span> older price, recorded and not re-checked · est. modelled estimate · ? availability not confirmed · — no sourced price</p>';
    var review = legend + reviewPanel + (comparableOffers ? '<details class="sp-compare-more"><summary>Verified regional purchase options <small>Advanced comparison</small></summary>'
      + '<p class="note">Source-verified regional items, passes, storage and coin packs are listed by exact product and channel. A lowest observed cash price is named only when two or more channels share an explicit verified product SKU and currency. Estimated, recorded-only and ambiguous boxes cannot win; no result is a live checkout quote.</p>'
      + '<div data-sp-cheapest>' + comparableOffers + '</div></details>' : '');
    return '<details class="storep storep-regional" open><summary>Regional Store prices <small>' + items.length + '</small></summary>'
      + '<label class="sp-search"><span>Find a product</span><input type="search" data-sp-search placeholder="Search passes, storage, coins or items" aria-label="Search Store products" autocomplete="off"></label>'
      + '<p class="sp-results" data-sp-results aria-live="polite"></p>'
      + '<div class="sp-catalogue">' + catalogue + '</div>'
      + '<details class="sp-compare-more sp-review"><summary>Data review</summary>' + review + '</details>'
      + '<p class="sp-foot" data-sp-foot>Prices are dated observations, not live checkout quotes. <span aria-hidden="true">~</span> older · est. estimate · ? unconfirmed</p></details>';
  }
  function go() {
    var host = document.getElementById('evsource'); if (!host || !window.GOLIB) return;
    GOLIB.loadPrices().then(async function (d) {
      if (!d || !d.owner) return; /* Owner-only regional prices stay private. */
      /* Render local observed prices immediately; an external FX request must
         never delay the Store, including when a provider hangs. */
      if (typeof window.fetch === 'function') {
        try {
          var request = window.fetch('/store-current-snapshot.json', {cache:'no-store'})
            .then(function (response) { return response && response.ok ? response.json() : null; })
            .catch(function () { return null; });
          var sourceSnapshot = await Promise.race([
            request,
            new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 1600); })
          ]);
          if (sourceSnapshot && sourceSnapshot.version === 1 &&
              Array.isArray(sourceSnapshot.items) && Array.isArray(sourceSnapshot.gone))
            d.storeSnapshot = sourceSnapshot;
        } catch (_) { /* Never infer active stock from historical prices. */ }
      }
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
          });
        }).catch(function () { /* Keep original regional prices visible. */ });
      }
      var search = el.querySelector('[data-sp-search]');
      if (search) search.addEventListener('input', function () {
        var q = storeSearchKey(search.value.trim()), shown = 0;
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
      /* A failed exact-asset load removes the image: no broken-image box, no placeholder tile, no substitute picture. */
      if (el.addEventListener) el.addEventListener('error', function (event) {
        var bad = event.target;
        if (bad && bad.matches && bad.matches('img.sp-i')) bad.remove();
      }, true);

    }).catch(function () { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
