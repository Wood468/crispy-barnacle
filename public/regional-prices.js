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
    var variant = /ultra box/.test(s) ? '-ultra' : /\+\s*\d+\s*ranks?|rank upgrade/.test(s) ? '-ranks' : '';
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
  function norm(s) { return String(s || '').toLowerCase().replace(/pok[eé]/g, 'poke').replace(/[^a-z0-9+]+/g, ' ').trim(); }
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
            for (var j = i; j < packs.length; j++) { picks.push(packs[j]); walk(j, picks, cash + packs[j].amount, coins + packs[j].coins); picks.pop(); }
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
    out = out.filter(function (o, _, all) { return all.every(function (x) { return x.currency === o.currency; }); });
    out.sort(function (a, b) { return a.effective - b.effective; });
    return { options: out, best: out[0] || null };
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
  /* Rows for the Store page: every AU catalogue item with the best Indonesian / Indian price known, verified or estimated. */
  function catalogue(prices, obs, now) {
    var latest = {};
    (prices || []).forEach(function (p) {
      if (!p || p.currency !== 'AUD' || p.region !== 'AU' || p.verified !== true || !(p.amount > 0) || !/^store-/.test(p.product)) return;
      if (!latest[p.product] || String(p.observed) > String(latest[p.product].observed)) latest[p.product] = p;
    });
    return Object.keys(latest).map(function (key) {
      var p = latest[key], kind = kindOf(p.label || key);
      return { product: key, label: p.label || key, group: p.group || 'Other', kind: kind, aud: p.amount, observed: p.observed,
        india: reference({ region: 'IN', channel: 'in-app', product: p.label || key, kind: kind, aud: p.amount }, obs, now),
        indonesia: reference({ region: 'ID', channel: 'web', product: p.label || key, kind: kind, aud: p.amount }, obs, now) };
    });
  }
  function fmt(v, cur) { var sym = cur === 'IDR' ? 'Rp ' : cur === 'INR' ? '₹' : cur === 'AUD' ? 'A$' : ''; return sym + Number(v).toLocaleString('en-AU', cur === 'AUD' ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 }); }
  return { kindOf: kindOf, exact: exact, estimate: estimate, reference: reference, cheapest: cheapest, review: review, catalogue: catalogue, channels: channels, confidence: confidence, fmt: fmt, ageDays: ageDays, REGIONS: REGIONS, CHANNELS: CHANNELS };
});
