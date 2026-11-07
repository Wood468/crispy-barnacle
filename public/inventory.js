/* On-device, account-partitioned inventory. Media files and OCR text are never stored here. */
(function(){'use strict';var C=window.GOCollectionModel,current=[],partition=null,ready=false;
function identity(){try{return localStorage.getItem(window.GOLOCAL?GOLOCAL.activeKey:'gofn-active-identity-v1')||'guest';}catch(e){throw Error('Device storage is unavailable. Your collection has not changed.');}}
function operation(mode,work){return new Promise(function(resolve,reject){var db=null,done=false,value,tx=null;var timer=setTimeout(function(){if(tx)try{tx.abort();}catch(e){}finish(Error('Inventory storage timed out. Retry without closing this page.'));},8000);function finish(error){if(done)return;done=true;clearTimeout(timer);if(db)db.close();error?reject(error):resolve(value);}
 var request;try{request=indexedDB.open('gofn-pokemon-inventory-v1',1);}catch(e){finish(Error('Inventory cannot be saved on this device. Your existing collection is unchanged.'));return;}
 request.onupgradeneeded=function(){var store=request.result.createObjectStore('records',{keyPath:'storageKey'});store.createIndex('partition','partition');request.result.createObjectStore('drafts',{keyPath:'partition'});};request.onerror=function(){finish(request.error);};request.onblocked=function(){finish(Error('Inventory storage is busy. Close another GO Field Notes tab and retry.'));};
 request.onsuccess=function(){db=request.result;if(done){db.close();return;}db.onversionchange=function(){db.close();};try{tx=db.transaction(['records','drafts'],mode);work(tx,function(v){value=v;});tx.oncomplete=function(){finish();};tx.onabort=tx.onerror=function(){finish(tx.error||Error('Could not save inventory. Nothing was applied.'));};}catch(e){finish(e);}}
 });}
async function refresh(){var target=identity();var result=await operation('readonly',function(tx,set){var r=tx.objectStore('records').index('partition').getAll(target);r.onsuccess=function(){set(r.result);};});if(identity()!==target)return [];var next=result.map(function(r){return r.record;});var changed=partition!==target||JSON.stringify(current)!==JSON.stringify(next);partition=target;current=next;ready=true;if(changed)document.dispatchEvent(new Event('gofn-inventory'));return records();}
function records(){try{return partition===identity()?current.slice():[];}catch(e){return [];}}
async function add(raw,cat){var target=identity(),validated=raw.map(function(r){return C.record(r,cat);}),added=[];
 await operation('readwrite',function(tx){var store=tx.objectStore('records');validated.forEach(function(r){var key=target+'|'+r.id,request=store.get(key);request.onsuccess=function(){if(request.result)return;store.add({storageKey:key,partition:target,record:r});added.push(r.id);};});});
 if(identity()!==target)throw Error('The active account changed. Records were saved to their original account; no checklist marks were applied.');await refresh();return added;}
async function remove(ids){var target=identity();await operation('readwrite',function(tx){ids.forEach(function(id){tx.objectStore('records').delete(target+'|'+id);});});await refresh();}
async function draft(value){var target=identity();if(value!==undefined){await operation('readwrite',function(tx){if(value===null)tx.objectStore('drafts').delete(target);else tx.objectStore('drafts').put({partition:target,value:JSON.parse(JSON.stringify(value))});});return value;}
 return operation('readonly',function(tx,set){var r=tx.objectStore('drafts').get(target);r.onsuccess=function(){set(r.result?r.result.value:null);};});}
['gofn-identity-change','gofn-owner-state'].forEach(function(type){document.addEventListener(type,function(){current=[];ready=false;refresh().catch(function(){});});});window.addEventListener('focus',function(){refresh().catch(function(){});});
window.GOInventory={refresh:refresh,records:records,add:add,remove:remove,draft:draft,partition:identity,ready:function(){return ready;}};
refresh().catch(function(){});
}());
