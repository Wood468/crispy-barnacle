// Pure event matching and persistent review-state helpers.
const STOP_WORDS = new Set([
  "pokemon", "pokémon", "go", "the", "and", "for", "with", "from", "into",
  "this", "that", "your", "event", "events", "infographic", "infographics",
  "guide", "graphic", "updated", "update", "official", "community"
]);

function tokens(value) {
  return new Set(String(value || "").normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").split(/\s+/)
    .filter(token => token.length > 2 && !STOP_WORDS.has(token)));
}

function flattenEvent(event) {
  const values = [];
  const visit = value => {
    if (typeof value === "string") values.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(event);
  return values.join(" ");
}

export function matchEvent(candidate, events = []) {
  const titleTokens = tokens(candidate.title);
  if (!titleTokens.size) return null;

  const ranked = events.map(event => {
    const nameTokens = tokens(event.t || event.title || "");
    const allTokens = tokens(flattenEvent(event));
    const nameOverlap = [...nameTokens].filter(t => titleTokens.has(t)).length;
    const totalOverlap = [...allTokens].filter(t => titleTokens.has(t)).length;
    const nameScore = nameTokens.size ? nameOverlap / nameTokens.size : 0;
    const titleCoverage = titleTokens.size ? totalOverlap / titleTokens.size : 0;
    const score = Math.min(1, nameScore * 0.78 + titleCoverage * 0.22);
    return {
      eventId: event.id || null,
      eventTitle: event.t || event.title || "Untitled event",
      score: Number(score.toFixed(3)),
      nameOverlap,
      matchedTerms: [...allTokens].filter(t => titleTokens.has(t)).slice(0, 12)
    };
  }).sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 0.34 || best.nameOverlap === 0) return null;
  return {
    eventId: best.eventId,
    eventTitle: best.eventTitle,
    score: best.score,
    confidence: best.score >= 0.72 ? "high" : best.score >= 0.48 ? "medium" : "low",
    matchedTerms: best.matchedTerms,
    alternatives: ranked.slice(0, 3).filter(r => r.score > 0).map(r => ({ eventId: r.eventId, eventTitle: r.eventTitle, score: r.score })),
    method: "title-to-public/data.json heuristic",
    requiresHumanVerification: true
  };
}

export function normaliseUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return "";
  }
}

export function mergeReviewState(previous, discoveries, events, now = new Date().toISOString()) {
  const state = previous && typeof previous === "object" ? previous : {};
  const candidates = Array.isArray(state.candidates) ? state.candidates.map(c => ({ ...c })) : [];
  const eventImages = state.eventImages && typeof state.eventImages === "object"
    ? JSON.parse(JSON.stringify(state.eventImages))
    : {};
  const byUrl = new Map(candidates.map(c => [normaliseUrl(c.url), c]));
  let changed = false;

  for (const raw of discoveries) {
    const candidate = { ...raw, eventMatch: matchEvent(raw, events) };
    const key = normaliseUrl(candidate.url);
    if (!key) continue;
    const existing = byUrl.get(key);
    if (existing) {
      for (const field of ["title", "imageUrl", "publishedAt", "eventMatch"]) {
        const next = candidate[field];
        if (next && JSON.stringify(existing[field]) !== JSON.stringify(next)) {
          existing[field] = next;
          changed = true;
        }
      }
      continue;
    }

    const eventId = candidate.eventMatch?.eventId;
    const slot = eventId ? (eventImages[eventId] || {}) : null;
    const predecessorId = slot?.approvedCandidateId || slot?.proposedCandidateId || null;
    candidate.discoveredAt = candidate.discoveredAt || now;
    candidate.reviewStatus = eventId
      ? (predecessorId ? "possible_update" : "needs_review")
      : "unmatched";
    candidate.supersedesCandidateId = predecessorId;
    candidate.reviewNote = eventId
      ? (predecessorId
          ? "New candidate for an event that already has an image candidate. Compare it before replacing anything."
          : "Potential event match. Verify the image contents and event details before approval.")
      : "No reliable event-title match. Review manually.";
    candidate.decision = "pending";
    candidates.push(candidate);
    byUrl.set(key, candidate);
    changed = true;

    if (eventId) {
      eventImages[eventId] = {
        ...slot,
        eventId,
        eventTitle: candidate.eventMatch.eventTitle,
        approvedCandidateId: slot?.approvedCandidateId || null,
        proposedCandidateId: candidate.id,
        lastCandidateAt: candidate.publishedAt || candidate.discoveredAt
      };
    }
  }

  candidates.sort((a, b) =>
    (Date.parse(b.publishedAt || b.discoveredAt || "") || 0) -
    (Date.parse(a.publishedAt || a.discoveredAt || "") || 0)
  );
  return {
    schemaVersion: 2,
    creator: "G47IX",
    sourceAccount: "Reddit u/g47onik",
    updatedAt: changed ? now : (state.updatedAt || now),
    policy: "Review registry only. Candidates are never published to the app automatically.",
    eventImages,
    candidates
  };
}
