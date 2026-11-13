// CI guard: a changed, directly referenced JS/CSS asset must receive a new URL version.
// Revalidated after the source-backed event data correction landed on main.
// Uses the PR base SHA (or push-before SHA) and avoids importer-owned data.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const base=process.env.GOFN_BASE_SHA;
if(!base || /^0+$/.test(base)){console.log('No comparison base; skipping changed-asset check');process.exit(0);}
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'});
const changed=git('diff','--name-only',base,'HEAD','--','public').trim().split('\n').filter(p=>/^public\/[^/]+\.(js|css)$/.test(p));
const current=readFileSync('public/index.html','utf8');
const old=git('show',base+':public/index.html');
const references=html=>Object.fromEntries([...html.matchAll(/(?:src|href)=["']\/([^"'?]+\.(?:js|css))\?v=([^"']+)["']/g)].map(m=>[m[1],m[2]]));
const before=references(old),after=references(current);
const errors=[];
for(const file of changed){const path=file.slice(7);if(!(path in before))continue;
 if(!(path in after))errors.push(file+' was removed from index references; review required');
 else if(before[path]===after[path])errors.push(file+' changed but index.html kept ?v='+after[path]);
}
const sw=readFileSync('public/sw.js','utf8');
for(const [path,version] of Object.entries(after)){
 if(!sw.includes('/'+path+'?v='+version))errors.push('sw.js does not cache current /'+path+'?v='+version);
}
if(errors.length){console.error('Asset version check failed:\n'+errors.join('\n'));process.exit(1)}
console.log('Asset versions verified for '+changed.length+' changed JS/CSS files and '+Object.keys(after).length+' index references.');
