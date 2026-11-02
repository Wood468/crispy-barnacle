(function () {
  'use strict';
  function clean(value) { return String(value == null ? '' : value).trim(); }
  function localDateTime(value) {
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
      }).format(date);
    } catch (e) { return ''; }
  }
  function buildPayload(input, typeApi, bestApi, pageUrl) {
    input = input || {};
    var boss = clean(input.boss), kind = clean(input.kind) || 'Raid';
    if (!boss) return null;
    var start = localDateTime(input.start), end = localDateTime(input.end);
    var windowLabel = start && end ? start + ' – ' + end + ' · local' : '';
    var weak = [];
    try {
      var facts = typeApi && typeof typeApi.facts === 'function' ? typeApi.facts(boss) : null;
      weak = facts && Array.isArray(facts.weak) ? facts.weak.filter(function (type, i, all) {
        return typeof type === 'string' && type.trim() && all.indexOf(type) === i;
      }) : [];
    } catch (e) { weak = []; }
    var counters = null;
    if (weak.length && bestApi && bestApi.dataReady === true && typeof bestApi.ownedSummary === 'function') {
      try {
        var summary = bestApi.ownedSummary(weak, 3);
        if (summary && Number.isFinite(Number(summary.count)) && Array.isArray(summary.names)) {
          counters = {
            count: Math.max(0, Math.floor(Number(summary.count))),
            names: summary.names.filter(function (name) { return typeof name === 'string' && name.trim(); }).slice(0, 3)
          };
        }
      } catch (e) { counters = null; }
    }
    var lines = ['Pokémon GO · ' + kind + ' raid', boss];
    if (windowLabel) lines.push('Rotation: ' + windowLabel);
    if (weak.length) lines.push('Weak to: ' + weak.join(', '));
    if (counters) {
      if (counters.count) {
        lines.push('Marked counters in the current top-ten type lists: ' +
          (counters.names.join(', ') || 'names unavailable') +
          (counters.count > counters.names.length ? ' (+' + (counters.count - counters.names.length) + ' more)' : ''));
      } else {
        lines.push('No marked counters appear in the current top-ten type lists.');
      }
      lines.push('Counter coverage is limited to the current top-ten type lists and your local marks.');
    }
    var url = clean(pageUrl);
    if (url) lines.push('GO Field Notes: ' + url);
    return {
      title: 'Pokémon GO raid · ' + boss,
      text: lines.join('\n'),
      boss: boss,
      kind: kind,
      windowLabel: windowLabel,
      weak: weak,
      counters: counters
    };
  }
  window.GORAIDSHARE = { buildPayload: buildPayload };
  var dialog = document.getElementById('raid-share-dialog');
  if (!dialog) return;
  var opener = null, currentPayload = null;
  function byId(id) { return document.getElementById(id); }
  function setStatus(message) {
    var status = byId('raid-share-status');
    if (status) status.textContent = message || '';
  }
  function closeDialog() {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else { dialog.removeAttribute('open'); restoreFocus(); }
  }
  function restoreFocus() {
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    opener = null;
  }
  function copyFallback(value) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.setAttribute('aria-hidden', 'true');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      area.style.pointerEvents = 'none';
      var active = document.activeElement;
      dialog.appendChild(area);
      area.focus();
      area.select();
      var copied = false;
      try { copied = !!document.execCommand && document.execCommand('copy'); } catch (e) { copied = false; }
      area.remove();
      if (active && active.isConnected && typeof active.focus === 'function') active.focus();
      if (copied) resolve();
      else reject(new Error('Clipboard unavailable'));
    });
  }
  function copyText(value) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(value).catch(function () { return copyFallback(value); });
    }
    return copyFallback(value);
  }
  function render(button) {
    var payload = buildPayload({
      boss: button.getAttribute('data-raid-boss'),
      kind: button.getAttribute('data-raid-kind'),
      start: button.getAttribute('data-raid-start'),
      end: button.getAttribute('data-raid-end')
    }, window.GOTYPES, window.GOBEST,
    window.location ? window.location.origin + window.location.pathname : '');
    if (!payload) return false;
    currentPayload = payload;
    var boss = byId('raid-share-boss'), kind = byId('raid-share-kind');
    var windowNode = byId('raid-share-window'), artNode = byId('raid-share-art');
    var weaknessSection = byId('raid-share-weakness-section'), weaknessNode = byId('raid-share-weakness');
    var countersSection = byId('raid-share-counters-section'), countersNode = byId('raid-share-counters');
    var footnote = dialog.querySelector('.raid-share-footnote'), shareText = byId('raid-share-text');
    if (boss) boss.textContent = payload.boss;
    if (kind) kind.textContent = payload.kind + ' RAID';
    if (windowNode) {
      windowNode.textContent = payload.windowLabel;
      windowNode.hidden = !payload.windowLabel;
    }
    if (artNode) {
      var art = window.GODASH && typeof window.GODASH.art === 'function' ? window.GODASH.art(payload.boss, 'ea') : '';
      artNode.innerHTML = art || '<span class="raid-share-monogram" aria-hidden="true">GO</span>';
    }
    if (weaknessNode) {
      weaknessNode.textContent = '';
      payload.weak.forEach(function (type) {
        var chip = document.createElement('span');
        chip.className = 'raid-share-type';
        chip.textContent = type;
        weaknessNode.appendChild(chip);
      });
    }
    if (weaknessSection) weaknessSection.hidden = !payload.weak.length;
    if (countersSection) countersSection.hidden = !payload.counters;
    if (countersNode && payload.counters) {
      countersNode.textContent = payload.counters.count
        ? 'Marked counters (' + payload.counters.count + '): ' + payload.counters.names.join(', ') +
          (payload.counters.count > payload.counters.names.length ? ' · ' + (payload.counters.count - payload.counters.names.length) + ' more' : '')
        : 'No marked counters appear in the current top-ten type lists.';
    }
    if (footnote) footnote.hidden = !payload.counters;
    if (shareText) shareText.textContent = payload.text;
    setStatus('');
    return true;
  }
  document.addEventListener('click', function (event) {
    var target = event.target;
    var shareButton = target && target.closest ? target.closest('[data-raid-share]') : null;
    if (shareButton) {
      if (!render(shareButton)) return;
      opener = shareButton;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      var close = dialog.querySelector('[data-raid-share-close]');
      if (close) close.focus();
      return;
    }
    if (target && target.closest && target.closest('[data-raid-share-close]')) {
      closeDialog();
      return;
    }
    if (target && target.closest && target.closest('#raid-share-send')) {
      if (!currentPayload) return;
      if (typeof navigator.share === 'function') {
        Promise.resolve(navigator.share({ title: currentPayload.title, text: currentPayload.text }))
          .then(function () { setStatus('Share sheet opened.'); })
          .catch(function (error) {
            if (error && error.name === 'AbortError') { setStatus('Share cancelled.'); return; }
            copyText(currentPayload.text).then(function () { setStatus('Sharing is unavailable here; text copied instead.'); })
              .catch(function () { setStatus('Sharing is unavailable. Open “Text to share” and copy it manually.'); });
          });
      } else {
        copyText(currentPayload.text).then(function () { setStatus('Sharing is unavailable here; text copied instead.'); })
          .catch(function () { setStatus('Sharing is unavailable. Open “Text to share” and copy it manually.'); });
      }
      return;
    }
    if (target && target.closest && target.closest('#raid-share-copy')) {
      if (!currentPayload) return;
      copyText(currentPayload.text).then(function () { setStatus('Share text copied.'); })
        .catch(function () { setStatus('Copy is unavailable. Open “Text to share” and copy it manually.'); });
    }
  });
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener('close', restoreFocus);
})();