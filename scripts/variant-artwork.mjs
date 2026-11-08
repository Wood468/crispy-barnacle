// Asset variant resolution is deliberately data-driven. No unverified art is synthesized.
export const VARIANT_KINDS = Object.freeze(['normal','shiny','shadow','dynamax','gigantamax','costume']);
const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
export function variantKey({dex, form='normal', kind='normal', costume='', shiny=false}) {
  if (!Number.isInteger(Number(dex)) || Number(dex)<1) throw new Error('Invalid Pokédex number');
  if (!VARIANT_KINDS.includes(kind)) throw new Error('Unknown variant kind');
  if (kind==='costume' && !costume) throw new Error('Costume code required');
  return [Number(dex),form,kind,kind==='costume'?costume:'',shiny?'shiny':'regular'].join('|');
}
/**
 * Exact variant artwork only. No fallback to normal art for Gigantamax or
 * costumes: callers must explicitly show a labelled placeholder instead.
 * Shadow/Dynamax can use normal species artwork only with an explicit visual
 * treatment flag; this function never claims it is a genuine special sprite.
 */
export function resolveVariantArtwork(manifest, request) {
  const key=variantKey(request);
  const exact=own(manifest,key)?manifest[key]:null;
  if (exact && exact.status==='approved' && typeof exact.url==='string' && /^https:\/\//.test(exact.url))
    return {url:exact.url,kind:'exact',key,source:exact.source??null};
  if (request.kind==='shadow' || request.kind==='dynamax') {
    const baseKey=variantKey({...request,kind:'normal',costume:''});
    const base=own(manifest,baseKey)?manifest[baseKey]:null;
    if (base && base.status==='approved' && typeof base.url==='string' && /^https:\/\//.test(base.url))
      return {url:base.url,kind:'species-fallback',treatment:request.kind,key,source:base.source??null};
  }
  return {url:null,kind:'missing',key};
}
