/* Publisher-identified product listings with NO checked regional checkout price.
   Public and non-sensitive: never place owner-only observations in this file.
   These product IDs are internal tracking keys, not verified cross-region SKUs.
   Adding a source description does NOT establish AU/ID/IN availability. */
(function (root, factory) {
  var offers = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = offers;
  if (root) root.GOStoreOfferIdentities = offers;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var source = 'https://pokemongo.com/news/go-pass-november-2026';
  function offer(id, label, ranks, quantities) {
    var contents = [{item:'GO Pass Deluxe: November',quantity:1}];
    if (ranks) contents.push({item:'Bonus Ranks',quantity:ranks});
    ['Ultra Ball','Max Revive','Premium Battle Pass','Max Potion'].forEach(function (name,i) {
      contents.push({item:name,quantity:quantities[i]});
    });
    return {id:id,label:label,group:'Passes & tickets',contents:contents,
      sourceUrl:source,sourceCheckedAt:'2026-11-13',regionAvailability:'unknown',
      noPriceObservation:true};
  }
  return [
    offer('official:november-deluxe','GO Pass Deluxe: November',0,[10,5,1,5]),
    offer('official:november-ranks-10','GO Pass Deluxe: November + 10 Ranks',10,[10,5,2,5]),
    offer('official:november-ultra-box','GO Pass Deluxe: November Ultra Box',10,[20,10,5,10])
  ];
});
