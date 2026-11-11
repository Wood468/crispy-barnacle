/* One artwork rule for every Pokémon picture: normal, Shiny, Shadow, Dynamax, Gigantamax, regional/named forms and costumes.
   Data-driven: identity is {dex, form, kind, costume, shiny}; the approved image comes from /artwork-manifest.json, then the legacy
   costume maps, then a deterministic rule built from a verified source pattern. Nothing is guessed from a file name, and an image
   that is not the exact variant is never shown as if it were: a missing costume or Gigantamax picture becomes the ordinary species
   picture with a visible badge. Shadow and Dynamax have no picture of their own in the game files, so they are the species picture
   plus a labelled treatment (the page draws the aura). Trainer clothing (tees, pants, helmets) is never a Pokémon costume. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GOVARIANTART = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VARIANT_KINDS = Object.freeze(['normal', 'shiny', 'shadow', 'dynamax', 'gigantamax', 'costume']);
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var AVATAR_ITEM = /\b(tee|t-?shirt|shirt|pants|jacket|hoodie|jersey|shorts|skirt|dress|backpack|helmet|glasses|sunglasses|socks|shoes|sneakers|boots|gloves|beanie|poncho|cape|outfit|pose)\b/i;
  var REGIONAL = { alolan: 'alolan', galarian: 'galarian', hisuian: 'hisuian', paldean: 'paldean' };
  var BADGES = { costume: 'Costume art unavailable', gigantamax: 'Form art unavailable', form: 'Form art unavailable', shadow: 'Shadow', dynamax: 'Dynamax' };
  /* Only same-origin routes and https images are ever used as exact art. */
  var SAFE_URL = /^(?:https:\/\/[^\s"'<>]+|\/img\/ext\/[A-Za-z0-9_.-]+|\/api\/art\?[A-Za-z0-9_%=&+.()'’~*!-]+)$/;

  function slug(t) { return String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  /* ---- #360 manifest contract (kept exactly: key, flat manifest, labelled species fallback only for Shadow/Dynamax) ---- */
  function variantKey(r) {
    var dex = Number(r.dex), form = r.form == null ? 'normal' : r.form, kind = r.kind == null ? 'normal' : r.kind, costume = r.costume || '';
    if (!Number.isInteger(dex) || dex < 1) throw new Error('Invalid Pokédex number');
    if (VARIANT_KINDS.indexOf(kind) < 0) throw new Error('Unknown variant kind');
    if (kind === 'costume' && !costume) throw new Error('Costume code required');
    return [dex, form, kind, kind === 'costume' ? costume : '', r.shiny ? 'shiny' : 'regular'].join('|');
  }
  function usable(e) { return !!e && e.status === 'approved' && typeof e.url === 'string' && SAFE_URL.test(e.url); }
  function resolveVariantArtwork(manifest, request) {
    var key = variantKey(request), exact = own(manifest, key) ? manifest[key] : null;
    if (usable(exact)) return { url: exact.url, kind: 'exact', key: key, source: exact.source == null ? null : exact.source };
    if (request.kind === 'shadow' || request.kind === 'dynamax') {
      var baseKey = variantKey({ dex: request.dex, form: request.form, kind: 'normal', shiny: request.shiny }), base = own(manifest, baseKey) ? manifest[baseKey] : null;
      if (usable(base)) return { url: base.url, kind: 'species-fallback', treatment: request.kind, key: key, source: base.source == null ? null : base.source };
    }
    return { url: null, kind: 'missing', key: key };
  }

  /* ---- request normalisation ---- */
  function parseName(raw) {
    var s = String(raw || '').replace(/\s+/g, ' ').trim(), paren = (/\(([^)]+)\)\s*$/.exec(s) || [])[1] || '';
    var core = s.replace(/\s*\([^)]*\)\s*$/, '').trim(), m, r = { base: core, form: 'normal', prefix: '', named: paren };
    if ((m = /^(Gigantamax|Dynamax|Shadow|Purified)\s+(.+)$/i.exec(core))) { r.prefix = m[1].toLowerCase(); r.base = m[2]; }
    if ((m = /^Mega\s+(.+?)(?:\s+([XY]))?$/i.exec(r.base))) { r.form = 'mega' + (m[2] ? '-' + m[2].toLowerCase() : ''); r.base = m[1]; }
    else if ((m = /^Primal\s+(.+)$/i.exec(r.base))) { r.form = 'primal'; r.base = m[1]; }
    else if ((m = /^(Alolan|Galarian|Hisuian|Paldean)\s+(.+)$/i.exec(r.base))) { r.form = REGIONAL[m[1].toLowerCase()]; r.base = m[2]; }
    else if (paren) r.form = slug(paren);
    return r;
  }
  function isAvatarItem(name) { return AVATAR_ITEM.test(String(name || '')) && !/\bwearing\b/i.test(String(name || '')); }

  /* input is what app.js art() already receives: { n, shiny, shadow, dynamax, costume, label, asset }. */
  function normalize(input, opts) {
    var o = typeof input === 'string' ? { n: input } : (input || {}), p = parseName(o.n), dexOf = (opts && opts.dexOf) || function () { return 0; };
    var costumed = !!(o.costume || o.asset), label = o.label || p.named || '';
    var kind = costumed ? 'costume' : p.prefix === 'gigantamax' ? 'gigantamax' : (o.dynamax && p.prefix !== 'gigantamax' || p.prefix === 'dynamax') ? 'dynamax' : (o.shadow || p.prefix === 'shadow') ? 'shadow' : 'normal';
    if (kind === 'normal' && p.prefix === 'purified') kind = 'normal';
    var dex = Number(o.dex) || Number(dexOf(p.base.toLowerCase())) || 0;
    return { name: String(o.n || ''), base: p.base, dex: dex, form: p.form, kind: kind, costume: costumed ? slug(label) : '', label: label, shiny: !!o.shiny,
      asset: o.asset ? String(o.asset) : '', avatar: !costumed && isAvatarItem(o.n) };
  }

  /* ---- resolution ---- */
  function entryFor(manifest, req) {
    if (!manifest || !req.dex || (req.kind === 'costume' && !req.costume)) return null;
    var key = variantKey({ dex: req.dex, form: req.form === 'normal' || req.kind === 'costume' || req.kind === 'gigantamax' ? 'normal' : req.form, kind: req.kind === 'dynamax' || req.kind === 'shadow' ? 'normal' : req.kind, costume: req.costume, shiny: req.shiny });
    var entries = manifest.entries || manifest;
    return own(entries, key) ? { key: key, entry: entries[key] } : { key: key, entry: null };
  }
  function legacyUrl(legacy, req) {
    if (!legacy) return '';
    var base = req.base.toLowerCase();
    if (req.kind === 'costume') { var k = base + '|' + String(req.label || '').toLowerCase(); return (req.shiny ? (legacy.shiny || {})[k] : (legacy.pictures || {})[k]) || ''; }
    if (req.kind === 'gigantamax') { var g = 'gigantamax ' + base; return (req.shiny ? (legacy.gmaxShiny || {})[g] : (legacy.gmax || {})[g]) || ''; }
    return '';
  }
  /* The same-origin PokeMiners proxy (/api/art) is the only route to pogo_assets; nothing is committed or redistributed. */
  function costumeRoute(req, asset, shiny) {
    return '/api/art?n=' + encodeURIComponent(req.base) + '&c=' + encodeURIComponent(asset.code) + (asset.prefix === 'c' ? '&cp=c' : '') + (shiny ? '&shiny=1' : '');
  }
  function gmaxRoute(req) { return '/api/art?n=' + encodeURIComponent('Gigantamax ' + req.base) + '&dynamax=1' + (req.shiny ? '&shiny=1' : ''); }

  /* Returns { key, kind, status, src, badge, treatment, basis, provenance, speciesSrc, label }.
       status: exact | fallback | treated | avatar | species
       basis:  manifest | legacy | rule | ''  (how an exact picture was chosen) */
  function resolve(input, manifest, opts) {
    opts = opts || {}; var req = normalize(input, opts), speciesSrc = typeof opts.speciesSrc === 'function' ? opts.speciesSrc : function () { return ''; };
    var out = { key: '', kind: req.kind, status: 'species', src: '', badge: '', treatment: '', basis: '', provenance: null, speciesSrc: '', label: req.label, request: req };
    if (req.avatar) { out.status = 'avatar'; out.badge = 'Trainer item'; return out; }
    var looked = entryFor(manifest, req); if (looked) out.key = looked.key;
    if (req.kind === 'costume' || req.kind === 'gigantamax') {
      var e = looked && looked.entry;
      if (usable(e)) { out.status = 'exact'; out.src = e.url; out.basis = 'manifest'; out.provenance = { source: e.source || '', sha256: e.sha256 || '', rights: e.rights || '' }; return out; }
      var lg = legacyUrl(opts.legacy, req);
      if (lg && SAFE_URL.test(lg)) { out.status = 'exact'; out.src = lg; out.basis = 'legacy'; out.provenance = { source: 'legacy costume map', sha256: '', rights: 'mirrored before manifest' }; return out; }
      if (req.kind === 'gigantamax' && req.dex && manifest && manifest.pokeminers && (manifest.pokeminers.gigantamax || []).indexOf(req.dex) >= 0) {
        out.status = 'exact'; out.src = gmaxRoute(req); out.basis = 'rule'; out.provenance = { source: 'PokeMiners pm' + req.dex + '.fGIGANTAMAX via /api/art', sha256: '', rights: 'edge proxy, not redistributed' }; return out;
      }
      out.status = 'fallback'; out.badge = BADGES[req.kind]; out.speciesSrc = speciesSrc(req.base, false); out.src = out.speciesSrc; return out;
    }
    out.speciesSrc = speciesSrc(String(req.name || req.base).replace(/^(Shadow|Dynamax|Purified)\s+/i, ''), req.shiny);
    out.src = out.speciesSrc;
    if (req.kind === 'shadow' || req.kind === 'dynamax') { out.status = 'treated'; out.treatment = req.kind; out.badge = BADGES[req.kind]; }
    return out;
  }

  /* De-duplicated image URL list for a batch of resolved pictures (preloading / tests). */
  function urls(results) { var seen = {}, out = []; (results || []).forEach(function (r) { if (r && r.src && !seen[r.src]) { seen[r.src] = 1; out.push(r.src); } }); return out; }

  return { VARIANT_KINDS: VARIANT_KINDS, BADGES: BADGES, SAFE_URL: SAFE_URL, slug: slug, variantKey: variantKey, resolveVariantArtwork: resolveVariantArtwork,
    parseName: parseName, normalize: normalize, isAvatarItem: isAvatarItem, resolve: resolve, urls: urls, costumeRoute: costumeRoute };
}));
