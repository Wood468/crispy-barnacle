/* Phases 3-6 screens: Forms, Alerts settings, screenshot Import. Loaded by dash.js once the dashboard is ready. */
(function () {
  var G = window.GO, X = window.GODASH, S = window.GOSTATE, LIB = window.GOLIB; if (!G || !X || !S || !LIB) return;
  var esc = G.esc;
  function $(id) { return document.getElementById(id); }

  /* ---------------- Forms ---------------- */
  var FORMS = [], grp = 'marked', shown = 60, RELEASES = {};
  function releaseKey(n) { return String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function unreleasedBadge(name) {
    var item = RELEASES[releaseKey(name)];
    if (!item) return '';
    var title = item.available ? 'Expected from ' + item.available + '; check the event details' : 'Not released in Pokémon GO yet';
    return '<span class="release-pill" title="' + esc(title) + '">Not released</span>';
  }
  var GROUPS = [['marked', 'Marked'], ['regional', 'Regional'], ['mega', 'Mega / Primal'], ['gmax', 'Gigantamax'], ['other', 'Other']];
  function fullName(f) {
    var sp = X.DEXNAME[f[0]] || '#' + f[0], k = f[1];
    if (k === 'mega-x' || k === 'mega-y') return 'Mega ' + sp + ' ' + k.slice(-1).toUpperCase();
    var parts = f[2].split(' ');
    if (/^(Alolan|Galarian|Hisuian|Paldean)$/.test(parts[0])) return parts[0] + ' ' + sp + (parts.length > 1 ? ' (' + parts.slice(1).join(' ') + ')' : '');
    return f[2] + ' ' + sp;
  }
  function renderForms() {
    var list = $('formlist'); if (!list) return;
    $('formgrp').innerHTML = GROUPS.map(function (g) { return '<button type="button" class="pill' + (grp === g[0] ? ' all' : '') + '" data-fg="' + g[0] + '" aria-pressed="' + (grp === g[0]) + '">' + g[1] + '</button>'; }).join('');
    var q = $('formq').value.trim().toLowerCase(), rows = FORMS.filter(function (f) {
      var tk = 'form:' + f[0] + ':' + f[1];
      if (q) return (X.DEXNAME[f[0]] || '').toLowerCase().indexOf(q) > -1;
      if (grp === 'marked') return S.get(tk) !== undefined;
      return f[3] === grp;
    });
    var have = 0, need = 0; FORMS.forEach(function (f) { var v = S.get('form:' + f[0] + ':' + f[1]); if (v === 1) have++; else if (v === 0) need++; });
    $('formsum').textContent = have + ' marked Have, ' + need + ' marked Need, of ' + FORMS.length + ' forms in the catalogue.';
    list.innerHTML = rows.length ? rows.slice(0, shown).map(function (f) {
      var tk = 'form:' + f[0] + ':' + f[1], nm = fullName(f);
      return '<div class="frow"><span class="fa">' + G.art(nm, 'ea') + '</span><span class="fname"><b>' + esc(nm) + '</b>' + unreleasedBadge(nm) + '</span><span class="fbtns">'
        + '<button type="button" data-mark="' + esc(tk) + '" data-val="1" aria-pressed="' + (S.get(tk) === 1) + '">Have</button>'
        + '<button type="button" data-mark="' + esc(tk) + '" data-val="0" aria-pressed="' + (S.get(tk) === 0) + '">Need</button></span></div>';
    }).join('') + (rows.length > shown ? '<button type="button" class="pill" id="formmore">Show more (' + (rows.length - shown) + ')</button>' : '')
      : '<p class="empty">' + (q ? 'No forms found for that name.' : grp === 'marked' ? 'Nothing marked yet. Search a Pokémon above, or pick a type.' : 'No forms here.') + '</p>';
  }
  Promise.all([fetch('/forms.json').then(function (r) { return r.json(); }), fetch('/release-status.json').then(function (r) { if (!r.ok) throw new Error('status'); return r.json(); }).catch(function () { return { unreleased: [] }; })]).then(function (results) { FORMS = results[0].f || []; (results[1].unreleased || []).forEach(function (x) { RELEASES[releaseKey(x.name)] = x; }); renderForms(); }).catch(function () { $('formlist').innerHTML = '<p class="empty">Could not load the form list.</p>'; });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-fg],#formmore'); if (!b) return;
    if (b.id === 'formmore') shown += 60; else { grp = b.getAttribute('data-fg'); shown = 60; $('formq').value = ''; }
    renderForms();
  });
  $('formq').addEventListener('input', function () { shown = 60; renderForms(); });
  document.addEventListener('gofn-state', renderForms);

  /* ---------------- Alerts settings ---------------- */
  var NS = { on: false, telegram: true, push: true, announced: true, changed: true, starting: true, missing: true, datamine: false, lead: 12 };
  var info = null, msg = '';
  function pv(k) { var v = S.get('pref:notify.' + k); return v === undefined ? NS[k] : v; }
  function api(path, method) { return fetch(path, { method: method || 'GET', headers: { 'x-pin': S.pin() } }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); }); }
  function loadInfo() { if (!S.pin()) { info = null; renderAlerts(); return; } api('/api/notify/status').then(function (j) { info = j; renderAlerts(); }).catch(function () { info = null; renderAlerts(); }); }
  function tog(k, label, note) { return '<label class="al-row"><span><b>' + label + '</b>' + (note ? '<small>' + note + '</small>' : '') + '</span><input type="checkbox" data-pref="' + k + '"' + (pv(k) ? ' checked' : '') + '></label>'; }
  function renderAlerts() {
    var el = $('alerts'); if (!el) return;
    $('alertsum').textContent = pv('on') ? 'On' : 'Off';
    var h = '';
    if (!S.pin()) h += '<div class="notice">Enter your sync PIN first (Dex tab). Alerts are sent from the server, so they need it.</div>';
    else if (info && info.__status === 404) h += '<div class="notice">Sync is not switched on for this site.</div>';
    else if (info && info.__status === 401) h += '<div class="notice">That sync PIN was not accepted.</div>';
    else if (info && !info.tablesCreated) h += '<div class="notice"><b>One-time setup.</b> The server tables for sync, events and alerts have not been created yet. This only adds new tables.<br><button type="button" class="pill all" id="alinit">Create them now</button></div>';
    if (msg) h += '<p class="sync" role="status">' + esc(msg) + '</p>';
    h += tog('on', 'Send me alerts', 'Master switch. Off by default.');
    h += tog('announced', 'New announced events', 'Official or community reported only.');
    h += tog('changed', 'Date or time changes', 'For events already announced.');
    h += tog('starting', 'Starting soon', 'Only events with a confirmed start time.');
    h += tog('missing', 'Pokémon you need or follow', 'Within 48 hours of an event. Needs Dex marks or follows.');
    h += tog('datamine', 'Datamine finds', 'Always labelled NOT ANNOUNCED. Never urgent.');
    h += '<label class="al-row"><span><b>"Starting soon" window</b><small>Hours before the start. The server checks every six hours, so keep this at 6 or more.</small></span><select data-pref="lead">' + [6, 8, 12, 24].map(function (n) { return '<option' + (pv('lead') === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>';
    h += '<h3 class="sec3">Where they go</h3>';
    h += tog('telegram', 'Telegram', info ? (info.telegramConfigured ? 'Connected.' : 'Not connected yet. See the setup steps in docs/phase5-notifications.md.') : '');
    if (info && info.telegramConfigured) h += '<button type="button" class="pill" id="altest">Send a test message</button>';
    h += tog('push', 'This phone (browser push)', info ? ('Devices registered: ' + (info.pushDevices || 0) + '. On iPhone, add the site to your Home Screen first.') : '');
    h += '<button type="button" class="pill" id="alpush">Turn on for this device</button>';
    if (info && info.recent && info.recent.length) h += '<h3 class="sec3">Recently sent</h3><ul class="al-log">' + info.recent.map(function (r) { return '<li><b>' + esc(r.title) + '</b><small>' + esc(new Date(r.created_at).toLocaleString()) + ' · ' + esc(r.level === 'info' ? 'not urgent' : 'alert') + '</small></li>'; }).join('') + '</ul>';
    if (S.pin()) h += '<h3 class="sec3">Leaks and Pokémon statuses</h3><p class="sub" style="margin:0">These refresh by themselves every morning. Use this to refresh them now.</p><button type="button" class="pill" id="dmrun">Refresh leaks now</button>';
    el.innerHTML = h;
  }
  document.addEventListener('change', function (e) {
    var t = e.target; if (!t.getAttribute || !t.getAttribute('data-pref')) return;
    var k = t.getAttribute('data-pref'); S.set('pref:notify.' + k, k === 'lead' ? +t.value : t.checked); renderAlerts();
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#alinit,#altest,#alpush,#dmrun'); if (!b) return;
    if (b.id === 'alinit') api('/api/userstate/init', 'POST').then(function () { return api('/api/pipeline/run', 'POST'); }).then(function () { msg = 'Tables created and the first event check ran.'; S.sync(); loadInfo(); });
    if (b.id === 'altest') api('/api/notify/test', 'POST').then(function (j) { msg = j.telegram && j.telegram.status === 'sent' ? 'Test message sent. Check Telegram.' : 'Test failed: ' + ((j.telegram && j.telegram.why) || 'unknown'); renderAlerts(); });
    if (b.id === 'alpush') enablePush();
    if (b.id === 'dmrun') { msg = 'Refreshing leaks…'; renderAlerts(); api('/api/datamine/run', 'POST').then(function (j) { msg = j.ok ? 'Leaks and statuses refreshed. Reload the Leaks tab to see them.' : 'Could not refresh: ' + (j.error || ('error ' + j.__status)); renderAlerts(); }).catch(function () { msg = 'Could not refresh: no connection.'; renderAlerts(); }); }
  });
  function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { msg = 'This browser can’t do push. On iPhone, add the site to your Home Screen and open it from there.'; return renderAlerts(); }
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('Permission was not given.');
      return api('/api/notify/push-key', 'POST');
    }).then(function (k) {
      if (!k.publicKey) throw new Error(k.error || 'Push keys are not available yet. Create the tables first.');
      var raw = atob(k.publicKey.replace(/-/g, '+').replace(/_/g, '/')), key = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);
      return navigator.serviceWorker.register('/sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function (reg) { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); });
    }).then(function (sub) {
      return fetch('/api/notify/subscribe', { method: 'POST', headers: { 'x-pin': S.pin(), 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).then(function (r) { if (!r.ok) throw new Error('The server did not accept this device.'); });
    }).then(function () { msg = 'This device is registered for alerts.'; loadInfo(); }).catch(function (err) { msg = 'Could not turn on push: ' + err.message; renderAlerts(); });
  }
  $('alertsdd').addEventListener('toggle', function () { if ($('alertsdd').open) loadInfo(); });
  document.addEventListener('gofn-state', function () { $('alertsum').textContent = pv('on') ? 'On' : 'Off'; });
  renderAlerts(); S.sync();

  /* ---------------- Import from screenshots ---------------- */
  var QUEUE = [], BK = 'gofn-import-batches';
  function batches() { try { return JSON.parse(localStorage.getItem(BK) || '[]'); } catch (e) { return []; } }
  function saveBatches(b) { try { localStorage.setItem(BK, JSON.stringify(b.slice(-10))); } catch (e) { /* memory only */ } }
  var CONF = { high: 'Exact match', medium: 'Close spelling', low: 'Partial, check it', unclear: 'Could be several' };
  function ownIds() { var d = G.dex(); return (d && d.m && d.m.own) || {}; }
  function renderQueue() {
    var el = $('impq'); if (!QUEUE.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<h2 class="sec2">Review (' + QUEUE.length + ')</h2><p class="note">Only exact matches are ticked. Untick anything wrong. Applying adds <b>Have</b> only.</p><div class="impq">' + QUEUE.map(function (r, i) {
      var opt = r.conf === 'unclear' ? '<select data-qi="' + i + '" aria-label="Which Pokémon"><option value="">Choose…</option>' + r.options.map(function (o) { return '<option value="' + o.dex + '">' + esc(o.name) + '</option>'; }).join('') + '</select>' : '<b>' + esc(r.name) + '</b>' + (r.already ? ' <span class="st st-n">Already have</span>' : '');
      return '<label class="improw c-' + r.conf + '"><input type="checkbox" data-qc="' + i + '"' + (r.on ? ' checked' : '') + (r.conf === 'unclear' && !r.dex ? ' disabled' : '') + '><span class="impm">' + opt + '<small>Read as “' + esc(r.text) + '” · ' + CONF[r.conf] + '</small></span></label>';
    }).join('') + '</div><button type="button" class="pill all" id="impapply">Add ticked to my Dex</button> <button type="button" class="pill" id="impclear">Discard</button>';
  }
  function renderBatches() {
    var b = batches().filter(function (x) { return !x.undone; });
    $('impbatches').innerHTML = b.length ? '<h2 class="sec2 dh">Undo an import</h2>' + b.slice().reverse().map(function (x) { return '<div class="impb"><span>' + esc(new Date(x.at).toLocaleString()) + ' · ' + x.ids.length + ' added</span><button type="button" class="pill" data-undo="' + x.id + '">Undo</button></div>'; }).join('') : '';
  }
  function setQueue(text) {
    var own = ownIds();
    QUEUE = LIB.buildQueue(text, Object.keys(X.DEXNAME).map(function (k) { return [+k, X.DEXNAME[k]]; }), own);
    QUEUE.forEach(function (r) { r.on = r.conf === 'high' && !r.already; });
    if (QUEUE.length) {
      $('impstat').textContent = 'Read ' + QUEUE.length + ' possible Pokémon. Review them below.';
    } else {
      // Keep the OCR output visible and editable instead of discarding it when matching fails.
      // This makes a poor OCR pass diagnosable and lets the user correct names and retry.
      if (text) $('imptext').value = text;
      $('impstat').textContent = text
        ? 'Text was read, but no Pokémon names matched. The recognised text is in the box above—correct any names and tap Read it again. Nothing was changed.'
        : 'No text was detected in these screenshots. Try a clearer screenshot or paste names below. Nothing was changed.';
    }
    renderQueue();
  }
  document.addEventListener('change', function (e) {
    var t = e.target; if (!t.getAttribute) return;
    if (t.hasAttribute('data-qc')) QUEUE[+t.getAttribute('data-qc')].on = t.checked;
    if (t.hasAttribute('data-qi')) { var r = QUEUE[+t.getAttribute('data-qi')]; r.dex = +t.value || 0; r.name = X.DEXNAME[r.dex]; r.on = !!r.dex; renderQueue(); }
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#impapply,#impclear,#impgo,[data-undo]'); if (!b) return;
    if (b.id === 'impclear') { QUEUE = []; renderQueue(); $('impstat').textContent = 'Discarded. Nothing was changed.'; }
    if (b.id === 'impgo') { var t = $('imptext').value.trim(); if (t) setQueue(t); else $('impstat').textContent = 'Choose screenshots or paste some names first.'; }
    if (b.id === 'impapply') {
      var ids = QUEUE.filter(function (r) { return r.on && r.dex; }).map(function (r) { return r.dex; });
      var added = G.markOwn(ids), bs = batches();
      if (added.length) bs.push({ id: 'b' + Date.now(), at: Date.now(), ids: added });
      saveBatches(bs); QUEUE = []; renderQueue(); renderBatches();
      $('impstat').textContent = added.length ? 'Added ' + added.length + ' to your Dex. You can undo this below.' : 'Nothing new to add.';
    }
    if (b.hasAttribute('data-undo')) {
      var all = batches(), x = all.filter(function (q) { return q.id === b.getAttribute('data-undo'); })[0];
      if (x) { G.unmarkOwn(x.ids); x.undone = true; saveBatches(all); renderBatches(); $('impstat').textContent = 'Undone: removed the ' + x.ids.length + ' that import added.'; }
    }
  });
  function loadTesseract() {
    if (window.Tesseract && window.Tesseract.createWorker) return Promise.resolve(window.Tesseract);
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      s.onload = function () { if (window.Tesseract && window.Tesseract.createWorker) res(window.Tesseract); else rej(new Error('The text reader loaded incorrectly.')); };
      s.onerror = function () { rej(new Error('Could not download the text reader. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  var importBusy = false;
  $('impfiles').addEventListener('change', function (e) {
    var input = e.target, selected = Array.prototype.slice.call(input.files || []);
    if (!selected.length) return;
    var files = selected.slice(0, 12);
    input.value = '';
    if (importBusy) { $('impstat').textContent = 'Already reading screenshots. Wait for the current batch to finish.'; return; }
    importBusy = true;
    $('impq').innerHTML = '';
    $('impstat').textContent = 'Selected ' + files.length + ' screenshot' + (files.length === 1 ? '' : 's') + '. Loading the text reader…';
    var worker = null;
    loadTesseract().then(function (T) {
      return T.createWorker('eng').then(function (w) {
        worker = w;
        // Pokémon storage screenshots contain scattered labels and small text, not one text block.
        return worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' }).then(function () {
          var texts = [], i = 0;
          function next() {
            if (i >= files.length) return Promise.resolve();
            $('impstat').textContent = 'Reading screenshot ' + (i + 1) + ' of ' + files.length + '…';
            return worker.recognize(files[i]).then(function (r) {
              texts.push(r && r.data ? r.data.text || '' : '');
              i++;
              return next();
            });
          }
          return next().then(function () { setQueue(texts.join('\n')); });
        });
      });
    }).catch(function (err) {
      $('impstat').textContent = 'Could not read the screenshots: ' + (err && err.message ? err.message : 'the text reader needs a connection') + ' You can retry or paste names instead. Nothing was changed.';
    }).then(function () {
      if (worker) return worker.terminate().catch(function () {});
    }).then(function () {
      importBusy = false;
    }, function () {
      importBusy = false;
    });
  });
  renderBatches();
  window.GOEXTRA = { setQueue: setQueue, queue: function () { return QUEUE; } };
})();
