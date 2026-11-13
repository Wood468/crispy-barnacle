import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(name)=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');

test('Today art, title and Restore labels remain independent narrow-screen rows',()=>{
 const css=read('today.css');
 assert.match(css,/#tab-now \.t1-major\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/#tab-now \.t1-major-art\{grid-column:1;min-width:0;max-width:100%;overflow:hidden\}/);
 assert.match(css,/#tab-now \.t1-major \.t1-open\{grid-column:1;min-width:0/);
 assert.match(css,/#tab-now \.t1-major \.t1-title[^\n]*overflow-wrap:anywhere/);
 assert.match(css,/#tab-now \.t1-done-list li>span\{display:grid;gap:2px;min-width:0/);
 assert.match(css,/#tab-now \.t1-done-list li>span>small\{display:block/);
 assert.match(css,/#tab-now \.t1-done-list \.t1-restore\{flex:none/);
});

test('only the counted owner header Review action opens the existing queue',()=>{
 const js=read('review.js');
 const banner=js.slice(js.indexOf('  function banner(n) {'),js.indexOf('  function gotoReview() {'));
 assert.match(banner,/if \(!isOwner\(\)\)/);
 assert.match(banner,/action\.hidden = n < 1/);
 assert.match(banner,/count\.textContent = n > 99/);
 assert.match(banner,/if \(b\) b\.remove\(\)/);
 assert.doesNotMatch(banner,/createElement\('button'\)|tab\.insertBefore|b\.hidden = false/);
 assert.match(js,/closest\('#igbanner'\) \|\| e\.target\.closest\('#hireview'\)/);
});

test('changed UI files are versioned consistently for online and offline clients',()=>{
 const html=read('index.html'),dash=read('dash.js'),sw=read('sw.js');
 for(const file of ['today.css','dash.js']){
  const version=html.match(new RegExp('/'+file.replace('.','\\.')+'\\?v=([^"\\s]+)'))?.[1];
  assert.ok(version,file+' versioned in HTML');
  assert.ok(sw.includes('/'+file+'?v='+version),file+' same offline version');
 }
 const review=dash.match(/review\.js\?v=([\w-]+)/)?.[1];
 assert.ok(review);assert.ok(sw.includes('/review.js?v='+review));
 assert.match(sw,/gofn-shell-v348/);
});
