import test from "node:test";
import assert from "node:assert/strict";
import { mediaFromR2 } from "../src/worker.js";
import { readFileSync } from "node:fs";

const bucket = (files) => ({ get: async (k) => files[k] ? { body: files[k], httpEtag: '"x"', writeHttpMetadata: h => h.set("content-type", "image/png") } : null });
const call = (path, env, method = "GET") => mediaFromR2(new Request("https://a.test" + path, { method }), env, new URL("https://a.test" + path));

test("pictures come from R2 when the binding exists and the file is there", async () => {
  const r = await call("/infographics/g47ix/a.png", { MEDIA: bucket({ "infographics/g47ix/a.png": "PNG" }) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.equal(await r.text(), "PNG");
});
test("without the binding, or a missing file, or another path, the site files are used", async () => {
  assert.equal(await call("/infographics/g47ix/a.png", {}), null);
  assert.equal(await call("/infographics/g47ix/b.png", { MEDIA: bucket({}) }), null);
  assert.equal(await call("/data.json", { MEDIA: bucket({ "data.json": "x" }) }), null);
  assert.equal(await call("/infographics/x.png", { MEDIA: bucket({ "infographics/x.png": "p" }) }, "POST"), null);
});
test("paths that climb out of the folder are refused", async () => {
  assert.equal(await call("/infographics/..%2Fsecret.png", { MEDIA: bucket({ "infographics/../secret.png": "p" }) }), null);
});


test("preview configuration keeps staging D1 and omits the production R2 binding", () => {
  const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const previewConfig = config.slice(config.indexOf("[previews.vars]"));

  assert.ok(config.includes('bucket_name = "go-field-notes-images"'), "production bucket remains configured");
  assert.ok(previewConfig.includes('database_name = "go-field-notes-staging"'), "preview keeps its staging database");
  assert.equal(previewConfig.includes("[[previews.r2_buckets]]"), false, "preview must not declare an R2 bucket");
  assert.equal(previewConfig.includes('binding = "MEDIA"'), false, "preview must not bind MEDIA");
});
