// Monthly regional price review without screenshots. Reads src/regional-observations.js and flags observations
// that are stale, due, unverified or malformed. Prints a report; exits 1 only with --strict and a stale/invalid finding.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { OBSERVATIONS } from '../src/regional-observations.js';
const R = createRequire(import.meta.url)('../public/regional-prices.js');
export function report(obs = OBSERVATIONS, now = Date.now()) {
  const r = R.review(obs, now);
  const lines = [`Regional price review ${new Date(now).toISOString().slice(0, 10)}: ${r.checked} product families checked, ${r.flags.length} flag(s).`];
  for (const f of r.flags) lines.push(`- [${f.level}] ${f.message}`);
  if (!r.flags.length) lines.push('- Everything observed within the review window.');
  lines.push('To refresh: add newer dated records to src/regional-observations.js (never edit an old price), then re-run.');
  return { ...r, text: lines.join('\n') };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = report();
  console.log(r.text);
  if (process.argv.includes('--strict') && !r.ok) process.exit(1);
}
