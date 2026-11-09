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
  function regional(data) {
    if (!window.GORegionalPrices) return '';
    var items = window.GORegionalPrices.catalogue(data.prices || []);
    if (!items.length) return '';
    var money = function (p, sym) { return p ? (p.basis === 'verified' ? '' : '≈ ') + sym + Number(p.amount).toLocaleString('en-AU') : 'Not calibrated'; };
    return '<details class="storep storep-regional"><summary>Regional Store estimates <small>AU Web · India in-app · Indonesia Web</small></summary>'
      + '<p class="note">Australian prices are verified observations. Overseas prices are modelled, not actual offers. Uncalibrated categories show no price. Regional availability and payment eligibility may differ.</p>'
      + items.map(function (p) {
        return '<div class="sp-r sp-regional-row"><span class="sp-n">' + icon(p.label) + esc(p.label) + '</span>'
          + '<b class="sp-a">AU Web: A          + '<span class="sp-regional-value" title="Indian in-app estimate">India in-app: ' + esc(money(p.india, '₹')) + '</span>'
          + '<span class="sp-regional-value" title="Indonesian Web estimate">Indonesia Web: ' + esc(money(p.indonesia, 'Rp ')) + '</span>'
          + '<span class="sp-n">' + esc(p.india ? 'India: estimated (' + p.india.confidence + ' confidence)' : 'India: insufficient observations')
          + ' · ' + esc(p.indonesia ? 'Indonesia: ' + (p.indonesia.basis === 'verified' ? 'verified screenshot' : 'estimated (' + p.indonesia.confidence + ' confidence)') : 'Indonesia: insufficient observations') + '</span></div>';
      }).join('') + '</details>';
  }
  function go() {
    var host = document.getElementById('evsource'); if (!host || !window.GOLIB) return;
    GOLIB.loadPrices().then(function (d) {
      if (!d || !d.owner) return; /* the Rp store list is for the owner only */ var h = regional(d) + build(d); if (!h) return;
      var el = document.getElementById('storep-host');
      if (!el) { el = document.createElement('div'); el.id = 'storep-host'; host.parentNode.insertBefore(el, host); }
      el.innerHTML = h;
    }).catch(function () { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
 + p.aud.toFixed(2) + '</b>'
          + '<span class="sp-regional-value" title="Indian in-app estimate">' + esc(money(p.india, '₹')) + '</span>'
          + '<span class="sp-regional-value" title="Indonesian Web estimate">' + esc(money(p.indonesia, 'Rp ')) + '</span>'
          + '<span class="sp-n">' + esc(p.india ? 'India: estimated (' + p.india.confidence + ' confidence)' : 'India: insufficient observations')
          + ' · ' + esc(p.indonesia ? 'Indonesia: estimated (' + p.indonesia.confidence + ' confidence)' : 'Indonesia: insufficient observations') + '</span></div>';
      }).join('') + '</details>';
  }
  function go() {
    var host = document.getElementById('evsource'); if (!host || !window.GOLIB) return;
    GOLIB.loadPrices().then(function (d) {
      if (!d || !d.owner) return; /* the Rp store list is for the owner only */ var h = regional(d) + build(d); if (!h) return;
      var el = document.getElementById('storep-host');
      if (!el) { el = document.createElement('div'); el.id = 'storep-host'; host.parentNode.insertBefore(el, host); }
      el.innerHTML = h;
    }).catch(function () { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
 + p.aud.toFixed(2) + '</b>'
          + '<span class="sp-regional-value" title="Indian in-app estimate">India in-app: ' + esc(money(p.india, '₹')) + '</span>'
          + '<span class="sp-regional-value" title="Indonesian Web estimate">Indonesia Web: ' + esc(money(p.indonesia, 'Rp ')) + '</span>'
          + '<span class="sp-n">' + esc(p.india ? 'India: estimated (' + p.india.confidence + ' confidence)' : 'India: insufficient observations')
          + ' · ' + esc(p.indonesia ? 'Indonesia: ' + (p.indonesia.basis === 'verified' ? 'verified screenshot' : 'estimated (' + p.indonesia.confidence + ' confidence)') : 'Indonesia: insufficient observations') + '</span></div>';
      }).join('') + '</details>';
  }
  function go() {
    var host = document.getElementById('evsource'); if (!host || !window.GOLIB) return;
    GOLIB.loadPrices().then(function (d) {
      if (!d || !d.owner) return; /* the Rp store list is for the owner only */ var h = regional(d) + build(d); if (!h) return;
      var el = document.getElementById('storep-host');
      if (!el) { el = document.createElement('div'); el.id = 'storep-host'; host.parentNode.insertBefore(el, host); }
      el.innerHTML = h;
    }).catch(function () { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
 + p.aud.toFixed(2) + '</b>'
          + '<span class="sp-regional-value" title="Indian in-app estimate">' + esc(money(p.india, '₹')) + '</span>'
          + '<span class="sp-regional-value" title="Indonesian Web estimate">' + esc(money(p.indonesia, 'Rp ')) + '</span>'
          + '<span class="sp-n">' + esc(p.india ? 'India: estimated (' + p.india.confidence + ' confidence)' : 'India: insufficient observations')
          + ' · ' + esc(p.indonesia ? 'Indonesia: estimated (' + p.indonesia.confidence + ' confidence)' : 'Indonesia: insufficient observations') + '</span></div>';
      }).join('') + '</details>';
  }
  function go() {
    var host = document.getElementById('evsource'); if (!host || !window.GOLIB) return;
    GOLIB.loadPrices().then(function (d) {
      if (!d || !d.owner) return; /* the Rp store list is for the owner only */ var h = regional(d) + build(d); if (!h) return;
      var el = document.getElementById('storep-host');
      if (!el) { el = document.createElement('div'); el.id = 'storep-host'; host.parentNode.insertBefore(el, host); }
      el.innerHTML = h;
    }).catch(function () { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
