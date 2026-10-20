// Owner-only data lives in R2, not in the public repo. Tests use the real file when it is present
// locally (private/*.json, git-ignored) and a small synthetic fixture otherwise.
import { readFileSync, existsSync } from "node:fs";
export function readPrivate(name, fixture) {
  const real = new URL("../private/" + name, import.meta.url);
  return JSON.parse(readFileSync(existsSync(real) ? real : new URL("./fixtures/" + fixture, import.meta.url), "utf8"));
}
export const hasPrivate = name => existsSync(new URL("../private/" + name, import.meta.url));
