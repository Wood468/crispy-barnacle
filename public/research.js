/* Schedule → Research. Uses the same source-backed records rendered inside event details. */
(function () {
  'use strict';
  var host = document.getElementById('research-list');
  var status = document.getElementById('research-status');
  if (!host || !status || !window.GOLIB) return;
  var loaded = null, loadedAt = 0, loading = null, rendering = false, refreshFailed = false, lastFocus = '';
  var refresh = document.querySelector('[data-research-refresh]');
  var MAX_AGE = 300000;
  function esc(value) { return window.GOLIB.esc(String(value == null ? '' : value)); }
  function json(url, fresh) { return window.GOLIB.jsonOrNull(url, { maxAge: MAX_AGE, timeout: 10000, fresh: fresh, init: { cache: 'no-cache' } }); }
  function datePart(value) {
    var s = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }
  function localDay() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function fmtDay(value) {
    var d = new Date(value + 'T12:00:00');
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : value;
  }
  function safeSource(url) {
    try {
      var u = new URL(String(url || ''));
      return u.protocol === 'https:' && /^(www\.)?(leekduck\.com|pokemongohub\.net|pokemongo\.com)$/i.test(u.hostname) ? u.href : '';
    } catch (e) { return ''; }
  }
  function sourceLine(task, record) {
    var ids = (task.sources || []).filter(function (id, i, a) { return id && a.indexOf(id) === i; });
    var refs = Array.isArray(task.sourceRefs) && task.sourceRefs.length ? task.sourceRefs : ids.map(function (id) {
      return (record.sources || []).filter(function (x) { return x.id === id; })[0];
    }).filter(Boolean);
    var links = refs.map(function (s) {
      var name = s.name || s.id || '';
      var url = safeSource(s.url);
      return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(name) + '</a>' : esc(name);
    }).filter(Boolean);
    var label = task.status === 'official' ? 'Official' : task.status === 'corroborated' ? 'Cross-checked' : 'Single source';
    return '<small class="research-task-source">' + label + (links.length ? ' · ' + links.join(' · ') : '') + ' · ' + esc(window.GOLIB.researchCheckedText(task.checkedAt)) + '</small>';
  }

  /* Reward cells come from Event Details (exact variant art for forms and costumes, quantities, CP range, Shiny only when the source says so). */
  function rewardHtml(reward, event) {
    if (window.GODETAIL && window.GODETAIL.researchReward) return window.GODETAIL.researchReward(reward, event || {});
    var name = String(reward.name || '');
    return '<div class="research-reward" role="listitem"><span><b>' + (reward.quantity > 1 ? esc(reward.quantity) + '\u00d7 ' : '') + esc(name) + '</b>' + (reward.cpMin && reward.cpMax ? '<small>CP ' + esc(reward.cpMin) + '\u2013' + esc(reward.cpMax) + '</small>' : '') + '</span></div>';
  }
  var CATS = [
    ['field', 'Field Research', 'Each task gives one of its listed rewards'],
    ['timed', 'Timed Research', 'Rewards are cumulative: you receive all of them'],
    ['special', 'Special Research', 'Rewards are cumulative: you receive all of them'],
    ['collection', 'Collection Challenge', ''],
    ['breakthrough', 'Research Breakthrough', ''],
    ['max', 'Max Battle research', ''],
    ['raid', 'Raid research', ''],
    ['research', 'Other research', '']
  ];
  var catOf = function (c) { return CATS.some(function (x) { return x[0] === c; }) ? c : 'research'; };
  var SHOW_FIRST = 8;
  var expanded = Object.create(null), query = '', model = null, tools = null;
  function norm(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function taskMatches(task, q) {
    if (!q) return true;
    if (norm(task.task).indexOf(q) >= 0) return true;
    return (task.rewards || []).some(function (r) { return norm(r.name).indexOf(q) >= 0 || norm(r.label).indexOf(q) >= 0; });
  }
  /* "One of N" (alternatives) is kept apart from "all N" (cumulative): the wording follows the source's category, never a guess. */
  function altLabel(task) {
    var n = (task.rewards || []).length;
    if (task.category === 'field' || !task.category) return window.GOTODAYLOGIC ? window.GOTODAYLOGIC.researchRewardLabel('field', n) : (n > 1 ? 'One of ' + n + ' possible rewards' : n + ' possible reward');
    return n > 1 ? 'All ' + n + ' rewards' : n === 1 ? '1 reward' : 'No rewards listed';
  }
  function taskRow(entry, group) {
    var task = entry.task;
    return '<li class="research-task"><h4 class="rs-text">' + esc(task.task) + '</h4><p class="rs-alt">' + esc(altLabel(task)) + '</p><div class="research-rewards rs-rewards" role="list" aria-label="' + esc(altLabel(task)) + '">' + (task.rewards || []).map(function (reward) { return rewardHtml(reward, group.event); }).join('') + '</div></li>';
  }
  function sourcesFor(entries) {
    var seen = Object.create(null), out = [];
    entries.forEach(function (entry) { var h = sourceLine(entry.task, entry.record); if (!seen[h]) { seen[h] = 1; out.push(h); } });
    return out.join('');
  }
  function groupHtml(group, today) {
    var live = group.start <= today && group.end >= today, searching = !!query, shown = 0;
    var eventButton = group.event ? '<button type="button" class="pill all" data-open="' + esc(group.id) + '">Event details</button>' : '';
    var cats = CATS.map(function (cat) {
      var all = group.tasks.filter(function (entry) { return catOf(entry.task.category) === cat[0]; });
      var matched = all.filter(function (entry) { return taskMatches(entry.task, query); });
      if (!matched.length) return '';
      shown += matched.length;
      var key = group.id + '|' + cat[0], open = searching || expanded[key] || matched.length <= SHOW_FIRST + 2;
      var rows = (open ? matched : matched.slice(0, SHOW_FIRST)).map(function (entry) { return taskRow(entry, group); }).join('');
      var more = open ? '' : '<button type="button" class="pill research-more" data-research-more="' + esc(key) + '" aria-label="Show all ' + matched.length + ' ' + esc(cat[1]) + ' tasks">Show all ' + matched.length + ' tasks</button>';
      return '<div class="rs-group" data-research-category="' + cat[0] + '"><h3 class="rs-group-h">' + esc(cat[1]) + ' <small>\u00b7 ' + matched.length + (matched.length === 1 ? ' task' : ' tasks') + (cat[2] ? ' \u00b7 ' + esc(cat[2]) : '') + '</small></h3><ul class="rs-list">' + rows + '</ul>' + more + '<div class="research-task-sources">' + sourcesFor(matched) + '</div></div>';
    }).join('');
    if (!shown) return '';
    return '<section class="research-event" data-research-group="' + esc(group.id) + '" id="research-' + esc(String(group.id).replace(/[^A-Za-z0-9_-]/g, '-')) + '"><header class="research-event-head"><div><span class="research-event-state ' + (live ? 'live' : 'upcoming') + '">' + (live ? 'CURRENT DATE' : 'UPCOMING') + '</span><h3>' + esc(group.name) + '</h3><p>' + esc(fmtDay(group.start)) + (group.end !== group.start ? ' \u2013 ' + esc(fmtDay(group.end)) : '') + ' \u00b7 source-published event dates</p></div>' + eventButton + '</header><div class="research-event-tasks">' + cats + '</div></section>';
  }
  function ensureTools() {
    if (tools || !host.parentNode || !document.createElement) return;
    tools = document.createElement('div');
    tools.className = 'research-tools';
    tools.innerHTML = '<label class="research-search"><span class="research-search-label">Search Pok\u00e9mon or reward</span><input type="search" id="research-search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. Rookidee, Stardust"></label><p class="research-fresh" id="research-fresh" role="status"></p>';
    host.parentNode.insertBefore(tools, host);
    tools.querySelector('input').addEventListener('input', function (e) { query = norm(e.target.value).trim(); paint(); });
  }
  function paint() {
    if (!model) return;
    var html = model.list.map(function (group) { return groupHtml(group, model.today); }).join('');
    var total = model.list.reduce(function (n, g) { return n + g.tasks.length; }, 0);
    if (!html) {
      host.innerHTML = query ? '<div class="research-empty"><b>No task or reward matches \u201c' + esc(query) + '\u201d</b><p>Try a Pok\u00e9mon name or an item such as Stardust. Only tasks in the saved source snapshot are searched.</p></div>' : '';
      status.textContent = query ? 'Search: 0 of ' + total + ' tasks match.' : model.summary;
      return;
    }
    host.innerHTML = html + (query ? '' : model.unparsed);
    if (query) status.textContent = 'Search: ' + host.querySelectorAll('.research-task').length + ' of ' + total + ' tasks match.';
    else status.textContent = model.summary;
  }
  function load(fresh) {
    if (loaded && !fresh && !refreshFailed && Date.now() - loadedAt < MAX_AGE) return Promise.resolve(loaded);
    if (loading) return loading;
    loading = Promise.all([json('/event-details.json', fresh), json('/data.json', fresh)]).then(function (values) {
      if (!values[0] || !values[0].events || !values[1] || !Array.isArray(values[1].events)) throw new Error('Research source data is unavailable');
      loaded = { details: values[0], data: values[1] };
      loadedAt = Date.now();
      refreshFailed = false;
      loading = null;
      return loaded;
    }).catch(function (error) { loading = null; refreshFailed = true; throw error; });
    return loading;
  }
  function focusGroup(eventId) {
    if (!eventId) return;
    var nodes = host.querySelectorAll('[data-research-group]');
    for (var i = 0; i < nodes.length; i++) if (nodes[i].getAttribute('data-research-group') === eventId) {
      nodes[i].setAttribute('tabindex', '-1');
      nodes[i].scrollIntoView({ block: 'start' });
      nodes[i].focus({ preventScroll: true });
      return;
    }
  }
  function render(fresh) {
    if (rendering) return;
    rendering = true;
    if (refresh) refresh.setAttribute('aria-disabled', 'true');
    var previous = host.innerHTML;
    var hadResults = !!loaded;
    host.setAttribute('aria-busy', 'true');
    if (!hadResults) host.innerHTML = '<p class="note">Loading published research…</p>';
    status.textContent = hadResults ? 'Refreshing research. Showing the previous snapshot while checking…' : 'Loading research from the saved source snapshot…';
    load(fresh).then(function (data) {
      var today = localDay(), eventMap = Object.create(null), groups = Object.create(null), unknownWindows = 0;
      (data.data.events || []).forEach(function (event) {
        [event.id].concat(Array.isArray(event.detailIds) ? event.detailIds : []).forEach(function (id) { if (id) eventMap[id] = event; });
      });
      /* A write-up filed under its source's own id still belongs to the curated event with the same name ("Into the Wild 2026" and "Into the Wild"). */
      var byName = Object.create(null);
      function nameKey(v) { return norm(v).replace(/\b20\d\d\b/g, '').replace(/\bpokemon go\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
      (data.data.events || []).forEach(function (event) { var k = nameKey(event.t); if (k && !byName[k]) byName[k] = event; });
      Object.keys(data.details.events).forEach(function (detailId) {
        var record = data.details.events[detailId] || {};
        (record.researchTasks || []).forEach(function (task) {
          var window = task.eventWindow || {}, start = datePart(window.start), end = datePart(window.end);
          if (!start || !end || end < start) { unknownWindows++; return; }
          if (end < today) return;
          var event = eventMap[task.eventId] || eventMap[detailId] || byName[nameKey(task.eventName || record.name)] || null;
          var key = event ? 'cur:' + event.id : (task.eventId || detailId);
          var group = groups[key] || (groups[key] = { id: key, event: event, name: (event && event.t) || task.eventName || record.name || 'Research event', start: start, end: end, tasks: [] });
          if (start < group.start) group.start = start;
          if (end > group.end) group.end = end;
          var taskKey = JSON.stringify([task.category, task.task, task.rewards]);
          if (!group.tasks.some(function (x) { return JSON.stringify([x.task.category, x.task.task, x.task.rewards]) === taskKey; })) group.tasks.push({ task: task, record: record });
        });
      });
      var list = Object.keys(groups).map(function (key) { return groups[key]; }).sort(function (a, b) { return a.start.localeCompare(b.start) || a.name.localeCompare(b.name); });
      host.removeAttribute('aria-busy');
      ensureTools();
      var fr = window.GOLIB.freshnessOf(data.details.updated, null, 'importer'), frEl = tools && tools.querySelector('#research-fresh');
      if (frEl) { frEl.className = 'research-fresh rf-' + fr.state; frEl.textContent = 'Source snapshot: ' + fr.label + (fr.state === 'stale' ? '. Rewards and tasks below may have changed.' : ''); }
      /* Current events whose write-up mentions research but gives no parseable task list: said plainly, not silently dropped. */
      var named = Object.create(null), unparsed = [];
      Object.keys(data.details.events).forEach(function (detailId) {
        var record = data.details.events[detailId] || {}, event = eventMap[detailId] || null;
        var lines = record.fields && Array.isArray(record.fields.research) ? record.fields.research : [];
        if ((record.researchTasks || []).length || !lines.length || !event) return;
        var end = datePart(event.e || event.end || event.s);
        if (!end || end < today || named[event.id]) return;
        named[event.id] = 1; unparsed.push(event.t || record.name);
      });
      var unparsedHtml = unparsed.length ? '<div class="research-unparsed"><b>' + window.GOLIB.missingLabel('not-in-source') + '</b><p>These current or upcoming events mention research, but the source does not give a task list: ' + unparsed.map(esc).join(', ') + '. Open the event for the source\u2019s own wording.</p></div>' : '';
      if (!list.length) {
        var lonely = unparsed.length ? unparsedHtml : '';
        host.innerHTML = '<div class="research-empty"><b>' + window.GOLIB.missingLabel('not-announced') + ': no active or upcoming task lists</b><p>Task cards appear here once a source publishes a task and its rewards. Research notes remain available inside event details.</p>' + (unknownWindows ? '<small>' + unknownWindows + ' source record(s) have no verified event window and are not shown here (' + window.GOLIB.missingLabel('unverified').toLowerCase() + ').</small>' : '') + '</div>' + lonely;
        status.textContent = 'No current task-and-reward records are available in the saved source snapshot.';
        model = null;
        return;
      }
      var total = list.reduce(function (n, group) { return n + group.tasks.length; }, 0);
      var summary = 'Saved source snapshot. ' + total + ' source-backed task' + (total === 1 ? '' : 's') + ' across ' + list.length + ' event' + (list.length === 1 ? '' : 's') + '. Event dates are shown as published dates; venue clock times are not converted.';
      model = { list: list, today: today, unparsed: unparsedHtml, summary: summary };
      status.textContent = summary;
      paint();
      if (lastFocus) { focusGroup(lastFocus); lastFocus = ''; }
    }).catch(function () {
      host.removeAttribute('aria-busy');
      if (hadResults) {
        host.innerHTML = previous;
        var ff = tools && tools.querySelector('#research-fresh'); if (ff && !/refresh failed/.test(ff.textContent)) ff.textContent += ' \u00b7 the latest refresh failed';
        status.textContent = 'Research could not be refreshed. Showing the previous snapshot; it may be out of date. Try Refresh research again.';
        return;
      }
      host.innerHTML = '<div class="research-empty"><b>Research could not be loaded</b><p>Check your connection and retry. Existing event and saved collection data have not been changed.</p><button type="button" class="pill" data-research-retry>Try again</button></div>';
      status.textContent = 'Research data could not be loaded.';
    }).finally(function () {
      rendering = false;
      host.removeAttribute('aria-busy');
      if (refresh) refresh.removeAttribute('aria-disabled');
    });
  }
  document.addEventListener('gofn-view', function (event) {
    if (event.detail && event.detail.tab === 'events' && event.detail.sub === 'research') render();
  });
  document.addEventListener('gofn-research-focus', function (event) {
    lastFocus = event.detail && event.detail.eventId || '';
    setTimeout(function () { if (!rendering && lastFocus) { focusGroup(lastFocus); lastFocus = ''; } }, 150);
  });
  document.addEventListener('click', function (event) {
    var more = event.target.closest && event.target.closest('[data-research-more]');
    if (more) { expanded[more.getAttribute('data-research-more')] = true; paint(); return; }
    if (event.target.closest && event.target.closest('[data-research-retry], [data-research-refresh]')) render(true);
  });
})();
