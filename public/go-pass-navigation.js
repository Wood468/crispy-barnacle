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
    var n = typeof value === 'string' ? (/^\d+$/.test(value.trim()) ? Number(value.trim()) : null) : value;
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
  function cleanName(name) {
    return String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  /* Search only actual labelled reward tiles within published rank rows.
     A source may omit track labels; never attribute them to Free by default. */
  function indexRewardEntries(rows) {
    var entries = [], seen = new Set();
    (rows || []).forEach(function (row) {
      var n = rank(row && typeof row.getAttribute === 'function' ? row.getAttribute('data-rank') : null);
      if (n === null || !hasReward(row)) return;
      Array.from(row.querySelectorAll('.ue-pass-reward')).forEach(function (tile) {
        var container = tile.querySelector('.ue-pass-name');
        var textNode = container && container.querySelector('b');
        var name = textNode && String(textNode.textContent || '').trim();
        if (!name) return;
        var track = tile.closest('.ue-lane-deluxe') ? 'deluxe' : tile.closest('.ue-lane-free') ? 'free' : 'unknown';
        /* The rendered reward metadata is source-backed. Two identical names
           in one rank/track can still be distinct rewards at ×3 and ×4. */
        var meta = container.querySelector('small');
        var quantityText = meta && String(meta.textContent || '').trim();
        var quantityMatch = /^×([1-9][0-9]*)\s*·/.exec(quantityText || '');
        var parsedQuantity = quantityMatch ? Number(quantityMatch[1]) : 1;
        var quantity = Number.isSafeInteger(parsedQuantity) ? parsedQuantity : 1;
        var key = n + '|' + track + '|' + cleanName(name) + '|' + quantity;
        if (seen.has(key)) return;
        seen.add(key);
        var entry = {rank:n,name:name,track:track};
        if (quantity > 1) entry.quantity = quantity;
        entries.push(entry);
      });
    });
    return entries.sort(function (a, b) { return a.rank-b.rank || a.name.localeCompare(b.name); });
  }
  function findRewards(entries, query, limit) {
    var needle = cleanName(query), cap = Number.isSafeInteger(limit) && limit > 0 ? Math.min(30, limit) : 8;
    if (needle.length < 2) return {total:0,entries:[]};
    var found = (entries || []).filter(function (item) {
      return item && rank(item.rank)!==null && cleanName(item.name).includes(needle);
    });
    return {total:found.length,entries:found.slice(0,cap)};
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
      var rewardEntries = indexRewardEntries(Array.from(byRank.values()));
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
      form.noValidate = true; // Report missing ranks honestly, even above the last listed rank.
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
      /* A collapsed, optional name finder avoids pushing the rank controls out
         of the first mobile viewport. It indexes rendered source rewards only. */
      var finder = doc.createElement('details'), finderSummary = doc.createElement('summary');
      var finderBody = doc.createElement('div'), finderLabel = doc.createElement('label');
      var finderInput = doc.createElement('input'), finderResults = doc.createElement('div');
      var finderStatus = doc.createElement('p');
      finder.className = 'ue-pass-finder';
      finderSummary.textContent = 'Find a reward by name';
      finderBody.className = 'ue-pass-find-body';
      finderLabel.htmlFor = suffix + '-find';
      finderLabel.textContent = 'Search published rewards';
      finderInput.id = suffix + '-find';
      finderInput.type = 'search';
      finderInput.placeholder = 'e.g. Bottle Cap';
      finderInput.autocomplete = 'off';
      finderResults.className = 'ue-pass-find-results';
      finderResults.setAttribute('aria-label', 'Matching published rewards');
      finderStatus.className = 'ue-pass-find-status';
      finderStatus.setAttribute('role', 'status');
      finderStatus.setAttribute('aria-live', 'polite');
      function renderRewardResults() {
        var term = finderInput.value.trim();
        finderResults.replaceChildren();
        if (cleanName(term).length < 2) {
          finderStatus.textContent = 'Enter at least 2 characters to search published rewards.';
          return;
        }
        var found = findRewards(rewardEntries, term, 8);
        finderStatus.textContent = found.total ?
          'Showing ' + found.entries.length + ' of ' + found.total + ' matching published rewards.' :
          'No published reward entry matches "' + term + '".';
        found.entries.forEach(function (item) {
          var button = doc.createElement('button');
          button.type = 'button';
          button.className = 'ue-pass-find-result';
          var lane = item.track === 'free' ? 'Free' : item.track === 'deluxe' ? 'Deluxe' : 'Track not specified';
          var quantityLabel = item.quantity > 1 ? ' · ×' + item.quantity : '';
          button.textContent = 'Rank ' + item.rank + ' · ' + item.name + quantityLabel + ' · ' + lane;
          button.addEventListener('click', function () {
            openRank(item.rank, false);
            finderStatus.textContent = 'Opened Rank ' + item.rank + ' · ' + item.name + quantityLabel + ' (' + lane + ').';
          });
          finderResults.appendChild(button);
        });
      }
      finderInput.addEventListener('input', renderRewardResults);
      finderBody.append(finderLabel, finderInput, finderStatus, finderResults);
      finder.append(finderSummary, finderBody);
      nav.append(form, groupLabel, select, finder, status);
      /* Put the controls ahead of milestone cards: on a phone several tall
         milestone cards previously hid the navigator below the first screen. */
      var anchor = article.querySelector('.ue-pass-overview') || article.querySelector('.ue-pass-all-title');
      if (anchor) anchor.parentNode.insertBefore(nav, anchor);
      else article.appendChild(nav);
      mounted++;
    });
    return mounted;
  }
  return { rank: rank, rangeAt: rangeAt, indexRanks: indexRanks, lookup: lookup, indexRewardEntries: indexRewardEntries, findRewards: findRewards, mount: mount };
}));