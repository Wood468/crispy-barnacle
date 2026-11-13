import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const events=async()=>JSON.parse(await readFile(
  new URL('../public/data.json',import.meta.url),'utf8')).events;

test('curated canonical event IDs and explicit source aliases have unique owners',async()=>{
  const list=await events();
  assert.ok(Array.isArray(list)&&list.length>0);
  const eventIds=new Set(),aliases=new Map();
  for(const event of list){
    assert.match(event.id,/^[a-z0-9][a-z0-9:._-]{0,159}$/i);
    assert.ok(!eventIds.has(event.id),'duplicate canonical event ID '+event.id);
    eventIds.add(event.id);
    if(event.detailIds===undefined)continue;
    assert.ok(Array.isArray(event.detailIds),'detailIds must be an array');
    for(const alias of event.detailIds){
      assert.match(alias,/^[a-z0-9][a-z0-9:._-]{0,159}$/i);
      assert.equal(aliases.get(alias)??event.id,event.id,
        'source alias cannot be assigned to two curated event owners');
      aliases.set(alias,event.id);
    }
  }
});
test('curated source links retain exact trusted HTTPS origins without secrets',async()=>{
  const list=await events();
  for(const event of list){
    if(!event.sourceUrl)continue;
    const url=new URL(event.sourceUrl);
    assert.equal(url.protocol,'https:');
    assert.equal(url.username,'');
    assert.equal(url.password,'');
    assert.equal(url.port,'');
    assert.ok(!url.search&&!url.hash,'curated source links must not contain URL tokens');
    assert.ok(['pokemongo.com','www.pokemongo.com',
      'leekduck.com','www.leekduck.com',
      'pokemongohub.net','www.pokemongohub.net'].includes(url.hostname.toLowerCase()));
  }
});
