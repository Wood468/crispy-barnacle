// Read-only PokeMiners path inventory. Does not download, publish or approve assets.
import {writeFile} from 'node:fs/promises';
const endpoint='https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/master?recursive=1';
const response=await fetch(endpoint,{headers:{Accept:'application/vnd.github+json','User-Agent':'go-field-notes-asset-inventory'}});
if(!response.ok)throw new Error('GitHub tree request failed: '+response.status);
const data=await response.json();
if(data.truncated)throw new Error('GitHub tree was truncated; inventory would be incomplete');
const folders=['Images/Pokemon/','Images/Clothing/','3D Assets/Clothing/'];
const paths=data.tree.filter(x=>x.type==='blob'&&folders.some(f=>x.path.startsWith(f))).map(x=>({path:x.path,sha:x.sha,size:x.size})).sort((a,b)=>a.path.localeCompare(b.path));
const output={schemaVersion:1,source:endpoint,treeSha:data.sha,generatedAt:new Date().toISOString(),count:paths.length,files:paths};
const target=process.argv[2]||'/tmp/gofn-pokeminers-inventory.json';
await writeFile(target,JSON.stringify(output,null,2)+'\n');
console.log('Read-only inventory: '+paths.length+' paths -> '+target);
console.log('No assets downloaded or approved. Verify identity, bytes and rights separately.');
