/* Read-only inventory of exact Store item art and publisher product-image candidates.
   A stored CDN URL is NOT an approved product picture or a licence.
   This tool never changes Store data, copies copyrighted imagery, or connects
   an image to a product by similar title. */
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname,join} from 'node:path';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const CDN='assets.pgo.webstore.nianticlabs.com';
const PRODUCT='/pgo/image_variants/v1/sku_assets/';
const localIcon=/^\/ico\/(?:i\/|g\/)?[a-z0-9-]+\.webp$/;
const purchase=/^\/purchase\/item\/[a-z0-9-]+$/;

/* Existing exact Store item paths, not carte blanche to add generic raid or
   egg imagery. A newly mapped path needs independent source+visual review. */
const baselineExact=new Set([
  '/ico/i/max-potion.webp','/ico/i/max-revive.webp',
  '/ico/i/golden-razz.webp','/ico/i/silver-pinap.webp',
  '/ico/incense.webp','/ico/g/elite-fast-tm.webp',
  '/ico/g/elite-charged-tm.webp','/ico/g/raidpass.webp'
]);

function remoteAsset(url) {
  try {
    const u=new URL(url);
    return u.protocol==='https:' && u.hostname===CDN && !u.username && !u.password
      && !u.port && !u.search && !u.hash
      && u.pathname.startsWith(PRODUCT) && /\/w\d+\.webp$/.test(u.pathname);
  } catch { return false; }
}
function iconPaths(source) {
  const start=source.indexOf('  var ICO = [');
  const end=source.indexOf('  ];',start);
  if(start<0||end<start)throw new Error('Store exact-item icon mapping unavailable');
  const segment=source.slice(start,end);
  return Array.from(new Set([...segment.matchAll(/'(\/ico\/[a-z0-9/_-]+\.webp)'/g)].map(m=>m[1])));
}
function validateIcon(relative,exists=existsSync,size=p=>statSync(p).size) {
  if(typeof relative!=='string'||!localIcon.test(relative))
    return {path:String(relative),valid:false,reason:'unsafe or ambiguous item icon path'};
  const abs=join(ROOT,'public',relative);
  if(!exists(abs))return {path:relative,valid:false,reason:'missing local file'};
  if(size(abs)<=0)return {path:relative,valid:false,reason:'empty local file'};
  const content=readFileSync(abs);
  if(content.subarray(0,4).toString()!=='RIFF'||content.subarray(8,12).toString()!=='WEBP')
    return {path:relative,valid:false,reason:'not a WebP image'};
  return {path:relative,valid:true,bytes:content.length};
}
export function auditStoreArtwork({source='',items=[]}={}) {
  const icons=iconPaths(source).map(path=>{
    const result=validateIcon(path);
    return baselineExact.has(path)?result:
      {path,valid:false,reason:'new exact-item artwork requires independent source/visual review'};
  });
  const entries=[],shared=new Map(),invalid=[];
  for(const [index,row] of (Array.isArray(items)?items:[]).entries()) {
    if(!row||typeof row.name!=='string')continue;
    const href=typeof row.href==='string'?row.href:'';
    const image=typeof row.image==='string'?row.image:'';
    const validHref=purchase.test(href);
    const validAsset=remoteAsset(image);
    const reason=!image?'no captured official image'
      :!validHref?'image cannot be tied to a safe purchase slug'
      :!validAsset?'untrusted or malformed image URL':null;
    const status=reason?'missing-or-rejected':'publisher-candidate-unreviewed';
    if(image && reason)invalid.push({name:row.name,href,reason});
    const entry={name:row.name,href,sourceStatus:row.imageStatus||'unknown',
      image:validHref&&validAsset?image:null,status,reason,
      lastSeen:row.lastSeen||null};
    entries.push(entry);
    if(!reason){
      if(!shared.has(image))shared.set(image,[]);
      shared.get(image).push({name:row.name,href});
    }
  }
  const duplicateImages=[...shared.entries()]
    .filter(([,refs])=>new Set(refs.map(x=>x.href)).size>1)
    .map(([image,refs])=>({image,offers:refs}))
    .sort((a,b)=>b.offers.length-a.offers.length);
  const counts={listings:entries.length,remoteCandidates:entries.filter(x=>x.status==='publisher-candidate-unreviewed').length,
    missingOrRejected:entries.filter(x=>x.status==='missing-or-rejected').length,
    duplicateImageGroups:duplicateImages.length,
    localExactIcons:icons.filter(x=>x.valid).length,
    invalidLocalIcons:icons.filter(x=>!x.valid).length};
  return {policy:'Remote product images are publisher candidates only until visually reviewed against exact purchase slugs and rights. Shared imagery is ambiguous; never substitute a different SKU picture.',counts,localIcons:icons,remoteListings:entries,duplicateImages,invalid};
}
/* Audit the freshly fetched source, not just the filtered public log (which
   includes passes/tickets/boxes but excludes standalone items). Rows remain
   publisher image *candidates*, with no runtime approval or price values. */
export function snapshotArtworkRows(snapshot) {
  if(!snapshot||!Array.isArray(snapshot.items)||snapshot.items.length<3)
    throw new Error('No usable Store snapshot for artwork audit');
  return snapshot.items.map((row,index)=>{
    if(!row||typeof row.name!=='string'||!row.name.trim())
      throw new Error('Malformed Store snapshot item #'+(index+1)+': missing name');
    const images=Array.isArray(row.imgs)?row.imgs:[];
    return {
      name:row.name,
      href:typeof row.href==='string'?row.href:'',
      image:images.length?images[0]:null,
      imageStatus:images.length?'unverified-snapshot':'missing',
      lastSeen:typeof snapshot.fetched==='string'?snapshot.fetched:null
    };
  });
}
export {remoteAsset,iconPaths,validateIcon};

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const source=readFileSync(join(ROOT,'public/store.js'),'utf8');
  const snapshotPath=process.argv[2];
  const rows=snapshotPath
    ? snapshotArtworkRows(JSON.parse(readFileSync(resolve(snapshotPath),'utf8')))
    : JSON.parse(readFileSync(join(ROOT,'public/store-log.json'),'utf8')).items;
  const result=auditStoreArtwork({source,items:rows});
  console.log(JSON.stringify({input:snapshotPath?'fresh-store-snapshot':'public-store-log',...result},null,2));
  if(result.counts.invalidLocalIcons)process.exitCode=1;
}
