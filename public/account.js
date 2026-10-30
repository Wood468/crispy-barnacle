/* Accounts. Invite-only: the owner makes an invite code, the invited person creates an email + password account, and their
   marks (dex, hundos, best attackers, hidden events) are kept privately under it. The owner keeps using the sync PIN.
   The session lives in an HttpOnly cookie; this file only remembers the email, to know whether to sync. */
(function () {
  'use strict';
  var KEY = 'gofn-acct';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function get() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function put(v) { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { } }
  function pinned() { try { return !!localStorage.getItem('gofn-pin'); } catch (e) { return false; } }
  function identity(email) {
    if (pinned()) return 'owner';
    var value = String(email || get()).trim().toLowerCase();
    return value ? 'account:' + value : 'guest';
  }
  function switchIdentity(target, mergeGuest) {
    try { if (window.GOLOCAL) window.GOLOCAL.activate(localStorage, target, !!mergeGuest); } catch (e) { }
  }
  // Establish the active partition before app.js reads the Dex and user-state keys.
  switchIdentity(identity(), false);
  function role() { document.documentElement.setAttribute('data-role', get() && !pinned() ? 'member' : 'owner'); }
  role();
  function post(path, body) {
    return fetch('/api/auth/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  var mode = 'in', msg = '', invite = '', made = '';
  function pinHdr() { try { return { 'content-type': 'application/json', 'x-pin': localStorage.getItem('gofn-pin') || '' }; } catch (e) { return { 'content-type': 'application/json' }; } }
  function loadUsers() {
    fetch('/api/auth/users', { method: 'POST', headers: pinHdr(), body: '{}' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var h = document.getElementById('acctUsers'); if (!h || !j) return;
      h.innerHTML = (j.users || []).length ? '<b>Accounts</b>' + j.users.map(function (u) { return '<div class="acct-u"><span>' + esc(u.email) + '</span><button type="button" class="pill" data-acct="rm" data-email="' + esc(u.email) + '">Remove</button></div>'; }).join('') : 'No accounts yet.';
    }).catch(function () { });
  }
  function render() {
    var host = document.getElementById('acct'); if (!host) return;
    var email = get();
    if (email && !pinned()) {
      host.innerHTML = '<p class="note" style="margin:0">Signed in as <b>' + esc(email) + '</b>. Your marks are private to this account. <button type="button" class="pill" data-acct="out">Sign out</button></p>';
      return;
    }
    if (pinned()) {
      host.innerHTML = '<details class="acctbox"><summary>People you have invited</summary><p class="note">Make a one-time invite code (valid 14 days) and send it with the site address. They create their own email and password, and keep their own marks. Events and infographics are shared.</p>'
        + '<form class="acct-f" data-acct-form="create"><b>Add a person yourself</b><label>Email<input name="email" type="email" required></label><label>Password for them (at least 10 characters; they can be told it, and you can change it any time by adding the same email again)<input name="password" type="text" autocomplete="off" minlength="10" required></label><button type="submit" class="pill all">Add person / set password</button></form>'
        + (made ? '<p class="igr-msg" role="status">' + esc(made) + '</p>' : '')
        + '<form class="acct-f" data-acct-form="invite"><label>Who is it for? (just a note for you)<input name="note" maxlength="60" placeholder="e.g. Sam"></label><button type="submit" class="pill all">Create invite code</button></form>'
        + (invite ? '<p class="igr-msg" role="status">Invite code: <b class="mono">' + esc(invite) + '</b><br>Send this with ' + esc(location.origin) + ' (valid 14 days, works once).</p>' : '')
        + '<div id="acctUsers" class="note"></div></details>';
      loadUsers(); return;
    }
    host.innerHTML = '<details class="acctbox"' + (msg ? ' open' : '') + '><summary>Sign in or create an account</summary>'
      + '<div class="acct-tabs"><button type="button" class="pill' + (mode === 'in' ? ' all' : '') + '" data-acct="m-in">Sign in</button><button type="button" class="pill' + (mode === 'up' ? ' all' : '') + '" data-acct="m-up">I have an invite</button></div>'
      + '<form class="acct-f" data-acct-form="' + mode + '">'
      + (mode === 'up' ? '<label>Invite code<input name="invite" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="xxxx-xxxx-xxxx-xxxx" required></label>' : '')
      + '<label>Email<input name="email" type="email" autocomplete="email" required></label>'
      + '<label>Password' + (mode === 'up' ? ' (at least 10 characters)' : '') + '<input name="password" type="password" autocomplete="' + (mode === 'up' ? 'new-password' : 'current-password') + '" minlength="' + (mode === 'up' ? 10 : 1) + '" required></label>'
      + '<button type="submit" class="pill all">' + (mode === 'up' ? 'Create account' : 'Sign in') + '</button></form>'
      + (msg ? '<p class="igr-msg" role="alert">' + esc(msg) + '</p>' : '') + '</details>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-acct]'); if (!b) return;
    var a = b.getAttribute('data-acct');
    if (a === 'm-in' || a === 'm-up') { mode = a === 'm-up' ? 'up' : 'in'; msg = ''; render(); var d = document.querySelector('.acctbox'); if (d) d.open = true; }
    if (a === 'rm') { var em = b.getAttribute('data-email'); if (b.getAttribute('data-sure') !== '1') { b.setAttribute('data-sure', '1'); b.textContent = 'Tap again to delete ' + em + ' and their marks'; return; } fetch('/api/auth/remove', { method: 'POST', headers: pinHdr(), body: JSON.stringify({ email: em }) }).then(loadUsers); }
    if (a === 'out') post('logout').catch(function () { }).then(function () { switchIdentity('guest', false); put(''); role(); location.reload(); });
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest && e.target.closest('[data-acct-form]'); if (!f) return;
    e.preventDefault();
    var v = {}; Array.prototype.forEach.call(f.elements, function (el) { if (el.name) v[el.name] = el.value; });
    if (f.getAttribute('data-acct-form') === 'create') { fetch('/api/auth/create', { method: 'POST', headers: pinHdr(), body: JSON.stringify(v) }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (r) { made = r.ok ? (r.j.created ? 'Added ' : 'New password set for ') + r.j.email + '.' : (r.j.error || 'That did not work.'); render(); var d = document.querySelector('.acctbox'); if (d) d.open = true; }); return; }
    if (f.getAttribute('data-acct-form') === 'invite') { fetch('/api/auth/invite', { method: 'POST', headers: pinHdr(), body: JSON.stringify({ note: v.note }) }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { invite = j && j.code || ''; render(); var d = document.querySelector('.acctbox'); if (d) d.open = true; }); return; }
    post(f.getAttribute('data-acct-form') === 'up' ? 'register' : 'login', v).then(function (r) {
      if (!r.ok) { msg = (r.j && r.j.error) || 'That did not work. Try again.'; render(); return; }
      var email = r.j.email || v.email;
      switchIdentity(identity(email), true);
      put(email); role(); location.reload();
    }).catch(function () { msg = 'Could not reach the server. Try again.'; render(); });
  });
  // If the session ran out (or the cookie was cleared), say so rather than silently syncing nothing.
  if (get() && !pinned()) fetch('/api/auth/me').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (j && j.signedIn === false) { switchIdentity('guest', false); put(''); role(); location.reload(); }
  }).catch(function () { });
  document.addEventListener('gofn-identity-change', function () { switchIdentity(identity(), true); });
  /* Trainer name and team: asked once after the first sign-in, shown under the title, editable by tapping it.
     Kept with the rest of your private marks (pref:trainer, pref:team), so it follows the account across devices. */
  var TEAMS = { mystic: ['Mystic', '#3B82F6', 'Blue'], valor: ['Valor', '#EF4444', 'Red'], instinct: ['Instinct', '#FACC15', 'Yellow'] };
  function dash() { return window.GODASH && window.GODASH.usGet ? window.GODASH : null; }
  /* Simple original emblems in each team's colour (a shield with an ice crystal, flame or bolt). They are not the official team logos. */
  var EMB = {
    mystic: '<path d="M12 6v12M6.8 9l10.4 6M17.2 9L6.8 15" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
    valor: '<path d="M12 5.5c.8 2.6 3.6 3.9 3.6 7a3.6 3.6 0 01-7.2 0c0-1.5.7-2.3 1.5-3.2.2 1 .6 1.5 1.1 1.7-.1-2.2.3-4.3 1-5.5z" fill="#fff"/>',
    instinct: '<path d="M13 5l-5 8h3.4L10.5 19l5.5-8.4h-3.5z" fill="#1D1700"/>'
  };
  var EMBIMG = { mystic: 'https://archives.bulbagarden.net/media/upload/thumb/f/f4/Team_Mystic_emblem.png/80px-Team_Mystic_emblem.png', valor: 'https://archives.bulbagarden.net/media/upload/thumb/e/e9/Team_Valor_emblem.png/80px-Team_Valor_emblem.png', instinct: 'https://archives.bulbagarden.net/media/upload/thumb/0/06/Team_Instinct_emblem.png/80px-Team_Instinct_emblem.png' };
  /* The official team emblems (Bulbagarden Archives; artwork belongs to Niantic) with my own plain shield as the fallback if the picture does not load. */
  function shield(k, size) {
    var t = TEAMS[k];
    return '<svg class="temb" width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6.5c0 5-3.4 8.6-8 10.5-4.6-1.9-8-5.5-8-10.5V5z" fill="' + t[1] + '"/>' + EMB[k] + '</svg>';
  }
  function emblem(k, size) {
    if (!TEAMS[k]) return '';
    var n = size || 22;
    return '<span class="temb-w" style="width:' + n + 'px;height:' + n + 'px" data-fb="' + esc(shield(k, n)) + '"><img class="temb" src="' + EMBIMG[k] + '" alt="" width="' + n + '" height="' + n + '" loading="lazy" referrerpolicy="no-referrer"></span>';
  }
  /* If an emblem picture does not load, the plain shield takes its place. */
  document.addEventListener('error', function (e) {
    var i = e.target; if (!i || i.tagName !== 'IMG' || !i.classList.contains('temb')) return;
    var w = i.parentNode; if (w && w.getAttribute('data-fb')) { var d = document.createElement('div'); d.innerHTML = w.getAttribute('data-fb'); w.replaceChild(d.firstChild, i); }
  }, true);
  function who() { var d = dash(); return d ? { name: String(d.usGet('pref:trainer') || ''), team: String(d.usGet('pref:team') || '') } : { name: '', team: '' }; }
  function badge() {
    var w = who(), host = document.getElementById('who');
    if (!host) { var date = document.getElementById('today'); if (!date) return; host = document.createElement('button'); host.type = 'button'; host.id = 'who'; host.className = 'who'; host.addEventListener('click', function () { profile(true); }); date.parentNode.appendChild(host); }
    var t = TEAMS[w.team];
    host.hidden = !(w.name || t);
    host.innerHTML = (t ? emblem(w.team, 18) : '') + '<span>' + esc(w.name || 'Trainer') + (t ? ' · Team ' + esc(t[0]) : '') + '</span>';
    host.title = 'Edit your trainer name and team';
  }
  function profile(force) {
    var d = dash(); if (!d || document.getElementById('goprof')) return;
    var w = who(), team = w.team;
    var o = document.createElement('div'); o.id = 'goprof'; o.className = 'goprof'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Your trainer profile');
    o.innerHTML = '<form class="goprof-p"><h2>' + (force ? 'Your trainer profile' : 'Welcome, Trainer') + '</h2><p class="note" style="margin:0">Pick the name and team you play as. It shows under the title and stays with your account.</p>'
      + '<label>Trainer name<input name="name" maxlength="20" autocomplete="nickname" value="' + esc(w.name) + '" placeholder="Your in-game name" required></label>'
      + '<div class="goprof-t" role="radiogroup" aria-label="Team">' + Object.keys(TEAMS).map(function (k) { return '<button type="button" role="radio" data-team="' + k + '" aria-checked="' + (team === k) + '" style="--tc:' + TEAMS[k][1] + '">' + emblem(k, 36) + TEAMS[k][0] + '<small>' + TEAMS[k][2] + '</small></button>'; }).join('') + '</div>'
      + '<div class="goprof-b"><button type="submit" class="pill all">Save</button><button type="button" class="pill" data-skip>' + (force ? 'Cancel' : 'Not now') + '</button></div></form>';
    document.body.appendChild(o);
    var f = o.querySelector('form');
    o.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-team]');
      if (b) { team = b.getAttribute('data-team'); Array.prototype.forEach.call(o.querySelectorAll('[data-team]'), function (x) { x.setAttribute('aria-checked', String(x === b)); }); }
      if (e.target.closest && e.target.closest('[data-skip]')) { if (!force) { try { sessionStorage.setItem('gofn-prof-skip', '1'); } catch (er) { } } o.remove(); }
    });
    f.addEventListener('submit', function (e) { e.preventDefault(); var n = f.elements.name.value.trim().slice(0, 20); if (!n) return; d.usSet('pref:trainer', n); d.usSet('pref:team', team || undefined); o.remove(); badge(); });
    var inp = f.elements.name; if (inp) inp.focus();
  }
  // Wait for the first sync to finish (so an existing profile is not asked for again), then ask once.
  (function wait(n) {
    var d = dash(); if (!d) { if (n < 40) setTimeout(function () { wait(n + 1); }, 400); return; }
    if (!(get() || pinned())) { badge(); return; }
    if (d.usStatus() !== 'synced' && n < 30) { setTimeout(function () { wait(n + 1); }, 500); return; }
    badge();
    var skipped = false; try { skipped = sessionStorage.getItem('gofn-prof-skip') === '1'; } catch (e) { }
    if (d.usStatus() === 'synced' && !who().name && !skipped) profile(false);
  })(0);
  document.addEventListener('gofn-state', badge);
  window.GOACCT = { email: get, render: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
