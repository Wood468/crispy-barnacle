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
    replaceChildren(...nodes) {this.children.forEach(child=>child.parentNode=null);this.children=[];this.textContent='';this.append(...nodes);}
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
  const overview=doc.createElement('div');overview.className='ue-pass-overview';article.appendChild(overview);
  const rows={};const groups={};
  for (const n of [1,45,100,600]) {
    const start=Math.floor((n-1)/25)*25+1;
    const details=doc.createElement('details');details.className='ue-pass-range';
    const summary=doc.createElement('summary');details.appendChild(summary);
    const row=doc.createElement('li');row.className='ue-pass-rank';row.setAttribute('data-rank',n);
    const lane=doc.createElement('div');lane.className='ue-lane '+(n===100?'ue-lane-deluxe':n===600?'ue-lane-unspecified':'ue-lane-free');
    const reward=doc.createElement('div');reward.className='ue-pass-reward';
    const named=doc.createElement('span');named.className='ue-pass-name';
    const title=doc.createElement('b');title.textContent=({1:'Incense',45:'Pokémon Candy XL',100:'Silver Bottle Cap',600:'XP'})[n];
    named.appendChild(title);reward.appendChild(named);lane.appendChild(reward);row.appendChild(lane);
    details.appendChild(row);article.appendChild(details);rows[n]=row;groups[start]={details,summary};
  }
  const unlisted=doc.createElement('li');unlisted.className='ue-pass-rank';unlisted.setAttribute('data-rank',46);
  article.appendChild(unlisted); // Empty rank must not enter navigation.
  const heading=doc.createElement('h5');heading.className='ue-pass-all-title';article.appendChild(heading);
  return {root,article,rows,groups,heading,overview};
}

test('mounted navigator searches exact reward ranks, opens the proper group and preserves unknown gaps', () => {
  const f=fixture();
  assert.equal(N.mount(f.root),1);
  assert.equal(N.mount(f.root),0,'mount is idempotent');
  const nav=f.article.querySelector('.ue-pass-nav'),form=nav.querySelector('form');
  const input=nav.querySelector('input'),select=nav.querySelector('select');
  const status=nav.querySelector('.ue-pass-nav-status');
  assert.ok(nav);assert.ok(f.article.children.indexOf(nav)<f.article.children.indexOf(f.heading));
  assert.ok(f.article.children.indexOf(nav)<f.article.children.indexOf(f.overview),'rank navigation must precede milestone cards');
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

test('finder indexes only rendered published rank tiles and source tracks, including Unicode names', () => {
  const f=fixture();
  const items=N.indexRewardEntries(Object.values(f.rows).concat(f.article.querySelectorAll('.ue-pass-rank[data-rank]').at(-1)));
  assert.deepEqual(items,[
    {rank:1,name:'Incense',track:'free'},
    {rank:45,name:'Pokémon Candy XL',track:'free'},
    {rank:100,name:'Silver Bottle Cap',track:'deluxe'},
    {rank:600,name:'XP',track:'unknown'}
  ]);
  assert.deepEqual(N.findRewards(items,'POKEMON',8),{total:1,entries:[items[1]]});
  assert.deepEqual(N.findRewards(items,'cap',8),{total:1,entries:[items[2]]});
  assert.equal(N.findRewards(items,'x',8).total,0,'short searches cannot flood the UI');
  assert.equal(N.findRewards(items,'unknown item',8).total,0,'never infer unlisted rewards');
});
test('finder supports duplicate names at different published ranks and bounds result counts', () => {
  const items=Array.from({length:12},(_,i)=>({rank:i*25+1,name:'Rare Candy XL',track:i%2?'deluxe':'free'}));
  const results=N.findRewards(items,'rare candy',8);
  assert.equal(results.total,12);
  assert.equal(results.entries.length,8);
  assert.deepEqual(results.entries[0],items[0]);
  assert.equal(N.findRewards(items,'rare candy',100).entries.length,12);
  assert.equal(N.findRewards(items,'rare candy',1).entries.length,1);
});
test('mounted find-by-name control opens only a real published rank and never changes other passes', () => {
  const f=fixture();assert.equal(N.mount(f.root),1);
  const nav=f.article.querySelector('.ue-pass-nav');
  const finder=nav.querySelector('.ue-pass-finder');
  assert.ok(finder);
  assert.equal(finder.open,false,'finder stays collapsed to protect first-screen density');
  const input=finder.querySelector('input'),status=finder.querySelector('.ue-pass-find-status');
  const results=finder.querySelector('.ue-pass-find-results');
  assert.equal(input.type,'search');
  input.value='Bottle';input.dispatch('input');
  assert.equal(results.children.length,1);
  const button=results.children[0];
  assert.equal(button.textContent,'Rank 100 · Silver Bottle Cap · Deluxe');
  button.dispatch('click');
  assert.equal(f.groups[76].details.open,true);
  assert.equal(f.rows[100].focused,true);
  assert.match(status.textContent,/Opened Rank 100 · Silver Bottle Cap/);
  input.value='pokemon';input.dispatch('input');
  assert.equal(results.children.length,1,'case-insensitive accent-free match');
  assert.match(results.children[0].textContent,/Rank 45.*Pokémon Candy XL.*Free/);
  input.value='unpublished item';input.dispatch('input');
  assert.equal(results.children.length,0);
  assert.match(status.textContent,/No published reward entry matches/);
  input.value='x';input.dispatch('input');
  assert.equal(results.children.length,0);
  assert.match(status.textContent,/at least 2 characters/);
  assert.equal(N.mount(f.root),0,'no duplicate navigator after repeated mounting');
});

test('reward finder ignores milestone-only artwork and unlisted rank placeholders', () => {
  const f=fixture(),doc=f.article.ownerDocument;
  const milestone=doc.createElement('div');milestone.className='ue-pass-reward';
  const name=doc.createElement('span');name.className='ue-pass-name';
  const strong=doc.createElement('b');strong.textContent='Unpublished Test Trophy';
  name.appendChild(strong);milestone.appendChild(name);f.overview.appendChild(milestone);
  assert.equal(N.mount(f.root),1);
  const finder=f.article.querySelector('.ue-pass-finder');
  const input=finder.querySelector('input');
  const results=finder.querySelector('.ue-pass-find-results');
  const status=finder.querySelector('.ue-pass-find-status');
  input.value='unpublished';input.dispatch('input');
  assert.equal(results.children.length,0,'milestone-only extra is not listed as an actual rank reward');
  assert.match(status.textContent,/No published reward entry/);
  assert.equal(f.article.querySelectorAll('.ue-pass-rank[data-rank]').length,5,'fixture includes a deliberately unlisted row');
});


test('reward finder preserves distinct source quantities within the same published rank and track', () => {
  const f=fixture(),doc=f.article.ownerDocument;
  const lane=f.rows[45].querySelector('.ue-lane-free');
  function addReward(quantity) {
    const tile=doc.createElement('div');tile.className='ue-pass-reward';
    const label=doc.createElement('span');label.className='ue-pass-name';
    const name=doc.createElement('b');name.textContent='Rare Candy XL';
    const meta=doc.createElement('small');meta.textContent='×'+quantity+' · Item';
    label.append(name,meta);tile.appendChild(label);lane.appendChild(tile);
  }
  addReward(3);
  addReward(4);
  addReward(3); // Repeated equivalent listing should not create a duplicate.
  const indexed=N.indexRewardEntries([f.rows[45]]);
  const found=N.findRewards(indexed,'rare candy',8);
  assert.deepEqual(found.entries,[
    {rank:45,name:'Rare Candy XL',track:'free',quantity:3},
    {rank:45,name:'Rare Candy XL',track:'free',quantity:4}
  ],'one source-backed result per actual name, track, rank and quantity');
  assert.equal(found.total,2);
  assert.equal(N.mount(f.root),1);
  const finder=f.article.querySelector('.ue-pass-finder');
  const input=finder.querySelector('input'),results=finder.querySelector('.ue-pass-find-results');
  input.value='rare candy';input.dispatch('input');
  assert.equal(results.children.length,2);
  assert.equal(results.children[0].textContent,'Rank 45 · Rare Candy XL · ×3 · Free');
  assert.equal(results.children[1].textContent,'Rank 45 · Rare Candy XL · ×4 · Free');
  results.children[1].dispatch('click');
  assert.equal(f.groups[26].details.open,true);
  assert.equal(f.rows[45].focused,true);
  assert.match(finder.querySelector('.ue-pass-find-status').textContent,/Rare Candy XL · ×4/);
});

test('quantity discovery ignores unrelated text and unsafe numeric metadata', () => {
  const f=fixture(),doc=f.article.ownerDocument,row=f.rows[45];
  const lane=row.querySelector('.ue-lane-free');
  for (const [name,meta] of [
    ['Elite Fast TM','Level 4 · Item'],
    ['Remote Raid Pass','×9007199254740992 · Item']
  ]) {
    const tile=doc.createElement('div');tile.className='ue-pass-reward';
    const label=doc.createElement('span');label.className='ue-pass-name';
    const title=doc.createElement('b');title.textContent=name;
    const small=doc.createElement('small');small.textContent=meta;
    label.append(title,small);tile.appendChild(label);lane.appendChild(tile);
  }
  const indexed=N.indexRewardEntries([row]);
  const tm=indexed.find(item=>item.name==='Elite Fast TM');
  const remote=indexed.find(item=>item.name==='Remote Raid Pass');
  assert.ok(tm&&remote);
  assert.equal(Object.hasOwn(tm,'quantity'),false);
  assert.equal(Object.hasOwn(remote,'quantity'),false);
});


test('finding an exact reward focuses its quantity and source track, not a different tile at the same rank', () => {
  const f=fixture(),doc=f.article.ownerDocument,row=f.rows[45];
  const free=row.querySelector('.ue-lane-free');
  const deluxe=doc.createElement('div');deluxe.className='ue-lane ue-lane-deluxe';row.appendChild(deluxe);
  function add(lane,qty) {
    const tile=doc.createElement('div');tile.className='ue-pass-reward';
    const name=doc.createElement('span');name.className='ue-pass-name';
    const title=doc.createElement('b');title.textContent='Rare Candy XL';
    const meta=doc.createElement('small');meta.textContent='×'+qty+' · Item';
    name.append(title,meta);tile.appendChild(name);lane.appendChild(tile);return tile;
  }
  const free3=add(free,3),free4=add(free,4),deluxe4=add(deluxe,4);
  assert.equal(N.mount(f.root),1);
  const finder=f.article.querySelector('.ue-pass-finder');
  const input=finder.querySelector('input'), results=finder.querySelector('.ue-pass-find-results');
  input.value='rare candy';input.dispatch('input');
  assert.equal(results.children.length,3);
  const chosen=results.children.find(btn => /Rare Candy XL · ×4 · Deluxe/.test(btn.textContent));
  assert.ok(chosen,'the Deluxe reward is independently searchable');
  chosen.dispatch('click');
  assert.equal(f.groups[26].details.open,true);
  assert.equal(deluxe4.focused,true,'focus moves to the exact Deluxe ×4 reward');
  assert.equal(deluxe4.scrolled,true,'the selected reward is scrolled into view');
  assert.equal(free3.focused,false);
  assert.equal(free4.focused,false);
  assert.equal(row.focused,false,'the rank row does not steal focus from a known exact reward');
  assert.match(finder.querySelector('.ue-pass-find-status').textContent,/Rare Candy XL · ×4 \(Deluxe\)/);
});

test('finder gracefully focuses its published rank when the selected tile was removed after indexing', () => {
  const f=fixture();
  assert.equal(N.mount(f.root),1);
  const finder=f.article.querySelector('.ue-pass-finder');
  const input=finder.querySelector('input'),results=finder.querySelector('.ue-pass-find-results');
  input.value='bottle';input.dispatch('input');
  assert.equal(results.children.length,1);
  const lane=f.rows[100].querySelector('.ue-lane-deluxe');
  lane.children=[]; // A later UI rerender removed the reward after finder indexing.
  results.children[0].dispatch('click');
  assert.equal(f.groups[76].details.open,true);
  assert.equal(f.rows[100].focused,true,'fallback is the real published rank, not a fabricated tile');
});
