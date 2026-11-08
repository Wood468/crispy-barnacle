#!/usr/bin/env node
// Read-only validation of R2 references and costume/form manifest consistency.
// Usage: node scripts/check-remote-assets.mjs [--live] [--base https://pogo.michaelpuff.com]
// Default: offline validation. --live issues HEAD requests to the public app only.
import {readFileSync} from 'node:fs';
const live=process.argv.includes('--live');
const baseArg=process.argv.indexOf('--base');
const base=baseArg>=0?process.argv[baseArg+1]:'https://pogo.michaelpuff.com';
if(live && (!/^https:\/\/[a-z0-9.-]+$/i.test(base)||new URL(base).username))throw Error('Provide an HTTPS origin, not a path');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const costumes=read('public/costumes.json');
const sections=['pictures','shiny','gmax','gmaxShiny'];
const problems=[],warnings=[],refs=new Map();
for(const section of sections){
 for(const [key,path] of Object.entries(costumes[section]||{})){
  if(!/^\/img\/ext\/[a-zA-Z0-9._-]+$/.test(path)){problems.push({section,key,path,reason:'invalid R2 asset path'});continue;}
  if(!refs.has(path))refs.set(path,[]);
  refs.get(path).push(section+':'+key);
 }
}
for(const key of Object.keys(costumes.shiny||{}))if(!(key in (costumes.pictures||{})))warnings.push({key,reason:'shiny costume without normal mapping'});
for(const key of Object.keys(costumes.gmaxShiny||{}))if(!(key in (costumes.gmax||{})))warnings.push({key,reason:'shiny Gigantamax without normal mapping'});
for(const [path,keys] of refs)if(keys.length>1)warnings.push({path,keys,reason:'shared URL across manifest keys (review identity)'});
const result={mode:live?'live':'offline',manifestCounts:Object.fromEntries(sections.map(s=>[s,Object.keys(costumes[s]||{}).length])),uniqueCostumeR2Paths:refs.size,problems,warnings,remote:[]};
if(live){
 const paths=[...refs.keys()];
 const concurrency=6;let cursor=0;
 await Promise.all(Array.from({length:concurrency},async()=>{
  while(cursor<paths.length){
   const path=paths[cursor++];
   try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    let res;
    try{res=await fetch(base+path,{method:'HEAD',signal:controller.signal,redirect:'manual'});}
    finally{clearTimeout(timeout);}
    result.remote.push({path,status:res.status,ok:res.ok,contentType:res.headers.get('content-type')||''});
   }catch(e){result.remote.push({path,error:e.name||'request failed'});}
  }
 }));
 result.remote.sort((a,b)=>a.path.localeCompare(b.path));
}
console.log(JSON.stringify(result,null,2));
if(problems.length||result.remote.some(r=>r.status===404||r.status===410))process.exitCode=1;
