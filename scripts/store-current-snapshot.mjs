/* Public Store listing membership from the hourly official Web Store watcher.
   DO NOT publish owner regional prices, USD checkout quotes or guessed availability.
   Exact official SKU imagery is optional and must not be reused across products. */
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const CDN='https://assets.pgo.webstore.nianticlabs.com';
const PREFIX='/pgo/image_variants/v1/sku_assets/';
export function safeStoreImage(value) {
  try {
    const u=new URL(value);
    return u.origin===CDN && u.pathname.startsWith(PREFIX) &&
      /\/w256\.webp$/.test(u.pathname) && !u.search && !u.hash &&
      !u.username && !u.password ? value : null;
  } catch { return null; }
}
export function buildCurrentSnapshot(state) {
  const values=Object.entries(state?.items||{}).filter(([href,row])=>
    /^\/purchase\/item\/[a-z0-9._-]+$/.test(href) &&
    row && typeof row.name==='string' && row.name.trim() &&
    Number.isFinite(Date.parse(row.lastSeen)));
  const dates=values.map(([,v])=>Date.parse(v.lastSeen));
  const last=dates.length?Math.max(...dates):NaN;
  const active=values.filter(([,v])=>last-Date.parse(v.lastSeen)<3600000);
  const images=new Map();
  for(const [,v] of active) {
    const image=safeStoreImage(v.images?.[0]);
    if(image)images.set(image,(images.get(image)||0)+1);
  }
  const items=active.map(([href,v])=>{
    const image=safeStoreImage(v.images?.[0]);
    return {
      name:v.name.trim(), slug:href.split('/').pop(),
      seenAt:v.lastSeen,
      // Only unique, exact-SKU publisher candidates are eligible for display.
      image:image && images.get(image)===1 ? image : null
    };
  }).sort((a,b)=>a.name.localeCompare(b.name));
  return {version:1,updated:Number.isFinite(last)?new Date(last).toISOString():null,items};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [input='data/store-state.json',output='public/store-current.json']=process.argv.slice(2);
  const result=buildCurrentSnapshot(JSON.parse(await readFile(input,'utf8')));
  await writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log('Official Store listing snapshot:',result.items.length,'public SKU names; no prices');
}
