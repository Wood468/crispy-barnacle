import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Exercise the shipped guide-dialog keydown callback, not a duplicate keyboard algorithm.
const source=readFileSync(new URL('../public/pokemon-guides.js',import.meta.url),'utf8');
const marker="document.addEventListener('keydown',function (e) {";
const begin=source.indexOf(marker);
const end=source.indexOf("\n  },true);",begin);
assert.ok(begin>=0 && end>begin,'guide modal keyboard callback is present');
const body=source.slice(begin+marker.length,end);

function harness(){
  const doc={activeElement:null,getElementById(id){return id==='boss-guide-dialog'?host:null;}};
  const controls=['close','first source','second source'].map(name=>({
    name,hidden:false,tabIndex:0,focus(){doc.activeElement=this;}
  }));
  const host={
    hidden:false,
    contains(el){return controls.includes(el);},
    querySelectorAll(selector){
      assert.match(selector,/a\[href\]/,'approved creator/source anchors are keyboard focusable');
      return controls;
    }
  };
  let closed=0;
  const handler=new Function('document','close','$',
    'return function(e){'+body+'};')(doc,()=>{closed++;},id=>doc.getElementById(id));
  function key(key,shiftKey=false){
    let prevented=false;
    const event={key,shiftKey,preventDefault(){prevented=true;}};
    handler(event);
    return prevented;
  }
  return {doc,controls,host,key,get closed(){return closed;}};
}

test('guide dialog Tab reaches source links and cycles at the last control',()=>{
  const h=harness();
  const [close,firstLink,lastLink]=h.controls;
  close.focus();
  assert.equal(h.key('Tab'),false,'normal Tab from Close must reach a source link');
  // Browser default moves focus to the next anchor when preventDefault was not used.
  firstLink.focus();
  assert.equal(h.key('Tab'),false,'Tab from the first source reaches another source');
  lastLink.focus();
  assert.equal(h.key('Tab'),true,'Tab from last source wraps inside the dialog');
  assert.equal(h.doc.activeElement,close);
});

test('guide dialog Shift+Tab moves backwards and wraps from Close to last source',()=>{
  const h=harness();
  const [close,firstLink,lastLink]=h.controls;
  firstLink.focus();
  assert.equal(h.key('Tab',true),false,'Shift+Tab traverses to previous dialog control');
  close.focus();
  assert.equal(h.key('Tab',true),true,'Shift+Tab from first control wraps backwards');
  assert.equal(h.doc.activeElement,lastLink);
});

test('guide dialog Escape, outside focus and hidden state remain safe',()=>{
  const h=harness();
  h.doc.activeElement={};
  assert.equal(h.key('Tab'),true);
  assert.equal(h.doc.activeElement,h.controls[0]);
  assert.equal(h.key('Escape'),true);
  assert.equal(h.closed,1);
  h.host.hidden=true;
  assert.equal(h.key('Tab'),false,'hidden dialog must not intercept keyboard focus');
});
