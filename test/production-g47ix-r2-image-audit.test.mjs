// One-time, unauthenticated GET-only production R2 image check.
// No private credentials, no mutations, no response-body logging.
// Deliberately isolated on an unmerged audit branch, not ongoing required CI.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = "https://pogo.michaelpuff.com";
const samples = [
  { label: "published G47IX WebP", path: "/infographics/g47ix/discord-1570729091731292201.webp", mime: "image/webp" },
  { label: "published G47IX PNG", path: "/infographics/g47ix/discord-1570487591273242727.png", mime: "image/png" },
];
const published = readFileSync(new URL("../public/event-info.json", import.meta.url), "utf8");

test("read-only production: approved G47IX Battle images have actual valid image bytes", async (t) => {
  for (const { label, path, mime } of samples) {
    await t.test(label, async () => {
      assert.ok(published.includes(path), "expected asset is not referenced in current source metadata");
      const response = await fetch(ROOT + path, {
        method: "GET",
        cache: "no-store",
        redirect: "error",
        headers: { Accept: mime, "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(18000),
      });
      assert.equal(response.status, 200, label + " must be available to anonymous public visitors");
      assert.match(response.headers.get("content-type") || "", new RegExp("^" + mime + "(?:;|$)", "i"), label + " must have image MIME");
      const bytes = new Uint8Array(await response.arrayBuffer());
      assert.ok(bytes.length > 20 && bytes.length < 20 * 1024 * 1024, label + " must have plausible image bytes");
      if (mime === "image/png") {
        assert.deepEqual(Array.from(bytes.slice(0, 8)), [137,80,78,71,13,10,26,10], label + " must be a genuine PNG");
      } else {
        assert.equal(Buffer.from(bytes.slice(0, 4)).toString("ascii"), "RIFF", label + " WebP RIFF magic");
        assert.equal(Buffer.from(bytes.slice(8, 12)).toString("ascii"), "WEBP", label + " WebP format magic");
      }
    });
  }
});
