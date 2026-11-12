import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const N = createRequire(import.meta.url)('../public/go-pass-navigation.js');

test('indexes only published rank entries, deduplicates without losing source order inside each range', () => {
  const x = N.indexRanks([100, 45, 1, 25, 26, 45, 0, -3, null, '', 600, 9.2, 'foo']);
  assert.deepEqual(x.ranks, [1, 25, 26, 45, 100, 600]);
  assert.equal(x.count, 6);
  assert.equal(x.first, 1);
  assert.equal(x.last, 600);
  assert.deepEqual(x.groups.map(g => [g.start, g.end, g.count]), [[1,25,2], [26,50,2], [76,100,1], [576,600,1]]);
});

test('exact 25-rank boundaries are navigable without inventing missing entries', () => {
  assert.deepEqual(N.rangeAt(1), {start:1,end:25});
  assert.deepEqual(N.rangeAt(25), {start:1,end:25});
  assert.deepEqual(N.rangeAt(26), {start:26,end:50});
  assert.deepEqual(N.rangeAt(45), {start:26,end:50});
  assert.deepEqual(N.rangeAt(100), {start:76,end:100});
  assert.deepEqual(N.rangeAt(600), {start:576,end:600});
  assert.equal(N.rangeAt(0), null);
  assert.equal(N.rangeAt('x'), null);
});

test('published versus unlisted rank lookup explicitly preserves source gaps', () => {
  const x = N.indexRanks([1,45,100,600]);
  assert.equal(N.lookup(x,45).status, 'published');
  assert.deepEqual(N.lookup(x,46), {status:'unlisted',rank:46,group:{start:26,end:50,count:1,ranks:[45]}});
  assert.deepEqual(N.lookup(x,400), {status:'unlisted',rank:400,group:null});
  assert.deepEqual(N.lookup(x,0), {status:'invalid',rank:null,group:null});
  assert.deepEqual(N.lookup(x,'1.2'), {status:'invalid',rank:null,group:null});
  assert.deepEqual(N.lookup(x,'not a rank'), {status:'invalid',rank:null,group:null});
});

test('a pass may advertise published entries through 600 without implying all ranks have rewards', () => {
  const published = Array.from({length:100}, (_,i) => i+1).concat(600);
  const x = N.indexRanks(published);
  assert.equal(x.count,101);
  assert.equal(x.last,600);
  assert.equal(x.groups.length,5);
  assert.equal(N.lookup(x,599).status,'unlisted');
  assert.equal(N.lookup(x,600).status,'published');
  assert.equal(x.groups.at(-1).count,1);
});

test('new navigator is optional and safe before Event Details is present', () => {
  assert.equal(N.mount(null),0);
  assert.equal(N.mount({}),0);
  const none = {querySelectorAll:()=>[],matches:()=>false};
  assert.equal(N.mount(none),0);
});

test('invalid ranks, misleading zero and unsafe integer quantities are excluded', () => {
  assert.equal(N.rank(''),null);
  assert.equal(N.rank('0'),null);
  assert.equal(N.rank('3e8'),300000000);
  assert.equal(N.rank(Number.MAX_SAFE_INTEGER+1),null);
  assert.equal(N.rank(false),null);
  assert.equal(N.rank('27.3'),null);
  assert.equal(N.indexRanks([]).last,null);
});
