# Pokémon GO CP reference data

The bundled base stats and CP multipliers are derived from PvPoke's Pokémon GO Game Master data, distributed under the MIT license. The data was obtained through the published dataset and pinned upstream revision documented by the source project.

- Upstream project: https://github.com/pvpoke/pvpoke
- Reference dataset and provenance: https://github.com/TicTacTris/pokemog/blob/main/DATA_SOURCES.md
- Pinned upstream revision: 04ee0835e80f30c45376415725c0039cbdd12c5e
- Included licence: `PVPoke-LICENSE.txt`

The app uses only the species' Pokémon GO base Attack, Defense and Stamina stats and the CP multiplier table. It calculates perfect-IV CP for level 20 raid catches and level 25 weather-boosted raid catches using the standard Pokémon GO formula. CP labels are shown only on Raid and Max Battle cards when the exact species/form can be matched. Mega/Primal encounter names are reduced to their base Pokémon for catch CP. Costumed forms are intentionally not labelled because form-specific stats cannot be guaranteed from the current event data.

The source dataset includes some aliases and forms that may not be currently available in-game; the UI only uses entries when an event card names a matching species. No network request to the upstream source is made at runtime.
