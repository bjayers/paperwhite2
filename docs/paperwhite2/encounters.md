# Wild encounters

Paper White 2's wild encounters replace the original slot tables with data kept per species. Each species lists its
habitats, and the build packs them by area. The game turns an area's habitats into the encounter's slots, weighted by
rarity tier. The Encounter Editor (`editor/src/modules/encounters/`, the editor's README) edits all of it.

## The data

All files are in `res/paperwhite2/encounters/`, each with its schema beside it.

| File | What it holds |
| --- | --- |
| `settings.json` | The rarity tiers and their shares, and the level gate (`scaled` or `party`). The hidden ability's default chance (10%). Default battle styles. The rustling spots' rule. The outbreaks' share (40%). The editor's import settings. |
| `groups.json` | Groups of areas that a habitat names as `group:<id>`. The import makes one per parent zone with several areas, and the user adds their own. |
| `areas/<area>.json` | An area is an original table, `ENCOUNTERS_<AREA>`, shared by the zones whose header names it. The file has its per-step rates per method (`all_year` or per season, the original tables' values) and its kind of rustling spots (`grass`, `dust`, `shadow`). |
| `species/<species>.json` | A species' levels (min gates it, max caps it), battles, hidden ability chance, habitats and outbreaks. A habitat names areas or groups. It has one slot for its listed seasons, or `by_season`, giving each season its own methods, rarity, times and weather, plus extra conditions-engine clauses (`when`). A species without a file isn't found in the wild. |

The scaled level's percent and spread are the conditions engine's, in `res/paperwhite2/level_scaling.json`: 80% of the
party's median, ±3.

The first data came from `editor/scripts/export-encounters.ts`: the editor's import of the original tables, the
game's swarms (`SWARM_DATA`) and the zone headers. Running it again needs `--force` and replaces every edit.

## The rules

They are the same in the editor (`resolve.ts`), the packer's `odds` command and the game
(`paperwhite2_encounters.c`). `editor/tests/encounters-packed.test.ts` checks that the packer and the editor agree.

**Which candidates can appear.** A candidate is one habitat in one area for one season, or for all of its seasons. It
can appear by a method when all of these hold:
- its methods include that method;
- its seasons and periods include the current ones;
- its weathers do too, if it lists any;
- the level gate reaches its minimum;
- its extra conditions hold.

**Shares and levels.**
- Each tier present takes its share, split evenly among its Pokémon there. The tiers present are rescaled to 100%.
- The level is the scaled level ±3, kept within the species' minimum and maximum.

**Rustling spots** (method `rustling`, `ENCTYPE_GRASS_SHAKING`). The spots draw on their own habitats first, then on
the area's Rare, Very rare and Exotic Pokémon found by grass and dark grass that aren't among those yet. On top of that:
- **Shaking grass** gives Audino at 30%, the rest to those Pokémon.
- **Dust clouds and bridge shadows** give the game's items at 30% (decided when the spot is stepped on), otherwise a
  battle with those Pokémon.
- **No Pokémon there:** Audino every time in shaking grass, an item every time in a dust cloud or shadow.
- The kind of spot is the tile's when stepped on, and the area's in the editor.

**Outbreaks** replace the swarms.
- One is on each day, from the day and the save's daily swarm roll, once `FLAG_SWARMS` (0x960) is set.
- Its species take 40% of its places' encounters by its methods, and the rest is scaled down.
- The gates' bulletin board names its first area's first zone.

**Battles.**
- After the first wild Pokémon is made, its single, double and triple chances may make the encounter a double or a
  triple. The partners are of its family or anything there, by the same weights.
- A double needs two Pokémon that can fight and a triple three (with two, a triple is a double). Neither happens
  while fishing. A partner (NPC) still makes every encounter a double.
- If Repel keeps a partner away, the battle takes the ones that came.

**Lead abilities, Repel and the rest** work as before. They read the slots that the candidates become:
- Magnet Pull and Static;
- Hustle, Pressure and Vital Spirit;
- Intimidate and Keen Eye;
- Repel;
- Synchronize, Cute Charm and Compound Eyes.

**No Pokémon, no encounter.** Where no candidate can appear, a step, Sweet Scent, a rod or a rustling spot gives no
encounter: no slot, no battle, "Not even a nibble". An empty slot of an original table (species 0) gives none either.

## The build

`tools/paperwhite2/encounters.py` validates the files and packs them into one member after the 135 original tables
of `a/1/2/7` (`configure.py`'s `HACK_ARCHIVE_MEMBERS`). Its docstring has the byte layout, and
`include/paperwhite2/encounters.h` has its structs.

- `encounters.py check` prints the sizes against the runtime's limits: 4 KB per area block, 64 candidates per method
  and area, 128 outbreak entries, 8 tiers.
- `encounters.py odds AREA METHOD SEASON PERIOD WEATHER SCALED [MEDIAN]` prints a place's odds from the packed member.

The original tables are still packed. A zone whose area has no file keeps its table and the original slot code, with
the species-0 guard.

## The hooks

| Where | What |
| --- | --- |
| `EventData_LoadEncData` (`src/ov012/eventdata_system.c`) | After the table: `PaperWhite2_Encounters_Load` reads the area's block, and its rates for the season replace the table's. |
| `CreateEncountManager` (`src/ov036/enc_pokeset.c`) | With the new data, dark grass doesn't roll the double battle itself. |
| `FieldEncount_PrepareActiveSlots` | `PaperWhite2_Encounters_PrepareSlots`: the candidates become the slots (up to 66), weighted by `PaperWhite2_Encounters_PickSlot`, slot function 4. |
| `FieldEncount_GenWilds` | Room for 66 slots; no slots means no encounter. |
| `FieldEncount_GenWildsCore` | A species-0 Pokémon isn't counted. The first Pokémon's battle styles may add one or two partners. |
| `EventWildBattleCall_CreateRandom`, `BtlSetup_CreateFishing`, `FieldEncount_SetupNormal` (`src/ov036/field_encount.c`) | Room for three, and the triple's battle style. |
| `BtlvScu_StartEncount` (`src/ov167/btlv_scu.c`), `GetClientAIFlags` (`src/ov167/btl_main.c`) | The wild triple's intro and AI. |
| `FieldEncount_SetupFromData` | The candidate's hidden ability chance. |
| `GetEncountIndexForPreferredType` | Room for 66 slots. |
| `getSwarmLevelRangeFromData` | The day's outbreak's zone. |
| `CreateRandomPhenomenonEvent` (`src/ov036/effect_encount.c`) | Dust clouds' and shadows' item chance; shaking grass's kind for the slots. |

Main's BSS holds a 4 KB block, the outbreaks and the slots' weights, about 7 KB in all.

## Wild triples

The battle engine's triple setup (`BtlMain_SetupAloneTriple`) works for a wild party of three. Only its intro needed
a wild version, `BtlvScu_EncountWildTriple` in `src/ov167/btlv_scu.c`: the three wild Pokémon appear as a wild double's
do, with "Oh! A wild X, Y, and Z appeared!" (`Bank0019_Text_OhWildAppearedThree`, the battle bank's message 201). The
player then sends out three as in a trainer's triple battle. The field side is in `src/ov036/field_encount.c`:
- `params[3]`;
- `FieldEncount_SetupNormal` makes `pokeCount` Pokémon, with battle style `pokeCount - 1`;
- `CreateRandom`'s Repel fallback.

A wild triple's foes get a wild double's AI flag (`GetClientAIFlags`, `btl_main.c`). The Poké Ball check already counts
the live foes, so a ball can't be thrown while more than one is up.

## To test

- **Route 20, grass, spring day, party around Lv. 30:** `encounters.py odds route_20 grass spring day WEATHER_SUNNY 24 30`
  lists what should appear and how often.
- **Shaking grass:** about a third of its battles are Audino. Dust clouds give items about a third of the time.
- **Fishing in an area with no fishing habitats:** no bite at all.
- **Outbreaks**, after `FLAG_SWARMS`: one area each day, and the bulletin board names it.
- **Doubles and triples:** Hoothoot is set to 100% triple (at night, in winter, with three Pokémon that can fight).
  Check the intro, the message, catching after two have fainted, running, and that experience goes to all three.
