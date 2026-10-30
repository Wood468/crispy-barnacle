/* Phase 2 dashboard: one event model feeding Priority Now, the Events timeline and calendar, rotation cards,
   collection opportunities and Saved/Followed. Loaded by app.js once its data is ready (window.GO).
   Data: /api/events when the source pipeline is switched on, otherwise data.json (the fallback). Nothing here writes to the server. */
(function () {
  var G = window.GO; if (!G) return;
  var D = G.D, esc = G.esc, art = G.art, MON = G.MON, DOW = G.DOW;
  function $(id) { return document.getElementById(id); }
  function now() { return new Date(); }
  function safeUrl(u) { return typeof u === 'string' && (/^https:\/\//.test(u) || /^\/img\/ext\/[\w.-]+$/.test(u)) ? u : ''; }
  function isOfficialUrl(u) { try { var h = new URL(String(u || '')).hostname.toLowerCase(); return h === 'pokemongo.com' || /\.pokemongo\.com$/.test(h); } catch (e) { return false; } }

  /* Raid hundo CP reference data (PvPoke Game Master, MIT); only exact known species/forms are labelled. */
  var CP_STATS = {}, CPMS = [], CP_READY = false;
  function cpKey(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function cpSpecies(name) {
    var n = String(name || '').trim();
    /* Raid cards may name a Mega/Primal/Max form, but hundo raid catch CP uses the
       base Pokémon's stats. Strip the form prefix before matching. */
    n = n.replace(/^(Mega|Super Mega|Primal|Dynamax|Gigantamax)\s+/i, '');
    /* Mega Charizard X/Y and Mega Mewtwo X/Y use their base species for raid catch CP. */
    n = n.replace(/\s+[XY]$/i, '');
    var key = cpKey(n);
    if (CP_STATS[key]) return CP_STATS[key];
    /* The event schedule uses regional adjective-first names; the source uses parenthesised form names. */
    var regional = key.match(/^(alolan|galarian|hisuian|paldean) (.+)$/);
    if (regional) return CP_STATS[cpKey(regional[2] + ' ' + '(' + regional[1] + ')')] || CP_STATS[cpKey(regional[2] + ' (' + regional[1] + ')')];
    return null;
  }
  function hundoCP(stats, level) {
    var cpm = CPMS[Math.round(level * 2) - 2];
    if (!stats || !cpm) return null;
    return Math.max(10, Math.floor((stats.attack + 15) * Math.sqrt(stats.defense + 15) * Math.sqrt(stats.stamina + 15) * cpm * cpm / 10));
  }
  function hundoPair(ev, f) {
    if (!CP_READY || (ev.kind !== 'raid' && ev.kind !== 'max') || !f || f.role === 'shiny_form' || f.costume) return null;
    var stats = cpSpecies(f.name);
    if (!stats) return null;
    var normal = hundoCP(stats, 20), boosted = hundoCP(stats, 25);
    if (normal === null || boosted === null) return null;
    return { n: normal, b: boosted };
  }
  /* Perfect-IV catch CP: level 20 normally, level 25 when weather boosted. */
  function hundoLabels(ev, f) {
    var h = hundoPair(ev, f); if (!h) return '';
    return '<span class="cp-pair"><span class="cp-chip" title="Perfect IV (15/15/15) raid catch CP; Mega and Primal encounters use the base Pokémon"><i>100% IV</i> ' + h.n.toLocaleString('en-AU') + '</span><span class="cp-chip wb" title="Perfect IV weather-boosted raid catch CP"><i>Boosted</i> ' + h.b.toLocaleString('en-AU') + '</span></span>';
  }
  /* One tidy block of CP numbers for a card: the boss(es) by name when there are several. */
  function cpRows(ev) {
    var seen = {}, rows = [];
    ev.featured.forEach(function (f) {
      var k = String(f.name).toLowerCase(); if (seen[k]) return; seen[k] = 1;
      var l = hundoLabels(ev, f); if (l) rows.push({ name: f.name, html: l });
    });
    if (!rows.length) return '';
    var many = rows.length > 1;
    return '<div class="cp-rows">' + rows.slice(0, 3).map(function (r) { return '<div class="cp-row">' + (many ? '<b>' + esc(r.name) + '</b>' : '<b>Catch CP</b>') + r.html + '</div>'; }).join('') + '</div>';
  }

  /* ---------- kinds: colour, label, one place ---------- */
  var KIND = {
    cd: ['Community Day', '#F76B15', '#1A0E04'], raid: ['Raids', '#D7373C', '#FFFFFF'], max: ['Max Battles', '#6E56CF', '#FFFFFF'],
    spot: ['Spotlight Hour', '#FFD43B', '#1D1700'], pvp: ['Battle League', '#3E63DD', '#FFFFFF'], person: ['In person', '#2B8A9E', '#FFFFFF'],
    debut: ['Debut', '#12A594', '#031F1B'], twitch: ['Twitch Drops', '#8B5CF6', '#FFFFFF'], event: ['Event', '#5E6A80', '#FFFFFF']
  };
  var STATUS = { official_confirmed: 'Official', community_reported: 'Community reported', datamined: 'Datamined', conflicting: 'Conflicting' };
  var PIPE_KIND = { 'community-day': 'cd', 'raid-battles': 'raid', 'raid-hour': 'raid', 'raid-day': 'raid', 'raid-weekend': 'raid', 'elite-raids': 'raid', 'max-battles': 'max', 'max-mondays': 'max',
    'pokemon-spotlight-hour': 'spot', 'go-battle-league': 'pvp', 'wild-area': 'person', 'pokemon-go-tour': 'person', 'pokemon-go-fest': 'person', 'safari-zone': 'person', 'city-safari': 'person', 'ticketed-event': 'person', 'twitch-drops': 'twitch', 'twitch-drops-event': 'twitch' };

  /* ---------- time helpers (all in the device's own time zone) ---------- */
  function pad(n) { return ('0' + n).slice(-2); }
  function fmtD(d) { return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function fmtT(d) { var h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return h + (m ? ':' + pad(m) : '') + ' ' + ap; }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes()); }
  function dur(ms) {
    var m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h' + (m % 60 && h < 6 ? ' ' + (m % 60) + 'm' : '');
    var d = Math.floor(h / 24); return d + 'd' + (h % 24 && d < 4 ? ' ' + (h % 24) + 'h' : '');
  }
  function phase(ev, t) { t = t || now(); return t >= ev.end ? 'ended' : t >= ev.start ? 'live' : 'soon'; }
  function countdown(ev, t) {
    t = t || now(); var p = phase(ev, t);
    if (p === 'ended') return 'Ended';
    if (p === 'live') return ev.long ? 'On now' : 'Live · ' + dur(ev.end - t) + ' left';
    var ms = ev.start - t;
    if (ms < 36e5 * 24 && startOfDay(ev.start).getTime() === startOfDay(t).getTime()) return 'Today · in ' + dur(ms);
    var tm = addDays(startOfDay(t), 1);
    if (startOfDay(ev.start).getTime() === tm.getTime()) return 'Tomorrow';
    return 'In ' + dur(ms);
  }
  function whenText(ev) {
    var a = ev.start, b = ev.end, sameDay = dayKey(a) === dayKey(b);
    if (ev.allDay) return sameDay ? fmtD(a) : fmtD(a) + ' to ' + fmtD(b);
    if (sameDay) return fmtD(a) + ', ' + fmtT(a) + ' to ' + fmtT(b);
    return fmtD(a) + ' ' + fmtT(a) + ' to ' + fmtD(b) + ' ' + fmtT(b);
  }
  function utcWhenText(ev) {
    function d(x) { return DOW[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MON[x.getUTCMonth()]; }
    function t(x) { var h=x.getUTCHours(),m=x.getUTCMinutes(),ap=h>=12?'pm':'am'; h=h%12||12; return h+(m?':'+pad(m):'')+' '+ap; }
    var a=ev.start,b=ev.end;
    return a.toISOString().slice(0,10)===b.toISOString().slice(0,10) ? d(a)+', '+t(a)+' to '+t(b)+' UTC' : d(a)+' '+t(a)+' to '+d(b)+' '+t(b)+' UTC';
  }
  function sourceClock(ev) {
    if (!ev.region || ev.utc || !ev.sourceStart) return '';
    return 'Listed clock: '+String(ev.sourceStart).replace('T',' ')+' (source timezone not supplied)';
  }
  function timeMeta(ev) {
    if (ev.utc) return 'Your time: '+whenText(ev)+' · UTC: '+utcWhenText(ev);
    if (ev.region && ev.sourceStart) return sourceClock(ev)+' · Cannot convert to your time without the source timezone';
    if (ev.scope === 'worldwide_local') return 'Your time: '+whenText(ev)+' · Local time in each region';
    return whenText(ev)+' · '+(ev.long ? '' : 'Local time (source timezone not specified)');
  }
  function signalTags(o) {
    var tags=(o.tags||[]).slice(), text=[o.name||'',(o.notes||[]).join(' '),(o.bonuses||[]).join(' ')].join(' ').toLowerCase();
    var featured=o.featured||[];
    function add(label){if(tags.indexOf(label)<0)tags.push(label);}
    if (/twitch[- ]?drops/.test((o.name||'').toLowerCase()) || o.kind==='twitch' || o.type==='twitch-drops' || o.type==='twitch-drops-event') add('Twitch Drops');
    if (o.kind==='cd' || o.type==='community-day' || /community day/i.test(o.name||'')) add('Community Day');
    if (o.kind==='max' || /max battle|dynamax|gigantamax/i.test(o.name||'')) add('Max Battles');
    if (o.kind==='raid' || /raid/i.test(o.name||'')) add('Raids');
    if (/\b(debuts?|debuting|new pok[eé]mon|new form)\b/.test(text)) add('Debut');
    if (/\bnew shiny\b|shiny debut|debut.{0,24}shiny/i.test(text)) add('New shiny');
    else if (/boosted shiny odds|higher chance of shiny|increased shiny odds|shiny odds (are )?boosted|boosted chance of shiny/i.test(text)) add('Boosted shiny odds');
    else if (tags.indexOf('Shiny')>-1 || featured.some(function(f){return f && (f.shiny || f.canBeShiny);}) || /shiny (available|eligible|odds|chance)|can be shiny/i.test(text)) add('Shiny available');
    if (/exclusive (fast |charged )?(attack|move)|exclusive move/i.test(text)) add('Exclusive move');
    if (/background/i.test(text) || featured.some(function(f){return f && /background/i.test(f.label||'');})) add('Background');
    if (featured.some(function(f){return f && f.costume;}) || /costume|costumed/i.test(text)) add('Costume');
    if (/\bshadow\b/i.test(text) || featured.some(function(f){return f && /^shadow\s/i.test(f.name||'');})) add('Shadow');
    if (/\bmega\b/i.test(text)) add('Mega');
    if (/\bprimal\b/i.test(text)) add('Primal');
    if (/in-person|in person|live event|safari zone|city safari/i.test(text)) add('In person');
    if (/dynamax|gigantamax|max battle|max monday/i.test(text)) add('Dynamax');
    if (/max particle/i.test(text)) add('Max Particles');
    if (/power spot/i.test(text)) add('Power Spots');
    if (/transfer candy|candy from transferr?ing|transfer bonus/i.test(text)) add('Transfer candy');
    tags=tags.filter(function(t){return t!=='Shiny';});
    return tags;
  }

  /* ---------- the event model ---------- */
  function mkEvent(o) {
    var s = new Date(o.s), e = new Date(o.e);
    if (isNaN(s) || isNaN(e)) return null;
    o.start = s; o.end = e; o.sourceStart = o.s; o.sourceEnd = o.e;
    o.allDay = s.getHours() === 0 && s.getMinutes() === 0 && e.getHours() === 23;
    o.long = e - s > 10 * 864e5;
    o.featured = (o.featured || []).filter(function (f) { return f && f.name; });
    o.bonuses = o.bonuses || [];
    o.notes = o.notes || [];
    // These recurring formats are defined in each player's local time, not a single global instant.
    if (!o.scope && (o.kind === 'cd' || o.kind === 'spot' || /\b(community day|spotlight hour|raid hour|max monday|hatch day)\b/i.test(o.name||''))) o.scope = 'worldwide_local';
    return o;
  }
  function fromData() {
    var out = [];
    (D.events || []).forEach(function (x) {
      var tags = x.tags || [], title = x.t || '', k = tags.some(function (t) { return /twitch\s*drops/i.test(t); }) || /twitch\s*drops/i.test(title) ? 'twitch' : tags.indexOf('Community Day') > -1 || /community day/i.test(title) ? 'cd' : tags.indexOf('Max Battles') > -1 || /max battle|dynamax|gigantamax|max monday/i.test(title) ? 'max' : tags.indexOf('Raids') > -1 || /\braids?\b|raid hour/i.test(title) ? 'raid' : tags.indexOf('In person') > -1 || /in-person|safari zone|city safari|go fest/i.test(title) ? 'person' : tags.indexOf('Debut') > -1 || /\bdebut\b/i.test(title) ? 'debut' : /spotlight hour/i.test(title) ? 'spot' : 'event';
      out.push(mkEvent({ id: 'cur:' + x.id, name: x.t, kind: k, s: x.s, e: x.e, utc: x.utc === true || x.tzMode === 'utc', region: x.region || '', scope: x.scope || '', tags: signalTags({ name:x.t, kind:k, tags:tags, notes:x.p, bonuses:x.bonuses, featured:(x.art||[]).map(function(a){return typeof a==='string'?{name:a}:a;}) }), notes: x.p, bonuses: x.bonuses,
        featured: (x.art || []).map(function (a) { a = typeof a === 'string' ? { n: a } : a; return { name: a.n, costume: !!a.costume, shiny: !!a.shiny, label: a.label, role: 'featured' }; }),
        highlights: Array.isArray(x.highlights) ? x.highlights : [],
        status: x.status || (x.sourceUrl ? 'official_confirmed' : 'community_reported'),
        source: x.source || (x.sourceUrl ? 'Official Pokémon GO announcement' : 'Curated community calendar'),
        link: x.sourceUrl || '', infographicUrl: x.infographicUrl || x.infographic || '' }));
    });
    (D.spotlight || []).forEach(function (x) {
      out.push(mkEvent({ id: 'cur:spot-' + x.d, name: x.n + ' Spotlight Hour', kind: 'spot', s: x.d + 'T18:00', e: x.d + 'T19:00', scope: 'worldwide_local', bonuses: x.b ? [x.b] : [],
        featured: [{ name: x.n, role: 'spotlight' }], status: 'community_reported', source: 'Curated from Leek Duck and Pokémon GO Hub', link: '' }));
    });
    (D.raidHour || []).forEach(function (x) {
      out.push(mkEvent({ id: 'cur:rh-' + x.d, name: x.n + ' Raid Hour', kind: 'raid', s: x.d + 'T18:00', e: x.d + 'T19:00',
        featured: [{ name: x.n, role: 'raid_boss' }], status: 'community_reported', source: 'Curated from Leek Duck and Pokémon GO Hub', link: '' }));
    });
    return out.filter(Boolean);
  }
  function fromApi(list) {
    return list.map(function (x) {
      var link = safeUrl(x.link); (x.reports || []).forEach(function (r) { if (!link && safeUrl(r.link)) link = r.link; });
      var officialLink = isOfficialUrl(link);
      var reportedOfficial = (x.reports || []).some(function (r) { return r && isOfficialUrl(r.link); });
      var kind = PIPE_KIND[x.type] || 'event';
      var featured = Array.isArray(x.featured) ? x.featured : [];
      var bonuses = Array.isArray(x.bonuses) ? x.bonuses : [];
      return mkEvent({ id: x.id, name: x.name, kind: kind, s: x.start, e: x.end || x.start, bonuses: bonuses, featured: featured, tags: signalTags({name:x.name,kind:kind,type:x.type,bonuses:bonuses,featured:featured}),
        status: (x.status === 'community_reported' && (officialLink || reportedOfficial)) ? 'official_confirmed' : x.status,
        source: officialLink ? 'Official Pokémon GO announcement' : (x.reports && x.reports[0] && x.reports[0].source === 'leekduck') ? 'Leek Duck' : (x.source || 'Leek Duck (community-reported)'), link: link,
        utc: x.tzMode === 'utc', region: x.region || '', scope: x.scope, conflict: x.conflict, infographicUrl: x.infographicUrl || x.infographic || '' });
    }).filter(Boolean);
  }
  /* The live feed can list one event twice (two reports with different ids). Same title and start within 6 hours: keep one card and
     pool what both know (featured Pokémon, bonuses, link, the better status). */
  function dedupeLive(list) {
    var keyOf = function (s) {
      var raw = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/pok[eé]mon go/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
      if (raw.indexOf('orionid') >= 0 && raw.indexOf('minior') >= 0) return 'orionids minior debut';
      return window.GODEDUPE ? GODEDUPE.titleKey(s) : raw; /* word order, Part I / Part One, brackets: see dedupe.js */
    };
    var RANK = { official_confirmed: 3, community_reported: 1, conflicting: 0 }, out = [];
    list.forEach(function (x) {
      var k = keyOf(x.name), hit = null;
      for (var i = 0; i < out.length; i++) if (keyOf(out[i].name) === k && Math.abs(+out[i].start - +x.start) <= 6 * 36e5 && Math.abs(+out[i].end - +x.end) <= 6 * 36e5) { hit = out[i]; break; }
      if (!hit) { out.push(x); return; }
      var seen = {}; (hit.featured || []).forEach(function (f) { seen[(f.name || '').toLowerCase()] = 1; });
      (x.featured || []).forEach(function (f) { var q = (f.name || '').toLowerCase(); if (!seen[q]) { (hit.featured = hit.featured || []).push(f); seen[q] = 1; } });
      hit.bonuses = Array.from(new Set((hit.bonuses || []).concat(x.bonuses || [])));
      if (!hit.link && x.link) hit.link = x.link;
      if (!hit.infographicUrl && x.infographicUrl) hit.infographicUrl = x.infographicUrl;
      hit.aliasIds = (hit.aliasIds || []).concat([x.id], x.aliasIds || []); /* so its pictures still find this card: see GODEDUPE.findEventInfo */
      if ((RANK[x.status] || 0) > (RANK[hit.status] || 0)) { hit.status = x.status; hit.source = x.source; }
    });
    return out;
  }
  var EV = [], usingApi = false, usingReadOnly = false;
  function mergeLiveAndCurated(live, curated) {
    // Only merge titles with the same GODEDUPE.titleKey (or one starting with the other) and a close start time. Token overlap is unsafe:
    // unrelated events can share a Pokémon name ("Zorua Community Day" vs "Zorua Raid Day").
    // Keep near-matches as separate cards rather than risking silent loss or mixed details.
    var used = {}, out = live.slice();
    function key(s) {
      var raw = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/pok[eé]mon go/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
      if (raw.indexOf('orionid') >= 0 && raw.indexOf('minior') >= 0) return 'orionids minior debut';
      return raw;
    }
    function same(a, b) { return key(a) === key(b) || (!!window.GODEDUPE && GODEDUPE.titleKey(a) === GODEDUPE.titleKey(b)); }
    /* The same event often has a short curated title and a longer live one ("Dynamax Uxie, Mesprit and Azelf" /
       "... during Max Battle Day"). One title that starts with the other (three or more words) counts as the same event. */
    function sameTitle(x, y) {
      var a = key(x), b = key(y); if (!a || !b) return false; if (same(x, y)) return true;
      var s = a.length <= b.length ? a : b, l = s === a ? b : a;
      return s.split(' ').length >= 3 && l.indexOf(s + ' ') === 0;
    }
    /* A curated card that cites a Leek Duck / Pokémon GO article is the same event as the live item with that article's address ending
       (".../minior-showers-orionids-2026/" and id "leekduck:minior-showers-orionids-2026"), even when the two titles are worded differently. */
    function slugOf(u) { var p = String(u || '').split(/[?#]/)[0].split('/').filter(Boolean); return (p.pop() || '').toLowerCase(); }
    function sameArticle(a, b) {
      var sb = slugOf(b.link), ia = String(a.id || '').split(':').pop().toLowerCase(), sa = slugOf(a.link);
      return !!sb && sb.indexOf('-') > 0 && (sb === ia || sb === sa);
    }
    /* Safety net for two cards worded differently with no shared article: they must start and end within 6 hours of each other,
       both run a day or more, and share two or more distinctive words ("Minior", "Orionids"). One shared Pokémon name is not enough. */
    var STOP = { event: 1, events: 1, pokemon: 1, go: 1, raid: 1, raids: 1, day: 1, hour: 1, part: 1, one: 1, two: 1, the: 1, and: 1, during: 1, in: 1, of: 1, battle: 1, battles: 1, community: 1, spotlight: 1, max: 1, debut: 1, showers: 1, shower: 1 };
    function words(t) { var o = {}; key(t).split(' ').forEach(function (w) { if (w.length > 3 && !STOP[w] && !/^\d+$/.test(w)) o[w] = 1; }); return o; }
    function sameWindow(a, b) {
      if (!(Number.isFinite(+a.start) && Number.isFinite(+b.start) && Number.isFinite(+a.end) && Number.isFinite(+b.end))) return false;
      if (+a.end - +a.start < 864e5 || +b.end - +b.start < 864e5) return false;
      if (Math.abs(+a.start - +b.start) > 6 * 36e5 || Math.abs(+a.end - +b.end) > 6 * 36e5) return false;
      var wa = words(a.name), wb = words(b.name), n = 0; for (var w in wa) if (wb[w]) n++;
      return n >= 2;
    }
    function similar(a, b) {
      if (sameWindow(a, b)) return true;
      return (sameTitle(a.name, b.name) || sameArticle(a, b)) &&
        Number.isFinite(+a.start) && Number.isFinite(+b.start) &&
        Math.abs(+a.start - +b.start) <= 36 * 36e5;
    }
    curated.forEach(function(c) {
      var match = -1;
      for (var i = 0; i < out.length; i++) {
        if (!used[i] && similar(out[i], c)) { match = i; break; }
      }
      if (match < 0) { out.push(c); return; }
      used[match] = 1;
      var liveEvent = out[match], seen = {};
      /* Keep the fuller write-up's title when the curated card carries more detail. */
      if ((c.featured || []).length > (liveEvent.featured || []).length) liveEvent.name = c.name;
      (liveEvent.featured || []).forEach(function(f) { seen[(f.name || '').toLowerCase()] = 1; });
      (c.featured || []).forEach(function(f) {
        var k = (f.name || '').toLowerCase();
        if (!seen[k]) { liveEvent.featured.push(f); seen[k] = 1; }
        else if (f.costume) liveEvent.featured.forEach(function(old) {
          if ((old.name || '').toLowerCase() === k) old.costume = true;
        });
      });
      liveEvent.aliasIds = (liveEvent.aliasIds || []).concat([c.id]); /* the curated copy's id: its infographics are filed under it */
      if (!liveEvent.infographicUrl && c.infographicUrl) liveEvent.infographicUrl = c.infographicUrl;
      if (c.bonuses && c.bonuses.length) liveEvent.bonuses = Array.from(new Set((liveEvent.bonuses || []).concat(c.bonuses)));
      var liveHasDetail = (liveEvent.featured || []).length > 0 || (liveEvent.bonuses || []).length > 0;
      var cNotes = (c.notes || []).filter(function (t) { return !(liveHasDetail && window.GOLIB && GOLIB.isPlaceholder(t)); });
      if (cNotes.length) liveEvent.notes = Array.from(new Set((liveEvent.notes || []).concat(cNotes)));
      liveEvent.tags = Array.from(new Set((liveEvent.tags || []).concat(c.tags || [])));
      if (c.status === 'official_confirmed' && c.link) {
        liveEvent.status = 'official_confirmed'; liveEvent.source = c.source; liveEvent.link = c.link;
      }
    });
    return out;
  }
  function announced(ev) { return ev.status === 'official_confirmed' || ev.status === 'community_reported'; }

  /* ---------- Pokémon names -> dex numbers, and what you have ---------- */
  var DEXBY = {}, DEXNAME = {}, DEXGEN = {};
  function baseOf(name) {
    var n = String(name || '').trim(), form = '';
    var m = /^(Mega|Primal|Shadow|Gigantamax|Dynamax|Alolan|Galarian|Hisuian|Paldean)\s+(.*)$/i.exec(n);
    if (m) { form = m[1]; n = m[2]; }
    n = n.replace(/\s*\(.*\)\s*$/, '').replace(/\s+[XY]$/, function (x) { return form === 'Mega' ? '' : x; });
    return { base: n, form: form };
  }
  function marks() { return G.dex() || { have: {}, hundo: {}, m: {} }; }
  function haveAnyMarks() { var d = marks(); return Object.keys((d.m && d.m.own) || {}).length + Object.keys(d.have || {}).length + Object.keys(d.hundo || {}).length > 0; }
  // state: have | missing | unknown (can't tell) | form (not something you can collect, e.g. Dynamax)
  // Base species: from your Dex marks. Regional/Mega/Primal/Gigantamax and costumes: only from marks you made yourself. Never guessed.
  var LIB = window.GOLIB;
  /* Pokémon that are not out in Pokémon GO yet cannot be owned, so they are never marked Have or Need. */
  var UNREL = {};
  try { fetch('/release-status.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (R) { if (!R || !R.unreleased) return; var today = new Date().toISOString().slice(0, 10); R.unreleased.forEach(function (u) { if (u.type === 'pokemon' && !(u.available && u.available <= today)) UNREL[LIB.norm(u.name)] = u.available || true; }); try { renderAll(); } catch (e) { } }).catch(function () { }); } catch (e) { }
  function ownState(name, costume) {
    var p = LIB.parseForm(name), id = DEXBY[p.base.toLowerCase()], d = marks();
    if (UNREL[LIB.norm(p.base)]) return { state: 'unreleased', id: id || 0, base: p.base, why: 'Not released in Pokémon GO yet' };
    if (!id) return { state: 'unknown', id: 0, base: p.base, why: 'Not in the Pokédex list' };
    var out = { id: id, base: p.base, why: '' };
    if (p.special === 'dynamax') return Object.assign(out, { state: 'form', why: 'Dynamax is a battle state, there is nothing to collect' });
    if (p.special === 'shadow' || p.special === 'purified') {
      var has = d.m && d.m[p.special] && d.m[p.special][id];
      return Object.assign(out, has ? { state: 'have' } : { state: 'unknown', why: 'Not marked as ' + p.special + ' on your Dex' });
    }
    var tk = p.key ? 'form:' + id + ':' + p.key : (costume ? 'costume:' + id + ':' + LIB.norm(name) : '');
    if (tk) {
      var v = usGet(tk); out.tk = tk;
      return Object.assign(out, v === 1 ? { state: 'have' } : v === 0 ? { state: 'missing' } : { state: 'unknown', why: 'Not tracked. Tap Have or Need.' });
    }
    // A base species counts as Need only when you marked it Need, or you said its whole generation is complete. Otherwise it is unknown.
    if ((d.m && d.m.own && d.m.own[id]) || (d.have && d.have[p.base])) return Object.assign(out, { state: 'have' });
    var g = DEXGEN[id];
    if (g && genConfirmed(g)) return Object.assign(out, { state: 'missing', why: 'Gen ' + g + ' is confirmed complete, and this is not marked as owned' });
    return Object.assign(out, { state: 'unknown', why: 'Not tracked. Confirm Gen ' + (g || '?') + ' as complete in My Dex to count the rest as Need.' });
  }

  /* ---------- your state: saved, followed, form marks, preferences ----------
     One entry per thing ({v, t}); the newest timestamp wins per entry, so devices can't clobber each other.
     Kept on this device, and synced through /api/userstate when your PIN is set and the server table exists. */
  var US = {}, USKEY = 'gofn-us-v1', usDirty = {}, usTimer = 0, usStatus = 'local';
  try { US = JSON.parse(localStorage.getItem(USKEY) || '{}') || {}; } catch (e) { US = {}; }
  function oldList(k) { try { var v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  oldList('gofn-saved').forEach(function (id) { if (!US['saved:' + id]) US['saved:' + id] = { v: true, t: 1 }; });   // one-time import of the Phase 2 lists
  oldList('gofn-follow').forEach(function (n) { if (!US['follow:' + n.toLowerCase()]) US['follow:' + n.toLowerCase()] = { v: n, t: 1 }; });
  function usSave() { try { localStorage.setItem(USKEY, JSON.stringify(US)); } catch (e) { /* private mode: memory only */ } }
  function usGet(k) { var e = US[k]; return e && e.v !== null && e.v !== undefined ? e.v : undefined; }
  function usSet(k, v) { usStall = 0; US[k] = { v: v === undefined ? null : v, t: Date.now() }; usDirty[k] = 1; usSave(); usQueue(); document.dispatchEvent(new Event('gofn-state')); }
  function usKeys(prefix) { return Object.keys(US).filter(function (k) { return k.indexOf(prefix) === 0 && US[k].v !== null && US[k].v !== undefined; }); }
  function genAutoComplete(g) {
    var d = marks(), own = (d.m && d.m.own) || {}, legacy = d.have || {}, ids = Object.keys(DEXGEN).filter(function (id) { return DEXGEN[id] === +g; });
    if (!ids.length) return false;
    // Curated unreleased base species do not block a generation from completing.
    var unreleased = { 'bramblin': true };
    return ids.every(function (id) {
      var name = String(DEXNAME[id] || '').toLowerCase();
      if (unreleased[name]) return true;
      return !!(own[id] || legacy[DEXNAME[id]]);
    });
  }
  function genConfirmed(g) { return usGet('pref:gen:' + g) === true || genAutoComplete(g); }
  function setGenConfirmed(g, on) { usSet('pref:gen:' + g, on ? true : undefined); }
  function pinNow() { try { return localStorage.getItem('gofn-pin') || ''; } catch (e) { return ''; } }
  function usQueue() { clearTimeout(usTimer); usTimer = setTimeout(usSync, 800); }
  function setUsStatus(s) { usStatus = s; var n = $('usstat'); if (n) n.textContent = { local: 'Saved on this device only. Enter your sync PIN (Dex tab) to sync.', synced: 'Synced.', needsinit: 'Sync PIN works, but the server table has not been created yet.', error: 'Could not reach the server. Saved on this device.', badpin: 'That sync PIN was not accepted.', off: 'Sync is not switched on for this site.' }[s] || ''; }
  var usSyncing = false, usAgain = false, usStall = 0, usLastSig = '';
  function usSync() {
    var pin = pinNow(), acct = ''; try { acct = localStorage.getItem('gofn-acct') || ''; } catch (e) { }
    if (!pin && !acct) { setUsStatus('local'); return Promise.resolve(); }
    // Only clear dirty keys that are still exactly the versions sent. A user can edit while a
    // request is in flight; clearing the whole dirty map here would silently lose that edit.
    if (usSyncing) { usAgain = true; return Promise.resolve(); }
    var send = {}, sentKeys = [];
    Object.keys(usDirty).forEach(function (k) { if (US[k]) { send[k] = US[k]; sentKeys.push(k); } });
    usSyncing = true; usAgain = false;
    var shouldRetry = false;
    return fetch('/api/userstate', { method: sentKeys.length ? 'PUT' : 'GET', headers: pin ? { 'x-pin': pin, 'content-type': 'application/json' } : { 'content-type': 'application/json' }, body: sentKeys.length ? JSON.stringify({ entries: send }) : undefined })
      .then(function (r) { if (r.status === 404) { setUsStatus('off'); return null; } if (r.status === 401) { setUsStatus('badpin'); return null; } if (!r.ok) throw new Error('http'); return r.json(); })
      .then(function (j) {
        if (!j) return;
        if (!j.enabled) { setUsStatus('needsinit'); return; }
        shouldRetry = true;
        var rec = LIB.reconcileSync(US, j.entries || {}, usDirty, send, Date.now());
        US = rec.entries; usDirty = rec.dirty;
        usSave();
        Object.keys(rec.upload).forEach(function (k) { usDirty[k] = 1; });
        setUsStatus('synced'); renderAll(); document.dispatchEvent(new Event('gofn-state'));
      }).catch(function () { setUsStatus('error'); })
      .then(function () {
        usSyncing = false;
        /* If the same unsynced keys come back round after round (the server will not store them), stop retrying: every round redraws the list and made the pictures flash. The next edit starts syncing again. */
        var sig = Object.keys(usDirty).sort().join('|');
        usStall = shouldRetry && sig && sig === usLastSig ? usStall + 1 : 0; usLastSig = shouldRetry ? sig : '';
        if (usAgain || (shouldRetry && sig && usStall < 3)) { usAgain = false; usQueue(); }
      });
  }
  function isSaved(id) { return usGet('saved:' + id) === true; }
  function isHidden(id) { return usGet('hide:' + id) === true; }
  function hiddenList() { return usKeys('hide:').map(function (k) { return k.slice(5); }); }
  function toggleHide(id) { usSet('hide:' + id, isHidden(id) ? null : true); renderAll(); }
  function savedList() { return usKeys('saved:').map(function (k) { return k.slice(6); }); }
  function followList() { return usKeys('follow:').map(function (k) { return String(usGet(k)); }); }
  function isFollowed(n) { return usGet('follow:' + baseOf(n).base.toLowerCase()) !== undefined; }
  function toggleSave(id) { usSet('saved:' + id, isSaved(id) ? null : true); renderAll(); }
  function toggleFollow(n) { var b = baseOf(n).base, k = 'follow:' + b.toLowerCase(); usSet(k, usGet(k) !== undefined ? null : b); renderAll(); }
  function setMark(tk, v) { usSet(tk, v); renderAll(); }
  Object.defineProperty(window, 'GOSTATE', { value: { get: usGet, set: usSet, keys: usKeys, all: function () { return US; }, sync: usSync, status: function () { return usStatus; }, pin: pinNow, setMark: setMark }, configurable: true });

  /* ---------- small building blocks ---------- */
  function kindOf(ev) { return KIND[ev.kind] || KIND.event; }
  /* Event types the person has switched off (Settings). Battle League is off until they switch it on. */
  function kindHidden(k) { var v = usGet('hidekind:' + k); return v === undefined ? k === 'pvp' : v === true; }
  function renderKinds() {
    var el = $('kindsbox'); if (!el) return;
    var order = ['cd', 'raid', 'max', 'spot', 'pvp', 'person', 'twitch', 'debut', 'event'];
    el.innerHTML = order.map(function (k) { var on = !kindHidden(k); return '<button type="button" class="fchip" data-kindtog="' + k + '" aria-pressed="' + on + '" style="border-left:4px solid ' + KIND[k][1] + '">' + esc(KIND[k][0]) + (on ? '' : ' (hidden)') + '</button>'; }).join('');
  }
  function statusChip(ev) {
    var c = ev.status === 'conflicting' ? 'st-c' : ev.status === 'datamined' ? 'st-d' : ev.status === 'official_confirmed' ? 'st-a' : 'st-n';
    return '<span class="st ' + c + '" title="' + esc(ev.source || '') + '">' + esc(STATUS[ev.status] || ev.status || '') + '</span>';
  }
  var IMG_PARTICLE = 'https://archives.bulbagarden.net/media/upload/4/46/Max_Particle_Sprite.png';
  var IMG_POWERSPOT = '/img/ext/powerspots-overworld-5a586254.webp';
  /* Pokémon an event ties to Incense (e.g. "Boosted shiny · Hisuian Growlithe (Incense, Oct 16–19)" or "Incense encounters · A, B"). */
  function incenseNames(ev) {
    var out = {};
    (ev.highlights || []).forEach(function (h) {
      var label = String((h && h.label) || ''), type = String((h && h.type) || '');
      if (!/incense/i.test(label + ' ' + type)) return;
      var rest = label.indexOf(' · ') > -1 ? label.slice(label.indexOf(' · ') + 3) : '';
      if (/incense/i.test(type)) rest.replace(/\([^)]*\)/g, '').split(',').forEach(function (n) { n = n.replace(/\+\s*more/i, '').trim(); if (n) out[n.toLowerCase()] = 1; });
      else { var m = rest.match(/([^,(]+?)\s*\([^)]*incense/i); if (m) out[m[1].trim().toLowerCase()] = 1; }
    });
    return out;
  }
  var INC_IMG = '<img class="inc-badge" src="/ico/incense.webp" alt="Incense" title="Incense encounter" loading="lazy">';
  function hasTag(ev, t) { return (ev.tags || []).indexOf(t) > -1; }
  /* One Pokémon, drawn the way the game shows it: Shadow gets the purple aura, Dynamax the red Max smoke, Gigantamax its own sprite. */
  /* Dynamax: animated sprite (Pokémon Showdown), drawn larger, with the Dynamax emblem. Falls back to the still picture if the animation is missing. */
  var IMG_DYNAMAX = '/img/ext/BreadRaidEmblem-71f25669.png';
  function showdownId(name) { return window.GOSD ? window.GOSD(name) : ''; }
  function dynaAnim(name) {
    var id = showdownId(name); if (!id) return '';
    return '<img class="dyn-ani" alt="" loading="lazy" src="https://play.pokemonshowdown.com/sprites/ani/' + id + '.gif" data-err="rm">';
  }
  function monArt(ev, f, cls) {
    var isShadow = hasTag(ev, 'Shadow') || /^Shadow\s/i.test(f.name);
    var isGmax = /^Gigantamax\s/i.test(f.name) || (/gigantamax/i.test(ev.name || '') && !/dynamax.*gigantamax/i.test(ev.name || ''));
    var isMax = ev.kind === 'max' || /^(Dynamax|Gigantamax)\s/i.test(f.name) || /\b(dynamax|gigantamax)\b/i.test(ev.name || '');
    var spriteName = isGmax && !/^Gigantamax\s/i.test(f.name) ? 'Gigantamax ' + f.name : f.name;
    var sprite = art({ n: spriteName, costume: f.costume, shiny: f.shiny, shadow: isShadow, dynamax: isMax }, cls || 'ea');
    var inc = incenseNames(ev)[String(f.name).toLowerCase()] ? INC_IMG : '';
    if (isMax) return '<span class="max-art ' + (isGmax ? 'is-gmax' : 'is-dyn') + '">' + sprite + inc + '<span class="max-tag">' + (isGmax ? '' : '<img class="dyn-logo" alt="" src="' + IMG_DYNAMAX + '" data-err="rm">') + (isGmax ? 'G-Max' : 'Dynamax') + '</span></span>';
    if (isShadow) return '<span class="shadow-art"><i class="sf sf1"></i><i class="sf sf2"></i><i class="sf sf3"></i>' + sprite + inc + '<span class="shadow-tag"><img src="/ico/g/shadow.webp" alt="" loading="lazy">Shadow</span></span>';
    return inc ? '<span class="inc-art">' + sprite + inc + '</span>' : sprite;
  }
  /* Events with no Pokémon of their own but a Max Particle or Power Spot bonus show that picture. */
  function specialArt(ev) {
    var out = '';
    if (hasTag(ev, 'Power Spots')) out += '<span class="sp-art sp-powerspot"><img class="art" alt="Power Spot" loading="lazy" src="' + IMG_POWERSPOT + '" data-err="prm"><span class="max-tag">Power Spot</span></span>';
    if (hasTag(ev, 'Max Particles')) out += '<span class="sp-art sp-particle"><img class="art" alt="Max Particles" loading="lazy" src="' + IMG_PARTICLE + '" data-err="prm"><span class="max-tag">Max Particles</span></span>';
    return out;
  }
  function featArts(ev, n) {
    var seen = {}, out = [];
    ev.featured.forEach(function (f) {
      if (f.role === 'shiny_form') return;
      var k = f.name.toLowerCase(); if (seen[k]) return; seen[k] = 1;
      var hp = hundoPair(ev, f);
      out.push('<span class="feat-mon">' + monArt(ev, f) + (hp ? '<span class="cp-under" title="Perfect-IV catch CP, then weather boosted"><b>' + hp.n.toLocaleString('en-AU') + '</b><s>|</s><b class="wb">' + hp.b.toLocaleString('en-AU') + '</b></span>' : '') + '</span>');
    });
    if (!out.length) return specialArt(ev) || placeholderArt(ev);
    return out.slice(0, n || 3).join('');
  }
  /* A card with no Pokémon or special art still gets a picture: the event's kind icon straight away, upgraded to the event page's own banner when it has one. */
  var PH_ICO = { raid: '/ico/g/raid.webp', cd: '/ico/g/event.webp', spot: '/ico/shiny.webp', max: '/ico/g/powerup.webp' };
  function placeholderArt(ev) {
    var l = String(ev.link || ''), ok = /^https:\/\/(www\.)?(leekduck|pokemongo)\.com\//.test(l);
    return '<span class="evc-ph"' + (ok ? ' data-og="' + esc(l) + '"' : '') + '><img class="ph-ico" alt="" src="' + (PH_ICO[ev.kind] || '/ico/g/event.webp') + '" data-err="rm"></span>';
  }
  (function ogThumbs() {
    var CK = 'gofn-og', cache = {}, busy = 0, queue = [], io = null;
    try { cache = JSON.parse(localStorage.getItem(CK) || '{}') || {}; } catch (e) { cache = {}; }
    function save() { try { var k = Object.keys(cache); if (k.length > 300) k.slice(0, k.length - 300).forEach(function (x) { delete cache[x]; }); localStorage.setItem(CK, JSON.stringify(cache)); } catch (e) {} }
    function put(el, src) { if (!src || !/^https:\/\//.test(src) || !el.isConnected) return; var im = document.createElement('img'); im.className = 'ph-banner'; im.alt = ''; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer'; im.onload = function () { var ic = el.querySelector('.ph-ico'); if (ic) ic.remove(); el.classList.add('has-banner'); }; im.onerror = function () { im.remove(); }; im.src = src; el.appendChild(im); }
    function pump() {
      while (busy < 4 && queue.length) {
        (function (el) {
          var l = el.getAttribute('data-og'); if (!l) return;
          if (cache[l] !== undefined) { put(el, cache[l]); return; }
          busy++;
          fetch('/api/og?u=' + encodeURIComponent(l)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { cache[l] = d && d.image ? d.image : ''; save(); put(el, cache[l]); }).catch(function () {}).then(function () { busy--; pump(); });
        })(queue.shift());
      }
    }
    function scan() {
      var els = document.querySelectorAll('.evc-ph[data-og]:not([data-seen])');
      els.forEach(function (el) { el.setAttribute('data-seen', '1'); if (io) io.observe(el); else { queue.push(el); } });
      if (!io) pump();
    }
    if ('IntersectionObserver' in window) io = new IntersectionObserver(function (list) { list.forEach(function (x) { if (x.isIntersecting) { io.unobserve(x.target); queue.push(x.target); } }); pump(); }, { rootMargin: '200px' });
    var t = null; new MutationObserver(function () { clearTimeout(t); t = setTimeout(scan, 250); }).observe(document.body, { childList: true, subtree: true });
    scan();
  })();
  function featChips(ev, max) {
    var seen = {}, out = [];
    ev.featured.forEach(function (f) {
      if (f.role === 'shiny_form') return;
      var k = f.name.toLowerCase(); if (seen[k]) return; seen[k] = 1;
      var o = ownState(f.name, f.costume);
      var cls = 'fc' + (o.state === 'missing' ? ' need' : o.state === 'have' ? ' have' : '');
      out.push('<span class="' + cls + '"><span>' + esc(f.name) + (o.state === 'missing' ? '<b>need</b>' : '') + '</span></span>');
    });
    return out.slice(0, max || 6).join('');
  }
  function reasonsFor(ev) {
    var r = [], seen = {};
    ev.featured.forEach(function (f) {
      if (f.role === 'shiny_form') return;
      var o = ownState(f.name, f.costume), k = o.base.toLowerCase(); if (seen[k]) return; seen[k] = 1;
      if (o.state === 'missing') r.push('You need ' + o.base);
      else if (isFollowed(f.name)) r.push('You follow ' + o.base);
      else if (f.costume) r.push('Costume: ' + (f.label || o.base));
    });
    if (isSaved(ev.id)) r.push('Saved');
    return r;
  }
  /* The selling points: short chips such as Debut, New shiny, Boosted shiny odds, Shadow, Dynamax, Max Particles, Power Spots. */
  function shortLabel(l) {
    var t = String(l).replace(/\s*\([^)]*\)/g, '').replace(/\s*\+ more\s*$/i, ''), i = t.indexOf(' · ');
    if (i < 0) return t;
    var names = t.slice(i + 3).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    return t.slice(0, i) + ' · ' + names[0] + (names.length > 1 ? ' +' + (names.length - 1) : '');
  }
  /* Tickets and passes: read from event-info.json once, so a card can say "Ticket" or "GO Pass" without opening details. */
  var EVINFO = null;
  try { fetch('/event-info.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) { EVINFO = j; try { renderAll(); } catch (e) { } } }).catch(function () { }); } catch (e) { }
  function ticketTags(ev) {
    if (!EVINFO || !EVINFO.events) return [];
    var all = EVINFO.events, bare = String(ev.id || '').replace(/^[a-z]+:/, ''), hit = all[ev.id] || all[bare];
    if (!hit) Object.keys(all).forEach(function (id) { if ((all[id].names || []).some(function (n) { return String(n).toLowerCase() === String(ev.name).toLowerCase(); })) hit = all[id]; });
    if (!hit) return [];
    var out = [];
    (hit.tickets || []).concat(hit.alsoRunning || []).forEach(function (id) {
      var ps = EVINFO.passes && EVINFO.passes[id]; if (!ps || ps.free) return;
      var t = /go pass/i.test(ps.name) ? 'GO Pass' : 'Ticket';
      if (out.indexOf(t) < 0) out.push(t);
    });
    return out;
  }
  /* A bonus such as "2x transfer Candy" as a "2×" badge with the game's own icons (candy, trade arrows, stardust, XP). */
  function bonusBadge(b) {
    var m = String(b).match(/^(\d+(?:\.\d+)?)\s*[x×]\s+(.*)$/i); if (!m) return null;
    var what = m[2], low = what.toLowerCase(), ico = '', cls = '', label = what;
    if (/transfer/.test(low) && /candy/.test(low)) { ico = '<img class="sb-i sb-t" src="/ico/trade.webp" alt=""><img class="sb-i" src="/ico/candy.webp" alt="">'; cls = 'sb-transfer'; label = 'Transfer candy'; }
    else if (/candy/.test(low)) { ico = '<img class="sb-i" src="/ico/candy.webp" alt="">'; cls = 'sb-candy'; label = /catch/.test(low) ? 'Catch candy' : what; }
    else if (/stardust|dust/.test(low)) { ico = '<img class="sb-i" src="/ico/dust.webp" alt="">'; cls = 'sb-dust'; label = /catch/.test(low) ? 'Catch stardust' : 'Stardust'; }
    else if (/xp/.test(low)) { ico = '<img class="sb-i" src="/ico/xp.webp" alt="">'; cls = 'sb-xp'; label = /evolution/.test(low) ? 'Evolution XP' : /catch/.test(low) ? 'Catch XP' : 'XP'; }
    else return null;
    return { cls: cls, html: '<span class="signal sig-bonus ' + cls + '" title="' + esc(b) + '"><b>' + esc(m[1]) + '×</b>' + ico + esc(label) + '</span>' };
  }
  function signalChips(ev, max, full) {
    var highlights = (ev.highlights || []).filter(function (h) { return h && h.type && h.label; });
    var hasDebutHighlight = highlights.some(function (h) { return h.type === 'debut'; });
    var hasShinyHighlight = highlights.some(function (h) { return /shiny/i.test(h.type); });
    /* One chip per kind of bonus: two 2× transfer-candy lines are still one chip. */
    var seenCls = {};
    var bonusBits = (ev.bonuses || []).map(bonusBadge).filter(Boolean).filter(function (b) { if (seenCls[b.cls]) return false; seenCls[b.cls] = 1; return true; }).slice(0, 2);
    var hasTransferBonus = bonusBits.some(function (b) { return b.cls === 'sb-transfer'; });
    var visibleSignals = (ev.tags || []).filter(function (t) {
      if (!/debut|shiny|background|costume|shadow|mega|primal|twitch|community day|max battles|in person|exclusive move|dynamax|max particles|power spots|transfer candy/i.test(t)) return false;
      if (hasDebutHighlight && /debut/i.test(t)) return false;
      if (hasShinyHighlight && /shiny/i.test(t)) return false;
      if (t === 'Max Battles' && hasTag(ev, 'Dynamax')) return false;
      if (hasTransferBonus && /transfer candy/i.test(t)) return false;
      return true;
    });
    var MAXCHIPS = max || 4;
    // The game's own pictures where we have them: shiny sparkle, candy, incense.
    function sigIcon(text) {
      if (/incense/i.test(text)) return '<img class="sig-ico" src="/ico/incense.webp" alt="" loading="lazy">';
      if (/candy/i.test(text)) return '<img class="sig-ico" src="/ico/candy.webp" alt="" loading="lazy">';
      if (/shiny/i.test(text)) return '<img class="sig-ico" src="/ico/shiny.webp" alt="" loading="lazy">' + (/boost|odds|increase/i.test(text) ? '<b class="sig-up" aria-hidden="true">+</b>' : '');
      return '';
    }
    // Plain, specific wording: Debut, Shiny debut, Dynamax debut, Boosted shiny, Costume.
    highlights = highlights.map(function (h) {
      var type = String(h.type).toLowerCase(), label = String(h.label);
      if (type === 'new-shiny' || (type === 'debut' && /shiny/i.test(label))) { type = 'shiny-debut'; label = label.replace(/^[A-Z ]+(?= ·)/, 'SHINY DEBUT'); }
      else if (type === 'debut' && /dynamax|gigantamax|max/i.test(label)) { type = 'dynamax-debut'; label = label.replace(/^[A-Z ]+(?= ·)/, 'DYNAMAX DEBUT'); }
      return { type: type, label: label };
    });
    var chips = highlights.slice(0, MAXCHIPS).map(function (h) { return '<span class="signal signal-highlight-' + esc(h.type.toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '" title="' + esc(h.label) + '">' + sigIcon(h.type + ' ' + h.label) + esc(full ? h.label : shortLabel(h.label)) + '</span>'; })
      .concat(visibleSignals.slice(0, Math.max(0, MAXCHIPS - highlights.length)).map(function (t) { return '<span class="signal signal-' + esc(t.toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '">' + sigIcon(t) + esc(t === 'Debut' ? 'Pokémon debut' : t === 'Shiny' ? 'Shiny available' : t) + '</span>'; }));
    bonusBits.reverse().forEach(function (b) { chips.unshift(b.html); });
    ticketTags(ev).forEach(function (t) { chips.push('<span class="signal signal-ticket" title="' + (t === 'GO Pass' ? 'A GO Pass upgrade is available for this period' : 'A paid ticket is available for this event') + '">' + esc(t) + ' available</span>'); });
    return chips.length ? '<div class="event-signals">' + chips.join('') + '</div>' : '';
  }
  function bday(v) { try { return v ? (typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10)) : ''; } catch (e) { return ''; } }
  /* In-person events with a venue time (Night Out): loaded once, shared with the cards (detail.js) and used for "Next 24h" and the Today summary. */
  var VENUE = [];
  function venueLive(v, t) { return v.ms <= t && (v.endMs || v.ms + 4 * 36e5) > t; }
  function venueUp(v, t) { return v.ms > t && v.ms - t <= 864e5; }
  function venueCard(v, live) {
    var k = KIND.person;
    return '<article class="evc cmp ' + (live ? 'live' : 'soon') + '" style="--k:' + k[1] + ';--kf:' + k[2] + '"><div class="evc-main"><div class="evc-top"><span class="kind">' + esc(k[0]) + '</span></div>'
      + '<div class="evc-title-row"><h3 title="' + esc(v.name) + '">' + esc(v.name) + '</h3></div>'
      + '<p class="evc-when" style="font-weight:600">🎯 Bonuses ' + (live ? 'started ' : 'start ') + esc(v.day + ', ' + v.show) + ' your time' + (v.note ? ' <small>(' + esc(v.note) + ')</small>' : '') + '</p>'
      + (/^https:\/\//.test(v.link || '') ? '<div class="evc-foot"><a class="more" href="' + esc(v.link) + '" target="_blank" rel="noopener noreferrer">Event page</a></div>' : '') + '</div></article>';
  }
  window.GOVENUE = fetch('/api/venue-times?all=1').then(function (r) { return r.ok ? r.json() : { items: [] }; }).catch(function () { return { items: [] }; }).then(function (d) {
    VENUE = ((d && d.items) || []).filter(function (i) { return i && i.ms; });
    if (VENUE.length && EV.length) { renderPrio(); renderTimeline(); }
    return d;
  });
  function card(ev, opt) {
    opt = opt || {};
    var k = kindOf(ev), p = phase(ev), saved = isSaved(ev.id);
    var scope = ev.region ? ev.region : (ev.long ? '' : (ev.utc ? 'Same moment worldwide' : 'Local time'));
    return '<article class="evc cmp ' + p + '" style="--k:' + k[1] + ';--kf:' + k[2] + '" data-id="' + esc(ev.id) + '">'
      + '<div class="evc-art">' + featArts(ev, 3) + '</div>'
      + '<div class="evc-main">'
      + '<div class="evc-top"><span class="kind-grp"><span class="kind">' + esc(k[0]) + '</span>' + statusChip(ev) + '</span><span class="cdn" data-id="' + esc(ev.id) + '">' + esc(countdown(ev)) + '</span><button type="button" class="hide-x" data-hide="' + esc(ev.id) + '" aria-label="Hide ' + esc(ev.name) + '" title="Hide this event">✕</button></div>'
      + '<div class="evc-title-row"><h3 title="' + esc(ev.name) + '">' + esc(ev.name) + '</h3></div>'
      + '<p class="evc-when">' + esc(ev.utc || ev.region ? timeMeta(ev) : whenText(ev)) + (ev.long || ev.utc || ev.region ? '' : '') + '</p>'
      + '<p class="evc-bonus" data-bn="' + esc(ev.name) + '" data-bs="' + esc(bday(ev.start)) + '" data-be="' + esc(bday(ev.end)) + '" hidden></p>'
      + signalChips(ev, 4, false)
      + '<div class="evc-foot">'
      + '<button type="button" class="more" data-open="' + esc(ev.id) + '" aria-label="Details: ' + esc(ev.name) + '">Details</button>'
      + '<button type="button" class="more info-open" data-igcard="' + esc(ev.id) + '" data-infographic="' + esc(ev.id) + '" aria-label="Open infographic for ' + esc(ev.name) + '">▧ Infographic</button>'
      + '<button type="button" class="star' + (saved ? ' on' : '') + '" data-save="' + esc(ev.id) + '" aria-pressed="' + saved + '" aria-label="' + (saved ? 'Remove from saved' : 'Save event and get a Telegram reminder') + '" title="Saved events send you a Telegram reminder">' + (saved ? '★' : '☆') + '</button></div>'
      + (ev.status === 'conflicting' ? '<p class="evc-warn">Sources disagree about the time or place. Check in the game before heading out.</p>' : '')
      + '</div></article>';
  }

  /* ---------- Priority Now ---------- */
  function priority(t) {
    var list = [];
    EV.forEach(function (ev) {
      var p = phase(ev, t); if (p === 'ended' || ev.long || kindHidden(ev.kind)) return;
      if (!announced(ev)) return;                       // rumours and disputed reports are never urgent
      var hrs = p === 'live' ? (ev.end - t) / 36e5 : (ev.start - t) / 36e5;
      if (p === 'soon' && hrs > 48) return;
      if (p === 'live' && hrs > 72) return;
      var why = reasonsFor(ev), score = p === 'live' ? 100 - Math.min(hrs, 72) : 85 - Math.min(hrs, 48);
      if (why.some(function (w) { return /^You need/.test(w); })) score += 30;
      if (why.some(function (w) { return /^You follow/.test(w); })) score += 20;
      if (isSaved(ev.id)) score += 15;
      list.push({ ev: ev, score: score, why: why, p: p, hrs: hrs });
    });
    list.sort(function (a, b) { return b.score - a.score || a.ev.start - b.ev.start; });
    return list;
  }
  /* "2 on now · 3 starting in the next 24h": one tappable line that opens the Next 24h list. Counts the same things that list shows. */
  function soonSummary(t) {
    var tn = t.getTime(), live = 0, up = 0, showVenue = !kindHidden('person');
    EV.forEach(function (e) { if (isHidden(e.id) || kindHidden(e.kind) || !startsSoon(e)) return; if (phase(e, t) === 'live') live++; else up++; });
    if (showVenue) VENUE.forEach(function (v) { if (venueLive(v, tn)) live++; else if (venueUp(v, tn)) up++; });
    if (!live && !up) return '';
    return '<button type="button" class="soon-sum" data-gosoon="1" style="display:block;width:100%;text-align:left;margin:4px 0 10px;padding:10px 12px;border:1px solid currentColor;border-radius:10px;background:none;color:inherit;font:inherit;font-weight:600">⏱ ' + [live ? live + ' on now' : '', up ? up + ' starting in the next 24h' : ''].filter(Boolean).join(' · ') + ' <span aria-hidden="true">›</span></button>';
  }
  function renderPrio() {
    var box = $('prio'); if (!box) return;
    var t = now(), list = priority(t), top = list.slice(0, 4);
    var html = '<div class="prio-head"><h2 class="sec2">Priority now</h2><span class="muted mono">' + esc(DOW[t.getDay()] + ' ' + fmtT(t)) + '</span></div>' + soonSummary(t);
    if (!top.length) {
      var nx = EV.filter(function (e) { return phase(e, t) === 'soon' && announced(e) && !e.long; }).sort(function (a, b) { return a.start - b.start; })[0];
      html += '<div class="prio-empty"><b>Nothing urgent right now.</b><span>' + (nx ? 'Next up: ' + esc(nx.name) + ', ' + esc(countdown(nx, t).toLowerCase()) + '.' : 'No scheduled events in the data I have.') + '</span></div>';
    } else {
      html += '<div class="prio-list">' + top.map(function (x, i) {
        var ev = x.ev, k = kindOf(ev), urgent = x.p === 'live' ? x.hrs < 24 : x.hrs < 24;
        return '<article class="pc' + (i === 0 ? ' first' : '') + (urgent ? ' urgent' : '') + '" style="--k:' + k[1] + ';--kf:' + k[2] + '" data-id="' + esc(ev.id) + '">'
          + '<div class="pc-art">' + featArts(ev, i === 0 ? 2 : 1) + '</div><div class="pc-main">'
          + '<div class="pc-top"><span class="kind">' + esc(k[0]) + '</span><span class="cdn" data-id="' + esc(ev.id) + '">' + esc(countdown(ev, t)) + '</span></div>'
          + '<h3>' + esc(ev.name) + '</h3><p class="evc-when">' + esc(whenText(ev)) + '</p>'
          + '<p class="evc-bonus" data-bn="' + esc(ev.name) + '" data-bs="' + esc(bday(ev.start)) + '" data-be="' + esc(bday(ev.end)) + '" hidden></p>'
          + (x.why.length ? '<div class="why">' + x.why.slice(0, 3).map(function (w) { return '<span>' + esc(w) + '</span>'; }).join('') + '</div>' : '')
          + '<div class="pc-foot">' + statusChip(ev) + '<button type="button" class="more" data-open="' + esc(ev.id) + '" aria-label="Details: ' + esc(ev.name) + '">Details</button><button type="button" class="star' + (isSaved(ev.id) ? ' on' : '') + '" data-save="' + esc(ev.id) + '" aria-pressed="' + isSaved(ev.id) + '" aria-label="' + (isSaved(ev.id) ? 'Remove from saved' : 'Save event') + '">' + (isSaved(ev.id) ? '★' : '☆') + '</button></div>'
          + '</div></article>';
      }).join('') + '</div>';
    }
    var unconf = EV.filter(function (e) { return phase(e, t) !== 'ended' && !announced(e); });
    if (unconf.length) html += '<p class="note">' + unconf.length + ' unconfirmed report' + (unconf.length === 1 ? '' : 's') + ' (datamined or disputed) are kept out of this list. See Events.</p>';
    box.innerHTML = html;
  }

  /* ---------- Events: filters, week strip, timeline ---------- */
  var typeSel = 'all', selDay = '', weekOff = 0, calMonth = null, calSel = '', evQ = '';
  /* Search: every word typed must appear in the event's name, its featured Pokémon, its bonuses or its kind. */
  function searchText(ev) { return ((ev.name || '') + ' ' + (ev.featured || []).map(function (f) { return f.name; }).join(' ') + ' ' + (ev.bonuses || []).map(function (b) { return typeof b === 'string' ? b : (b && b.text) || ''; }).join(' ') + ' ' + kindOf(ev)[0]).toLowerCase(); }
  function matchesQ(ev) { var h = searchText(ev); return evQ.split(/\s+/).every(function (w) { return h.indexOf(w) > -1; }); }
  var TYPEFILTERS = [['all', 'All'], ['cd', 'Community Day'], ['raid', 'Raids'], ['max', 'Max Battles'], ['spot', 'Spotlight'], ['pvp', 'Battle League'], ['person', 'In person'], ['event', 'Other'], ['twitch', 'Twitch Drops'], ['mine', 'For me'], ['soon', 'Next 24h']];
  /* "Next 24h": live now, or starting within a day, announced events only (rumours stay out), long-running ones left to their own list. */
  function startsSoon(ev) { var t = now(); return announced(ev) && !ev.long && (phase(ev, t) === 'live' || (ev.start > t && ev.start - t <= 864e5)); }
  function mine(ev) { return reasonsFor(ev).some(function (w) { return /^You (need|follow)/.test(w); }) || isSaved(ev.id); }
  function filtered(list) {
    return list.filter(function (ev) {
      if (phase(ev) === 'ended' || isHidden(ev.id)) return false;
      if (kindHidden(ev.kind) && typeSel !== ev.kind) return false;
      if (typeSel === 'all') return true;
      if (typeSel === 'mine') return mine(ev);
      if (typeSel === 'soon') return startsSoon(ev);
      if (typeSel === 'event') return ev.kind === 'event' || ev.kind === 'debut';
      return ev.kind === typeSel;
    });
  }
  function renderTypes() {
    var el = $('evtypes'); if (!el) return;
    el.innerHTML = TYPEFILTERS.map(function (f) { return '<button type="button" class="fchip" data-type="' + f[0] + '" aria-pressed="' + (typeSel === f[0]) + '">' + esc(f[1]) + '</button>'; }).join('');
  }
  function weekStart(off) { var t = startOfDay(now()), dow = (t.getDay() + 6) % 7; return addDays(t, -dow + off * 7); }
  function dayEvents(day) { // events touching a given calendar day (long ones only on first and last day)
    var d0 = startOfDay(day).getTime(), d1 = d0 + 864e5;
    return EV.filter(function (ev) {
      if (ev.end <= now() || isHidden(ev.id) || (kindHidden(ev.kind) && typeSel !== ev.kind)) return false;
      if (ev.end.getTime() <= d0 || ev.start.getTime() >= d1) return false;
      if (ev.long) return startOfDay(ev.start).getTime() === d0 || startOfDay(ev.end).getTime() === d0;
      return true;
    });
  }
  function renderStrip() {
    var el = $('weekstrip'); if (!el) return;
    if (evQ) { el.innerHTML = ''; return; }
    var ws = weekStart(weekOff), today = dayKey(now()), cells = '';
    for (var i = 0; i < 7; i++) {
      var d = addDays(ws, i), k = dayKey(d), evs = filtered(dayEvents(d));
      var dots = evs.slice(0, 4).map(function (e) { return '<i style="background:' + kindOf(e)[1] + '"></i>'; }).join('');
      cells += '<button type="button" class="wd' + (k === today ? ' today' : '') + (k === selDay ? ' sel' : '') + '" data-day="' + k + '" aria-pressed="' + (k === selDay) + '"><span>' + DOW[d.getDay()] + '</span><b>' + d.getDate() + '</b><em>' + (dots || '') + '</em></button>';
    }
    var a = ws, b = addDays(ws, 6);
    el.innerHTML = '<div class="wk-head"><button type="button" class="calnav" data-wk="-1" aria-label="Previous week">‹</button><span>' + esc(fmtD(a) + ' to ' + fmtD(b)) + (weekOff === 0 ? ' · this week' : '') + '</span><button type="button" class="calnav" data-wk="1" aria-label="Next week">›</button></div><div class="wk-days">' + cells + '</div>';
  }
  function renderTimeline() {
    var el = $('evtimeline'); if (!el) return;
    var t = now(), html = '', ws = weekStart(weekOff), we = addDays(ws, 7);
    if (evQ) { // searching: every live and upcoming event that matches, soonest first, whatever week or kind switch is set
      var res = EV.filter(function (e) { return e.end > t && !isHidden(e.id) && matchesQ(e); }).sort(function (a, b) { return a.start - b.start; });
      var regRes = regList().filter(function (e) { return e.end > t && (String(e.name + ' ' + e.place + ' ' + e.area).toLowerCase().indexOf(evQ) >= 0); });
      el.innerHTML = '<div class="dayhead"><h2 class="sec2">' + (res.length + regRes.length) + ((res.length + regRes.length) === 1 ? ' result' : ' results') + '</h2><button type="button" class="pill all" data-clearq="1">Clear search</button></div>'
        + (res.length || regRes.length ? res.slice(0, 60).map(function (e) { return card(e); }).join('') + regRes.map(function (e) { return agendaRow(e, true); }).join('') : '<p class="empty">Nothing live or coming up matches that. Try a Pokémon or part of an event name.</p>'); return;
    }
    if (typeSel === 'soon') { // whatever week is shown, this is about the next 24 hours: what is on now, then what pays out next
      var tn = t.getTime();
      var sn = EV.filter(function (e) { return !isHidden(e.id) && !(kindHidden(e.kind)) && startsSoon(e); }).map(function (e) { return { at: e.start.getTime(), live: phase(e, t) === 'live', html: card(e) }; });
      regList().filter(function (e) { return e.start <= t && e.end > t; }).forEach(function (e) { sn.push({ at: e.start.getTime(), live: true, html: agendaRow(e, true) }); });
      if (!kindHidden('person')) VENUE.forEach(function (v) { if (venueLive(v, tn) || venueUp(v, tn)) sn.push({ at: v.ms, live: venueLive(v, tn), html: venueCard(v, venueLive(v, tn)) }); });
      sn.sort(function (a, b) { return a.at - b.at; });
      var lv = sn.filter(function (x) { return x.live; }), up = sn.filter(function (x) { return !x.live; });
      html = (lv.length ? '<h2 class="sec2">Happening now</h2>' + lv.map(function (x) { return x.html; }).join('') : '') + (up.length ? '<h2 class="sec2 dh">Starting in the next 24 hours</h2>' + up.map(function (x) { return x.html; }).join('') : '');
      el.innerHTML = html || '<p class="empty">Nothing starts in the next 24 hours.</p>'; return;
    }
    if (selDay) {
      var d = new Date(selDay + 'T12:00'), evs = filtered(dayEvents(d)).sort(function (a, b) { return a.start - b.start; });
      var dayRegional = regDay(d).filter(function (e) { return regSel === 'all' || regSel === 'global' || e.area === regSel; });
      html += '<div class="dayhead"><h2 class="sec2">' + esc(fmtD(d)) + '</h2><button type="button" class="pill all" data-clearday="1">Show week</button></div>';
      html += evs.map(function (e) { return card(e); }).join('') + dayRegional.map(function (e) { return agendaRow(e, true); }).join('');
      if (!evs.length && !dayRegional.length) html += '<p class="empty">Nothing listed for this day.</p>';
      el.innerHTML = html; return;
    }
    /* The week arrows control both the strip and this list. Show every event overlapping
       the selected Monday–Sunday range; selecting an individual date is optional. */
    var all = filtered(EV).filter(function (e) { return e.start < we && e.end > ws; });
    if (weekOff === 0) all = all.filter(function (e) { return phase(e, t) !== 'ended'; });
    all.sort(function (a, b) { return a.start - b.start; });
    var live = weekOff === 0 ? all.filter(function (e) { return phase(e, t) === 'live'; }) : [];
    var regionalLive = weekOff === 0 ? regList().filter(function (e) { return e.start <= t && e.end > t; }) : [];
    var liveShort = live.filter(function (e) { return !e.long; });
    var liveLong = live.filter(function (e) { return e.long; });
    if (liveShort.length || regionalLive.length) html += '<h2 class="sec2">Happening now</h2>' + liveShort.map(function (e) { return card(e); }).join('') + regionalLive.map(function (e) { return agendaRow(e, true); }).join('');
    if (liveLong.length) html += '<details class="dd" style="margin-top:10px"><summary>Long-running <span class="cnt">' + liveLong.length + '</span></summary><div class="body">' + liveLong.map(function (e) { return card(e, { compact: true }); }).join('') + '</div></details>';
    var rest = all.filter(function (e) { return live.indexOf(e) < 0; });
    var underway = rest.filter(function (e) { return e.start < ws; });
    if (underway.length) html += '<h2 class="sec2 dh">Already underway</h2>' + underway.map(function (e) { return card(e); }).join('');
    var groups = {}, order = [];
    rest.filter(function (e) { return e.start >= ws; }).forEach(function (e) {
      var k = dayKey(e.start);
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(e);
    });
    var today = dayKey(t), tmw = dayKey(addDays(t, 1));
    order.forEach(function (k) {
      var d = new Date(k + 'T12:00');
      html += '<h2 class="sec2 dh">' + (weekOff === 0 && k === today ? 'Today' : weekOff === 0 && k === tmw ? 'Tomorrow' : esc(fmtD(d))) + '</h2>' + groups[k].map(function (e) { return card(e); }).join('');
    });
    if (!html) html = '<p class="empty">No events match that filter for this week.</p>';
    el.innerHTML = html;
  }

  /* ---------- Calendar: month grid, plus a compact Day / Week / Month list, with worldwide in-person events ---------- */
  var REG = [], regSel = 'all', scopeSel = 'month', REGCOL = '#2bb3a3';
  var REGIONS = [['all', 'Everything'], ['global', 'In the game'], ['Asia', 'Asia'], ['Americas', 'Americas'], ['Europe', 'Europe'], ['Oceania', 'Oceania']];
  var UNDATED = [], REGGAZ = {};
  function loadWorld(j, seed) {
    var list = (j.events || []).map(function (e) {
      var src = seed ? j.source : { url: (e.sources && e.sources[0] && e.sources[0].url) || e.url || '#', n: e.sources ? e.sources.length : 1 };
      if (!e.start) return { undated: true, name: e.name, place: e.place, area: e.area, scope: e.scope, src: src };
      var s0 = new Date(e.start + 'T00:00'), e0 = new Date((e.end || e.start) + 'T23:59');
      return { id: e.id, name: e.name, place: e.place || '', area: e.scope === 'global' ? 'In the game' : e.area, scope: e.scope || 'regional', start: s0, end: e0, long: (e0 - s0) > 14 * 864e5, src: src };
    });
    /* An announcement with no dates of its own (e.g. Gigantamax Duraludon at the Sendai Wild Area) takes the dates of the
       dated event at the same place whose name it shares a distinctive word with. */
    list.forEach(function (x, i) {
      if (!x.undated) return;
      var words = String(x.name).toLowerCase().match(/wild area|go fest|safari|community day|go tour|go park/);
      var host = words && list.filter(function (y) { return !y.undated && y.place === x.place && String(y.name).toLowerCase().indexOf(words[0]) >= 0; })[0];
      if (host) list[i] = { id: 'dated:' + host.id + ':' + i, name: x.name, place: x.place, area: host.area, scope: x.scope || 'regional', start: host.start, end: host.end, long: host.long, src: x.src };
    });
    UNDATED = list.filter(function (x) { return x.undated; });
    REG = list.filter(function (x) { return !x.undated; });
    /* One event, one row: the same event listed twice under different ids or wordings is joined by the shared rule in dedupe.js. */
    REGGAZ = {};
    REG.forEach(function (x) { if (window.GODEDUPE) { var t = GODEDUPE.placeTokens(x.place); for (var k in t) REGGAZ[k] = 1; } });
    if (window.GODEDUPE) {
      var asEv = function (x) { return { id: x.id, name: x.name, place: x.place, start: +x.start, end: +x.end }; };
      var gone = {};
      GODEDUPE.groups(REG.map(asEv), null).forEach(function (g) { g.dupes.forEach(function (d) { gone[d.event.id] = 1; }); });
      REG = REG.filter(function (x) { return !gone[x.id]; });
    }
    renderCalendar(); renderHomeAgenda(); renderTimeline();
  }
  fetch('/world-events.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
    if (j && (j.events || []).length) return loadWorld(j, false);
    return fetch('/regional-events.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (k) { if (k) loadWorld(k, true); });
  });
  function words(n) { return String(n).toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 4 && !/^(pokemon|event|festival|during|enjoy|bountiful|debut|chance|encounter|storms|fireball|rescue|explore)$/.test(w); }); }
  function regList() { // an announced game event the live feed already shows is not listed twice
    return REG.filter(function (x) {
      if (x.end <= now() || isHidden(x.id)) return false;
      /* A world-list item that is the same event as one of our own cards is not listed twice (e.g. "GO Wild Area: Sendai" and "GO Wild Area 2026 Sendai Tohoku"). */
      if (window.GODEDUPE && EV.some(function (ev) { return GODEDUPE.same({ name: x.name, place: x.place, start: +x.start, end: +x.end }, { name: ev.name, place: '', start: +ev.start, end: +ev.end }, REGGAZ).verdict === 'same'; })) return false;
      if (x.scope !== 'global') return true;
      var w = words(x.name);
      return !EV.some(function (ev) { return ev.start <= x.end && ev.end >= x.start && words(ev.name).some(function (t) { return w.indexOf(t) >= 0; }); });
    });
  }
  function regDay(day) {
    var d0 = startOfDay(day).getTime(), d1 = d0 + 864e5;
    return regList().filter(function (r) {
      if (r.end.getTime() <= d0 || r.start.getTime() >= d1) return false;
      return !r.long || startOfDay(r.start).getTime() === d0;
    });
  }
  function calItems(day) {
    var g = regSel === 'all' || regSel === 'global' ? dayEvents(day) : [], r = regDay(day).filter(function (x) { return regSel === 'all' || (regSel === 'global' ? x.scope === 'global' : x.scope !== 'global' && x.area === regSel); });
    return { g: g, r: r };
  }
  function agendaRow(it, isReg) {
    var pl = isReg && window.GOPLACES ? GOPLACES.forEvent(it) : [];  // real-life events with sourced venues get a pin button
    var pin = pl.length ? '<button type="button" class="agx agpin" data-places="' + (pl.length === 1 ? esc(pl[0].id) : '') + '" data-placesq="' + (pl.length === 1 ? '' : esc(it.name)) + '" aria-label="Location and coordinates for ' + esc(it.name) + '" title="Location and coordinates">📍<span>Coords</span></button>' : '';
    var ig = isReg ? '<button type="button" class="agx agig" data-igcard="' + esc(it.id) + '" data-infographic="' + esc(it.id) + '" aria-label="Open infographic for ' + esc(it.name) + '"></button>' : '';
    return '<div class="agw">' + agendaInner(it, isReg) + '<div class="ag-actions">' + pin + ig + '<button type="button" class="agx" data-hide="' + esc(it.id) + '" aria-label="Hide ' + esc(it.name) + '" title="Hide">✕</button></div></div>';
  }
  function agendaInner(it, isReg) {
    if (isReg) {
      var mult = it.end.getTime() - it.start.getTime() > 864e5;
      var when = mult ? fmtD(it.start) + ' to ' + fmtD(it.end) : fmtD(it.start);
      return '<a class="agr reg" href="' + esc(it.src.url) + '" target="_blank" rel="noopener noreferrer" style="--k:' + REGCOL + '"><i></i><span class="agt"><b>' + esc(it.name) + '</b><small>' + esc(it.place) + ' · ' + esc(when) + '</small></span><em>' + esc(it.area) + '</em></a>';
    }
    var k = kindOf(it);
    return '<button type="button" class="agr" data-open="' + esc(it.id) + '" style="--k:' + k[1] + '"><i></i><span class="agt"><b>' + esc(it.name) + '</b><small>' + esc(whenText(it)) + '</small></span><em>' + esc(k[0]) + '</em></button>';
  }
  document.addEventListener('goplaces', function () { renderCalendar(); });
  document.addEventListener('toggle', function (e) { var d = e.target; if (d && d.matches && d.matches('#calreg details.dd[data-k]')) d.setAttribute('data-was', d.open ? '1' : '0'); }, true);
  function renderCalendar() {
    var g = $('calgrid'); if (!g) return;
    if (!calMonth) { var n = now(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
    $('calttl').textContent = MON[calMonth.getMonth()] + ' ' + calMonth.getFullYear();
    var chips = $('calreg');
    var ddOpen = {}; if (chips) Array.prototype.forEach.call(chips.querySelectorAll('details.dd[data-k]'), function (d) { ddOpen[d.getAttribute('data-k')] = d.open; });
    if (chips) chips.innerHTML = '<div class="rgrow">' + REGIONS.map(function (r) { return '<button type="button" class="fchip" data-creg="' + r[0] + '" aria-pressed="' + (regSel === r[0]) + '">' + esc(r[1]) + '</button>'; }).join('') + '</div>'
      + '<span class="seg" role="group" aria-label="Range">' + [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(function (r) { return '<button type="button" class="fchip" data-cscope="' + r[0] + '" aria-pressed="' + (scopeSel === r[0]) + '">' + r[1] + '</button>'; }).join('') + '</span>' + (UNDATED.length && (regSel === 'all' || regSel === 'global') ? '<details class="dd" data-k="undated"><summary>Announced, date not published yet (' + UNDATED.length + ')</summary><div class="body">' + UNDATED.map(function (u) { return '<a class="agr reg" href="' + esc(u.src.url) + '" target="_blank" rel="noopener noreferrer" style="--k:' + REGCOL + '"><i></i><span class="agt"><b>' + esc(u.name) + '</b><small>' + esc(u.place || 'Dates to be announced') + '</small></span><em>' + esc(u.area || '') + '</em></a>'; }).join('') + '</div></details>' : '');
    var hl = hiddenList().map(function (id) { var e = EV.filter(function (x) { return x.id === id; })[0] || REG.filter(function (x) { return x.id === id; })[0]; return e && e.end > now() ? { id: id, name: e.name } : null; }).filter(Boolean);
    if (chips && hl.length) chips.innerHTML += '<details class="dd" data-k="hidden"><summary>Hidden by you (' + hl.length + ')</summary><div class="body">' + hl.map(function (h) { return '<div class="hid"><span>' + esc(h.name) + '</span><button type="button" class="more" data-unhide="' + esc(h.id) + '">Show again</button></div>'; }).join('') + '</div></details>';
    if (chips) Array.prototype.forEach.call(chips.querySelectorAll('details.dd[data-k]'), function (d) { if (ddOpen[d.getAttribute('data-k')]) d.open = true; });
    var first = (calMonth.getDay() + 6) % 7, days = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate(), today = dayKey(now());
    var h = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (x) { return '<span class="ch">' + x + '</span>'; }).join('');
    for (var i = 0; i < first; i++) h += '<span class="cc empty"></span>';
    for (var d = 1; d <= days; d++) {
      var dt = new Date(calMonth.getFullYear(), calMonth.getMonth(), d), k = dayKey(dt), it = calItems(dt), cnt = it.g.length + it.r.length;
      var dots = it.g.slice(0, 3).map(function (e) { return '<i style="background:' + kindOf(e)[1] + '"></i>'; }).join('') + it.r.slice(0, 2).map(function () { return '<i class="rg" style="background:' + REGCOL + '"></i>'; }).join('');
      h += '<button type="button" class="cc' + (k === today ? ' today' : '') + (k === calSel ? ' sel' : '') + '" data-cday="' + k + '" aria-label="' + esc(fmtD(dt)) + ', ' + cnt + ' events"><b>' + d + '</b><em>' + dots + '</em></button>';
    }
    g.innerHTML = h;
    // Compact list for the chosen range
    var anchor = calSel ? new Date(calSel + 'T12:00') : (dayKey(now()).slice(0, 7) === dayKey(calMonth).slice(0, 7) ? startOfDay(now()) : calMonth);
    var r0, r1, ttl;
    if (scopeSel === 'day') { r0 = startOfDay(anchor); r1 = addDays(r0, 1); ttl = fmtD(r0); }
    else if (scopeSel === 'week') { var dow = (anchor.getDay() + 6) % 7; r0 = addDays(startOfDay(anchor), -dow); r1 = addDays(r0, 7); ttl = 'Week of ' + fmtD(r0); }
    else { r0 = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1); r1 = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); ttl = MON[calMonth.getMonth()] + ' ' + calMonth.getFullYear(); }
    var seen = {}, rows = [];
    for (var t = new Date(r0); t < r1; t = addDays(t, 1)) {
      var x = calItems(t);
      x.g.forEach(function (e) { if (!seen[e.id]) { seen[e.id] = 1; rows.push({ at: e.start, e: e, html: agendaRow(e, false) }); } });
      x.r.forEach(function (e) { if (!seen[e.id]) { seen[e.id] = 1; rows.push({ at: e.start, e: e, html: agendaRow(e, true) }); } });
    }
    regList().forEach(function (e) { if (e.long && !seen[e.id] && e.end > r0 && e.start < r1 && (regSel === 'all' || (regSel === 'global' ? e.scope === 'global' : e.scope !== 'global' && e.area === regSel))) { seen[e.id] = 1; rows.push({ at: e.start, e: e, html: agendaRow(e, true) }); } });
    rows.sort(function (a, b) { return a.at - b.at; });
    /* Thin dividers: ongoing (month-long) first, then one rule per week, so the weeks are easy to tell apart. */
    function groupRows(list) {
      if (scopeSel === 'day') return list.map(function (r) { return r.html; }).join('');
      var ong = list.filter(function (r) { return r.e && (r.e.long || (r.e.end - r.e.start) > 10 * 864e5); }), rest = list.filter(function (r) { return ong.indexOf(r) < 0; });
      var html = '', lastWk = null;
      if (ong.length) html += '<div class="agenda-div"><span>Ongoing</span></div>' + ong.map(function (r) { return r.html; }).join('');
      rest.forEach(function (r) {
        var d0 = startOfDay(new Date(Math.max(r.at, r0))), wk = addDays(d0, -((d0.getDay() + 6) % 7)), key = dayKey(wk);
        if (key !== lastWk) { lastWk = key; html += '<div class="agenda-div"><span>Week of ' + esc(fmtD(wk)) + '</span></div>'; }
        html += r.html;
      });
      return html;
    }
    var out = $('calday');
    out.innerHTML = '<h2 class="sec2" style="margin-top:6px">' + esc(ttl) + ' <span class="m">' + rows.length + (rows.length === 1 ? ' event' : ' events') + '</span></h2>'
      + (rows.length ? '<div class="agenda">' + groupRows(rows) + '</div>' : '<p class="empty">Nothing listed for this ' + scopeSel + ' with this filter.</p>')
      + '<p class="note">Teal dots and rows are in-person and regional events around the world. Dates come from the linked source; local start times are on the event\'s own page.</p>';
  }

  /* ---------- Unified weekly raid + Max Battle rotation ---------- */
  var rotWeekTab = 'this';
  /* Each rotating 5-star, Mega and Shadow boss is linkable like an event (infographics, guides). Same ids as scripts/g47ix-publish.mjs. */
  function slug(n) { return String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function raidSlots() {
    var out = [], seen = {};
    function canonicalBoss(value) {
      return String(value || '').replace(/, to .*/, '').trim()
        .replace(/^Origin Forme Giratina$/i, 'Giratina (Origin Forme)')
        .replace(/^Altered Forme Giratina$/i, 'Giratina (Altered Forme)')
        .replace(/^Giratina Origin Forme$/i, 'Giratina (Origin Forme)')
        .replace(/^Giratina Altered Forme$/i, 'Giratina (Altered Forme)');
    }
    ((D.rotation) || []).forEach(function (r) {
      [['five', '5-star raids'], ['mega', 'Mega raids'], ['shadow', 'Shadow raids']].forEach(function (k) {
        var boss = canonicalBoss(r[k[0]]); if (!boss) return;
        var start = new Date(r.s), end = new Date(r.e);
        if (!Number.isFinite(+start) || !Number.isFinite(+end)) return;
        var name = boss + (k[0] === 'five' ? ' 5-star raids' : ' raids');
        var key = slug(boss) + ':' + +start + ':' + +end + ':' + k[0];
        if (seen[key]) return;
        seen[key] = 1;
        out.push({ id: 'raid:' + slug(boss) + ':' + String(r.s).slice(0, 10), name: name, kind: 'raid', start: start, end: end, featured: [{ name: boss }], bonuses: [], notes: [], tags: [], source: 'Raid rotation', rotationBoss: boss });
      });
    });
    return out;
  }
  function raidSlotFor(boss, r) { var id = 'raid:' + slug(String(boss || '').replace(/, to .*/, '').trim()) + ':' + String(r.s).slice(0, 10); return raidSlots().filter(function (x) { return x.id === id; })[0]; }
  function renderRot() {
    var el = $('rotnow'); if (!el || !D.rotation) return;
    var t = now(), rot = D.rotation, max = D.maxBattles || [];
    var day = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    var monday = new Date(day); monday.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    function addDay(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
    function key(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
    function range(a,b) { return fmtD(a) + ' – ' + fmtD(b); }
    function rotAt(d) { return rot.filter(function(r){ return new Date(r.s) <= d && d < new Date(r.e); })[0]; }
    function tico(t, ttl) { return '<img class="ti" src="/ico/g/type-' + String(t).toLowerCase() + '.webp" alt="' + esc(t) + '" title="' + esc(t) + '" loading="lazy">'; }
    function raidEvent(name, r) { return raidSlotFor(name, r) || null; }
    function cell(label, name, r) {
      if (!name) return '';
      /* One Pokémon per row. A slot naming both Mega Charizard forms becomes two rows, each with full-size art. */
      var names = /^Mega Charizard X and Y$/i.test(name) ? ['Mega Charizard X', 'Mega Charizard Y'] : [name];
      return names.map(function (n) {
        var f = window.GOTYPES && GOTYPES.facts(n), real = window.GOLIB && GOLIB.raidEventFor(EV, n, label, new Date(r.s).getTime(), new Date(r.e).getTime()), ev = real || raidEvent(n, r);
        var ib = ev ? '<button type="button" class="info-open rc-info" data-infographic="' + esc(ev.id) + '" aria-label="Open infographic for ' + esc(n) + '">▧ Infographic</button>' : '';
        if (real) ib += '<button type="button" class="rc-info rc-details" data-open="' + esc(real.id) + '" aria-label="Open event details for ' + esc(n) + '">ⓘ Details</button>';
        return '<div class="rc"' + (label === '5★' || label === 'Mega' ? ' data-guide="' + esc(n) + '"' : '') + '><div class="rc-form">' + art(n, 'ea') + '<div class="rc-txt"><span class="rl">' + label + '</span><b>' + esc(n) + '</b>' +
          (f ? '<span class="rtype">' + f.types.map(function (t) { return tico(t); }).join('') + '</span><span class="rweak" title="Weak to">▾ ' + f.weak.map(function (t) { return tico(t); }).join('') + '</span>' : '') + '</div></div>' + ib + '</div>';
      }).join('');
    }
    function lowTier(r) {
      /* 1-3 star bosses, where a source has published them for that rotation. */
      var l = r && r.low; if (!l) return '<p class="muted rw-low">1–3★ raid bosses are not announced for this rotation yet.</p>';
      return '<div class="rw-low"><span class="rw-label">1–3★ raids' + (l.shadowOne || l.shadowThree ? ' and Shadow raids' : '') + (l.observed ? ' · as of ' + esc(fmtD(new Date(l.observed + 'T12:00'))) : '') + '</span><div class="rcs rcs-low">' +
        [['1★', l.one], ['3★', l.three], ['Shadow 1★', l.shadowOne], ['Shadow 3★', l.shadowThree]].map(function (g) { return (g[1] || []).map(function (n) { return cell(g[0], n, r); }).join(''); }).join('') + '</div></div>';
    }
    function weekCard(offset) {
      var a = addDay(monday, offset * 7), b = addDay(a, 6), mid = addDay(a, 2); mid.setHours(11, 0, 0, 0);
      var first = rotAt(a), second = rotAt(mid);
      var mb = max.filter(function(m){ return m[0] <= key(b) && m[1] >= key(a); })[0];
      var body = '';
      var activeRotation = rot.filter(function (r) { return new Date(r.s) <= t && t < new Date(r.e); })[0];
      var isCurrentWeek = key(a) <= key(t) && key(t) <= key(b);
      var rotationRows = [];
      if (isCurrentWeek) {
        if (activeRotation) rotationRows.push({ r: activeRotation, label: 'Current raid rotation', cls: 'rw-current' });
        // For this week, omit any rotation that has already ended; show only a future change.
        if (!rotationRows.length && first && new Date(first.e) > t) rotationRows.push({ r: first, label: 'Raid rotation this week', cls: '' });
      } else if (new Date(a) > t) {
        // Future week cards must be calculated from that week's dates, never the globally active rotation.
        if (first) rotationRows.push({ r: first, label: 'At start of week', cls: '' });
        if (second && second !== first) rotationRows.push({ r: second, label: 'From ' + fmtD(new Date(second.s)) + ', 10 am', cls: 'rw-next' });
      }
      if (!rotationRows.length) body += '<p class="empty">No raid rotation published for this week yet.</p>';
      rotationRows.forEach(function (row) {
        var r = row.r;
        body += '<div class="rw-raid ' + row.cls + '"><span class="rw-label">' + esc(row.label) + '</span><div class="rcs">' +
          cell('5★', r.five, r) + cell('Mega', r.mega, r) + cell('Shadow', String(r.shadow || '').replace(/, to .*/, ''), r) + '</div>' + lowTier(r) + '<p class="evc-when">Raid Hour: ' + esc(r.rh || 'Not listed') + '</p></div>';
      });
      body += mb ? '<div class="rw-max"><span class="rw-label">Max Monday · ' + esc(fmtD(new Date(mb[0] + 'T12:00'))) + ' · 6 am–9 pm</span><div class="rw-max-pokemon">' + monArt({ kind: 'max', tags: [], name: '' }, { name: mb[2] }, 'ea') + '<div><b>' + esc(mb[2]) + '</b><small>Featured Max Pokémon at Power Spots</small></div></div></div>' :
        '<div class="rw-max"><span class="rw-label">Max Battles</span><p class="muted">No featured Pokémon published for this week yet.</p></div>';
      return '<article class="rotc rw-card"><div class="rw-week-head"><span class="kind">' + esc(offset === 0 ? 'This week' : 'Week of ' + fmtD(a)) + '</span><b>' + esc(range(a,b)) + '</b></div>' + body + '</article>';
    }
    var labels = [{id:'this',text:'This week'},{id:'next',text:'Next week'},{id:'following',text:'Following week'},{id:'future',text:'Future'}];
    var offsets = rotWeekTab === 'this' ? [0] : rotWeekTab === 'next' ? [1] : rotWeekTab === 'following' ? [2] : [3,4,5];
    var knownOffsets = offsets.filter(function(off){
      var a = addDay(monday, off * 7), b = addDay(a, 6), mid = addDay(a,2);
      return !!rotAt(a) || !!rotAt(mid) || max.some(function(m){ return m[0] <= key(b) && m[1] >= key(a); });
    });
    var tabs = '<div class="rw-tabs" role="tablist" aria-label="Rotation week">' + labels.map(function(x){
      var selected = rotWeekTab === x.id;
      return '<button type="button" class="pill' + (selected ? ' now' : '') + '" data-rotweek="' + x.id + '" role="tab" aria-selected="' + selected + '">' + x.text + '</button>';
    }).join('') + '</div>';
    var cards = knownOffsets.map(weekCard).join('');
    el.innerHTML = '<div class="prio-head"><h2 class="sec2">Raid & Max Battle rotation</h2></div>' + tabs +
      (cards ? '<div class="rw-list">' + cards + '</div>' : '<p class="empty">No further rotations are published yet.</p>') +
      '<p class="note">Raid bosses change Wednesdays at 10 am local time. Max Battles feature a new Pokémon on Mondays, 6 am–9 pm local time. Future weeks appear only where schedule data is available.</p>';
    addGuideLinks(el);
  }
  /* A "Counters guide" button on each 5-star and Mega boss, shown only when /api/guide finds the guide (so it never links to a missing page). */
  var guideCache = {};
  function addGuideLinks(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.rc[data-guide]'), function (row) {
      var boss = row.getAttribute('data-guide');
      if (!boss) return;
      var put = function (d) {
        if (!d || !d.page || !row.isConnected || row.querySelector('.rc-guide')) return;
        var a = document.createElement('a'); a.className = 'rc-info rc-guide'; a.href = d.page; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = '⚔ Counters guide'; a.setAttribute('aria-label', 'Counters guide for ' + boss + ' on Pokebattler, by CaptGoldfish');
        row.appendChild(a);
      };
      if (guideCache[boss] !== undefined) return put(guideCache[boss]);
      guideCache[boss] = null;
      fetch('/api/guide?boss=' + encodeURIComponent(boss)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        guideCache[boss] = d && d.url && /^https:\/\/www\.pokebattler\.com\//.test(d.page || '') ? d : null; put(guideCache[boss]);
      }).catch(function () { guideCache[boss] = null; });
    });
  }
  document.addEventListener('click', function(e) {
    var b = e.target.closest && e.target.closest('[data-rotweek]');
    if (!b) return;
    rotWeekTab = b.getAttribute('data-rotweek');
    renderRot();
  });

  document.addEventListener('gotypes', function () { try { renderRot(); } catch (e) {} });


  /* ---------- Collection: what I know about your Dex ---------- */
  function renderCoverage() {
    var tab = $('tab-dex'); if (!tab || !Object.keys(DEXGEN).length) return;
    var host = $('gencov');
    if (!host) { host = document.createElement('div'); host.id = 'gencov'; host.className = 'gencov'; tab.insertBefore(host, tab.firstChild); host.addEventListener('click', function (e) { var b = e.target.closest('[data-gen]'); if (!b) return; setGenConfirmed(+b.dataset.gen, b.getAttribute('aria-pressed') !== 'true'); renderCoverage(); renderAll(); if (window.GO && GO.refreshDex) GO.refreshDex(); }); }
    var d = marks(), own = (d.m && d.m.own) || {}, gens = {}, total = 0, owned = 0, conf = [], auto = [];
    Object.keys(DEXGEN).forEach(function (id) { var g = DEXGEN[id]; gens[g] = (gens[g] || 0) + 1; if (genConfirmed(g)) { total++; if (own[id]) owned++; } });
    Object.keys(gens).sort(function (a, b) { return a - b; }).forEach(function (g) { if (genConfirmed(+g)) { conf.push(g); if (genAutoComplete(+g) && usGet('pref:gen:' + g) !== true) auto.push(g); } });
    var all = Object.keys(DEXGEN).length, rest = all - total;
    var open = host.querySelector('details') && host.querySelector('details').open;
    host.innerHTML = '<details class="dd"' + (open ? ' open' : '') + '><summary>Which generations count as Need? <span class="cnt">' + (total ? conf.length + ' of ' + Object.keys(gens).length : 'none yet') + '</span></summary><div class="body">'
      + '<p class="note">' + (total ? 'Gen ' + conf.join(', ') + ' confirmed. Anything unticked there counts as Need; the other generations are left alone.' : 'Pick a generation once you have ticked everything you own in it. Unticked Pokémon there then show as Need on events. Until then nothing is called Need.') + '</p>'
      + '<div class="gc-grid" role="group" aria-label="Confirm generations">' + Object.keys(gens).sort(function (a, b) { return a - b; }).map(function (g) {
        var on = genConfirmed(+g);
        return '<button type="button" class="gc ' + (on ? 'ok' : 'un') + '" data-gen="' + g + '" aria-pressed="' + on + '">' + (on ? '✓ ' : '') + 'Gen ' + g + (genAutoComplete(+g) ? ' · complete' : on ? ' · confirmed' : '') + '</button>';
      }).join('') + '</div></div></details>';
  }
  document.addEventListener('gofn-state', function () { try { renderCoverage(); } catch (e) { } });
  document.addEventListener('gofn-view', function () { try { renderCoverage(); } catch (e) { } });
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#dexlist')) setTimeout(function () { try { renderCoverage(); } catch (x) { } }, 0); });

  /* ---------- Mega collection + future preparation ---------- */
  /* Only officially released Mega forms are listed. Do not present speculative species as future releases. */
  var EXTRA_MOVE = ['Beedrill','Houndoom','Victreebel','Dragonite','Malamar','Falinks','Skarmory','Raichu X','Raichu Y','Starmie','Chesnaught','Delphox','Greninja','Staraptor','Mewtwo X','Mewtwo Y'];
  var UPCOMING_EXTRA_MOVE = { Manectric: '2026-10-13', Sableye: '2026-11-01' };
  var MEGAS=[
    'Venusaur','Charizard X','Charizard Y','Blastoise','Beedrill','Pidgeot','Alakazam','Slowbro','Gengar','Kangaskhan','Pinsir','Gyarados','Aerodactyl','Mewtwo X','Mewtwo Y','Ampharos','Steelix','Scizor','Heracross','Houndoom','Tyranitar','Sceptile','Blaziken','Swampert','Gardevoir','Sableye','Mawile','Aggron','Medicham','Manectric','Sharpedo','Camerupt','Altaria','Banette','Absol','Glalie','Salamence','Metagross','Latias','Latios','Rayquaza','Lopunny','Garchomp','Lucario','Abomasnow','Gallade','Audino','Diancie','Victreebel','Dragonite','Malamar','Falinks','Skarmory','Raichu X','Raichu Y','Starmie','Chesnaught','Delphox','Greninja','Staraptor'
  ].map(function(name){return [name,'released',EXTRA_MOVE.indexOf(name)>-1,UPCOMING_EXTRA_MOVE[name]||''];});
  /* Extra Charged Attack names as listed by Leek Duck (Mega updates); Manectric's is from the event page. Blank = eligible, name not yet published. */
  var EXTRA_NAME = {'Raichu X':'Volt Tackle+','Raichu Y':'Zap Cannon+','Skarmory':'Drill Peck+','Falinks':'Brick Break+','Starmie':'Liquidation+','Victreebel':'Acid Spray+','Malamar':'Psybeam+','Dragonite':'Outrage+','Chesnaught':'Seed Bomb+','Delphox':'Mystical Fire+','Greninja':'Surf+','Manectric':'Discharge+','Mewtwo X':'Dynamic Punch+','Mewtwo Y':'Future Sight+'};
  /* Megas announced for GO but not out yet come from release-status.json. */
  var MEGA_FUTURE = ['Meganium','Feraligatr','Clefable','Hawlucha','Dragalge','Barbaracle','Pyroar','Scolipede','Excadrill','Chandelure','Emboar','Eelektross','Scrafty','Froslass','Drampa','Zygarde','Chimecho','Absol Z','Garchomp Z','Lucario Z','Heatran','Golurk','Meowstic','Crabominable','Golisopod','Zeraora','Scovillain','Glimmora','Tatsugiri','Baxcalibur','Magearna','Floette','Darkrai'].map(function (n) { return [n, 'future', false, '']; });
  var MEGA_ANN = {}; /* names Niantic has announced; the rest of the list is from Serebii's roster and is not announced for GO */
  try { fetch('/release-status.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (R) { if (!R || !R.unreleased) return; R.unreleased.forEach(function (u) { var m = /^Mega\s+(.+)$/i.exec(u.name || ''); if (m) MEGA_ANN[m[1]] = 1; if (m && MEGAS.every(function (x) { return x[0] !== m[1]; }) && MEGA_FUTURE.every(function (x) { return x[0] !== m[1]; })) MEGA_FUTURE.push([m[1], 'future', false, '']); }); try { renderMegas(); } catch (e) { } }).catch(function () { }); } catch (e) { }
  function megaKey(name,field){return 'mega:'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+':'+field;}
  function megaVal(name,field){return usGet(megaKey(name,field))===true;}
  function renderMegas(){
    var host=$('mega-list'); if(!host)return;
    var q=String(($('mega-search')||{}).value||'').toLowerCase().trim(), filter=($('mega-filter')||{}).value||'all';
    var goal=(document.querySelector('input[name="mega-goal"]:checked')||{}).value||'hundo';
    var rows=MEGAS.concat(MEGA_FUTURE).filter(function(m){
      var n=m[0],released=m[1]==='released',h=megaVal(n,'hundo'),sh=megaVal(n,'shundo'),sm=megaVal(n,'supermax'),mv=m[2]===true,upcoming=m[3];
      if(q&&!n.toLowerCase().includes(q))return false;
      if(filter==='released'&&!released)return false;if(filter==='future'&&released)return false;
      if(filter==='supermax'&&!sm)return false;if(filter==='move'&&!mv&&!upcoming)return false;
      if(filter==='maxlevel'&&!megaVal(n,'maxlevel'))return false;if(filter==='nomax'&&megaVal(n,'maxlevel'))return false;if(filter==='hundo'&&!h)return false;if(filter==='shundo'&&!sh)return false;
      if(filter==='unprepared'&&(goal==='hundo'?h:goal==='shundo'?sh:h&&sh))return false;
      return true;
    });
    var releasedCount=MEGAS.length;
    var cnt=function(f){return MEGAS.filter(function(m){return megaVal(m[0],f)}).length};
    var hc=cnt('hundo'),shc=cnt('shundo'),mlc=cnt('maxlevel');
    var ready=MEGAS.filter(function(m){return megaVal(m[0],'hundo')&&megaVal(m[0],'maxlevel')}).length;
    var none=MEGAS.filter(function(m){return !megaVal(m[0],'hundo')&&!megaVal(m[0],'shundo')}).length;
    var maxed=MEGAS.filter(function(m){return megaVal(m[0],'supermax')}).length;
    var moveCount=MEGAS.filter(function(m){return m[2]===true}).length;
    var upcomingCount=MEGAS.filter(function(m){return !!m[3]}).length;
    var tile=function(n,l,of){return '<div class="mega-stat"><b>'+n+(of?'<small>/'+of+'</small>':'')+'</b><span>'+l+'</span></div>'};
    $('mega-summary').innerHTML=tile(hc,'Hundo ready',releasedCount)+tile(shc,'Shundo ready',releasedCount)+tile(mlc,'Maxed out',releasedCount)+tile(maxed,'Super Max achieved',releasedCount)+tile(ready,'Hundo and max level',releasedCount)+tile(none,'No hundo or shundo yet',releasedCount)+tile(moveCount,'Extra-move eligible',releasedCount);
    host.innerHTML=rows.length?rows.map(function(m){
      var n=m[0],released=m[1]==='released',h=megaVal(n,'hundo'),sh=megaVal(n,'shundo'),sm=megaVal(n,'supermax'),mv=m[2]===true,upcoming=m[3];
      var full='Mega '+n, en=EXTRA_NAME[n];
      return '<article class="mega-row"><div class="mega-mon"><div class="mega-pair">'+art(full,'ea')+'</div><div class="mega-name"><h3>'+esc(full)+'</h3><span class="mega-status '+(released?'is-released':'is-future')+'">'+(released?'Released in GO':MEGA_ANN[n]?'Announced, not released in GO yet':'Not released in GO yet, not announced')+'</span>'+(mv&&en?'<span class="mega-move">Extra Charged Attack: <b>'+esc(en)+'</b></span>':mv?'<span class="mega-move">Extra Charged Attack: name not published yet</span>':'')+'</div><div class="mega-shiny" title="Shiny '+esc(full)+'">'+art({n:full,shiny:true},'ea')+'</div></div>'
       +'<div class="mega-checks"><label><input type="checkbox" data-mega="'+esc(n)+'" data-field="hundo" '+(h?'checked':'')+'> Hundo ready</label><label><input type="checkbox" data-mega="'+esc(n)+'" data-field="shundo" '+(sh?'checked':'')+'> Shundo ready</label>'
       +'<label><input type="checkbox" data-mega="'+esc(n)+'" data-field="maxlevel" '+(megaVal(n,'maxlevel')?'checked':'')+'> Maxed out</label>'+(released&&(mv||upcoming)?'<label><input type="checkbox" data-mega="'+esc(n)+'" data-field="supermax" '+(sm?'checked':'')+'> Super Max achieved</label><span class="mega-eligibility" aria-label="Additional Charged Attack eligibility">'+(mv?'Extra Charged Attack eligible'+(en?' · '+esc(en):''):'Extra Charged Attack announced · '+upcoming+(en?' · '+esc(en):''))+'</span>':'<span class="mega-pill-red">Super Max not released yet</span>')+'</div></article>';
    }).join(''):(filter==='future'?'<p class="empty">No officially announced unreleased Mega forms are listed yet. Speculative forms are intentionally excluded.</p>':'<p class="empty">No Mega forms match these filters.</p>');
  }
  document.addEventListener('change',function(e){
    var el=e.target;
    if(el.matches&&el.matches('[data-mega][data-field]')){usSet(megaKey(el.dataset.mega,el.dataset.field),el.checked);renderMegas();}
    if(el.name==='mega-goal'||el.id==='mega-filter')renderMegas();
  });
  var mq=$('mega-search');if(mq)mq.addEventListener('input',renderMegas);
  document.addEventListener('gofn-state',function(){try{renderMegas();}catch(e){}});
  document.addEventListener('gofn-view',function(e){if(e.detail&&e.detail.tab==='collect'&&e.detail.sub==='megas')renderMegas();});
  renderMegas();

  /* ---------- Collect: opportunities ---------- */
  function opportunities() {
    var t = now(), by = {};
    EV.forEach(function (ev) {
      if (phase(ev, t) === 'ended' || !announced(ev) || ev.long || ev.start > addDays(t, 28)) return;
      ev.featured.forEach(function (f) {
        if (f.role === 'shiny_form') return;
        var o = ownState(f.name, f.costume), spec = o.tk || o.state === 'form' || LIB.parseForm(f.name).special, key = (spec ? f.name : o.base).toLowerCase();
        if (!by[key]) by[key] = { name: spec ? f.name : o.base, o: o, evs: [], costume: !!f.costume, label: f.label };
        if (by[key].evs.indexOf(ev) < 0) by[key].evs.push(ev);
      });
    });
    var out = Object.keys(by).map(function (k) { by[k].evs.sort(function (a, b) { return a.start - b.start; }); return by[k]; });
    out.sort(function (a, b) { return a.evs[0].start - b.evs[0].start; });
    return out;
  }
  function markBtns(tk, label) {
    var v = usGet(tk);
    return '<div class="mk" role="group" aria-label="Mark ' + esc(label) + '"><button type="button" data-mark="' + esc(tk) + '" data-val="1" aria-pressed="' + (v === 1) + '">Have</button><button type="button" data-mark="' + esc(tk) + '" data-val="0" aria-pressed="' + (v === 0) + '">Need</button>'
      + (v !== undefined ? '<button type="button" data-mark="' + esc(tk) + '" data-val="" class="mk-clear">Clear</button>' : '') + '</div>';
  }
  function oppCard(x) {
    var o = x.o, evs = x.evs.slice(0, 3), chip = { missing: '<span class="st st-need">Need</span>', have: '<span class="st st-n">Have</span>', form: '<span class="st st-d">Not collectible</span>', unknown: '<span class="st st-n">Not tracked</span>' }[o.state];
    var fol = isFollowed(x.name);
    return '<article class="opp ' + o.state + '"><div class="opp-art">' + art({ n: o.base, costume: x.costume }, 'ea') + '</div><div class="opp-main">'
      + '<div class="opp-top"><h3>' + esc(x.name) + '</h3>' + chip + '<button type="button" class="fbtn" data-follow="' + esc(x.name) + '" aria-pressed="' + fol + '" aria-label="' + (fol ? 'Unfollow ' : 'Follow ') + esc(x.name) + '">' + (fol ? '★' : '☆') + '</button></div>'
      + (o.why ? '<p class="muted opp-why">' + esc(o.why) + '</p>' : '')
      + (o.tk ? markBtns(o.tk, x.name) : '')
      + '<ul class="opp-evs">' + evs.map(function (e) { return '<li><b>' + esc(e.name) + '</b><span>' + esc(fmtD(e.start) + (e.allDay ? '' : ', ' + fmtT(e.start))) + ' · ' + esc(countdown(e)) + '</span></li>'; }).join('') + (x.evs.length > 3 ? '<li class="muted">+' + (x.evs.length - 3) + ' more</li>' : '') + '</ul></div></article>';
  }
  function renderOpps() {
    var el = $('opps'); if (!el) return;
    var list = opportunities(), known = Object.keys(DEXGEN).some(function (id) { return genConfirmed(DEXGEN[id]); }) || usKeys('form:').length > 0;
    var need = list.filter(function (x) { return x.o.state === 'missing'; });
    var debut = list.filter(function (x) { return (x.o.state === 'unknown' || x.o.state === 'form') && x.evs.some(function (ev) { return ev.kind === 'debut'; }); });
    var debutKeys = {};
    debut.forEach(function (x) { debutKeys[(x.name || '').toLowerCase()] = true; });
    var unk = list.filter(function (x) { return (x.o.state === 'unknown' || x.o.state === 'form') && !debutKeys[(x.name || '').toLowerCase()]; });
    var have = list.filter(function (x) { return x.o.state === 'have'; });
    var html = '';
    if (!known) html += '<div class="notice"><b>Nothing is counted as Need yet.</b> In My Dex, tick what you own and confirm a generation as complete. Until then everything is shown as not tracked, never as missing.</div>';
    if (need.length) html += '<h2 class="sec2">You still need</h2><div class="opps">' + need.map(oppCard).join('') + '</div>';
    else if (known) html += '<div class="prio-empty"><b>No Pokémon are currently marked Need for the next four weeks.</b><span>Upcoming debuts are shown separately below, even if your Dex is not tracking them yet.</span></div>';
    if (debut.length) html += '<h2 class="sec2 dh">Upcoming Pokémon debuts</h2><p class="note" style="margin-bottom:8px">New Pokémon arriving in announced events. Mark each one Have or Need once you know your collection status.</p><div class="opps">' + debut.map(oppCard).join('') + '</div>';
    if (unk.length) html += '<h2 class="sec2 dh">' + (known ? 'Not tracked yet' : 'Featured soon') + '</h2><p class="note" style="margin-bottom:8px">' + (known ? 'Pokémon in generations you have not confirmed, and forms and costumes you have not marked. Nothing here is assumed missing.' : 'Nothing is assumed missing until you mark something.') + '</p><div class="opps">' + unk.map(oppCard).join('') + '</div>';
    if (have.length) html += '<details class="dd" style="margin-top:10px"><summary>Already in your collection <span class="cnt">' + have.length + '</span></summary><div class="body"><div class="opps">' + have.map(oppCard).join('') + '</div></div></details>';
    if (!list.length) html += '<p class="empty">No featured Pokémon in the next four weeks.</p>';
    el.innerHTML = html;
  }

  /* ---------- Saved and followed ---------- */
  function renderSaved() {
    var fl = $('followed'), sv = $('savedev'); if (!fl || !sv) return;
    var opps = opportunities(), byBase = {};
    opps.forEach(function (x) { byBase[x.o.base.toLowerCase()] = x; });
    fl.innerHTML = followList().length ? '<div class="opps">' + followList().map(function (n) {
      var x = byBase[n.toLowerCase()], o = ownState(n);
      return x ? oppCard(x) : '<article class="opp ' + o.state + '"><div class="opp-art">' + art(n, 'ea') + '</div><div class="opp-main"><div class="opp-top"><h3>' + esc(n) + '</h3><button type="button" class="fbtn" data-follow="' + esc(n) + '" aria-pressed="true" aria-label="Unfollow ' + esc(n) + '">★</button></div><p class="muted opp-why">Not in any scheduled event in the next four weeks.</p></div></article>';
    }).join('') + '</div>' : '<p class="empty">You are not following any Pokémon yet. Add one above and events featuring it get a highlight.</p>';
    var byId = {}; EV.forEach(function (e) { byId[e.id] = e; });
    sv.innerHTML = savedList().length ? savedList().map(function (id) { return byId[id] ? card(byId[id]) : '<article class="evc ended"><div class="evc-main"><h3>No longer listed</h3><p class="evc-when">' + esc(id) + '</p><div class="evc-foot"><button type="button" class="star on" data-save="' + esc(id) + '">★ Remove</button></div></div></article>'; }).join('') : '<p class="empty">No saved events. Tap ☆ Save on an event.</p>';
  }

  /* ---------- wiring ---------- */
  function renderHomeBrief(t) {
    t = t || now();
    var endDay = addDays(startOfDay(t), 1);
    var liveCount = EV.filter(function (e) { return phase(e, t) === 'live' && !e.long && !isHidden(e.id) && !kindHidden(e.kind); }).length;
    var today = EV.filter(function (e) { var ph = phase(e, t); return !e.long && !isHidden(e.id) && !kindHidden(e.kind) && (ph === 'live' || (ph === 'soon' && e.start < endDay)); });
    var regionalToday = regList().filter(function (e) { return e.start <= t && e.end > t; });
    liveCount += regionalToday.length;
    var todayCount = today.filter(function (e) { return e.start > t; }).length;
    var briefTitle = $('day-brief-title'), briefNote = $('day-brief-note');
    if ($('day-live-count')) $('day-live-count').textContent = String(liveCount);
    if ($('day-upcoming-count')) $('day-upcoming-count').textContent = String(todayCount);
    if (briefTitle) briefTitle.textContent = liveCount ? (liveCount === 1 ? 'Something is happening now' : liveCount + ' things happening now') : (todayCount ? 'Your day is coming up' : 'A quieter day in the game');
    if (briefNote) briefNote.textContent = liveCount || todayCount ? (todayCount ? todayCount + ' more starting today' : 'See what is live and what is next.') : 'No scheduled events today. Here is what is coming up next.';
  }
  /* Refresh only today's list when its visible event phases change. This keeps the rest of the agenda and focused controls intact. */
  function renderHomeToday(t, force) {
    t = t || now();
    var endDay = addDays(startOfDay(t), 1);
    var today = EV.filter(function (e) {
      var ph = phase(e, t);
      return !e.long && !isHidden(e.id) && !kindHidden(e.kind) && (ph === 'live' || (ph === 'soon' && e.start < endDay));
    }).sort(function (a, b) { return a.start - b.start; });
    var regionalToday = regList().filter(function (e) { return e.start <= t && e.end > t; });
    var nextUp = EV.filter(function (e) { return phase(e, t) === 'soon' && e.start >= endDay && !e.long && !isHidden(e.id) && !kindHidden(e.kind); }).sort(function (a, b) { return a.start - b.start; })[0];
    var tdEl = $('home-now'); if (!tdEl) return;
    var signature = JSON.stringify({
      day: dayKey(t),
      events: today.map(function (e) { return [e.id, phase(e, t)]; }),
      regional: regionalToday.map(function (e) { return [e.id, e.start, e.end]; }),
      next: nextUp ? [nextUp.id, nextUp.start.getTime()] : null
    });
    if (!force && tdEl.getAttribute('data-render-key') === signature) return;
    tdEl.setAttribute('data-render-key', signature);
    var liveToday = today.filter(function (e) { return phase(e, t) === 'live'; });
    var laterToday = today.filter(function (e) { return phase(e, t) === 'soon'; });
    function phaseGroup(label, count, html) {
      if (!count) return '';
      return '<section class="today-phase-group"><div class="today-phase-head"><span>' + label + '</span><span class="today-phase-count">' + count + '</span></div><div class="today-phase-cards">' + html + '</div></section>';
    }
    tdEl.innerHTML = today.length || regionalToday.length
      ? phaseGroup('Happening now', liveToday.length + regionalToday.length, liveToday.map(function (e) { return card(e); }).join('') + regionalToday.map(function (e) { return agendaRow(e, true); }).join('')) +
        phaseGroup('Later today', laterToday.length, laterToday.map(function (e) { return card(e); }).join(''))
      : '<div class="today-empty"><p class="empty">Nothing is scheduled for today.</p>' +
        (nextUp
          ? '<button type="button" class="today-next-up" data-open="' + esc(nextUp.id) + '" aria-label="Open details for ' + esc(nextUp.name) + '"><span class="today-next-kicker">NEXT UP</span><b>' + esc(nextUp.name) + '</b><span class="today-next-time">' + esc(fmtD(nextUp.start) + ' · ' + fmtT(nextUp.start)) + '</span><span class="today-next-action">View event details <span aria-hidden="true">→</span></span></button>'
          : '<p class="today-empty-note">Check the schedule for upcoming events.</p>') + '</div>';
  }
  function renderWeekGroups(list, t) {
    t = t || now();
    var groups = [], byDay = {};
    list.forEach(function (e) {
      var key = dayKey(e.start), group = byDay[key];
      if (!group) { group = byDay[key] = { key: key, start: e.start, events: [] }; groups.push(group); }
      group.events.push(e);
    });
    var tomorrowKey = dayKey(addDays(startOfDay(t), 1));
    return groups.map(function (group) {
      var tomorrow = group.key === tomorrowKey;
      return '<section class="week-day-group" data-week-day="' + esc(group.key) + '"><div class="week-day-head"><span class="week-day-label">' + (tomorrow ? 'Tomorrow' : esc(fmtD(group.start))) + '</span>'
        + (tomorrow ? '<time datetime="' + esc(group.key) + '">' + esc(fmtD(group.start)) + '</time>' : '')
        + '<span class="week-day-count">' + group.events.length + ' ' + (group.events.length === 1 ? 'event' : 'events') + '</span></div><div class="week-day-events">'
        + group.events.map(function (e) { return card(e); }).join('') + '</div></section>';
    }).join('');
  }
  function renderHomeAgenda() {
    var t = now(), start = startOfDay(t), endDay = addDays(start, 1), endWeek = addDays(start, 7), endNext = addDays(start, 14);
    var endMonth = new Date(t.getFullYear(), t.getMonth() + 1, 1);
    var thisWeek = EV.filter(function (e) { return phase(e, t) === 'soon' && e.start >= endDay && e.start < endWeek && !isHidden(e.id) && !kindHidden(e.kind); }).sort(function (a, b) { return a.start - b.start; });
    var nextWeek = EV.filter(function (e) { return phase(e, t) === 'soon' && e.start >= endWeek && e.start < endNext && !isHidden(e.id) && !kindHidden(e.kind); }).sort(function (a, b) { return a.start - b.start; });
    var later = EV.filter(function (e) { return phase(e, t) === 'soon' && e.start >= endNext && e.start < endMonth && !isHidden(e.id) && !kindHidden(e.kind); }).sort(function (a, b) { return a.start - b.start; });
    function fill(id, list, empty, countId) {
      var el = $(id); list = list.filter(function (e) { return !fyIds[e.id]; });
      if (el) el.innerHTML = list.length ? (id === 'week' ? renderWeekGroups(list, t) : list.map(function (e) { return card(e); }).join('')) : '<p class="empty">' + empty + '</p>';
      var count = countId && $(countId);
      if (count) count.textContent = list.length + (list.length === 1 ? ' event' : ' events');
    }
    var fy = EV.filter(function (e) { var ph = phase(e, t); return !isHidden(e.id) && (ph === 'live' || (ph === 'soon' && e.start < endNext)) && reasonsFor(e).some(function (w) { return /^You (need|follow)/.test(w); }); }).sort(function (a, b) { var al = phase(a, t) === 'live' ? 0 : 1, bl = phase(b, t) === 'live' ? 0 : 1; return al - bl || a.start - b.start; }).slice(0, 4);
    var fys = $('foryou-sec'); if (fys) { fys.hidden = !fy.length; }
    if ($('foryou')) $('foryou').innerHTML = fy.map(function (e) { return card(e); }).join('');
    var fyIds = {}; fy.forEach(function (e) { fyIds[e.id] = 1; });
    renderHomeBrief(t);
    renderHomeToday(t, true);
    fill('week', thisWeek, 'No further events are scheduled in the next seven days.');
    fill('spot', nextWeek, 'No events are scheduled for next week yet.', 'agenda-next-count');
    fill('home-later', later, 'No later events are scheduled for the rest of this month yet.', 'agenda-later-count');
  }
  function renderActionCentre() {
    var wrap = $('action-centre'), items = $('action-centre-items'); if (!wrap || !items) return;
    var next24 = EV.filter(function (e) { return !isHidden(e.id) && !kindHidden(e.kind) && startsSoon(e); }).length;
    var missing = opportunities().filter(function (x) { return x.o.state === 'missing'; }).length;
    var saved = savedList().length;
    var cards = [];
    if (next24) cards.push({key:'events',icon:'◷',title:'Events worth checking',detail:next24 + ' live or starting in the next 24 hours',count:next24,tab:'events'});
    if (missing) cards.push({key:'collect',icon:'◇',title:'Pokémon you still need',detail:missing + ' collection gaps matched to upcoming events',count:missing,tab:'collect'});
    if (saved) cards.push({key:'saved',icon:'☆',title:'Your saved events',detail:saved + ' events in your watchlist',count:saved,tab:'saved'});
    var review = $('igcount');
    if (review && !review.hidden && parseInt(review.textContent,10) > 0) cards.unshift({key:'review',icon:'▤',title:'Infographics to review',detail:review.textContent + ' waiting for your approval',count:parseInt(review.textContent,10),tab:'review'});
    wrap.hidden = !cards.length;
    // Recompute on the minute, but preserve keyboard focus when the summary has not changed.
    var signature = JSON.stringify(cards.map(function (c) { return [c.key, c.title, c.detail, c.count]; }));
    if (items.getAttribute('data-render-key') === signature) return;
    items.setAttribute('data-render-key', signature);
    items.innerHTML = cards.map(function (c) {
      return '<button type="button" class="action-item" data-quick-go="'+c.key+'"><span class="action-icon" aria-hidden="true">'+c.icon+'</span><span class="action-copy"><b>'+esc(c.title)+'</b><small>'+esc(c.detail)+'</small></span><span class="action-count">'+c.count+'</span><span class="action-arrow" aria-hidden="true">›</span></button>';
    }).join('');
  }
  function renderAll() { renderKinds(); renderPrio(); renderHomeAgenda(); renderActionCentre(); renderTypes(); renderStrip(); renderTimeline(); renderCalendar(); renderRot(); renderOpps(); renderSaved(); }
  function tick() { // keep countdowns honest without re-rendering whole views
    var t = now(), byId = {}; EV.forEach(function (e) { byId[e.id] = e; });
    Array.prototype.forEach.call(document.querySelectorAll('.cdn[data-id]'), function (n) { var e = byId[n.getAttribute('data-id')]; if (e) n.textContent = countdown(e, t); });
    Array.prototype.forEach.call(document.querySelectorAll('.cdn[data-rot]'), function (n) { var ms = new Date(n.getAttribute('data-rot')) - t; n.textContent = ms > 0 ? 'Changes in ' + dur(ms) : 'Changed'; });
    renderHomeBrief(t);
    renderHomeToday(t);
    renderActionCentre();
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-mark],[data-save],[data-hide],[data-unhide],[data-follow],[data-type],[data-kindtog],[data-day],[data-wk],[data-clearday],[data-cday],[data-creg],[data-cscope]'); if (!b) return;
    if (b.hasAttribute('data-mark')) { var mv = b.getAttribute('data-val'); var cur = usGet(b.getAttribute('data-mark')); var nv = mv === '' ? null : +mv; if (nv === cur) nv = null; setMark(b.getAttribute('data-mark'), nv); }
    else if (b.hasAttribute('data-hide')) toggleHide(b.getAttribute('data-hide'));
    else if (b.hasAttribute('data-unhide')) toggleHide(b.getAttribute('data-unhide'));
    else if (b.hasAttribute('data-save')) toggleSave(b.getAttribute('data-save'));
    else if (b.hasAttribute('data-follow')) toggleFollow(b.getAttribute('data-follow'));
    else if (b.hasAttribute('data-kindtog')) { var kk = b.getAttribute('data-kindtog'); usSet('hidekind:' + kk, !kindHidden(kk)); renderAll(); }
    else if (b.hasAttribute('data-type')) { typeSel = b.getAttribute('data-type'); renderTypes(); renderStrip(); renderTimeline(); }
    else if (b.hasAttribute('data-day')) { var k = b.getAttribute('data-day'); selDay = selDay === k ? '' : k; renderStrip(); renderTimeline(); }
    else if (b.hasAttribute('data-wk')) { weekOff += +b.getAttribute('data-wk'); selDay = ''; renderStrip(); renderTimeline(); }
    else if (b.hasAttribute('data-clearday')) { selDay = ''; renderStrip(); renderTimeline(); }
    else if (b.hasAttribute('data-cday')) { calSel = b.getAttribute('data-cday'); renderCalendar(); }
    else if (b.hasAttribute('data-creg')) { regSel = b.getAttribute('data-creg'); renderCalendar(); }
    else if (b.hasAttribute('data-cscope')) { scopeSel = b.getAttribute('data-cscope'); renderCalendar(); }
  });
  $('calprev').addEventListener('click', function () { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); calSel = ''; renderCalendar(); });
  $('calnext').addEventListener('click', function () { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); calSel = ''; renderCalendar(); });
  $('followform').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('followq').value.trim(), id = DEXBY[baseOf(v).base.toLowerCase()];
    if (!id) { $('followq').setCustomValidity('Pick a Pokémon from the list'); $('followq').reportValidity(); $('followq').setCustomValidity(''); return; }
    if (!isFollowed(v)) toggleFollow(v);
    $('followq').value = '';
  });
  document.addEventListener('click', function (e) {
    if (!(e.target.closest && e.target.closest('[data-gosoon]'))) return;
    var q = document.querySelector('[data-clearq]'); if (q) q.click();
    typeSel = 'soon'; selDay = ''; evQ = '';
    var tab = document.querySelector('nav.tabs button[data-tab="events"]'); if (tab) tab.click();
    var sub = document.querySelector('#subnav-events button[data-sub="timeline"]'); if (sub) sub.click();
    renderTypes(); renderStrip(); renderTimeline(); window.scrollTo(0, 0);
  });
  document.addEventListener('gofn-marks', function () { renderPrio(); renderTimeline(); renderOpps(); renderSaved(); renderActionCentre(); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-quick-go]'); if (!b) return;
    var key = b.getAttribute('data-quick-go');
    if (key === 'review') { var review = $('hireview'); if (review && !review.hidden) review.click(); return; }
    var tab = document.querySelector('nav.tabs button[data-tab="' + key + '"]'); if (tab) tab.click();
    if (key === 'events') { typeSel = 'soon'; selDay = ''; evQ = ''; var sub = document.querySelector('#subnav-events button[data-sub="timeline"]'); if (sub) sub.click(); renderTypes(); renderStrip(); renderTimeline(); }
    if (key === 'collect') { var subc = document.querySelector('#subnav-collect button[data-sub="opps"]'); if (subc) subc.click(); }
    window.scrollTo(0, 0);
  });
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) usSync(); });

  /* ---------- start ---------- */
  function envBanner() {
    fetch('/api/sources').then(function (r) { return r.json(); }).then(function (j) {
      var b = $('envbar'); if (!b || !j || j.environment !== 'preview') return;
      b.hidden = false; b.innerHTML = '<b>' + (j.database ? 'PREVIEW — STAGING DATABASE' : 'PREVIEW — NO DATABASE') + '</b><span>Test copy of the app. Not your live app.</span>';
      document.title = 'PREVIEW · ' + document.title;
    }).catch(function () { /* banner is optional */ });
  }
  function start(dexList, cpData) {
    if (cpData && cpData.pokemon && cpData.cpms) {
      cpData.pokemon.forEach(function (p) {
        if (!p || !p.name || !Number.isFinite(p.attack) || !Number.isFinite(p.defense) || !Number.isFinite(p.stamina)) return;
        CP_STATS[cpKey(p.name)] = p;
      });
      CPMS = cpData.cpms;
      CP_READY = CPMS.length >= 49 && Object.keys(CP_STATS).length > 1000;
    }
    (dexList || []).forEach(function (p) { DEXBY[String(p[1]).toLowerCase()] = p[0]; DEXNAME[p[0]] = p[1]; DEXGEN[p[0]] = p[2]; });
    var dl = $('followdl'); if (dl) dl.innerHTML = (dexList || []).slice(0, 1025).map(function (p) { return '<option value="' + esc(p[1]) + '">'; }).join('');
    EV = EV.length ? EV : fromData();
    $('evsource').textContent = usingApi ? (usingReadOnly ? 'Live Leek Duck events with curated details where available. Read-only preview; nothing is stored and the background pipeline remains off.' : 'Events come from the source pipeline. Each card shows how far its source can be trusted.') : 'Events come from the curated schedule. Times are in your own time zone.';
    renderAll();
    renderCoverage();
    if (window.GO && GO.refreshDex) GO.refreshDex();
    usSync();
    var inf = document.createElement('script'); inf.src = '/infographic.js?v=20261027a'; document.body.appendChild(inf); var x = document.createElement('script'); x.src = '/extra.js?v=20261024a'; document.body.appendChild(x); var z = document.createElement('script'); z.src = '/places.js?v=20261029a'; window.GOPLACES_READY = new Promise(function (resolve) { z.onload = function () { resolve(window.GOPLACES || null); }; z.onerror = function () { resolve(null); }; }); document.body.appendChild(z); var y = document.createElement('script'); y.src = '/detail.js?v=20261030c'; document.body.appendChild(y); var w = document.createElement('script'); w.src = '/fresh.js?v=20261014a'; document.body.appendChild(w); var nv = document.createElement('script'); nv.src = '/nudge.js?v=20261014l'; document.body.appendChild(nv); var rv = document.createElement('script'); rv.src = '/review.js?v=20261029c'; document.body.appendChild(rv); var by = document.createElement('script'); by.src = '/buy.js?v=20261020d'; document.body.appendChild(by);
  }
  envBanner();
  var dexP = fetch('/dex.json').then(function (r) { return r.json(); }).catch(function () { return []; });
  var apiP = fetch('/api/events').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  var cpP = Promise.all([
    fetch('/data/cp/pokemon.json').then(function (r) { return r.ok ? r.json() : null; }),
    fetch('/data/cp/cp-multipliers.json').then(function (r) { return r.ok ? r.json() : null; })
  ]).then(function (a) { return a[0] && a[1] ? { pokemon: a[0], cpms: a[1] } : null; }).catch(function () { return null; });
  Promise.all([dexP, apiP, cpP]).then(function (R) {
    var api = R[1];
    if (!api && window.GONET && navigator.onLine !== false) window.GONET.fail('Could not load the latest events. Showing the saved copy.');
    if (api && api.enabled && api.events && api.events.length >= 10) { var m = dedupeLive(fromApi(api.events)); if (m.length >= 10) { EV = mergeLiveAndCurated(m, fromData()); usingApi = true; usingReadOnly = api.readOnly === true; } }
    start(R[0], R[2]);
  });
  (function () { var q = document.getElementById('evq'), tm; if (!q) return;
    q.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(function () { evQ = q.value.trim().toLowerCase(); renderStrip(); renderTimeline(); }, 150); });
    document.addEventListener('click', function (e) { if (e.target.closest('[data-clearq]')) { q.value = ''; evQ = ''; renderStrip(); renderTimeline(); q.focus(); } });
  })();
  window.GODASH = { regionalEvents: function () { return REG.filter(function (x) { return x.scope !== 'global' && x.end > now(); }).map(function (x) { return Object.assign({ world: true, kind: 'event' }, x); }); }, worldEvents: function () { return REG.filter(function (x) { return x.scope === 'global' && x.end > now(); }).map(function (x) { return Object.assign({ world: true, kind: 'event' }, x); }); }, mkEvent: mkEvent, raidSlots: raidSlots, usGet: usGet, usSet: usSet, usStatus: function () { return usStatus; }, renderAll: renderAll, DEXBY: DEXBY, DEXNAME: DEXNAME, art: art, baseOf: baseOf, countdown: countdown, priority: function () { return priority(now()); }, events: function () { return EV; }, mergeLiveAndCurated: mergeLiveAndCurated, ownState: ownState, whenText: whenText, timeMeta: timeMeta, signalTags: signalTags, statusChip: statusChip, kindOf: kindOf, kindHidden: kindHidden, isSaved: isSaved, featArts: featArts, monArt: monArt, signalChips: signalChips, cpRows: cpRows, hundoPair: hundoPair, specialArt: specialArt, hasTag: hasTag, IMG_PARTICLE: IMG_PARTICLE, IMG_POWERSPOT: IMG_POWERSPOT, cpSpecies: cpSpecies, hundoLabels: hundoLabels, genConfirmed: genConfirmed, setGenConfirmed: setGenConfirmed, DEXGEN: DEXGEN };
})();
