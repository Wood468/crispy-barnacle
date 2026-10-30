(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GOLOCAL = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ACTIVE_KEY = 'gofn-active-identity-v1';
  var PARTITIONS_KEY = 'gofn-local-partitions-v1';
  var KEYS = {
    dex: 'gofn-dex-v1',
    stamp: 'gofn-stamp',
    base: 'gofn-dex-base-v1',
    us: 'gofn-us-v1',
    saved: 'gofn-saved',
    follow: 'gofn-follow'
  };

  function parse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }
  function emptySnapshot() {
    return { dex: null, stamp: null, base: null, us: null, saved: null, follow: null };
  }
  function readSnapshot(storage) {
    var out = {};
    Object.keys(KEYS).forEach(function (name) { out[name] = storage.getItem(KEYS[name]); });
    return out;
  }
  function writeSnapshot(storage, snapshot) {
    Object.keys(KEYS).forEach(function (name) {
      var value = snapshot && snapshot[name];
      if (value === null || value === undefined) storage.removeItem(KEYS[name]);
      else storage.setItem(KEYS[name], String(value));
    });
  }
  function mergeMap(local, remote, preferLocal) {
    local = local && typeof local === 'object' && !Array.isArray(local) ? local : {};
    remote = remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : {};
    var out = {}, k;
    Object.keys(remote).forEach(function (key) { out[key] = remote[key]; });
    Object.keys(local).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(remote, key) || preferLocal) out[key] = local[key];
    });
    return out;
  }
  // Legacy Dex snapshots have no per-mark deletion tombstones. Merge additions from both
  // devices and use the newer snapshot only when both devices changed the same key.
  function mergeDexSnapshot(local, remote, localUpdated, remoteUpdated) {
    local = local || {}; remote = remote || {};
    var preferLocal = Number(localUpdated || 0) > Number(remoteUpdated || 0);
    var out = {
      have: mergeMap(local.have, remote.have, preferLocal),
      hundo: mergeMap(local.hundo, remote.hundo, preferLocal),
      bt: mergeMap(local.bt, remote.bt, preferLocal),
      m: {}
    };
    var lm = local.m && typeof local.m === 'object' ? local.m : {};
    var rm = remote.m && typeof remote.m === 'object' ? remote.m : {};
    var categories = {};
    Object.keys(rm).concat(Object.keys(lm)).forEach(function (key) { categories[key] = true; });
    Object.keys(categories).forEach(function (key) { out.m[key] = mergeMap(lm[key], rm[key], preferLocal); });
    return out;
  }
  function mergeUserState(local, remote) {
    local = local || {}; remote = remote || {};
    var out = {}, key;
    Object.keys(local).forEach(function (k) { out[k] = local[k]; });
    Object.keys(remote).forEach(function (k) {
      if (!out[k] || Number(remote[k] && remote[k].t || 0) >= Number(out[k] && out[k].t || 0)) out[k] = remote[k];
    });
    return out;
  }
  function unionLists(a, b) {
    var out = [], seen = {};
    [a, b].forEach(function (raw) {
      parse(raw, Array.isArray(raw) ? raw : []).forEach(function (value) {
        var key = String(value);
        if (!seen[key]) { seen[key] = true; out.push(value); }
      });
    });
    return JSON.stringify(out);
  }
  // Merge the current device snapshot (source) into the destination identity's saved snapshot.
  function mergeSnapshots(target, source) {
    target = target || emptySnapshot(); source = source || emptySnapshot();
    var targetStamp = Number(target.stamp || 0), sourceStamp = Number(source.stamp || 0);
    var dex = mergeDexSnapshot(parse(source.dex, {}), parse(target.dex, {}), sourceStamp, targetStamp);
    var us = mergeUserState(parse(source.us, {}), parse(target.us, {}));
    return {
      dex: JSON.stringify(dex),
      stamp: String(Math.max(targetStamp, sourceStamp)),
      base: String(Math.max(Number(target.base || 0), Number(source.base || 0))),
      us: JSON.stringify(us),
      saved: unionLists(target.saved, source.saved),
      follow: unionLists(target.follow, source.follow)
    };
  }
  // Keep each account's device cache separate. Only anonymous/guest marks are imported into
  // the first account signed into on this device; switching between accounts never copies data.
  function activate(storage, targetIdentity, mergeGuest) {
    if (!storage || !targetIdentity) return false;
    try {
      var partitions = parse(storage.getItem(PARTITIONS_KEY), {});
      if (!partitions || typeof partitions !== 'object' || Array.isArray(partitions)) partitions = {};
      var active = storage.getItem(ACTIVE_KEY);
      var current = readSnapshot(storage);
      if (!active) {
        var initial = partitions[targetIdentity] ? mergeSnapshots(partitions[targetIdentity], current) : current;
        partitions[targetIdentity] = initial;
        storage.setItem(PARTITIONS_KEY, JSON.stringify(partitions));
        writeSnapshot(storage, initial);
        storage.setItem(ACTIVE_KEY, targetIdentity);
        return true;
      }
      if (active === targetIdentity) {
        partitions[targetIdentity] = current;
        storage.setItem(PARTITIONS_KEY, JSON.stringify(partitions));
        return true;
      }
      partitions[active] = current;
      var next = partitions[targetIdentity] || emptySnapshot();
      if (mergeGuest && active === 'guest') {
        next = mergeSnapshots(next, current);
        delete partitions.guest;
      }
      partitions[targetIdentity] = next;
      storage.setItem(PARTITIONS_KEY, JSON.stringify(partitions));
      writeSnapshot(storage, next);
      storage.setItem(ACTIVE_KEY, targetIdentity);
      return true;
    } catch (e) { return false; }
  }

  return {
    activate: activate,
    readSnapshot: readSnapshot,
    writeSnapshot: writeSnapshot,
    mergeDexSnapshot: mergeDexSnapshot,
    mergeUserState: mergeUserState,
    mergeSnapshots: mergeSnapshots,
    activeKey: ACTIVE_KEY,
    partitionsKey: PARTITIONS_KEY
  };
}));
