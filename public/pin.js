// The sync PIN box in the menu (kept here, not inline, so the page can forbid inline scripts).
(function () {
  function state() { var s = document.getElementById('pinstate'), v = ''; try { v = localStorage.getItem('gofn-pin') || ''; } catch (x) {} if (s) s.textContent = v ? 'saved on this device' : 'not set'; }
  var dd = document.getElementById('pindd'); if (dd) dd.addEventListener('toggle', state);
  state();
  var f = document.querySelector('#pindd .pinform'), show = document.getElementById('pinshowbtn'), rm = document.getElementById('pinrm');
  if (f) f.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = document.getElementById('pinnew').value.trim(); if (!v) return;
    try { localStorage.setItem('gofn-pin', v); } catch (x) {}
    location.reload();
  });
  if (show) show.addEventListener('click', function () {
    var o = document.getElementById('pinshowval'), v = '';
    try { v = localStorage.getItem('gofn-pin') || ''; } catch (x) {}
    o.hidden = false; o.textContent = v || 'No PIN is saved on this device.';
    clearTimeout(window.__pt); window.__pt = setTimeout(function () { o.hidden = true; }, 10000);
  });
  if (rm) rm.addEventListener('click', function () { try { localStorage.removeItem('gofn-pin'); } catch (x) {} location.reload(); });
})();
