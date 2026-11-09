import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=app.indexOf("if(!D.upcoming || typeof D.upcoming!=='object'");
const end=app.indexOf('MAN=R[1]||{};',start);
assert.ok(start>=0&&end>start,'upcoming normalization must run before rendering');
const normalize=new Function('D',app.slice(start,end)+'return D.upcoming;');

test('empty array upcoming is normalized to safe empty catalogue',()=>{
 const u=normalize({upcoming:[]});
 for(const key of ['announced','gigaReleased','gigaMissing','megaCandidates','dd'])assert.deepEqual(u[key],[]);
 assert.equal(u.megaNote,'');
});
test('partial upcoming fills missing lists without discarding valid data',()=>{
 const announced=[{name:'Future Event'}];
 const u=normalize({upcoming:{announced,dd:null,megaNote:8}});
 assert.equal(u.announced,announced);
 assert.deepEqual(u.dd,[]);
 assert.equal(u.megaNote,'');
});
test('complete valid importer upcoming remains intact',()=>{
 const original={announced:[1],gigaReleased:[2],gigaMissing:[3],megaCandidates:[4],dd:[5],megaNote:'Note'};
 const u=normalize({upcoming:structuredClone(original)});
 assert.deepEqual(u,original);
});
