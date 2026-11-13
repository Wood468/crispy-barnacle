// Browser image sources observed in the application and audited production event pages.
// Keep this list narrow: new remote image CDNs require an explicit review and a regression test.
export const IMAGE_CSP_HOSTS = Object.freeze([
  "https://play.pokemonshowdown.com",         // animated Pokémon sprites
  "https://archives.bulbagarden.net",         // Max Particle artwork and team emblems
  "https://static.pokebattler.com",             // CaptGoldfish raid guide graphics
  "https://leekduck.com",                     // Leek Duck event graphics (supported page parser)
  "https://cdn.leekduck.com",                 // Leek Duck event graphics and og:image
  "https://lh3.googleusercontent.com",        // official Pokémon GO event artwork
  "https://storage.googleapis.com"            // official Pokémon GO event artwork
]);

// og:image is extracted only from official Pokémon GO and Leek Duck pages.
// These are the image CDNs actually observed on those pages, not the page hosts.
export const OG_IMAGE_HOSTS = Object.freeze([
  "leekduck.com",
  "cdn.leekduck.com",
  "lh3.googleusercontent.com",
  "storage.googleapis.com"
]);

export function isAllowedOgImage(value) {
  let u;
  try { u = new URL(value || ""); } catch { return false; }
  return u.protocol === "https:" && !u.username && !u.password && !u.port && OG_IMAGE_HOSTS.includes(u.hostname);
}
