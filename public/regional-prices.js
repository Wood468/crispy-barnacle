/* Regional Store prices: verified observations, labelled estimates, and the cheapest realistic purchase.
   Pure logic. The observations come from the owner-only /api/prices-private route; nothing local is typed in here.
   An estimate is never a checkout price: it always carries basis "estimate", a range and a confidence. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GORegionalPrices = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var DAY = 86400000;
  var CHANNELS = { web: 'Web Store', 'in-app': 'in-app shop' };
  var REGIONS = { AU: 'Australia', IN: 'India', ID: 'Indonesia' };
  var ROUND = { IDR: 1000, INR: 1, AUD: 0.01 };
  /* Product families a price may be compared within. Variants never mix: a pass, its rank upgrade and its Ultra Box are different products. */
  function kindOf(label) {
    var s = String(label || '').toLowerCase().replace(/pok[eé]/g, 'poke');
    var hasUltra = /ultra box/.test(s), hasRanks = /\+\s*\d+\s*ranks?|rank upgrade/.test(s);
    var variant = hasRanks && hasUltra ? '-ranks-ultra' : hasUltra ? '-ultra' : hasRanks ? '-ranks' : '';
    if (/go pass|pass deluxe|deluxe pass|\bdeluxe\b.*(ultra box|ranks?)|monthly deluxe/.test(s)) return (/into the wild|road of legends|wild area|tour|global|go fest|safari|world|event/.test(s) ? 'event-pass' : 'monthly-pass') + variant;
    if (/research ticket|special research|timed research|\bticket\b/.test(s)) return 'research-ticket';
    if (/pokecoins?|\bcoins\b/.test(s)) return 'coins';
    if (/storage|item bag|bag upgrade/.test(s)) return 'storage';
    if (/bundle|\bkit\b|\bbox\b|commander|\bpack\b(?!.*x\d)/.test(s)) return 'bundle';
    return 'item';
  }
  function median(a) {
    a = a.slice().sort(function (x, y) { return x - y; });
    return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2 : null;
  }
  function round(v, cur) { var r = ROUND[cur] || 1; return Math.round(v / r) * r; }
  function ageDays(observed, now) { var t = Date.parse(observed); return Number.isFinite(t) ? Math.floor(((now == null ? Date.now() : now) - t) / DAY) : null; }
  function norm(s) {
    var name = String(s || '').toLowerCase().replace(/pok[eé]/g, 'poke').trim();
    /* Only the literal standard Web Store suffix is a safe alias: a 600-coin
       standard pack is the same quantity in AU and ID. Bonus and one-time
       packs MUST remain distinct SKUs even where the headline amount matches. */
    if (/^[\d,]+\s+pokecoins?\s*\(standard web store pack\)$/.test(name))
      name = name.replace(/\s*\(standard web store pack\)$/, '');
    return name.replace(/[^a-z0-9+]+/g, ' ').trim();
  }
  function usable(o) { return o && o.amount > 0 && o.currency && o.region && o.channel && Number.isFinite(Date.parse(o.observed)); }
  function newest(list) { return list.slice().sort(function (a, b) { return String(b.observed).localeCompare(String(a.observed)); })[0] || null; }
  /* Which purchase channels may be suggested in a region: only those with at least one real observation there. */
  function channels(obs, region) {
    var seen = {};
    (obs || []).forEach(function (o) { if (usable(o) && o.region === region) seen[o.channel] = 1; });
    return Object.keys(seen);
  }
  function confidence(samples, age, status) {
    if (age != null && age > 90) return 'very low';
    var c = (status === 'recorded' || samples < 2) ? 'low' : 'medium';
    return (age != null && age > 45 && c === 'medium') ? 'low' : c;
  }
  /* Exact verified/recorded price for a named product. */
  function exact(obs, region, channel, product) {
    var key = norm(product);
    var hit = newest((obs || []).filter(function (o) { return usable(o) && o.region === region && o.channel === channel && norm(o.product) === key; }));
    if (!hit) return null;
    return { amount: hit.amount, currency: hit.currency, region: region, channel: channel, basis: hit.status === 'verified' ? 'verified' : 'recorded',
      observed: hit.observed, source: hit.source, product: hit.product, kind: hit.kind || kindOf(hit.product), coins: hit.coins || null };
  }
  /* Estimate for a product with no price of its own: comparable observations of the same kind, or an AU price times an observed ratio. */
  function estimate(spec, obs, now) {
    var region = spec.region, channel = spec.channel, kind = spec.kind || kindOf(spec.product);
    /* Only passes and tickets are priced by tier. Coin packs, storage steps, items and bundles differ in quantity, so they are never estimated. */
    if (!/pass|research-ticket/.test(kind)) return null;
    var same = (obs || []).filter(function (o) { return usable(o) && o.region === region && o.channel === channel && (o.kind || kindOf(o.product)) === kind && norm(o.product) !== norm(spec.product); });
    if (!same.length) return null;
    var cur = same[0].currency, amounts, basis, samples = same.length;
    var pairs = same.filter(function (o) { return o.pairAud && o.pairAud.amount > 0; });
    if (spec.aud > 0 && pairs.length) {
      amounts = pairs.map(function (o) { return spec.aud * o.amount / o.pairAud.amount; }); samples = pairs.length;
      basis = 'A$' + spec.aud.toFixed(2) + ' Australian Web price x the observed ' + REGIONS[region] + ' / Australia ratio for ' + kind + ' products';
    } else {
      amounts = same.map(function (o) { return o.amount; });
      basis = samples + ' comparable ' + kind + ' product' + (samples === 1 ? '' : 's') + ' (' + same.slice(0, 3).map(function (o) { return o.product; }).join('; ') + ')';
    }
    var lo = Math.min.apply(null, amounts), hi = Math.max.apply(null, amounts);
    if (lo === hi) { lo *= 0.9; hi *= 1.1; } /* one sample: show an honest +/-10% band, not a point */
    var newestObs = newest(same), age = ageDays(newestObs.observed, now);
    var allRecorded = same.every(function (o) { return o.status !== 'verified'; });
    return { amount: round(median(amounts), cur), min: round(lo, cur), max: round(hi, cur), currency: cur, region: region, channel: channel, basis: 'estimate', label: 'Estimate',
      confidence: confidence(samples, age, allRecorded ? 'recorded' : 'verified'), samples: samples, basisText: basis, observed: newestObs.observed, kind: kind };
  }
  /* The best known price: verified first, otherwise a labelled estimate, otherwise null (never a guess from exchange rates). */
  function reference(spec, obs, now) { return exact(obs, spec.region, spec.channel, spec.product) || estimate(spec, obs, now); }
  /* Cheapest realistic way to buy one product. options: [{channel, price:{amount,currency,basis,min,max}, coins?}] already filtered by reference().
     ctx: {region, obs, coinBalance, packs:[{coins, amount, currency}], upfront:[{label, amount}]}. Only channels with real observations in the region are eligible. */
  function cheapest(spec, obs, ctx, now) {
    ctx = ctx || {};
    var region = spec.region, balance = Math.max(0, Number(ctx.coinBalance) || 0), out = [];
    var upfront = (ctx.upfront || []).reduce(function (s, u) { return s + (u.amount > 0 ? u.amount : 0); }, 0);
    channels(obs, region).forEach(function (channel) {
      var ref = reference({ region: region, channel: channel, product: spec.product, kind: spec.kind, aud: spec.aud }, obs, now);
      if (!ref) return;
      var base = { channel: channel, channelLabel: CHANNELS[channel] || channel, currency: ref.currency, price: ref, basis: ref.basis, isEstimate: ref.basis === 'estimate',
        coinsUsed: 0, coinsBought: 0, leftoverCoins: balance, packs: [], upfront: upfront };
      if (ref.coins && channel === 'in-app') {
        var packs = (ctx.packs || []).filter(function (p) { return p.coins > 0 && p.amount > 0 && p.currency === ref.currency && !p.oneTime; });
        var need = Math.max(0, ref.coins - balance), best = { cash: 0, coins: 0, picks: [] };
        if (need > 0) {
          best = null;
          (function walk(i, picks, cash, coins) {
            if (coins >= need) { if (!best || cash < best.cash || (cash === best.cash && coins < best.coins)) best = { cash: cash, coins: coins, picks: picks.slice() }; return; }
            if (i >= packs.length || picks.length >= 6) return;
            for (var j = i; j < packs.length; j++) { if (packs[j].oneTime && picks.indexOf(packs[j]) !== -1) continue; picks.push(packs[j]); walk(j, picks, cash + packs[j].amount, coins + packs[j].coins); picks.pop(); }
          })(0, [], 0, 0);
          if (!best) return;
        }
        var rate = packs.length ? Math.min.apply(null, packs.map(function (p) { return p.amount / p.coins; })) : 0;
        var leftover = balance + best.coins - ref.coins;
        out.push(Object.assign(base, { cash: best.cash + upfront, coinsUsed: ref.coins, coinsBought: best.coins, leftoverCoins: leftover, packs: best.picks,
          effective: best.cash + upfront - leftover * rate, via: 'coins' }));
        return;
      }
      out.push(Object.assign(base, { cash: ref.amount + upfront, effective: ref.amount + upfront, via: 'direct' }));
    });
    /* Keep all observed options visible, but only rank verified prices in one
       currency. Estimates are not checkout quotes; recorded prices may have
       changed; and nominal amounts in different currencies are incomparable. */
    var verified = out.filter(function (o) { return o.basis === 'verified'; });
    var comparable = verified.length > 0 && verified.every(function (o) { return o.currency === verified[0].currency; });
    var best = comparable ? verified.slice().sort(function (a, b) { return a.effective - b.effective; })[0] : null;
    return { options: out, best: best };
  }
  /* Monthly review without screenshots: flags stale observations, products that exist only as estimates, and regions with no live channel. */
  function review(obs, now, opts) {
    opts = opts || {}; var warn = opts.warnDays || 35, stale = opts.staleDays || 62, flags = [];
    var latest = {};
    (obs || []).forEach(function (o) {
      if (!usable(o)) { flags.push({ level: 'error', id: o && o.id, message: 'Observation is missing amount, currency, region, channel or a valid date.' }); return; }
      var k = o.region + '|' + o.channel + '|' + (o.kind || kindOf(o.product));
      if (!latest[k] || String(o.observed) > String(latest[k].observed)) latest[k] = o;
    });
    Object.keys(latest).forEach(function (k) {
      var o = latest[k], age = ageDays(o.observed, now);
      if (age >= stale) flags.push({ level: 'stale', id: o.id, message: o.product + ' (' + k + ') last observed ' + o.observed + ', ' + age + ' days ago. Re-check the ' + (CHANNELS[o.channel] || o.channel) + '.' });
      else if (age >= warn) flags.push({ level: 'due', id: o.id, message: o.product + ' (' + k + ') observed ' + age + ' days ago; due at the next monthly review.' });
    });
    (obs || []).forEach(function (o) {
      if (usable(o) && o.status !== 'verified') flags.push({ level: 'unverified', id: o.id, message: o.product + ' (' + o.region + ' ' + o.channel + ') is "' + o.status + '", not verified against a current Store view.' });
    });
    return { flags: flags, ok: !flags.some(function (f) { return f.level === 'error' || f.level === 'stale'; }), checked: Object.keys(latest).length };
  }
  /* The Australian source records include some verified official Web Store
     offers with historical IDs that predate the store-* importer. Their URLs
     identify an official Web Store observation; a GO Hub event ticket is
     NOT a Web Store product, even if its region and currency match. */
  function sourcedAuWebOffer(p) {
    if (!p || typeof p.product !== 'string' || !p.product.trim() ||
        p.currency !== 'AUD' || p.region !== 'AU' || p.verified !== true ||
        !(Number.isFinite(Number(p.amount)) && Number(p.amount) > 0)) return false;
    if (/^store-/.test(p.product)) return true; // Existing verified Store catalogue.
    try {
      var url = new URL(p.url);
      return url.protocol === 'https:' && url.hostname === 'store.pokemongo.com' &&
        !url.username && !url.password && !url.port && url.pathname === '/' &&
        !url.search && !url.hash;
    } catch (_) { return false; }
  }
  /* Every verified AU Web Store SKU plus all regional-only observations;
     do not misattribute off-site event tickets or guess missing product names. */
  /* A shared product title does not prove two boxes contain the same items.
     For bundle offers require an independently recorded common source SKU;
     never join a one-time promotion to a standard listing. */
  function sameStoreIdentity(au, regional) {
    if (!!au.oneTime !== !!regional.oneTime) return false;
    var auSku = typeof au.sourceSku === 'string' ? au.sourceSku.trim().toLowerCase() : '';
    var regionalSku = typeof regional.sourceSku === 'string' ? regional.sourceSku.trim().toLowerCase() : '';
    /* An explicitly identified source SKU must not pair with an unattributed
       offer just because their human-readable labels happen to match. */
    if (auSku || regionalSku) return !!(auSku && regionalSku && auSku === regionalSku);
    if (kindOf(au.label) === 'bundle' || kindOf(regional.product) === 'bundle'
      || regional.kind === 'bundle' || /\b(?:box|boxes|bundle|bundles)\b/i.test(String(au.group || ''))
      || /\b(?:box|bundle|kit)\b/i.test(String(au.label || '') + ' ' + String(regional.product || '')))
      return false;
    return true;
  }
  function catalogue(prices, obs, now, officialOffers) {
    var latest = {}, all = {}, auByLabel = {};
    obs = Array.isArray(obs) ? obs : [];
    (prices || []).forEach(function (p) {
      if (!sourcedAuWebOffer(p)) return;
      if (!latest[p.product] || String(p.observed) > String(latest[p.product].observed)) latest[p.product] = p;
    });
    // The SKU, not the display label, is an Australian Store offer's identity.
    // Two exact packs may legitimately share the same human-readable name.
    Object.keys(latest).forEach(function (key) {
      var p = latest[key], label = p.label || key, labelKey = norm(label);
      var group = p.group || (/^go-pass-|^wild-area-2026-global-ultra-box$/.test(key)
        ? 'Passes & tickets' : 'Other');
      var id = 'au:' + key;
      all[id] = { product: key, label: label, group: group,
        sourceIdOnly: !p.label, aud: p.amount, observed: p.observed,
        oneTime: !!p.oneTime, sourceSku: p.sourceSku,
        contents: Array.isArray(p.contents) ? p.contents : [],
        contentsSource: p.contentsSource || null,
        disableRegionalEstimates: p.disableRegionalEstimates === true };
      (auByLabel[labelKey] || (auByLabel[labelKey] = [])).push(id);
    });
    obs.forEach(function (o, index) {
      if (!usable(o) || !o.product) return;
      var key = norm(o.product), owners = auByLabel[key] || [];
      if (owners.length === 1 && sameStoreIdentity(all[owners[0]], o)) return;
      /* Ambiguous boxes, promotions and source-SKU observations are retained
         as distinct regional offers, not merged solely by matching text. */
      var distinct = kindOf(o.product) === 'bundle' || o.kind === 'bundle' || !!o.oneTime || !!o.sourceSku;
      var regionalId = distinct
        ? 'regional-observation:' + o.region + '|' + o.channel + '|' + String(o.id || index)
        : 'regional:' + key;
      if (!all[regionalId] || String(o.observed) > String(all[regionalId].observed)) all[regionalId] = {
        product: o.id || o.product, label: o.product,
        group: o.kind || kindOf(o.product), aud: null, observed: o.observed,
        regionalUnmatched: owners.length > 0, strictRegionalIndex: distinct ? index : null
      };
    });
    /* Publisher-announced products without a verified AU/ID/IN quote stay
       separate from the price-observation union. A matching title is not a
       source-backed SKU join, even when an ID/IN price is later recorded. */
    (Array.isArray(officialOffers) ? officialOffers : []).forEach(function (offer) {
      if (!offer || offer.noPriceObservation !== true
        || typeof offer.id !== 'string' || !/^official:[a-z0-9:-]+$/.test(offer.id)
        || typeof offer.label !== 'string' || !offer.label.trim()
        || typeof offer.sourceUrl !== 'string'
        || !/^https:\/\/pokemongo\.com\/news\/[a-z0-9-]+$/.test(offer.sourceUrl)
        || !Array.isArray(offer.contents)) return;
      var key = 'source-only:' + offer.id;
      if (all[key]) return;
      all[key] = {product:offer.id,label:offer.label,group:offer.group || 'Passes & tickets',
        aud:null,observed:null,unpricedOfficial:true,contents:offer.contents,
        contentsSource:offer.sourceUrl};
    });
    return Object.keys(all).map(function (key) {
      var p = all[key], kind = kindOf(p.label);
      var ambiguous = p.aud != null && (auByLabel[norm(p.label)] || []).length > 1;
      var rowObs = p.strictRegionalIndex != null ? [obs[p.strictRegionalIndex]]
        : p.aud != null ? obs.filter(function (o) {
          /* Retain other product observations for honest pass estimates while
             prohibiting unsafe same-name exact matches. */
          return !!o && (norm(o.product) !== norm(p.label) || sameStoreIdentity(p, o));
        }) : obs;
      function regionPrice(spec) {
        // Historical, source-named passes may show exact checkout observations,
        // but must not borrow an unrelated monthly/event-pass price estimate.
        return p.disableRegionalEstimates ? exact(rowObs, spec.region, spec.channel, spec.product)
          : reference(spec, rowObs, now);
      }
      return { product: p.product, label: p.label, group: p.group, kind: kind,
        sourceIdOnly: !!p.sourceIdOnly, ambiguousSku: ambiguous,
        regionalUnmatched: !!p.regionalUnmatched, unpricedOfficial: !!p.unpricedOfficial,
        aud: p.aud, observed: p.observed,
        contents: p.contents || [], contentsSource: p.contentsSource || null,
        india: ambiguous ? null : p.unpricedOfficial
          ? estimate({ region: 'IN', channel: 'in-app', product: p.label, kind: kind, aud: p.aud }, obs, now)
          : regionPrice({ region: 'IN', channel: 'in-app', product: p.label, kind: kind, aud: p.aud }),
        indonesia: ambiguous ? null : p.unpricedOfficial
          ? estimate({ region: 'ID', channel: 'web', product: p.label, kind: kind, aud: p.aud }, obs, now)
          : regionPrice({ region: 'ID', channel: 'web', product: p.label, kind: kind, aud: p.aud }) };
    });
  }
  /* Source-only listing state. Store price observations are historical receipts:
     they are NEVER evidence that a product remains on sale. Match the exact
     official display name, not a similar event, tier, quantity or bonus. */
  function sourceOffer(label, snapshot, now) {
    var empty = {status:'unconfirmed', image:null, lastSeen:null, goneAt:null, endAt:null, note:'Not confirmed in recent Store snapshot'};
    if (!snapshot || !Array.isArray(snapshot.items) || !Array.isArray(snapshot.gone)) return empty;
    var key = norm(label), checkTime = now == null ? Date.now() : now;
    var sourceFresh = typeof snapshot.updated === 'string' &&
      Number.isFinite(Date.parse(snapshot.updated)) &&
      checkTime >= Date.parse(snapshot.updated) && checkTime - Date.parse(snapshot.updated) <= 7 * DAY;
    function matching(row) { return row && norm(row.name) === key; }
    var current = snapshot.items.filter(matching);
    var past = snapshot.gone.filter(matching);
    var row = current.length === 1 ? current[0] : past.length === 1 ? past[0] : null;
    var artwork = row && sourceArt(row.image) ? row.image : null;
    /* Safe icon aliasing is NOT a SKU join or proof of checkout price. */
    if (!artwork) {
      var artKey = key.replace(/(?:\s+(?:x|×)\s*\d+|\s+\+\s*1)$/, '');
      var variants = snapshot.items.concat(snapshot.gone).filter(function (item) {
        return item && norm(item.name) === artKey && sourceArt(item.image);
      });
      if (variants.length === 1) artwork = variants[0].image;
    }
    if (current.length !== 1) return past.length === 1
      ? {status:'archived',image:artwork,lastSeen:row.lastSeen||null,goneAt:row.goneAt||null,endAt:row.endsAt||null,note:'Removed from the observed Store listing'}
      : {status:'unconfirmed',image:artwork,lastSeen:null,goneAt:null,endAt:null,note:'Not confirmed in recent Store snapshot'};
    var end = Date.parse(row.endsAt || '');
    if (Number.isFinite(end) && end <= checkTime)
      return {status:'archived',image:artwork,lastSeen:row.lastSeen||null,goneAt:null,endAt:row.endsAt,note:'Published purchase window ended'};
    if (!sourceFresh) return {status:'unconfirmed',image:artwork,lastSeen:row.lastSeen||null,goneAt:null,endAt:row.endsAt||null,note:'Store snapshot needs refreshing'};
    var last = Date.parse(row.lastSeen || '');
    if (!Number.isFinite(last) || last > checkTime || checkTime-last > 7*DAY)
      return {status:'unconfirmed',image:artwork,lastSeen:row.lastSeen||null,goneAt:null,endAt:row.endsAt||null,note:'Store observation is stale'};
    return {status:'listed',image:artwork,lastSeen:row.lastSeen,goneAt:null,endAt:row.endsAt||null,note:'Seen in the latest Store snapshot; checkout availability may differ'};
  }
  function sourceArt(url) {
    return typeof url === 'string' &&
      /^https:\/\/assets\.pgo\.webstore\.nianticlabs\.com\/pgo\/image_variants\/v1\/sku_assets\/[a-z0-9_.%()\-]+\/w(?:64|128|256|512)\.webp$/i.test(url);
  }
  /* Owner-only audit of source coverage, not a live checkout or a price
     prediction. Keep absent, modelled and recorded prices distinguishable. */
  function coverage(rows, now, reviewDays) {
    var products = Array.isArray(rows) ? rows : [];
    var threshold = Number.isSafeInteger(reviewDays) && reviewDays > 0 ? reviewDays : 30;
    var result = { total: products.length, auVerified: 0, idVerified: 0, inVerified: 0,
      unlabelled: [], unpaired: [], sourceOnly: [], missingAu: [], missingId: [], missingIn: [],
      unverifiedId: [], unverifiedIn: [], reviewDue: [], reviewDays: threshold };
    function due(observed) {
      var age = ageDays(observed, now);
      return age !== null && age >= threshold;
    }
    products.forEach(function (p) {
      if (!p) return;
      var label = String(p.label || p.product || 'Unnamed offer');
      if (p.sourceIdOnly) result.unlabelled.push(label);
      if (p.unpricedOfficial) result.sourceOnly.push(label);
      if (p.ambiguousSku || p.regionalUnmatched) result.unpaired.push(label);
      if (p.aud > 0) {
        result.auVerified++;
        if (due(p.observed)) result.reviewDue.push('Australia · ' + label);
      } else result.missingAu.push(label);
      [['indonesia', 'idVerified', 'missingId', 'unverifiedId', 'Indonesia'],
       ['india', 'inVerified', 'missingIn', 'unverifiedIn', 'India']].forEach(function (rule) {
        var price = p[rule[0]];
        if (price && price.basis === 'verified') result[rule[1]]++;
        else if (!price) result[rule[2]].push(label);
        else result[rule[3]].push(label);
        if (price && price.basis !== 'estimate' && due(price.observed))
          result.reviewDue.push(rule[4] + ' · ' + label);
      });
    });
    return result;
  }
  function fmt(v, cur) { var sym = cur === 'IDR' ? 'Rp ' : cur === 'INR' ? '₹' : cur === 'AUD' ? 'A$' : ''; return sym + Number(v).toLocaleString('en-AU', cur === 'AUD' ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 }); }
  return { kindOf: kindOf, exact: exact, estimate: estimate, reference: reference, cheapest: cheapest, review: review, catalogue: catalogue, coverage: coverage, channels: channels, confidence: confidence, sourceOffer: sourceOffer, sourceArt: sourceArt, fmt: fmt, ageDays: ageDays, REGIONS: REGIONS, CHANNELS: CHANNELS };
});
