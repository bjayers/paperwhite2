# The Entralink roguelike

The design of the mode that replaces the Entralink's Funfest missions, its Pass Power sources and the Entree Forest.
Nothing is built yet. `entralink.md` is the earlier research on the Entralink as it is (how to get in, the Entree, the
missions, Pass Powers, the forest's engine). Section 3 below is the survey for this mode.

## 1. Decided so far (2026-11-15)

**The premise.** Darkrai has hidden deep in the Entree Forest and trapped the Entralink in a nightmare. Nightmare
Pokémon block the way: corrupted versions of well-known legendaries, larger and stronger versions of ordinary Pokémon,
and creatures that may not be Pokémon at all. The player fights through the forest to Darkrai, ending the nightmares
for a time; the mode is replayable.

**What goes:** the Funfest missions, Pass Powers from missions, and the Entree Forest as it is (its Game Sync
Pokémon). The forest's clearings stay, reused as the rooms of a semi-random, semi-infinite maze.

**What comes:**
- **The hub:** the Entralink's exterior gets NPCs who give information and buffs for the mode. Who they are is open:
  new NPC sprites or existing ones. Cresselia fits the lore but is already in B2W2's post-game, so it may stay out.
- **The Entree** grows with progress in the forest, not with missions, and is where permanent (meta) upgrades come
  from. Which upgrades is open.
- **Rooms:** leaving a clearing by an exit leads to a new room, filled with a challenge the user designs in a new
  editor. Each challenge has a difficulty tier, and fixed boss rooms come at set points.
- **The team:** the player's own Pokémon, set to **level 100** for the run. A Pokémon already level 100 shows its
  prestige level and gains prestige Exp. from the run's battles (`include/paperwhite2/prestige.h`). Prestige may give
  small boosts in the Entralink only; it stays cosmetic elsewhere.
- **The run bag:** a special bag, empty at the start, that holds only items picked up during the run and empties when
  the run ends. Items keep their strategy without trivializing the mode.
- **Catching Nightmares:** not possible with normal balls. A **Nightmare Ball**, given in later runs, catches them
  (the normal forms of the legendaries).
- **Battles:** single, double and triple battles, and **3v1 raids**: three of the player's Pokémon against one very
  strong enemy. No 1v3 (a player with three Pokémon would just use them: that's a triple battle). Battles can't be
  fled: running gives a warning, then returns the player to the entrance and resets the run.
- **Damage carries over:** HP, PP and status stay from room to room; rest rooms heal.
- **Rooms are data, not scripts:** each room shows the entities placed in it in the Entree Challenge editor. A battle
  room has something to battle (talking to it, e.g. a Nightmare Dialga, starts the battle set up for it); a rest room
  has a choice of NPCs; and so on. Per room the user sets the battle, its rules, its difficulty scaling, where the
  enemies stand, and effects such as the weather (or random weather). A few generic scripts read the room's data; no
  room has its own script. Some rooms have random items on the ground.
- **Exit markers:** a hovering marker in front of each exit shows what kind of room it leads to, placed much as
  ambients are.
- **The maps:** `entree_forest` and `entree_forest_6` look the same and both have four exits, so if re-entering a map
  with new entities fails, rooms can alternate between the two. The other clearings have two or three exits and add to
  the dungeon-crawl feel. `entree_forest_2` is the deepest room, Darkrai's.
- **Buff slots:** five, each buff upgradeable a finite number of times; when all five are full, a new buff can replace
  one. Five slots also fit the C-Gear screen.
- **Damage balance targets:**
  - boss HP grows with depth and difficulty, capped at about **50,000**;
  - five buffs, fully upgraded, in the best possible combination: at most about **60,000** in one hit, so a boss can be
    one-shot only with an extremely good combination, and doing so should feel amazing;
  - a full set of one archetype's buffs: about **10,000** on a typical hit.
- **No Pass Powers:** the mode doesn't give them, so the High Link block is free too. The rewards are the special
  Pokémon, the legendaries, prestige Exp. and bonus items from the hub's shop.
- **Seeing power grow:** the enemy's HP as numbers (it scales with depth) and damage numbers on the player's hits.
- **Buffs** are shown on the **C-Gear's bottom screen**, which becomes the run's display while in the Entralink. The
  C-Gear itself stays in the game (its wireless parts are already gone).
- **Run length:** 30–45 minutes.

**Rewards (tentative):**
- Nightmare legendaries that don't fit elsewhere in Unova can be fought again later and caught.
- Darkrai joins the player the first time it's beaten.
- Possibly Pass Power uses, which have no other source once the missions go.
- Rare and valuable rewards, perhaps from a hub shop, for a new currency. Not BP: BP would let easier modes be ground
  for the same rewards.
- Undecided: higher difficulties let the player get the Nightmare bosses themselves.

**Buff philosophy:** multiplicative stacking, so the right combination feels like it breaks the game, and the damage
numbers make it visible. The user's example, a paralysis and Electric set:
- 2× damage to paralyzed enemies;
- more damage the further the enemy is slower than your Pokémon, up to 30%;
- Electric moves do 2×;
- paralyzed enemies float magnetically and count as Flying;
- stat stage changes are twice as effective;
- STAB is twice as effective.

**Staying vanilla:** as close to vanilla mechanics as possible, with the exceptions above kept inside the mode.
Everything new is made by us or uses the user's own graphics.

## 2. Proposals not yet decided

- **Exits show what's behind them** (a marker at each path: battle, elite, rest, shop, event, catch, boss), so the
  route is the player's choice. About three acts of 8–10 rooms, each ending in a Nightmare legendary, then Darkrai.
- **Room types:** battle, elite, rest (heal, or PP, or a buff instead), shop, event (a text choice with a cost),
  catch (a dream Pokémon to keep, with the rising shiny rate), boss.
- **Difficulty tiers** in the style of Hades' Heat and Slay the Spire's Ascension: each adds one named modifier, and a
  tier's rewards come only from that tier.
- **A new currency** for the hub's shop and the Entree's upgrades.
- **Buffs as battle event handlers** for the player's side, the same machinery as the hack's moves and abilities, so
  they can later come from the move and ability effect designer. Vanilla abilities are a ready vocabulary (Simple,
  Adaptability, Tinted Lens and so on).
- **Buff offers weighted towards themes already held**, and rare buffs that need two others first, so combinations
  form within one run.
- **Enemies scale multiplicatively too**, or the late rooms stop mattering.
- **The run bag as its own small bag:** the real bag stays where it is; while in the forest the game's bag reads a
  separate run bag (say 32 items, 16 medicine and 16 berries: 256 bytes), and the bag screen shows only the Items,
  Medicine and Berries pockets. Smaller than stashing those three pockets of the real bag (1,688 bytes) and the real
  bag is never moved. Needs checking that the bag is reached through one getter.
- **The save budget** (3.3, without Pass Powers): Symbol 2,128 + Funfest 252 + High Link 440 = 2,820 bytes. The run
  needs about 1,700: the team's level-100 copies (6 × 220 = 1,320, carrying HP, PP and status between rooms), the run
  bag (256) and the run's state (depth, buffs, seed, currency, about 150). That fits in the Symbol block alone.
- **Buff numbers for the targets:** a strong level-100 hit on a tanky boss is about 400–800 before buffs, so 60,000 is
  about ×75–150 from five buffs, about ×2.4 each at full rank, and 10,000 is about ×12–25, about ×1.7 each. For
  example, three ranks per buff of ×1.3, ×1.7 and ×2.4: a full set at rank 2 is the 10k archetype, at rank 3 the
  60k ceiling. Conditional buffs (paralyzed targets) count only when the condition holds. The engine caps each damage
  step (3.8), so buffs go on different steps (power, attacking stat, final damage); a final clamp holds the hit at the
  ceiling.
- **The Entree as an upgrade tree:** it grows in stages, and each stage opens permanent upgrades bought with the
  currency.

## 3. Survey

Read-only survey of 2026-11-15. **Verified** means read in source or data at the line given; **inferred** means reasoned,
not traced or tested. `entralink.md` section 1 already covers the zones, how to get in and out, the Entree, the missions
and Pass Powers; it is cited, not repeated. Line numbers are in the tree as of this date.

### 3.1 The forest's rooms

**The nine zones are nine layouts, not nine places** (verified):
- `SymbolMap_GetAreaZone` (`src/ov012/symbol_map.c:294-348`) maps any virtual area to one of the 9 zones from which
  sides the area has neighbours. The forest is a virtual grid of up to 28 areas, 3 wide (`SYMBOL_MAP_0..13`,
  `:12-236`; it grows with `deepestArea` and a group, `:375-383`). Area 1 is the top (zone 0x119), area 5 the entrance
  (zone 0x118). The rest pick by exits:

| Zone | Layout | Exits (script) |
| --- | --- | --- |
| 0x118 `entree_forest` | entrance | up, down, left, right |
| 0x119 `_2` | top (dead end) | down |
| 0x11a `_3` | right, down | down, right |
| 0x11b `_4` | left, down | down, left |
| 0x11c `_5` | right, up+down | up, down, right |
| 0x11d `_6` | left+right | all four |
| 0x11e `_7` | left, up+down | up, down, left |
| 0x11f `_8` | right, up | up, right |
| 0x120 `_9` | left, up | up, left |

- Source: `res/field/events/entree_forest*.json` triggers. Each zone is **one map model** (a 1x1 matrix,
  `res/field/matrices/entree_forest_5.json`: `MAP_MODEL_ENTREE_FOREST_5_PALACE07_00_00`), a 32x32-tile clearing
  (arrival coordinates 88..424 in `GetEntreeForestArrivalPos`, `scrcmd_entree_forest.c:~385-405`). So **9 distinct
  clearings** (inferred that all 9 differ visually; their art is not viewed).
- **Exits are fixed tiles in every zone** (verified): up at x15-16 z9, down x15-16 z24, left x5 z15-17, right x26
  z15-17. Each is a trigger with script 10494-10497 (`global_10490.s` Script_5-8): walk one step, then
  `MapChangeEntreeForest dir` (`global_10490.s:~175-237`). The zones have no warps, no NPCs and no bg events in their
  event files, only an init script (type 4, script 10492 = Script_3, `EntreeForestSpawnAllPkm`).

**The destination can be chosen at runtime** (verified):
- `Scrcmd_EntreeForest_MapChangeEntreeForest` (`scrcmd_entree_forest.c:179-205`) asks `SymbolMap_GetAdjacentArea` for
  the next area, then `EventEntreeForestWarp_Callback` (`:~395-430`) sets `GameData_SetEntreeForestArea` (a **RAM-only**
  u8, `game_data.c:105,922`) and warps to `SymbolMap_GetZone(area)` at the arrival position of the exit's side.
- The cleanest hook is `SymbolMap_GetZone` / `SymbolMap_GetAdjacentArea` (both small, `symbol_map.c`): under
  `#ifdef PAPERWHITE2` read the run's own room table instead of the grid. The exit tiles then pick a destination by the
  *direction*, so the marker each exit shows is the run's choice for that side. Alternatively a new script command
  calling `EventEntreeForestWarp_Create(gsys, mode, pos, dir, area)` (`:~365`).
- Any script can also warp anywhere: `MapChangeWarp ZONE_X, x, z, dir` (e.g. `res/field/scripts/black_city.s:74`).
- **Same zone, new room** (inferred): re-entering a zone through the same warp event reloads it (the zone init scripts
  run again), so one of the 9 layouts can be "a new room" each time. Not tested; the first thing to try.
- Actors per room: `ActorNew` (op 105, `Scrcmd_FieldActor_ActorNew`, `src/ov036/scrcmd_field_actor.c:514`) and
  `ActorAdd` create NPCs by script at x, y, direction, sprite and movement; the zone's `npc_cache` is 24
  (`res/field/zones/entree_forest_5.json`). Battles start from script (`CallTrainerBattle`, `CallWildBattleEx` with
  species, level, form, flags). So no per-zone NPC data is needed; a room is a script that builds itself.

**The forest's actors** (verified):
- `EntreeForest_SpawnAllPokemon` (`src/ov033/entree_forest.c:122-166`) reads up to 20 `EntreeForestPokemon` from the
  save (`SymbolMap_CreatePokemonList`, `symbol_map.c:~410`), puts each at one of 3 position tables (top / upper row /
  other, `entree_forest.c:25-62`, +-1 tile of jitter) via `EntreeForest_SpawnPkmActor` (`:64-87`). Each is a `ZoneNPC`
  template (`sPokemonNPC`, talk script 0x28fa = 10490 = `global_10490.s` Script_1) with the save slot and the 4-byte
  Pokémon in the actor's user params 0-2.
- **A challenge NPC fits this exactly:** same spawn function, a different payload (challenge id), a different talk
  script. The positions tables give 20 spots per layout class.
- **Surprise:** the forest does **not** use a normal battle. `EventEntreeForestBattleCall_Callback`
  (`scrcmd_entree_forest.c:256-345`) runs the **PDC proc** (overlay 172, `PdcWork_Create`) plus `EventPdcReturn` (overlay
  330): a catch-only screen. The Dream Ball is added at state 4 (`:287`) and removed at state 5 (`:317`). The new
  mode's fights go through the real battle engine instead (below), not this event.

### 3.2 How the Entree grows in vanilla

- **The hub model does not change** (inferred: no map swap, no prop change found in `res/field/events/entralink.json`,
  `entralink.s`, or `src/ov033/`). The Entree is a bg event (`entralink.json`, script 4) and opens the monolith
  (`src/ov143/`), whose screens only print levels and records.
- **What does change is `GimmickFunfestLevels`** (`src/ov130/gimmick_funfest_levels.c`, field gimmick 0x82 in
  `field_gimmick.c:89`; which zone selects it is inferred to be the hub, from `event_funfest_mission.c:51,72`): ten
  models, five lit steps for Black (models 0-4) and five for White (5-9). The step is `level / 6`, capped at 4
  (`:250-258`), shown at fixed positions (x 504, z 552-584) (`ShowLevels`, `:261-293`) with a start and leave effect.
  The levels come from `GameData_GetMyPassPowerLevels` (`HighLinkSave` `levels`, `high_link.h:14-19`).
- **Also the forest grows** by `deepestArea` and group (3.1).
- **Hook for our own progress:** `GetLevelSteps` / `GimmickFunfestLevels_ShowLevels` (`:250,261`): replace the two level
  reads with the run's meta-progress value. 5 steps x 2 sets is the whole vocabulary; more stages need new models
  (map art) or another gimmick. Note it reads `commWork` only for other players, so offline it shows our own.

### 3.3 Save space freed

All sizes verified. Blocks are fixed slots in the flash (`save-expansion.md` section 1, 2.4: growing a block breaks old
saves; contents can change freely). So **reuse in place, never resize**.

| Block | Size | Where | What it holds / what is reusable |
| --- | --- | --- | --- |
| Symbol (`AreaNPCSave`, block 0x3c) | **0x850 = 2128 B** | `include/save/symbol_save.h`; slot at 0x22a00 (`save-expansion.md:86`) | 530 Pokémon x 4 B (2120) + `deepestArea` + checksum/seed. All of it is forest-only. Encrypted, with its own checksum, so a reuse writes its own layout (`SymbolSave_Decrypt` etc. go) |
| Funfest (`FunfestSave`) | **0xfc = 252 B** | `include/save/funfest_savedata.h:26-40`; 0x25900 | 55 mission records x 4 B, hosted/joined/completed, `levelPoints[2]` (White/Black), `mostParticipants` |
| High Link (`HighLinkSave`) | **0x1b8 = 440 B** (inferred from the layout, u64 aligned) | `include/save/high_link.h:20-31` | levels (0x10), `unk10[0x190]` (the Pass Power data the game uses), 3 power slots, special flags, play seconds. Free: the mode gives no Pass Powers (section 1) |
| Bag (`BagSave`) | **0x9ec = 2540 B** | `include/save/bag.h:30-38` | 310 items, 83 key items, 109 TMs, 48 medicine, 64 berries, all 4 B (id, count), + 21 u32 free-space bits |

- **Stashing the real bag:** Symbol + Funfest = 2380 B, Symbol alone 2128. The whole bag (2540) does **not** fit even in
  Symbol + Funfest + HighLink (2820 total, in three separate blocks). Without key items (332 B) it is 2208, still over
  Symbol alone. It fits if the stash is **compact**: TMs/HMs need a bit each (count max 1, `BAG_TM_HM_COUNT_MAX`), and
  the free-space bits are dropped (~200 B): about 1500 B for the rest, which fits Symbol alone. Alternatively keep key
  items in the bag and stash only the others, or stash everything across Symbol + Funfest.
- The run's own state (room, buffs, run bag, seed) also needs saving and the area byte is RAM-only (3.1), so a save
  mid-run needs a few hundred bytes of the same space. **There is no other free space** (`save-expansion.md:23`:
  0x5c bytes left in the main save).
- Other Entralink-only blocks: none found. `SAVE_BLOCK_SURVEY` (the Research Radar, `save_table.c:142`) is also dead but
  was not sized.

### 3.4 Level 100 for the run

- **The mechanism exists and can raise** (verified): `PokeRegulation_ApplyLevelToParty` (`src/system/poke_regulation.c:
  366-381`) with `getLevel` (`:346-363`) modes 3 (cap), 4 (set exactly), 5 (raise to a minimum); `setLevel`
  (`src/system/poke_tool.c:2583`) sets the Exp. for the level and recalculates stats. Its callers work on a **copy**
  (`ov213/battle_select.c:189` uses `pokeList->party`).
- **The Battle Institute / Subway tool** does it with `RestrictPlayerParty(src, dest, count, level)`
  (`src/ov012/fld_btl_inst_tool.c:240-257`): copies each Pokémon with `copyPartyPkm` and `setLevel` if `level != 0 &&
  level != its level`; it works up or down. `SetupInfinityDungeonBattle` (`:123`) is the Trial House battle with
  `minLevel`/`maxLevel`. The real Pokémon are untouched.
- **Exp:** `ServerControl_CheckExpGain` is gated by `func_ov167_0219bdfc` (`src/ov167/btl_main.c:1578-1592`): only
  `battleType <= 1` (wild and normal trainer), not the 0x200 flag, not a Studio. Subway and Institute battle types
  (>= 2) give none. Level up then runs `ServerControl_GiveExp` (`btl_server_flow.c:5569-5620`).
- **Consequence for the run (inferred):** a normal field battle uses the real party, so the run needs either (a) a
  battle-time copy at 100 (the Subway way; HP and PP carry over by copying back after each battle, written by us), or
  (b) the real Pokémon set to 100 on entry and restored on exit (needs a stash of level, Exp., stats; moves learned at
  100 are a problem). (a) is safer. Prestige is added to `GetSrcData(mon)`, the *battle's* Pokémon
  (`btl_server_flow.c:5600`), so with a copy the prestige must be copied back for originally-100 Pokémon.

### 3.5 Battle formats

- **Style comes from the setup** (`BtlSetup.battleStyle`, `BTL_STYLE_SINGLE/DOUBLE/TRIPLE/ROTATION`,
  `include/constants/battle.h:5-8`). `BtlMain_SetupAloneTriple` (`btl_main.c:714-760`) makes two clients with 3 cover
  positions each; `GetValidPosMax` (`:1602`) gives 6 positions. `BtlSetup_SetTrainer3v3` and the wild triple the hack
  added (STATUS 2026-10-30, tested by the user) cover both enemy kinds.
- **Empty positions are normal** (verified): `BtlPosPoke_SetupPos` (`src/ov169/btl_pospoke.c:28-44`) leaves a position
  with no mon as `BTL_POSPOKE_NO_MON`; a triple where a side falls to 2 mons already plays on. Vanilla also **moves a
  lone mon to the center** when both sides have exactly one alive (`ServerControl_TripleBattleShiftToCenter`,
  `btl_server_flow.c:5080-5113`, command `SC_MOVE_TO_CENTER`).
- **3v1 and 1v3** (inferred, not tested): a party of 1 means slot 0 only, which is the **left** position (center is
  slot 1, `IsTripleCenterPos` pos 2/3, `btl_main.c:2767`; `ServerControl_TripleShift` `btl_server_flow.c:1163`
  moves slot 0/2 to the center by the Shift action). The shift-to-center rule needs both sides at one mon, so a 3v1
  stays on the left unless a hook moves it at battle start (reuse `ServerControl_MoveCore` and `SC_MOVE_TO_CENTER`).
  Risks: `numCoverPos` is 3 (`btl_main.c:735+`) and `ServerControl_RequestChangeForEmptyPos`, the party list and the
  AI assume reserves, so check them with a one-mon party. The Subway's `partyCount` in `RestrictPlayerParty` shows a
  setup can be given fewer Pokémon than cover positions.
- Practical route: build the setup ourselves like `SetupInfinityDungeonBattle` (custom party of any count, any style),
  in one new field event, not through the trainer data.

### 3.6 Running away

- **Client:** `BattleClient_ActionSelectEscape` (`src/ov167/btl_client.c:2984-3064`) switches on `GetRunMode`
  (`btl_main.c:1664-1680`): mode 0 wild (run, with trap checks), mode 1 normal trainer ("no running", message 0x4c),
  mode 2 for battle types 2 and 3 and Studio: message 0x4d, a **Yes/No** (strings 3:8 and 3:9) and then the escape.
  **Mode 2 is exactly the warning prompt we want.**
- **Server:** `ServerControl_Escape` / `EscapeSub` / `EscapeCore` (`btl_server_flow.c:1230-1350`); in mode != 0 the
  escape always succeeds (`:1264-1282`). The battle then ends with `BTL_RESULT_FLEE` (`include/battle/btl_result.h:12`)
  in `BtlSetup.result` (`btl_setup.h:96`), which the field event reads after the battle.
- **Hook:** in `GetRunMode` return 2 for a run battle (a `BtlSetup` flag or the battle type), then have our field event
  treat `BTL_RESULT_FLEE` as "run lost" (warp to the entrance, reset the run) instead of ordinary flee. No change to
  the escape code is needed beyond the message text. Also blocked: Teleport, Roar-style forced exits and trapping
  abilities still go through `EscapeCore`; check the run battle's flag there (inferred).

### 3.7 Catching

- **Trainer battles refuse balls** in `ThrowBall` (`src/ov167/btl_server_flow_sub.c:908-955`): only
  `BtlSetup_GetBattleType() == 0` (wild) runs `CheckBallCapture`; otherwise `SC_BALL_THROW_TRAINER` ("don't be a thief",
  `btl_client.c:6295`) and the ball is spent. Run battles that are not wild therefore cannot catch with any ball.
- **Run-only Nightmare Ball (inferred route):** make the nightmare fights `battleType 0` (wild, via the wild setup) with a
  flag, and give the ball a new item id; `CheckBallCapture` (`:959-1035`) and `GetBallCaptureMod` (`:1037+`) take the
  item, so a ball that only works on flagged mons is one extra case; elsewhere (`BtlServerCmdQueue_Put(... SC_BALL_THROW
  ... item)`) the item is passed through. Normal balls get refused for flagged mons the same way.
- **Precedent for giving and taking a ball:** `BagSave_AddItemAsFirst(bag, ITEM_DREAM_BALL, 1)` before the proc and
  `BagSave_SubItem(...)` after (`scrcmd_entree_forest.c:287,317`). With the swap-bag design the run bag can simply hold
  the Nightmare Ball.

### 3.8 Damage numbers and HP numbers

**The multiplier pipeline** (verified, `ServerControl_CalcDamage`-style code at `btl_server_flow.c:3640-3716`):
1. `BATTLE_EVENT_FIXED_DAMAGE` (0x46) may set a fixed damage and skip the rest.
2. `ServerEvent_GetMovePower` (`:6834`): `BATTLE_EVENT_MOVE_BASE_POWER` (0x37), then `BATTLE_EVENT_MOVE_POWER_RATIO`
   (0x38) on `BATTLE_EVENT_VAR_POWER_RATIO` (fx32, 0x1000 = x1, clamp 0x29 to 0x200000, `:6848`).
3. `ServerEvent_GetAttackPower` (`:6868`, `BATTLE_EVENT_ATTACK_STAT` 0x3b) and `GetTargetDefenses`
   (`BATTLE_EVENT_DEFENSE_STAT` 0x3c): ratios clamped 0x19a to 0x20000 (`:6910`).
4. `CalcBaseDamage` (`btl_calc.c:194`): `power * attack * (level*2/5 + 2) / defense / 50 + 2`.
5. Then, in order: the move ratio, weather, x2 critical, the 85-100 roll, `SAME_TYPE_BONUS` (0x41, Adaptability),
   type effectiveness, burn, and last `BATTLE_EVENT_DAMAGE_RATIO` (0x47) on `BATTLE_EVENT_VAR_RATIO` (clamp 0x29 to
   0x20000 = x32, `:3702`) and `BATTLE_EVENT_DAMAGE_CALCULATED` (0x48).
- **A buff handler** is a `BattleEventHandlerEntry {event, fn}` that calls `BattleEventVar_MulValue(VAR, FX32_CONST(n))`
  after checking the attacker with `BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId`
  (`src/paperwhite2/ov167/paperwhite2_battle.c:72-80` Grav Apple, `:174-183` Fickle Beam x2). Handlers are added per
  Pokémon through an `PaperWhite2_EventAdd...` function returning the table.
- **Each event is a separate multiplicative stage, but each clamps** (`BattleEventVar_ClampValue`, `battle_event.c:578`):
  the final damage ratio caps at **x32**, the power ratio at **x512**, each stat ratio at **x32**. Stacking six x2
  buffs on one event (64x) is cut to 32x. Spread buffs over different events (power / attack / STAB / final) for more.
  The user's example (x2 paralysed, x2 Electric, x2 STAB bonus, speed up to x1.3, ...) fits if split.
- **Integer types and overflow** (verified): everything is u32 `fixed_round(value, ratio)` = `value*ratio` then `>>12`
  (`btl_calc.c:257-270`), which wraps if `value * ratio >= 2^32`: for the final x32 ratio, a damage over 32 768 wraps.
  `ServerEvent_GetMovePower` and `GetAttackPower` return **u16** (`:6834,6868`), so power and attack stop at 65 535, and
  `CalcBaseDamage`'s `power * attack * 42` wraps once `power * attack > ~1.0e8` (for example power 5 000 x attack
  20 000). At level 100 with normal numbers this is far off; stacked buffs are what can reach it. Fix with a u64 or a
  saturating multiply, under `#ifdef PAPERWHITE2`.
- **HP is u16** everywhere: `BattleMon.maxHP`/`hp` (`btl_pokeparam.h:116-117`), `HPSub`/`HPAdd` take u16, and the
  client commands carry `(u16)damage` (`ServerDisplay_DecreaseHP`, `btl_server_flow.c:6097-6102`:
  `SC_OP_SUBTRACT_HP`). **Max HP and any one hit are capped at 65 535**. Stats in the party Pokémon are u16 as well,
  so an enemy scaling "with depth" past that needs a battle-only rescale (HP shown as a multiple) or a wider type in
  those commands.
- **HP numbers** (verified): `BtlvGauge_DrawHpNumbers` (`src/ov168/btlv_gauge.c:1228-1270`) copies up to **3 digits** of
  HP and 3 of max HP into the number actor's tiles (the sprite is 7 tiles wide, `GAUGE_TILE_DIGITS` 0x520). The actor
  (`hpNumActor`, created for every gauge, `:519-522`) is shown only for the player's side, by `!(i & 1)` at `:157`,
  `:206`, `:1151`, and positioned only for `!side` (`:679-688`); a button toggles numbers vs. bar (`showNumbers ^= 1`,
  `:159`). **The enemy side already has the actor**, so showing it is: drop the `& 1` tests, add a position for
  `side == 1` per style. Widening to 5 digits needs a wider sprite cell, new tiles and a layout (art, M).
- **Damage amount on the view side:** `SC_OP_SUBTRACT_HP (monId, (u16)damage)` is the command that carries it; the
  client applies it to its copy before `SC_DAMAGE` (monId, critical, move; `btl_client.c:5355`, no amount) runs the
  animation and `BtlvGauge` `StartGaugeHP`. A pop-up hooks the client's SC_OP_SUBTRACT_HP handler (the amount) and
  stores it for the following `SC_DAMAGE`. The multi-target `SC_DAMAGE_PLURAL` has per-mon `ServerDisplay_DecreaseHP` calls
  before it (`btl_server_flow.c:5783`).
- **OBJ budget** (verified in part): the gauge unit is `ClActUnit_Create(40, ...)` (`btlv_gauge.c:109`), `btlv_clact.c:77`
  another 25, the B-gauge 7. The DS has 128 OBJ per engine; the actual free count in a triple battle was not measured.
  A pop-up per hit needs 4-5 actors, so measure before relying on it.

### 3.9 The C-Gear in the Entralink

- **What the blank screen is** (verified): `FieldSubscreen_GetOverrideScreen` (`src/ov036/field_subscreen.c:268-283`)
  returns `FLD_SUBSCREEN_ID_BLANK_STANDBY_2` for the hub and forest zones, whose entry runs the **NoGear** proc (overlay
  80, `src/ov080/no_gear.c`, 190 lines): one backdrop on sub BG 6 (C-Gear archive file 2 chars + file 3 screen, palette
  by gender), an `Idle` function, no touch, no text, no actors.
- **Mechanics for our own screen:** the touch screens are a table, `sFieldSubscreenDefs` (`:150-180`), indexed by the
  `FieldSubscreenID` enum (`include/field/subscreen.h:10-25`), each with init / update / event-check / terminate / draw.
  The override is picked at `FieldSubscreen_GetIDForChange` (`:285-304`) and, via `FLD_SUBSCREEN_ID_ENTRALINK`, in
  `FieldSubscreen_ReqChange`.
- **Cleanest route (inferred):**
  1. Add `FLD_SUBSCREEN_ID_RUN` before `FLD_SUBSCREEN_ID_MAX`, a table entry whose functions live in `src/paperwhite2/
     ov036/` (the same overlay as the table), and return it from `GetOverrideScreen` for the Entralink zones instead
     of `BLANK_STANDBY_2`. The enum is the table's size, so check other `[FLD_SUBSCREEN_ID_MAX]` arrays and the
     previous-screen test at `:472`.
  2. Base it on NoGear's setup (same BG, same palette) and draw buffs as sub-screen BmpWin text and sprites (the
     Funfest screen, `FieldSubscreen_FMission_*`, is the nearest existing "status on the touch screen" example).
  3. Or extend NoGear itself (smaller, no table change, but its overlay then holds text code).

### 3.10 Prestige

- In `ServerControl_GiveExp` (`btl_server_flow.c:5600-5617`), a level-100 Pokémon's gain is turned into Prestige Points
  (`PRESTIGE_UNITS_OF`, one per 10 Exp., `include/paperwhite2/prestige.h:19-23`) by `PaperWhite2_AddPrestigeExp(pkm,
  exp)` (`src/paperwhite2/main/paperwhite2_prestige.c:67`), with messages and `SC_PRESTIGE_*` commands. So any battle
  with `battleType <= 1` (3.4) that awards Exp. already gives prestige to level-100 Pokémon, and the run's battles
  inherit it, provided the Pokémon in the battle is the one that keeps the prestige (3.4).

### Effort and risks

| Piece | Size | Notes |
| --- | --- | --- |
| Rooms: runtime destination + same-zone reuse | M | `SymbolMap_*` hook or a new warp command; scripted room builder; the reload of the same zone must be tested |
| Challenge NPCs and room scripts | M | reuses `SpawnPkmActor` / `ActorNew`; the editor for challenges is separate (L) |
| Forest content removal | S | Game Sync Pokémon gone; the PDC proc unused |
| Hub NPCs and info | S-M | dialogue and sprites; the NPC art is the user's |
| Entree growth by our value | S-M | `GimmickFunfestLevels` reads; 5 steps only without new models |
| Save space (Symbol/Funfest reuse, run state) | M | own layout, own checksum; bag stash must be compact (3.3) |
| Level 100 battle copy and write-back | M | like `RestrictPlayerParty`; prestige and HP write-back are the risk |
| 3v1 / 1v3 formats | M | engine allows empty positions; center placement hook; AI / party list with 1 mon untested |
| Run = loss with warning | S | `GetRunMode` 2 + result handling |
| Nightmare Ball | S-M | one item, one capture case; item data and text |
| Buffs as battle handlers | M each family | the machinery exists; the x32 / u16 caps need care; u32 overflow fix |
| Damage numbers | M | needs a stored amount and an OBJ budget check |
| Enemy HP numbers (3 digits) | S; wider digits M | the actor already exists on both sides; 5-digit HP needs art |
| C-Gear run screen | M | new subscreen ID and text; no art if text-only |
| Prestige in run | S | already in the Exp. path |

**Riskiest unknowns:**
1. 3v1 / 1v3 with a one-Pokémon side, never run in the engine (3.5).
2. Same-zone re-entry as a fresh room (3.1), and keeping the player's state across room warps.
3. Level-100 copy: writing HP, PP, status and prestige back, without touching real Pokémon on a loss.
4. u16 limits: HP and a hit at 65 535, and power x attack overflow with stacked buffs (3.8).
5. Battle OBJ budget for a damage pop-up in triples (not measured).
6. Whether the whole bag stash fits (only a compact layout does) and the run state's place in the save.

## 4. Open questions

- The run's room count: about 15–18 rooms (three acts of five plus a boss, then Darkrai) at 1.5–3 minutes a room, to
  confirm in playtesting.
- Who runs the hub; what the Entree's upgrades are.
- What prestige gives in the Entralink, if anything.
- Whether Pokémon below level 100 gain any Exp. from the run.
- Whether higher tiers give the Nightmares themselves.
- The first prototype: one hub NPC, a few random rooms (proving a map re-entered as a new room) and one 3v1 raid
  (proving a one-Pokémon side in a triple battle, standing in the centre).
