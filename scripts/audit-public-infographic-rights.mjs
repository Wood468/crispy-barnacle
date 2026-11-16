/**
 * Read-only inventory of community artwork referenced by public GO Field Notes
 * JSON. This is a visibility audit, NOT a licence checker or proof that media is
 * actually reachable at a given time. Do not emit private IDs, URLs or images.
 *
 * Usage: node scripts/audit-public-infographic-rights.mjs [--fail-on-public]
 * Strict mode is opt-in until Release Lead + rights/security approval.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const list = v => Array.isArray(v) ? v : [];
const string = v => typeof v === 'string' ? v : '';
const pathOnly = v => string(v).split(/[?#]/, 1)[0];
const g47ixPath = v => /^\/infographics\/g47ix\//i.test(pathOnly(v));
const g47ixEntry = (entry, mediaPath) =>
  g47ixPath(mediaPath) || /^g47ix$/i.test(string(entry?.source).trim()) || /^g47ix$/i.test(string(entry?.creator).trim());

/**
 * Summarise public JSON references without returning any source URLs, message
 * IDs, CDN URLs, filenames or OCR. Approval and permission are separate: even
 * a reviewed/published candidate cannot establish public redistribution rights.
 */
export function auditPublicInfographicRights({ eventInfo = {}, weekly = {}, queue = {}, registry = {} } = {}) {
  const totals = {
    eventReferences: 0,
    bossGuideReferences: 0,
    weeklyReferences: 0,
    queueReferences: 0,
    uniqueMediaPaths: 0,
    pendingWeeklyReferences: 0,
    unmatchedWeeklyReferences: 0,
    missingQueueCreatorAttribution: 0,
    sourceLabelPathMismatch: 0,
    explicitlyAttributedG47ixReferences: 0,
    namespaceOnlyReferences: 0,
  };
  const paths = new Set();
  const recorded = (entry, mediaPath, category) => {
    if (!g47ixEntry(entry, mediaPath)) return false;
    totals[category]++;
    // The /g47ix/ folder also stores owner-submitted Telegram graphics. A
    // namespace match is a public-path concern, NOT creator attribution.
    const attributed = /^g47ix$/i.test(string(entry?.source).trim()) || /^g47ix$/i.test(string(entry?.creator).trim());
    totals[attributed ? 'explicitlyAttributedG47ixReferences' : 'namespaceOnlyReferences']++;
    const path = pathOnly(mediaPath);
    // Only local paths are counted for deduplicated public media. Other G47IX
    // source-labelled external links are counted as references, not local blobs.
    if (path.startsWith('/')) paths.add(path);
    if (path.startsWith('/infographics/') && !g47ixPath(path)) totals.sourceLabelPathMismatch++;
    return true;
  };

  for (const event of Object.values(isObject(eventInfo?.events) ? eventInfo.events : {})) {
    for (const graphic of list(event?.infographics)) {
      recorded(graphic, graphic?.url, 'eventReferences');
    }
  }
  for (const guide of list(eventInfo?.pokemonGuides)) {
    for (const graphic of list(guide?.infographics)) {
      recorded(graphic, graphic?.url, 'bossGuideReferences');
    }
  }

  const candidates = list(registry?.candidates);
  const indexed = new Map();
  for (const candidate of candidates) {
    const p = pathOnly(candidate?.stagedPath);
    if (p && !indexed.has(p)) indexed.set(p, candidate);
  }
  for (const graphic of list(weekly?.items)) {
    if (!recorded(graphic, graphic?.image, 'weeklyReferences')) continue;
    const candidate = indexed.get(pathOnly(graphic.image));
    if (!candidate) {
      totals.unmatchedWeeklyReferences++;
      continue;
    }
    // 'weekly' is an automated classification, not necessarily a manual
    // publication decision. Explicit overview=week/month is owner selection.
    const selected = candidate.overview === graphic.kind;
    if (!selected || candidate.decision === 'pending' || candidate.decision === 'rejected') {
      totals.pendingWeeklyReferences++;
    }
  }
  for (const graphic of list(queue?.items)) {
    if (!recorded(graphic, graphic?.image, 'queueReferences')) continue;
    if (!string(graphic?.creator).trim()) totals.missingQueueCreatorAttribution++;
  }

  totals.uniqueMediaPaths = paths.size;
  const publicReferences = totals.eventReferences + totals.bossGuideReferences + totals.weeklyReferences + totals.queueReferences;
  return {
    auditVersion: 1,
    classification: 'G47IX-attributed-or-g47ix-namespace-reference-not-creator-proof-licence-or-live-access',
    publicG47ixReferences: publicReferences,
    requiresRightsReview: publicReferences > 0,
    totals,
    note: "The g47ix URL namespace may hold other creators' images; attribution and approval do not imply public redistribution permission.",
  };
}

export function runAudit(directory = process.cwd(), strict = false) {
  const read = file => JSON.parse(readFileSync(resolve(directory, file), 'utf8'));
  const report = auditPublicInfographicRights({
    eventInfo: read('public/event-info.json'),
    weekly: read('public/weekly.json'),
    queue: read('public/infographic-queue.json'),
    registry: read('data/g47ix-infographics-review.json'),
  });
  return { report, exitCode: strict && report.requiresRightsReview ? 2 : 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/audit-public-infographic-rights.mjs [--fail-on-public]\nRead-only, redacted aggregate audit. --fail-on-public is opt-in pending rights/security policy approval.');
  } else if (args.some(x => x !== '--fail-on-public')) {
    console.error('Unknown option. Run with --help.');
    process.exitCode = 2;
  } else {
    try {
      const { report, exitCode } = runAudit(process.cwd(), args.includes('--fail-on-public'));
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = exitCode;
    } catch (error) {
      // No exception string: file contents and paths must not leak to logs.
      console.error('Public infographic audit unavailable: required JSON could not be read or parsed.');
      process.exitCode = 2;
    }
  }
}
