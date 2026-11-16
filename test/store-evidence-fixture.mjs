// Test helper (not a test): builds the producer-side completeness evidence block exactly as
// scripts/store_snapshot.py emits it, for a given observed item list.
export function evidenceFor(items, over = {}) {
  const tally = new Map();
  for (const i of items) tally.set(i.section, (tally.get(i.section) || 0) + 1);
  return {
    schema: 1, producer: "store_snapshot.py", loadComplete: true,
    passes: 3, stablePasses: 2, maxPasses: 20, cards: items.length,
    sections: [...tally].map(([name, count]) => ({ name, count })),
    ...over
  };
}
export const withEvidence = (items, over) => ({ items, completeness: evidenceFor(items, over) });
