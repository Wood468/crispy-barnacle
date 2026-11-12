/* Optional GO Pass rank navigator. Mount after Event Details has rendered.
   Works only with visible, source-backed .ue-pass-reward entries; does not
   modify the underlying source stages or imply unpublished rewards. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GOGoPassNavigation = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var serial = 0;
  function rank(value) {
    var n = typeof value === 'string' && value.trim() ? Number(value) : value;
    return Number.isSafeInteger(n) && n >= 1 ? n : null;
  }
  function rangeAt(value, width) {
    var n = rank(value), w = rank(width || 25);
    if (n === null || w === null) return null;
    var start = Math.floor((n - 1) / w) * w + 1;
    return { start: start, end: Math.min(Number.MAX_SAFE_INTEGER, start + w - 1) };
  }
  /* Consumes published rank numbers, not all integers between a min/max.
     Gaps must stay visibly unlisted; we do not invent ranks or player progress. */
  function indexRanks(values, width) {
    var size = rank(width || 25) || 25, nums = Array.from(new Set((values || []).map(rank).filter(function (n) { return n !== null; }))).sort(function (a, b) { return a - b; });
    var groups = [], map = new Map();
    nums.forEach(function (n) {
      var span = rangeAt(n, size), key = span.start;
      if (!map.has(key)) { var group = { start: span.start, end: span.end, count: 0, ranks: [] }; groups.push(group); map.set(key, group); }
      var g = map.get(key); g.count++; g.ranks.push(n);
    });
    return { size: size, count: nums.length, first: nums[0] || null, last: nums.length ? nums[nums.length - 1] : null, ranks: nums, groups: groups };
  }
  function lookup(index, requested) {
    var n = rank(requested);
    if (n === null) return { status: 'invalid', rank: null, group: null };
    var group = (index && index.groups || []).find(function (g) { return n >= g.start && n <= g.end; }) || null;
    if (!(index && index.ranks || []).includes(n)) return { status: 'unlisted', rank: n, group: group };
    return { status: 'published', rank: n, group: group };
  }
  function hasReward(node) {
    return !!(node && typeof node.querySelector === 'function' && node.querySelector('.ue-pass-reward'));
  }
  function focus(node) {
    if (!node) return;
    node.tabIndex = -1;
    try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
    if (node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  }
  /* Each GO Pass owns its navigator. Multiple passes and async rerenders do
     not share state, listeners, input IDs or disclosure open state. */
  function mount(rootNode) {
    if (!rootNode || typeof rootNode.querySelectorAll !== 'function') return 0;
    var articles = rootNode.matches && rootNode.matches('.ue-pass') ? [rootNode] : Array.from(rootNode.querySelectorAll('.ue-pass')), mounted = 0;
    articles.forEach(function (article) {
      if (article.querySelector('.ue-pass-nav')) return;
      var nodes = Array.from(article.querySelectorAll('.ue-pass-rank[data-rank]')).filter(hasReward);
      var byRank = new Map();
      nodes.forEach(function (node) { var n = rank(node.getAttribute('data-rank')); if (n !== null && !byRank.has(n)) byRank.set(n, node); });
      var index = indexRanks(Array.from(byRank.keys()));
      if (!index.count) return;
      var doc = article.ownerDocument, nav = doc.createElement('nav'), form = doc.createElement('form'), numLabel = doc.createElement('label'), input = doc.createElement('input'), go = doc.createElement('button'), groupLabel = doc.createElement('label'), select = doc.createElement('select'), status = doc.createElement('p');
      var suffix = 'ue-pass-quick-' + (++serial);
      nav.className = 'ue-pass-nav';
      nav.setAttribute('aria-label', 'GO Pass published rank navigation');
      form.className = 'ue-pass-jump';
      numLabel.htmlFor = suffix + '-rank';
      numLabel.textContent = 'Jump to published rank';
      input.id = suffix + '-rank';
      input.type = 'number';
      input.inputMode = 'numeric';
      input.min = '1';
      input.step = '1';
      input.max = String(index.last);
      input.placeholder = 'e.g. 45';
      go.type = 'submit';
      go.className = 'pill';
      go.textContent = 'Go';
      form.append(numLabel, input, go);
      groupLabel.htmlFor = suffix + '-group';
      groupLabel.textContent = 'Browse rank ranges';
      select.id = suffix + '-group';
      var firstOption = doc.createElement('option'); firstOption.value = ''; firstOption.textContent = 'Choose range'; select.appendChild(firstOption);
      index.groups.forEach(function (g) {
        var option = doc.createElement('option');
        option.value = String(g.start);
        option.textContent = 'Ranks ' + g.start + '–' + g.end + ' · ' + g.count + ' published';
        select.appendChild(option);
      });
      status.className = 'ue-pass-nav-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      function openRank(n, fromRange) {
        var result = lookup(index, n);
        if (result.status === 'invalid') { status.textContent = 'Enter a whole rank number of 1 or higher.'; return; }
        if (result.status === 'unlisted') { status.textContent = 'No published reward entry for Rank ' + result.rank + '.'; return; }
        var target = byRank.get(result.rank), details = target && target.closest('details.ue-pass-range');
        if (!details) { status.textContent = 'This published rank cannot be opened. Try again.'; return; }
        details.open = true;
        select.value = String(result.group.start);
        status.textContent = fromRange ? 'Opened Ranks ' + result.group.start + '–' + result.group.end + '; ' + result.group.count + ' published.' : 'Opened published Rank ' + result.rank + '.';
        focus(fromRange ? (details.querySelector('summary') || target) : target);
      }
      form.addEventListener('submit', function (event) { event.preventDefault(); openRank(input.value, false); });
      select.addEventListener('change', function () {
        var chosen = index.groups.find(function (g) { return String(g.start) === select.value; });
        if (chosen) openRank(chosen.ranks[0], true);
      });
      nav.append(form, groupLabel, select, status);
      var heading = article.querySelector('.ue-pass-all-title');
      if (heading) heading.parentNode.insertBefore(nav, heading);
      else article.appendChild(nav);
      mounted++;
    });
    return mounted;
  }
  return { rank: rank, rangeAt: rangeAt, indexRanks: indexRanks, lookup: lookup, mount: mount };
}));