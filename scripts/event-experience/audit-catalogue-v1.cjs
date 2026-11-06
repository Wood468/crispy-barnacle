/* Read-only validation of the universal event catalogue against current source snapshots. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {buildCatalogue}=require('./build-catalogue.cjs');
const C=require('../../public/event-contract.js');
const root=path.resolve(__dirname,'../..');
function read(name,fallback={}){try{return JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
const previous=read('public/events-v1.json');
const input={previous,aliases:read('data/event-aliases.json')};
for(const [key,name] of Object.entries({data:'data',details:'event-details',info:'event-info',world:'world-events',regional:'regional-events',season:'season',dex:'dex',costumes:'costumes'}))input[key]=read('public/'+name+'.json');
const catalogue=buildCatalogue(input);
for(const event of catalogue.events)C.normalize(event);
const stored=new Map((previous.events||[]).map(event=>[event.eventId,event]));
const changed=catalogue.events.filter(event=>JSON.stringify(stored.get(event.eventId))!==JSON.stringify(event)).map(event=>event.eventId);
console.log(JSON.stringify({schemaVersion:catalogue.schemaVersion,canonicalEvents:catalogue.events.length,coverage:catalogue.coverage,excluded:catalogue.excluded,warnings:catalogue.warnings,staleRecords:changed},null,2));
if(changed.length)process.exitCode=1;
