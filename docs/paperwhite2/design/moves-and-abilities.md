# New moves and abilities

Research and design for adding new moves and abilities to Paper White 2 from the editor ("Add move", "Add ability"),
with full in-game support. The first are the Applin line's: the moves Grav Apple, Apple Acid, Body Press, Syrup Bomb,
Dragon Cheer and Fickle Beam, and the abilities Ripen, Bulletproof and Supersweet Syrup. Today they have Gen 5
stand-ins ([new-species.md](new-species.md) §18.2). Others come later, and a Fairy type perhaps someday (§8).

**Evidence.** Everything below was read from the source, the packers, `generated/`, `res/`, the extracted White 2
archives (`extract/w2_us/files`, member counts measured) and a local clone of White2Upgrade (read only, no code copied).
What is inferred and not traced is marked *(inferred)*. Line numbers are from commit `2f4db5f80b`.

## 1. Summary

- **IDs:**
  - New moves are appended to `generated/moves.txt` from **560**. Today it has `MOVE_NONE` and 1-559, up to Fusion
    Bolt.
  - New abilities are appended to `generated/abilities.txt` from **165**. Today it has `ABILITY_NONE` and 1-164, up
    to Teravolt.
  - No existing constant changes, as for species (new-species.md §2.4).
- **Limits:**
  - Moves are u16 everywhere a Pokémon, learnset, trainer or facility stores them, so there is no real ceiling.
    Entree Forest's records are the exception, with 10 bits (1023).
  - Abilities are **u8** in the box data and the species data, so **255** at most (90 new).
  - The move animation archive works up to move 560. From 561 the battle view takes the ID as one of its own effect
    animations (§2.6), so every new move needs an animation mapping. That is the one structural trap.
- **How hard each kind is**, once the shared groundwork of steps 1-3 exists:

  | Kind | What it takes | Applin's |
  | --- | --- | --- |
  | A move whose effect the move data can express (damage, stat changes, a condition, drain, recoil, multi-hit, priority, flags) | **data only**: a `data.json`, a reused animation, an AI effect | Apple Acid |
  | A move that behaves exactly like an existing one, with other numbers | **data only**: "handlers like MOVE_X" (§5) | none |
  | A move with a small new rule (a power modifier, a stat swap, a crit boost) | **a short C handler** (10-30 lines) in the hack's battle file, or a reusable block (§5) | Grav Apple, Fickle Beam, Body Press (plus a 5-line hook), Dragon Cheer |
  | A move with a new mechanism (a new volatile condition) | **medium C** across the condition system, then data | Syrup Bomb |
  | A new ability | **always C**: a handler table in the hack's battle file, usually a copy of an existing ability's with a change. Some also need a move flag, a Mold Breaker entry or an AI line | Bulletproof (small), Supersweet Syrup (small), Ripen (medium) |
  | A new type | **large**, cross-cutting (§8) | |

- **Biggest risks:**
  - **(a) Animation IDs:** a move ID ≥ 561 plays a status or effect animation unless it is mapped (§2.6).
  - **(b) Easy Chat:** appending moves or abilities renumbers every Easy Chat word after them, which shifts the words
    in saves and the plain build's `pms_words.h`. The move and ability categories need a cap, as species have (§2.3).
  - **(c) Hard-coded counts:** the ability table's loop runs to `0x9e`, Metronome's to `0x230`, the condition list's
    to 35, and the hack's own Move Effectiveness Preview gives up on abilities past Teravolt (§2.4, §3.3).
  - **(d) Saves keep the stand-ins:** a caught Pokémon stores its ability and moves. Applins caught before step 5 keep
    Harvest and Seed Bomb (§7).
- **Build order** (§9):
  0. name the battle events;
  1. appending packers and caps, byte-identical with nothing added;
  2. a data-only move in battle (Apple Acid) and the animation map;
  3. an ability with handlers (Bulletproof);
  4. Add move and Add ability in the editor;
  5. the Applin line's real moves and abilities, replacing the stand-ins;
  6. later: blocks as needed, custom animations, Fairy.

## 2. Moves today

### 2.1 The data

- **The move data archive** `a/0/2/1`: one 0x24-byte member per move, 560 members, numbered by move ID.
  - Read by `PML_MoveGetData` (`src/system/move_tool.c:63`), with or without the battle's cache, as
    `GFL_ArcSysRead(..., ARCID_MOVE_INFO (21), move)`.
  - The record is `MoveData` (`move_tool.c:20`):

| Field | Type | `data.json` | Notes |
| --- | --- | --- | --- |
| type | u8 | `type` | `TYPE_*` |
| quality | u8 | `quality` | `MOVE_QUALITY_*` (14 kinds, `constants/battle.h:100-113`): **what the battle does with the move** (§2.4) |
| category | u8 | `category` | status, physical or special |
| power, accuracy, pp | u8 ×3 | | accuracy 101 = never misses |
| priority | s8 | | |
| hitMin, hitMax | 4 bits each | `hits` | multi-hit |
| condition | u16 | `inflicts.condition` | `CONDITION_*` (0-35) |
| conditionChance, Duration, MinTurns, MaxTurns | u8 ×4 | `inflicts` | duration is the condition's kind: 1 permanent, 2 turns, 3 while the user stays in, 4 that and turns (`BtlCalc_MakeMoveCondition`, `btl_calc.c:375`) |
| critStage, flinchChance | u8 ×2 | | 6 = always a critical hit |
| effect | u16 | `effect` | `BATTLE_EFFECT_*` (0-337, `constants/move_effects.h`). **Read only by the trainer AI** (six reads in `src/ov170/tr_ai.c`, none elsewhere) |
| drain, heal | s8 ×2 | | percentages; negative is recoil or HP cost |
| target | u8 | `target` | `MOVE_TARGET_*` (14, `battle.h:83-96`) |
| stat changes | 3 × (stat u8, stages s8, chance u8) | `stat_changes` | |
| "SS" marker | 2 bytes | | |
| flags | u32 | `flags` | `MOVE_FLAG_*`: **bits 0-13 used, 14-31 free** (no original move sets one, checked over `res/moves/`) |

- **In `res/`:** `res/moves/<move>/data.json` with `move.schema.json`, packed by `tools/data/move_data.py`. Its
  `pack` takes the moves in the order of `generated/moves.txt` and requires them numbered from 0 with no gaps
  (`ordered_moves`). So appending a constant and a folder is all a new move's record needs.
- **Text:** the name and description are in the move's `data.json`. The banks take them with `\from`, so they grow
  with the list:
  - `move_names.txt` (bank 403) `\from{moves.name}`;
  - `move_names_upper.txt` `\from{moves.name_upper}`;
  - `btl_main_13.txt` (bank 402) `\from{moves.description}`.

  Every original name is at most 12 characters, so treat 12 as the limit until a longer one is tested on the summary
  and the battle menu.
- **The editor already edits every move's `data.json`** through the generic schema form. What is missing is adding one.

### 2.2 What stores a move, and how wide

| Where | Width | |
| --- | --- | --- |
| Box data `moves[4]`, `pp[4]`, `ppUps[4]` (`include/pml/poke_party.h:78-80`) | u16 move, u8 PP | the save is unchanged |
| Level-up learnsets `a/0/1/8` (u16 move + u16 level, `species_data.py:389`), egg moves `a/1/2/4` (u16) | u16 | |
| Trainers' parties (`trainer_data.py`, `MON`'s moves), facility sets (`facility_data.py`, `SET`), trades | u16 | |
| Evolution "knows move" parameter (`EVO_METHOD_KNOWS_MOVE`, `PARAM_PREFIXES` 21) | u16 | Hydrapple's evolution can name the new Dragon Cheer as data |
| TMs (`TM_MOVE_LIST`, `src/system/pml_item.c:123`), move tutors (`paperwhite2_move_tutors.c`, the species' tutor bits) | C tables of u16 | a new move in a TM or tutor is a C table change, as today |
| Battle actions (`btl_action.h:27`, 16 bits), events (`subId` u16) | 16 bits | |
| Entree Forest (`include/field/entree_forest.h:20`) | **10 bits** | 1023; only its own encounters |

### 2.3 What is sized or bounded by the move count

| Site | Today | For new moves |
| --- | --- | --- |
| Easy Chat: `tools/text/pms_words.py` counts every message of `move_names_upper.txt` as a word (`message_count`, line 73); the categories after it (types, abilities, then all the people and feelings words) start after it | moves are 560 words | **Cap the category at the original 560** (as `LAST_WORDS` caps species at the Bad Egg, line 27). Abilities after Teravolt need the same cap. Without the caps, every later word's number shifts: the Easy Chat sentences in the save change meaning, and `constants/pms_words.h` changes, so the plain build's `pms_data.c` and `pms_input_data.c` no longer match |
| Metronome: `BtlCalc_PickRandomMove` (`btl_calc.c:477`) loops `move < 0x230` over a buffer of `0x230` (`btl_calc.c:90`) | new moves never called | `#ifdef PAPERWHITE2`: the generated move count, so Metronome can call them (or not: an open decision) |
| Move animations (§2.6) | IDs ≥ 561 are effect animations | the animation map |
| Wireless (Mystery Gift `move < 560` in `mystery_gift_data.h:131`, the trial download's loops `ov326/t_download_save.c:128`, beacons `MOVE_FUSION_BOLT + 1`) | | ignore; they go with the wireless removal |
| Box search, Easy Chat input lists (`pms_input_data.c`) | lists of the original moves and abilities | new ones aren't in them; generated lists are optional later |

Nothing else in the battle or the field is an array indexed by move (`[MOVE_...] =` initializers: none; `move >= 0x...`
checks in the battle overlays: only the two above).

### 2.4 How the battle runs a move

`ServerControl_ExecuteMove` (`src/ov167/btl_server_flow.c:2036`) dispatches on the move's **quality**:
- damage qualities (0, 4, 6, 7, 8) go through `ServerControl_DamageMove`;
- the others go to `SimpleEffect` (stat change), `SimpleCondition`, `StatChangeAndCondition`, `OHKO`, `ForceSwitch`,
  `SimpleRecover`, `FieldEffect` and, for side and "special" moves, `UncategorizedMove`.

Each of these reads the move's data: stat changes, condition and chance, drain, heal, flags. So **most moves are
data**: the 14 qualities with their fields cover every move that only damages, inflicts, changes stats, drains,
recovers or does several of these.

What a move does beyond its data comes from **its handlers**:
- `sMoveEventAddTable` (`src/ov167/move_handlers.c:607`) has 258 rows of `{ MOVE_X, EventAddX }`, keyed by move ID.
- `MoveEvent_AddItem` (`:872`) registers the move's handler table for the time the move runs, as factor type 0.
- A handler is `{ event, function }` (`BattleEventHandlerEntry`, `include/battle/btl_event.h:14`). It reads and
  rewrites the event's variables (`BattleEventVar_GetValue`, `_RewriteValue`, `_MulValue`), and queues its effects as
  handler work (`BattleHandler_PushWork`: stat changes, damage, messages, flags...).
- Several moves share a function where the rule is the same: Flail and Reversal; Morning Sun, Moonlight and
  Synthesis; the pledges.

**The events and variables are bare numbers in the decomp** (`0x37`, `0x38`, `0x3b`, `0x55`...). These are the ones
this design touches:

| Event (number) | When | Variables used |
| --- | --- | --- |
| 0x37 | base power (`btl_server_flow.c:6839`) | 0x30 power |
| 0x38 | power multiplier (`:6841`) | 0x31 ratio (fx32 ×0x1000) |
| 0x39 | before the attacking stat (`ServerEvent_GetAttackPower`, `:6860`) | 0x3b whose stat (Foul Play) |
| 0x3b | attacking stat multiplier | 0x33 stat, 0x35 ratio |
| 0x2d | no-effect check (Soundproof) | 0x12 move, 0x40 "no effect" |
| 0x55, 0x8a | a Pokémon enters | 2 its ID (Intimidate) |
| 0xa0 | an "uncategorized" move's effect (Focus Energy, Soak) | 3 the user |

Writing new handlers with these numbers would break the code standards. So step 0 names them in `btl_event.h`. That
changes no code, so the plain build still matches. (Built: swan turned out to have no names for them, so the names are
ours, §12.1; 0x37 is `BATTLE_EVENT_MOVE_BASE_POWER`, 0x38 `BATTLE_EVENT_MOVE_POWER_RATIO`, 0x2d
`BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT`, 0x55 `BATTLE_EVENT_MEMBER_IN`, 0xa0 `BATTLE_EVENT_UNCATEGORIZED_MOVE`.)

### 2.5 The trainer AI

- `res/trainers/ai/*.s` (14 scripts, assembled by `tools/script/tr_ai_script.py`) branch on the move's `effect`
  (`IfMoveEffect...`, `AIJumpByMoveEffect`, `tr_ai.c:2060`, which ends the script for an effect past its table).
- **The `effect` field is how the AI sees a move, and nothing else.**
  - A new move with an existing effect ID is scored like the moves with it. Apple Acid as
    `BATTLE_EFFECT_LOWER_SP_DEF_HIT` is scored as Psychic is.
  - A new move with a new rule takes the nearest existing effect: Body Press `BATTLE_EFFECT_HIT`, Syrup Bomb
    `LOWER_SPEED_HIT`, Dragon Cheer `CRIT_UP_2`.
  - Smarter play is a script change later.
- **AI damage:**
  - Its damage estimate `AICalcDamage` (`btl_server_flow.c:7340`) runs the server's damage calculation, so
    abilities' and items' handlers count. A move's own handlers are registered only while it runs, so they don't
    *(inferred: `AICalcDamage` adds none)*. The AI misjudges Body Press as it misjudges Foul Play today.
  - Abilities in the AI scripts are by constant (`basic.s` checks `ABILITY_SOUNDPROOF`). A new ability the AI should
    respect, such as Bulletproof, needs a line there.

### 2.6 Animations and sounds

- `BtlvEffect_StartMove` (`src/ov168/btlv_effect.c:447`) hands the **move ID** to `BtlvEffvm_Start`
  (`btlv_effvm.c:556`).
  - Below `BTLV_EFFECT_FIRST` (`0x231` = 561, `btlv_effvm.c:94`), it loads member `move` of archive 65 (`a/0/6/5`, the
    move scripts).
  - From 561, it loads member `move - 561` of archive 66 (`a/0/6/6`, 115 effect scripts: status, weather, item and
    ball animations, also started with literal IDs such as `0x23a` and `0x257`).
  - Script-to-script jumps (`BtlvEffvm_CmdChangeScript`, `:2581`) use the same split.
- `a/0/6/5` has **601 members**: 0-559 the moves, then **560-600, 41 identical 360-byte placeholders** (one hash).
  - Move 560 would play a placeholder.
  - Move 561 and up would play effect animations (561 is effect 0).
  - So **every new move needs a mapping**.
- A script is effvm bytecode (a variant count, 0x38-byte variant headers, then commands, about 118 opcodes, with SPL
  particles and its sound effects inside). No tool reads or writes them yet.
- **Design:**
  - A generated table gives each added move an animation: the ID of an existing move whose script it plays (Apple
    Acid plays Energy Ball's).
  - `BtlvEffect_StartMove` and its queued path (`:466`) map the ID under `#ifdef PAPERWHITE2`.
  - The effvm's special cases by move ID (Transform 144, Mirror Move 119, Nature Power 267, `btlv_effvm.c:584`) then
    see the mapped ID. That is right for a reused animation.
  - Custom animations (new scripts appended to `a/0/6/5`, read through a hack path past 600) need an effvm
    disassembler and assembler. That is a project of its own, for later (§9, step 6).
- **Sounds** are in the scripts, so a reused animation brings its sounds.

## 3. Abilities today

### 3.1 The data

- `res/abilities/<ability>.json` holds only `name` and `description` (`ability.schema.json`). The order is
  `generated/abilities.txt`.
- The text banks grow with `\from`: `ability_names.txt`, `ability_descriptions.txt`, and `ability_names_upper.txt`
  from ability 1.
- What an ability does is code; there is no ability data archive.
- Name length: 12 characters at most in the original ("Lightningrod", "Compoundeyes"). **"Supersweet Syrup" is 16**
  (open decision 3).

### 3.2 What stores an ability

| Where | Width |
| --- | --- |
| Box data `ability` (`poke_party.h:64`) | **u8** |
| Species data `a/0/1/6`: ability 1, ability 2, hidden (`species_data.py:72`, the `10B` group) | **u8** |
| Trainers, trades, facilities | a **slot** (4 bits in `trainer_data.py:76`), not the ID: unchanged |
| Battle (`BattleMon.baseAbility`, events' `subId`) | u16 |

So 255 is the ceiling. A Pokémon's ability is **copied into its box data** when it is made (`poke_tool.c:387, 554`),
and recomputed only when it evolves or changes form *(inferred from the setters)*. Changing a species' ability in
`res/` doesn't change Pokémon already caught (§7).

### 3.3 How the battle runs an ability

- **`sAbilityEventAddTable`** (`src/ov167/ability_handlers.c:43`):
  - 158 rows of `{ ABILITY_X, EventAddX }`;
  - `AbilityEvent_AddItem` (`:204`) looks the Pokémon's ability up with a **hard-coded `i < 0x9e`**, not `NELEMS`;
  - it registers the table as factor type 4 for as long as the Pokémon is in;
  - shared functions are common: White Smoke uses Clear Body's, Pure Power Huge Power's, Filter Solid Rock's.
- Tables of abilities by constant in `src/ov169/btl_tables.c`:
  - the ones Mold Breaker ignores (`sMoldBreakerIgnoredAbilities`, 55 entries, `:129`);
  - the ones Role Play, Trace, Entrainment and Skill Swap can't copy (`:72-96`).

  A new ability is copyable and not ignorable unless added there.
- Other places that read abilities:
  - the client's type-absorbing table (`btl_client.c:819`);
  - the AI's checks (`tr_ai.c:2255`, the scripts);
  - the hack's **Move Effectiveness Preview** (`src/paperwhite2/ov168/paperwhite2_move_preview.c:357`), which returns
    "unknown" for any ability above `ABILITY_TERAVOLT`;
  - the box search's alphabetical u8 list (`ov255/box_search.c:458`).
- **Field effects** are switches on the lead's ability:
  - encounter rate, level and nature (`SetupEncountFlagsByPartyPokeAbil`, `src/ov036/enc_pokeset.c:473`: Illuminate,
    Stench, Static, Synchronize...);
  - Flame Body's egg hatching (`fieldmap_event.c:958`);
  - Pickup and Honey Gather after battle *(not traced)*.

  A field effect for a new ability is one `case` under `#ifdef PAPERWHITE2`.

### 3.4 Battle messages

- Handlers name messages by ID:
  - `BattleHandler_StrSetup(&string, 2, 0xd2)`: type 2 is bank 16, the "set" messages with a line per side;
  - type 0 is bank 19, the standard messages (`btl_string.c:62`); in Pokéstar Studios bank 17 replaces it.
- New messages are appended to these banks, as the hack's Prestige lines were (`0019.txt:205-206`).
- An ability popup shows the Pokémon's ability's name, so a new ability's popup needs nothing.

## 4. The Applin line's moves and abilities

| Real | Data | C | Animation (reused) | AI effect |
| --- | --- | --- | --- | --- |
| **Apple Acid** (Grass, special 80, 100, 10 PP, Sp. Def -1 100%) | quality `DAMAGE_LOWER_TARGET_STATS`, `stat_changes` | none | Energy Ball | `LOWER_SP_DEF_HIT` |
| **Grav Apple** (Grass, physical 80, 100, 10 PP, Def -1 100%, ×1.5 in Gravity) | as Apple Acid with Defense | a handler on event 0x38: `IsFieldEffectActive(FIELD_CONDITION_GRAVITY)` → ×1.5 (Venoshock's shape, `move_handlers.c:7456`) | Seed Bomb | `LOWER_DEFENSE_HIT` |
| **Body Press** (Fighting, physical 80, 100, 10 PP, contact; uses the user's Defense) | plain damage | **a hook**: under `#ifdef PAPERWHITE2`, `ServerEvent_GetAttackPower` (`btl_server_flow.c:6860`) puts its `stat` in an event variable before event 0x39 and reads it back. Body Press's handler sets `BATTLEMON_DEFENSE`. The critical-hit path (`CritAtkDefLevel`) then uses Defense too. Foul Play is the model (`:7678`) | Body Slam | `HIT` |
| **Fickle Beam** (Dragon, special 80, 100, 5 PP, 30%: double power) | plain damage | a handler on event 0x38 or 0x37: `BattleRandom(100) < 30` → ×2 and a message ("…is going all out for this attack!", a new line in bank 16) | Dragon Pulse | `HIT` |
| **Dragon Cheer** (Dragon status, allies' critical-hit ratio +1, +2 for Dragons; fails without an ally) | quality `SPECIAL`, target the ally (Gen 5 has no "all allies"; in a triple battle the user picks one *(open decision 5)*) | a handler on 0xa0 as Focus Energy's (`move_handlers.c:2625`): +2 through the "pumped" flag 9 for a Dragon, +1 crit stage otherwise through `BattleMon_AddCritStage` and `SC_OP_ADD_CRIT_STAGE` (Dire Hit's path, `btl_server_flow_sub.c:1210`; a handler-work kind for it may be needed, *not traced*); message 0x411 | Focus Energy | `CRIT_UP_2` |
| **Syrup Bomb** (Grass, special 60, 85, 10 PP; syrup: Speed -1 at each turn's end for 3 turns, ends if the user leaves) | quality `DAMAGE_INFLICT`, `inflicts`: the new condition, 100%, duration kind **4** (while the user stays in, plus turns: Bind's), 3-3 turns. Data once the condition exists | **a new condition** (§4.1) | Mud Bomb | `LOWER_SPEED_HIT` |

| Ability | C |
| --- | --- |
| **Bulletproof** (immune to ball and bomb moves) | a **new move flag** `MOVE_FLAG_BALLISTIC` (bit 14), set in `data.json` on the 21 Gen 5 ball and bomb moves (Acid Spray, Aura Sphere, Barrage, Bullet Seed, Egg Bomb, Electro Ball, Energy Ball, Focus Blast, Gyro Ball, Ice Ball, Magnet Bomb, Mist Ball, Mud Bomb, Octazooka, Rock Blast, Rock Wrecker, Seed Bomb, Shadow Ball, Sludge Bomb, Weather Ball, Zap Cannon) and Syrup Bomb. A handler copied from Soundproof's (`ability_handlers.c:2825`, event 0x2d, `getMoveFlag(move, 14)`) with its own message. An entry in `sMoldBreakerIgnoredAbilities` (it is breakable). A line in the AI's `basic.s` beside Soundproof's. The Move Effectiveness Preview's immunity |
| **Supersweet Syrup** (on entering, once a battle: the foes' evasion -1) | Intimidate's handler (`ability_handlers.c:306`, events 0x55/0x8a) with stat `BATTLEMON_EVASION_STAGE`, a message, and **a once-a-battle bit per Pokémon**. Nothing in `BattleMon` survives a switch for this, so the bit is a static in the hack's battle file, cleared when the server starts. Optionally, Illuminate's field effect (more wild encounters) as a `case` in `enc_pokeset.c:475` (open decision 4) |
| **Ripen** (a Berry's effect doubled) | the most spread out. The berries read their amounts through `CommonGetItemParam` (`item_handlers.c:709`, 25 callers): one hook that doubles the amount parameter when the holder has Ripen, with each caller checked, because some read thresholds, not amounts. Plus the damage-halving berries' ratio (`ItemAttackValueToRatio`) and the stat berries' stages. A popup on use. Medium; it needs a test per berry kind |

### 4.1 Syrup Bomb's condition

`CONDITION_ID_COUNT` is 36 (`include/battle/btl_pokeparam.h:102`), and `CONDITION_ANY_STATUS` is 36, a pseudo-ID that
cure parameters use (`ability_handlers.c:1803`). So the new condition is **37** with the count **38** (36 left
unused), under `#ifdef PAPERWHITE2`:

- `BattleMonCore.conditions[]` and `conditionCounters[]` grow by 2 entries (10 bytes per `BattleMon`). Allocated by
  `sizeof(BattleMon)` (`btl_pokeparam.c:25`), so nothing else moves.
- The turn-end order list `sConditionsAll` and `GetConditionByIndex`'s **hard-coded `index < 35`**
  (`src/ov169/btl_tables.c:168, 205`).
- Its turn-end effect in `src/ov169/condition_effects.c` (as Bind's `ConditionEndTurnBind`): a Speed -1 stat change,
  with its message. Its cure message and table rows (`:433`).
- Dependence on the user: kind 4 already makes the condition end when the user leaves
  (`MakeConditionDependPokeTurns`, `battle_condition.c:76`; the switch-out cleanup at `btl_pokeparam.c:1239`).
- The client ticks conditions from the same list (`SC_OP_CONDITION_TURN_CHECK`, `btl_server_flow.c:5240`), so both
  sides agree.
- Baton Pass, Psych Up and Mental Herb lists: decide per condition (syrup isn't passed).

Once it exists, any later move can inflict the syrup by data alone.

## 5. Building blocks: what data can compose, honestly

The battle engine's behaviour is C handlers, and that won't change. But three layers of reuse are real, cheap, and let
the editor make most new moves without C:

1. **The move record itself** (§2.1). Every field is already in `data.json` and the schema form. Each of the
   existing qualities runs the move from its data.
2. **"Handlers like MOVE_X"**: an added move takes an original move's handler table.
   - The original's move ID is looked up in `sMoveEventAddTable`, under `#ifdef PAPERWHITE2` in `MoveEvent_AddItem`.
     The item is still registered with the new move's ID as its `subId`, so handlers that compare
     `BattleEventItem_GetSubID` work.
   - It fails only for handlers that compare a literal move: the pledges, Fusion Flare/Bolt, Freeze Shock and a few
     others (about 20 literal `MOVE_*` comparisons after the table, from `move_handlers.c:870` on). The tool refuses
     those as templates.
   - The same works for abilities ("handlers like ABILITY_X", `AbilityEvent_AddItem`), and the popup shows the new
     name. It covers a renamed copy, such as a Gen 6+ ability that is mechanically an old one.
3. **Parameterised blocks** (C written once, then data): a generated table of
   `{ move or ability, block, parameters }` read by a few generic handlers. These are worth writing when a second
   user appears:

| Block | Parameters | Covers |
| --- | --- | --- |
| power ×N when a condition holds | field effect, weather, target or user condition, HP below X, the target's type | Grav Apple; later Venoshock- and Hex-likes, Brine, Acrobatics-likes |
| power ×2 with chance P | P, a message | Fickle Beam |
| attack with stat S, or the target's | stat, whose | Body Press; Foul Play and Psyshock already |
| (ability) immune to moves with flag F or type T | flag or type, a message | Bulletproof, Soundproof-, Levitate- and Sap Sipper-likes |
| (ability) on entering: stat S of the foes ±N, maybe once a battle | stat, stages, once | Supersweet Syrup, Intimidate-likes |
| (ability) moves with flag F or type T ×X | flag or type, ratio | Iron Fist-likes (Strong Jaw, Mega Launcher, Sharpness, once those flags exist), Technician-likes |

- **What blocks can't do:** new mechanisms. A new condition (the syrup), new field or side effects, new turn order
  rules, form changes, new targets ("all allies"), and anything that needs new state.
- **Also beyond blocks:** each block's messages need new lines in the battle banks, which the tool can append.

**Recommendation:**
- Build layers 1 and 2 in steps 1-2, since they are almost free.
- Write the Applin line's four handlers as plain C first (step 5).
- Turn the first two of them into blocks only when the next new move needs the same rule. Blocks written ahead of
  need would be guesses about parameters.

## 6. The editor: Add move, Add ability

Modeled on Add Pokémon (`tools/paperwhite2/pokemon_species.py`, new-species.md §4, §16): a tool that writes `res/`
and `generated/`, server routes, then the UI. Editor panels follow the Ambients panel's layout.

**`tools/paperwhite2/moves.py`**: `info`, `add NAME --from MOVE_X [--check]`, `remove MOVE` (the last added only),
`retire` and `unretire`. `add` does three things:
- appends `MOVE_<NAME>` to `generated/moves.txt` at the next ID;
- writes `res/moves/<name>/data.json`, a copy of the template's with the name and description;
- adds the hack's fields:
  - `"animation": "MOVE_X"` (the template, an original move);
  - optionally `"handlers_like": "MOVE_Y"` (layer 2) or `"blocks": [...]` (layer 3);
  - the AI's `effect` (the template's).

`move_data.py` ignores the hack's fields for `a/0/2/1`. A generator writes the added moves' table (animation,
handlers) into a generated header, as `pokemon_forms_config.h` is. Without added moves the table is empty and the ROM
unchanged.

**`tools/paperwhite2/abilities.py`**: the same for abilities:
- appends to `generated/abilities.txt` and writes `res/abilities/<name>.json`;
- the hack's fields: `"handlers_like": "ABILITY_X"` or `"blocks"`;
- the flags `"mold_breaker_ignores"`, `"copyable"` (Role Play, Trace, Entrainment, Skill Swap) and `"ai_like"`;
- the generator emits the added rows of the Mold Breaker and copy lists.

Abilities whose behaviour is new C name their handler in the hack's battle file, which the tool can't write. It
creates the ability with "handlers: none (C)", and the build warns that the ability does nothing in battle until
its C exists.

**Removal** follows species (new-species.md §4.3):
- only the last added move or ability can be removed, and only when nothing in `res/` refers to it (learnsets, egg
  moves, tutors, trainers, facilities, evolutions, Wonder Trade, species abilities; the editor's `server/usage.ts`
  finds references);
- otherwise **retire** it: it keeps its ID and data, so saved Pokémon stay valid, and the pickers hide it.

**The UI:**
- A **Moves** page and an **Abilities** page in the sidebar: lists with search and filters (type, category, added).
- Each move's card has headed sections:
  - **Basics**: type, category, power, accuracy, PP, priority;
  - **Effect**: quality, stat changes, condition, flags, "handlers like";
  - **Battle**: animation with a picker of moves, AI effect;
  - **Text**: name (12 characters), description;
  - **Used by**: species and trainers.
- The record's fields come from `move.schema.json`, with constants as pickers.
- **Add move** and **Add ability** in the page header. The Pokémon editor's learnset and ability pickers see new
  constants with no change, because they read `generated/`.
- Existing moves' and abilities' text and data are editable today through the schema form. These pages replace it
  with a better layout.

## 7. Risks and limits

- **Saves:**
  - New IDs change no save format. A Pokémon stores move IDs (u16) and its ability ID (u8), so **adding is safe**.
  - **Removing or reordering is not.** A saved Pokémon with a removed move reads past the move archive and the text
    banks *(inferred: no bounds check in `PML_MoveGetData`)*.
  - **Stand-ins stay in saves:** Applins made before step 5 keep their Harvest or Illuminate and their Seed Bomb.
    Only debug-given ones exist now, so this is cheap to ignore. A one-time fix, the ability re-chosen from the
    species by slot on load, is possible if wanted (open decision 7).
- **The plain build:**
  - Appended constants change no value, so `constants/moves.h` and `abilities.h` only gain lines.
  - `pms_words.h` stays the same **only with the Easy Chat caps** (§2.3).
  - All C is `#ifdef PAPERWHITE2`: the animation map, the ability table's bound, Metronome, the condition count and
    list, the stat hook, the handlers.
  - The plain build's `a/0/2/1` and text banks then differ, as its data already does with the hack's.
  - Step 1's proof is byte-identical output with nothing added.
- **Hard-coded bounds** to fix under `#ifdef`:
  - `0x9e` (`ability_handlers.c:214`), which would also need raising for a single hack row;
  - `0x230` (`btl_calc.c:90, 482`);
  - `index < 35` (`btl_tables.c:205`);
  - `ABILITY_TERAVOLT` (`paperwhite2_move_preview.c:357`).

  After each step, grep `MOVE_FUSION_BOLT`, `ABILITY_TERAVOLT`, `0x230`, `0x22f`, `559`, `560`, `0x9e`, `164`, `165`.
- **The animation trap** (§2.6): a new move without a mapping plays an effect animation, a wrong but harmless picture.
  The generator refuses an added move without an `animation`.
- **The AI** plays new effects as their stand-in effect (§2.5), and ignores a move's own handlers in its damage
  estimate.
- **Memory:** handlers go in the battle overlay (ov167). A handler is about 100-300 bytes, so the Applin set is a few
  KB of the budget at most (plugins.md, Memory). The added-move table is a few bytes a move.
- **Unnamed events:** the battle's event and variable numbers must be named before hack C uses them (§2.4, step 0).
- **Gen 6+ details that Gen 5's engine lacks:**
  - "all allies" targets: Dragon Cheer;
  - flags such as ballistic, bite, pulse and slicing: added as bits 14+, one per move set in data;
  - the ability's 16-character name: open decision 3.

## 8. A new type (Fairy): what it would add

Not planned now; noted so that nothing here makes it harder.

- **The constant:** `generated/types.txt` has 0-16 and `TYPE_NULL = 17`, the typeless sentinel. White2Upgrade made
  Fairy 17 and had to patch every place that treats 17 as "none":
  - `DoesMonHaveType`, Conversion, Color Change and Transform (`Fairy_LimitAdjust.s`, "Instances where type 17 is
    checked for type none").

  Appending Fairy as **18** keeps every constant, at the cost of an unused row in the chart.
- **The chart:** the hack already moved it to ARM9 main (`include/paperwhite2/type_chart.h`, `TYPE_CHART_SIZE 17`,
  "a new type (Fairy) would make it 18"). It becomes 19 × 19, or 18 with a remap, plus the new matchups.
- **Graphics and UI:** a type icon and palette everywhere one is drawn:
  - the battle menu (`btlv_input.h:179` keeps 22 type actors);
  - the summary, the Pokédex (the hack's type icons and search), the box search, the Hall of Fame;
  - the hack's Type Icons and Move Effectiveness Preview (`MOVE_PREVIEW_TYPE_COUNT`).

  White2Upgrade patched each of these screens by address.
- **Rules:** the type-boosting items, plates and gems; Arceus's forms; Hidden Power (excluded); Conversion and
  Camouflage tables; Judgment; the type tutor; the type-absorbing abilities table.
- **Text:** the types' names, and the Easy Chat types category, which needs the same cap.
- **Data:** every Fairy species and move retyped (Gen 6's changes), a data pass over `res/`.

It is the largest of the three kinds, and independent of moves and abilities. Do it after them, if at all.

**White2Upgrade**, for reference:
- Its README lists move and ability expansion as aims, but its current features are only the 721 species and the
  Fairy type.
- It has 622 move records (`data/pml/moves/*.yml`, to Hyperspace Fury 621) and their constants, but no move effect
  or ability code. Its new moves run on their data alone, so their own rules don't apply.
- Its YAML calls the record's u16 at 0x12 "Move Animation ID". In this ROM's code that field is read only by the
  trainer AI (§2.1), and the animation is chosen by move ID (§2.6).

## 9. Build order

Every hack build ends with `tools/build/verify_dsi_rom.py build/paperwhite2.nds`. Proofs in py-desmume with a copy of
the user's save.

0. **Name the battle events and variables** that steps 2-5 use, in `include/battle/btl_event.h` (built: all of them,
   §12.1).
   - **Proof:** the plain build's SHA1s match.
1. **Appending, with nothing added.**
   - `moves.py` and `abilities.py` `info`.
   - `generated/` lists accept appended constants, with checks: no gaps, abilities ≤ 255.
   - The Easy Chat caps in `pms_words.py`.
   - `move_data.py` ignores the hack's fields; the schemas get them.
   - The generated tables, empty.
   - The `#ifdef` bounds (`0x9e` → `NELEMS`, Metronome's count, the preview's last ability), with no added entry, so
     no change in behaviour.
   - **Proof:** the `--hack` ROM's SHA1 is unchanged against the commit before (the bounds compile to the same
     values); the plain build's modules match.
2. **A data-only move in battle: Apple Acid** (ID 560), made by `moves.py add`, with Energy Ball's animation. Then
   **Grav Apple** (561), which proves the animation map past 560, with its Gravity handler.
   - C: the animation map in `BtlvEffect_StartMove` and its queue, and "handlers like" in `MoveEvent_AddItem`.
   - **Proof:**
     - taught by the debug menu: the summary shows name, type, category, power, accuracy and description;
     - a wild battle: the right animation (not a status effect), the damage, "…'s Sp. Def fell!";
     - Grav Apple stronger under Gravity (damage logged);
     - a trainer's Pokémon given the move uses it;
     - Metronome forced to the move;
     - PP Ups; the Move Reminder;
     - the Pokédex Info move list;
     - Easy Chat words unchanged (a saved sentence reads the same);
     - removing both moves gives step 1's ROM byte for byte.
3. **An ability with handlers: Bulletproof** (ID 165).
   - The ballistic flag on the 21 moves (data).
   - Its handler, its Mold Breaker entry, its AI line, its message, the preview.
   - **Proof:**
     - a Pokémon with it is immune to Shadow Ball and Seed Bomb, with the popup and the message;
     - Mold Breaker gets through;
     - a trainer's AI stops choosing Shadow Ball into it;
     - the Pokédex Info and summary show its name and description;
     - Skill Swap copies it.
4. **Add move and Add ability in the editor**: the server routes, the Moves and Abilities pages.
   - **Proof:**
     - adding and removing from the tool and from the editor leaves `res/` and `generated/` as they were, and the ROM
       byte-identical;
     - `npm run typecheck`, `npm test`, `npx vite build`.
5. **The Applin line's real moves and abilities**, replacing the stand-ins:
   - 5a: Body Press (the attack-stat hook), Fickle Beam, Dragon Cheer;
   - 5b: Syrup Bomb's condition (§4.1), then Syrup Bomb as data;
   - 5c: Supersweet Syrup, Ripen.

   Then the species' `data.json`:
   - abilities: Ripen / Gluttony / Bulletproof for Applin, Flapple and Appletun (Flapple's hidden Hustle and
     Appletun's Thick Fat stay); Supersweet Syrup for Dipplin and Hydrapple;
   - learnsets with the real moves;
   - Dipplin's evolution `EVO_METHOD_KNOWS_MOVE` `MOVE_DRAGON_CHEER`, and Dragon Cheer at level 1 for the Move
     Reminder;
   - new-species.md §18.2 rewritten as "replaced".

   **Proof** per move and ability, in single and double battles:
   - Body Press's damage follows Defense, not Attack (two Pokémon with swapped stats);
   - the syrup lowers Speed for 3 turns and ends when the user leaves;
   - Dragon Cheer +1 and +2 by type, and it fails in a single battle;
   - Fickle Beam's message;
   - Supersweet Syrup once a battle, not again after a switch;
   - Ripen's Sitrus heals 50%;
   - a Dipplin knowing Dragon Cheer evolves.
6. **Later, as needed:**
   - blocks from the second user of a rule (§5);
   - an effvm disassembler and assembler for custom animations;
   - generated Easy Chat and box search lists for added ones;
   - the AI scripts' handling of new effects;
   - other Gen 6+ moves and abilities;
   - the Fairy type (§8).

## 10. Open decisions for the user

1. **IDs:** new moves from 560 and abilities from 165, appended (recommended). Or leave 560 unused, since its
   animation slot is a placeholder? The map makes this unnecessary.
2. **Metronome, Assist, Sleep Talk and Copycat** can call new moves (Gen-accurate), or Metronome stays on the
   original 559?
3. **Names over 12 characters:** "Supersweet Syrup" (16). Shorten it ("Sweet Syrup", "SuprswtSyrup"), or test whether
   the summary, battle popup and Pokédex fit a longer name and widen if not?
4. **Supersweet Syrup in the field:** also raise wild encounters, as its stand-in Illuminate does, or no field effect
   (Scarlet/Violet's)?
5. **Dragon Cheer's target** in triple battles: one chosen ally (Gen 5's ally target), or every ally (a new target
   kind, more C)?
6. **Building blocks:** write the Applin line's rules as plain C first and make blocks when a rule repeats
   (recommended), or design the block table now?
7. **Saved stand-ins:** leave Pokémon made before step 5 with their stand-in abilities (recommended; only
   debug-given ones exist), or add a one-time fix on load?
8. **AI:** stand-in effects for new moves (recommended now), or script work for each new effect?
9. **New moves in Easy Chat:** left out, so saved words stay fixed (recommended), or added later after the existing
   words with a new category order?
10. **Fairy type:** in scope at all, and if so after the move and ability work (recommended)?

## 11. The user's decisions (2026-11-13)

1. **Metronome, Assist, Sleep Talk and Copycat** can call the new moves (Gen-accurate).
2. **"Sweet Syrup"** is the ability's name (fits 12 characters).
3. **No field effect** for Sweet Syrup, as in Scarlet and Violet.
4. **Dragon Cheer affects every ally** in triple battles (a new target kind), as a strategic twist.
5. **Code the Applin line's rules in C for now.** Later, the user wants a way to design new effects quickly and
   accessibly from the editor: something Scratch-like, or like the game's event scripts (blocks the battle engine
   runs), not hand-written C each time. Keep the C written now easy to turn into such blocks.
6. **No fix-on-load** for Pokémon saved with stand-in abilities (only a test Hydrapple exists; the user will trade it
   away or restore an earlier save).
7. **AI**: new moves borrow an existing effect for the trainer AI.
8. **Easy Chat**: new moves and abilities are left out.
9. **Fairy type: in scope**, after the moves and abilities foundation. The user's Pokeweb work has an injection plugin
   that adds Fairy and new move effects; use it as a reference then (the decomp version is our own).

## 12. Built: steps 0 and 1 (2026-11-13)

### 12.1 The battle's events and variables (step 0)

swan has no names for them (its databases name the functions only), so the names are ours, in
`include/battle/btl_event.h`, and every literal use in ov167 and ov169 now spells them:

- **146 events**, `BATTLE_EVENT_*` (0x00-0xa4), each named after the server function that fires it
  (`ServerEvent_GetMovePower` fires `BATTLE_EVENT_MOVE_BASE_POWER` and `BATTLE_EVENT_MOVE_POWER_RATIO`), or after what
  its handlers do where one function fires several (the three no-effect checks, the five after-hit stages of
  `ServerControl_DamageProcessEnd`, the three turn-end stages). 19 IDs are fired and registered nowhere and have no
  name (0x0a, 0x10, 0x14, 0x16, 0x17, 0x20, 0x2f, 0x3f, 0x42, 0x43, 0x49, 0x52, 0x5f, 0x63, 0x66, 0x6f, 0x71, 0x8e,
  0x92); 0x05, `BATTLE_EVENT_BYPASS_SUBSTITUTE`, is registered by six moves but fired nowhere.
- **81 variables**, `BATTLE_EVENT_VAR_*` (0x00-0x53), from what the server sets and the handlers read: the mons
  (`_MON`, `_ATTACKER`, `_DEFENDER`, `_TARGET_COUNT`, `_TARGET_1` to `_6`, written `BATTLE_EVENT_VAR_TARGET_1 + i`), the
  move's (`_MOVE`, `_MOVE_TYPE`, `_MOVE_CATEGORY`, `_MOVE_POWER`, `_POWER_RATIO`), the stats' (`_ATTACK`, `_DEFENSE`,
  `_ATTACK_STAT_MON`, `_DEFENSE_STAT`, `_DEFENSE_SWAP`), `_RATIO` (the general fx32 multiplier), and the flags that each
  event uses for its own purpose (`_FAIL_FLAG`, `_GENERAL_FLAG`, `_IGNORE_FLAG`, `_NO_EFFECT`...). 0x00 and 0x01 are
  the stack's free slot and frame start. Unused keys: 0x23, 0x43, 0x49, and anything from 0x54 (a key is any u16; the
  stack holds 0x60 entries across its frames), so a hook can add its own (Body Press's stat, §4).
- **8 factor types**, `BATTLE_EVENT_FACTOR_*` (move, position, side, field, ability, item, isolated, any).

One function's name is odd but not changed here: `ServerEvent_CheckSubstituteInteraction` fires
`BATTLE_EVENT_STAT_CHANGE_AMOUNT` (Simple, Contrary). The stack's size in `battle_event.c` is `BATTLE_EVENT_VAR_STACK_SIZE` (was
`BATTLE_EVENT_VAR_MAX`, which read as a variable).

**Proof:** the changed files' objects (code and data sections) are identical before and after for both versions
(compiled with `-d BLACK2` and `-d WHITE2`; no Black 2 base ROM is here, so its modules can't be checked), and the
plain `w2_us` build passes every module check.

### 12.2 The lists and the packers (step 1)

| Tool | What |
| --- | --- |
| `tools/data/move_list.py` | the one definition: `constants()` (checked: numbered from 0, `MOVE_FUSION_BOLT` 559, at most `MOVE_MAX` 1023 for Entree Forest's 10 bits), `count()`, `added_moves()` from `FIRST_ADDED` (560), `added_table()` (each added move's animation and "handlers like" IDs, checked: `animation` required and an original move, `handlers_like` an original move, the name at most 12 characters, no original move with the hack's fields) |
| `tools/data/ability_list.py` | the same for abilities: `ABILITY_TERAVOLT` 164, `FIRST_ADDED` 165, at most `ABILITY_MAX` 255 (a byte in the box and species data), `handlers_like` optional |
| `tools/paperwhite2/moves.py`, `abilities.py` | `info`, and `header`, which the hack's build runs for `paperwhite2/moves_config.h` (`PAPERWHITE2_MOVE_FIRST_ADDED`, `_ADDED_COUNT`, `_COUNT`, and with added moves `_ANIMATIONS` and `_HANDLERS_LIKE`) and `paperwhite2/abilities_config.h` (`PAPERWHITE2_ABILITY_FIRST_ADDED`, `_ADDED_COUNT`, `_HANDLERS_LIKE`) |
| `move.schema.json`, `ability.schema.json` | the hack's fields `animation` and `handlers_like` (an ability's `handlers_like`); `move_data.py` packs the record's fields only, so it ignores them |
| `tools/text/pms_words.py` | `WORD_COUNTS`: the move and ability categories end at 560 and 165 words, so the words after them never move |
| unchanged | `move_data.py`, the text banks (`\from{moves.*}`, `\from{abilities.*}` follow the lists), `species_data.py`'s learnsets and egg moves and the species' abilities (by constant), the trainers, the TM and tutor tables (C, by constant), the editor (it reads `generated/`) |

Without an added move "handlers like" gives the move itself, so a row the hack's battle code adds for an added move's
own handlers matches it; the same for abilities. Abilities: an added ability without `handlers_like` and without a hack
row does nothing in battle.

### 12.3 The C (step 1)

| Where | What |
| --- | --- |
| `include/paperwhite2/moves.h`, `abilities.h` | `PaperWhite2_IsAddedMove`/`_IsAddedAbility` (inline, `id - first < count`); `PaperWhite2_GetMoveAnimation`, `PaperWhite2_GetMoveHandlersMove`, `PaperWhite2_GetAbilityHandlersAbility`: functions with added ones, else macros that give the ID |
| `src/paperwhite2/ov168/paperwhite2_move_animations.c` | the animation table and lookup, built only with added moves |
| `src/paperwhite2/ov167/paperwhite2_battle.c` | the "handlers like" tables and lookups, built only with added moves or abilities; the hack's own move and ability handlers go here too |
| `btlv_effect.c` | `BtlvEffect_StartMove` and its queued path start the mapped ID |
| `move_handlers.c` | `MoveEvent_AddItem` compares the "handlers like" move with `sMoveEventAddTable`'s; the item keeps the move's own ID as its sub ID |
| `ability_handlers.c` | `AbilityEvent_AddItem` runs to `NELEMS(sAbilityEventAddTable)` (the original's `0x9e`, which is its 158 rows) and compares the "handlers like" ability |
| `btl_calc.c` | `METRONOME_MOVE_COUNT`: the buffer and the loop of `BtlCalc_PickRandomMove` (`0x230`) are `PAPERWHITE2_MOVE_COUNT`, so Metronome calls added moves (§11.1). Assist, Sleep Talk and Copycat pick from Pokémon's moves through exclusion lists, with no bound |
| `btl_tables.c` | `GetConditionByIndex` runs to `NELEMS(sConditionsAll)` (the original's 35) |
| `paperwhite2_move_preview.c` | unchanged code: an ability past Teravolt is already "unknown" (a `>= 165` spelling compiles to other instructions, so the original comparison stays) |

**Left to step 5:** `CONDITION_ID_COUNT` (36, the size of `BattleMonCore.conditions[]` and `conditionCounters[]`) can't
be prepared byte for byte: any new value changes `BattleMon`'s size. Syrup Bomb's condition raises it and adds its row
to `sConditionsAll` under `#ifdef PAPERWHITE2`.

**Byte identity:** without added moves and abilities each hook is the original expression (the macros give the ID
itself), the bounds are the same numbers, and the two new files are empty. One trap: the preview's `>= 165` for
`> 164` changed the compare and branch instructions.

### 12.4 Proof

- The `--hack` ROM of the branch's start (`6a4f9a4aaf`) and of steps 0-1: `ff789030223a1c4777c070fc539f03604e0c415b`
  both; `verify_dsi_rom.py` intact; the plain `w2_us` build passes every module check (its archive checks fail as
  before).
- `python3 -m unittest tools.paperwhite2.test_moves_abilities`: the lists, their checks, both headers with and without
  added entries, and Easy Chat's counts with longer name files (12 tests).
- A dummy move and ability, not committed (scratchpad `dummy.py`): `MOVE_TEST_DUMMY` (560, Energy Ball's record,
  `"animation": "MOVE_ENERGY_BALL"`) and `ABILITY_TEST_DUMMY` (165, "Dummy Grow", `"handlers_like": "ABILITY_OVERGROW"`),
  Bulbasaur learning the move at level 1 and as an egg move and having the ability. The build packed a/0/2/1 with 561
  members (560 Energy Ball's bytes), banks 403 and 402 with 561 lines ("Test Dummy" and its description), 374 and 375
  with 166, Bulbasaur's learnset (560 at level 1), egg moves (0x230) and ability 2 (165); `moves_config.h` with
  `PAPERWHITE2_MOVE_COUNT 561`, `_ANIMATIONS MOVE_ENERGY_BALL`, `_HANDLERS_LIKE MOVE_TEST_DUMMY`, `abilities_config.h`
  with `ABILITY_OVERGROW`; the three lookups linked into ov167 and ov168; `pms_words.h` byte for byte the same; ROM
  `7473ae44...`, `verify_dsi_rom.py` intact. Removed: `ff789030...` again.

### 12.5 For step 2 (Apple Acid, Grav Apple)

- **Adding:** append `MOVE_APPLE_ACID` and `MOVE_GRAV_APPLE` to `generated/moves.txt` and write their folders with
  `"animation"` (Energy Ball's, Seed Bomb's) and the AI `effect`; `moves.py info` checks them. A name over 12
  characters stops the build until it is tested on the summary and the battle menu.
- **Grav Apple's handler** (`BATTLE_EVENT_MOVE_POWER_RATIO`: the attacker is `BATTLE_EVENT_VAR_ATTACKER`, the move
  `BattleEventItem_GetSubID(item)`, then `BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, FX32_CONST(1.5))` under
  `IsFieldEffectActive(FIELD_CONDITION_GRAVITY)`, Venoshock's shape) goes in `paperwhite2_battle.c`, and its row in
  `sMoveEventAddTable` under `#ifdef PAPERWHITE2`. The table is `static` in `move_handlers.c` and its entries name
  `static` EventAdd functions, so the hack's EventAdd function needs a declaration in a hack header that
  `move_handlers.c` includes; the loop's `NELEMS` covers the row. Abilities the same way in step 3.
- **Animation:** only `BtlvEffect_StartMove` takes a move ID; the effect commands of `btlv_core.c` take effect IDs. The
  effvm's own per-move cases (Transform, Mirror Move, Nature Power) see the mapped ID.
- **Not mapped:** an added ability with `handlers_like` isn't in `sMoldBreakerIgnoredAbilities` or the Role Play and
  Skill Swap lists, which compare IDs; the generator's rows for them are step 3's (or step 4's flags).
- **Free move flags:** bits 14-31 (Bulletproof's `MOVE_FLAG_BALLISTIC` in step 3).
