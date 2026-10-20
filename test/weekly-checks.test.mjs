import test from "node:test";
import assert from "node:assert/strict";
import { urlsIn } from "../scripts/link-check.mjs";
import { pagesIn, slugFor, toText } from "../scripts/archive-posts.mjs";
test("link check finds URLs nested anywhere in the data", () => {
  const u = urlsIn({ a: [{ url: "https://x.example/a" }], b: "see https://y.example/b, and more" });
  assert.deepEqual([...u].sort(), ["https://x.example/a", "https://y.example/b"]);
});
test("archive picks only official news pages and makes safe file names", () => {
  const p = pagesIn({ s: ["https://pokemongo.com/en/news/aeon-mall-halloween", "https://leekduck.com/events/x", "https://pokemongo.com/ja/news/some-post"] });
  assert.equal(p.size, 2);
  assert.match(slugFor("https://pokemongo.com/ja/news/some-post"), /^[a-z0-9-]+$/);
  assert.equal(toText("<p>Hi <b>there</b></p><script>x()</script>"), "Hi there");
});
