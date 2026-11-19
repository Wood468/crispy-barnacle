import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreMissingPictures, missingStaged, localPictureReady } from "../scripts/g47ix-publish.mjs";

const staged = (id, ext = "webp") => `/infographics/g47ix/discord-${id}.${ext}`;
const cand = (id, extra = {}) => ({ id: "discord:" + id, title: "GO Weekly T16", imageUrl: "https://cdn.example.test/stale.png?ex=1", stagedPath: staged(id), reviewStatus: "weekly", decision: "", ocrChecked: true, ...extra });

function harness(files = {}) {
  const disk = new Map(Object.entries(files)); const fetched = [];
  return {
    disk, fetched,
    ready: p => (disk.get(p) || "").length > 0,
    fetchPicture: async url => { fetched.push(url); return { buf: Buffer.from("PIC"), ext: "png" }; },
    convertTo: async (pic, want) => ({ buf: Buffer.from("CONVERTED"), ext: want }),
    save: async (p, buf) => { disk.set(p, buf.toString()); }
  };
}

test("a staged picture missing locally is fetched again from the fresh Discord link and written to its registered path", async () => {
  const reg = { candidates: [cand("16"), cand("2")] };
  const h = harness({ [staged("2")]: "OK" });
  const history = [{ message_id: "16", image_url: "https://cdn.example.test/fresh.png?ex=2" }];
  const r = await restoreMissingPictures(reg, history, h);
  assert.deepEqual(r.restored, ["discord:16"]);
  assert.deepEqual(h.fetched, ["https://cdn.example.test/fresh.png?ex=2"]);
  assert.equal(h.disk.get(staged("16")), "CONVERTED"); // png from Discord becomes the .webp the registry names
  assert.equal(h.disk.get(staged("2")), "OK"); // present pictures are never refetched or overwritten
});

test("restoring a picture never changes review status, decision, creator, match or the registered path", async () => {
  const reg = { candidates: [cand("16", { overview: "week", creator: "", eventMatch: { eventId: "x" } }), cand("9", { reviewStatus: "needs_review", decision: "pending" })] };
  const before = JSON.stringify(reg);
  await restoreMissingPictures(reg, [], harness());
  assert.equal(JSON.stringify(reg), before);
});

test("falls back to the stored link when the latest read does not list the post; failures are reported, not thrown", async () => {
  const reg = { candidates: [cand("16"), cand("17")] };
  const h = harness(); const real = h.fetchPicture;
  h.fetchPicture = async url => { if (url.includes("stale")) { h.fetched.push(url); throw new Error("HTTP 404"); } return real(url); };
  const r = await restoreMissingPictures(reg, [{ message_id: "17", image_url: "https://cdn.example.test/ok.png" }], h);
  assert.deepEqual(r.restored, ["discord:17"]);
  assert.deepEqual(r.failed, ["discord:16 (HTTP 404)"]);
  assert.equal(h.disk.has(staged("16")), false, "nothing is written for a failed fetch, so validation still fails loudly");
});

test("rejected pictures, unsafe paths and non-staged entries are never fetched", async () => {
  const reg = { candidates: [
    cand("1", { decision: "rejected" }), cand("2", { stagedPath: "/infographics/g47ix/../x.webp" }), cand("3", { stagedPath: "/img/ext/x.webp" }),
    cand("4", { stagedPath: "https://evil.example.test/x.webp" }), { id: "discord:5", imageUrl: "https://cdn.example.test/a.png" }
  ] };
  const h = harness();
  assert.deepEqual(missingStaged(reg, h.ready), []);
  const r = await restoreMissingPictures(reg, [], h);
  assert.deepEqual(r, { restored: [], failed: [] }); assert.deepEqual(h.fetched, []);
});

test("a wrong format that cannot be converted is not written", async () => {
  const reg = { candidates: [cand("16", { stagedPath: staged("16", "png") })] };
  const h = harness(); h.fetchPicture = async () => ({ buf: Buffer.from("J"), ext: "jpg" }); h.convertTo = async pic => pic;
  const r = await restoreMissingPictures(reg, [], h);
  assert.equal(r.restored.length, 0); assert.equal(r.failed.length, 1); assert.equal(h.disk.size, 0);
});

test("localPictureReady needs a nonempty regular file (not a link)", () => {
  const d = mkdtempSync(join(tmpdir(), "g47ix-ready-"));
  try {
    writeFileSync(join(d, "a.webp"), "x"); writeFileSync(join(d, "empty.webp"), ""); mkdirSync(join(d, "dir.webp"));
    assert.equal(localPictureReady(join(d, "a.webp")), true);
    for (const n of ["empty.webp", "dir.webp", "missing.webp"]) assert.equal(localPictureReady(join(d, n)), false, n);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
