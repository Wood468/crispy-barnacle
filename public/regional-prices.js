/* Regional Store estimates: observed anchors only; never fabricate a local price.
   AU Web is the baseline, India is in-app, Indonesia is Web. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GORegionalPrices = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var anchors = [
    { region: 'IN', channel: 'in-app', category: 'tickets', aud: 22.99, local: 439, observed: '2026-11-09', product: 'GO Pass Deluxe: Into the Wild' },
    { region: 'ID', channel: 'web', category: 'tickets', aud: 22.99, local: 76000, observed: '2026-11-09', product: 'GO Pass Deluxe: Into the Wild', source: 'owner Indonesian Web Store screenshot' }
  ];
  // Owner-supplied Indonesian Web Store screenshots, 9 November 2026.
  // Standalone passes, rank upgrades, and Ultra Boxes are different SKUs.
  var idCatalogue = [
    { product:'GO Pass Deluxe: Into the Wild', tier:'event-pass', amount:76000 },
    { product:'GO Pass Deluxe: Into the Wild + 10 Ranks', tier:'event-pass-ranks', amount:101000 },
    { product:'GO Pass Deluxe: Into the Wild + 10 Ranks Ultra Box', tier:'event-pass-ultra', amount:126000 },
    { product:'GO Pass Deluxe: November', tier:'monthly-pass', amount:41000 },
    { product:'GO Pass Deluxe: Halloween', tier:'monthly-pass', amount:41000 },
    { product:'GO Pass Deluxe: November + 10 Ranks', tier:'monthly-pass-ranks', amount:50000 },
    { product:'GO Pass Deluxe: Halloween + 10 Ranks', tier:'monthly-pass-ranks', amount:50000 },
    { product:'GO Pass Deluxe: November Ultra Box', tier:'monthly-pass-ultra', amount:76000 },
    { product:'GO Pass Deluxe: Halloween Ultra Box', tier:'monthly-pass-ultra', amount:76000 },
    { product:'Pokemon Storage', tier:'storage', amount:10000 },
    { product:'Item Bag', tier:'storage', amount:10000 },
    { product:'2900 Pokecoins + 400 bonus', tier:'coins', amount:101000 },
    { product:'6000 Pokecoins + 800 bonus', tier:'coins', amount:200000 }
  ].map(function (x) { return Object.assign({region:'ID',currency:'IDR',channel:'web',observed:'2026-11-09',source:'owner Web Store screenshot',verified:true},x); });
  function tier(p) {
    var s=String((typeof p==='string' ? p : (p.label || p.product || ''))).toLowerCase();
    if (/pass deluxe/.test(s)) {
      var event=/into the wild|road of legends|wild area|tour|global/.test(s);
      return (event ? 'event-pass' : 'monthly-pass') + (/ultra box/.test(s) ? '-ultra' : /10 ranks/.test(s) ? '-ranks' : '');
    }
    if (/storage|item bag/.test(s)) return 'storage';
    if (/pok.coins/.test(s)) return 'coins';
    return null;
  }
  function idReference(product) {
    var t=tier(product), s=String(product).toLowerCase();
    var exact=idCatalogue.find(function (x) { return x.product.toLowerCase()===s; });
    if (exact) return {amount:exact.amount,currency:'IDR',channel:'web',basis:'verified',confidence:'high',samples:1,observed:exact.observed,source:exact.source};
    var matches=idCatalogue.filter(function (x) { return x.tier===t; });
    if (!t || !matches.length) return null;
    var values=matches.map(function (x) { return x.amount; });
    return {amount:median(values),min:Math.min.apply(null,values),max:Math.max.apply(null,values),currency:'IDR',channel:'web',basis:'historical-tier-estimate',confidence:matches.length>=2?'medium':'low',samples:matches.length,observed:'2026-11-09'};
  }
  function category(p) {
    var s = ((p.group || '') + ' ' + (p.label || '') + ' ' + (p.product || '')).toLowerCase();
    if (/pok.coins/.test(s)) return 'coins';
    if (/ticket|pass deluxe|research/.test(s)) return 'tickets';
    if (/box|bundle|pack/.test(s)) return 'bundles';
    return 'items';
  }
  function median(a) {
    a = a.slice().sort(function (x, y) { return x - y; });
    return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2 : null;
  }
  function estimate(aud, region, group, observations) {
    if (!(aud > 0) || (region !== 'IN' && region !== 'ID')) return null;
    var matching = (observations || anchors).filter(function (x) {
      return x.region === region && x.category === group && x.aud > 0 && x.local > 0
        && x.channel === (region === 'IN' ? 'in-app' : 'web');
    });
    // One reference ticket is enough to show a low-confidence estimate;
    // other categories require their own observations. Never use FX alone as a local price.
    if (!matching.length) return null;
    var ratio = median(matching.map(function (x) { return x.local / x.aud; }));
    var amount = aud * ratio;
    var rounding = region === 'ID' ? 1000 : 1;
    return { amount: Math.round(amount / rounding) * rounding, currency: region === 'IN' ? 'INR' : 'IDR',
      channel: region === 'IN' ? 'in-app' : 'web', basis: 'estimated', confidence: matching.length >= 3 ? 'medium' : 'low',
      samples: matching.length, category: group };
  }
  function observations(prices) {
    var byProduct = {};
    (prices || []).forEach(function (p) {
      if (!p || !(p.amount > 0)) return;
      (byProduct[p.product] || (byProduct[p.product] = [])).push(p);
    });
    var out = anchors.slice();
    Object.keys(byProduct).forEach(function (key) {
      var list = byProduct[key];
      var au = list.filter(function (p) { return p.currency === 'AUD' && p.region === 'AU' && p.verified === true; }).sort(function (a,b) { return String(b.observed).localeCompare(String(a.observed)); })[0];
      if (!au) return;
      ['IN','ID'].forEach(function (region) {
        var currency = region === 'IN' ? 'INR' : 'IDR';
        var local = list.filter(function (p) { return p.currency === currency && p.region === region && p.verified === true && p.channel === (region === 'IN' ? 'in-app' : 'web'); }).sort(function (a,b) { return String(b.observed).localeCompare(String(a.observed)); })[0];
        if (!local || !au.observed || !local.observed || !Number.isFinite(Date.parse(au.observed)) || !Number.isFinite(Date.parse(local.observed)) || Math.abs(Date.parse(au.observed) - Date.parse(local.observed)) > 14 * 86400000) return;
        if (!out.some(function (x) { return x.product === key && x.region === region; })) out.push({region:region, channel:local.channel, category:category(au), aud:au.amount, local:local.amount, observed:local.observed, product:key});
      });
    });
    return out;
  }
  function catalogue(prices) {
    var latest = {};
    (prices || []).forEach(function (p) {
      if (!p || p.currency !== 'AUD' || p.region !== 'AU' || p.verified !== true || !(p.amount > 0) || !/^store-/.test(p.product)) return;
      if (!latest[p.product] || String(p.observed) > String(latest[p.product].observed)) latest[p.product] = p;
    });
    var obs = observations(prices);
    return Object.keys(latest).map(function (key) {
      var p = latest[key], group = category(p);
      return { product:key, label:p.label || key, group:p.group || 'Other', aud:p.amount, observed:p.observed,
        india:estimate(p.amount, 'IN', group, obs), indonesia:idReference(p.label || p.product) || (group === 'tickets' ? null : estimate(p.amount, 'ID', group, obs)) };
    });
  }
  return { category:category, estimate:estimate, observations:observations, catalogue:catalogue, anchors:anchors, idCatalogue:idCatalogue, tier:tier, idReference:idReference };
});
