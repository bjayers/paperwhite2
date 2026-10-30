# Conditions module (design)

Draft of 2026-10-29, for the user's approval before any code. ROADMAP.md, Phase 1.1.

The module answers one question for every feature that needs it: **does this apply right now?** Its consumers are
the encounter overhaul's habitat entries, the NPC spawn system's groups, the follower's dialogue, gift and
ambient-emote rules, the Dexnav's "what's here now", and later others. They all share one condition definition, one
binary encoding and one matcher, so the editor has one condition form and the game has one code path.

Facts below are from the code at this date, with file and function. "Unverified" marks what wasn't read.

## 1. Facts from the code

### Season

- `include/paperwhite2/season.h` (`src/paperwhite2/main/paperwhite2_season.c`, ARM9 main). The conditions use
  **`GameData_GetSeason(gameData)`** (`include/system/game_data.h`): the season the field has, saved with the game.
  It changes only on a map change with a loading screen into an exterior (`EventMapChangeCore_Callback`,
  `src/ov035/event_mapchange.c`), so it always matches the map's graphics, the encounter archive's season slot
  (`EncData_Load`, `src/ov012/field_encount_st.c`) and the script command `RTCGetSeason`
  (`Scrcmd_GameState_RTCGetSeason`, which reads the same value).
- Don't use `PaperWhite2_GetCurrentSeason`. It is the season of the date and setting, which can be ahead of the
  field's until the next loading screen. Seasons are `SEASON_SPRING`..`SEASON_WINTER` (0–3, `include/system/season.h`).
- The setting (`EVENT_WORK_SEASON_SETTING`, 0x4050) and its modes need nothing from this module. Chaos mode draws only
  at a map change, so the field's season is always stable within a visit.

### Time of day

- **Periods:** `include/system/rtc.h` defines `DAY_PERIOD_MORNING` 0, `DAY` 1, `EVENING` 2, `NIGHT` 3 and
  `MIDNIGHT` 4 (late night).
- **Code:** in `src/system/rtc.c` (main). `GetRealTimeDayPeriod(int season)` gives the live clock's period
  (`day_part[season][hour]`). `GetDayPeriod(season, hour)` gives the period of any hour. `IsDayPeriodNight(season)` is
  TRUE for NIGHT and MIDNIGHT.
- **The shift by season:** `LIGHT_CHANGE_HOURS[SEASON_COUNT][DAY_PERIOD_COUNT]` gives each period's start hour, and
  `day_part[4][24]` agrees with it:

  | Season | Morning | Day | Evening | Night | Late night |
  | --- | --- | --- | --- | --- | --- |
  | Spring | 5 | 10 | 17 | 20 | 0 |
  | Summer | 4 | 9 | 19 | 21 | 0 |
  | Autumn | 6 | 10 | 17 | 20 | 0 |
  | Winter | 7 | 11 | 17 | 19 | 0 |

- **Getters:**
  - `Field_GetDayPeriod(Field*)` (`src/ov036/fieldmap.c`) is `GetRealTimeDayPeriod(GameData_GetSeason(...))`.
  - `GameData_GetDayPeriod` (`src/ov012/ev_time.c`) reads the saved AdventureTime hour instead. `EvTime_Update`
    refreshes that hour each frame when no event runs, and the script command `RTCGetDayPart` uses it.
  - The module uses `GetRealTimeDayPeriod(GameData_GetSeason(gd))`: it is in main, needs no `Field`, and is what the
    lighting shows.
- **Encounters today take no period.** `field_encount.c` puts the raw hour and minute into the battle setup.
- **The user's script matches the night periods exactly.** Script 10852's night test (spring hour ≥ 20 or ≤ 4,
  summer ≥ 21 or ≤ 3, autumn ≥ 20 or ≤ 5, winter ≥ 19 or ≤ 6) is `IsDayPeriodNight`.

### Weather

- **Constants:** `include/system/zone_weather.h` has `WEATHER_SUNNY` 0, `FLAKE` 1, `RAIN` 2, `SANDSTORM` 3,
  `BLIZZARD` 4, `FLUTTER` 5, `THUNDERSTORM` 6, `GUSTY_RAIN` 7, `DIAMOND_DUST` 8, `TINT_9`–`TINT_11`,
  `SANDSTORM_2` 12, `TINT_13`, `TINT_14`, `WEATHER_MAX` 15.
- **The zone's weather:** `GetWeatherAll(GameSystem*, zoneId)` (`src/system/zone_weather.c`, main) tries these
  sources in order:
  1. the forced weather;
  2. the Entralink;
  3. Route 7's event;
  4. the birthday on Routes 14 and 15;
  5. `Calendar_GetWeather` (`src/ov012/calender.c`) while the field's season is current;
  6. the zone header's `weather`.
- **The calendar's date:** under PAPERWHITE2, `Calendar_GetWeatherCore` takes its date from
  `PaperWhite2_GetWeatherDate` (`src/paperwhite2/ov012/paperwhite2_weather.c`). That date is a hash of the save
  clock's day number (`RTC_ConvertDateToDay(getAddressAdventureTimeBlk(gd))`) and the season, so it is stable all day.
  The source data is `res/field/weather_calendar/`.
- **Reading it at any moment:**
  - **`GetNowWeather(GameData*)`** (`src/system/game_data.c`, main) is the weather the game computed for the current
    zone. The module uses this one.
  - `ResetWeather` (main) sets it: on a map change (`event_mapchange.c`), on a seamless zone change (via
    `Field_SwapWeather`, `fieldmap.c`) and after a battle (`event_battle.c`).
  - `FieldWeather_GetWeatherId` (`src/ov036/weather.c`) is the weather being shown, which can lag during a fade.
    Encounters and Sweet Scent use it today.
  - `Field_GetWeatherForZone(field, zoneId)` gives another zone's weather.
- **When it changes:** on those three events and on the script weather command (`src/ov012/scrcmd_weather.c`).
  Nothing recomputes it at midnight inside one zone, so a new calendar day shows at the next zone change.
  Unverified: whether the script command also updates `GetNowWeather`.

### Story flags and variables

- **The API:** `include/save/event_work.h`. `EventWork *GameData_GetEventWork(GameData*)`, then
  `EventWork_FlagGet/Set/Reset(ew, flag)` and `u16 *EventWork_GetWkPtr(ew, work)`.
- **Variables:** 431 saved variables, 0x4000–0x41ae, named in `generated/vars.txt`. Script temporaries 0x8000+ belong
  to the running script, so conditions never read them.
- **Flag regions** (research.md, "Event flags"):

  | Range | Behavior |
  | --- | --- |
  | 0x1–0xbf7 | saved |
  | 0x1–0x63 | cleared on every map change (`FieldScript_ResetMapLocalEvents`) |
  | 0x5f0 + trainer | trainers' defeated flags |
  | 0xaa0–0xb03 | daily, cleared at midnight (`EventWork_ResetDailyFlags` from `EvTime_Update`'s `midnight()`) |
  | 0xb04 + index | hidden items |
  | 0x4000–0x403f | temporary, not saved; scripts can't name them |

  The hack's blocks are in plugins.md, "Flags": 0x1f4–0x257 (500–599) are the user's spawns. Unused variables
  have not been surveyed. `tools/paperwhite2/flag_usage.py` covers flags only.

### Zone

- **The current zone:** `PlayerState_GetZoneID(GameData_GetPlayerState(gd))` (main), or `field->zoneId`.
  `ZONE_MAX` is 615.
- **Groupings in the zone header** (`src/system/zonedata.c`, `res/field/zones/*.json`). Each can be shared by many
  zones:

  | Field | Getter | What it groups | Castelia City |
  | --- | --- | --- | --- |
  | `parent` | `GetZoneParentZone` | "the zone a zone belongs to, such as the town of a building" | 37 zones |
  | `place` | `ZoneData_GetPlaceNameID` | the place name shown on entry | 35 zones |
  | `area` | `ZoneData_GetAreaID` | the graphics, textures, props and lights a set of zones share | 1 zone (too fine) |
  | `matrix` | `GetZoneMatrixId` | the map matrix; `GetIsZoneMatrix0` is the overworld matrix shared by many outdoor zones | — |

  `parent` is the "all Castelia zones" grouping; Castelia's own five sewer zones have parent `ZONE_CASTELIA_SEWERS`.
- **Indoor or outdoor:** `AreaData_IsExterior(AreaData*)` (`include/system/area_data.h`). The field caches it as
  `FieldEffects_GetAreaIsExterior` (`src/ov036/field_effect.c`).
- **Caves have no zone property.** Neither does a building. A cave is only tile class `TILE_CLASS_CAVE`, and
  `mapType` is a mapper config index (`MAP_CONFIGS`), not a kind of place.

### Terrain

- **Tile layout:** `include/field/field_map.h`; the predicates are in `src/ov036/map_attr.c`.
  - A tile is a `u32`. `GetTileClass(t)` is `t & 0xffff` (the `TILE_CLASS_*` behavior) and `GetTileFlags(t)` is
    `t >> 16`.
  - The flags are `TILE_FLAG_COLLISION` 0x1, `TILE_FLAG_WATER` 0x2 (surfable), `TILE_FLAG_ENCOUNT` 0x4 (wild
    Pokémon), `REFLECT` 0x40, plus `GRASS` 0x20 and `SHADE` 0x100. The last two are named only in
    `paperwhite2_following_field.c`.
  - `TILE_TYPE_NONE` is 0xffffffff; `MapTile_IsValid` checks for it.
- **Reading the tile:**
  - **Player:** `FieldPlayer_GetTileTypeUnder(FieldPlayer*)` (`src/ov036/field_player.c`) handles grid and rail
    maps.
  - **Actor:** the cheap read is `GetCachedTileUnderActor(FieldActor*)` (`src/ov012/field_actor.c`), which the
    actor's height update refreshes. `GetTileTypeAtPosByActor` (`src/ov012/field_actor_tool.c`) works on grid maps
    only, and the follower uses it today.
- **How encounters decide their method:** `FieldEncount_DecideTypeByTerrain` (`src/ov036/field_encount.c`) uses the
  flags, not the class:
  1. no `ENCOUNT` flag gives none;
  2. `WATER` gives surf;
  3. `MapTile_IsTallGrassDoubleBtl` gives dark grass;
  4. anything else gives grass, cave floors included.

  The battle terrain comes from `TILE_CLASS_BATTLE_TERRAINS` (`GetTileEncountType`).
- **The proposed groups** come from the existing predicates. The class of a tile maps to one group through a
  256-byte table; the flag-derived and area-derived groups are added on top. A context's terrain is then a bit mask,
  so a tile can be in `surf_water` and `encounter` at once.

  | Group | Covers |
  | --- | --- |
  | `grass` | GRASS, GRASS_B, GRASS_C, HIDDEN_GROTTO_GRASS |
  | `dark_grass` | GRASS_DOUBLE(_B/_C), REALLY_TALL_GRASS_DOUBLE (`MapTile_IsTallGrassDoubleBtl`) |
  | `tall_grass` | REALLY_TALL_GRASS(_DOUBLE) (`MapTile_IsReallyTallGrass`) |
  | `surf_water` | `TILE_FLAG_WATER`, or `IsTileSurfWater`'s classes, WATER_CURRENT_*, WATERFALL |
  | `shore` | SURF_EDGE, SURF_EDGE_44 |
  | `shallow_water` | SPLASH_WATER, RIPPLE_WATER(_15) |
  | `puddle` | PUDDLE |
  | `swamp` | SWAMP, MUD |
  | `sand` | SAND, DEEP_SAND, SAND_19, SAND_23, QUICKSAND |
  | `snow` | SNOW, SNOW_NO_CYCLING |
  | `ice` | ICE, MIRROR_ICE |
  | `cave` | CAVE (and ELECTRIC_FIELD and ELECTRIC_ROCK, which share CAVE's battle terrain) |
  | `leaves` | FALLEN_LEAVES |
  | `bridge` | BRIDGE, CATWALK, CATWALK_ENTRY |
  | `ground` | NORMAL, MIRROR_FLOOR and the unnamed 03/11/13/16/1F/26 |
  | `indoor` / `outdoor` | from `AreaData_IsExterior`, not the tile |
  | `encounter` | `TILE_FLAG_ENCOUNT` |

  "Building floor" is `ground` + `indoor`. The group list lives in `res/paperwhite2/conditions/terrain_groups.json`,
  so the editor and the build share it.

### Party

- **Access:** `GameData_GetParty`, then `PokeParty_GetPkm(party, i)`, `PokeParty_GetPkmCount` and
  `PokeParty_GetParam(pkm, PKM_PARAM_*, NULL)` (`include/pml/poke_party.h`).
- **Parameters** (`include/constants/pokemon.h`): `SPECIES` 0x5, `FORM` 0x6f, `NATURE` 0x70, `HAPPINESS` 0x9,
  `STATUS` 0x9d, `LEVEL` 0x9e, `HP` 0xa0, `MAX_HP` 0xa1, `TYPE1` 0xae, `TYPE2` 0xaf, `IS_EGG` 0x4c.
- **The lead:** encounters take slot 0, skipping it when it is an egg (`CreateEncountManager`,
  `src/ov036/enc_pokeset.c`).
- **The follower:** the follower code keeps a `FollowingPokemon` (`include/paperwhite2/following.h`: species, form,
  hp, maxHp, personality…). Its talk snapshot `FollowingReactionSnapshot` (`following_reactions.h`) already has
  status, zone, friendship, facing and types. The existing rule fields are zone, species, form, type, hp,
  friendship, status, facing, chance and tile_bounds (`res/paperwhite2/following/dialogues.schema.json`).
- **Steps as the current follower:** per the follower notes, these are stored on the Pokémon, in the bits of Block C
  0x1E that the claim slots free. The module only reads a number its caller supplies.
- **The party's median level:** from the levels of the non-egg members.

### Randomness

- **API:** `include/gfl/random.h`. `GFL_RandomLC(max)` is the global LC generator (`MATHRandContext32` in
  `src/system/gfl_use.c`), and `GFL_RandomMT` also exists. GFL has no per-instance generator, but NitroSDK's
  `MATH_InitRand32`/`MATH_Rand32` on a local `MATHRandContext32` is one.
- **Daily values:** the save has no daily seed. `EncountSave_RerollSwarmLocation` rerolls the swarm at midnight.
  `PaperWhite2_HashDayAndSeason` (static in `paperwhite2_weather.c`, MurmurHash3's finalizer) is already a stable
  hash of the day.
- **Scripts:** `Random` is `GFL_RandomLC(range)`, so script 10852's picks change on every run. They hold only because
  the flags they set are saved.

### When the field reloads the zone

- **The three init script types:** `FieldScript_CallZoneInitCore(gsys, arg, mode, …)` (`src/ov012/script_sys.c`)
  runs a zone's `init_scripts` of one `type`:
  - **2, zone init:** `FieldScript_CallOnZoneInit` runs it after `FieldScript_ResetMapLocalEvents`. It runs on every
    map change (`event_mapchange.c`, right before `CallSpawnAllZoneNPCs`) and on every seamless zone change
    (`fieldmap.c`, before `Field_HotswapSpawnActors`).
  - **3, new load,** and **4, reload:** both run when the field opens, from `fieldmap.c`.
- **Hold across battles and saves:** reopening the field after a battle or a menu runs type 4, not 2, so the zone-init
  picks hold. The field's actors are saved too (`SAVE_BLOCK_FIELD_ACTORS`), so a continued save restores them.
- **Spawning NPCs:** `SpawnAllZoneNPCs` and `SpawnZoneNPCByUID` (`src/ov012/field_actor.c`) create an NPC only when
  its `spawnFlag` is clear (`CheckNPCSpawnFlag`).
- **Period changes:**
  - The props notice a period change through `FieldPropRTCState_Update` / `FieldPropRTCState_HasDayPartChanged`
    (`src/ov036/field_buildmodel.c`), a check each frame.
  - The lighting interpolates continuously (`FieldLight_Update`).
  - Midnight runs `EvTime_Update`'s `midnight()`.

### Memory

- **The DS budget:** `build/w2_us/memory.txt` at this date shows 159 KB left in the DS arena. ARM9 main, overlay 12
  and overlay 36 each "grow 0 bytes before the arena moves", so every byte added to any of them costs the budget.
- **What that means:** main costs it as much as overlay 36, but main is the only place an app overlay (the Dexnav)
  can also call.
- **Data:** tables read from files go into a heap, which is separate from the arena budget.

## 2. The rule format

### Shared condition

**Files:**

- `res/paperwhite2/conditions/condition.schema.json` defines `$defs/condition` and `$defs/rule`. Every consumer's
  schema refers to it, and so does the editor.
- `terrain_groups.json` and `zone_groups.json` sit beside it.

**The condition object.** Every field is optional, and a condition matches when all the fields it sets match.
Lists are any-of.

```json
{
  "season": ["spring", "summer"],
  "time": ["night", "late_night"],
  "weather": ["WEATHER_RAIN", "WEATHER_THUNDERSTORM"],
  "flags": { "set": ["EVENT_FLAG_..."], "unset": ["EVENT_FLAG_..."] },
  "vars": [{ "var": "EVENT_WORK_...", "op": ">=", "value": 3 }],
  "zone": ["ZONE_ROUTE_20"],
  "zone_group": ["castelia"],
  "exterior": true,
  "terrain": ["grass", "dark_grass"],
  "party_level": { "min": 20, "max": 40 },
  "level": { "min": 10 },
  "species": [{ "species": "SPECIES_DEERLING", "form": 2 }],
  "type": ["TYPE_GRASS"],
  "nature": ["NATURE_BOLD"],
  "hp": { "max": 50 },
  "status": ["none"],
  "friendship": { "min": 200 },
  "steps": { "min": 500 },
  "chance": 25
}
```

**How each field reads:**

- `time` uses the game's five periods: morning, day, evening, night, late_night.
- The variable operators are `=`, `!=`, `>=` and `<=`.
- `zone_group` names a group in `zone_groups.json`. A group is built from `parent`, `place` or `area` and explicit
  zone lists, so `{"castelia": {"parent": ["ZONE_CASTELIA_CITY"]}}` covers all 37 zones.
- `level`, `species`, `type`, `nature`, `hp` (percent), `status`, `friendship` and `steps` apply to the consumer's
  **subject**:
  - the follower, for follower rules;
  - the lead (slot 0, not an egg) for encounter and spawn rules.
- `party_level` is the median.
- `chance` is a percent rolled per check. It replaces the follower format's `chance`.

**The rule wrapper.** Consumers embed a rule as their own object, with these shared fields:

```json
{ "when": { /* condition */ }, "priority": 0, "weight": 10 }
```

`priority` defaults to 0 and `weight` to 1. A later version can add `"any": [cond, …]`, one level of OR. The
encoding below leaves room for it, but nothing needs it yet.

### Selection (one algorithm for every consumer)

1. Collect every rule whose `when` matches.
2. Group the matches by `priority`, highest first.
3. Pick from the highest group by `weight` with probability `share`; otherwise go to the next group.

`share` is a property of the consumer, not of the rule:

- **Follower rules and spawns:** `share` is 100%. That is the plain "keep the highest priority, pick by weight".
- **Encounters:** `share` is set per zone and method, and per priority level if needed (for example 40%). A rain-only
  Pokémon at priority 1 then shows in 40% of the encounters in rain instead of 100%, or a few percent if it were mixed
  in by weight alone.
- **The build check** (ROADMAP) still applies: every zone and method has a priority-0 entry with an empty condition
  or a full cover. The editor runs the same check.

### Spawn groups (the NPC spawn system's part)

**The format.** A zone's spawn file lists groups, each made of slots, and each slot of variants:

```json
{
  "groups": [{
    "id": "spring_a",
    "when": { "season": ["spring"] },
    "pick": "one",
    "seed": "load",
    "exclusive": "market_stall",
    "slots": [
      { "weight": 1, "variants": [{ "npc": 12 }] },
      { "weight": 1, "variants": [{ "npc": 14, "priority": 1, "when": { "time": ["night", "late_night"] } },
                                   { "npc": 13 }] }
    ]
  }]
}
```

**What each field does:**

- **`pick`:**
  - `one` picks one slot by weight.
  - `{"n": 2}` picks N slots without replacement.
  - `each` gives every slot its own `chance`.
  - `all` takes every slot.
- **Slots and variants.** The seeded pick chooses the **slot**. The variant shown is the slot's matching variant of
  highest priority, chosen by the rule selection. A night variant therefore replaces its day one without changing the
  pick, which is what script 10852 does by hand. Re-evaluating after a period change keeps the picks and swaps only
  variants.
- **`seed`:**
  - `load` is stable while the player stays in the zone and new on the next zone load.
  - `day` is stable for the day.
  - `check` is drawn anew each evaluation.
  - `{"key": "season_slots"}` shares the pick index among groups with the same key and slot count. This reproduces
    script 10852's coupling, where the seasonless slots take the same random index as the season's slots.
- **`exclusive`:** among the matching groups that share the name, only one spawns. It is picked by priority, then
  weight, with the group's seed.
- **`reevaluate`:** `"load"` is the default; `"period"` re-evaluates variants on a period change (see §4).
- **Unmanaged NPCs:** an NPC that no group mentions spawns as the game decides, by its `spawnFlag`.

## 3. The runtime

### Build-time compilation

`tools/paperwhite2/conditions.py` is a library that every consumer's packer calls. It resolves names to IDs and
writes conditions as **clause lists**. Each clause is 8 bytes:

```c
typedef struct {
    u8 kind;     // CONDITION_SEASON, _PERIOD, _WEATHER, _FLAG, _VAR, _ZONE, _ZONE_GROUP, _EXTERIOR, _TERRAIN,
                 // _PARTY_LEVEL, _LEVEL, _SPECIES, _TYPE, _NATURE, _HP, _STATUS, _FRIENDSHIP, _STEPS, _CHANCE
    u8 op;       // set/unset, =, !=, >=, <=, or the range form
    u16 arg;     // flag, variable, zone, species, a group's index, or a range's minimum
    u32 value;   // a bit mask (seasons, periods, weathers, terrain groups, types, natures), a compared value,
                 // a range's maximum, or a form
} Condition;

typedef struct {
    u8 clauseCount;
    u8 priority;
    u16 weight;
    // followed by clauseCount Conditions, then the consumer's payload
} ConditionRule;
```

A typical rule has two or three clauses, so 20–28 bytes. A table is a header with a count and an offset per rule.
The build drops whatever it can decide itself:

- A zone clause in a per-zone table is always true there, so the clause goes. A rule whose zone clause excludes the
  zone goes entirely.
- A species clause in a per-species follower block is decided the same way.
- Zone groups are therefore needed at run time only for global rules, such as the shared follower block. There they
  compile to sorted zone lists, searched by binary search.

The tables live where the consumers' data lives:

| Consumer | Table | Where | Loaded |
| --- | --- | --- | --- |
| Encounters | one per zone, and one per method inside it | new members of an existing archive (precedent: the follower's `ARCID_MMODEL_TBL` 3–5) | on zone load |
| Spawns | one per zone | same | on zone init (type 2) |
| Follower | shared block + one block per species, as the follower notes plan | the follower's own files | on follower change or zone change |

The exact archive is an open question (§9).

### C API

`include/paperwhite2/conditions.h`, `src/paperwhite2/main/paperwhite2_conditions.c`:

```c
typedef struct {
    u32 filled;            // CONTEXT_WORLD, CONTEXT_TERRAIN, CONTEXT_SUBJECT, CONTEXT_PARTY
    // World
    u8 season;             // GameData_GetSeason
    u8 period;             // GetRealTimeDayPeriod(season)
    u16 weather;           // GetNowWeather
    u16 zone;              // PlayerState_GetZoneID
    u8 exterior;           // given by the caller from the field, or from the zone's area in an app
    EventWork *eventWork;
    u32 daySeed;           // hash of RTC_ConvertDateToDay(getAddressAdventureTimeBlk(gd))
    u32 loadSeed;          // hash of the zone-load counter and the zone (see Randomness)
    // Terrain
    u32 terrain;           // group bits of a tile, from PaperWhite2_TerrainGroups(tile, exterior)
    // Subject
    u16 species;
    u8 form, level, type1, type2, nature, friendship, hpPercent;
    u32 status;
    u16 steps;
    // Party
    u8 partyMedianLevel;
} ConditionContext;

void ConditionContext_FillWorld(ConditionContext *ctx, GameData *gameData);
void ConditionContext_FillSubject(ConditionContext *ctx, PartyPkm *pkm, u16 steps);
void ConditionContext_FillParty(ConditionContext *ctx, PokeParty *party);
void ConditionContext_SetTerrain(ConditionContext *ctx, u32 tileType);   // groups from the class table and the flags

BOOL Conditions_Match(const Condition *clauses, u32 count, const ConditionContext *ctx, u32 *rng);
// The selection of §2 over a table's rules: the rule's index, or -1. share is the consumer's, in percent
s32 Conditions_Select(const ConditionTable *table, const ConditionContext *ctx, u32 share, u32 *rng);
u32 Conditions_Hash(u32 a, u32 b);   // the finalizer that paperwhite2_weather.c has now, made shared
```

**How a caller uses it:**

- **Fill the parts it needs.** A clause on an unfilled part fails, and asserts under `PAPERWHITE2_DEBUG_MENU`. So the
  follower fills the subject, but an encounter doesn't fill the follower's steps.
- **The RNG:** `rng` is a `MATHRandContext32` or a plain u32 state. A `check` seed starts it from `GFL_RandomLC(0)`,
  and a `load` or `day` seed starts it from `Conditions_Hash(seed, groupId)`.
- **Each consumer fills its context once per check:**

  | Consumer | When it fills | Subject | Terrain |
  | --- | --- | --- | --- |
  | Encounter | per roll | the lead | the player's tile (`FieldPlayer_GetTileTypeUnder`) |
  | Spawn | at zone init | the lead | — |
  | Follower | per talk or step check | the follower | its tile (`GetCachedTileUnderActor`) |
  | Dexnav | on opening | — | — |

  The field fills the Dexnav's world context before the app opens and passes it in. That covers the field-only
  `exterior`.

### Where the code lives

- **ARM9 main** (`src/paperwhite2/main/`):
  - The matcher, the selection and the hash.
  - `FillWorld`, `FillSubject` and `FillParty`. They read only GameData and the party, through main's functions
    (`GetRealTimeDayPeriod`, `GetNowWeather`, `PlayerState_GetZoneID`, `PokeParty_GetParam`).
  - The Dexnav, an app overlay, can call them while the field's overlays are out. Battle needs none.
- **Overlay 36:**
  - `ConditionContext_SetTerrain`'s use: tile reads and the 256-byte class→group table, which are field code. The
    table could go in main if the Dexnav ever needs a tile, but it doesn't.
  - The period-change detector (§4).
  - The consumers' field code.
- **Overlay 12:** the zone-init hook (beside `script_sys.c`) and the debug script command.

### Cost

- **Code:** about 1.5 KB in main (the matcher's switch over 19 kinds, selection, the fills) and under 1 KB in
  overlay 36. That is about 2.5 KB of the 159 KB left.
- **Data:** in heaps, so outside the arena budget:
  - a zone's encounter table at 50 entries × about 30 bytes, so 1.5 KB;
  - a spawn table under 1 KB;
  - the follower blocks within its existing 4 KiB buffer.
- **CPU:**
  - A clause is a load, a mask or compare and a branch, a few dozen cycles. 100 rules × 3 clauses is about 10k
    cycles, under 0.2 ms at 67 MHz, once per encounter roll.
  - `FillSubject` costs more, since `PokeParty_GetParam` decrypts a block per call. It runs once per check, and
    `FillParty` once per zone load. The median is cached until the party changes.

## 4. When conditions change

| Input | Changes | How consumers see it |
| --- | --- | --- |
| Season | only on a map change with a loading screen into an exterior | everything reloads with the zone |
| Period | at the hours of `LIGHT_CHANGE_HOURS` | encounters and follower rules read it per check; spawns see it at the next zone load, or at once with `reevaluate: "period"` |
| Weather | at zone change, map change, after a battle, by script | per check; spawns at zone load |
| Flags and variables | any time | per check; spawns at zone load, or on request (below) |
| Zone, terrain | per step | per check |
| Day | at midnight (`EvTime_Update`) | `day` seeds change; spawns at the next zone load |

- **The period detector:** a small check in the field's update. It compares `GetRealTimeDayPeriod` with the last value
  once a second, as `FieldPropRTCState_Update` does for the props, and on a change calls the consumers'
  `OnPeriodChange`.
- **What the spawn system does with it:** for `reevaluate: "period"` groups, it swaps variants only for actors that
  are off-screen, and leaves the rest until they are. The actor mechanics belong to the spawn design.
- **Scripts that change a flag a spawn reads:** they can call a hack command `SpawnRefresh`, as the original scripts
  do with `ObjAdd` and `ObjDel` today.

**Randomness:**

- **The `load` seed** is `Conditions_Hash(zoneLoadCounter, zone)`.
  - `zoneLoadCounter` is a saved u16, incremented in `FieldScript_CallOnZoneInit` (zone init only, so not after a
    battle or a menu).
  - Because it is saved, a continued game re-derives the same picks. Today's scripts rely on saved flags for the same
    effect.
  - Picks need no storage of their own.
- **The `day` seed** is `Conditions_Hash(dayNumber, zone)`, with `dayNumber` taken from the save's clock as the
  weather calendar takes it.
- **`check`** draws from `GFL_RandomLC`.

## 5. The hack save block

**What needs saving now:**

- the zone-load counter (one u16);
- the season setting, already `EVENT_WORK_SEASON_SETTING`.

Follower step counters and pending items live on the Pokémon, per the follower notes. Later: Dexnav records (seen per
zone and condition), spawn "once ever" state (flags do it), and roaming state.

**Candidates:**

| Option | Size | Atomic with the main save | Risks |
| --- | --- | --- | --- |
| Event variables | 2 bytes each | yes | the unused variables aren't surveyed; a base-plus-index access could reach one |
| `DreamRadarSave.padding09` (main save block 0x48, `include/save/cygnus_save_control.h`) | 0xe7 bytes, 0xe4 from offset 0xC aligned | yes; it is in the main save, resident in RAM, with its CRC and backup | `initDreamRadarSave` zeroes it on a new game (fine: version 0 means empty); the Dream Radar flow (`src/ov332/cygnus_flow.c`) writes only `seed`, `received` and `read`; a future finding could show a use |
| Extra save `SAVE_EXTRA_ID_20` (flash 0x7dc00, a 0x400 area, `sExtraBlock20` in `src/system/save_table.c`) | 0xc8 now, up to about 0x3e0 by raising `func_020103f4` | through the dual save | nothing in the game opens it; it has its own CRC and footer; but extra saves aren't resident (`SaveControl_OpenExtraBlock` / `getAddressOfExtraSaveBlk` load it into a heap), so the hack would keep a copy and write it with each save; and its marker and count in the trainer data block need setting |
| Raw flash 0x7eb00–0x7efff | 0x500 | no | outside the save's transactions; Dream Radar's area starts at 0x7f000 |
| Wireless-only blocks (GTS, Dream World, Musical, Wi-Fi list…) | varies | yes | the offline game or Game Sync writes them; rejected |
| A new main save block | — | — | the main save is about full at `SAVE_SIZE` 0x26000, and a new block breaks every existing save |

**Recommendation:**

- **For the conditions module:** event variables only. Take one variable for the zone-load counter, after extending
  `flag_usage.py` (or a sibling) to survey the variables as it did the flags.
- **When the hack needs a block** (Dexnav records, roaming), make a "Paper White 2 block" in
  `DreamRadarSave.padding09`:
  - layout: `{ u8 version; u8 reserved[2]; … }` from offset 0x9, data aligned from 0xC;
  - accessors in `src/paperwhite2/main/`, with version 0 meaning "fresh, initialize";
  - 228 bytes, atomic, resident, and nothing to wire into the save code.
- **Past 228 bytes,** use `SAVE_EXTRA_ID_20`, for up to about 1 KB more.
- **Verify before use:** that the 3DS Dream Radar app writes only the Cygnus area at 0x7f000 and never main save
  block 0x48. The DS code reads the app's data from the Cygnus area and copies only the three fields.

## 6. The debug readout

**The menu:** an `Info` entry in the START debug menu's `L_DebugMenu` (`res/field/scripts/global_10130.s`), added the
way plugins.md's "Debug menu" describes. It runs a hack script command `PaperWhite2ConditionsInfo` (0x2f4, with its
rows in `EVCMD_TABLE` and `EVCMD_PERM_TABLE` and its JSON entry), which fills a context and writes the word buffers
for one message:

```
Season  Summer (mode Weekly)        Period  Night (21:04)
Weather Rain (calendar)             Zone    ROUTE_20 (parent ROUTE_20) outside
Tile    0x0004 0x0005 → grass encounter
Lead    Sewaddle Lv12 HP 80% OK  Nature Bold  Friend 70
Party median Lv 11   Load #3417 seed 1a2b3c4d   Day 9800
```

**A second page, "Test rules":**

- It runs `Conditions_Select` over a small debug table, `res/paperwhite2/conditions/debug_rules.json`, packed like any
  consumer's.
- It shows each rule's name and whether it matched, and the one picked.
- A third line repeats the pick with the load seed, to show that it is stable.

**What it costs:** under `PAPERWHITE2_DEBUG_MENU` only. Names come from existing message banks where the game has
them (species, natures, place names); periods, weathers and groups get debug strings.

## 7. Migrating script 10852 and flags 500–599

**What the script does** (`res/field/scripts/global_10850.s`, `Script_3`). Flag set means hidden. In order:

1. It hides 500–599, then shows 550–559 always.
2. It draws `a ∈ {1,2,3}`, `b ∈ {4,5,6}` and `c ∈ {7,8,9}`.
3. For season `s` (`RTCGetSeason`), it shows `500+10s` and `500+10s+a/b/c`.
4. It shows 540 and `540+a/b/c`, with **the same `a/b/c`**.
5. If `EVENT_WORK_0x401f` ≠ 0 and it is night or late night:
   - It shows 575.
   - It replaces `500+10s+3/6/9`, when picked, with `560+3s+0/1/2`.
   - It replaces 543/546/549, when picked, with 572/573/574.
   - It sets 0x8012 = 1.
6. It shows each of 590–599 with chance 1/10.
7. It clears `EVENT_WORK_0x401f`.

**Who calls it:**

- `route_19`, `floccesy_town` and `floccesy_ranch_2` call it as a type-2 init script, so without night.
- `aspertia_city.s`, `route_20.s` and `virbank_city.s` set 0x401f = 1 first. Virbank then moves NPCs to night spots
  with `ObjInitNPCGPos` when 0x8012 = 1.
- `castelia_city_pokemon_center.s` and `virbank_complex_2.s` call it too.

**Where the flags are used:** in ten maps' events. The same flag serves different NPCs on different maps, since only
the current map's NPCs matter. No map uses 550–559 or 576–589.

**How it maps onto groups,** per zone, generated by a one-off converter from each map's events:

| Script logic | Spawn group |
| --- | --- |
| `500+10s` | group `season_base`, `pick: all`, a slot per season with `when.season` |
| `500+10s+{1,2,3}`, `{4,5,6}`, `{7,8,9}` | three groups `season_a/b/c`, `pick: one`, `seed: {"key": "slots"}`, one per season by `when.season` |
| `540+{1..9}` | groups `any_a/b/c` with the same seed key and three slots, so they keep the coupling (or not; §9) |
| 540, 550–559 | not managed: they are always shown, so they become plain NPCs with flag 0 |
| night replacements 560–574 | a night variant (`priority 1`, `when.time: [night, late_night]`) in the slot it replaces, only in zones that set 0x401f |
| 575 | slot with `when.time` night, in zones that set 0x401f |
| 590–599 | group `rare`, `pick: each`, `chance: 10` per slot, `seed: load` |
| Virbank's night positions (0x8012) | a night variant that is the same NPC at another position, if the spawn format allows a position override; else the script stays |

**After the conversion:**

- The calls to 10852 and the `0x401f` writes go.
- The NPCs' `spawnFlag` becomes 0, or a story flag where one applies.
- Flags 500–599 are released for reuse, after `flag_usage.py` confirms nothing else reads them.

**The check:** the converter reports, for each zone, the set of NPCs each (season, period, a, b, c) combination
shows, under the old logic and under the groups, and requires them to be equal.

## 8. Phasing and tests

1. **The core** (main):
   - the clause encoding, `Conditions_Match`, `Conditions_Select`, `Conditions_Hash` and the context fills;
   - `tools/paperwhite2/conditions.py`, with `condition.schema.json`, `terrain_groups.json` and `zone_groups.json`.
   - **Tests:**
     - **Host:** compile the matcher with the host compiler against tables from the Python packer. For each clause
       kind, the edge values (ranges' bounds, every season and period, every `op`).
     - **Selection:** check its distribution by χ², as the weather date's tests did, and its stability under a fixed
       seed.
     - **Packer:** round-trip tests.
2. **The debug readout** (§6):
   - Check the period on each season's boundary hours by setting the DS clock.
   - Check the weather against the calendar's day.
   - Check the terrain on each group's tiles (Route 20's grass and dark grass, Virbank's puddles, a cave, Desert
     Resort sand, Icirrus snow).
   - Check the lead after reordering the party.
3. **Spawns,** with the migration of §7 and the converter's equivalence report, then in game: each season by the
   fixed modes, night, a reload (picks held), a save and continue (picks held), and a new zone load (picks changed).
4. **Encounters,** with the habitat format and the build's cover check.
5. **Follower rules:** move the existing fields onto the shared condition, then add the new ones.
6. **Dexnav,** whose context is filled by the field.

The hack save block is not needed until phase 6 or later.

## 9. Open questions

1. **The coupled pick:** should the seasonless slots 541–549 keep script 10852's coupling, taking the same random
   index as the season's slots, or be independent? The format allows both.
2. **Period re-evaluation for spawns:**
   - only at zone load (as today);
   - or also on a period change, for off-screen actors;
   - and per group or per zone?
3. **The encounter priority share:**
   - one default (for example 40%) with per-entry overrides;
   - or strict tiers like the follower's;
   - or a weight multiplier instead?
4. **The lead for party conditions:** slot 0 as the encounter code uses, the follower, or the first Pokémon that can
   battle (`PokeParty_GetFirstBattleReady`)?
5. **The median of an even party:** the lower middle level, or the mean of the two middles?
6. **Weather:** the zone's computed weather (`GetNowWeather`) or the weather on screen (`FieldWeather_GetWeatherId`)?
   They differ only during a fade, and maybe under a script's forced weather.
7. **The data's place in the ROM:** new members of an existing archive (the follower's precedent), or a hack archive
   if dsd's file handling allows one later?
8. **The save block:** approve "variables now, `DreamRadarSave.padding09` next, `SAVE_EXTRA_ID_20` beyond". Also, do
   you use the 3DS Dream Radar with the hack? That decides how much the padding risk matters.
9. **Zone groups:** besides `parent` and `place`, which named groups do you want first (cities, caves, coast,
   routes)?
10. **Virbank's night repositioning:** should the spawn format support a variant that only moves an NPC?

## 10. Decisions (2026-10-30)

The user's answers to section 9:

- **Scope now: the engine only.** Read every condition, match rules and expose them to every consumer that needs
  them (C, scripts, the debug Info readout). The NPC spawn system is a placeholder: the user first wants research
  into how NPCs are loaded and moved, whether more NPCs per map are possible without the freeze on entry, and
  spawning NPCs dynamically from a map's encounters. Then either a new method is designed, or the old flag method
  and script 10852 are ported onto the engine.
- **Spawn coupling** (if the flag-style system is kept): chosen per zone, coupled or independent.
- **Spawns change on zone load.** Re-evaluating off-screen NPCs on a period change is wanted too (night spawns such
  as Virbank's Murkrow lingered into daylight).
- **Encounter priority is a share** of the rolls, like mass outbreaks; outbreaks can become a conditional tier.
- **The lead is party slot 0**, which is usually the follower. The **adjusted party median** (the scaled level
  wild Pokémon use) is exposed to scripts, so custom scripts stop computing from slot 0's level.
- **An even party's median is the lower middle level**; level choices take the lower option generally. The
  adjusted-median formula is data the editor can tune, so the "not a difficulty hack" balance can be adjusted.
- **Weather is the computed zone weather** (`GetNowWeather`).
- **Data in the ROM:** new members of existing archives, where it fits best.
- **Save block:** approved. The user won't use Dream Radar; Dream Radar's Pokémon will be obtainable in game.
- **Zone groups:** the game's own parent groups first; custom named groups in the editor later.
- **Moving NPCs:** if no better method turns up, a variant can move an NPC (as the Virbank birds do), so one NPC
  covers several positions.

## 11. As built (phase 1, 2026-10-30)

The engine, its script commands and the debug readout are built (plugins.md, Conditions); no consumer uses them yet,
and the spawn system is an empty placeholder (`include/paperwhite2/spawns.h`). Where the build differs from the
sections above:

- **Files.** The compiler is `tools/paperwhite2/conditions.py` as planned; the C is three files, not one: the matcher
  and selection (`src/paperwhite2/main/paperwhite2_conditions.c`, which reads only the context and the table, so the
  host test compiles it unchanged), the fills (`.../main/paperwhite2_conditions_context.c`) and the field part
  (`src/paperwhite2/ov036/paperwhite2_conditions_field.c`).
- **Kinds.** `CONDITION_ZONE_GROUP` is gone: a zone group compiles to its zones' sorted list, so zone lists and groups
  are one `CONDITION_KIND_ZONE` with `CONDITION_OP_IN_LIST`, at global and per-zone tables alike. Added:
  `SCALED_LEVEL` (the adjusted median's range), `FOLLOWER` (the follower's species, or any). Variables also take `>`
  and `<`. The ops are one enum (`EQ` to `LT`, `IN_LIST`, `ANY`, `RANGE`, `MASK`, `SET`, `UNSET`).
- **The table** has a 12-byte header with its share and size, u16 offsets for the rules and then the lists, and a
  rule's payload runs to the next offset; the lists are shared between rules. `Conditions_Match(clauses, count, ...)`
  became `Conditions_MatchRule(table, index, ...)`, since a list clause needs its table.
- **Selection:** the lowest priority that matches is always picked from, whatever the share, so a share below 100
  never leaves a check with nothing when a default matches.
- **Unfilled parts** fail without an assert under `PAPERWHITE2_DEBUG_MENU`: an assert's error screen would stop the
  game for a data mistake, and the readout shows what is filled.
- **The random state** is a u32 LCG whose output is mixed by `Conditions_Hash`, since neighboring seeds (consecutive
  zone loads) gave neighboring draws from a plain LCG.
- **The day seed** mixes the zone: `Conditions_Hash(dayNumber, zone)`; the load seed is
  `Conditions_Hash(zoneLoadCounter, zone)`, and a pick's start is `Conditions_Hash(seed, key)`.
- **The zone-load counter** is `EVENT_WORK_ZONE_LOAD_COUNTER` (0x4051), surveyed by a new sibling of `flag_usage.py`,
  `tools/paperwhite2/var_usage.py`, rather than an extension of it.
- **Terrain:** 18 groups (indoor and outdoor are two), the class table a list of 51 (class, groups) pairs, not 256
  bytes; the follower's tile is the one its terrain update last read (`PaperWhite2_FollowingGetTile`, grid maps).
- **The tables' place:** members 2 (the debug samples) and 3 (the scripts' conditions) of the weather calendar's
  archive, `a/0/9/6`, added by the hack's build only (`HACK_ARCHIVE_MEMBERS` in `configure.py`).
- **Script commands:** not one `PaperWhite2ConditionsInfo` at 0x2f4 but `GetPartyLevel` (0x2f3) and `CheckCondition`
  (0x2f4) in every hack build, and `Debug` moved to 0x2f5; the readout is the debug menu's Conditions entry with four
  `Debug` actions. `CheckCondition` tests the rules of `script_conditions.json` by their generated IDs.
- **Level scaling** (§10's adjusted median): `res/paperwhite2/level_scaling.json`, `median * 80 / 100 + 0` within
  2-100, wild levels within 5 of it (a median of 50 gives 40, wild 35-45).
- **The lead** is party slot 0 as decided; an Egg there leaves the subject unfilled (its clauses fail).
- **Cost:** about 4.8 KB of the arena, of which about 1.5 KB is the debug readout (plugins.md, Conditions).
