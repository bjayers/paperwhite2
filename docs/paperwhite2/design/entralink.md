# The Entralink

Research for the user's decision on the Entralink, nothing changed yet. The hack has no wireless
(`GSYS_CanBootGameComm` is always FALSE, plugins.md, C-Gear) and the C-Gear's log and survey are gone. This page says
what the Entralink is in the code and data, what of it is wireless, what still works alone, and the options.

**Verified** means read in the source or data at the line given. **Inferred** means reasoned from names, text or
structure, not traced or tested. Nothing here was tried in game.

## Summary

- **The player can't reach the Entralink in the hack today** (verified, below). In White 2 the only way in is the
  C-Gear's center (the log) → the Entralink screen's Pass Power button → the Pass Power app's "Entralink" button. The
  hack removed the log touch, so the Pass Power app, Pass Powers bought with Pass Orbs and the warp in are all
  unreachable. The Pass Power *effects* are still in the code and work wherever they're read.
- **Wireless by nature:**
  - the Entree Forest's Pokémon, which only Game Sync adds;
  - the S and MAX Pass Powers, which only Global Link deliveries unlock;
  - Pass Powers from passers-by;
  - joining another player's mission.
- **Local already:**
  - the hub map, the Entree (monolith) and its menus;
  - starting a Funfest mission alone (the mission starts first, then the game tries to go on air, and that fails
    quietly);
  - the White and Black levels that missions raise, and the Pass Powers those levels unlock;
  - using an unlocked Pass Power for Pass Orbs;
  - Pass Orbs from missions and from 31 hidden items.
- **Broken by our own changes:** the sparkle and people missions have no places to use since the Funfest spots were
  removed on 2026-10-31. That includes the tutorial mission, "The First Berry Search!", which leads to the first Pass
  Power.
- **The cheapest worthwhile option:** a C-Gear button (or a Pokémon Center attendant) that opens the original Pass Power
  app. That app already has both "use a Pass Power" and "go to the Entralink". Then decide the missions separately.

## 1. What the Entralink consists of

### Zones and maps (verified)

| Zone | ID | What |
| --- | --- | --- |
| `ZONE_ENTRALINK` | 0x117 | The hub: the Entree in the middle, 6 NPCs (`res/field/events/entralink.json`), no warps |
| `ZONE_ENTREE_FOREST` … `_9` | 0x118-0x120 | The forest's nine areas, laid out by `src/ov012/symbol_map.c` |
| 0x121-0x13c | | The Entralink versions of towns and routes, each paired with an "arrived at" flag (`src/ov036/field_palace_sys.c:23-51`) and with a weather flag (`src/system/zone_weather.c:42-48`). Inferred: the places missions and visits used in Black and White. Their names in `generated/zones.txt` are the ROM's place names |

Notes on the zones:
- **The IDs:** they come from `generated/zones.txt`. `res/field/events/order.json` is ordered differently, so don't
  look IDs up there.
- **The Entralink zones' C-Gear screen:** `IsZoneEntralinkHub` and `GetZoneIsEntreeForest`
  (`src/system/zonedata.c:574-596`) force the blank C-Gear screen there (`src/ov036/field_subscreen.c:270-273`).
- **Tints:** the zones get the Entralink tints (`TINT_10/11/13/14`, weather-editor.md).

### Getting in and out (verified)

- **The vanilla path:**
  1. **C-Gear center, the log** (`TOUCH_LOG` → `ACTION_LOG`, `src/ov079/c_gear_sw.c:1402`). That sets the C-Gear
     power request to 1 (`c_gear_sw.c:3042-3045`), and `FieldSubscreen_GetIDForChange` turns it into
     `FLD_SUBSCREEN_ID_ENTRALINK` (`field_subscreen.c:288-296`).
  2. That screen is the beacon view (`src/ov084/`). It has the passer-by log, Pass Powers received, missions on offer,
     and the Pass Power button: `BEACON_VIEW_EVENT_PASS_POWER` → `EventPassPower_Create` (overlay 14,
     `src/ov084/beacon_view_setup.c:206-213`).
  3. `EventPassPower_Callback` (`src/ov014/event_pass_power.c:73-141`) runs the Pass Power app (`src/ov328/gpower_app.c`,
     `OVERLAY_PASS_POWER_APP`). A result of `PASS_POWER_APP_USE` activates the chosen power and charges Pass Orbs. A
     result of `PASS_POWER_APP_ENTRALINK` chains `func_ov033_021773e4` (`src/ov033/entralink_warp.c:22-65`). That
     closes any connection and calls `EventEntralinkWarpIn_Create(gsys, 0x117, …)`.
  4. `EventEntralinkWarpIn_Create` (`src/ov035/event_mapchange.c:1239-1252`) saves the return spawn
     (`GameData_SetEntralinkParentSpawnInfo`). `EventEntralinkWarpIn_Callback` (`:1760-1790`) refuses with script
     0x279c unless `EventEntralinkWarpIn_CheckAllowed` (`entralink_warp.c:67-136`) passes: the zone header's
     `entralink_warp` flag, not on rails or surfing, not on a trigger, not on an NPC. With a partner it uses script
     0x27a1. Otherwise it plays 0x279a, waits for `GameCommSys_BootCheck` to say no connection, and warps.
- **Other entries:**
  - `FIELD_COMMON_EVENT_ENTRALINK` (`src/ov012/itemuse_event.c:63,230-237`) warps in from the bag's result 13
    (`src/ov012/event_field_proclink.c:682-684`). No `ItemMenu_UseInField` call in `src/ov142/itemmenu.c` gives 13,
    so this is a dead path.
  - No script warps into `ZONE_ENTRALINK` (grep of `res/field/scripts`).
  - During a mission, the Funfest screen (`src/ov085/fmission_view_setup.c:219-256`) also opens the Pass Power app.
- **Out:** the hub's NPC asks Yes/No and runs `CallEntralinkWarpOut` (`res/field/scripts/entralink.s:512-518`,
  `src/ov033/scrcmd_funfest.c:212-217`). That goes back to the saved spawn (`EventEntralinkWarp_CreateOut`,
  `event_mapchange.c:1254`).
- **The forest:** you enter it by walking off the hub's top edge
  (`CheckEntralinkForestFirstWarpEvent`, `src/ov033/entree_forest_first_warp.c:14-42`, called from
  `src/ov036/fieldmap_event.c:429`).

**In the hack (verified):**
- `CGearSw_UpdateTouch` returns early for `TOUCH_RADAR` and `TOUCH_LOG` (`c_gear_sw.c:1358-1362`, "the survey and the
  log are gone").
- The beacon view, and with it the Pass Power app, can't be opened.
- The Funfest screen only shows during a mission, which starts inside the Entralink.
- **So nothing reaches `EventEntralinkWarpIn_Create`.** The Entralink, the Entree Forest, the Funfest missions and the
  Pass Power app are dead content. The code is still built.

### The Entree (verified)

- **The Entree is a bg event:** `entralink.json` bg_events, script 4. `entralink.s:34-93` shows "Checked your
  Entree", then `CallMonolith` (`src/ov012/scrcmd_proc.c:260`, overlay 143). Afterwards, `IsFestMissionAvailable`
  says whether a mission was picked, and if so it runs `FunfestMissionStart`.
- **The monolith's screens:** `src/ov143/`: top, status, record, mission select and info, Pass Power select and info.
- **Picking a mission:** `MonolithMission` (`src/ov143/monolith_mission_select.c:606-643`) picks the mission and calls
  `LinkFestival_StartMission(festival, &mission, 0)` at once. Only then does it try to go on air
  (`MONOLITH_MISSION_SEQ_BOOT_COMM` → `GSYS_TryBootGameComm`), which in the hack does nothing.
- **Which missions are listed:** by version, `header.unk01`: 0 both, 1 White 2, 2 Black 2, 4-7 "need a download"
  (`monolith_mission_select.c:99-105`). A nine-key cheat code unlocks the highest level.
- **The tutorial:** the hub's first visit is a tutorial on `EVENT_WORK_0x404d`, values 0-5 (`entralink.json`
  init_scripts and `entralink.s`). The first mission is "The First Berry Search!" ("Cities and routes have places that
  glow", `entralink.s:93`). Clearing it gets a Pass Power from the Entree. Failing it gives 10 Pass Orbs
  (`entralink.s:203-212`).

### Funfest missions

- **Data (verified):** 55 missions (`FEST_MISSION_COUNT`, `include/field/fest_mission_data.h:66`) in archive 0x121.
  Their names are in `res/text/system/get_text_file_for_fest_missions.txt`. Each has 3 levels, plus a 4th by cheat.
- **The kinds that run on the field** (`fest_mission_data.h:27-33`; `src/ov036/fes_gimmick.c` loads each kind's
  overlay):

| Kind | Overlay | Example titles (inferred mapping) | In the hack |
| --- | --- | --- | --- |
| `MISSION_SPARKLE` (4) | 71 | Berry searches, Shards, Ores, Lost Items, Mulch, Hearts | **No places**: the condition-4/5 proxies were removed (STATUS 2026-10-31), so `PickPlaces` fails and nothing shows |
| `MISSION_PEOPLE` (5) | 25 | Lost Boys, Martial Artists, Trainers, Trade-Up, Trading, Shopping, Prices, Memory, Rock-Paper-Scissors, Quizzes, Pokémon Center Women | **No places**, same reason |
| `MISSION_HOLLOW` (3) | 26 | Hidden Grottoes (Search, Noisy, Quiet) | Should work (inferred: uses the grottoes, which the hack keeps) |
| `MISSION_FLAGS` (2) | 72 | Ring the Bell, Mushrooms' Hide-and-Seek, Wings on the Drawbridge, Rustling Grass (inferred) | Should work (inferred) |
| 0, 1, 6, 7 (no field overlay) | — | Find Pokémon, Find Hoenn Pokémon, Battle Pokémon, Fishing, Take a Walk with Eggs, Endless Battles (inferred: what the player catches, battles or hatches) | Should work (inferred) |

- **Solo play** (verified for the start path, inferred for the rest):
  - Starting from your own Entree sets `joined = 0` and starts the timer (`src/ov033/event_funfest_mission.c:17-89`).
    The mission then plays in the player's own Unova after `EventEntralinkWarp_CreateOut`.
  - Joining someone else's mission is the only multiplayer entry (`BEACON_VIEW_EVENT_MISSION_START`, `joined = TRUE`,
    `beacon_view_setup.c:250-260`). It needs beacons, so it's impossible here.
  - No mission in the code needs a second player: the score is the player's own (`fmission_log_accessor_fapp.c`).
    Others only add to it.
  - `CheckFunfestMissionEvent` (`fieldmap_event.c:1122-1135`) ends the mission if the C-Gear is off. The hack keeps
    it on, so that's fine.
- **Results** (verified, `src/ov309/fmission_log_accessor_fapp.c:190-230`):
  - Points raise the **White level** or **Black level** (`unk0_31`, each mission is one or the other, up to 999).
    Each level costs `(level + 1) * 5` points, at most 50, and at most 10 levels a mission.
  - Missions give item rewards (`result->item`, `item2`) and medals.
- **Already in the docs:** trainer-scaling.md says Funfest battles scale and add the mission's levels; plugins.md says
  "the Entralink is to be reworked".

### Pass Powers (verified)

- **The table:** 64 IDs (`PASS_POWER_MAX` 0x40, `include/save/high_link.h`), with names in
  `res/text/system/pass_powers.txt`. There are 16 effects: Encounter up/down, Hatching, Befriending, Bargain, HP and
  PP Restoring, Exp. up/down, Prize Money, Capture, Exploring, Grotto, Lucky and Full Recovery. Each entry has two
  unlock levels (White and Black), a price in Pass Orbs and a duration in minutes (`PassPowerData`, `high_link.h`).
- **Unlocking:** `CheckPassPowerUnlocked` (`src/ov012/pass_power_check.c:17-50`) wants both levels met. Within 3
  levels of one, it shows as "near".
- **The special powers** (S and MAX, `PASS_POWER_SPECIAL`) need a flag that only `src/ov033/pdw_postman.c:561`
  sets, from a Global Link or Mystery Gift delivery. That's wireless.
- **Equipping:** the monolith's Pass Power select puts up to 3 unlocked powers in the save's slots
  (`src/ov143/monolith_power_select.c:466,1142`, `HighLinkSave_SetPassPower`).
- **Using one:** `EventPassPowerActivate_Create` (`src/ov156/field_pass_power.c:67-106`) activates it (one power per
  effect at a time).
  - From your own slots (`params[1]` TRUE, the Pass Power app) it costs its price in Pass Orbs (`ITEM_PASS_ORB`,
    `:97-100`) and broadcasts.
  - From a passer-by (`params[1]` FALSE, the beacon view) it's free.
- **The effects:** they're read where they act, with no connection involved. The readers are `enc_pokeset.c`,
  `field_encount.c`, `effect_encount.c`, `hidden_hollow_generate.c`, `fldeff_cut.c`, `scrcmd_shop.c`, `btl_main.c`,
  `btl_server_flow_sub.c`, `poke_friendship.c` and `system/main.c` (the timers).
- **Pass Orbs:** the Entralink's tutorial and mission rewards, plus 31 hidden items
  (`res/field/scripts/global_8000.s`, `WorkSet 0x8000, 575`). Inferred in vanilla: passers-by and Join Avenue shops.

### The Entree Forest (verified)

- **Its Pokémon:** they're kept in save block 0x3c, `AreaNPCSave` (`include/save/symbol_save.h`): 530 slots in four
  kinds (kept or free, large or small). The only code that adds one is **Game Sync** (`src/ov199/gsync_state.c:974`,
  `SymbolSave_AddPokemon`, from Dream World data). So an offline save's forest is empty.
- **How it grows:** by `deepestArea` and a group (`SymbolMap_GetMapLevels`, `src/ov012/symbol_map.c:366-383`).
  There are 9 areas, 20 Pokémon an area, and trees by season.
- **How they appear:** `EntreeForest_SpawnAllPokemon` (`src/ov033/entree_forest.c:122-166`) puts walking overworld
  actors on fixed spots per area.
- **Talking to one** starts a battle (`Scrcmd_EntreeForest_EntreeForestStartBattle`,
  `src/ov012/scrcmd_entree_forest.c:74-91`) with a Dream Ball given and taken back (`:287,317`).
- **The Pokémon itself:** `EntreeForest_CreateSymbolMon` (`entree_forest.c:98-120`) makes it with
  - **always the hidden ability** (`PokeParty_SetHiddenAbil`);
  - **never shiny** (`PID_RARE_NEVER`);
  - a level by species from archive 0xdf;
  - its form and an optional extra move.
- **The forest as an engine:** it's a complete "visible, catchable hidden-ability Pokémon" system. Only its source of
  Pokémon is wireless.

### The Join Avenue link (verified)

- **No direct link.** join-avenue.md lists every caller of `JoinAvenue_Add` and `JoinAvenue_AddStepwise`, and none is
  in the Entralink or the Funfest code.
- **Indirect:** inferred, passers-by met through the Entralink's beacons came to the avenue (`game_beacon.c`), which
  the hack has already lost.

## 2. Wireless or local

| Part | Status |
| --- | --- |
| Getting in | Local code (the warp); the only button to it is gone with the log. Needs a new button or attendant |
| Hub map, Entree, monolith menus | Local |
| Tutorial mission (First Berry Search, sparkle) | Broken locally: no sparkle places since 2026-10-31 |
| Solo missions: hollow, flags, catch, battle, hatch, fish | Local (inferred to work; untested) |
| Solo missions: sparkle, people (about 35 of 55) | Need places again (restore the proxies, or place them with the NPC spawn system, STATUS 2026-10-31's to-do) or must be dropped from the list |
| Joining others' missions, others joining yours | Wireless |
| White and Black levels, Pass Power unlocks | Local (from missions) |
| Pass Powers bought with Pass Orbs | Local; needs a way to open the Pass Power app |
| S and MAX Pass Powers | Wireless (Global Link); could be unlocked locally by a script setting the special flags |
| Pass Powers from passers-by | Wireless |
| Entree Forest's Pokémon | Wireless source (Game Sync); the forest's display, battles and save are local |
| Entralink worlds 0x121-0x13c | Inferred: for visits to other games; nothing local uses them |

## 3. Options

Effort is a rough guide: S is a day or less, M a few days, L a week or more.

**(a) Keep the Entralink as a local hub.** Value: high, since it's the hack's only "boost" system and has a whole
area. It's close to vanilla, which the user prefers (memory: stay close to vanilla). It splits into parts that can be
done one at a time, in the memory's "feature by feature" approach:
1. **A way in (S).** Open `EventPassPower_Create` (overlay 14) from a C-Gear button: a sixth marker, or a
   bottom-left button (cgear.md, question 3). `PaperWhite2_CGearEvent` already opens apps from markers. That one call
   gives "use a Pass Power" and "Entralink" together, exactly as the original app laid them out. Inferred: the app has
   no wireless dependency (it reads the bag and `HighLinkSave`).
2. **Fix the tutorial (S-M).** Make the first mission a kind that works (a hollow, flags or catch mission), or give the
   sparkle missions places again (below). Otherwise a new player can't get past the Entree's first step.
3. **Solo missions (S for pruning, M-L for restoring).**
   - **Pruning:** hide the sparkle and people missions in `MonolithMission`'s list (the same check as
     `MONOLITH_MISSION_UNLOCK_VERSION`). That leaves about 20 missions.
   - **Restoring:** put back the condition-4/5 proxies, or have `fest_mission_people.c` and
     `fest_mission_sparkle_place.c` pick places from the new NPC spawn system. Then most of the 55 work alone.
   - **Either way:** the levels, Pass Orbs and rewards come along for free.
4. **S and MAX powers locally (S).** Set `HighLinkSave_SetSpecialPowerFlag` from milestone scripts: Champion, the
   Pokédex, or the Pokémon Center's delivery attendant (pokemon-center.md's Mystery Gift replacement).
5. **The Entree Forest locally (M).** Call `SymbolSave_AddPokemon` from local data, for example
   `res/paperwhite2/entree_forest/*.json` packed into a table. Choose a rotating set (by week or season, through the
   save clock as the weather calendar does), unlocked by badges or levels, with each area holding a theme. Everything
   else (spawning, the hidden ability, the Dream Ball battle, the forest growing with `deepestArea`) is already
   there. The levels by species come from archive 0xdf, which could be rescaled to the party level (trainer-scaling's
   approach).

**(b) The Pokémon Center's third attendant as "Entralink access" (S).** Value: medium-high. It turns the undecided
third attendant into a gateway. It needs:
- a new script command that calls `EventEntralinkWarpIn_Create(gsys, ZONE_ENTRALINK, pos, 0)`. No existing command
  warps in, and `FieldCommonEvent` 1 does it with the default spot (512, 32, 488).
- `"entralink_warp": true` on the Pokémon Center zones. Today it's set on 97 outdoor zones and no Pokémon Center, and
  `EventEntralinkWarpIn_CheckAllowed` checks it.
- Inferred: the return spawn is wherever the player stood, so they come back to the attendant.

This can go with (a) instead of, or as well as, the C-Gear button. With an attendant, Pass Powers would need their own
button or a counter, since the app opens from the C-Gear path or `EventPassPower_Create`.

**(c) Repurpose the map (M-L).** Value: depends on the idea. The hub is a small round map with a central bg event and
six NPC spots. The forest is nine connected areas with a working overworld-Pokémon engine. Possible uses:
- a "Safari-like" hidden-ability or outbreak preserve;
- a home for the Wonder Trade attendant's legendary;
- a DexNav challenge area.

This loses the vanilla feature rather than restoring it. It's only better than (a) if the Pass Powers are dropped
anyway.

**(d) Remove it (S).** Value: low, though it's tidy.
- **Already true:** it's unreachable today, so removal is just the final pass (the memory note: "final pass at the
  end").
- **What it would take:**
  - dropping the dead buttons and text;
  - leaving the Pass Power effect code (harmless with no powers active);
  - deciding about the 31 hidden Pass Orbs, which are worthless without the app: change them to other items in
    `global_8000.s`.
- **What's lost:** the only system of timed boosts, a whole area, and a hidden-ability source.

**A middle path:** do (a)1 and (a)4 now, with the Pass Power button on the C-Gear, so Pass Powers and Pass Orbs work at
once. Do (a)2 and (a)3 (pruning) next, and the forest (a)5 when the encounter work allows.

## 4. Interplay with planned features

- **Hidden abilities in the encounter engine:**
  - The new engine already gives wild Pokémon their hidden ability at `settings.json`'s `hidden_ability` (10%), or a
    species' own chance. Hidden Grottoes stay.
  - So the Entree Forest is no longer the only local source of hidden abilities. Its niche would be **guaranteed**
    hidden abilities in a set that rotates.
  - Keep the two from competing: forest species could be ones absent from the wild, or event-only ones.
- **Outbreaks:**
  - Outbreaks and Encounter Power both act on the encounter engine. Check that an Encounter Power still applies through
    the new engine's step check (`enc_pokeset.c` and `field_encount.c` read it today), and that the Exploring and
    Grotto Powers act on the hack's grottoes.
  - The forest's rotation could follow the outbreak calendar (one forest area hosting "today's outbreak" with its
    hidden ability).
- **Overworld encounters (wanderers):**
  - The forest's actors are another overworld-Pokémon system, made by `EntreeForest_SpawnPkmActor` from save slots.
    The wanderers (STATUS 2026-11-03) are the hack's own.
  - If the forest comes back, its battle (`EventEntreeForestBattleCall`, Dream Ball) and the wanderers' battle should
    feel alike. A shared helper is possible but not needed.
- **The DexNav:**
  - It could show the forest's Pokémon as an area with 100% hidden ability.
  - Inferred: a forest zone has no encounter table (`"encounters": null`), so the DexNav needs the forest's list from
    the new data.
- **The Wonder Trade:** independent. Its "better odds of a hidden ability" overlaps with the forest's guaranteed ones,
  so decide which gives what.
- **Pokémon Center attendants:** option (b) fills the third slot. The delivery attendant (a Mystery Gift
  replacement) is the natural giver of special Pass Powers and of forest Pokémon.
- **The C-Gear:** a Pass Power and Entralink button is one more native button or marker (cgear.md section 1 or 3).
  The lamps could blink while a Pass Power is active (`PassPower_GetUsedIDByEffect`).
- **Trainer scaling:** Funfest mission battles already scale and add the mission's levels (plugins.md). If missions
  return, that stays.

## Open questions for the user

- (a), (b), (c) or (d)? If (a), which parts and in what order?
- Missions: restore the sparkle and people missions' places, or keep only the ones that need none?
- The forest: which Pokémon (event-only, missing from the wild, or by theme), how they rotate, and what unlocks them?
- Pass Orbs: keep the vanilla prices, or rebalance once missions are solo-only (fewer orbs come in)?
