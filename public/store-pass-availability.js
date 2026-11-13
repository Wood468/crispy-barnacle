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
    if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}(?:T.*Z)?$/.test(value)) return null;
    var parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function evidenceValid(e) {
    return !!(e && e.confirmed === true && typeof e.sourceUrl === 'string' &&
      /^https:\\/\\//.test(e.sourceUrl) && typeof e.locale === 'string' &&
      e.locale.trim() && typeof e.channel === 'string' && e.channel.trim());
  }
  function classifyEventWindow(offer, now) {
    var start = time(offer.eventStartAt), end = time(offer.eventEndsAt), n = now;
    if (start === null || end === null || end < start) return 'unknown';
    if (n < start) return 'upcoming';
    return n <= end ? 'active' : 'ended';
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

    var purchaseEnd = time(offer.purchaseEndAt);
    var retirement = offer.retirementEvidence;
    var availability = 'unknown', reason = 'No fresh, locale-specific official listing or explicit retirement evidence';
    if (purchaseEnd !== null && purchaseEnd <= now && evidenceValid(retirement)) {
      availability = 'confirmed-retired';
      reason = 'Explicit purchase end date has passed and is backed by source evidence';
    } else {
      var listing = offer.listingEvidence;
      var checked = listing && time(listing.checkedAt);
      if (listing && listing.listed === true && evidenceValid(listing) && checked !== null) {
        var age = now - checked;
        if (age >= 0 && age <= maxAge * DAY) {
          availability = 'confirmed-listed';
          reason = 'Official offer listing was observed recently for this locale and channel';
        } else if (age < 0) {
          reason = 'Listing evidence is dated in the future';
        } else {
          reason = 'Official listing evidence is stale and needs rechecking';
        }
      } else if (purchaseEnd !== null && purchaseEnd <= now) {
        reason = 'Purchase end date lacks corroborating retirement evidence';
      }
    }
    return {
      availability: availability,
      reason: reason,
      eventWindow: classifyEventWindow(offer, now),
      claimWindow: classifyClaimWindow(offer, now),
      evidence: availability === 'confirmed-listed' ? {
        sourceUrl: offer.listingEvidence.sourceUrl,
        locale: offer.listingEvidence.locale,
        channel: offer.listingEvidence.channel,
        checkedAt: offer.listingEvidence.checkedAt
      } : availability === 'confirmed-retired' ? {
        sourceUrl: retirement.sourceUrl,
        locale: retirement.locale,
        channel: retirement.channel,
        checkedAt: retirement.checkedAt
      } : null
    };
  }
  return { classify: classify, DEFAULT_MAX_AGE_DAYS: DEFAULT_MAX_AGE_DAYS };
});
