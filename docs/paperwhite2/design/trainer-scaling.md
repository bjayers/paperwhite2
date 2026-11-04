# Trainer level scaling (design, not built)

Research of 2026-11-04. Nothing here is built. "Verified" means read in the code at the cited line; "inferred" means
reasoned from it and not yet seen in game.

## What it should do

- A trainer's Pokémon scale to the player as wild Pokémon do, by a tier: gym leaders, the Elite Four, the Champion and
  other bosses close to the player's level, ordinary trainers lower.
- Each Pokémon scales on its own and the team keeps its shape: a boss's ace stays above the rest.
- Facilities and battles with set levels are left alone: the Pokémon World Tournament, the Black Tower and White
  Treehollow, the Battle Subway, the Battle Institute, the Trial House, link and Union battles, Pokéstar Studios.
- A Pokémon at a new level has the stats, the level-up moves and (by choice) the evolution of that level.

## How trainer parties are built now

Every file is decompiled to C: no `delinks.txt` of either module lists an `incomplete` file, so the callers below are
all there are (verified by grep of `config/w2_us/arm9/**/delinks.txt`).

**The data.** `res/trainers/data/<trainer>.json` (814 trainers, `generated/trainers.txt`), packed by
`tools/data/trainer_data.py` into `a/0/9/1` (records, `ARCID_TRDATA`) and `a/0/9/2` (parties, `ARCID_TRPOKE`). A record
has the class, battle style, items, AI flags and the party's kind; a party entry has difficulty (IVs), gender and
ability slot, level, species, form, and by the kind a held item and four moves (`include/battle/trainer_data.h:27-80`).
Classes are `generated/trainer_classes.txt` (237).

**The loader.** `TrainerUtil_LoadParty(trainerId, party, heapId)` (`src/system/tr_tool.c:615-747`, ARM9 main, a
complete file) reads both and, for each entry:

1. seeds a PID from `difficulty + level + species + trainerId` and the class (`tr_tool.c:652-658`): the stored level
   is part of the seed, so the nature and the PID's bits come from it;
2. `PokeParty_CreatePkm(pkm, species, level, ...)` (`src/system/poke_tool.c:310-322`), which sets the Exp. for the
   level (`poke_tool.c:361`), the last four level-up moves up to the level (`PML_UtilPkmSetDefaultMoves`,
   `poke_tool.c:390`, `784-808`) and the stats (`PokeParty_RecalcStats`);
3. for a party with moves, overwrites the four moves (`tr_tool.c:684-686`, `735-737`); with items, sets the item;
4. `TrainerUtil_SetupPkm` (`tr_tool.c:775-802`): friendship 255 (0 with Frustration), the form, the ability from the
   entry's slot (set explicitly, not from the PID), the nature from the PID.

It has no `GameData`, so it can't see the player's party.

**Its callers.** Only two (verified by grep):

| Caller | What |
| --- | --- |
| `BtlSetup_LoadTrainer` (`src/system/btl_setup.c:162-196`) | Every battle against trainers of `ARCID_TRDATA`. It has `gameData`, the client and the trainer ID; after the party it runs `TransformVsPokePartyBySeason` (`:173`) and picks the victory music by class. It does nothing for trainer ID 0 (`:170`). |
| `WbtBattle_MakeOpponentParty` (`src/ov134/wbt_battle.c:378-398`) | The Pokémon World Tournament's rival, `TRAINER_RIVAL_7`-`_9` (`:318-330`). Every other PWT party is the tournament's own sets at Lv. 50 (`WbtBattle_MakeTournamentParty`, `:368-375`). |

`BtlSetup_LoadTrainer` is called by `BtlSetup_SetTrainer1v1Single`, `1v1Double`, `3v3`, `Rotation` (client 1),
`1v2` (clients 1 and 3), `2v2` (client 2 the ally, 1 and 3 the foes) and `SetWildMulti` (client 2, the ally of a wild
double) and `SetNetMultiVsAI` (`btl_setup.c:273-414`). The field reaches them through `BtlSetup_SetTrainerLocal`
(`src/ov036/field_encount.c:473-508`), from `EventTrainerBattleCall_Create` (`src/ov012/event_battle.c:200-245`), from
the scripts' `CallTrainerBattle trainer1, trainer2, flags` and `CallTrainerMultiBattle partner, t1, t2, flags`
(`src/ov036/scrcmd_trainer.c:95-130`).

**What runs after it** (`event_battle.c:213-241`, verified):

- `adjustPkmLvForChallengeKeys` (`btl_setup.c:450-481`): with the Easy or Challenge key, adds the zone header's
  `easyChallengeModeLevelAdjust` to clients 1 and 3. It sets only the party's cached level, not the Exp. or stats, and
  records `setup->levelDiff`, which the Exp. formula undoes (`btl_server_flow_sub.c:503`, `583-587`).
- With script flag 4, `FesGimmick_BoostPartyLevels`: in a Funfest "people" mission, `+score` (at most 30) levels to
  client 1, with Exp. and stats redone (`src/ov072/fest_mission_gimmick.c:58-83`). This is the correct way to change a
  level: `PKM_PARAM_EXP` from `PML_UtilGetPkmLvExp`, then `PokeParty_RecalcStats`.
- With flag 2, in an area that `AreaData_IsInfinityDungeon`: the Black Tower's terrain and key level.
- `LoadTradedPokemonBattleStats` (`event_battle.c:345-366`) remakes slot 0 as a traded-in Pokémon at its saved
  level.

## The wild scaling's basis

Verified in `src/paperwhite2/main/`:

- **The median:** `ConditionContext_FillParty` takes the levels of the party's non-Egg members
  (`paperwhite2_conditions_context.c:106-122`) and `Conditions_MedianLevel` sorts them and takes the lower middle one
  (`paperwhite2_conditions.c:184-200`).
- **The scaled level:** `Conditions_ScaledLevel` = `median * percent / 100 + offset`, clamped to `min`..`max`
  (`paperwhite2_conditions.c:202-212`), from `res/paperwhite2/level_scaling.json` via the generated
  `paperwhite2/level_scaling_config.h` (`tools/paperwhite2/conditions.py:381`). Now 80%, offset 0, 2-100, spread 3.
- **Wild levels:** scaled ± spread, within the species' own min and max (`paperwhite2_encounters.c:251-253`).
  plugins.md (Conditions, "Level scaling") still says the default spread is 5; the file and encounters.md say 3.

So it is the party alone: no badges, no story flags. The party-wide Exp. Share (`paperwhite2_exp_share.c`) keeps the
whole party close together, which makes the median and the maximum close too.

## Tiers and how to tell them

**The class is the marker.** The game itself groups the special classes in `SPECIAL_TRAINER_CLASSES`
(`tr_tool.c:83-113`), by victory music (`GetTrainerClassBGMGroupId`, `:565-572`): group 0 the eight Gym Leaders, 1 the
Elite Four, 3 the rival (Hugh, `TRAINER_CLASS_PKMN_TRAINER_RIVAL`), 4, 5 and 12 Colress, 6 N, 7 Plasma grunts and the
Shadow Triad, 8 the Champion, 9 Ghetsis, 10 Zinzolin, 11 Benga, 13 Cheren and Bianca as trainers, 14 the Subway
Bosses, 15 every other class. Battle style and AI flags (`AI_FLAG_EXPERT` on leaders,
`res/trainers/data/leader_cheren.json`) are weaker markers: many ordinary trainers have them too (inferred, not
counted).

Proposed tiers and their default classes:

| Tier | Classes | Target (of the basis) |
| --- | --- | --- |
| `normal` | everything not below | 85%, -1 |
| `strong` | Ace Trainer, Veteran, Black Belt / Battle Girl pairs, Plasma grunts (group 7) | 92% |
| `rival` | `PKMN_TRAINER_RIVAL`, `PKMN_TRAINER_CHEREN`, `_BIANCA` (group 3, 13) | 98% |
| `gym` | the eight `LEADER_*` (group 0) | 100% |
| `villain` | Colress, Zinzolin, Shadow, N, Ghetsis (groups 4-6, 9, 10, 12) | 100%, +1 |
| `elite` | `ELITE_FOUR_*` (group 1) | 100%, +1 |
| `champion` | `CHAMPION` (group 8) | 100%, +2 |
| `ally` | client 2 of `2v2` and `SetWildMulti` (a partner) | 100% |
| `fixed` | Subway Bosses, `BOSS_TRAINER_*`, Benga, the PWT and other guest classes (Brock..., Red, Blue, Cynthia) | not scaled |

The numbers are a starting point for the user. Gym Leaders' Challenge Mode copies use the same class: the script picks
`TRAINER_LEADER_CHEREN` with difficulty 2 and `_CHEREN_2` otherwise (`res/field/scripts/aspertia_city_gym.s:226-236`),
so both get the `gym` tier. The Champion's rematch is `CHAMPION_IRIS_2` / `_4` (Lv. 76-78, `pokemon_league_9.s:144-154`).

## Excluded battles

Most excluded battles never reach `BtlSetup_LoadTrainer` with a trainer ID, so a hook there skips them by
construction:

| Battle | Path | Marker |
| --- | --- | --- |
| Pokémon World Tournament | `ov134` makes its parties; its rival calls `TrainerUtil_LoadParty` directly (`wbt_battle.c:386`) | not through the hook |
| Battle Subway, Trial House, Battle Institute, rentals | `BtlSetup_SetTrainer*` with trainer ID 0, parties from the facility data (`src/ov012/fld_btl_inst_tool.c:121-235`, `BtlInst_MakeParty`) | ID 0 |
| Black Tower / White Treehollow trainers | `SetupInfinityDungeonBattle` (`fld_btl_inst_tool.c:121-153`), facility data `res/trainers/facilities/black_tower` | ID 0 |
| Black Tower / White Treehollow area bosses | `CallTrainerBattle 0x8046, 0, 2` (`res/field/scripts/global_10735.s:1511`), trainers `BOSS_TRAINER_*` of `ARCID_TRDATA` (Lv. 53-80) | through the hook: class `BOSS_TRAINER_*`, and the zone's area `AreaData_IsInfinityDungeon` |
| Battle Institute IDs | `TrainerUtil_IsIDBattleInst`, ID >= `0x500` (`tr_tool.c:804-806`, `trainer_data.h:17`) | ID range |
| Link, Union, Wi-Fi, IR battles | `BtlSetup_SetNet*` (`btl_setup.c:394-421`), `NetMultiVsAI` with IDs 0 from `fld_btl_inst_tool.c:231` | not through the hook |
| Pokéstar Studios | `BtlSetup_SetTrainer1v1Single(..., 0, ...)` (`src/ov023/event_pokewood.c:343`) | ID 0 |
| Musical | no battle | - |
| Funfest mission battles | scaled, then the mission adds its levels (flag 4) | open question |
| Traded-Pokémon rematches | slot 0 replaced afterwards at its saved level | per-trainer override if wanted |

So the hook needs only: the class's tier `fixed`, an exclusion list of trainers, and the Black Tower's area check as a
safety net (the zone from `PlayerState_GetZoneID(GameData_GetPlayerState(gameData))`, as
`paperwhite2_conditions_context.c:48` does).

## The scaling rule

**The basis.** Wild scaling uses 80% of the party median. For trainers the user wants "close to the player", so the
basis should not be dragged down by one low-level member: the proposed default is the mean of the party's three highest
levels (`top3`), with `median` and `max` as options. With the Exp. Share these differ little.

**The target.** `target = basis * percent / 100 + offset` of the tier, then clamped (below).

**Keeping the team's shape.** Two options:

- **Offset (proposed).** The team's highest original level becomes the target; every other Pokémon keeps its distance
  below it: `new = target - (originalAce - original)`.
- **Ratio.** Every Pokémon is multiplied by `target / originalAce`.

| Example | Original | Basis | Offset rule | Ratio rule |
| --- | --- | --- | --- | --- |
| Cheren, `gym` 100% | 11, 11, 11, 13 | 20 | 18, 18, 18, 20 | 17, 17, 17, 20 |
| Youngster, `normal` 85% -1 | 4, 5 | 20 → 16 | 15, 16 | 13, 16 |
| Hugh's first, `rival` 98% | 5 | 12 → 11 | 11 | 11 |
| Iris, `champion` 100% +2 | 57 ×5, 59 | 70 → 72 | 70 ×5, 72 | 70 ×5, 72 |
| A team of 5 and 15, `normal` | 5, 15 | 40 → 33 | 23, 33 | 11, 33 |

Ratio inflates early gaps (the last row), and shrinks them when scaling down. Offset keeps a boss's ace exactly as far
ahead as the designer set it. A `max_gap` (say 10) keeps a filler Pokémon from falling far behind when scaled up.

**Clamps.**

- Never below 1 nor above 100 (and the tier's own `max`).
- `floor`: per tier, the least share of the original level. `gym`, `elite`, `champion`: 100% (a boss is never easier
  than the original); `normal`: 0 (they scale down with an under-levelled player, as wild Pokémon do). The user decides.
- `cap_by_badges` (optional): the highest target for each badge count (`getBadgeCount`, as `btl_setup.c:249` reads
  it), so an over-levelled player doesn't meet a Lv. 70 Cheren.

**The feedback loop.** Trainers at the player's level give the player more Exp. as the player grows. The game's own
formula damps it: base Exp. is `baseExp * level / 5` (`src/ov167/btl_calc.c:493-506`), ×1.5 for trainers
(`btl_server_flow_sub.c:506-507`), then scaled by the two levels (`ScaleExpGainedByLevel`, `:588`), which gives less
for a foe at or below the player's level. So the loop doesn't run away (inferred), but grinding never makes the game
easier, and the story's pacing then comes from the floor and the badge cap rather than the levels. A badge floor
(`floor_by_badges`) is the other way to stop an under-levelled run from making leaders easy.

## Moves, evolutions and stats

- **Stats.** For a level change after creation: set `PKM_PARAM_EXP` to `PML_UtilGetPkmLvExp(species, form, level)` and
  call `PokeParty_RecalcStats` (as `fest_mission_gimmick.c:66-82`). `PokeParty_RecalcStats` keeps a full-HP Pokémon at
  full HP (`poke_tool.c:1395-1413`). `adjustPkmLvForChallengeKeys` doesn't do this: it changes the shown level only.
- **Level-up moves.** A party without moves (`partyKind` without `PARTY_MOVES`) gets `PokeParty_SetDefaultMoves`
  again at the new level. A party with moves keeps them: scaled down, a Pokémon may know moves above its level; scaled
  up, it keeps its early moves. Proposed: keep custom moves (`moves: "keep"`), with `"level_up"` per trainer or tier.
  After new moves, friendship follows `TrainerUtil_SetupPkm`'s rule (0 with Frustration).
- **Held items, IVs, nature, gender:** unchanged. Doing it after creation keeps the PID seed from the stored level, so
  the nature and gender stay as the designer saw them.
- **Abilities.** `setChangedPkmSpecies` (`poke_tool.c:394-400`) changes species, name, sex and ability, but takes the
  ability from the PID's bit 16 (`PID_ABILITY_BIT`, `poke_tool.c:46`, `539-555`), while trainers set their slot
  explicitly from the entry (`tr_tool.c:790-800`) and set the PID's bit 0. After evolving, the slot must be set again
  from the entry's `genderAbility`.
- **Evolutions.** The game never evolves trainer Pokémon. `CheckEvolveSpecies` (`src/system/evolution_check.c:30`)
  isn't usable for this: trainer Pokémon have friendship 255, so friendship evolutions pass at any level
  (`:66-80`), and stones and trades aren't level-up checks at all. Proposed: a table made by the packer from
  `res/pokemon/*/data.json`'s `evolutions` (`res/pokemon/lillipup/data.json:126-132`): for each species, what it
  becomes and at what level, with a default level per non-level method (friendship, stone, trade) in the data file,
  and the reverse, so a scaled-down Stoutland can be a Herdier. Branches (Eevee, Tyrogue, Burmy) take the first listed
  or an override. Off for tiers or trainers that set `evolve: false`.

## Data design

`res/paperwhite2/trainer_scaling.json`, with its schema beside it:

```json
{
    "basis": "top3",
    "evolve": { "friendship": 30, "stone": 36, "trade": 40, "other": 40, "devolve": true },
    "tiers": {
        "normal":   { "percent": 85, "offset": -1, "floor": 0 },
        "strong":   { "percent": 92, "offset": 0,  "floor": 0 },
        "rival":    { "percent": 98, "offset": 0,  "floor": 100 },
        "gym":      { "percent": 100, "offset": 0, "floor": 100 },
        "villain":  { "percent": 100, "offset": 1, "floor": 100 },
        "elite":    { "percent": 100, "offset": 1, "floor": 100 },
        "champion": { "percent": 100, "offset": 2, "floor": 100 },
        "ally":     { "percent": 100, "offset": 0, "floor": 100 },
        "fixed":    null
    },
    "rule": "offset",
    "max_gap": 10,
    "cap_by_badges": [15, 22, 28, 34, 40, 46, 52, 58, 100],
    "classes": {
        "TRAINER_CLASS_LEADER_CHEREN": "gym",
        "TRAINER_CLASS_ACE_TRAINER_M": "strong",
        "TRAINER_CLASS_SUBWAY_BOSS_INGO": "fixed"
    },
    "trainers": {
        "TRAINER_RIVAL": { "tier": "rival", "evolve": false },
        "TRAINER_CHAMPION_IRIS_2": { "tier": "fixed" }
    }
}
```

**The packer** (`tools/paperwhite2/trainer_scaling.py`) resolves it into one member: a header (basis, rule, gap, caps),
the tiers (8 bytes each), a tier byte for each of the 814 trainers (class rule, then the trainer's override), and the
evolution table (about 650 species × 6 bytes: next species, level, previous species). About 5 KB, read onto the
battle setup's heap when a trainer is loaded, not kept in BSS. It could be a member after the trainers in `a/0/9/1`
(`configure.py`'s `HACK_ARCHIVE_MEMBERS`, with `res/pokemon/*/data.json` as an extra source as the encounters have).
`TrainerData_ReadTrainerData` reads files below 814 only (`tr_tool.c:508-521`, Battle Institute files 660 and 661), so
a member at 814 is free (inferred: nothing else counted reads that archive's size).

## The plan

1. **Hook** in `BtlSetup_LoadTrainer` (`src/system/btl_setup.c:171-173`), between the party and the season forms:

   ```c
   TrainerUtil_LoadParty(trainerId, *party, heapId);
   #ifdef PAPERWHITE2
       // Paper White 2: trainers' levels scale to the player's party by their tier (trainer_scaling.json)
       PaperWhite2_TrainerScaling_Apply(gameData, trainerId, client, *party, heapId);
   #endif
   TransformVsPokePartyBySeason(...);
   ```

   This reaches every story battle and nothing of the PWT or the facilities. The alternative, passing a level into
   `PokeParty_CreatePkm` inside the four cases of `TrainerUtil_LoadParty`, needs `gameData` passed in and changes the
   PID seed unless the stored level is kept for it; doing it after costs one more learnset read per Pokémon.
2. **The code,** `src/paperwhite2/main/paperwhite2_trainer_scaling.c` and `include/paperwhite2/trainer_scaling.h`
   (main, since `btl_setup.c` is main and the field calls it): load the member; the tier from the table, or `fixed`
   for an ID >= `0x500` or a Black Tower zone; the basis from the player's party (`GameData_GetParty`, as
   `ConditionContext_FillParty`); the targets; for each Pokémon, evolve or devolve (`setChangedPkmSpecies`, then the
   ability slot again from the party entry's `genderAbility`, read again from `ARCID_TRPOKE` with the kind), Exp.,
   `PokeParty_RecalcStats`, and `PokeParty_SetDefaultMoves` for a party without moves. Rough size 1.5-2 KB of code.
3. **The packer** and its schema, with `check` (every class named exists) and `preview TRAINER BASIS` printing the
   scaled party, as `encounters.py odds` does.
4. **The editor:** the Trainer Editor (`editor/src/modules/trainers/TrainerEditor.tsx`, which already shows each
   card's level, `:139`) gets a "preview at party level N" control and the trainer's tier, computing the same rule in
   TypeScript, with a test that it agrees with the packer's `preview` (as `encounters-packed.test.ts` does).
5. **Docs:** a section of `docs/paperwhite2/plugins.md`.

**Risks.**

- The Challenge and Easy keys then add their zone offset on top (`adjustPkmLvForChallengeKeys`), shown level only.
  Either leave it, or skip it for scaled trainers.
- Prize money is the last Pokémon's level × the class's money × 4 at the battle's end (`btl_calc.c:576-588`), so it
  scales too; low money early and high money late follow the player.
- Evolving changes the species a script or a message may name ("my Lillipup!"). Per-trainer `evolve: false` fixes those.
- Scaled-down custom movesets keep moves above their level.
- Multi and double battles: clients 1 and 3 are scaled each by its own trainer; the ally (client 2) by `ally`.

**Verified by reading:** the loader, its two callers, the order of the challenge, Funfest and traded-Pokémon steps,
the facilities' own paths, the ability bit, the Exp. and money formulas, the evolution check's friendship rule, the
wild basis.

**Inferred:** that no other code builds a trainer party from `ARCID_TRDATA`; the safety of a new member in `a/0/9/1`;
that the Exp. loop settles; which ordinary classes deserve `strong`.

**Only a game test confirms:** the stats and moves shown in battle and on the summary after the change; a Black Tower
boss untouched; PWT untouched; a double and a multi battle; a scaled-down custom moveset in battle; the money and Exp.
given.

## The user's decisions (2026-11-04)

- **One party level for wild and trainer battles**, each with its own modifiers (the wild ones' 80% and spread;
  each trainer tier's), and a solid formula for it chosen first: see "The party's level: formulas" below.
- **A floor by badge count** to stop exploits such as filling the party with level 1 Pokémon.
- **Below their original level:** possibly, undecided.
- **Caps:** not wanted as an imposed limit; a gentler form (below) is to be considered.
- **Trainer Pokémon stay as they are**: no evolving or devolving, no moveset changes; only the level, the stats
  recalculated for it.
- **Rematches scale** too.
- **Funfest missions** (the Entralink's missions, ov072) will likely be removed or reworked with the Entralink; no
  scaling for them.
- **The partner in multi battles scales** to the party level itself, without the opponents' tier modifiers.

## The party's level: formulas (2026-11-04)

The basis both kinds of battle share. The player can lower it to make battles easy (the exploit to stop); raising
it only makes battles harder. Eggs never count. Today's wild basis is the median, the lower middle level of the
party: that one can be gamed, as the examples show.

Candidates, on the party's levels sorted highest first:

| | Formula | In words |
| --- | --- | --- |
| A | median | today's wild basis |
| B | mean of the top 3 | the three strongest |
| C | (highest + mean of the top 3) / 2 | top-heavy: the strongest counts most |
| D | highest | the strongest alone |
| E | weighted mean, weights 6, 5, 4, 3, 2, 1 | every member counts, the strong more |

Each then raised to the **badge floor**: the lowest level of the last gym leader beaten (the current parties:
0 badges 5, Cheren 11, Roxie 16, Burgh 22, Elesa 28, Clay 31, Skyla 37, Drayden 46, Marlon 49; 56 after the
Champion, the Elite Four's first round), kept in `level_scaling.json` so it can be tuned.

Worked examples (rounded down):

| Party | Badges (floor) | A | B | C | D | E |
| --- | --- | --- | --- | --- | --- | --- |
| A balanced team: 24, 22, 21, 19, 18, 15 | 3 (22) | 19 → **22** | **22** | **23** | **24** | 21 → **22** |
| One carry and fillers: 40, 5, 5, 5, 5, 5 | 2 (16) | 5 → **16** | **16** | **28** | **40** | 15 → **16** |
| Padded with level 1s: 30, 28, 27, 1, 1, 1 | 4 (28) | 1 → **28** | **28** | **29** | **30** | 20 → **28** |
| Raising a new catch: 45, 44, 43, 42, 41, 10 | 6 (37) | **42** | **44** | **44** | **45** | **41** |
| A solo run: 50 | 7 (46) | **50** | **50** | **50** | **50** | **50** |

- **A (median)** falls to the floor as soon as half the party is weak: the padding exploit, which only the floor
  stops. It's also the one most thrown by a new catch.
- **B (top 3)** ignores fillers but is lowered by a carry with two weak members.
- **C (top-heavy)** follows the strongest Pokémon closely, isn't lowered by fillers or padding, and doesn't jump
  when a new catch joins. **The recommendation**, with the badge floor.
- **D (highest)** can't be gamed at all, but one over-levelled Pokémon makes every battle hard for the rest of the
  party.
- **E (weighted)** is gamed by fillers as A is.

A gentler ceiling, in place of a cap: levels above the **next** gym leader's lowest level count half. Before the
third badge (Burgh, 22), a party level of 40 counts as 22 + (40 − 22) / 2 = 31, so grinding still makes battles
harder, only less so, and nothing stops it. Off unless the user wants it.

## Open questions for the user

1. The basis: the party's top three, its median (as wild), or its highest level?
2. May trainers go below their original level when the player is under-levelled, and for which tiers?
3. A level cap by badges, so an over-levelled player still meets a leader at a set level?
4. Evolve and devolve trainer Pokémon with their level, and at what levels for stone, friendship and trade evolutions?
5. Custom movesets: keep them always, or give level-up moves when the level moves far from the original?
6. Postgame rematches (Iris's rematch, the second Elite Four round): scale, or keep their set levels?
7. Funfest missions, traded-Pokémon battles, the Challenge key's offset: on top, or skip?
8. Should the ally in multi battles scale?
