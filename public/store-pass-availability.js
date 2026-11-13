/* Source-backed Store pass availability. Public metadata only; never infer checkout
   availability from historical regional price observations or event dates.
   Listing evidence is locale/channel scoped and freshness bounded. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GOStorePassAvailability = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var DAY = 86400000;
  var DEFAULT_MAX_AGE_DAYS = 7;
  function time(value) {
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}(?:T.*Z)?$/.test(value)) return null;
    // Reject calendar overflow and non-canonical timestamps that Date.parse may normalize.
    var match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z)?$/.exec(value);
    if (!match) return null;
    var parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return null;
    var d = new Date(parsed);
    if (d.getUTCFullYear() !== Number(match[1]) ||
        d.getUTCMonth() + 1 !== Number(match[2]) ||
        d.getUTCDate() !== Number(match[3])) return null;
    return parsed;
  }
  function evidenceValid(e, offer, now, maxAge) {
    if (!(e && e.confirmed === true && typeof e.sourceUrl === 'string' &&
      /^https:\/\/[^/\s?#]+(?:[/?#]|$)/.test(e.sourceUrl) &&
      typeof e.locale === 'string' && e.locale.trim() &&
      typeof e.channel === 'string' && e.channel.trim())) return false;
    if (offer.locale != null && offer.locale !== e.locale) return false;
    if (offer.channel != null && offer.channel !== e.channel) return false;
    var checked = time(e.checkedAt);
    return checked !== null && checked <= now && now - checked <= maxAge * DAY;
  }
  function classifyEventWindow(offer, now) {
    var start = time(offer.eventStartAt), end = time(offer.eventEndsAt);
    if (start === null || end === null || end < start) return 'unknown';
    if (now < start) return 'upcoming';
    return now <= end ? 'active' : 'ended';
  }
  function classifyClaimWindow(offer, now) {
    var until = time(offer.claimUntil);
    if (until === null) return 'unknown';
    return now <= until ? 'claimable' : 'claim-expired';
  }
  function classify(offer, nowValue, maxAgeDays) {
    offer = offer && typeof offer === 'object' ? offer : {};
    var now = nowValue instanceof Date ? nowValue.getTime() :
      (typeof nowValue === 'number' ? nowValue : Date.parse(nowValue));
    if (!Number.isFinite(now)) throw new TypeError('A valid evaluation time is required');
    var maxAge = maxAgeDays == null ? DEFAULT_MAX_AGE_DAYS : Number(maxAgeDays);
    if (!Number.isFinite(maxAge) || maxAge < 0) throw new TypeError('maxAgeDays must be a non-negative number');
    var purchaseEnd = time(offer.purchaseEndAt), retirement = offer.retirementEvidence;
    var availability = 'unknown';
    var reason = 'No fresh, locale-specific official listing or explicit retirement evidence';
    var listing = offer.listingEvidence;
    var live = listing && listing.listed === true && evidenceValid(listing, offer, now, maxAge);
    var ended = purchaseEnd !== null && purchaseEnd <= now &&
      evidenceValid(retirement, offer, now, maxAge);
    if (live && ended && time(listing.checkedAt) > purchaseEnd) {
      reason = 'Conflicting official listing and retirement evidence requires reconciliation';
    } else if (ended) {
      availability = 'confirmed-retired';
      reason = 'Explicit purchase end date has passed and is backed by recent matching evidence';
    } else if (live) {
      availability = 'confirmed-listed';
      reason = 'Official offer listing was observed recently for this locale and channel';
    } else if (purchaseEnd !== null && purchaseEnd <= now) {
      reason = 'Purchase end date lacks fresh corroborating retirement evidence';
    }
    return {
      availability: availability, reason: reason,
      eventWindow: classifyEventWindow(offer, now),
      claimWindow: classifyClaimWindow(offer, now),
      evidence: availability === 'confirmed-listed' ? {
        sourceUrl: offer.listingEvidence.sourceUrl, locale: offer.listingEvidence.locale,
        channel: offer.listingEvidence.channel, checkedAt: offer.listingEvidence.checkedAt
      } : availability === 'confirmed-retired' ? {
        sourceUrl: retirement.sourceUrl, locale: retirement.locale,
        channel: retirement.channel, checkedAt: retirement.checkedAt
      } : null
    };
  }
  return { classify: classify, DEFAULT_MAX_AGE_DAYS: DEFAULT_MAX_AGE_DAYS };
});
