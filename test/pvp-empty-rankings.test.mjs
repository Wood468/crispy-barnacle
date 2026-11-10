import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=app.indexOf('  function renderPvp(){');
const end=app.indexOf("  $('pvplg').addEventListener",start);
assert.ok(start>=0&&end>start,'PvP rendering function must be present');
const render=vm.runInNewContext('(function(PV,$,fmtTs,dexIdOf,dm,dimg,esc,moveLine){'+app.slice(start,end)+';return renderPvp;})');

function setup(data,league='great'){
 const elements={
  pvplg:{value:league},pvpdd:{hidden:false},
  pvpcnt:{textContent:'old'},pvpnote:{textContent:'old'},pvplist:{innerHTML:'old'}
 };
 const fn=render(data,id=>elements[id],()=>'',()=>1,()=>({}),()=>'',x=>x,()=>'moves');
 fn();
 return elements;
}

test('all-empty PvP rankings hide the section without rendering stale data',()=>{
 const el=setup({leagues:{great:[],ultra:[],master:[]}});
 assert.equal(el.pvpdd.hidden,true);
 assert.equal(el.pvplist.innerHTML,'old');
});
test('missing or malformed league lists do not throw',()=>{
 const el=setup({leagues:{great:null,ultra:'bad',master:[]}});
 assert.equal(el.pvpdd.hidden,true);
});
test('valid rankings keep section visible and render selected league',()=>{
 const el=setup({leagues:{great:[{name:'Example',score:99}],ultra:[],master:[]},updated:'2026-11-10'});
 assert.equal(el.pvpdd.hidden,false);
 assert.equal(el.pvpcnt.textContent,'top 1');
 assert.match(el.pvplist.innerHTML,/Example/);
});
test('empty selected league shows an honest empty message when another league has rankings',()=>{
 const el=setup({leagues:{great:[],ultra:[{name:'Example',score:90}],master:[]}});
 assert.equal(el.pvpdd.hidden,false);
 assert.equal(el.pvpcnt.textContent,'No rankings');
 assert.equal(el.pvplist.innerHTML,'');
});
