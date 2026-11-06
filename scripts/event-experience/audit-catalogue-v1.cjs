/* Read-only audit of all curated event collections. Run from repo root:
 * node scripts/event-experience/audit-catalogue-v1.cjs
 * Does not write, modify or publish event data.
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {migrateLegacyEvent}=require('./legacy-bridge-v1.cjs');
const {reconcile}=require('./identity-index-v1.cjs');
const root=path.resolve(__dirname,'../..');
const data=JSON.parse(fs.readFileSync(path.join(root,'public/data.json'),'utf8'));
const details=JSON.parse(fs.readFileSync(path.join(root,'public/event-details.json'),'utf8'));
const collections=[];
for(const [name,items] of Object.entries(data)){
 if(!Array.isArray(items))continue;
 const candidates=items.filter(x=>x&&typeof x==='object'&&typeof x.id==='string'&&typeof x.t==='string');
 if(candidates.length)collections.push({name,total:items.length,candidates});
}
const legacy=collections.flatMap(c=>c.candidates.map(ev=>({collection:c.name,event:ev})));
const migrated=[],errors=[];
for(const {collection,event} of legacy){
 try{migrated.push(migrateLegacyEvent(event));}
 catch(e){errors.push({collection,id:event.id,error:e.message});}
}
const index=reconcile(migrated);
const detailKeys=Object.keys(details.events||{});
const matched=detailKeys.filter(k=>index.resolve(k));
const report={
 curatedCollections:collections.map(c=>({name:c.name,total:c.total,recognized:c.candidates.length})),
 curatedRecords:legacy.length,normalizedRecords:migrated.length,
 uniqueCanonical:index.canonicalCount,identityConflicts:index.conflicts,
 migrationErrors:errors,detailRecords:detailKeys.length,
 detailKeysMatchingKnownAliases:matched.length,
 unmatchedDetailKeys:detailKeys.filter(k=>!index.resolve(k)),
 warning:'Unmatched detail keys are NOT necessarily orphaned; joins via URLs and source identifiers require independent verification.'
};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(errors.length||index.conflicts.length)process.exitCode=1;
