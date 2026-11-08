import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchFeedWithRetry } from '../scripts/source-watch.mjs';
test('retries transient 504 then succeeds', async () => {
 let calls=0, waits=0;
 const res=await fetchFeedWithRetry('https://example.com', {fetchImpl:async()=>({ok:++calls===3,status:504}),sleep:async()=>{waits++}});
 assert.equal(res.ok,true);assert.equal(calls,3);assert.equal(waits,2);
});
test('does not retry permanent 404', async () => {
 let calls=0;
 await assert.rejects(fetchFeedWithRetry('https://example.com',{fetchImpl:async()=>{calls++;return {ok:false,status:404}},sleep:async()=>{}}),/HTTP 404/);
 assert.equal(calls,1);
});
test('persistent 504 remains a visible error', async () => {
 let calls=0;
 await assert.rejects(fetchFeedWithRetry('https://example.com',{fetchImpl:async()=>{calls++;return {ok:false,status:504}},sleep:async()=>{}}),/HTTP 504/);
 assert.equal(calls,3);
});
