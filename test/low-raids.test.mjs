import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTiers, sane, pickRotation, mayReplace, applyLow, cleanName, sameLow } from "../scripts/low-raids.mjs";

const LISTS = `<h2>1-Star Raids</h2><ul><li>Axew</li><li>Goomy</li><li>Jangmo-o</li><li>Frigibax</li></ul>
<h2>3-Star Raids</h2><ul><li>Alola Ninetales</li><li>Alola Raichu</li><li>Alola Muk</li></ul>
<h2>5-Star Raids</h2><ul><li>Palkia</li></ul><h2>Mega Raids</h2><ul><li>Mega X Charizard</li></ul>
<h2>Shadow 3-Star Raids</h2><ul><li>Shadow Primeape</li></ul><p>Last update: October 20, 2026</p>`;
const INLINE = `<p><strong>1-Star Raids:</strong> Axew, Goomy, Jangmo-o, Frigibax</p><p><strong>3-Star Raids:</strong> Alola Ninetales, Alola Raichu, Alola Muk</p><p><strong>5-Star Raids:</strong> Palkia</p>`;
const PICTURES = `<h3>1-Star Raids</h3><div><img src="a.png" alt="Axew"><img src="b.png" alt="Goomy"></div><h3>3-Star Raids</h3><div><img src="c.png" alt="Alola Muk Pokémon"></div><h3>5-Star Raids</h3><div><img alt="Palkia"></div>`;

test("tiers are read from lists, inline text and picture alt text; shadow and other blocks do not bleed in", () => {
  for (const html of [LISTS, INLINE]) {
    const t = parseTiers(html);
    assert.deepEqual(t.one, ["Axew", "Goomy", "Jangmo-o", "Frigibax"]);
    assert.deepEqual(t.three, ["Alolan Ninetales", "Alolan Raichu", "Alolan Muk"]);
    assert.deepEqual(t.five, ["Palkia"]); assert.ok(sane(t));
  }
  const p = parseTiers(PICTURES);
  assert.deepEqual(p.one, ["Axew", "Goomy"]); assert.deepEqual(p.three, ["Alolan Muk"]);
  assert.ok(!parseTiers(LISTS).three.some(n => /Primeape/.test(n)));
});
test("a page that does not parse is not trusted", () => {
  assert.equal(sane(parseTiers("<html><body>Please enable JavaScript</body></html>")), false);
  assert.equal(sane(parseTiers("<h2>1-Star Raids</h2><h2>3-Star Raids</h2><h2>5-Star Raids</h2>")), false);
  assert.equal(cleanName("Alola Muk"), "Alolan Muk");
});
test("the page is matched to a rotation by its 5-star boss, never by dates", () => {
  const rot = [{ s: "2026-10-14T10:00", e: "2026-10-21T10:00", five: "Dialga" }, { s: "2026-10-21T10:00", e: "2026-10-28T10:00", five: "Palkia" }, { s: "2026-10-28T10:00", e: "2026-11-04T10:00", five: "Origin Forme Giratina" }];
  const now = Date.parse("2026-10-22T00:00:00Z");
  assert.equal(pickRotation(rot, ["Palkia"], now).five, "Palkia");
  assert.equal(pickRotation(rot, ["Giratina (Origin Forme)"], now).five, "Origin Forme Giratina");
  assert.equal(pickRotation(rot, ["Dialga"], now), null, "an ended rotation is left alone");
  assert.equal(pickRotation(rot, ["Mewtwo"], now), null);
});
test("only an empty block, or one this job wrote, may be replaced", () => {
  assert.ok(mayReplace({})); assert.ok(mayReplace({ low: { source: "Pokémon GO Hub current raids" } }));
  assert.ok(!mayReplace({ low: { source: "Dexerto current raid bosses" } }));
});
test("editing the real data.json changes only the one rotation's low block", () => {
  const raw = readFileSync("public/data.json", "utf8"), was = JSON.parse(raw);
  const target = was.rotation.find(r => r.five === "Palkia") || was.rotation[was.rotation.length - 1];
  const low = { one: ["Axew", "Goomy"], three: ["Alolan Muk"], observed: "2026-10-21", source: "Pokémon GO Hub current raids" };
  const out = applyLow(raw, target.s, low), now = JSON.parse(out);
  assert.deepEqual(now.rotation.find(r => r.s === target.s).low, low);
  now.rotation.find(r => r.s === target.s).low = was.rotation.find(r => r.s === target.s).low; if (!was.rotation.find(r => r.s === target.s).low) delete now.rotation.find(r => r.s === target.s).low;
  assert.deepEqual(now, was, "nothing else in the file changed");
  const again = applyLow(out, target.s, { ...low, one: ["Axew"] });
  assert.deepEqual(JSON.parse(again).rotation.find(r => r.s === target.s).low.one, ["Axew"], "a second run replaces the block");
  assert.equal(out.split("\n").length - raw.split("\n").length <= 1, true, "about one line added");
});

test("Hub-style pictures: sprite alt text gives the name, type and egg icons are ignored", () => {
  const li = (n, types) => '<li><img src="s.png" alt="Sprite of ' + n + ' from Pokémon GO"><span>' + n.replace("Alola ", "Alolan ") + '</span>' + types.map(t => '<img alt="' + t + ' type icon">').join("") + "</li>";
  const html = '<h2>1-Star Raids</h2><ul>' + li("Axew", ["Dragon"]) + li("Goomy", ["Dragon"]) + li("Jangmo-o", ["Dragon"]) + li("Frigibax", ["Dragon", "Ice"]) + "</ul>"
    + '<h2>3-Star Raids</h2><ul>' + li("Alola Ninetales", ["Ice", "Fairy"]) + li("Alola Raichu", ["Electric", "Psychic"]) + li("Alola Muk", ["Poison", "Dark"]) + "</ul>"
    + '<h2>5-Star Raids</h2><ul>' + li("Palkia", ["Water", "Dragon"]) + '<li><img alt="Mega Raid Egg icon"></li></ul>';
  const t = parseTiers(html);
  assert.deepEqual(t.one, ["Axew", "Goomy", "Jangmo-o", "Frigibax"]);
  assert.deepEqual(t.three, ["Alolan Ninetales", "Alolan Raichu", "Alolan Muk"]);
  assert.deepEqual(t.five, ["Palkia"]); assert.ok(sane(t));
});

test("a heading after a list is not read as a Pokémon", () => {
  const html = '<h2>1-Star Raids</h2><ul><li>Axew</li><li>Goomy</li></ul><h3>Current Shadow Raid Bosses</h3><ul><li>Shadow Gastly</li></ul>'
    + '<h2>3-Star Raids</h2><ul><li>Alola Muk</li></ul><h4>Current Mega Raid Bosses</h4><h2>5-Star Raids</h2><ul><li>Palkia</li></ul>';
  const t = parseTiers(html);
  assert.deepEqual(t.one, ["Axew", "Goomy"]); assert.deepEqual(t.three, ["Alolan Muk"]); assert.deepEqual(t.five, ["Palkia"]);
  // a heading ends the list, and is never kept as a name
  assert.deepEqual(parseTiers('<h2>1-Star Raids</h2><ul><li>Axew</li><li>Current Shadow Raid Bosses</li><li>Goomy</li></ul>').one, ["Axew"]);
});

test("Shadow 1-star and 3-star raids are read under their own headings, and always named 'Shadow X'", () => {
  const li = n => '<li><img alt="Sprite of ' + n + ' from Pokémon GO"><span>' + n + '</span><img alt="Fighting type icon"></li>';
  const html = '<h2>1-Star Raids</h2><ul>' + li("Axew") + '</ul><h2>3-Star Raids</h2><ul>' + li("Alola Muk") + '</ul><h2>5-Star Raids</h2><ul>' + li("Palkia") + '</ul>'
    + '<h3>Current Shadow Raid Bosses</h3><h2>Shadow 5-Star Raids</h2><ul><li>Incarnate Shadow Landorus</li></ul>'
    + '<h2>Shadow 3-Star Raids</h2><ul>' + li("Shadow Primeape") + li("Primeape (Shadow)") + "<li>Shadow Kirlia</li><li>Shadow Drapion</li></ul>"
    + '<h2>Shadow 1-Star Raids</h2><ul><li>Shadow Gastly</li><li>Shadow Totodile</li><li>Shadow Shieldon</li><li>Shadow Gible</li></ul><p>Last update: October 20, 2026</p>';
  const t = parseTiers(html);
  assert.deepEqual(t.shadowThree, ["Shadow Primeape", "Shadow Kirlia", "Shadow Drapion"]);
  assert.deepEqual(t.shadowOne, ["Shadow Gastly", "Shadow Totodile", "Shadow Shieldon", "Shadow Gible"]);
  assert.deepEqual(t.one, ["Axew"]); assert.deepEqual(t.three, ["Alolan Muk"]); assert.deepEqual(t.five, ["Palkia"]);
  assert.ok(sane(t));
  assert.deepEqual(parseTiers(LISTS).shadowOne, [], "a page with no Shadow 1-star list gives none");
  assert.ok(!sameLow({ one: ["Axew"], three: ["Alolan Muk"] }, { one: ["Axew"], three: ["Alolan Muk"], shadowOne: ["Shadow Gastly"] }), "adding shadow bosses counts as a change");
});
