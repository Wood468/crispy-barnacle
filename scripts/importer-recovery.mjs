// Recover a genuinely stalled scheduled importer without a duplicate dispatch storm.
// Invoked only by the existing Job health action; this is NOT a general GitHub job runner.
const HOUR = 36e5;
const ACTIVE = new Set(['queued', 'in_progress', 'requested', 'waiting', 'pending']);
const GITHUB = 'https://api.github.com/repos/';

export function recoveryDecision(row, runs, now = Date.now()) {
  if (!row || row.id !== 'event-importer.yml' || row.state !== 'stale')
    return { dispatch: false, reason: 'not-stale' };
  if (!Array.isArray(runs)) return { dispatch: false, reason: 'run-history-unavailable' };
  if (runs.some(run => ACTIVE.has(run.status)))
    return { dispatch: false, reason: 'importer-already-active' };
  // Cron can be delayed by GitHub. Even an unsuccessful recent attempt should
  // cool down before retrying, to avoid repeatedly triggering a broken job.
  if (runs.some(run => {
    const started = Date.parse(run.created_at || '');
    return Number.isFinite(started) && started <= now && now - started < 2 * HOUR;
  })) return { dispatch: false, reason: 'recent-importer-attempt' };
  return { dispatch: true, reason: 'stale-without-recent-attempt' };
}

export async function recoverStaleImporter(row, {
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GITHUB_TOKEN,
  request = fetch,
  now = Date.now()
} = {}) {
  if (!row || row.id !== 'event-importer.yml' || row.state !== 'stale')
    return { status: 'skipped', reason: 'not-stale' };
  // Fixed repository host, workflow filename and main branch. Never allow
  // arbitrary job names, URLs, user prompts or branch choices.
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || !token)
    return { status: 'unavailable', reason: 'github-credentials-unavailable' };
  const base = GITHUB + repository + '/actions/workflows/event-importer.yml';
  const headers = {
    authorization: 'Bearer ' + token,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'user-agent': 'go-field-notes-importer-recovery'
  };
  const lookup = await request(base + '/runs?per_page=10', { headers });
  if (!lookup.ok) return { status: 'unavailable', reason: 'run-history-http-' + lookup.status };
  const history = await lookup.json();
  const decision = recoveryDecision(row, history.workflow_runs, now);
  if (!decision.dispatch) return { status: 'skipped', reason: decision.reason };
  const sent = await request(base + '/dispatches', {
    method: 'POST', headers, body: JSON.stringify({ ref: 'main' })
  });
  if (!sent.ok) return { status: 'unavailable', reason: 'dispatch-http-' + sent.status };
  return { status: 'dispatched', reason: decision.reason };
}
