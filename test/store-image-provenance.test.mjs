import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {imageUrls,diffStore,storeLog} from '../scripts/store-watch.mjs';
test('accepts only absolute HTTPS product imagery',()=>{assert.deepEqual(imageUrls({imgs:['https://example.com/a.png','http://example.com/b.png','javascript:alert(1)','/relative.png','https://example.com/c.webp']}),['https://example.com/a.png','https://example.com/c.webp']);});
test('retains images with the corresponding product and marks them unverified',()=>{const now='2026-11-08T00:00:00.000Z';const d=diffStore(null,{items:[{href:'/purchase/item/example',name:'GO Pass Example',price:'$9.99',section:'LIMITED_TIME',imgs:['https://example.com/product.webp']}]},now);const row=storeLog(d.state).items[0];assert.equal(row.image,'https://example.com/product.webp');assert.equal(row.imageStatus,'unverified-remote');});
test('does not invent imagery when absent',()=>{const d=diffStore(null,{items:[{href:'/purchase/item/example',name:'GO Pass Example',price:'$9.99',section:'LIMITED_TIME'}]},'2026-11-08T00:00:00.000Z');assert.equal(storeLog(d.state).items[0].image,null);assert.equal(storeLog(d.state).items[0].imageStatus,'missing');});
test('preserves existing imagery when subsequent snapshot omits it',()=>{const t='2026-11-08T00:00:00.000Z';const a=diffStore(null,{items:[{href:'/purchase/item/example',name:'GO Pass Example',price:'$9.99',imgs:['https://example.com/one.webp']}]},t);const b=diffStore(a.state,{items:[{href:'/purchase/item/example',name:'GO Pass Example',price:'$9.99'}]},t);assert.equal(b.state.items['/purchase/item/example'].images[0],'https://example.com/one.webp');});

test('hourly Store watcher runs read-only artwork QA after refreshing the source feed',()=>{
  const workflow=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),
    '../.github/workflows/store-watch.yml'),'utf8');
  const snapshot=workflow.indexOf('      - name: Read the store');
  const announce=workflow.indexOf('      - name: Tell me about anything new');
  const audit=workflow.indexOf('      - name: Audit Store product artwork candidates (report only)');
  const save=workflow.indexOf('      - name: Remember what was seen');
  assert.ok(snapshot>=0&&snapshot<announce&&announce<audit&&audit<save,
    'artwork audit inspects the fresh snapshot before the watch commits its state');
  assert.match(workflow,/Audit Store product artwork candidates \(report only\)\n\s*continue-on-error: true/,
    'unreviewed art cannot block legitimate price updates');
  assert.match(workflow,/node --test test\/store-artwork-coverage\.test\.mjs/);
  assert.match(workflow,/node scripts\/store-artwork-coverage\.mjs \/tmp\/store-snapshot\.json/,
    'audit must read every SKU from the freshly fetched snapshot, not the filtered public log');
});
