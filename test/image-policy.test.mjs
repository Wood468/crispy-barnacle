import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { IMAGE_CSP_HOSTS } from "../src/image-policy.js";

const files = [
  "public/event-info.json",
  "public/event-details.json",
  "public/infographic-queue.json",
  "public/world-events.json",
  "public/regional-events.json",
  "public/season.json",
  "public/weekly.json"
];

function inspect(value, path, out) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspect(item, path + "." + index, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) inspect(item, path + "." + key, out);
    return;
  }
  if (typeof value !== "string") return;
  const key = path.split(".").pop() || "";
  const isImageField = /^(image|infographic|infographicUrl|poster|banner|thumbnail)$/i.test(key) ||
    /\.infographics\.\d+\.url$/i.test(path);
  if (!isImageField || !/^https?:\/\//i.test(value)) return;
  let url;
  try { url = new URL(value); } catch { assert.fail(path + " contains an invalid image URL"); }
  assert.equal(url.protocol, "https:", path + " must not use HTTP");
  assert.ok(IMAGE_CSP_HOSTS.includes(url.origin), path + " uses an unapproved image origin: " + url.origin);
}

test("public event and infographic data use only same-origin or CSP-approved image URLs", () => {
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    inspect(data, file, []);
  }
});
