import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../public/dash.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('  function cardSource('), source.indexOf('  function card(ev, opt)'));
const context = {
  esc: value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),
  safeUrl: value => /^https?:\/\//i.test(value || '')
};
vm.createContext(context);
vm.runInContext(helper, context);
test('event attribution preserves the supplied source and escapes labels', () => {
  const html = context.cardSource({name:'Event "A"', source:'Leek Duck & community', link:'https://leekduck.com/events/a/'});
  assert.match(html, /href="https:\/\/leekduck.com\/events\/a\/"/);
  assert.match(html, /Source: Leek Duck &amp; community/);
  assert.match(html, /aria-label="Source for Event &quot;A&quot;/);
  assert.match(html, /rel="noopener noreferrer"/);
});
test('unlinked and unsafe sources remain plain attribution without invented links', () => {
  assert.equal(context.cardSource({name:'Event'}), '');
  const html = context.cardSource({name:'Event', source:'Community calendar', link:'javascript:alert(1)'});
  assert.match(html, /^<p /);
  assert.doesNotMatch(html, /href|javascript:/);
});
