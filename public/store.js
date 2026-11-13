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
    [/^incense(?:\s*[×x]\s*[1-9]\d*)?$/i, '/ico/incense.webp'],
    [/^elite fast tm(?:s)?(?:\s*[×x]\s*\d+)?$/i, '/ico/g/elite-fast-tm.webp'],
    [/^elite charged tm(?:s)?(?:\s*[×x]\s*\d+)?$/i, '/ico/g/elite-charged-tm.webp'],
    [/^raid pass(?:es)?(?:\s*[×x]\s*\d+)?$/i, '/ico/g/raidpass.webp']
  ];
  /* Neutral type symbols are not in-game item art: never substitute a
     different item image. Every future SKU has a visible honest fallback. */
  function kindToken(label) {
    var name = String(label || '');
    if (/^max potions?(?:\s*[×x]\s*\d+)?$/i.test(name)) return 'POT';
    if (/^max revives?(?:\s*[×x]\s*\d+)?$/i.test(name)) return 'REV';
    if (/^golden razz berr(?:y|ies)(?:\s*[×x]\s*\d+)?$/i.test(name)) return 'RAZZ';
    if (/^silver pinap berr(?:y|ies)(?:\s*[×x]\s*\d+)?$/i.test(name)) return 'PIN';
    if (/^incense(?:\s*[×x]\s*[1-9]\d*)?$/i.test(name)) return 'INS';
    if (/pok[eé]coins?/i.test(name)) return '◎';
    if (/storage|item bag|bag upgrade|capacity/i.test(name)) return '↑';
    if (/^go[- ]pass|monthly.*pass|(?:event|admission).*ticket/i.test(name)) return 'PASS';
    if (/\s\+\s/.test(name) || /\b(?:boxes?|bundles?)\b/i.test(name)) return '▣';
    if (/^(?:remote )?raid pass(?:es)?(?:\s*[×x]\s*\d+)?$|^premium battle pass(?:es)?(?:\s*[×x]\s*\d+)?$/i.test(name)) return 'PASS';
    if (/^elite (?:fast|charged) tm(?:s)?(?:\s*[×x]\s*\d+)?$/i.test(name)) return 'TM';
    if (/lucky eggs?/i.test(name)) return 'LE';
    if (/star pieces?/i.test(name)) return 'SP';
    if (/super incubator/i.test(name)) return 'SINC';
    if (/incubator/i.test(name)) return 'INC';
    if (/max particle/i.test(name)) return 'MP';
    if (/max mushrooms?/i.test(name)) return 'MM';
    if (/link charge/i.test(name)) return 'LC';
    if (/poffin/i.test(name)) return 'PF';
    if (/rare candy xl/i.test(name)) return 'XL';
    if (/rare candy/i.test(name)) return 'RC';
    if (/pok[eé] balls?/i.test(name)) return 'BALL';
    if (/\bpack\b/i.test(name)) return '▣';
    return '·';
  }
  function icon(label, sourceImage) {
    var token = kindToken(label);
    for (var i = 0; i < ICO.length; i++) if (ICO[i][0].test(label)) {
      return '<img class="sp-i" src="' + esc(ICO[i][1]) + '" alt="" width="28" height="28" loading="lazy" decoding="async" data-sp-fallback="' + esc(token || '·') + '">';
    }
    return '<span class="sp-i-token" aria-hidden="true" data-sp-art="category-token">' + esc(token) + '</span>';
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
    if (!p) return '<span class="sp-regional-value sp-none" title="No sourced price observed for this region and channel">—<span class="sr-only">Not observed</span></span>';
    if (p.basis === 'estimate') {
      return '<span class="sp-regional-value sp-est">' + audPlaceholder(p, quotes)
        + '<b class="sp-local-price">Estimate ' + esc(R.fmt(p.min, p.currency) + '–' + R.fmt(p.max, p.currency)) + '</b>'
        + '<small>' + esc(p.confidence) + ' confidence · not a checkout price</small>'
        + '<small class="sp-basis">' + esc('Based on ' + p.basisText + ' · ' + chan(p)) + '</small></span>';
    }
    var state = p.basis === 'verified' ? 'Verified' : 'Recorded · not re-checked';
    /* VoiceOver must read the AUD reference before the original local price.
       A local-only parent aria-label would mask both the AUD and FX provenance. */
    return '<span class="sp-regional-value sp-ver">'
      + audPlaceholder(p, quotes)
      + '<b class="sp-local-price">' + esc(R.fmt(p.amount, p.currency)) + '</b>'
      + '<small>' + esc(state + ' · ' + when(p.observed)) + '</small></span>';
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
  /* Only source-attributed contents, not a guessed bundle breakdown or
     evidence that an expired pass is available for checkout today. */
  function offerContents(p) {
    var items = Array.isArray(p.contents) ? p.contents.filter(function (entry) {
      return entry && typeof entry.item === 'string' && entry.item.trim()
        && Number.isSafeInteger(entry.quantity) && entry.quantity > 0;
    }) : [];
    if (!items.length) return '';
    var source = String(p.contentsSource || '');
    var safe = /^https:\/\/pokemongo\.com\/news\/[a-z0-9-]+$/i.test(source)
      || /^https:\/\/store\.pokemongo\.com\/\?country_code=US&game_client=iOS$/.test(source);
    return '<details class="sp-offer-contents">'
      + '<summary>Included in the published offer <small>Official description</small></summary>'
      + '<ul>' + items.map(function (entry) {
        return '<li>' + esc(entry.item) + ' ×' + entry.quantity + '</li>';
      }).join('') + '</ul>'
      + (safe ? '<p class="note"><a href="' + esc(source)
        + '" target="_blank" rel="noopener noreferrer">Official offer description</a></p>' : '')
      + '<p class="note">Published contents are not proof this historical offer is still for sale.</p>'
      + '</details>';
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
    if (snapshot) items.forEach(function (p) { p.sourceOffer = R.sourceOffer(p.label, snapshot); });
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
      if (snapshot && p.sourceOffer.status !== 'listed') earlier.push(p);
      else bySection[priority(p)].push(p);
    });
    var listedCount = items.length - earlier.length;
    function productCard(p) {
      var au = p.aud > 0
        ? '<span class="sp-regional-value sp-ver"><b>' + esc(R.fmt(p.aud, 'AUD')) + '</b><small>Verified · ' + esc(when(p.observed)) + '</small></span>'
        : '<span class="sp-regional-value sp-none" title="No verified Australian Web Store price observed">—<span class="sr-only">Not observed</span></span>';
      var search = storeSearchKey(p.label + ' ' + p.product + ' ' + p.group + ' ' + priority(p));
      var evidence = p.sourceOffer;
      var sourceNote = evidence
        ? '<small class="sp-source-id-note">' + esc(evidence.status === 'listed'
          ? 'Seen in official Store snapshot · ' + when(String(evidence.lastSeen).slice(0,10)) + ' · regional prices are dated observations'
          : evidence.status === 'archived'
            ? 'Previous offer · ' + evidence.note + (evidence.goneAt ? ' · ' + when(evidence.goneAt.slice(0,10)) : '')
            : evidence.note + ' · regional prices are historical/modelled, not live checkout quotes')
          + '</small>' : '';
      var identityNote = p.unpricedOfficial
        ? '<small class="sp-source-id-note">Official published product · no matched AU / ID / IN checkout observation · regional availability not verified</small>'
        : p.ambiguousSku
        ? '<small class="sp-source-id-note">Distinct official SKU: ' + esc(p.product) + ' · other-region price cannot be matched safely</small>'
        : p.regionalUnmatched
          ? '<small class="sp-source-id-note">Regional observation · no exact AU SKU pairing established</small>'
          : p.sourceIdOnly
            ? '<small class="sp-source-id-note">Official AU observation · exact SKU; item name not recorded</small>' : '';
      return '<article class="sp-product" data-sp-product data-sp-name="' + esc(search) + '"'
        + (evidence ? ' data-sp-listing="' + esc(evidence.status) + '"' : '') + '>'
        + '<header class="sp-product-head"><span class="sp-product-name">' + icon(p.label, evidence && evidence.image) + '<b>' + esc(p.label) + '</b></span>'
        + sourceNote + identityNote + '</header>'
        + '<div class="sp-market-grid">'
        + '<div class="sp-market sp-market-au"><span class="sp-market-label"><span aria-hidden="true">🇦🇺</span> Australia <small>Web</small></span>' + au + '</div>'
        + '<div class="sp-market"><span class="sp-market-label"><span aria-hidden="true">🇮🇩</span> Indonesia <small>Web</small></span>' + priceCell(p.indonesia, data.audQuotes) + '</div>'
        + '<div class="sp-market"><span class="sp-market-label"><span aria-hidden="true">🇮🇳</span> India <small>in-app</small></span>' + priceCell(p.india, data.audQuotes) + '</div>'
        + '</div>' + offerContents(p) + '</article>';
    }
    var catalogue = sections.filter(function (s) { return bySection[s.id].length; }).map(function (s) {
      return '<details class="sp-group" data-sp-group="' + s.id + '" data-sp-default-open="' + (s.open ? 'yes' : 'no') + '"' + (s.open ? ' open' : '') + '>'
        + '<summary>' + esc(s.label) + ' <small>' + bySection[s.id].length + ' products</small></summary>'
        + '<div class="sp-group-items">' + bySection[s.id].map(productCard).join('') + '</div></details>';
    }).join('');
    if (snapshot && earlier.length) {
      catalogue += '<details class="sp-group sp-history" data-sp-group="earlier" data-sp-default-open="no">'
        + '<summary>Previous / unconfirmed offers <small>' + earlier.length + ' entries · not confirmed on sale</small></summary>'
        + '<p class="sp-intro">These are retained for comparison, not offered as live checkout products. Missing from one regional snapshot is not proof of global retirement.</p>'
        + '<div class="sp-group-items">' + earlier.map(productCard).join('') + '</div></details>';
    }
    return '<details class="storep storep-regional" open><summary>Regional Store prices <small>' + (snapshot ? listedCount + ' recently listed · ' + earlier.length + ' historical/unconfirmed' : items.length + ' historical price records') + '</small></summary>'
      + '<p class="sp-intro">Only offers seen in the recent official Web Store snapshot appear in the main list. Earlier observations remain searchable under Previous / unconfirmed offers. Store availability varies by region, purchase channel and account. Dated prices are not live checkout quotes. Approximate A$ values use <a href="https://www.exchangerate-api.com/" target="_blank" rel="noopener noreferrer">ExchangeRate-API</a> reference rates. “Not observed” means no sourced price for that region.</p>'
      + reviewPanel
      + '<label class="sp-search"><span>Find a product</span><input type="search" data-sp-search placeholder="Search passes, storage, coins or items" aria-label="Search Store products" autocomplete="off"></label>'
      + '<p class="sp-results" data-sp-results aria-live="polite">' + (snapshot ? listedCount + ' recently listed · ' + earlier.length + ' previous/unconfirmed' : items.length + ' priced products · snapshot unavailable') + '</p>'
      + '<div class="sp-catalogue">' + catalogue + '</div>'
      + (comparableOffers ? '<details class="sp-compare-more"><summary>Verified regional purchase options <small>Advanced comparison</small></summary>'
      + '<p class="note">Source-verified regional items, passes, storage and coin packs are listed by exact product and channel. A lowest observed cash price is named only when two or more channels share an explicit verified product SKU and currency. Estimated, recorded-only and ambiguous boxes cannot win; no result is a live checkout quote.</p>'
      + '<div data-sp-cheapest>' + comparableOffers + '</div></details>' : '') + '</details>';
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
      if (!d.storeSnapshot) d.storeSnapshot = {version:1,updated:null,items:[],gone:[]};
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

    }).catch(function () { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
