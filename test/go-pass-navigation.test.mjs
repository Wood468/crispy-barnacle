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
  assert.equal(N.rank('3e8'),null);
  assert.equal(N.rank(Number.MAX_SAFE_INTEGER+1),null);
  assert.equal(N.rank(false),null);
  assert.equal(N.rank('27.3'),null);
  assert.equal(N.indexRanks([]).last,null);
});


// Minimal DOM fixture exercises the real progressive enhancement without
// introducing a jsdom dependency into the repository's native Node suite.
function fixture() {
  const doc = {createElement(tag) { return new Element(tag, doc); }};
  class Element {
    constructor(tag, owner) {
      this.tagName=tag.toLowerCase();this.ownerDocument=owner;this.children=[];this.parentNode=null;
      this.className='';this.attrs={};this.listeners={};this.value='';this.textContent='';
      this.open=false;this.focused=false;this.scrolled=false;
    }
    append(...nodes) {nodes.forEach(node=>this.appendChild(node));}
    appendChild(node) {node.parentNode=this;this.children.push(node);return node;}
    insertBefore(node, sibling) {const i=this.children.indexOf(sibling);assert.ok(i>=0);node.parentNode=this;this.children.splice(i,0,node);return node;}
    setAttribute(k,v) {this.attrs[k]=String(v);}
    getAttribute(k) {return this.attrs[k]??null;}
    matches(selector) {
      const cls=selector.includes('.')?selector.split('.')[1].split('[')[0]:'';
      const tag=selector.split(/[.[]/)[0];
      return (!tag||tag===this.tagName)&&(!cls||this.className.split(/\s+/).includes(cls))&&(!selector.includes('[data-rank]')||this.getAttribute('data-rank')!==null);
    }
    querySelectorAll(selector) {
      const out=[];const visit=node=>node.children.forEach(child=>{if(child.matches(selector))out.push(child);visit(child);});
      visit(this);return out;
    }
    querySelector(selector) {return this.querySelectorAll(selector)[0]||null;}
    closest(selector) {for(let node=this;node;node=node.parentNode)if(node.matches(selector))return node;return null;}
    addEventListener(type,callback) {this.listeners[type]=callback;}
    focus() {this.focused=true;}
    scrollIntoView() {this.scrolled=true;}
    dispatch(type) {assert.equal(typeof this.listeners[type],'function');this.listeners[type]({preventDefault(){}});}
  }
  const root=doc.createElement('main'),article=doc.createElement('article');
  article.className='ue-pass';root.appendChild(article);
  const rows={};const groups={};
  for (const n of [1,45,100,600]) {
    const start=Math.floor((n-1)/25)*25+1;
    const details=doc.createElement('details');details.className='ue-pass-range';
    const summary=doc.createElement('summary');details.appendChild(summary);
    const row=doc.createElement('li');row.className='ue-pass-rank';row.setAttribute('data-rank',n);
    const reward=doc.createElement('div');reward.className='ue-pass-reward';row.appendChild(reward);
    details.appendChild(row);article.appendChild(details);rows[n]=row;groups[start]={details,summary};
  }
  const unlisted=doc.createElement('li');unlisted.className='ue-pass-rank';unlisted.setAttribute('data-rank',46);
  article.appendChild(unlisted); // Empty rank must not enter navigation.
  const heading=doc.createElement('h5');heading.className='ue-pass-all-title';article.appendChild(heading);
  return {root,article,rows,groups,heading};
}

test('mounted navigator searches exact reward ranks, opens the proper group and preserves unknown gaps', () => {
  const f=fixture();
  assert.equal(N.mount(f.root),1);
  assert.equal(N.mount(f.root),0,'mount is idempotent');
  const nav=f.article.querySelector('.ue-pass-nav'),form=nav.querySelector('form');
  const input=nav.querySelector('input'),select=nav.querySelector('select');
  const status=nav.querySelector('.ue-pass-nav-status');
  assert.ok(nav);assert.ok(f.article.children.indexOf(nav)<f.article.children.indexOf(f.heading));
  assert.equal(select.children.length,5,'placeholder plus four published ranges');
  input.value='45';form.dispatch('submit');
  assert.equal(f.groups[26].details.open,true);
  assert.equal(f.rows[45].focused,true);
  assert.equal(f.rows[45].scrolled,true);
  assert.match(status.textContent,/Opened published Rank 45/);
  input.value='46';form.dispatch('submit');
  assert.match(status.textContent,/No published reward entry for Rank 46/);
  input.value='601';form.dispatch('submit');
  assert.match(status.textContent,/No published reward entry for Rank 601/);
  select.value='576';select.dispatch('change');
  assert.equal(f.groups[576].details.open,true);
  assert.equal(f.groups[576].summary.focused,true);
  assert.match(status.textContent,/1 published/);
});
