#!/usr/bin/env bash
# Rebuilds public/moves.json from the published game data. Repeatable: run it, check `git diff --stat`, commit.
# Writes nothing unless every download works, the two sources agree on every move type, and the result looks sane.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
pv=https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data
curl -fsS --max-time 120 "$pv/gamemaster/moves.json"   -o "$tmp/moves.json"
curl -fsS --max-time 120 "$pv/gamemaster/pokemon.json" -o "$tmp/pokemon.json"
curl -fsS --max-time 120 "$pv/gamemaster.json"         -o "$tmp/gm.json"
curl -fsS --max-time 300 https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json -o "$tmp/pm.json"
stamp="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['timestamp'])" "$tmp/gm.json")"
python3 tools/build-moves.py "$tmp/moves.json" "$tmp/pokemon.json" "$tmp/pm.json" "$stamp" > "$tmp/out.json"
python3 - "$tmp/out.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert len(d["types"]) > 300 and len(d["elite"]) > 100, "result looks too small, not writing"
print("moves:", len(d["types"]), "| elite entries:", len(d["elite"]), "| source data stamp:", d["source"]["gamemaster"])
PY
mv "$tmp/out.json" public/moves.json
echo "Wrote public/moves.json"
