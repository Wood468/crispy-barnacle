import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function navigation(rejectPush=false){
 const stack=['base','app'],events=[];let cursor=1;
 const context={window:{},history:{pushState(state){if(typeof rejectPush==='function'?rejectPush():rejectPush)throw Error('SecurityError');stack.splice(cursor+1);stack.push(state.gofn);cursor++;},back(){events.push(()=>{cursor--;assert.ok(cursor>=1,'programmatic overlay close left the app');context.window.GONAV.internal=false;context.window.GONAV.drain();});}}};
 vm.runInNewContext(source.slice(source.indexOf('  window.GONAV={'),source.indexOf('  (function(){',source.indexOf('  window.GONAV={'))),context);
 return {nav:context.window.GONAV,settle(){while(events.length)events.shift()();},cursor:()=>cursor};
}
test('rapid close/reopen serializes history writes behind the pending traversal',()=>{
 const n=navigation();n.nav.push();n.nav.popped();n.nav.push();n.nav.popped();n.settle();assert.equal(n.nav.depth,0);assert.equal(n.cursor(),1);
});
test('nested overlays can both close while the first history traversal is pending',()=>{
 const n=navigation();n.nav.push();n.nav.push();n.nav.popped();n.nav.popped();n.settle();assert.equal(n.nav.depth,0);assert.equal(n.cursor(),1);
});
test('reopening during a pending close leaves one actionable overlay history entry',()=>{
 const n=navigation();n.nav.push();n.nav.popped();n.nav.push();n.settle();assert.equal(n.nav.depth,1);assert.equal(n.cursor(),2);n.nav.popped();n.settle();assert.equal(n.cursor(),1);
});

test('a rejected history push never creates a back obligation',()=>{
 const n=navigation(true);n.nav.push();n.nav.popped();n.settle();assert.equal(n.nav.depth,0);assert.equal(n.cursor(),1);assert.equal(n.nav.internal,false);
});
test('a rejected deferred push does not consume the preceding app history entry',()=>{
 let attempts=0;const n=navigation(()=>++attempts===2);n.nav.push();n.nav.popped();n.nav.push();n.nav.popped();n.settle();assert.equal(n.nav.depth,0);assert.equal(n.cursor(),1);assert.equal(n.nav.internal,false);
});
