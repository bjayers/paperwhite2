# Roaming legendaries (research and design, 2026-11-25)

The user wants the legendary birds (Articuno, Zapdos, Moltres), the beasts (Raikou, Entei, Suicune) and the forces of
nature (Tornadus, Thundurus, Landorus) roaming Unova, possibly all nine at once. This doc answers whether nine is
feasible, how it would work, and how the game would tell the player where each one is. Phase 1 is built
(section 10).

Evidence marks: **[V]** read in this repo's source (file:line or symbol); **[P]** public knowledge of Black/White or
HGSS, not checked against a ROM here; **[I]** inferred.

## 1. Summary

- **Nine at once is feasible.** About 24 bytes of save each (216 bytes for nine), which fit the GTS's World Trade
  block now that the GTS is a shell. The cost per step is nothing, per zone change nine random draws, per encounter
  nine comparisons. The code is about 2-3 KB in the arena's chain (21.5 KB left). Nothing in the engine limits the
  count: the vanilla loop is sized by a constant.
- **White 2 still has half of Black/White's roaming system, live.** The read side works: the encounter roll, the
  battle's Pokémon built from the saved slot with its HP and status, the "flees unless trapped" AI and the gates'
  weather board. The write side is stubbed: spawning, moving, the roamer's storm and the post-battle update. Only
  2 slots are saved. Section 2 has the details.
- **Recommended design:** a new 9-slot roamer table in the World Trade block. Roamers move on every zone change to a
  neighbouring route, jumping anywhere now and then, with at most 2 per zone. They're met at the vanilla roll (50% of
  the step encounters in their zone, set per roamer), flee on turn 1 unless trapped, and keep their HP and status
  between battles. A KO'd roamer comes back after the Champion is beaten again. The player is shown where each one is
  in four ways: the **Pokédex Area page** (its current route, once it has been seen, as HGSS did), a **Roamers list
  in the DexNav**, **the forces' storms** on their route plus the **gates' weather board** (both mostly vanilla code),
  and **NPC rumours**. Visible roamers (as wanderers) come in a later phase.

## 2. What White 2's code has of Black/White's roaming system

### 2.1 The save: block 0x37, `EncountSave` [V]

`include/save/encounter.h:7-56`, `src/system/encounter_savedata.c`. The block holds the roamers, the swarm, the Repel
and the N's Pokémon caught bits.

- `ENCOUNT_SAVE_ROAMING_COUNT 2` (`encounter.h:10`). `RoamingPkm` (`encounter.h:30-42`) is 20 bytes:
  `u16 zone; u8 nature; (pad) u32 ivs; u32 personality; u16 species; u16 hp; u8 level; u8 status; u8 active; u8 unk13`.
  It has no form, no "seen" flag and no state beyond `active`.
- `EncountSave` (`encounter.h:44-56`): 2 x 20 bytes of `RoamingPkm`, then `u8 roamingZoneClocks[2]` ("each roaming
  Pokémon's place in ROAMING_POKEMON_ZONES"), `u8 unk2A[2]` (read by script command 0x1b3, `ReadSaveByte`,
  `Scrcmd_SpPokeGimmick_ReadSaveByte`, `src/ov012/scrcmd_sp_poke_gimmick.c:226-232`; [I] BW1's per-roamer story
  state), the swarm, the Repel and `caughtFlags`. That is about 52 bytes. Block sizes can never change for an existing
  save (`save-expansion.md` 2.4), so **this block can't grow past 2 slots**.
- Accessors: `EncountSave_GetRoamingPkmStatus`, `_GetRoamingPkm`, `_GetRoamingPkmParam` (`encounter_savedata.c:43-75`),
  `_GetRoamingPkmZoneClock` (`:39`). **There are no setters**: nothing in White 2 writes a roamer.

### 2.2 The encounter roll: live [V]

- `EventWildBattleCall_*`'s encounter function (`src/ov036/field_encount.c:176-184`): once a step's encounter has
  passed its rate check (any mode but `ENCOUNT_MODE_EFFECT`, so walking, surfing, fishing and Sweet Scent all count),
  it calls `FieldEncount_RndCheckRoaming(&manager, zoneId)` and, if that returns a roamer, sets up the battle with
  `FieldEncount_SetupRoaming` instead of the normal wild one. N's Pokémon are checked after it.
- `FieldEncount_RndCheckRoaming` (`src/ov036/enc_pokeset.c:306-326`) collects the active slots whose `zone` is the
  current zone and that the Repel doesn't stop (`FieldEncount_CheckLevelRepelled`). With one or more, it returns one
  at random **50% of the time** (`GFL_RandomLCAlt(1000) < 1000 / 2` gives NULL). It doesn't test the encounter type,
  so a roamer can come on a rod or while surfing.
- `FieldEncount_GenRoamingPkm` (`enc_pokeset.c:464-474`) creates the Pokémon from the slot: species, level, IVs and
  personality, then nature, **status and HP**, then `PokeParty_RecalcStats`.
- `FieldEncount_SetupRoaming` (`field_encount.c:443-455`): a single wild battle (`BtlSetup_SetWildNormal`, no double)
  with `BtlSetup_SetFlag(setup, 8)`.
- In the battle, setup flag 8 gives the wild side AI flag `0x800` (`GetClientAIFlags`, `src/ov167/btl_main.c:3212`),
  which is AI script 11, `TR_AI_SCRIPT_ROAMING_POKEMON` (`generated/tr_ai_scripts.txt:13`). Its source is
  `res/trainers/ai/roaming_pokemon.s`: **it flees unless trapped**. Trapped means it is bound (`CONDITION_BIND`), under
  Mean Look (`CONDITION_MEAN_LOOK`), facing Shadow Tag, or facing Arena Trap while it is neither Flying-type nor
  Levitate. So Arena Trap never holds the birds or the forces (all Flying in Incarnate Forme, Landorus too), only the
  beasts. The script is ours to edit.

### 2.3 After the battle: stripped [V]

`EventBattleCall`'s state 1 (`src/ov012/event_battle.c:134-142`) records N's Pokémon as caught (`result == 5`,
`BTL_RESULT_CAPTURE`, `SetNPokeCaught`) but does nothing for a roamer. The data for an update is there, though:
for a wild battle (`battleType == 0`) the battle copies the foe's party back into `setup->party[1]` at its end
(`btl_main.c:3450-3454`). So a hook beside `SetNPokeCaught` can read the roamer's HP and status after the battle and
clear the slot when it was caught or fainted. That is the missing half of persistence.

### 2.4 Spawning, moving, the storm: stubs with their callers still in place [V]

`src/ov012/field_encount_st.c:90-136`:

| Function | In White 2 | Called from | What it did in BW1 [I/P] |
| --- | --- | --- | --- |
| `ROAMING_POKEMON_ZONES[17]` (`:91-95`) | live data: Routes 2-16 and 18, then `0xffff` | `EncountSave_GetRoamingPkmZone` | the routes a roamer visits, BW1's Unova (no 1, 17, 19-23) |
| `EncountSave_GetRoamingPkmZone` (`:97-103`) | live | the gates' board (2.5) | a slot's route by its zone clock |
| `sRoamingZoneGroups[5]` (`:111-114`) | dead data: {R2,R3,R18} {R4,R5,R16} {R6,R7,R8} {R9,R10,R11} {R12-R15} | nothing | geographic clusters; [I] the move picked a route in another cluster |
| `EncountSave_SpawnEntry` (`:110`) | empty | script command 0x1b2 `SpawnMovePokemonIfInactive` (`src/ov036/scrcmd_encount.c:91-100`) | made a roamer (PID, IVs, HP, first zone) |
| `EncountSave_SpawnPendingEntries` (`:117`) | empty | `EventGameClear` (`src/ov012/event_game_clear.c:210`), each Hall of Fame entry | [P] brought back a KO'd roamer after the Champion |
| `func_ov012_021591f4` (`:87`) | empty | `ZoneChange_OnSeamless` (`src/ov012/zone_change.c:18`) | [I] moved the roamers on a zone change |
| `EncountSave_HasActiveEntry` (`:106`) | returns 0 | the gates' board | whether a roamer is out |
| `GetDefaultWeatherValue` (`:120`) | returns `WEATHER_NONE` | `GetWeatherAll` (`src/system/zone_weather.c:63`), the **first** weather source (`weather-editor.md` 1), and `UpdateWeatherToDefault` (`zone_weather.c:123-133`, from `event_mapchange.c:340`) | the roamer's storm on its route |
| `EncountSave_IsAnyEntryActive` (`:124`) | returns FALSE | `UpdateWeatherToDefault`: a thunderstorm or gusty rain (6, 7) goes back to the zone's own weather while a roamer is out | [I] the storm passing as the roamer leaves |

Script command 0x1b2 appears twice in `res/field/scripts/global_10885.s` (`:322`, `:1635`), between `.byte` runs.
[I] Those are data bytes that were disassembled as code, not real calls (the file is the Plasma Frigate password
trainers').

### 2.5 The gates' weather board: live, but sees no roamer [V]

`GimmickGate_GetWeatherZones` (`src/ov104/field_gimmick_gate.c:1000-1040`) fills the gate's electronic board with up
to 2 zones: the roamers' first (`GimmickGate_GetRoamerZones`, `:1064-1097`), then the reported weathers (thunderstorm,
gusty rain, diamond dust: `sReportedWeathers`, `:187`). `GimmickGate_GetRoamerZones` picks slot 0 in version 0x16
(White 2) with weather 6, `WEATHER_THUNDERSTORM`, and slot 1 in 0x17 (Black 2) with 7, `WEATHER_GUSTY_RAIN`. That
matches [P] BW1's Thundurus (White) and Tornadus (Black) and the board's "stormy weather on Route N" news. It returns
nothing because `EncountSave_HasActiveEntry` is 0. This is BW1's way of telling the player where the roamer is, and it
still works.

### 2.6 Not present [V]

- No roamer code in the Pokédex's Area page (`src/ov298/pokedex_detail_map.c`) or the Town Map (overlay 144). A grep
  for roam, `EncountSave` and `MovePoke` in those finds nothing. [P] BW1's Pokédex showed a seen roamer's route; that
  code is gone from White 2.
- [P] In vanilla White 2, Tornadus, Thundurus and Landorus came only through the Dream Radar, which the hack has made a
  shell (`design/wireless-shells.md`). The beasts and birds came only by Poké Transfer. **So roamers would be the
  hack's only source of all nine.**

### 2.7 BW1's behaviour, for reference [P]

After the Hall of Fame, a Route 7 cutscene released the version's force, which then roamed Routes 2-18. It moved to a
random route each time the player changed maps, fled on its first turn, and kept its HP and status. Its route had a
storm, and the gates' boards reported it. A KO'd one came back after the Elite Four were beaten again. The Pokédex
showed its route once it had been seen. Landorus was static, at the Abundant Shrine with both forces in the party.

## 3. The hack's side

| Piece | Where | What a roamer could use |
| --- | --- | --- |
| Encounter engine | `res/paperwhite2/encounters/`, `src/paperwhite2/main/paperwhite2_encounters.c`, `encounters.md` | Nothing has to change: the roamer roll comes before `FieldEncount_GenWilds` (`field_encount.c:178` vs `:194`). But a roamer needs its zone to have a step rate for the method (`encData->userData[encType]`, `:149`), and the roll bypasses the engine's conditions. A "method" filter is ours to add. |
| Conditions | `plugins.md` Conditions; `res/paperwhite2/conditions/` | Start triggers (`flags`, `vars`), weather-linked route weights, follower rules. A new kind, `roamer_here`, would let the follower and NPCs react. |
| Wanderers | `src/paperwhite2/ov036/paperwhite2_wanderers.c`, `plugins.md` Wanderers | Up to 3 visible wild Pokémon in grass, each from `EventWildBattleCall_PickWanderer` with its PID fixed and its battle from `FieldEncount_SetupNormal`. A roamer as a wanderer would need its own pick (its slot's PID, IVs and HP) and battle (`FieldEncount_SetupRoaming`). The behaviours and the floating option (`grass` false) already exist. Grass only for now. |
| Weather | `src/system/zone_weather.c`, `weather-editor.md` 1, calendar of 179 zones | `GetDefaultWeatherValue` is the first source, so a roamer's storm beats the calendar and the battle weather. The habitats that need a weather (storm, rain) then appear there too. |
| DexNav | `src/paperwhite2/ov303/paperwhite2_dexnav{,_data}.c`, `design/dexnav.md` | Overlay 303 isn't in the arena's chain (`memory.md`). It can take a Roamers page. |
| Pokédex Area | `src/ov298/pokedex_detail_map.c`, `design/pokedex-area.md` | One OBJ per town map place (85), with a glow. These species say "Not found in the wild" today, so a roamer branch fits there. |
| Habitat Dex | `src/paperwhite2/ov303/paperwhite2_habitat_dex.c` | Lists come from the encounter data. Roamers stay out of it, or get a "Roaming" mark (decision). |
| C-Gear | `plugins.md` C-Gear, `paperwhite2_cgear_event.c` | Its purple marker opens the Town Map, and markers can open hack apps (`design/cgear.md` question 1). A tracker could go there. |
| Town Map | overlay 144, `res/town_map/` | 85 places, including Routes 1-23. A roamer's place is the place of its zone's town map entry. |
| NPCs | street chatter (`plugins.md`), NPC spawns, global scripts | Rumours need one script command, "a roamer's zone into a var", plus the zone's name in a buffer. |
| Follower | `paperwhite2_following_reactions.c`, dialogue rules | Takes the conditions; `roamer_here` gives "Pikachu is on edge...". |
| Save | `save-expansion.md` 3; `entralink-roguelike-prototype.md` "The progress block" | The main save has 0x5c bytes after its footer, too few for a block. The GTS's **World Trade block** (0x2e, 0xf8 = 248 bytes, read only by the shelled GTS: `ov214/worldtrade_*.c`, `ov004/event_worldtrade.c:47`; zeros in the user's save) is free. The Entralink progress block has 0x22c (556) bytes free at 0x624, and Funfest (0xfc) is unused. |
| Arena | `memory.md` | 0x55e0 = 21,984 bytes after phase 5 of the icon work. ARM9 main, overlays 12 and 36 are in the chain. |

## 4. Feasibility of nine

**Save, per roamer (proposed `PaperWhite2Roamer`, 24 bytes):** species u16, form u8, level u8, current HP u16,
status u8 (Gen 5's condition fits a byte: sleep turns in bits 0-2, then poison, burn, freeze, paralysis, toxic), state
u8 (dormant, roaming, KO'd, caught), zone u16, previous zone u16 (so it doesn't bounce back), personality u32, IVs u32,
nature u8 and flags u8 (seen, located, shiny-locked). That is 24 bytes. Nine take 216 bytes, plus an 8-byte header
(magic, version, a move counter), so 224 of the World Trade block's 248. A move ("stay N zone changes") counter would
fit in the flags' spare bits or the header. The same 9 x 24 would fit the Entralink block's free 556 just as well.

**CPU:**
- A step: nothing. The roll only runs once a step's encounter has fired.
- An encounter: 9 compares plus a Repel check (the vanilla loop with 9 instead of 2).
- A zone change: per roaming slot, one draw and a neighbour list read from a table loaded once per game (a few hundred
  bytes in BSS, or read from an archive member as the random rooms' table is). That is microseconds.
- The wanderer variant: one zone check per spawn try.

**Memory:**
- The core (move, roll filter, post-battle update, weather, gate board, spawning, script commands) is about 2-3 KB
  in overlays 12 and 36. Every byte there comes off the 21.5 KB arena [I estimate].
- The route graph is data, best in an archive member (`HACK_ARCHIVE_MEMBERS`) at about 0.3 KB of BSS.
- The UI goes in overlays 298 and 303, outside the chain.

**Engine limits and rules:**
- One roamer per battle. `SetupRoaming` makes a single battle, never a double, so the hack's double and triple
  chances and a partner NPC don't apply [V field_encount.c:443-455]. Two roamers in a zone: the roll picks one.
- The roll has no method test. A bird on a rod should be filtered out.
- The vanilla 50% is of the zone's encounters. With nine on 23 routes, a route holds a roamer about a third of the
  time [I], so that rate is high. Make it a setting per roamer.
- HP persistence needs the post-battle hook (2.3). The spawn must store the real max HP: a stored 0 goes through
  `PokeParty_SetParam(HP, 0)` before `RecalcStats`, and whether RecalcStats then keeps 0 hasn't been checked [I].
- Form: `GenRoamingPkm` doesn't set a form. Therian Formes need a form parameter (`PKM_PARAM_FORM`) in our version.
- Shiny: the PID is rolled once at spawn, so the shininess is fixed for good (the Shiny Charm counts then). The shiny
  palettes work as they do for any Pokémon.

**Verdict: feasible.** Nine cost about 224 bytes of save in a free block, negligible CPU and about 2-3 KB of arena.
The engine already treats the count as a constant. What decides the design is play feel, not limits: how often
roamers are met and how the player finds them.

## 5. Recommended design

### 5.1 Data (`res/paperwhite2/roamers/roamers.json` + schema, packed into an archive member)

One entry per roamer:
- species and form;
- level, or a level rule: fixed, or the trainer scaling's level when it starts;
- `starts_when`, a condition (flags and vars, e.g. a badge flag or the Champion);
- `routes`, a list of zones or `zone_group`s;
- `moves`: `adjacent` or `anywhere`, with a jump chance;
- `odds`, the percent of the zone's encounters;
- `methods`: walk, surf, fish;
- `weather`, an optional storm on its route;
- `flee`: true;
- `respawn`: never, after the Champion, or after N days;
- `shiny_lock`.

The route graph comes from the town map's place positions plus a hand list of links, kept in `res/` and shown and
edited on the editor's Roamers page.

### 5.2 Runtime

- **Save:** the World Trade block, with a magic and a version as the Entralink progress block has. It's cleared if
  the magic is missing, and the GTS code never reaches it (shelled). The vanilla `EncountSave` slots stay zero.
- **Spawning:** at the zone change after `starts_when` holds. The PID, IVs and nature are rolled once, HP is full,
  and the first zone is a random route away from the player. The vanilla command 0x1b2 can be reused for scripted
  starts.
- **Moving:** on every zone change, including map changes, `ZoneChange_OnMapChange` and `OnFly` as well as
  `OnSeamless`'s stub. A roamer moves to a neighbouring route, or anywhere at the jump chance (HGSS-like). Option:
  route weights by today's weather (Thundurus toward storms, Suicune toward rain), from the conditions engine. At
  most **2 roamers per zone**: the move redraws a full one.
- **The roll:** the vanilla check widened to 9 slots, with the method filter and the per-roamer odds.
- **The battle:** vanilla flee AI. HP and status are written back after the battle. Caught means `caught`; fainted
  means `KO'd` until its respawn rule. A flee by either side leaves it roaming. The battle itself moves it at once.
- **Weather:** `GetDefaultWeatherValue` returns the storm for a roamer's zone, if it has one.
  `EncountSave_IsAnyEntryActive` ends the storm when it leaves.
- **Gate board:** `GimmickGate_GetRoamerZones` widened to the storm roamers (up to 2 lines).

### 5.3 Telling the player where they are (recommended, in this order)

1. **Pokédex Area page:** once a roamer is *seen* (its seen flag is set by its first battle, HGSS's rule), its page
   shows "Roaming" with its current route's place glowing in a colour of its own. Before that it says "Location
   unknown". This is cheap (overlay 298, one place), and it's what HGSS and [P] BW1 did.
2. **DexNav, Roamers page:** the nine as icons. A seen roamer shows its route and HP bar, an unseen one a silhouette
   or "???", and a caught one a ball. It's the one screen that answers "which is where" for all nine (overlay 303, out
   of the arena's chain).
3. **Storms and the gate board** for the forces (Thundurus thunderstorm, Tornadus gusty rain, Landorus sandstorm or
   none), as in BW1. Most of this is vanilla code.
4. **NPC rumours:** street chatter or a few NPCs saying "a blue dog was seen near Route N" from a new
   script command, so unseen roamers can still be hunted.
5. **The follower** reacts when one is in the zone (`roamer_here` condition).
6. **Later, visible roamers:** in its zone a roamer sometimes appears as a passive wanderer that runs off. Touching
   it starts its battle. Birds float (`grass` false).
7. **Later, Town Map icons** on the C-Gear's map marker. These overlap with 1 and 2, so they're optional.

### 5.4 Editor and debug

- **Editor:** a Roamers page (ROM session's, per memory). One card per roamer with the fields of 5.1, and a route
  map built from the town map places with the links drawn and editable. It shows a "chance per encounter" readout
  and checks that each route has a step rate for the chosen methods.
- **Debug menu:**
  - Roamers: list (zone, HP, state);
  - Start all;
  - Bring one here, so the next encounter in this zone is it;
  - Heal or reset one;
  - Mark seen;
  - Force respawn;
  - Freeze movement.

## 6. Decisions for the user

1. **Nine at once, or staged in three groups?** Recommended: groups by story. Suggested:
   - the forces after the 5th or 6th badge;
   - the beasts after the 8th;
   - the birds after the Champion.

   Or all after the Champion, as BW1 did.
2. **Movement:**
   - (a) BW1, a random route on every map change;
   - (b) HGSS-like, neighbours plus a jump (recommended);
   - (c) weather and season linked: they keep to their weather's routes.
3. **Which routes:** all of Routes 1-23, or a list per group (birds also in some cities or over water, beasts on
   land)? And can they be met surfing or fishing?
4. **Odds:** the vanilla 50% of the zone's encounters, or less (25% recommended), per roamer?
5. **Flee and trapping:** keep the vanilla flee on turn 1 with vanilla trapping (Mean Look, Bind, Shadow Tag; Arena
   Trap only for the beasts), or flee after a few turns, or no fleeing for some (Landorus)?
6. **KO'd:** gone until the Champion is beaten again (BW1), back after a few days, or back at once somewhere else?
7. **Per zone:** at most 1 or 2 roamers in the same zone?
8. **Levels:** fixed per roamer, or set by the trainer scaling's level when it starts?
9. **Landorus:** roaming like the others, or static at the Abundant Shrine once both forces are caught (lore and BW1)?
   And Therian Formes, roaming or via the Reveal Glass only?
10. **Storms:** the forces only (BW1), or every roamer with a weather (Suicune rain, Articuno snow, Zapdos storm)?
    Storms override the weather calendar on that route.
11. **Shiny:** allowed (rolled once at spawn) or locked?
12. **Information:** which of 5.3's ways? Recommended 1-5 now, 6 and 7 later.
13. **Save place:** the World Trade block (recommended), or the Entralink block's free bytes?

## 7. Interactions

- **Encounter tables (being reworked):** the roamer roll is apart from the tables, so the rework doesn't block it.
  It does need each roamer route's step rate for the methods (`areas/<area>.json`), which the editor's check covers.
  Don't also add these species to the habitats, or they'd appear twice. If a storm-only habitat is wanted, the
  roamer's storm brings it out.
- **Wireless removal:** the World Trade block is free because the GTS is a shell. The final wireless pass must keep
  the GTS code off the block, and the gate board must not be removed with any wireless notices. The Dream Radar shell
  removes vanilla's own source of the forces, so roamers replace it.
- **Outbreaks** share the encounter flow but not the roll: an outbreak zone can still bring its roamer.
- **Entralink runs:** no roamers in the run's rooms. They're never on the run's zones, and the zone-change move
  should skip while a run is on (`EntralinkRun_*`).
- **Wanderers' Repel** and the step's Repel both use `FieldEncount_CheckLevelRepelled`, so a strong Repel keeps
  weaker roamers off.

## 8. Build plan

| Phase | What | Effort [I] |
| --- | --- | --- |
| 1 | Data and packer, save block (World Trade reuse), spawn, move on zone changes, the 9-slot roll with methods and odds, post-battle HP, status and caught update, forms, debug entries | 2-3 sessions, with a py-desmume test on a save copy |
| 2 | Pokédex Area "Roaming" branch, seen flag, DexNav Roamers page | 1-2 sessions; art for the page from the user's specs (`ui-art-from-specs`) |
| 3 | Storms (`GetDefaultWeatherValue`, storm end) and the gate board for any roamer with a storm | 1 session |
| 4 | Story starts (scripts or conditions), NPC rumour command and lines, follower `roamer_here` | 1 session, plus writing |
| 5 | Editor Roamers page with the route graph and checks | 1-2 sessions |
| 6 | Visible roamers as wanderers (own pick, flees on sight, battle through `SetupRoaming`) | 2 sessions |
| 7 | Town Map icons (optional) | 1 session |

Phases 1-3 give a playable system. Tuning the odds and levels should wait for the user's fresh-save playtest
(`playtest-before-deciding`).

## 9. The user's decisions (2026-11-25)

1. **Release:** for now all at once with no unlock, for testing. Later, story events release them: a mini-quest for
   Ho-Oh and Lugia (and ultimately Celebi), each part of it releasing one trio. All of them can exist at once, but
   they're never released at once. So `starts_when` stays per roamer (or per group), set by a script command.
2. **Movement:** undecided; HGSS's way was annoying (it needed tricks to land on the roamer's map). It must be
   possible to end up on the same map as a roamer, and two roamers never share a map. See 9.1 for the proposal.
3. **Odds:** the vanilla 50% of the zone's encounters. Finding the route should be easy, meeting the roamer less so.
4. **Fleeing:** a roamer tries to flee, under the same speed rules as the player's escape; trapping moves, abilities
   and items hold it.
5. **Knocked out:** back the next day at full HP.
6. **Per zone:** at most 1. **Levels:** fixed at 70, not scaled.
7. **Landorus:** not a roamer. It will be static at the Abundant Shrine once Tornadus and Thundurus are caught. So
   **8 roamers:** Articuno, Zapdos, Moltres, Raikou, Entei, Suicune, Tornadus, Thundurus.
8. **Save:** the World Trade block.

### 9.1 Movement: proposal for the user

"Settle, then scatter": a roamer moves on its own clock, not every time the player changes map.

- **A timer, not the player's map changes:** each roamer moves to a neighbouring route once its timer runs out
  (for example every in-game hour, or every few hundred steps). A route seen on the Pokédex's Area page is still the
  roamer's route by the time the player gets there, most of the time.
- **It stays while the player is in its zone:** the timer pauses on its route, so once there the player can search
  (50% of encounters).
- **It scatters after a battle it leaves:** when it flees (or the player runs), it moves at once to a route at least
  two links away, so the hunt starts again without it simply stepping next door.
- **Never shared:** a move never picks a route with another roamer, or the player's current route.

### 9.2 Settled with the user (2026-11-25, second round)

- **Movement: "settle, then scatter"** (9.1) on a **15-minute real-time timer** (the RTC), paused while the player is
  on the roamer's route. Time with the game off counts on load (capped, so a long break moves each roamer a few
  steps, not hundreds). After a battle it leaves, it scatters at least two links away. Never onto another roamer's
  route or the player's.
- **Routes:** Routes 1-23 for all eight.
- **Weather on the roamer's route** (overriding the weather calendar there while it stays): Tornadus gusty rain,
  Thundurus thunderstorm, Zapdos thunderstorm, Raikou thunderstorm, Suicune snow, Articuno hail (the field's heavier
  snow), and **harsh sun** for Entei and Moltres: a new field weather (later phase: a field effect plus sun in battle,
  as rain sets rain).
- **Shiny:** rolled again at every respawn (PID, IVs, nature), so a roamer can be shiny-hunted a day at a time.
- **Release:** a script command, callable from any NPC or event script (one roamer, a group or all), and the debug
  menu's entry calling the same thing. For now, testing: release all from the debug menu.
- **Telling the player:** a **Roamers page in the DexNav**, enabled by a flag that an NPC sets ("installs") during the
  first releasing event. Unseen roamers show only their weather ("Thunderstorm reported on Route 7"), so weather is
  the clue; a seen roamer shows its route. The gates' weather board reports the unusual weather of the routes near
  that gate (local, so eight roamers don't crowd it). The Pokédex Area page may show "Roaming" without new graphics
  (optional, later).

## 10. Built: phase 1 (2026-11-25)

What sections 9 and 9.2 settled, built as plugins.md's "Roaming legendaries" describes (the code, data and hooks
there). In short:

- **Data:** `res/paperwhite2/roamers/roamers.json` (the 8, level 70, odds 50, walk for all and surf for the birds and
  Suicune, no fishing, the weathers of 9.2, the groups `birds`, `beasts`, `forces`) and `routes.json` (the 22 town map
  routes, 1-9 and 11-23: Route 10 has no place in White 2; the links by hand), packed by `tools/paperwhite2/roamers.py`
  into `paperwhite2/roamers_config.h`. The walkers never go to Routes 17 and 21, which are water only.
- **Save:** the World Trade block, 0xd0 of its 0xf8 bytes (a 16-byte header and 8 slots of 24).
- **Release:** script command `Roamers` (0x2f9, `Debug` moved to 0x2fa) with `ROAMERS_ACTION_RELEASE` and a roamer, a
  group or all; the debug menu's Encounters... > Roamers... > Release all calls the same function.
- **Movement:** "settle, then scatter" on the clock, counted at every zone change and every field that opens (so a
  continued save counts the time off), paused on the player's route, 4 moves at most at once, nothing during an
  Entralink run.
- **Encounter, battle, after it:** as 9.2 says. The roamer's escape follows the player's speed rule, without the
  player's tries' bonus (a roamer has no count of its tries).
- **Weather:** the field weathers of 9.2 on the roamer's route; **Entei and Moltres have none until harsh sun exists**
  (a later phase).

**Tested** in py-desmume on a copy of the user's save (screenshots in `Pokemon Paper White\roamers\`): Release all put
the eight on eight different routes, none the player's (Route 4); Roamers now listed each with its route, HP and
minutes; on Tornadus' route the field had gusty rain ("Heavy rain" in the debug Info) and, with encounters forced and
its odds set to 100 in RAM for the test, the battle was Tornadus Lv. 70 in the rain; it fled on its first turn (the
faster), kept its damage (HP 188) and scattered from Route 12 to Route 14, two links, and Route 12 went back to its
calendar's rain. On Raikou's route a thunderstorm; with Raikou set to level 9 in RAM (slower than the player's
Pokémon), its tries went fail, fail ("The wild Raikou can't escape!"), escape. Knocked out (level 1 and 1 HP set in
RAM), its state was knocked out with the day; with the emulated clock a day later, the next zone change brought it
back at full HP on Route 19 with a new PID. An hour on Route 12 with Tornadus there, then a warp: Tornadus stayed (its
clock paused), the others moved 4 times (the cap). Bring one here put Raikou on the player's route with its
thunderstorm at once; Freeze movement turned on.

**Seen in the test, for tuning:** a roamer whose neighbours are taken (by another roamer or the player) bounces between
the same two routes, since a move picks the nearest free route and a slot keeps no "came from"; a leaf route (17-18,
the 19-20 end) holds a roamer between two routes. A "not back where it came from" rule would need a few bits of the
slot (its flags byte has 7 free). Waits for the user's playtest.
