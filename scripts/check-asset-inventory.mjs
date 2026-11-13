#!/usr/bin/env node
// Read-only asset inventory validator. Usage: node scripts/check-asset-inventory.mjs [csv path]
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const input = process.argv[2] || 'docs/asset-inventory/asset-inventory.csv';
function parseCSV(src) {
  const rows=[]; let row=[], field='', quote=false;
  for(let i=0;i<src.length;i++){const c=src[i];if(quote){if(c==='"'&&src[i+1]==='"'){field+='"';i++;}else if(c==='"')quote=false;else field+=c;}else if(c==='"')quote=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}
  if(field||row.length){row.push(field);rows.push(row);}return rows;
}
if(!existsSync(input)){console.error('Inventory CSV unavailable:',input,'— pass the path to PR #355 inventory');process.exit(2);}
const [headers,...rows]=parseCSV(readFileSync(input,'utf8'));const at=Object.fromEntries(headers.map((h,i)=>[h,i]));
for(const key of ['path','git_blob_sha','category','duplicate_paths','reference_status'])if(!(key in at))throw Error('Missing column: '+key);
const seen=new Set(), problems=[], categories={};
for(const [i,r] of rows.entries()){
 const path=r[at.path];if(!path)continue;
 if(seen.has(path))problems.push('duplicate inventory row: '+path);seen.add(path);
 categories[r[at.category]||'uncategorised']=(categories[r[at.category]||'uncategorised']||0)+1;
 if(!existsSync(resolve(path)))problems.push('tracked asset missing locally: '+path);
 if(!/^[0-9a-f]{40}$/i.test(r[at.git_blob_sha]||''))problems.push('invalid blob SHA: '+path);
}
console.log(JSON.stringify({total:seen.size,categories,problems:problems.slice(0,100),problemCount:problems.length},null,2));
if(problems.length)process.exitCode=1;
