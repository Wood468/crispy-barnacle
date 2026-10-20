/* Freshness: when each thing was last REFRESHED, taken only from recorded times (server source bookkeeping and the dated data files).
   The time the page was opened is never shown as a refresh time. A missing or impossible time reads "Not recorded", never "fresh".
   Freshness chips and trust chips are separate: nothing here reads or changes an event's trust level. */
(function () {
  'use strict';
  var G = window.GO; if (!G) return;
  var esc = G.esc, MON = G.MON, S = { jobs: null, api: null, dm: null, pvp: null, prices: null, moves: null, done: false };
  var HOUR = 3600000, DAY = 86400000;
  function $(id) { return document.getElementById(id); }
  function num(t) { var n = Number(t); return t == null || t === '' || !isFinite(n) ? null : n; }
  // A recorded time is usable only if it is a real number and not in the future.
  function ok(t) { var n = num(t); return n !== null && n > 0 && n <= Date.now() + 5 * 60000; }
  function isoMs(s) { if (typeof s !== 'string' || !/^\d{4}-\d\d-\d\d/.test(s)) return null; var d = new Date(s.length === 10 ? s + 'T12:00:00' : s); return isNaN(d) ? null : d.getTime(); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function clock(d) { var h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'am' : 'pm'); }
  function abs(ms) { var d = new Date(ms); return d.getDate() + ' ' + MON[d.getMonth()] + ', ' + clock(d); }
  function day(ms) { var d = new Date(ms); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); }
  function age(ms) { var m = Math.round((Date.now() - ms) / 60000); return m < 2 ? 'just now' : m < 120 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; }
  function when(ms) { return ok(ms) ? abs(ms) + ' (' + age(ms) + ')' : 'Not recorded'; }
  function snapshotStale(snap) { var ms = snap ? new Date(snap).getTime() : NaN; return isFinite(ms) && Date.now() - ms > 72 * HOUR; }
  function snapshotWarning(snap) { return snapshotStale(snap) ? ' · snapshot may be stale' : ''; }
  var TRUST = { official: ['Official', 'st-a'], community: ['Community', 'st-n'], curated: ['Community', 'st-n'], datamine: ['Datamined', 'st-d'] };
  var STATE = { healthy: ['Fresh', 'fresh'], fresh: ['Fresh', 'fresh'], stale: ['Stale', 'stale'], degraded: ['Latest check failed', 'degraded'], failing: ['Failing', 'failed'], failed: ['Failing', 'failed'], never: ['Not checked yet', 'never'], unknown: ['Time not recorded', 'never'], none: ['Not connected', 'never'] };
  function fchip(state) { var s = STATE[state] || STATE.unknown; return '<span class="fr fr-' + s[1] + '">' + s[0] + '</span>'; }
  function tchip(kind) { var t = TRUST[kind]; return t ? '<span class="st ' + t[1] + '">' + t[0] + '</span>' : ''; }
  function kv(k, v) { return '<div class="fx"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>'; }

  /* ---- the single line under the title ---- */
  function lineModel() {
    var A = S.api, snap = (G.D && G.D.asOf) || '';
    if (!S.done) return null;
    if (!A) return { cls: snapshotStale(snap) ? 'stale' : 'never', text: 'Could not reach the server to check freshness. Showing the built-in snapshot as of ' + esc(snap) + snapshotWarning(snap) + '.' };
    if (!A.enabled) return { cls: snapshotStale(snap) ? 'stale' : 'never', text: 'Live feed not connected. Showing the built-in snapshot as of ' + esc(snap) + snapshotWarning(snap) + '.' };
    var f = A.feed || {};
    var t = ok(f.lastSuccess) ? abs(f.lastSuccess) : null;
    if (A.readOnly && f.state === 'fresh' && t) return { cls: 'fresh', text: 'Live event feed checked ' + t + ' · read-only, nothing stored' };
    if (f.state === 'fresh' && t) return { cls: 'fresh', text: 'Event feed refreshed ' + t };
    if (f.state === 'degraded' && t) return { cls: 'degraded', text: 'Event feed refreshed ' + t + ' · one source failing' };
    if (f.state === 'stale' && t) return { cls: 'stale', text: 'Stale · event feed last refreshed ' + t };
    if (f.state === 'failed' && t) return { cls: 'failed', text: 'Latest refresh failed · showing data from ' + t };
    if (f.state === 'failed') return { cls: 'failed', text: 'Latest refresh failed and no earlier good refresh is recorded.' };
    return { cls: 'never', text: (f.state === 'unknown' ? 'A recorded time is invalid, so freshness cannot be judged.' : 'No successful feed refresh is recorded yet.') + ' Showing the built-in snapshot as of ' + esc(snap) + '.' };
  }
  function renderLine() {
    var el = $('fresh-line'); if (!el) return; var m = lineModel();
    if (!m) { el.hidden = true; return; }
    el.hidden = false; el.className = 'fresh-line fl-' + m.cls; el.innerHTML = '<button type="button" id="fresh-go" aria-label="Open sources and freshness">' + m.text + ' <span aria-hidden="true">›</span></button>';
  }

  /* ---- Menu › Sources and freshness ---- */
  function srcRow(s) {
    var h = '<div class="srcrow"><div class="srchead"><b>' + esc(s.name) + '</b><span class="chips">' + tchip(s.kind) + fchip(s.state) + '</span></div>';
    h += kv('Last successful update', when(s.lastOk)) + kv('Last checked', when(s.lastChecked)) + kv('Content last changed', when(s.lastChanged));
    if (ok(s.sourceUpdated)) h += kv('Upstream says updated', when(s.sourceUpdated));
    if (s.failStreak > 0 || s.state === 'failing' || s.state === 'degraded') h += '<p class="fr-note">' + (s.failStreak > 0 ? 'Latest check failed' + (s.failStreak > 1 ? ' (' + s.failStreak + ' in a row)' : '') + (s.lastError ? ': ' + esc(s.lastError) : '') + '. Showing the last good data.' : esc(s.note || '')) + '</p>';
    else if (s.state === 'stale' || s.state === 'unknown') h += '<p class="fr-note">' + esc(s.note || '') + '</p>';
    return h + '</div>';
  }
  function fileRow(name, chip, state, lines, note) {
    return '<div class="srcrow"><div class="srchead"><b>' + name + '</b><span class="chips">' + chip + fchip(state) + '</span></div>' + lines + (note ? '<p class="fr-note">' + note + '</p>' : '') + '</div>';
  }
  var REF = '<span class="st st-r">Reference data</span>';
  function renderCard() {
    var box = $('srcbody'); if (!box || !S.done) return;
    var A = S.api, h = '', worst = 'fresh';
    function bump(st) { var rank = { fresh: 0, healthy: 0, never: 1, none: 1, unknown: 1, stale: 2, degraded: 2, failed: 3, failing: 3 }; if ((rank[st] || 0) > (rank[worst] || 0)) worst = st; }
    h += '<h3 class="srch">Event feed</h3>';
    if (!A) h += '<p class="fr-note">Could not reach the server, so feed freshness is unknown. The app is showing its built-in snapshot as of ' + esc((G.D && G.D.asOf) || '') + '.</p>';
    else if (!A.enabled) h += '<p class="fr-note">The live feed is not switched on. The app is using its built-in snapshot as of ' + esc((G.D && G.D.asOf) || '') + '.</p>';
    else {
      var f = A.feed || {}; bump(f.state);
      h += '<div class="srcrow"><div class="srchead"><b>Overall</b><span class="chips">' + fchip(f.state) + '</span></div>' + kv('Last successful refresh', when(f.lastSuccess)) + kv('Last attempt', when(f.lastAttempt)) + (f.note ? '<p class="fr-note">' + esc(f.note) + '</p>' : '') + '</div>';
      (A.sources || []).forEach(function (s) { bump(s.state); h += srcRow(s); });
    }
    // data files, each with its own clock
    h += '<h3 class="srch">Data files</h3>';
    var snap = G.D && G.D.asOf, snapMs = isoMs(snap) || (snap ? Date.parse(snap) : NaN); snapMs = isFinite(snapMs) ? snapMs : null;
    var cst = snapMs === null ? 'unknown' : Date.now() - snapMs > 7 * DAY ? 'stale' : 'fresh'; bump(cst);
    h += fileRow('Curated snapshot', tchip('curated'), cst, kv('As of', esc(snap || 'Not recorded')) + kv('How it is refreshed', 'By hand'), cst === 'stale' ? 'Older than a week. It is kept by hand and may be behind.' : '');
    var D = S.dm, dts = D && ok(D.checked) ? D.checked : null, dst = !D ? 'unknown' : dts === null ? 'never' : Date.now() - dts > 36 * HOUR ? 'stale' : 'fresh'; bump(dst);
    h += fileRow('Game files and datamine posts', tchip('datamine'), dst, kv('Last checked', dts ? when(dts) : (D ? 'Not run yet' : 'Not available')) + kv('Feeds', 'Leaks only. Never counted as announced.'), dst === 'stale' ? 'No check for over 36 hours.' : '');
    var M = window.GOMOVE && GOMOVE.data && GOMOVE.data(), ms = M && M.source ? isoMs(M.source.generated || '') : null, mst = !M ? 'unknown' : ms === null || ms > Date.now() + 5 * 60000 ? 'unknown' : Date.now() - ms > 45 * DAY ? 'stale' : 'fresh'; bump(mst);
    if (M && M.source) {
      var ty = M.source.types || {}, el = M.source.elite || {};
      h += fileRow('Move types and Elite TM', REF, mst, kv('Generated', ms && mst !== 'unknown' ? day(ms) : 'Not recorded') + kv('Game data dated', esc(String(M.source.gamemaster || 'Not recorded').slice(0, 10))) + kv('Types from', '<a href="' + esc(ty.url) + '" target="_blank" rel="noopener noreferrer">' + esc(ty.name) + '</a>, cross-checked with PokeMiners') + kv('Elite TM from', esc(el.name || '')) + kv('Refresh', 'Run <code>tools/refresh-moves.sh</code>'),
        (mst === 'stale' ? 'Older than 45 days: new moves may be missing. ' : '') + 'No Elite TM tag means these sources do not list one. It does not prove a move cannot be obtained.');
    } else h += fileRow('Move types and Elite TM', REF, 'unknown', kv('Generated', 'Not recorded'), 'Move data did not load, so moves show without types.');
    var fx = S.prices && S.prices.fx;
    if (fx) {
    var fxMs = fx ? isoMs(fx.observed) : null, fst = fxMs === null ? 'unknown' : fxMs > Date.now() + DAY ? 'unknown' : Date.now() - fxMs > 3 * DAY ? 'stale' : 'fresh'; bump(fst);
    h += fileRow('Exchange rate (Rp to A$)', REF, fst, kv('Rate read', fxMs !== null && fst !== 'unknown' ? day(fxMs) : 'Not recorded') + kv('Source', fx ? '<a href="' + esc(fx.url) + '" target="_blank" rel="noopener noreferrer">' + esc(fx.source) + '</a>' : 'Not recorded') + kv('How it is refreshed', 'By hand, with the date it was read'), fst === 'stale' ? 'Older than 3 days. Prices that use it say so.' : '');
    }
    var P = S.pvp, pms = P && ok(P.updated) ? P.updated : null, pst = pms === null ? 'unknown' : Date.now() - pms > 2 * DAY ? 'stale' : 'fresh'; bump(pst);
    h += fileRow('PvP rankings', REF, pst, kv('Updated', pms ? when(pms) : 'Not recorded') + kv('Source', 'PvPoke rankings, refreshed nightly'));
    var Hh = S.jobs;
    if (Hh && Hh.jobs && Hh.jobs.length) {
      h += '<h3 class="srch">Background jobs</h3>';
      Hh.jobs.forEach(function (jb) {
        var ms = isoMs(jb.lastSuccess || ''), st = jb.state === 'fresh' ? 'fresh' : jb.state === 'never' ? 'never' : jb.state === 'failing' ? 'failing' : 'stale'; bump(st);
        h += fileRow(esc(jb.name), '', st, kv('Last good run', ms ? when(ms) : 'None on record') + kv('Usually runs', jb.everyH >= 168 ? 'weekly' : jb.everyH >= 24 ? 'daily' : 'every ' + jb.everyH + ' h'), st === 'stale' ? 'It has gone quiet. You are also told on Telegram.' : st === 'failing' ? 'Its latest run failed. You are also told on Telegram.' : '');
      });
      h += '<p class="fr-note">Checked ' + (ok(Date.parse(Hh.updated)) ? when(Date.parse(Hh.updated)) : 'recently') + '. This list refreshes every few hours.</p>';
    }
    h += '<p class="fr-note">Freshness says how recently something was refreshed. It never changes whether an event is Official, Community or Datamined.</p><p><a href="/sources.html">Full source health page</a></p>';
    box.innerHTML = h;
    var sum = $('srcsum'); if (sum) { var L = STATE[worst] || STATE.unknown; sum.textContent = worst === 'fresh' || worst === 'healthy' ? 'all current' : L[0].toLowerCase(); sum.className = 'cnt fr-sum fr-sum-' + (L[1]); }
  }
  function renderAll() { renderLine(); renderCard(); }

  function j(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  Promise.all([j('/api/sources'), j('/api/datamine'), j('/api/pvp').then(function (p) { return p || j('/pvp.json'); }), (window.GOLIB ? GOLIB.loadPrices() : j('/prices.json')), j('/health.json')]).then(function (a) {
    S.api = a[0] && typeof a[0] === 'object' ? a[0] : null; S.dm = a[1]; S.pvp = a[2]; S.prices = a[3]; S.jobs = a[4]; S.done = true; renderAll();
    if (window.GOMOVE) GOMOVE.ready.then(renderAll);
  });
  document.addEventListener('gomoves', renderAll);
  document.addEventListener('click', function (e) { if (e.target.closest('#fresh-go')) { G.showTab('saved', 'menu'); var d = $('srcdd'); if (d) { d.open = true; setTimeout(function () { d.scrollIntoView({ block: 'start' }); }, 50); } } });
  window.GOFRESH = { state: function () { return S; }, lineModel: lineModel, render: renderAll };
})();
