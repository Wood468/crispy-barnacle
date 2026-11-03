/* Schedule → Research. Uses the same source-backed records rendered inside event details. */
(function () {
  'use strict';
  var host = document.getElementById('research-list');
  var status = document.getElementById('research-status');
  if (!host || !status || !window.GOLIB) return;
  var loaded = null, loading = false, lastFocus = '';
  function esc(value) { return window.GOLIB.esc(String(value == null ? '' : value)); }
  function json(url) { return window.GOLIB.jsonOrNull(url, { maxAge: 300000, init: { cache: 'no-cache' } }); }
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
    var links = ids.map(function (id) {
      var s = (record.sources || []).filter(function (x) { return x.id === id; })[0];
      if (!s) return '';
      var url = safeSource(s.url);
      return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name) + '</a>' : esc(s.name);
    }).filter(Boolean);
    var label = task.status === 'official' ? 'Official' : task.status === 'corroborated' ? 'Cross-checked' : 'Single source';
    var checked = datePart(task.checkedAt);
    return '<small class="research-task-source">' + label + (links.length ? ' · ' + links.join(' · ') : '') + (checked ? ' · checked ' + esc(fmtDay(checked)) : '') + '</small>';
  }
  function rewardHtml(reward, event) {
    if (reward.type === 'encounter') {
      var cp = reward.cpMin && reward.cpMax ? 'CP ' + reward.cpMin + '–' + reward.cpMax : 'Encounter';
      var art = window.GODASH && GODASH.monArt ? GODASH.monArt(event || {}, { name: reward.name, costume: /wearing|costume/i.test(reward.name), role: 'featured' }, 'ea') : '';
      return '<div class="research-reward">' + art + '<span><b>' + esc(reward.name) + '</b><small>' + esc(cp) + '</small></span></div>';
    }
    return '<div class="research-reward research-reward-item"><span class="research-reward-qty">' + (reward.quantity > 1 ? esc(reward.quantity) + '×' : '•') + '</span><span><b>' + esc(reward.name) + '</b><small>' + (reward.type === 'item' ? 'Item reward' : 'Possible reward') + '</small></span></div>';
  }
  function load() {
    if (loaded) return Promise.resolve(loaded);
    if (loading) return loading;
    loading = Promise.all([json('/event-details.json'), json('/data.json')]).then(function (values) {
      if (!values[0] || !values[0].events || !values[1] || !Array.isArray(values[1].events)) throw new Error('Research source data is unavailable');
      loaded = { details: values[0], data: values[1] };
      loading = false;
      return loaded;
    }).catch(function (error) { loading = false; throw error; });
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
  function render() {
    host.setAttribute('aria-busy', 'true');
    host.innerHTML = '<p class="note">Loading published research…</p>';
    status.textContent = 'Loading research from the latest saved source snapshot…';
    load().then(function (data) {
      var today = localDay(), eventMap = Object.create(null), groups = Object.create(null), unknownWindows = 0;
      (data.data.events || []).forEach(function (event) {
        [event.id].concat(Array.isArray(event.detailIds) ? event.detailIds : []).forEach(function (id) { if (id) eventMap[id] = event; });
      });
      Object.keys(data.details.events).forEach(function (detailId) {
        var record = data.details.events[detailId] || {};
        (record.researchTasks || []).forEach(function (task) {
          var window = task.eventWindow || {}, start = datePart(window.start), end = datePart(window.end);
          if (!start || !end || end < start) { unknownWindows++; return; }
          if (end < today) return;
          var event = eventMap[task.eventId] || eventMap[detailId] || null;
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
      if (!list.length) {
        host.innerHTML = '<div class="research-empty"><b>No active or upcoming structured research yet</b><p>Research notes remain available inside event details. Individual task cards appear here only when a source publishes a task and reward that can be parsed confidently.</p>' + (unknownWindows ? '<small>' + unknownWindows + ' source record(s) have no verified event window and are not shown here.</small>' : '') + '</div>';
        status.textContent = 'No current task-and-reward records are available in the saved source snapshot.';
        return;
      }
      var total = list.reduce(function (n, group) { return n + group.tasks.length; }, 0);
      status.textContent = total + ' source-backed task' + (total === 1 ? '' : 's') + ' across ' + list.length + ' event' + (list.length === 1 ? '' : 's') + '. Event dates are shown as published dates; venue clock times are not converted.';
      host.innerHTML = list.map(function (group) {
        var live = group.start <= today && group.end >= today;
        var eventButton = group.event ? '<button type="button" class="pill all" data-open="' + esc(group.id) + '">Event details</button>' : '';
        var tasks = group.tasks.map(function (entry) {
          var task = entry.task, kind = task.category === 'field' ? 'Field Research' : task.category === 'timed' ? 'Timed Research' : task.category === 'special' ? 'Special Research' : 'Research';
          return '<article class="research-task"><div class="research-task-head"><span class="research-task-kind">' + kind + '</span><span class="research-task-state">' + (task.rewards || []).length + ' reward' + ((task.rewards || []).length === 1 ? '' : 's') + '</span></div><h4>' + esc(task.task) + '</h4><div class="research-rewards">' + (task.rewards || []).map(function (reward) { return rewardHtml(reward, group.event); }).join('') + '</div>' + sourceLine(task, entry.record) + '</article>';
        }).join('');
        return '<section class="research-event" data-research-group="' + esc(group.id) + '"><header class="research-event-head"><div><span class="research-event-state ' + (live ? 'live' : 'upcoming') + '">' + (live ? 'CURRENT DATE' : 'UPCOMING') + '</span><h3>' + esc(group.name) + '</h3><p>' + esc(fmtDay(group.start)) + (group.end !== group.start ? ' – ' + esc(fmtDay(group.end)) : '') + ' · source-published event dates</p></div>' + eventButton + '</header><div class="research-event-tasks">' + tasks + '</div></section>';
      }).join('');
      if (lastFocus) focusGroup(lastFocus);
    }).catch(function () {
      host.removeAttribute('aria-busy');
      host.innerHTML = '<div class="research-empty"><b>Research could not be loaded</b><p>Check your connection and retry. Existing event and saved collection data have not been changed.</p><button type="button" class="pill" data-research-retry>Try again</button></div>';
      status.textContent = 'Research data could not be loaded.';
    });
  }
  document.addEventListener('gofn-view', function (event) {
    if (event.detail && event.detail.tab === 'events' && event.detail.sub === 'research') render();
  });
  document.addEventListener('gofn-research-focus', function (event) {
    lastFocus = event.detail && event.detail.eventId || '';
    setTimeout(function () { focusGroup(lastFocus); }, 150);
  });
  document.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('[data-research-retry]')) { loaded = null; render(); }
  });
})();