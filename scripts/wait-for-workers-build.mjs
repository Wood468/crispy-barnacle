import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WORKERS_BUILD_CHECK_NAME = "Workers Builds: go-field-notes";
export const DEFAULT_WORKERS_BUILD_TIMEOUT_MS = 15 * 60 * 1000;

function cloudflareBuildPath(item) {
  try {
    const url = new URL(item && item.details_url);
    if (url.protocol !== "https:" || url.hostname !== "dash.cloudflare.com") return null;
    return url.pathname.split("/").filter(Boolean);
  } catch {
    return null;
  }
}

function isProductionWorkersBuild(item) {
  const parts = cloudflareBuildPath(item);
  return !!parts && parts.length === 8 && parts[1] === "workers" && parts[2] === "services" &&
    parts[3] === "view" && parts[4] === "go-field-notes" && parts[5] === "production" &&
    parts[6] === "builds" && !!parts[7];
}

function isPreviewWorkersBuild(item) {
  const parts = cloudflareBuildPath(item);
  return !!parts && parts.length === 10 && parts[1] === "workers" && parts[2] === "services" &&
    parts[3] === "view" && parts[4] === "go-field-notes" && parts[5] === "production" &&
    parts[6] === "previews" && !!parts[7] && parts[8] === "builds" && !!parts[9];
}

export async function waitForWorkersBuild(options = {}) {
  const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
  const sha = options.sha ?? process.env.GITHUB_SHA;
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleep = options.sleep ?? (ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms)));
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? DEFAULT_WORKERS_BUILD_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? 10 * 1000;

  if (!repository || !sha || !token) {
    throw new Error("GITHUB_REPOSITORY, GITHUB_SHA and GITHUB_TOKEN are required to verify the production build");
  }
  const parts = repository.split("/");
  if (parts.length !== 2 || parts.some(part => !part)) {
    throw new Error("GITHUB_REPOSITORY must be in owner/name form");
  }

  const endpoint = `https://api.github.com/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`;
  const deadline = now() + timeoutMs;
  let lastState = "Cloudflare Workers build check has not appeared";

  while (now() <= deadline) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "go-field-notes-site-check"
        },
        signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      lastState = "GitHub check-run request failed: " + (error && error.message || "network error");
      if (now() >= deadline) break;
      await sleep(Math.max(1, Math.min(pollIntervalMs, deadline - now())));
      continue;
    }

    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        lastState = "GitHub check-run API returned HTTP " + response.status;
        if (now() >= deadline) break;
        await sleep(Math.max(1, Math.min(pollIntervalMs, deadline - now())));
        continue;
      }
      throw new Error("GitHub check-run API returned HTTP " + response.status);
    }

    const payload = await response.json();
    const checkRuns = Array.isArray(payload.check_runs) ? payload.check_runs : [];
    const matching = checkRuns.filter(item => item && item.name === WORKERS_BUILD_CHECK_NAME);
    const check = matching.find(isProductionWorkersBuild);
    if (check) {
      lastState = String(check.status || "unknown") + "/" + String(check.conclusion || "pending");
      if (check.status === "completed") {
        if (check.conclusion !== "success") {
          throw new Error("Cloudflare Workers production build for " + sha.slice(0, 7) +
            " finished with " + String(check.conclusion || "no conclusion"));
        }
        return {
          buildId: check.external_id || null,
          detailsUrl: check.details_url || null
        };
      }
    } else if (matching.some(isPreviewWorkersBuild)) {
      lastState = "only a preview build is reported; waiting for a production build";
    } else if (matching.length) {
      lastState = "Workers build check does not identify a production deployment";
    }

    if (now() >= deadline) break;
    await sleep(Math.max(1, Math.min(pollIntervalMs, deadline - now())));
  }

  throw new Error("Timed out waiting for the Cloudflare Workers production build on " +
    sha.slice(0, 7) + " (last state: " + lastState + ")");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  waitForWorkersBuild().then(result => {
    console.log("Cloudflare Workers production build succeeded" +
      (result.buildId ? " (" + result.buildId + ")" : "") + ".");
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
