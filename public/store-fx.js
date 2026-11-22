/* Reference-currency display only. Never changes observed local Store prices or
   determines the "cheapest" offer. The external request contains no product data. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GOStoreFX = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var ENDPOINT = 'https://open.er-api.com/v6/latest/AUD';
  var CACHE_KEY = 'gofn-store-fx-reference-v1';
  var DAY = 86400000;
  function observedDate(value) {
    var t = typeof value === 'number' ? value * 1000 : Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
  }
  function recent(value, now) {
    var t = typeof value === 'number' ? value * 1000 : Date.parse(value);
    var age = (now == null ? Date.now() : now) - t;
    return Number.isFinite(age) && age >= -DAY && age <= 8 * DAY;
  }
  function owner(fx, now) {
    if (!fx || fx.from !== 'IDR' || fx.to !== 'AUD' || !(Number(fx.rate) > 0)
      || !recent(fx.observed, now)) return {};
    return { IDR: { audPerUnit: Number(fx.rate), observed: observedDate(fx.observed),
      source: String(fx.source || 'Recorded FX reference') } };
  }
  function fromApi(body, now) {
    if (!body || body.result !== 'success' || body.base_code !== 'AUD'
      || !Number.isFinite(body.time_last_update_unix)
      || !recent(body.time_last_update_unix, now) || !body.rates) return null;
    var out = {}, date = observedDate(body.time_last_update_unix);
    ['IDR', 'INR'].forEach(function (currency) {
      var unitsPerAud = Number(body.rates[currency]);
      if (Number.isFinite(unitsPerAud) && unitsPerAud > 0 && unitsPerAud < 1e9)
        out[currency] = { audPerUnit: 1 / unitsPerAud, source: 'ExchangeRate-API',
          observed: date };
    });
    return Object.keys(out).length === 2 ? out : null;
  }
  function amount(value, currency, quotes) {
    var quote = quotes && quotes[currency], n = Number(value);
    if (!quote || !Number.isFinite(n) || n <= 0 || !(quote.audPerUnit > 0))
      return null;
    return n * quote.audPerUnit;
  }
  function display(spec, quotes) {
    var minimum = amount(spec.min == null ? spec.amount : spec.min, spec.currency, quotes);
    if (minimum == null) return null;
    var money = function (value) {
      return 'A$' + Number(value).toLocaleString('en-AU',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    var maximum = spec.max == null ? null : amount(spec.max, spec.currency, quotes);
    var quote = quotes[spec.currency];
    return { text: maximum != null ? '≈ ' + money(minimum) + '–' + money(maximum)
        : '≈ ' + money(minimum), observed: quote.observed, source: quote.source };
  }
  /* Only reference exchange rates and their provider timestamp are cached.
     No purchases, regional prices, player details or account information. */
  function stored(now) {
    try {
      if (typeof localStorage === 'undefined') return null;
      var raw = localStorage.getItem(CACHE_KEY);
      return raw ? fromApi(JSON.parse(raw), now) : null;
    } catch (_) { return null; }
  }
  function remember(body, now) {
    if (!fromApi(body, now)) return;
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        result: 'success', base_code: 'AUD',
        time_last_update_unix: body.time_last_update_unix,
        rates: { IDR: Number(body.rates.IDR), INR: Number(body.rates.INR) }
      }));
    } catch (_) { /* Storage disabled, full or private: do not affect display. */ }
  }
  /* Committed reference file (public/fx-rates.json): { base:'AUD', rates:{IDR,INR} units per 1 AUD,
     asOf, source }. Offline fallback only; hidden once older than 45 days so a stale rate never misleads. */
  var COMMITTED_MAX_AGE = 45 * DAY;
  function committed(file, now) {
    if (!file || file.base !== 'AUD' || !file.rates) return {};
    var t = Date.parse(file.asOf), age = (now == null ? Date.now() : now) - t;
    if (!Number.isFinite(age) || age < -DAY || age > COMMITTED_MAX_AGE) return {};
    var out = {};
    ['IDR', 'INR'].forEach(function (currency) {
      var unitsPerAud = Number(file.rates[currency]);
      if (Number.isFinite(unitsPerAud) && unitsPerAud > 0 && unitsPerAud < 1e9)
        out[currency] = { audPerUnit: 1 / unitsPerAud, observed: observedDate(file.asOf),
          source: String(file.source || 'Committed FX reference') };
    });
    return out;
  }
  function fallbackQuotes(ownerFx, now, committedFx) {
    var result = owner(ownerFx, now), saved = stored(now), base = committed(committedFx, now);
    ['IDR', 'INR'].forEach(function (currency) {
      if (!result[currency] && base[currency]) result[currency] = base[currency];
    });
    if (saved) ['IDR', 'INR'].forEach(function (currency) {
      /* Prefer the most recent source, not a fabricated blended conversion. */
      if (!result[currency] || Date.parse(saved[currency].observed) >= Date.parse(result[currency].observed))
        result[currency] = saved[currency];
    });
    return result;
  }
  /* Never let a blocked third-party FX request hold the AUD references
     indefinitely. A timeout retains only independently dated, fresh proof. */
  function retrieve(fetchImpl, ownerFx, now, maxWaitMs, committedFx) {
    /* committedFx may be a promise (the same-origin file is fetched in parallel). */
    var fallbackP = Promise.resolve(committedFx).catch(function () { return null; })
      .then(function (file) { return fallbackQuotes(ownerFx, now, file); });
    if (typeof fetchImpl !== 'function') return fallbackP;
    var wait = Number.isFinite(maxWaitMs) && maxWaitMs >= 0
      ? Math.min(3000, maxWaitMs) : 3000;
    var timer;
    var live = Promise.resolve().then(function () {
      /* Revalidate a dated rate online; force-cache could replay an expired
         HTTP response indefinitely and erase both AUD references on iOS. */
      return fetchImpl(ENDPOINT, { mode: 'cors', credentials: 'omit', cache: 'no-cache' });
    }).then(function (response) {
      if (!response || !response.ok) throw new Error('FX provider unavailable');
      return response.json();
    }).then(function (json) {
      var verified = fromApi(json, now);
      if (verified) remember(json, now);
      return verified || fallbackP;
    }).catch(function () { return fallbackP; });
    return Promise.race([live, new Promise(function (resolve) {
      timer = setTimeout(function () { resolve(fallbackP); }, wait);
    })]).finally(function () { clearTimeout(timer); });
  }
  return { ENDPOINT: ENDPOINT, CACHE_KEY: CACHE_KEY, owner: owner, committed: committed, COMMITTED_MAX_AGE: COMMITTED_MAX_AGE, fromApi: fromApi,
    amount: amount, display: display, retrieve: retrieve };
});