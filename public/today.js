/* Today (Release 1): builds the redesigned Today markup from data supplied by dash.js.
   Order, top to bottom: Today at a Glance, confirmed shiny boosts, Happening now, Starting soon (24h), Next 7 days, Season / GO Pass.
   Pure string building: dash.js owns data, clock and event delegation (data-open opens Event Details). */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./today-logic.js') : root.GOTODAYLOGIC);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GOTODAY = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (LOGIC) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var SPARK = '<svg class="t1-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" fill="currentColor"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor"/></svg>';
  var ARROW = '<svg class="t1-ico t1-up" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 8h-4.5v8h-5v-8H5z" fill="currentColor"/></svg>';
  var PIN = '<svg class="t1-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12zm0-9.2a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6z" fill="currentColor"/></svg>';
  var CLOCK = '<svg class="t1-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5.5l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var DOTS = '<svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>';

  /* A shiny badge: boosted (confirmed) = gold up-arrow + sparkle; ordinary availability = sparkle alone. */
  function shinyBadge(kind) {
    if (kind === 'boosted') return '<span class="t1-shiny t1-shiny--boost" role="img" aria-label="Shiny boost confirmed">' + SPARK + ARROW + '</span>';
    if (kind === 'available') return '<span class="t1-shiny" role="img" aria-label="Shiny available">' + SPARK + '</span>';
    return '';
  }
  function raidTier(ev) {
    var n = String(ev.name || ''), m = /(\d)-star/i.exec(n);
    if (m) return { stars: +m[1], label: m[1] + '★' };
    if (/mega raid|mega edition|\bmega\b/i.test(n) && ev.kind === 'raid') return { stars: 0, label: 'Mega' };
    if (/shadow/i.test(n) && ev.kind === 'raid') return { stars: 0, label: 'Shadow' };
    if (/raid hour/i.test(n)) return { stars: 0, label: 'Raid Hour' };
    if (ev.kind === 'max' || /max/i.test(n)) return { stars: 0, label: 'Max Battle' };
    return null;
  }
  /* Featured Pokémon for a card: unique, separate tiles for "A and B" strings, shiny duplicates and bases of a listed Mega dropped. */
  function pokemonFor(ev, limit) {
    var seen = {}, out = [];
    (ev.featured || []).forEach(function (f) {
      if (!f || !f.name || f.role === 'shiny_form') return;
      var parts = LOGIC.splitNames(f.name);
      parts.forEach(function (name) {
        var key = name.toLowerCase();
        if (seen[key]) return; seen[key] = 1;
        out.push(Object.assign({}, f, { name: name }));
      });
    });
    var megaBases = {};
    out.forEach(function (f) { var c = LOGIC.classifyArt(f.name); if (c.kind === 'mega' || c.kind === 'primal') megaBases[c.base.toLowerCase()] = 1; });
    out = out.filter(function (f) { return !(LOGIC.classifyArt(f.name).kind === 'base' && megaBases[f.name.toLowerCase()] && ev.kind === 'raid'); });
    return out.slice(0, limit || 3);
  }
  function artFor(ctx, ev, f, cls) { return ctx.monArt(ev, f, cls || 'ea'); }
  function menuButton(ev, label) {
    return '<button type="button" class="t1-more" data-t1-menu="' + esc(ev.id) + '" aria-haspopup="menu" aria-expanded="false" aria-label="' + esc('More actions for ' + label) + '">' + DOTS + '</button>';
  }
  function timeLine(ctx, ev, live) { return LOGIC.countdownText(live ? +ev.end : +ev.start, +ctx.now, live); }
  /* Countdown text is patched in place every minute (see dash.js) so focus and open menus are never disturbed. */
  function cdSpan(ctx, ts, live) { return '<span class="t1-cd" data-ts="' + (+ts) + '" data-live="' + (live ? 1 : 0) + '">' + esc(LOGIC.countdownText(+ts, +ctx.now, live)) + '</span>'; }
  function placeChip(ctx, ev) {
    var place = ev.region && !/^global$/i.test(ev.region) ? ev.region : '';
    return place ? '<span class="t1-place">' + PIN + '<span>' + esc(place) + '</span>' + (ctx.overseas(ev) ? '<em>Overseas</em>' : '') + '</span>' : '';
  }
  function shinyKindFor(ctx, ev) {
    if (ev.tags && ev.tags.indexOf('Boosted shiny odds') > -1) return 'boosted';
    if (ev.tags && (ev.tags.indexOf('Shiny available') > -1 || ev.tags.indexOf('New shiny') > -1)) return 'available';
    return '';
  }
  function dataAttrs(ev) { return ' data-id="' + esc(ev.id) + '" data-start="' + esc(new Date(+ev.start).toISOString()) + '" data-end="' + esc(new Date(+ev.end).toISOString()) + '"'; }

  /* Same artwork rule as Event Details: verified official banner, else a category-themed banner with one small featured accent. */
  function bannerFor(ctx, ev, mons) {
    var A = (typeof GOEVENTART !== 'undefined') ? GOEVENTART : null;
    if (!A) return '<div class="t1-major-art" aria-hidden="true">' + (mons.length ? mons.map(function (f) { return '<span class="t1-mon">' + artFor(ctx, ev, f, 'ea') + '</span>'; }).join('') : ctx.fallbackArt(ev)) + '</div>';
    var art = A.resolve({ name: ev.name, kind: ev.kind, region: ev.region || '', start: ev.start, end: ev.end }, ev.img ? [{ url: ev.img, pageUrl: ev.artPageUrl || ev.link || '' }] : []);
    var accent = mons.length ? '<span class="ev-art-mon">' + artFor(ctx, ev, mons[0], 'ea') + '</span>' : '';
    return A.banner(art, { ev: ev, accent: accent, aspect: '2.4 / 1', fit: 'cover', cls: 't1-banner' });
  }
  function cardMajor(ctx, ev, live) {
    var k = ctx.kindOf(ev), mons = pokemonFor(ev, 3), cd = timeLine(ctx, ev, live);
    var names = mons.map(function (f) { return f.name; }).join(' \u00b7 ');
    return '<article class="t1-card t1-major' + (live ? ' is-live' : '') + '" style="--k:' + k[1] + '"' + dataAttrs(ev) + '>'
      + '<div class="t1-major-art" aria-hidden="true">' + bannerFor(ctx, ev, mons) + '</div>'
      + '<button type="button" class="t1-open" data-open="' + esc(ev.id) + '" aria-label="' + esc('Open ' + ev.name + '. ' + cd) + '">'
      + '<span class="t1-badges">' + (live ? '<span class="t1-live">LIVE NOW</span>' : '') + '<span class="t1-kind">' + esc(k[0]) + '</span>' + shinyBadge(shinyKindFor(ctx, ev)) + '<span class="t1-count">' + CLOCK + cdSpan(ctx, live ? ev.end : ev.start, live) + '</span></span>'
      + '<strong class="t1-title">' + esc(ev.name) + '</strong>'
      + placeChip(ctx, ev)
      + (names ? '<span class="t1-feat">' + esc(names) + '</span>' : '')
      + '</button>' + menuButton(ev, ev.name) + '</article>';
  }
  function cardRaid(ctx, ev, live) {
    var k = ctx.kindOf(ev), mons = pokemonFor(ev, 3), tier = raidTier(ev), cd = timeLine(ctx, ev, live);
    var art = mons.map(function (f) { return '<span class="t1-mon">' + artFor(ctx, ev, f, 'ea') + '</span>'; }).join('') || ctx.fallbackArt(ev);
    var stars = tier && tier.stars ? '<span class="t1-stars" role="img" aria-label="' + tier.stars + ' star raid">' + new Array(tier.stars + 1).join('★') + '</span>' : tier ? '<span class="t1-tier">' + esc(tier.label) + '</span>' : '';
    return '<article class="t1-card t1-raid' + (live ? ' is-live' : '') + '" style="--k:' + k[1] + '"' + dataAttrs(ev) + '>'
      + '<div class="t1-raid-art" aria-hidden="true">' + art + '</div>'
      + '<button type="button" class="t1-open" data-open="' + esc(ev.id) + '" aria-label="' + esc('Open ' + ev.name + '. ' + cd) + '">'
      + '<span class="t1-badges">' + (live ? '<span class="t1-live">LIVE NOW</span>' : '') + stars + shinyBadge(shinyKindFor(ctx, ev)) + '</span>'
      + '<strong class="t1-title">' + esc(ev.name) + '</strong>'
      + placeChip(ctx, ev)
      + '<span class="t1-count">' + CLOCK + cdSpan(ctx, live ? ev.end : ev.start, live) + '</span>'
      + '</button>' + menuButton(ev, ev.name) + '</article>';
  }
  function cardMinor(ctx, ev, live) {
    var k = ctx.kindOf(ev), mons = pokemonFor(ev, 1), cd = timeLine(ctx, ev, live);
    var art = mons.length ? artFor(ctx, ev, mons[0], 'ea') : '';
    return '<article class="t1-card t1-minor' + (live ? ' is-live' : '') + '" style="--k:' + k[1] + '"' + dataAttrs(ev) + '>'
      + '<span class="t1-minor-art" aria-hidden="true">' + art + '</span>'
      + '<button type="button" class="t1-open" data-open="' + esc(ev.id) + '" aria-label="' + esc('Open ' + ev.name + '. ' + cd) + '">'
      + '<strong class="t1-title">' + esc(ev.name) + '</strong>'
      + '<span class="t1-sub">' + (ev.region && !/^global$/i.test(ev.region) ? esc(ev.region) + (ctx.overseas(ev) ? ' · Overseas' : '') + ' · ' : '') + esc(k[0]) + ' · ' + cdSpan(ctx, live ? ev.end : ev.start, live) + '</span>'
      + '</button>' + shinyBadge(shinyKindFor(ctx, ev)) + menuButton(ev, ev.name) + '</article>';
  }
  function card(ctx, ev, live) {
    var type = LOGIC.cardType({ kind: ev.kind, name: ev.name, featuredCount: pokemonFor(ev, 9).length, span: +ev.end - +ev.start, tags: ev.tags });
    /* A raid-kind event that has a verified official banner is that event's own artwork: show it like every other bannered event. */
    if (type === 'raid' && ev.img && typeof GOEVENTART !== 'undefined' && GOEVENTART.resolve({ name: ev.name, kind: ev.kind, region: ev.region || '', start: ev.start, end: ev.end }, [{ url: ev.img, pageUrl: ev.artPageUrl || ev.link || '' }]).kind === 'official') type = 'major';
    return type === 'major' ? cardMajor(ctx, ev, live) : type === 'raid' ? cardRaid(ctx, ev, live) : cardMinor(ctx, ev, live);
  }
  /* In-person records from the world list that no feed card already covers: always a visible row with its location. */
  function regRow(ctx, r, live) {
    var cd = r.ongoing ? 'Ongoing · no announced end' : LOGIC.countdownText(live ? +r.end : +r.start, +ctx.now, live);
    var clock = r.ongoing ? '<span class="t1-cd t1-ongoing">Ongoing · no announced end</span>' : cdSpan(ctx, live ? r.end : r.start, live);
    var open = r.openId ? ' data-open="' + esc(r.openId) + '"' : '';
    var tag = r.openId ? 'button type="button"' : 'a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer"';
    var end = r.openId ? 'button' : 'a';
    return '<article class="t1-card t1-minor t1-reg' + (live ? ' is-live' : '') + '" style="--k:var(--color-kind-in-person)" data-id="' + esc(r.id) + '">'
      + '<span class="t1-minor-art t1-reg-ico" aria-hidden="true">' + PIN + '</span>'
      + '<' + tag + ' class="t1-open"' + open + ' aria-label="' + esc('Open ' + r.name + ', ' + r.place + '. ' + cd) + '">'
      + '<strong class="t1-title">' + esc(r.name) + '</strong>'
      + '<span class="t1-sub">' + esc(r.place) + (r.overseas ? ' · Overseas' : '') + (r.inPerson ? ' · In person · ' : r.global ? ' · Global · ' : ' · Regional, in game · ') + clock + '</span>'
      + '</' + end + '>' + menuButton(r, r.name) + '</article>';
  }
  function weekRow(ctx, ev) {
    var days = Math.max(1, Math.round((+ev.start - +ctx.now) / 864e5));
    var k = ctx.kindOf(ev), when = ctx.dayLabel(ev.start);
    return '<article class="t1-week" style="--k:' + k[1] + '"' + dataAttrs(ev) + '><button type="button" class="t1-open" data-open="' + esc(ev.id) + '" aria-label="' + esc('Open ' + ev.name + '. Starts ' + when + ', in ' + days + ' days') + '">'
      + '<span class="t1-week-main"><strong class="t1-title">' + esc(ev.name) + '</strong><span class="t1-sub">' + esc(when) + ' · ' + esc(k[0]) + (ev.region && !/^global$/i.test(ev.region) ? ' · ' + esc(ev.region) : '') + '</span></span>'
      + '<span class="t1-days" aria-hidden="true">' + days + 'd</span></button>' + menuButton(ev, ev.name) + '</article>';
  }
  function regWeekRow(ctx, r) {
    var days = Math.max(1, Math.round((+r.start - +ctx.now) / 864e5)), when = ctx.dayLabel(r.start);
    var tag = r.openId ? 'button type="button" data-open="' + esc(r.openId) + '"' : 'a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer"', end = r.openId ? 'button' : 'a';
    return '<article class="t1-week" style="--k:var(--color-kind-in-person)" data-id="' + esc(r.id) + '"><' + tag + ' class="t1-open" aria-label="' + esc('Open ' + r.name + ', ' + r.place + '. Starts ' + when + ', in ' + days + ' days') + '">'
      + '<span class="t1-week-main"><strong class="t1-title">' + esc(r.name) + '</strong><span class="t1-sub">' + esc(when) + ' · In person · ' + esc(r.place) + (r.overseas ? ' · Overseas' : '') + '</span></span>'
      + '<span class="t1-days" aria-hidden="true">' + days + 'd</span></' + end + '>' + menuButton(r, r.name) + '</article>';
  }

  function endingRow(ctx, d) {
    var title = d.name || 'Ending soon', what = [d.title, d.qualifier].filter(Boolean).join(' · ');
    var src = d.url && /^https:\/\//.test(d.url) ? '<a class="t1-ending-src" href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc('Source: ' + (d.source || 'link') + ' (opens in a new tab)') + '">Source</a>' : '';
    return '<article class="t1-card t1-ending" style="--k:var(--color-status-caution)" data-ending="' + esc(d.id) + '"><span class="t1-ending-ico" aria-hidden="true">' + CLOCK + '</span>'
      + '<div class="t1-ending-body"><strong class="t1-title">' + esc(title) + '</strong><span class="t1-sub">' + esc(what) + (what ? ' · ' : '') + cdSpan(ctx, d.end, true) + '</span></div>' + src + '</article>';
  }
  function boostTile(ctx, r) {
    var f = Object.assign({}, r.art, { name: r.name });
    return '<li class="t1-boost"><button type="button" class="t1-open" data-open="' + esc(r.eventId) + '" aria-label="' + esc(r.name + ' shiny boost confirmed, in ' + r.eventName) + '">'
      + '<span class="t1-boost-art">' + ctx.monArt(r.event, f, 'ea') + shinyBadge('boosted') + '</span>'
      + '<span class="t1-boost-name">' + esc(r.name) + '</span>' + (r.live ? '<span class="t1-boost-end">' + cdSpan(ctx, r.event.end, true) + '</span>' : '<span class="t1-boost-end">' + cdSpan(ctx, r.event.start, false) + '</span>') + '</button></li>';
  }
  function section(id, title, count, inner, extra) {
    return '<section class="t1-sec" id="' + id + '" aria-labelledby="' + id + '-h"><div class="t1-sec-head"><h2 id="' + id + '-h">' + esc(title) + '</h2>' + (extra || '') + (count != null ? '<span class="t1-count-pill">' + count + '</span>' : '') + '</div>' + inner + '</section>';
  }
  function capped(id, items, limit, label) {
    if (items.length <= limit) return items.join('');
    return items.slice(0, limit).join('') + '<div class="t1-more-wrap" data-t1-capped="' + id + '" hidden>' + items.slice(limit).join('') + '</div>'
      + '<button type="button" class="t1-showmore" data-t1-toggle="' + id + '" aria-expanded="false">Show ' + (items.length - limit) + ' more ' + esc(label) + '</button>';
  }

  /* Whole Today view. ctx supplies: now, live[], soon[], week[], regLive[], regSoon[], regWeek[], boosts{live[],upcoming[]},
     seasons[], done (list of {key,id,start}), hidden (list of {key,id,start}), kindOf, monArt, fallbackArt, overseas, dayLabel. */
  function render(ctx) {
    var live = ctx.live, soon = ctx.soon, rank = { major: 0, raid: 1, minor: 2 };
    function typeOf(ev) { return LOGIC.cardType({ kind: ev.kind, name: ev.name, featuredCount: pokemonFor(ev, 9).length, span: +ev.end - +ev.start, tags: ev.tags }); }
    var liveSorted = live.slice().sort(function (a, b) { return rank[typeOf(a)] - rank[typeOf(b)] || +a.end - +b.end; });
    var liveCards = liveSorted.map(function (e) { return card(ctx, e, true); }).concat(ctx.regLive.map(function (r) { return regRow(ctx, r, true); }));
    var soonCards = soon.map(function (e) { return card(ctx, e, false); }).concat(ctx.regSoon.map(function (r) { return regRow(ctx, r, false); }));
    var weekCards = ctx.week.map(function (e) { return weekRow(ctx, e); }).concat(ctx.regWeek.map(function (r) { return regWeekRow(ctx, r); }));
    var liveCount = live.length + ctx.regLive.length, soonCount = soon.length + ctx.regSoon.length, boostCount = ctx.boosts.live.length;
    var h = '';
    h += '<section class="t1-glance" aria-labelledby="t1-glance-h"><h2 id="t1-glance-h" class="t1-h-main">Today at a Glance</h2><ul class="t1-tiles">'
      + '<li class="t1-tile t1-tile--live"><b>' + liveCount + '</b><span>Live</span></li>'
      + '<li class="t1-tile t1-tile--shiny"><b>' + boostCount + '</b><span>Shiny boosts' + (boostCount ? ' ' + ARROW : '') + '</span></li>'
      + '<li class="t1-tile t1-tile--soon"><b>' + soonCount + '</b><span>Next 24h</span></li></ul></section>';
    if (boostCount) {
      h += section('t1-boosts', 'Shiny boosts live', null, '<ul class="t1-boost-rail" role="list" aria-label="Currently active, confirmed shiny boosts">' + ctx.boosts.live.map(function (r) { return boostTile(ctx, r); }).join('') + '</ul>');
    } else {
      h += '<p class="t1-empty-line" role="status">' + SPARK + '<span>No confirmed shiny boosts live</span></p>';
    }
    if (ctx.boosts.upcoming.length) {
      h += section('t1-boosts-soon', 'Shiny boosts coming up', null, '<ul class="t1-boost-rail" role="list" aria-label="Upcoming confirmed shiny boosts">' + ctx.boosts.upcoming.map(function (r) { return boostTile(ctx, r); }).join('') + '</ul>');
    }
    h += section('t1-live', 'Happening now', liveCount, liveCards.length ? '<div class="t1-list">' + capped('live', liveCards, 6, 'happening now') + '</div>' : '<p class="t1-empty">Nothing is live right now.</p>');
    if (ctx.ending && ctx.ending.length) h += section('t1-ending', 'Ending soon', ctx.ending.length, '<div class="t1-list t1-ending-list">' + capped('ending', ctx.ending.map(function (d) { return endingRow(ctx, d); }), 3, 'ending soon') + '</div>');
    h += section('t1-soon', 'Starting soon', soonCount, (soonCards.length ? '<div class="t1-list">' + capped('soon', soonCards, 5, 'starting soon') + '</div>' : '<p class="t1-empty">Nothing starts in the next 24 hours.</p>'), '<span class="t1-sec-note">Next 24 hours</span>');
    h += section('t1-week', 'Next 7 days', null, weekCards.length ? '<div class="t1-week-list">' + capped('week', weekCards, 6, 'this week') + '</div><button type="button" class="t1-seeall" data-quick-go="events">See all in Schedule <span aria-hidden="true">›</span></button>' : '<p class="t1-empty">No further events in the next seven days.</p>');
    if (ctx.seasons.length) {
      h += '<section class="t1-sec t1-season" id="t1-season" aria-labelledby="t1-season-h"><div class="t1-sec-head"><h2 id="t1-season-h">Season &amp; GO Pass</h2></div><ul class="t1-season-list">'
        + ctx.seasons.map(function (s) { return '<li><button type="button" class="t1-open" data-open="' + esc(s.id) + '"><span class="t1-season-kind">' + esc(s.label) + '</span><span class="t1-season-name">' + esc(s.name) + '</span><span class="t1-season-days">' + s.days + (s.days === 1 ? ' day' : ' days') + ' left</span></button></li>'; }).join('')
        + '</ul></section>';
    }
    if (ctx.hidden && ctx.hidden.length) {
      h += '<section class="t1-sec t1-done t1-hidden" aria-labelledby="t1-hidden-h"><div class="t1-sec-head"><h2 id="t1-hidden-h">Hidden by you</h2><span class="t1-count-pill">' + ctx.hidden.length + '</span></div>'
        + '<p class="t1-sec-note t1-done-note">Hidden from Today only. Events remain in Schedule and Event Details.</p><ul class="t1-done-list">'
        + ctx.hidden.map(function (d) { return '<li><span>' + esc(d.name) + ' <small>' + esc(d.when) + '</small></span><button type="button" class="t1-restore" data-t1-unhide="' + esc(d.key) + '" aria-label="' + esc('Restore ' + d.name + ' to Today') + '">Restore</button></li>'; }).join('') + '</ul></section>';
    }
    if (ctx.done.length) {
      h += '<section class="t1-sec t1-done" aria-labelledby="t1-done-h"><div class="t1-sec-head"><h2 id="t1-done-h">Marked done</h2><span class="t1-count-pill">' + ctx.done.length + '</span></div>'
        + '<p class="t1-sec-note t1-done-note">Completed for you. These events remain in Schedule.</p><ul class="t1-done-list">'
        + ctx.done.map(function (d) { return '<li><span>' + esc(d.name) + ' <small>' + esc(d.when) + '</small></span><button type="button" class="t1-restore" data-t1-undo="' + esc(d.key) + '" aria-label="' + esc('Restore ' + d.name + ' to Today') + '">Restore</button></li>'; }).join('') + '</ul></section>';
    }
    return h;
  }
  /* Update countdown text without replacing nodes. */
  function patchCountdowns(rootEl, nowMs) {
    var list = rootEl.querySelectorAll('.t1-cd[data-ts]');
    for (var i = 0; i < list.length; i++) { var t = LOGIC.countdownText(+list[i].getAttribute('data-ts'), nowMs, list[i].getAttribute('data-live') === '1'); if (list[i].textContent !== t) list[i].textContent = t; }
  }
  return { patchCountdowns: patchCountdowns, render: render, pokemonFor: pokemonFor, raidTier: raidTier, shinyBadge: shinyBadge, esc: esc };
}));
