/* Reference-currency display only. Never changes observed local Store prices or
   determines the "cheapest" offer. The external request contains no product data. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GOStoreFX = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var ENDPOINT = 'https://open.er-api.com/v6/latest/AUD';
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
  function retrieve(fetchImpl, ownerFx, now) {
    var fallback = owner(ownerFx, now);
    if (typeof fetchImpl !== 'function') return Promise.resolve(fallback);
    return Promise.resolve().then(function () {
      return fetchImpl(ENDPOINT, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    }).then(function (response) {
      if (!response || !response.ok) throw new Error('FX provider unavailable');
      return response.json();
    }).then(function (json) {
      return fromApi(json, now) || fallback;
    }).catch(function () { return fallback; });
  }
  return { ENDPOINT: ENDPOINT, owner: owner, fromApi: fromApi, amount: amount,
    display: display, retrieve: retrieve };
});