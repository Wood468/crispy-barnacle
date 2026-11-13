/* Pokémon and raid-boss infographics: exact owner-approved form/mode guide library.
 * No event, rotation date, external guessing or personal Collection data needed.
 */
(function () {
  'use strict';
  var L = window.GOPOKEMONGUIDESLOGIC;
  if (!L || !document.getElementById('boss-guide-list')) return;
  var $ = function (id) { return document.getElementById(id); };
  var dex = [], forms = [], pub = [], queue = [], decisions = [], guides = [], error = '';
  var filter = 'all', search = '', request = 0, returnFocus = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  }); }
  function imageURL(value) {
    if (typeof value !== 'string' || value.length > 1500) return '';
    if (/^\/infographics\/[\w./-]+$/i.test(value) && !value.includes('..')) return value;
    try {
      var u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password || (window.GOLIB &&
          window.GOLIB.isPrivateLink && window.GOLIB.isPrivateLink(value))) return '';
      return u.href;
    } catch (e) { return ''; }
  }
  function sourceURL(value) {
    return window.GOLIB && window.GOLIB.publicLink ? window.GOLIB.publicLink(value) : '';
  }
  function fromServer(url) {
    return fetch(url, {cache:'no-cache'}).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function load() {
    var seq = ++request;
    Promise.allSettled([
      fromServer('/event-info.json'),
      fromServer('/infographic-queue.json'),
      fromServer('/api/ig-decisions'),
      dex.length ? Promise.resolve(dex) : fromServer('/dex.json'),
      forms.length ? Promise.resolve({f:forms}) : fromServer('/forms.json')
    ]).then(function (all) {
      if (seq !== request) return;
      if (all[0].status === 'fulfilled' && all[0].value && Array.isArray(all[0].value.pokemonGuides))
        pub = all[0].value.pokemonGuides;
      if (all[1].status === 'fulfilled' && all[1].value && Array.isArray(all[1].value.items))
        queue = all[1].value.items;
      if (all[2].status === 'fulfilled' && all[2].value && Array.isArray(all[2].value.decisions))
        decisions = all[2].value.decisions;
      if (all[3].status === 'fulfilled' && Array.isArray(all[3].value)) dex = all[3].value;
      if (all[4].status === 'fulfilled' && all[4].value && Array.isArray(all[4].value.f))
        forms = all[4].value.f;
      error = (all[0].status === 'rejected' || all[2].status === 'rejected')
        ? 'Some guide information could not be refreshed. Previously loaded guides remain visible.' : '';
      guides = L.entries(pub, queue, decisions).filter(function (g) {
        return g.infographics.some(function (im) { return !!imageURL(im.url); });
      });
      render();
    });
  }
  function isMax(g) { return g.battleMode === 'dynamax' || g.battleMode === 'gigantamax'; }
  function render() {
    var result = $('boss-guide-list'), note = $('boss-guide-status'); if (!result) return;
    if (note) note.textContent = error || (guides.length ? guides.length + ' exact Pokémon/form guides available. These remain after events end.' : 'No approved Pokémon guides yet.');
    var displayed = guides.map(function (g, i) { return {g:g,i:i}; }).filter(function (x) {
      var name = L.label(x.g,dex,forms).toLowerCase();
      return (filter === 'all' || (filter === 'max') === isMax(x.g)) && (!search || name.includes(search));
    });
    result.innerHTML = displayed.length ? displayed.map(function (x) {
      var g=x.g, imgs=g.infographics.filter(function (im) { return imageURL(im.url); }),
          thumb=imgs[0], name=L.label(g,dex,forms);
      return '<article class="boss-guide-card"><button type="button" data-boss-guide="' + x.i +
        '" aria-label="Open ' + esc(name) + ' infographic">'
        + '<img loading="lazy" decoding="async" src="' + esc(imageURL(thumb.url)) +
        '" alt="">'
        + '<span class="boss-guide-info"><b>' + esc(name) + '</b><small>' +
          esc(g.battleMode === 'dynamax' || g.battleMode === 'gigantamax' ? 'Max Battles' : 'Raids') +
          ' · ' + imgs.length + ' approved guide' + (imgs.length === 1 ? '' : 's') + '</small></span></button></article>';
    }).join('') : '<p class="note">No matching approved guides for this selection.</p>';
    document.querySelectorAll('[data-boss-guide-filter]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-boss-guide-filter') === filter));
    });
  }
  function modal(g, focus) {
    var images = g.infographics.filter(function (im) { return imageURL(im.url); });
    if (!images.length) return;
    returnFocus = focus || document.activeElement;
    var host = $('boss-guide-dialog');
    if (!host) {
      host = document.createElement('div');host.id='boss-guide-dialog';host.className='goinfo';
      host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');
      host.setAttribute('aria-label','Pokémon raid boss infographic');document.body.appendChild(host);
    }
    var name=L.label(g,dex,forms);
    host.innerHTML = '<div class="goinfo-panel"><div class="goinfo-top"><b>' + esc(name) +
      ' · ' + esc(g.battleMode) + '</b><button type="button" class="goinfo-close" data-boss-guide-close aria-label="Close Pokémon guide">×</button></div>'
      + images.map(function (im) {
        var src=sourceURL(im.sourceUrl);
        return '<section class="goinfo-poster"><div class="goinfo-poster-top">' +
          esc(im.source || 'Community guide') + (im.pending ? ' · recently approved' : '') +
          '</div><img src="' + esc(imageURL(im.url)) + '" alt="' + esc(im.alt || name+' infographic') +
          '" loading="lazy" decoding="async" style="display:block;width:100%;height:auto;max-height:78vh;object-fit:contain">' +
          (src ? '<a class="goinfo-source" target="_blank" rel="noopener noreferrer" href="' + esc(src) + '">View creator/source</a>' : '') +
          '</section>';
      }).join('') + '</div>';
    host.hidden=false; document.body.style.overflow='hidden';
    var b=host.querySelector('[data-boss-guide-close]');if(b)b.focus();
  }
  function close() {
    var host=$('boss-guide-dialog');if(!host||host.hidden)return;
    host.hidden=true;document.body.style.overflow='';
    if(returnFocus&&returnFocus.isConnected&&returnFocus.focus)returnFocus.focus();
    returnFocus=null;
  }
  document.addEventListener('error', function (e) {
    if (e.target && e.target.closest && e.target.closest('#boss-guide-list img')) e.target.hidden=true;
  }, true);
  document.addEventListener('click',function (e) {
    var el=e.target; if(!el||!el.closest)return;
    var item=el.closest('[data-boss-guide]');if(item){
      var ix=+item.getAttribute('data-boss-guide');if(guides[ix])modal(guides[ix],item);return;
    }
    var f=el.closest('[data-boss-guide-filter]');if(f){
      filter=f.getAttribute('data-boss-guide-filter');render();return;
    }
    if(el.closest('[data-boss-guide-close]')||el===$('boss-guide-dialog'))close();
  });
  document.addEventListener('keydown',function (e) {
    var h=$('boss-guide-dialog');if(!h||h.hidden)return;
    if(e.key==='Escape'){e.preventDefault();close();}
    else if(e.key==='Tab'){e.preventDefault();var b=h.querySelector('[data-boss-guide-close]');if(b)b.focus();}
  },true);
  var input=$('boss-guide-search');if(input)input.addEventListener('input',function(){
    search=input.value.trim().toLowerCase();render();
  });
  document.addEventListener('gofn-review-updated',function(e){if(e.detail&&e.detail.decided)load();});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)load();});
  load();
})();
