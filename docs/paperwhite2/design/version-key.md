# Version Key (design, research of 2026-11-04)

The Version Key is built and shelved (`docs/paperwhite2/items.md`, Version Key; STATUS.md, 2026-11-03 late night).
This page says why it misbehaves and how to narrow it to the three places the user wants. Nothing here is built yet.
"Verified" means read in the code or the data; "inferred" means reasoned from it but not checked in game.

## What it should do

A key item that switches **only** these places between their Black 2 and White 2 forms, in game, without
restarting:

- **Route 4** (its overworld cells, its zone and its buildings),
- **Black City / White Forest** (with its gate),
- **Opelucid City** (its overworld cells, its buildings, its people's version lines).

Nothing else in Unova changes. Defeated trainers, items picked up and story progress stay as they are.

## How it works now

| Piece | Where | What it does |
| --- | --- | --- |
| State | `src/paperwhite2/main/paperwhite2_version_key.c` | The save's city key (`KeyInfo_GetCityKey`, `src/system/key_info.c:99`), shared with Unova Link |
| City | `PaperWhite2_ToggleVersion` | Flips the key and sets `CityState.city` directly |
| Zones | `CityState_ApplyVersionZones` (`src/ov012/city_state.c:5-21`) | Allows `VERSION_SPECIFIC_ZONES` (`src/system/zonedata.c:133-137`): Black City→White Forest, their gates, and (hack) Route 4→`ZONE_ROUTE_4_16` |
| Map pieces | `MapReplace_LoadVariables` (`src/ov012/map_replace.c:116-122`) | XORs the replacement version for **every** `version`/`version_season` entry |
| Scripts | `Scrcmd_GameState_GameGetVersion` (`src/ov012/scrcmd_game_state.c:45-51`), `scrcmd_msg.c:586-593` | Flip the version only in zones whose place is Opelucid City |
| Event | `src/paperwhite2/ov012/paperwhite2_version_key_event.c:44-64` | Unversioned zone → toggle → versioned zone → fade, `EventMapChange_CreateGridDefault` at the same position |

How a zone becomes the other version's (verified): the zone id itself never changes. Every header lookup goes
through `GetVersionedMapChangeZoneNum` (`zonedata.c:267-276`, used by `ZoneData_GetHeaderCore` at `zonedata.c:301`
and the getters from line 477 on), which maps `from` to `to` only while that pair is allowed. White 2 allows all
three pairs at boot (`InitZoneDataSystem`, `zonedata.c:236-240`); `CityState_ApplyVersionZones` then sets them from
the city at field start or continue (`event_mapchange.c:225-231`, `304-310`). The map matrix converts its cells' zone
ids the same way when it loads (`ProcessMapMatrix`, `src/ov012/map_matrix.c:115-121`). The mapping is one-way: a
**raw** `ZONE_ROUTE_4_16` always reads White 2's header, whatever the key says.

## The textures

### Cause (verified in code and data)

The field's map textures are one texture set per field, picked once, when the field opens:

1. `Field_Create` (`src/ov036/fieldmap.c:250-279`) takes the player's zone, asks `ZoneData_GetAreaID`
   (`zonedata.c:330-348`) for its area and loads that area's `AreaData`.
2. `SetupLoadZoneMapTypeData` (`fieldmap.c:1647-1662`) puts the area's texture set in the mapper's config, and
   `FieldG3DMapper_LoadMapTextures` (`src/ov036/field_g3d_mapper.c:288-305`) uploads it; every chunk binds to it.
3. Walking into another zone of the same matrix (`Field_SwapZoneByMatrix`, `fieldmap.c:1188-1226`) reloads the
   zone's events, BGM, weather and camera, **not** the area or the textures.

Route 4's two versions use different areas, and their chunks need their own area's textures. Checked by matching
each chunk's `model.glb` texture names against the texture-set folders in `res/field/maps/textures/`:

| Chunk (Route 4 cell) | Black 2's set (area 22, `SHARED_DANSA01A_17`) | White 2's set (area 250, `ROUTE_4_16`) |
| --- | --- | --- |
| `OVERWORLD_2_MAP13_17` (Black 2's) | all 26 | 10 missing (`r04_b_ka*`, `r04_b_lamp*`, `r04_b_yu*`) |
| `OVERWORLD_2_MAP12_18` (Black 2's) | all 20 | 4 missing |
| `WHITE12_16` (White 2's) | 6 missing (`out63_*`, `sabaku02`) | all 24 |
| `WHITE13_17` (White 2's) | 9 missing | all 16 |

`route_4.json` names `AREA_DESERT_RESORT` (22), `route_4_16.json` `AREA_ROUTE_4_16` (250). So the textures are white
whenever the field opens with one version's Route 4 header while the matrix shows the other version's chunks. A
battle closes and reopens the field, and by then the player's zone is the right one, so the right set loads.

That mismatch happens in four ways:

- **Gate and Join Avenue warps (the main cause of "on zone entry").** Castelia Gate and Join Avenue each have two
  warps to Route 4, one to `ZONE_ROUTE_4` and one to `ZONE_ROUTE_4_16` (`res/field/events/castelia_gate.json`,
  `join_avenue.json`). Their zone scripts move the version's warp onto the exit with `GameGetVersion`
  (`res/field/scripts/castelia_gate.s:18-31`, `join_avenue.s:139-153`). The hook flips `GameGetVersion` only in
  Opelucid, so in the Black 2 form these gates still send the player to raw `ZONE_ROUTE_4_16`: White 2's header,
  area 250 and White 2's NPCs, over Black 2's chunks. The first step then swaps the zone to the matrix's
  `ZONE_ROUTE_4` (`Field_ShouldSwapZone`, `fieldmap.c:1171-1185`), which loads Black 2's people but keeps the white
  textures until a battle reopens the field. The same holds for White 2's Route 4 buildings
  (`route_4_11`-`route_4_15` warp to `ZONE_ROUTE_4_16`).
- **The Desert Resort.** Its cells are on the overworld matrix next to Route 4's (cells 11-12,15). White 2 forces its
  area to 250, Route 4's (`zonedata.c:342-346`, `AREA_DESERT_RESORT_WHITE2`), so that walking from there into
  Route 4 keeps the right set. In the Black 2 form the field opened in the Desert Resort still uses 250, and Black 2's
  Route 4 chunks next door lack 10 of their textures.
- **Nimbasa City (to test).** Nimbasa's cells touch Route 4's (12-13,14). Its set has all of White 2's
  `WHITE13_15` but lacks 6 of Black 2's `OVERWORLD_2_MAP13_15` (`r04_b_*`). Whether that edge is on screen is a
  test. Vanilla White 2 tolerates similar gaps (Route 9's set misses three of White 2's Opelucid textures), so
  some seams may never show.
- **Opelucid while frozen.** `FieldMapControl_LoadZone` (`src/ov035/event_mapchange.c:1629-1635`) allows the
  frozen areas only for `VERSION_AREA_OWN` (`include/field/zone.h:187-190`, the build's version) once map-replace
  event 0 (work 0x4031 = 0x1220, the freeze) is set: area 50 → 270 (White 2's frozen set). The key's Black 2 chunks
  become `FREEZEB_*` (entries 50-53 of `replacements.json`), which need 266's `SHARED_DANSA01A_229` (`FREEZEB_00_00`
  misses 6 textures in 233). Outside the freeze Opelucid is fine: its one set (`OPELUCID_CITY`) has both versions'
  chunk textures, and so do the swapped interiors (`M_WBUILL01` in `SHARED_CHIP_COUNTER_15`, `M_OLDWBUILL01` in
  `OPELUCID_CITY_12`).

Not explained: white textures right after the swap itself, in place on Route 4. The event's path resolves the right
zone (`ROUTE_4_16` → `ROUTE_4` → Black 2's area), so in theory it loads the right set. Likely the swap was made
after arriving through a gate (raw `ROUTE_4_16` until the first step), or the player then walked toward the Desert
Resort or Nimbasa. A test after the fixes below settles it.

### Fix

1. **Make the zone pair resolve both ways in the hack** (`GetVersionedMapChangeZoneNum`, `zonedata.c:267`): while a
   pair is not allowed, map `to` back to `from`. A raw `ZONE_ROUTE_4_16` then reads Black 2's header in the Black 2
   form: gates, buildings, Fly, a continue and the Escape Rope all land in the right version. About 10 lines.
2. **Normalize the spawn zone** where a map change and a continue load it (`event_mapchange.c:243`, `327`, `335`,
   `570`) with `GetVersionedMapChangeZoneNum2(PaperWhite2_GetUnversionedZone(zone))`. The player's zone then
   matches the matrix's, so the first step doesn't swap zones again (that swap would delete and respawn the NPCs).
   About 10 lines.
3. **Tie the Desert Resort's area to Route 4's version:** apply `AREA_DESERT_RESORT_WHITE2` only while the Route 4
   pair is allowed (`allowVersionSpecificZone[2]`). This keeps vanilla White 2's behavior. About 3 lines.
4. **Pick the frozen area by the key:** in `FieldMapControl_LoadZone`, allow `VERSION_AREA_BLACK2` or
   `VERSION_AREA_WHITE2` by `PaperWhite2_IsBlackVersionWorld`. About 5 lines.
5. **Nimbasa, only if the test shows it:** add the six `r04_b_*` textures to `nimbasa_city`'s set through the texture
   imports (`res/field/maps/textures/texture_imports.schema.json`), within its VRAM.

## Trainers and other state

### How a trainer's defeat is kept (verified)

- One saved event flag per trainer ID, global and not tied to a zone: `TrainerFlagGet`, `setTrainerBattleFlag` use
  flag `0x5f0 + trainerId` (`src/ov012/trainer_script.c:47-57`). Scripts 3000-4999 are a trainer (ID = script −
  3000) and 5000-6999 the second of a pair (ID = script − 5000) (`GetNPCTrainerIDFromSCRID`, `trainer_script.c:20-25`).
  The global script sets the flag after the battle (`res/field/scripts/global_3000.s`, `TrainerFlagSet` after
  `CallTrainerBattle`), and the sight check reads it (`CheckTrainerAlreadyDefeated`,
  `src/ov036/event_trainer_eye.c:572-584`).
- The only automatic resets: map-local flags 0-0x63 and works 0x4000-0x401f (`FieldScript_ResetMapLocalEvents`,
  `src/ov012/script_sys.c:402-405`), the temporary flags from 0x4000 (`src/system/event_work.c`), and 12 "rebattle"
  trainers on every zone change (`resetRebattleTrainers`, `trainer_script.c:9-11` and `60-68`).
- Black 2's Route 4 trainers are 210-212, 214-218, 220, 284 and 296; White 2's are 210, 211, 213, 221-226, 147 and
  296 (`res/field/events/route_4.json`, `route_4_16.json`). The shared IDs share a flag, the rest keep their own. So
  the two versions already keep their own defeats, with no change needed.

### Why a Route 4 trainer battles again (solved, 2026-11-04)

The trainer the user found battling on every visit is Pokémon Breeder Irene (296, NPC 11 of Black 2's Route 4 and NPC
2 of White 2's), one of the game's 12 re-battle trainers: every map change resets their defeat flags
(`resetRebattleTrainers`, `src/ov012/trainer_script.c`, from `event_mapchange.c` and `fieldmap.c`), as the original
game does. The debug menu's flag watch showed flag 1816 cleared after the map change's events, alone, in both
versions' Route 4; the Fisherman (1730) and the Backpacker (1733) kept theirs. The list is the Pokémon Breeders Owen,
Brooke, Irene, Galen, Marcus, Magnolia, Addison and April, and the Black Tower's bosses Abigail, Abed, Brent and Bess.
The editors now say so for these trainers (Overworld Editor, Script Editor). Nothing for the Version Key to fix.

What the earlier research wrote about script 5220 (Hooligans Rob & Sal), kept in case it shows again:


Script 5220 is the second Hooligan of `TRAINER_HOOLIGANS_ROB_SAL` (ID 220, flag 0x6CC = 1740), a double battle in the
data (`res/trainers/data/hooligans_rob_sal.json`). Nothing in the C or the scripts clears 0x6CC: it isn't a rebattle
trainer, and no script runs `TrainerFlagReset`. **The cause isn't found in the code.** Leads, in order:

- **The mixed zone after a gate** (above): the player arrives with White 2's header and NPCs. The swap on the first
  step reloads Black 2's. Something in that path may run the encounter again. Fixes 1 and 2 remove the mixed state.
- **A different trainer:** Pokémon Breeder Irene (296, both versions' Route 4) is a rebattle trainer by design and
  battles on every visit (`0x128` in `sRebattleTrainers`).
- **Test:** beat the pair, then read flag 1740 with the debug menu's flag viewer, leave through Castelia Gate and come
  back. If the flag is still set and they battle again, the sight check reads a different ID, and the next step is
  tracing `TrainerEyeGetTrainerID`.

### Other state per place

| State | How it's kept (verified) | With the key |
| --- | --- | --- |
| Item balls | Per-NPC flag in the events file; Route 4's 7047, 7048 and 7053 are in both versions with the same flag and item; 7049 (0x47d) is Black 2's only, 7050 (0x47e) White 2's only | Shared where the item is shared, separate otherwise: fine |
| Hidden items | Flag `0xb04 + index` per item (`include/field/hidden_item.h:24`), each item with its own zone | Fine; but the Dowsing Machine skips "the other Route 4" by build (`ZONE_OTHER_ROUTE_4`, `src/ov086/dowsing.c:43-49`, `497`), so in the Black 2 form it skips Black 2's items and shows White 2's |
| Story flags on Route 4 | 0x2f5, 0x2f6, 0x3dc, 0x386 in both events files | Shared, same story: fine |
| Map scripts on entry | Each header's init script (`init_route_4.s`, `init_route_4_16.s`) | Follows the header once fix 1 is in |
| Encounters, weather, battle background | From the versioned header (`ENCOUNTERS_ROUTE_4` / `_4_2`, weather 0 / 3) at each zone load; the hack's tables go through `GetZoneEncID` (`paperwhite2_encounters.c:76`) | Follow the header |
| Black City / White Forest | Only `CityState`; B2W2 keeps no residents data (`src/ov036/field_wfbc.c`: the loaders are empty) | Nothing to sync |
| Black Tower / White Treehollow | `KeyDataSave` (`getKeyDataBlkAddress`): floor, trainers beaten per floor | Inferred one block for both, so progress carries over |
| Opelucid's people | One zone and events file; the lines and choices differ by `GameGetVersion`/`ActorMsgVersioned` in `opelucid_city*.s` and its Pokémon Center, which the hook flips | Fine; the Opelucid Gate zones (`PLACE_OPELUCID_GATE`, `opelucid_gate.s:22`, `48`) aren't flipped yet |
| Opelucid's freeze (Kyurem) | Map-replace event 0 picks the frozen chunks of either version (entries 50-57) and the frozen areas | Fix 4 |
| Drayden, Iris | Inferred no version difference in B2W2 (both versions have Drayden's gym) | Not checked |

## The keys

- **What the city key is (verified):** `KeyInfoSave.city`, XORed with the save's seed (`include/save/key_info.h:16-24`).
  Unova Link sets it in the start menu's key screen (`KeySystemKeySelect_SelectCity`,
  `src/ov332/key_system_flow_sub.c:394-419`). Switching to the other city needs the key unlocked (`keyEnabler`). It's
  refused when the save stands in or next to the city, its Tower or Treehollow, or their lobby (`KEY_SELECT_IN_AREA`,
  lines 403-409).
- **When it takes effect (verified):** at the next field start or continue, through `CityState_InitFromSave` and
  `CityState_ApplyVersionZones` (`event_mapchange.c:1843-1857`, `225-231`, `304-310`). Other readers ask the key
  every time: the respawn point (`GetReturnLocationIdx`, `src/system/game_data.c:349-366`), the town map's zone for
  the city (`src/ov012/townmap_util.c:42-52`) and the start menu's key icon.
- **The item** writes the same value without the unlock check, sets `CityState.city` itself and calls
  `CityState_ApplyVersionZones`, so the switch counts at once. Unova Link and the item always agree. That cuts both
  ways: a switch in Unova Link now moves Route 4 and Opelucid too. Saved on Route 4, the game would continue in the
  other version's Route 4 on the same tile, since Unova Link checks only the city's zones.
- **Other keys:** difficulty (`GetGameDifficulty`, levels through `adjustPkmLvForChallengeKeys`), the chamber key
  (the mystery door) and the Tower/Treehollow level don't touch these places.
- **What's computed when (verified):**

| State | Computed | Follows a switch |
| --- | --- | --- |
| Zone pairs allowed | Boot, then field start or continue; the item calls it again | At once |
| `CityState.city` | Field start or continue; the item sets it | At once |
| Matrix cells' zones | Every matrix load (each map change) | Next map change |
| Map replacements | `MapMatrix_Patch` at each map change (`FieldMapControl_LoadZone`) | Next map change |
| Frozen areas allowed | Each `FieldMapControl_LoadZone` | Next map change (with fix 4) |
| Zone header cache | Keyed by the resolved zone (`zonedata.c:297-311`) | Always right |
| Area and textures | Each field open (map change, battle, app) | Next field open |
| Town map, respawn, Fly to the city | Read the key when used | At once |

So a switch needs one map change (or a field reopen) to show. The item's reload does that.

## Scoping to the three places

What switches more than the three places now (verified):

- **Mistralton City.** `replacements.json` entries 19-22 and 34-37 (`MAP02_08`-`02_10`, `03_09` → `WHITE*`) are
  Mistralton City's cells (the matrix's zones for those cells, `res/field/matrices/overworld.json`), not "the area
  round Black City and White Forest" as items.md says. Black City and White Forest have their own matrices.
- **Driftveil City's market.** Entry 45 (`version_season`, `DRIFTVEIL_CITY_7` → `M_MARKET02`-`05`).
- **The Dowsing Machine** on Route 4 (above).

How to scope it: decide each replacement by **the place it stands in**, not by a global version. Remove the
global XOR in `MapReplace_LoadVariables`, keep the build's version there, and add a hack flag "switched" to
`MapReplaceVariables`. In `MapReplace_Patch` (`src/ov012/map_matrix.c:60-80`), for a `version` entry:

- A chunk entry swaps each cell by the switched version if that cell's zone (`matrix->zoneIds[i]`) is one of the
  three places, otherwise by the build's.
- A matrix entry (Opelucid's interiors) does the same by `matrix->zoneId`.

One predicate, `PaperWhite2_VersionKeyCoversZone(zone)`, serves this, the scripts' hook and the item: its place is
Route 4, Opelucid City (both place ids) or Black City / White Forest (with their gates and lobby). Mistralton and the
market keep White 2's pieces. About 40 lines. The Opelucid Gate's lines can join the scripts' hook through the same
predicate.

## Where it can be used

The reload keeps the player's tile, and the other version can have a wall or a building there (tested on Route 4).
Options:

| Option | Safe | Cost | Feel |
| --- | --- | --- | --- |
| A. Refuse in the three places and their buildings, gates and lobby, as Unova Link does; elsewhere switch without moving the player | Yes | Small | "The key won't turn here." Switch outside, then walk in |
| B. In those places, warp to a fixed safe spot per place (Route 4: the Castelia Gate exit; Opelucid: the Pokémon Center door; the city: its gate) | Yes, if the spots are checked in both versions | Medium: a table of spots and a warp event | Works anywhere, with a short warp |
| C. Allow only on tiles free in both versions | Needs both versions' collision at runtime | Large | Unclear to the player |
| D. Switch the state now and show it at the next zone entry, with no reload | Yes outside; inside the places the next map change rebuilds them under the player | Small | Delayed, confusing inside |

Recommended: **A**, with B as a later upgrade. Outside the places:

- **On the overworld matrix** (Desert Resort, Nimbasa City, Route 9, Route 11 and the rest), reload in place as now:
  the tile is the same in both versions, since only the three places' chunks change, and the reload re-patches the
  cells in view.
- **On any other matrix,** only switch the state: the next map change shows it.

Unova Link's key screen gets the same zone list in its `KEY_SELECT_IN_AREA` check (`key_system_flow_sub.c:406`), so a
save on Route 4 or in Opelucid can't continue inside a wall.

## The plan

| # | Change | Files, functions | Size | Basis |
| --- | --- | --- | --- | --- |
| 1 | Zone pairs resolve both ways in the hack | `src/system/zonedata.c` `GetVersionedMapChangeZoneNum` | ~10 | Verified path; effect inferred |
| 2 | Normalize spawn zones on map change and continue | `src/ov035/event_mapchange.c` lines 243, 327, 335, 570 | ~10 | Verified path |
| 3 | Desert Resort's area follows Route 4's pair | `zonedata.c:342-346` | ~3 | Verified data |
| 4 | Frozen areas follow the key | `event_mapchange.c:1629-1635` | ~5 | Verified |
| 5 | `PaperWhite2_VersionKeyCoversZone`, by place | `src/paperwhite2/main/paperwhite2_version_key.c`, `include/paperwhite2/version_key.h` | ~25 | — |
| 6 | Map replacements by place; drop the global XOR | `src/ov012/map_replace.c` `MapReplace_LoadVariables`, `src/ov012/map_matrix.c` `MapReplace_Patch`, `MapReplaceVariables` | ~40 | Verified data |
| 7 | Scripts' hook through the predicate, Opelucid Gate added | `paperwhite2_version_key.c` `PaperWhite2_ScriptSeesOtherVersion` | ~5 | Verified |
| 8 | Dowsing's other Route 4 by the key | `src/ov086/dowsing.c:43-49`, `497` | ~5 | Verified |
| 9 | Where it works: refuse in the places, reload on the overworld, else switch only | `src/paperwhite2/ov012/paperwhite2_version_key_event.c` `VersionKey_CanReload` and case 0; script 2822's text | ~40 | — |
| 10 | Unova Link refuses in the places too | `src/ov332/key_system_flow_sub.c:406` | ~5 | Verified |
| 11 | Docs: items.md (Mistralton, the causes), STATUS.md | — | — | — |
| 12 | If the Nimbasa seam shows: six textures into Nimbasa's set | `res/field/maps/textures/nimbasa_city` via imports | data | Test first |

All the files hooked are complete in `delinks.txt`. Build with `python3 configure.py w2_us --hack && ninja`, then
`tools/build/verify_dsi_rom.py`. Items 1 to 4 are the texture fix and can ship alone for a first test.

**Tests in RetroArch** (with a save in the Black 2 form):

1. Enter Route 4 from Castelia Gate, from Join Avenue and from the Desert Resort: textures right at once, and
   Black 2's people there before the first step.
2. Stand at the Nimbasa side and look south: any white at the seam (item 12)?
3. Beat the Hooligans (220), check flag 1740, leave and come back.
4. Use the key in Mistralton and Driftveil: they don't change. On Route 4 and in Opelucid: refused. On Route 5: the
   switch, with no visible change.
5. Opelucid during the freeze, if a save has it.
6. Unova Link's key screen with a save on Route 4: refused.

## The user's decisions (2026-11-04)

- **Its own state, not Unova Link's keys.** The swap no longer reads or sets the city key (`KeyInfo_GetCityKey`);
  it is a hack flag of its own, and the Black City / White Forest choice follows it. What Unova Link's key screen
  does with the city key then (hide its city key, or leave it doing nothing) is to decide when it's built.
- **What swaps: every place whose maps are largely different between the versions.** From `replacements.json`'s
  `version` and `version_season` entries (each entry's cells looked up in its matrix):

  | Entries | Place |
  | --- | --- |
  | 19-22 | Mistralton City |
  | 34-37 | Mistralton City's gate |
  | 23-26 | Opelucid City |
  | 38-41 | Opelucid City's gate |
  | 42, 43, 44 | Opelucid's interiors `opelucid_city_2`, `_3`, `_12` (matrix replacements) |
  | 27-33 | Route 4 |
  | 45 | Driftveil City's market (`driftveil_city_7`, matrix replacement) |

  plus Black City / White Forest (zones of their own), and **Reversal Mountain** (below). **Driftveil's market is
  left out** (entry 45: the user found nothing on it differing), and so are the small layout changes elsewhere, such
  as Victory Road's.
- **Reversal Mountain** has no map pieces by version: each version has its own cave, as Route 4 has its own zone.
  Black 2's is `reversal_mountain_2` to `_7` (`AREA_REVERSAL_MOUNTAIN_2`), White 2's `reversal_mountain_8` to `_13`
  (`AREA_REVERSAL_MOUNTAIN_8`). The ways in choose by `GameGetVersion`, moving the other version's warps off their
  doorways as Castelia Gate does: the mountain's outside (`reversal_mountain.s`, level script: Black 2 keeps warps 0,
  2 and 4, to zones 2 and 6; White 2 warps 1, 3 and 5, to 8 and 12) and Undella Town (`undella_town.s`: warp 5 to
  zone 7, or 6 to 13). The swap is those two scripts reading the flag. The new encounter tables already have both
  caves' zones; their trainers' defeats are their own trainer IDs' flags.
- **The gates' warps follow the flag**: Castelia Gate's and Join Avenue's level scripts choose Route 4's warp with
  `GameGetVersion` (Black 2's gate activates warp 1, `ZONE_ROUTE_4`; White 2's warp 2, `ZONE_ROUTE_4_16`: the script
  moves the other warp off the doorway, to tile 9, 11, `SetZoneWarpLocation`); they're to read the new flag.
- **The key refuses inside the affected places** (option A of "Where it can be used").
- **Being considered: the Pokémon Centers' globe instead of a key item.** The globe already opens the Season app in
  hack builds (`src/paperwhite2/ov312/paperwhite2_season_app.c`, plugins.md, Season app); a "Set Version" entry
  beside Set Season, Dynamic Options and Set Hemisphere would switch the flag there. Inside a Pokémon Center nothing
  has to reload in place: the next map change (walking out) loads the outside as the flag now says, so the tile
  problem of "Where it can be used" goes away, and Castelia Gate's, Undella Town's and Reversal Mountain's level
  scripts run again on entry. It still needs refusing where the Center's own outside changes: Opelucid City (its
  buildings move between versions, so the door the player walks out of may not be where the other version's is)
  and Black City / White Forest (the Center's exit names Black City, which the other version plays as White Forest).
  What's left of the item (its icon, bag and Y) would go.
- **The Desert Resort** isn't part of Route 4 in the user's view; to be tested (its texture set still has to match
  the Route 4 cells beside it).
- **Opelucid's people** change their dialogue with the swap.
- **Investigating the 5220 re-battle:** the Overworld Editor shows each version's Route 4 (White 2 | Black 2 switch
  over the map): `route_4` with Black 2's map pieces (the replacements' first value), its NPCs and its texture set,
  `route_4_16` with White 2's, so the user can compare the NPCs with the debug menu.

## Each place on its own (the user's idea, 2026-11-04)

The globe's menu can switch the places one by one, each with its own event flag, set when that place is as the
other version (Black 2) has it. The flags come from the hack's block (plugins.md, flags: 0x931 on is free).

| Place | What its flag switches |
| --- | --- |
| Route 4 | its zone pair (`ZONE_ROUTE_4` / `ROUTE_4_16`, `VERSION_SPECIFIC_ZONES`' third), its replacements 27-33, Castelia Gate's and Join Avenue's warp choice, the Dowsing Machine's other-Route-4 check, and the Desert Resort's texture set (the area White 2 forces, zonedata.c:342-346, has to match the Route 4 cells beside it) |
| Reversal Mountain | the warp choice of the mountain's outside and Undella Town (which cave) |
| Mistralton City | its replacements 19-22 and the gate's 34-37 |
| Opelucid City | its replacements 23-26, the gate's 38-41 and the interiors' 42-44, its areas (`VERSION_SPECIFIC_AREAS`, the Kyurem freeze's included), and its people's version checks (`GameGetVersion` and `ActorMsgVersioned` in its zones) |
| Black City / White Forest | `CityState` and the first two zone pairs, the town map's city |

How the parts read them:

- **The C** asks one function, `PaperWhite2_PlaceIsOtherVersion(place)`, in place of the one switch the shelved key
  had: `MapReplace_LoadVariables`' single `version` becomes a per-entry choice (each version replacement's place, a
  small table by entry, or the place of the cell, as the plan's step 4 has it), `CityState_ApplyVersionZones` takes
  each pair's place, and `GameGetVersion`'s hook asks the place of the zone the script runs in.
- **The scripts** that choose a warp read the place's flag directly (`if (flag(...) == 1)`) in place of
  `GameGetVersion`, so no new command is needed and they stay editable in the script language; only those lines
  change, since Undella Town's and the gates' other version checks (if any) shouldn't follow the place.
- **The menu**: a page of the places, each Black 2 or White 2, and "All". A place's row is refused (greyed) while the
  player is in that place's own Pokémon Center (Opelucid's, Black City's): the door outside may move.

What it costs over one flag: little. The per-place work (the replacements by place, the zone pairs, the areas) is in
the plan already; the flags add a table of places and a menu page.

What the user should know about mixing:

- **Black City / White Forest switches its facility**: Black City has the Black Tower, White Forest the White
  Treehollow. Whether their saved progress and records are shared or kept apart isn't checked yet.
- **Places are independent of each other** as far as read: each place's trainers have their own IDs (defeats are
  `0x5f0 + ID`), its items their own flags, its wild Pokémon their zones' tables. Route 4 and the Desert Resort's
  textures are the one tie found, kept by one flag.
- **Opelucid's story events** (the Kyurem freeze, map-replace event 0) run under its flag; switching it during the
  freeze is a case to test.

## Open questions for the user

1. Where it can be used: A (refuse inside the places), B (warp to a fixed spot), or something else?
2. Unova Link: the item and the Black City / White Forest key share one state, so Unova Link's key now also switches
   Route 4 and Opelucid. Keep that, or give the item its own state (a hack flag) and leave Unova Link's key for the
   city only?
3. Does the Desert Resort count as part of Route 4? Its look doesn't change, but its texture set has to follow
   Route 4's version.
4. Should the Opelucid Gate's people follow the key (their lines are version-specific)?
5. Mistralton's version pieces: leave them White 2's (the plan), or should they follow the key as a fourth place?
