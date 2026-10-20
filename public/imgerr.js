// Picture fallbacks without inline handlers (so the page can forbid inline scripts).
// A picture marked data-err="rm" removes itself when it cannot load, "prm" removes its wrapper, "art" tries its still image first.
// data-load="has" marks the wrapper once the picture has loaded.
(function () {
  document.addEventListener('error', function (e) {
    var i = e.target; if (!i || i.tagName !== 'IMG') return;
    var a = i.getAttribute('data-err'); if (!a) return;
    if (a === 'rm') i.remove();
    else if (a === 'prm') { if (i.parentNode) i.parentNode.remove(); }
    else if (a === 'art' && typeof window.GOARTERR === 'function') window.GOARTERR(i);
  }, true);
  document.addEventListener('load', function (e) {
    var i = e.target; if (!i || i.tagName !== 'IMG') return;
    if (i.getAttribute('data-load') === 'has' && i.parentNode) i.parentNode.classList.add('has');
  }, true);
})();
