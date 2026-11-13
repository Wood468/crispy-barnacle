/* Infographic review: pictures the matcher was not sure about wait here. One tap links a picture to an event (add as many events as you like), unlinks one, or discards it.
   Decisions are saved to the site (sync PIN needed to write) and the next scheduled run attaches approved pictures to their events. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.GOLIB.esc;
  var items = [], decided = {}, decs = {}, msg = '', shown = 10, loadToken = 0, loadedForOwner = false, undos = [], decsOk = false, chains = {}, capped = false, pendingDiscard = {}, recheck = {}, queueFailed = false;
  /* GET /api/ig-decisions returns only the newest rows: src/worker.js igDecisions() runs "ORDER BY at DESC LIMIT 500" and has no per-picture query.
     A list this long may be cut off, so a picture missing from it is UNKNOWN (it may hold an older decision), never "nothing stored". */
  var DECISIONS_CAP = 500;
  var pokemonCatalogue = [], formCatalogue = [];
  var NET_TIMEOUT_MS = 15000;
  function unknownErr() { var e = new Error('unknown'); e.unknown = true; return e; }
  /* fetch with a time limit: a hung request ends in a timeout error instead of blocking the picture's queue forever. */
  function timedFetch(url, opts) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null, timer;
    var o = Object.assign({}, opts || {}); if (ctl) o.signal = ctl.signal;
    var limit = new Promise(function (_, reject) { timer = setTimeout(function () { var e = new Error('timeout'); e.timeout = true; reject(e); if (ctl) { try { ctl.abort(); } catch (e2) { } } }, NET_TIMEOUT_MS); });
    return Promise.race([fetch(url, o), limit]).then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
  }
  function takeDecisions(list) { capped = list.length >= DECISIONS_CAP; list.forEach(applyLocal); }
  function pin() { try { return localStorage.getItem('gofn-pin') || ''; } catch (e) { return ''; } }
  function isOwner() { return document.documentElement.getAttribute('data-role') === 'owner'; }
  function hideOwnerUi() {
    loadToken++; loadedForOwner = false; items = []; decided = {}; decs = {}; msg = ''; decsOk = false; capped = false; queueFailed = false; pendingDiscard = {}; recheck = {}; clearUndo();
    var a = $('hireview'); if (a) a.hidden = true;
    var c = $('igcount'); if (c) c.hidden = true;
    var b = $('igbanner'); if (b) b.remove();
    var d = $('igdiscord'); if (d) d.remove();
    var h = $('igreview'); if (h) h.remove();
    var menu = $('hmenu'); if (menu) menu.classList.remove('has-new');
    var saved = document.querySelector('nav.tabs button[data-tab="saved"]'); if (saved) saved.classList.remove('has-new');
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  /* The queue can hold the same picture twice (one Discord post seen again, or the same file re-added): one card per picture.
     Two entries are the same picture when they share an id, an image file or an original-post link. A duplicate's suggestions are folded into
     the first card, and a decision on any copy hides them all. Stored data is not touched; this only changes what is listed. */
  function imageKey(u) { return String(u || '').split(/[?#]/)[0].split('/').pop().toLowerCase(); }
  function bareId(x) { return String(x || '').replace(/^[a-z]+:/i, '').toLowerCase(); }
  function dedupeGuesses(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (g) {
      if (!g || !g.eventId) return;
      var k = bareId(g.eventId); if (seen[k]) return; seen[k] = 1; out.push(g);
    });
    return out;
  }
  function dedupeItems(list) {
    var by = {}, out = [];
    (list || []).forEach(function (it) {
      if (!it || !it.id) return;
      var keys = ['id:' + it.id]; if (it.image) keys.push('img:' + imageKey(it.image)); if (safeUrl(it.post)) keys.push('post:' + it.post);
      /* A picture can match two cards already listed (one by image, one by post link): they become one card. */
      var hits = []; keys.forEach(function (k) { if (by[k] && hits.indexOf(by[k]) < 0) hits.push(by[k]); });
      var first = hits[0];
      if (first) {
        hits.slice(1).forEach(function (other) {
          first.also.push(other.id); (other.also || []).forEach(function (a) { first.also.push(a); });
          first.guesses = dedupeGuesses((first.guesses || []).concat(other.guesses || []));
          out.splice(out.indexOf(other), 1);
          Object.keys(by).forEach(function (k) { if (by[k] === other) by[k] = first; });
        });
        first.also.push(it.id); first.guesses = dedupeGuesses((first.guesses || []).concat(it.guesses || [])); keys.forEach(function (k) { if (!by[k]) by[k] = first; }); return;
      }
      var c = Object.assign({}, it, { also: [], guesses: dedupeGuesses(it.guesses) });
      keys.forEach(function (k) { by[k] = c; }); out.push(c);
    });
    return out;
  }
  function isDecided(it) { return !!decided[it.id] || (it.also || []).some(function (i) { return !!decided[i]; }); }
  /* Discard can be taken back for a few seconds: a small notice with Undo. Undo re-sends exactly what the site held when the Discard was made (or clears it when it held nothing).
     Several discards in a row each keep their own Undo (the newest is offered first; the older ones come back as the newer ones are used or expire).
     Nothing is written on a guess: the site's current decision is read fresh before a Discard and again before an Undo. */
  function drawUndo(focus) {
    var t = $('igundo'); if (t) t.remove();
    if (!undos.length) return;
    t = document.createElement('div'); t.id = 'igundo'; t.className = 'evtoast igundo'; t.setAttribute('role', 'status');
    t.innerHTML = '<span>Discarded</span><button type="button" class="pill" data-ig-undo>Undo</button>';
    document.body.appendChild(t);
    var b = t.querySelector('button'); if (focus && b && b.focus) b.focus({ preventScroll: true });
  }
  function dropUndo(entry) { var i = undos.indexOf(entry); if (i < 0) return; clearTimeout(entry.timer); undos.splice(i, 1); }
  function clearUndo(id) {
    undos.slice().forEach(function (u) { if (id == null || u.id === id) dropUndo(u); });
    drawUndo(false);
  }
  function showUndo(it, prev) {
    undos.slice().forEach(function (u) { if (u.id === it.id) dropUndo(u); });
    var entry = { id: it.id, prev: prev };
    entry.timer = setTimeout(function () { dropUndo(entry); drawUndo(false); }, 8000);
    undos.push(entry); drawUndo(true);
  }
  function applyLocal(d) {
    decs[d.id] = d;
    if (d.status === 'approved' || d.status === 'rejected' || d.status === 'week' || d.status === 'month') decided[d.id] = d.status; else delete decided[d.id];
  }
  /* One write at a time per picture: a tap waits for the earlier write on the same card to reach the site (or fail) before it is sent. */
  function queued(id, fn) {
    var run = (chains[id] || Promise.resolve()).then(fn, fn);
    var tail = run.catch(function () { }); chains[id] = tail;
    tail.then(function () { if (chains[id] === tail) delete chains[id]; });
    return run;
  }
  /* The site's current decision for one picture, read fresh (never from a browser or shared copy): the decision, or null when it holds none. Rejects when it cannot be read, and when the list was cut off at the cap and does not show the picture (then it is unknown). */
  function readServer(id) {
    return timedFetch('/api/ig-decisions', { cache: 'reload' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
      var list = j && j.decisions; if (!Array.isArray(list)) throw new Error('bad');
      var hit = list.filter(function (d) { return d && d.id === id; })[0] || null;
      /* A full-length list that does not mention the picture proves nothing: older rows may have been cut off. */
      if (!hit && list.length >= DECISIONS_CAP) throw unknownErr();
      return hit ? { id: id, status: hit.status, eventId: hit.eventId || '', eventTitle: hit.eventTitle || '', targets: hit.targets || [] } : null;
    });
  }
  var CAP_MSG = 'The saved decisions list is full (' + DECISIONS_CAP + ' shown), so this picture\'s saved state cannot be checked. Nothing was changed.';
  var TIMEOUT_MSG = 'Saving took too long, so it may or may not have been saved. The card stays. Your next tap checks the saved state first.';
  function failMsg(e, fallback) { return e && e.unknown ? CAP_MSG : e && e.timeout ? TIMEOUT_MSG : fallback; }
  /* After a write timed out it may still have landed: read the site again before anything else is written for that picture, show what it holds, and ask for a fresh tap. */
  function recheckFirst(id) {
    if (!recheck[id]) return Promise.resolve(true);
    return readServer(id).then(function (now) {
      setLocal(id, now); delete recheck[id];
      msg = 'An earlier save on this picture timed out, so the saved decision was checked again. Tap again if you still want to change it.'; render(); return false;
    });
  }
  function setLocal(id, d) { if (d) applyLocal(d); else { delete decs[id]; delete decided[id]; } }
  function undoDiscard() {
    var u = undos[undos.length - 1]; if (!u) return; dropUndo(u); drawUndo(false);
    var back = u.prev ? { id: u.id, status: u.prev.status, eventId: u.prev.eventId || '', eventTitle: u.prev.eventTitle || '' } : { id: u.id, status: 'reset', eventId: '', eventTitle: '' };
    if (u.prev && Array.isArray(u.prev.targets) && u.prev.targets.some(function(t){return t && t.type === 'raid-boss';})) back.targets = u.prev.targets;
    queued(u.id, function () {
      return recheckFirst(u.id).then(function (go) { if (!go) return; return readServer(u.id).then(function (now) {
        if (!now || now.status !== 'rejected') { setLocal(u.id, now); msg = 'That picture was changed somewhere else since you discarded it, so Undo did nothing.'; render(); return; }
        return post(back).then(function () {
          setLocal(u.id, u.prev ? back : null); msg = ''; render();
          document.dispatchEvent(new CustomEvent('gofn-review-updated', { detail: { decided: true } }));
        });
      }); }).catch(function (e) { msg = failMsg(e, 'Could not undo that. It is still discarded. Check your sync PIN and connection.'); render(); });
    });
  }
  function post(body) {
    return timedFetch('/api/ig-decisions', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pin': pin() }, body: JSON.stringify(body) }).then(function (r) { if (!r.ok) throw new Error(r.status); }, function (e) {
      /* A write that timed out may still have landed: nothing more is written for this picture until the site has been read again. */
      if (e && e.timeout && body && body.id) recheck[body.id] = true;
      throw e;
    });
  }
  function eventOptions() {
    var X = window.GODASH; if (!X) return '';
    var t = Date.now(), list = X.events().concat(X.raidSlots ? X.raidSlots() : [], X.worldEvents ? X.worldEvents() : [], X.regionalEvents ? X.regionalEvents() : []).filter(function (e) { return e.end.getTime() > t && e.start.getTime() < t + 200 * 864e5; });
    /* The same event held in two lists (our own card and the world list) is offered once: the shared rule in dedupe.js, first copy wins. */
    if (window.GODEDUPE) {
      var asEv = function (e) { return { id: e.id, name: e.name, place: e.place || '', start: +e.start, end: +e.end }; }, gone = {};
      GODEDUPE.groups(list.map(asEv), null).forEach(function (g) { g.dupes.forEach(function (d) { gone[d.event.id] = 1; }); });
      list = list.filter(function (e) { return !gone[e.id]; });
    }
    list.sort(function (a, b) { return a.start - b.start; });
    var fmt = function (d) { return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); };
    /* A tour or series with several stops ("Pokémon RUN 30: Taichung", "Pokémon RUN 30: Kaohsiung") gets one "All" choice, for a graphic that covers every stop. */
    var by = {}; list.forEach(function (e) { var m = /^(.{4,}?):\s/.exec(e.name); if (m) (by[m[1]] = by[m[1]] || []).push(e); });
    var all = Object.keys(by).filter(function (k) { return by[k].length > 1; }).map(function (k) {
      return '<option value="series:' + esc(k) + '" data-ids="' + esc(by[k].map(function (e) { return e.id; }).join(',')) + '" data-t="' + esc(by[k].map(function (e) { return e.name; }).join(' | ')) + '">★ All ' + esc(k) + ' (' + by[k].length + ' stops)</option>';
    }).join('');
    return all + list.map(function (e) { return '<option value="' + esc(e.id) + '" data-t="' + esc(e.name) + '">' + esc(e.name) + ' · ' + fmt(e.start) + '</option>'; }).join('');
  }
  /* The chosen option as a list of events: one event, or every stop of a series. */
  function picks(o) {
    var ids = o.getAttribute('data-ids'); if (!ids) return [{ id: o.value, title: o.getAttribute('data-t') }];
    var ts = o.getAttribute('data-t').split(' | '); return ids.split(',').map(function (x, i) { return { id: x, title: ts[i] || x }; });
  }
  function bossTargets(id) {
    var d = decs[id];
    return d && d.status === 'approved' && Array.isArray(d.targets)
      ? d.targets.filter(function (t) { return t && t.type === 'raid-boss'; }) : [];
  }
  function bossName(id) {
    var match = pokemonCatalogue.filter(function (p) { return String(p[0]).padStart(3,'0') === String(id); })[0];
    return match ? match[1] : '#' + String(id);
  }
  function bossLabel(t) {
    return bossName(t.pokemonId) + (t.formId ? ' · ' + t.formId : '') + ' · ' + t.battleMode;
  }
  function bossControls(it) {
    return '<div class="igr-o ig-boss-controls" role="group" aria-label="Attach infographic to a Pokémon">'
      + '<label>Pokémon<input type="search" data-ig-boss-name list="ig-boss-list" placeholder="Exact Pokémon name" autocomplete="off" maxlength="90"></label>'
      + '<label>Battle type<input type="text" data-ig-boss-mode list="ig-boss-mode-list" value="normal" maxlength="15" autocomplete="off" aria-label="Battle type: normal, shadow, dynamax, gigantamax, mega or primal"></label>'
      + '<label>Exact form<input type="text" data-ig-boss-form list="ig-boss-form-' + esc(it.id) + '" value="" maxlength="80" autocomplete="off" placeholder="Base/default" aria-label="Exact form"><datalist id="ig-boss-form-' + esc(it.id) + '" data-ig-boss-form-options></datalist></label>'
      + '<button type="button" class="pill" data-ig-boss-save>Attach to Pokémon</button></div>';
  }
  function bossFormCompatible(row, mode) {
    var kind = row[3];
    // forms.json classifies Primal Kyogre/Groudon in its broader 'mega'
    // family. The exact formId, not category alone, separates these modes.
    if (mode === 'mega') return kind === 'mega' && row[1] !== 'primal';
    if (mode === 'primal') return kind === 'mega' && row[1] === 'primal';
    if (mode === 'gigantamax') return kind === 'gmax';
    return kind !== 'mega' && kind !== 'primal' && kind !== 'gmax';
  }
  function chosenPokemon(card) {
    var field = card.querySelector('[data-ig-boss-name]');
    var value = field ? field.value.trim().toLocaleLowerCase() : '';
    var found = pokemonCatalogue.filter(function (p) { return String(p[1]).toLocaleLowerCase() === value; });
    return found.length === 1 ? found[0] : null;
  }
  function refreshBossForms(card) {
    var mon = chosenPokemon(card), mode = card.querySelector('[data-ig-boss-mode]'),
        field = card.querySelector('[data-ig-boss-form]');
    if (!mode || !field) return;
    var was = field.value;
    var opts = formCatalogue.filter(function (f) {
      return mon && +f[0] === +mon[0] && bossFormCompatible(f, mode.value);
    });
    var choices = card.querySelector('[data-ig-boss-form-options]');
    if (choices) choices.innerHTML = opts.map(function (f) { return '<option value="' + esc(f[1]) + '" label="' + esc(f[2]) + '"></option>'; }).join('');
    field.value = opts.some(function (f) { return f[1] === was; }) ? was : '';
  }
  function linkedOf(id) {
    var d = decs[id]; if (!d || d.status !== 'approved' || !d.eventId) return [];
    var ids = String(d.eventId).split(','), ts = String(d.eventTitle || '').split(' | ');
    return ids.map(function (x, i) { return { id: x, title: ts[i] || x }; });
  }
  function linkedCard(it) {
    var L = linkedOf(it.id);
    return '<article class="igr" data-id="' + esc(it.id) + '">'
      + '<a class="igr-img" href="' + esc(it.image) + '" target="_blank" rel="noopener"><img src="' + esc(it.image) + '" alt="' + esc(it.title || 'Infographic') + '" loading="lazy" decoding="async"></a>'
      + '<div class="igr-b"><b>' + esc(it.title || 'Untitled graphic') + '</b>'
      + '<div class="igr-g">' + bossTargets(it.id).map(function (t,n) { return '<button type="button" class="pill all" data-ig-boss-unlink="' + n + '" aria-label="Unlink ' + esc(bossLabel(t)) + '">' + esc(bossLabel(t)) + ' ✕</button>'; }).join('') + L.map(function (l, n) { return '<button type="button" class="pill all" data-ig-unlink="' + n + '" aria-label="Unlink from ' + esc(l.title) + '">' + esc(l.title) + ' ✕</button>'; }).join('') + '</div>'
      + '<div class="igr-o"><select aria-label="Link to another event"><option value="">Also link to…</option>' + eventOptions() + '</select><button type="button" class="pill" data-ig-add aria-label="Add event: ' + esc(it.title || 'Untitled graphic') + '">Add</button><button type="button" class="pill" data-ig-no aria-label="Discard: ' + esc(it.title || 'Untitled graphic') + '">Discard</button></div>'
      + bossControls(it)
      + '<div class="igr-o"><button type="button" class="pill" data-ig-ov="week">📅 This week\'s picture</button><button type="button" class="pill" data-ig-ov="month">🗓 Month overview</button></div>'
      + '</div></article>';
  }
  function card(it) {
    var live = {}, liveN = {}; if (window.GODASH) GODASH.events().concat(GODASH.raidSlots ? GODASH.raidSlots() : [], GODASH.worldEvents ? GODASH.worldEvents() : [], GODASH.regionalEvents ? GODASH.regionalEvents() : []).forEach(function (e) { if (e.end.getTime() > Date.now()) { live[e.id] = 1; live[String(e.id).replace(/^[a-z]+:/, '')] = 1; liveN[String(e.name).toLowerCase()] = 1; } });
    /* Events that have already finished are not offered. */
    var g = (it.guesses || []).filter(function (x) { return x.eventId && (!window.GODASH || live[x.eventId] || live[String(x.eventId).replace(/^[a-z]+:/, '')] || liveN[String(x.eventTitle || '').toLowerCase()]); }).slice(0, 3);
    return '<article class="igr" data-id="' + esc(it.id) + '">'
      + '<a class="igr-img" href="' + esc(it.image) + '" target="_blank" rel="noopener"><img src="' + esc(it.image) + '" alt="' + esc(it.title || 'Infographic') + '" loading="lazy" decoding="async"></a>'
      + '<div class="igr-b"><b>' + esc(it.title || 'Untitled graphic') + '</b>' + '<small>' + esc(it.source === 'telegram' ? 'Telegram inbox' : it.source === 'discord' ? 'Discord' : it.source || 'Source unknown') + (it.publishedAt ? ' · Posted ' + esc(String(it.publishedAt).slice(0, 10)) : '') + (it.history ? ' · older post' : '') + '</small>'
      + (it.note ? '<small>' + esc(it.note) + '</small>' : '')
      + (it.text ? '<details class="igr-ocr"><summary>Read image text</summary><p>' + esc(it.text) + '</p></details>' : '')
      + (it.signals && it.signals.length ? '<div class="igr-s">' + it.signals.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') + '</div>' : '')
      + '<div class="igr-g">' + (g.length ? g.map(function (x) { return '<button type="button" class="pill all" data-ig-ok="' + esc(x.eventId) + '" data-t="' + esc(x.eventTitle) + '">Approve: ' + esc(x.eventTitle) + '</button>'; }).join('') : '<small>No likely event found.</small>') + '</div>'
      + '<div class="igr-o"><select aria-label="Choose another event"><option value="">Another event…</option>' + eventOptions() + '</select><button type="button" class="pill" data-ig-pick aria-label="Approve: ' + esc(it.title || 'Untitled graphic') + '">Approve</button><button type="button" class="pill" data-ig-no aria-label="Discard: ' + esc(it.title || 'Untitled graphic') + '">Discard</button></div>'
      + bossControls(it)
      + '<div class="igr-o"><button type="button" class="pill" data-ig-ov="week">📅 This week\'s picture</button><button type="button" class="pill" data-ig-ov="month">🗓 Month overview</button></div>'
      + (safeUrl(it.post) ? '<small><a href="' + esc(it.post) + '" target="_blank" rel="noopener noreferrer">' + (window.GOLIB.isPrivateLink(it.post) ? 'Open in Discord (owner only)' : 'Original post') + '</a>' + (it.creator ? ' · ' + esc(it.creator) : '') + '</small>' : '')
      + '</div></article>';
  }
  function render() {
    if (!isOwner()) { hideOwnerUi(); return; }
    var host = $('igreview'); if (!host) return;
    var open = items.filter(function (i) { return !isDecided(i); }).sort(function (a, b) { return String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')); });
    var dot = $('hmenu'); if (dot) dot.classList.toggle('has-new', open.length > 0);
    var sv = document.querySelector('nav.tabs button[data-tab="saved"]'); if (sv) sv.classList.toggle('has-new', open.length > 0);
    banner(open.length);
    var capNote = capped ? '<p class="igr-msg igr-cap" role="status">Showing the ' + DECISIONS_CAP + ' most recent decisions; older ones may be hidden. A picture that shows no decision here may still have one, so Discard is refused and Approve asks first.</p>' : '';
    var queueRetry = queueFailed ? '<button type="button" class="pill all" data-ig-retry="1">Retry</button>' : '';
    var linked = items.filter(function (i) { return linkedOf(i.id).length || bossTargets(i.id).length; });
    if (!decsOk) {
      host.hidden = false;
      host.innerHTML = '<datalist id="ig-boss-list">' + pokemonCatalogue.map(function (p) { return '<option value="' + esc(p[1]) + '">'; }).join('') + '</datalist><datalist id="ig-boss-mode-list"><option value="normal"><option value="shadow"><option value="dynamax"><option value="gigantamax"><option value="mega"><option value="primal"></datalist><details class="dd" open><summary>Infographic review <span class="cnt">' + open.length + '</span></summary><div class="body"><p class="igr-msg" role="alert">Could not read your saved decisions, so review is paused. Nothing can be approved or discarded until they load, so a choice you made elsewhere is never overwritten.</p>' + (msg ? '<p class="igr-msg" role="status">' + esc(msg) + '</p>' : '') + '<button type="button" class="pill all" data-ig-retry="1">Retry</button></div></details>';
      return;
    }
    if (!open.length && !msg && !capped && !linked.length) { host.hidden = true; host.innerHTML = ''; return; }
    host.hidden = false;
    var kl = document.getElementById('iglinked'), keepLinked = !!(kl && kl.open);
    host.innerHTML = '<datalist id="ig-boss-list">' + pokemonCatalogue.map(function (p) { return '<option value="' + esc(p[1]) + '">'; }).join('') + '</datalist><datalist id="ig-boss-mode-list"><option value="normal"><option value="shadow"><option value="dynamax"><option value="gigantamax"><option value="mega"><option value="primal"></datalist><details class="dd" open><summary>Infographic review <span class="cnt">' + open.length + '</span></summary><div class="body">'
      + '<p class="note" style="margin:0 0 8px">Discord and Telegram pictures appear here until you link them. Check the image text and date before approving; nothing appears on an event or Pokémon until you approve it.</p>'
      + capNote + (msg ? '<p class="igr-msg" role="status">' + esc(msg) + '</p>' : '') + open.slice(0, shown).map(card).join('') + (open.length > shown ? '<button type="button" class="pill all" data-ig-more="1">Show 10 more (' + (open.length - shown) + ' left)</button>' : '') + queueRetry + '</div></details>'
      + (linked.length ? '<details class="dd"' + (keepLinked ? ' open' : '') + ' id="iglinked"><summary>Linked infographics <span class="cnt">' + linked.length + '</span></summary><div class="body"><p class="note" style="margin:0 0 8px">Tap ✕ to unlink from one event, add more events, or discard. Changes reach the event within a few hours.</p>' + linked.map(linkedCard).join('') + '</div></details>' : '');
  }
  function send(it, status, eventId, title, note, specifiedBossTargets) {
    if (!isOwner()) { hideOwnerUi(); return; }
    if (!decsOk) { msg = 'Saved decisions could not be read, so nothing can be changed yet. Tap Retry.'; render(); return; }
    if (!pin()) { msg = 'Set your Sync PIN in Menu → Sync & accounts before reviewing.'; render(); return; }
    /* Older decisions may be hidden (list at the cap): this picture could already hold one, so overwriting it needs a yes. Discard is refused further down. */
    if (capped && status !== 'rejected' && status !== 'unlinked' && !decs[it.id] && !window.confirm('Older saved decisions are hidden, so this picture may already have a saved decision. Replace it?')) return;
    if (status === 'rejected') { if (pendingDiscard[it.id]) return; pendingDiscard[it.id] = true; }
    var targets = specifiedBossTargets === undefined ? bossTargets(it.id) : specifiedBossTargets;
    var body = { id: it.id, status: status, eventId: eventId || '', eventTitle: title || '' };
    if (status === 'approved' && targets && targets.length) body.targets = targets;
    queued(it.id, function () {
      return recheckFirst(it.id).then(function (go) {
        if (!go) return;
      /* A Discard replaces whatever the site holds, and Undo has to put that back: read it fresh first, and do not write when it cannot be read. */
      var before = status === 'rejected' ? readServer(it.id).then(function (d) { return { prev: d }; }, function (e) { return { fail: e || true }; }) : Promise.resolve({ prev: undefined });
      return before.then(function (b) {
        if (b.fail) { msg = b.fail.unknown ? 'Not discarded: ' + CAP_MSG : 'Could not check the saved decision for this picture, so it was not discarded. Try again.'; render(); return; }
        return post(body).then(function () {
          applyLocal({ id: it.id, status: status, eventId: eventId || '', eventTitle: title || '', targets: status === 'approved' ? targets : [] });
          if (status === 'rejected') { msg = ''; showUndo(it, b.prev); } else { clearUndo(it.id); msg = note || (status === 'approved' ? 'Linked. It will appear on the event after the next scheduled update.' : status === 'unlinked' ? 'Unlinked. It is back in the review list.' : 'Discarded.'); }
          render(); document.dispatchEvent(new CustomEvent('gofn-review-updated', { detail: { decided: true } }));
        });
      });
      }).catch(function (e) { msg = failMsg(e, 'Could not save that decision. Check your sync PIN and connection.'); render(); });
    }).then(function () { delete pendingDiscard[it.id]; });
  }
  function setLinks(it, list) {
    if (!list.length) return bossTargets(it.id).length ? send(it, 'approved', '', '', undefined, bossTargets(it.id)) : send(it, 'unlinked');
    send(it, 'approved', list.map(function (l) { return l.id; }).join(','), list.map(function (l) { return l.title; }).join(' | '));
  }
  function banner(n) {
    if (!isOwner()) { hideOwnerUi(); return; }
    var action = $('hireview'), count = $('igcount');
    if (action) { action.hidden = n < 1; action.classList.toggle('has-pending', n > 0); action.setAttribute('aria-label', n + ' infographic' + (n === 1 ? '' : 's') + ' waiting for review'); action.title = n + ' infographic' + (n === 1 ? '' : 's') + ' waiting for review'; }
    if (count) { count.hidden = n < 1; count.textContent = n > 99 ? '99+' : String(n); }
    var b = $('igbanner');
    if (!n) { if (b) b.hidden = true; return; }
    if (!b) { var tab = document.getElementById('tab-now'); if (!tab) return; b = document.createElement('button'); b.type = 'button'; b.id = 'igbanner'; b.className = 'igbanner'; tab.insertBefore(b, tab.firstChild); }
    b.hidden = false; b.textContent = '🖼 ' + n + ' infographic' + (n === 1 ? '' : 's') + ' waiting for your review · Review now →';
  }
  function gotoReview() {
    if (!isOwner()) return;
    var t = document.querySelector('nav.tabs button[data-tab="saved"]'); if (t) t.click();
    setTimeout(function () { var m = document.querySelector('#subnav-saved [data-sub="menu"]'); if (m) m.click(); setTimeout(function () { var h = $('igreview'); if (h && !h.hidden) h.scrollIntoView({ block: 'start' }); }, 150); }, 80);
  }
  document.addEventListener('click', function (e) { if (e.target.closest && (e.target.closest('#igbanner') || e.target.closest('#hireview'))) gotoReview(); });
  window.addEventListener('hashchange', function () { if (location.hash === '#review') gotoReview(); });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-ig-undo]')) return undoDiscard();
    if (e.target.closest && e.target.closest('[data-ig-retry]')) return retryLoad();
    if (e.target.closest && e.target.closest('[data-ig-more]')) { shown += 10; return render(); }
    var card = e.target.closest && e.target.closest('.igr'); if (!card) return;
    var it = items.filter(function (i) { return i.id === card.getAttribute('data-id'); })[0]; if (!it) return;
    var ok = e.target.closest('[data-ig-ok]');
    if (ok) return send(it, 'approved', ok.getAttribute('data-ig-ok'), ok.getAttribute('data-t'));
    var bossRemove = e.target.closest('[data-ig-boss-unlink]');
    if (bossRemove) {
      var selected = bossTargets(it.id), idx = +bossRemove.getAttribute('data-ig-boss-unlink');
      if (!Number.isInteger(idx) || idx < 0 || idx >= selected.length) return;
      var next = selected.filter(function (_, n) { return n !== idx; });
      var old = decs[it.id] || {};
      return !next.length && !old.eventId ? send(it, 'unlinked') :
        send(it, 'approved', old.eventId || '', old.eventTitle || '', undefined, next);
    }
    var bossSave = e.target.closest('[data-ig-boss-save]');
    if (bossSave) {
      var mon = chosenPokemon(card), mode = card.querySelector('[data-ig-boss-mode]'),
          form = card.querySelector('[data-ig-boss-form]');
      if (!mon || !mode || !form) { msg = 'Choose an exact Pokémon name from the list.'; return render(); }
      var validMode = ['normal','shadow','dynamax','gigantamax','mega','primal'].indexOf(mode.value) >= 0;
      var possible = formCatalogue.filter(function (f) {
        return +f[0] === +mon[0] && f[1] === form.value && bossFormCompatible(f, mode.value);
      });
      if (!validMode || (['mega','primal','gigantamax'].indexOf(mode.value) >= 0 && !form.value) || (form.value && !possible.length)) {
        msg = 'Choose an exact Pokémon form and compatible battle type.'; return render();
      }
      var target = {type:'raid-boss', pokemonId:String(mon[0]).padStart(3,'0'),
        formId:form.value || null, battleMode:mode.value};
      var current = bossTargets(it.id);
      if (!current.some(function (b) { return b.pokemonId === target.pokemonId &&
        b.formId === target.formId && b.battleMode === target.battleMode; })) current.push(target);
      var prior = decs[it.id] || {};
      return send(it, 'approved', prior.eventId || '', prior.eventTitle || '',
        'Pokémon guide approved. It will appear in Raids & Max Battles and remain after events end.', current);
    }
    var un = e.target.closest('[data-ig-unlink]');
    if (un) { var L = linkedOf(it.id), gone = L[Number(un.getAttribute('data-ig-unlink'))]; return setLinks(it, L.filter(function (x) { return x !== gone; })); }
    if (e.target.closest('[data-ig-add]')) {
      var s2 = card.querySelector('select'), o2 = s2 && s2.options[s2.selectedIndex];
      if (!o2 || !o2.value) { msg = 'Choose an event first.'; return render(); }
      var L2 = linkedOf(it.id); picks(o2).forEach(function (pk) { if (!L2.some(function (x) { return x.id === pk.id; })) L2.push(pk); });
      return setLinks(it, L2);
    }
    var ov = e.target.closest('[data-ig-ov]');
    if (ov) return send(it, ov.getAttribute('data-ig-ov'), '', '', ov.getAttribute('data-ig-ov') === 'week' ? 'Set as this week\'s picture. It shows under At a glance after the next scheduled update.' : 'Set as the month overview. It shows under At a glance after the next scheduled update.');
    var no = e.target.closest('[data-ig-no]');
    if (no) { if (pendingDiscard[it.id]) return; no.disabled = true; return send(it, 'rejected'); }
    if (e.target.closest('[data-ig-pick]')) {
      var sel = card.querySelector('select'), o = sel && sel.options[sel.selectedIndex];
      if (!o || !o.value) { msg = 'Choose an event first.'; return render(); }
      var pk = picks(o); send(it, 'approved', pk.map(function (x) { return x.id; }).join(','), pk.map(function (x) { return x.title; }).join(' | '));
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.closest && e.target.closest('[data-ig-boss-name]')) {
      var card = e.target.closest('.igr'); if (card) refreshBossForms(card);
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.closest && e.target.closest('[data-ig-boss-mode]')) {
      var card = e.target.closest('.igr'); if (card) refreshBossForms(card);
    }
  });
  /* "Check Discord now": the Worker looks at the Discord channel straight away instead of waiting for the hourly run, and says what it did. */
  /* The review box lives at the top of the Menu tab; it is created here the first time it is needed (the button must not wait for the picture list to load). */
  function ensureHost() {
    var h = $('igreview'); if (h) return h;
    var m = $('sub-menu'); if (!m) return null;
    h = document.createElement('div'); h.id = 'igreview'; h.hidden = true; m.insertBefore(h, m.firstChild); return h;
  }
  function mountDiscord() {
    if (!isOwner()) return;
    var host = ensureHost(); if (!host || $('igdiscord')) return;
    var p = document.createElement('p'); p.id = 'igdiscord'; p.className = 'note'; p.style.margin = '0 0 10px';
    p.innerHTML = '<button type="button" class="pill" id="igdiscord-btn">Check Discord now</button> <span id="igdiscord-msg" role="status"></span>';
    host.parentNode.insertBefore(p, host);
    $('igdiscord-btn').addEventListener('click', function () {
      var out = $('igdiscord-msg'), b = $('igdiscord-btn');
      if (!isOwner() || !pin()) { out.textContent = 'Set your Sync PIN in Menu → Sync & accounts first.'; return; }
      b.disabled = true; out.textContent = 'Checking…';
      fetch('/api/jobs/run?job=discord', { method: 'POST', headers: { 'x-pin': pin() } })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) { out.textContent = !x.ok ? 'Could not check: ' + (x.j.error || 'try again') : (x.j.sent && x.j.sent.length ? 'Sent ' + x.j.sent.length + ' picture' + (x.j.sent.length === 1 ? '' : 's') + ' to Telegram.' : 'Nothing to send: ' + (x.j.note || 'no new pictures') + '.'); })
        .catch(function () { out.textContent = 'Could not reach the site.'; })
        .then(function () { b.disabled = false; });
    });
  }
  function retryLoad() {
    if (!isOwner()) { hideOwnerUi(); return; }
    /* Re-fetch both initial resources: the queue can hang independently of saved decisions. */
    loadedForOwner = false;
    load();
  }
  function load() {
    if (!isOwner()) { hideOwnerUi(); return; }
    if (loadedForOwner) return;
    loadedForOwner = true;
    var token = ++loadToken;
    mountDiscord();
    Promise.all([
      timedFetch('/infographic-queue.json?t=' + Math.floor(Date.now() / 600000)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
        if (!j || !Array.isArray(j.items)) throw new Error('bad queue');
        return { items: j.items };
      }).catch(function () { return { items: [], failed: true }; }),
      /* A failed or hung read is NOT an empty list: without saved decisions nothing may be changed (see render). */
      timedFetch('/api/ig-decisions').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) { return Array.isArray(j && j.decisions) ? j : null; }).catch(function () { return null; })
    ]).then(function (R) {
      if (token !== loadToken || !isOwner()) { hideOwnerUi(); return; }
      items = dedupeItems(R[0].items); queueFailed = !!R[0].failed;
      msg = queueFailed ? 'Could not load the infographic queue. Check your connection and tap Retry.' : '';
      decsOk = !!R[1]; if (R[1]) takeDecisions(R[1].decisions);
      if (!ensureHost()) return;
      render(); document.dispatchEvent(new Event('gofn-review-updated'));
      // Catalogues are optional; unknown Pokémon names never get guessed IDs.
      Promise.all([
        timedFetch('/dex.json').then(function (r) { return r.ok ? r.json() : []; }),
        timedFetch('/forms.json').then(function (r) { return r.ok ? r.json() : {}; })
      ]).then(function (catalogue) {
        if (token !== loadToken || !isOwner()) return;
        pokemonCatalogue = Array.isArray(catalogue[0]) ? catalogue[0] : [];
        formCatalogue = Array.isArray(catalogue[1] && catalogue[1].f) ? catalogue[1].f : [];
        render();
      }).catch(function () { /* do not guess when the catalogue cannot load */ });
      if (location.hash === '#review') gotoReview();
    });
  }
  document.addEventListener('gofn-owner-state', function (e) {
    if (e.detail && e.detail.role === 'owner') load(); else hideOwnerUi();
  });
  if (window.GODASH) load(); else document.addEventListener('DOMContentLoaded', load);
})();
