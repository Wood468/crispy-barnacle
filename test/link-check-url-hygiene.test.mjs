import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSourceUrl, safeLinkLabel, urlsIn } from '../scripts/link-check.mjs';

test('accepts ordinary official HTTPS source links', () => {
  assert.equal(publicSourceUrl('https://leekduck.com/events/raid-day/#details'), 'https://leekduck.com/events/raid-day/');
  assert.equal(publicSourceUrl('https://pokemongolive.com/post/event?lang=en'), 'https://pokemongolive.com/post/event?lang=en');
});

test('does not discard a valid public domain because a path contains an excluded hostname', () => {
  assert.equal(publicSourceUrl('https://leekduck.com/events/michaelpuff.com/'), 'https://leekduck.com/events/michaelpuff.com/');
});

for (const url of [
  'http://leekduck.com/events/test', 'javascript:alert(1)', 'not-a-url',
  'https://michaelpuff.com/private', 'https://pogo.michaelpuff.com/api',
  'https://cdn.discordapp.com/attachments/file', 'https://example.com/fixture',
  'https://localhost/admin', 'https://host.local/admin',
  'https://host.internal/admin', 'https://127.0.0.1/private',
  'https://10.0.0.5/private', 'https://[::1]/private',
  'https://user:password@leekduck.com/events/test',
  'https://leekduck.com/events/test?api_key=private',
  'https://leekduck.com/events/test?access_token=private',
]) {
  test('skips unsafe or excluded URL ' + url.replace(/password|private/g, '[redacted]'), () => {
    assert.equal(publicSourceUrl(url), null);
  });
}

test('deduplicates extracted nested links and redacts diagnostic queries and fragments', () => {
  const urls = urlsIn({ a: ['https://leekduck.com/events/a?token=secret', { b: 'https://leekduck.com/events/a?token=secret' }] });
  assert.equal(urls.size, 1);
  assert.equal(safeLinkLabel('https://leekduck.com/events/a?token=secret#fragment'), 'https://leekduck.com/events/a');
  assert.equal(safeLinkLabel('not a url'), '[invalid URL]');
});
