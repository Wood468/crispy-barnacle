/* Regional Store price observations (owner-only data).
   Served only through the authenticated /api/prices-private route, never from public/. Each record keeps its own region,
   purchase channel, currency, date and source. Add new observations here; never edit an old one to a new price (add a newer dated record).
   status "verified": read directly from the live Store on `observed` (owner screenshot, 9 Nov 2026).
   status "recorded": carried over from earlier work with no original image in the repository; shown, but never used to set confidence above "low".
   pairAud: an Australian Web Store price for a comparable product, used only for ratio estimates of future products of the same kind. */
const ID = { region: "ID", channel: "web", currency: "IDR", observed: "2026-11-09", source: "Indonesian Web Store (owner screenshot)", status: "verified" };
export const OBSERVATIONS = [
  { ...ID, id: "id-itw-deluxe", product: "GO Pass Deluxe: Into the Wild", kind: "event-pass", amount: 76000 },
  { ...ID, id: "id-itw-deluxe-ranks", product: "GO Pass Deluxe: Into the Wild + 10 Ranks", kind: "event-pass-ranks", amount: 101000 },
  { ...ID, id: "id-itw-deluxe-ranks-ultra", product: "GO Pass Deluxe: Into the Wild + 10 Ranks Ultra Box", kind: "event-pass-ranks-ultra", amount: 126000 },
  { ...ID, id: "id-monthly-deluxe", product: "Monthly GO Pass Deluxe", kind: "monthly-pass", amount: 41000, pairAud: { amount: 12.99, ref: "go-pass-oct-deluxe", observed: "2026-10-12" } },
  { ...ID, id: "id-monthly-ultra", product: "Monthly Deluxe Ultra Box", kind: "monthly-pass-ultra", amount: 76000, pairAud: { amount: 22.99, ref: "go-pass-oct-ultrabox", observed: "2026-10-12" } },
  { ...ID, id: "id-storage-50", product: "Pokémon Storage +50", kind: "storage", amount: 10000 },
  { ...ID, id: "id-item-bag", product: "Item Bag upgrade", kind: "storage", amount: 10000 },
  /* 9 Nov owner screenshots: standard Web Store packs. Yellow +10/+60/etc are Reward Road points, not coins. */
  ...[[110,5000],[600,25000],[1300,50000],[2700,101000],[5600,200000],[15500,505000]].map(([coins,amount]) => ({ ...ID, id: "id-coins-standard-" + coins, product: coins.toLocaleString("en-US") + " PokéCoins (standard Web Store pack)", kind: "coins", amount, coins })),
  { ...ID, id: "id-coins-18500-promo", product: "16,500 PokéCoins + 2,000 one-time Web Store bonus (18,500 total)", kind: "coins", amount: 505000, coins: 18500, oneTime: true },
  { ...ID, id: "id-coins-3300", product: "3,300 total PokéCoins", kind: "coins", amount: 101000, coins: 3300, oneTime: true },
  { ...ID, id: "id-coins-6800", product: "6,800 total PokéCoins", kind: "coins", amount: 200000, coins: 6800, oneTime: true },
  /* Carried over from the first regional-pricing work (PR #374 baseline); original image not in the repository. */
  ...[["GO Rocket Leader Kit", "bundle", 50000], ["Raid Commander Box", "bundle", 200000], ["Pro Raid Bundle", "bundle", 379000],
    ["Lucky Egg x8", "item", 25000], ["Star Piece x8", "item", 30500], ["Remote Raid Pass x2", "item", 15000], ["Super Incubator x2", "item", 15000],
    ["Egg Incubator x3", "item", 15000], ["Premium Battle Pass x3", "item", 15000], ["Max Particle Pack x6", "item", 41000], ["Max Mushroom x3", "item", 50000],
    ["Silver Pinap Berries x10", "item", 10000], ["Golden Razz Berries x15", "item", 10000], ["Max Potions x10", "item", 10000], ["Max Revive x15", "item", 10000]]
    .map(([product, kind, amount]) => ({ ...ID, status: "recorded", source: "Indonesian Web Store (PR #374 baseline; original image not retained)", id: "id-" + product.toLowerCase().replace(/[^a-z0-9]+/g, "-"), product, kind, amount })),
  { id: "in-itw-deluxe", region: "IN", channel: "in-app", currency: "INR", observed: "2026-11-09", source: "India in-app shop (PR #374 baseline; original image not retained)", status: "recorded", product: "GO Pass Deluxe: Into the Wild", kind: "event-pass", amount: 439 },
  /* 9 Nov in-app shop values transcribed in the earlier Store review chat.
     The coin bonus sizes differ from the Australian WEB packs, so these
     records remain distinct and MUST NOT authorize cross-region SKU joins. */
  ...[[100,5,29],[550,30,149],[1200,60,289],[2500,120,589],[5200,240,1169],[14500,600,2899]]
    .map(([base,bonus,amount]) => ({
      id: "in-coins-" + base + "-bonus-" + bonus,
      region: "IN", channel: "in-app", currency: "INR",
      observed: "2026-11-09",
      source: "India in-app shop (9 Nov owner screenshot transcription; original image not retained)",
      status: "recorded", product: base.toLocaleString("en-US") + " PokéCoins + " + bonus + " in-app bonus",
      kind: "coins", coins: base + bonus, amount
    })),
  { id: "in-itw-ticket", region: "IN", channel: "in-app", currency: "INR",
    observed: "2026-11-09", source: "India in-app shop (9 Nov owner screenshot transcription; original image not retained)",
    status: "recorded", product: "Into the Wild ticket", kind: "research-ticket", amount: 349 }
];
