# The Entralink roguelike: the first prototype

Built 2026-11-15 on `entralink-roguelike.md`'s design and survey (sections 1 and 3), to answer "does it work": a run of
four rooms in the Entree Forest, each with a legendary to battle, from a cleared Entralink hub. No buffs, no damage or
HP numbers, no C-Gear screen, no run bag yet. Step 2 (same day) added the level-100 team and the forfeit; see "Step 2"
below.

## What a run is

1. **The hub** (`ZONE_ENTRALINK`) has no Entree monolith, no tutorial and one NPC (the Lady south of the Entree), who
   asks and takes the player back to their own world (`CallEntralinkWarpOut`). Walking off the hub's south walkway
   still asks the same (vanilla's Script_14).
2. **Walking off the hub's top edge** starts a run and enters room 1.
3. **Rooms 1-3** are run.json's pool (Dialga, the Rayquaza raid, Ho-Oh) in a random order (`GFL_RandomLC`,
   Fisher-Yates), in `entree_forest` and `entree_forest_6` in turn. **Room 4** is always Darkrai, in `entree_forest_2`.
   Every room is entered at its bottom exit, facing up.
4. **In a room** the challenge's enemies stand as overworld Pokémon (the forest's own walking-Pokémon sprites).
   Talking to one plays its cry and starts the challenge's battle.
5. **An exit** says "A nightmare blocks the way." and steps the player back until the room's battle is won; then any
   exit leads to the next room. After Darkrai's battle the player goes straight to the hub's entrance ("The Entralink's
   nightmare is over... for now.").
6. **A loss** ends the run: "You woke from the nightmare...", the hub's entrance, the real party back as it was.
   **Running** is a forfeit: a Yes/No warning, and Yes always ends the battle and the run ("You turned away from the
   nightmare and woke up...").
7. **Battles** are wild battles (so the scripts' battle result commands and the wild BGM work) with balls refused as
   in a trainer battle ("Don't be a thief!"), fought by the run's team: copies of the party at level 100.

## Files

- `src/paperwhite2/ov012/paperwhite2_entralink_run.c`, `include/paperwhite2/entralink_run.h`: the run (start, room
  zone, exits, spawning the room's actors, building the battle, the script command `EntralinkRun`). Overlay 12, beside
  the Entree Forest's script commands that call it.
- `include/paperwhite2/entralink_run_actions.h`: the command's actions and results, for the scripts.
- `include/paperwhite2/entralink_run_battle.h`: `ENTRALINK_RUN_BTL_SETUP_FLAG` (BtlSetup flag `1 << 20`), which marks a
  run's battle for the battle's hooks.
- `src/paperwhite2/main/paperwhite2_entralink_run_party.c`, `include/paperwhite2/entralink_run_party.h`: the run's team
  (step 2). In ARM9 main, since the battle overlay asks it about prestige and its copies must outlive every overlay.
- Hooks (each `#ifdef PAPERWHITE2`, `// Paper White 2:`):
  - `src/ov033/entree_forest_first_warp.c`: the hub's top edge starts the run.
  - `src/ov012/scrcmd_entree_forest.c`: in a run, the forest's spawn command spawns the room's enemies, an exit leads
    to the next room (or the hub), and the forest warp takes the run's zone instead of the forest grid's.
  - `src/ov012/event_battle.c`: a run's battle reopens the field after a loss (as the Battle Subway's does), so the
    script can end the run instead of whiting out.
  - `src/ov167/btl_server_flow_sub.c` (`ThrowBall`): balls are refused in a run's battle.
  - `src/ov167/btl_main.c` (`PokeCon_CreateClientParty`): the foe's fainted members stay in place in a run's battle,
    which puts a raid's enemy in the center.
  - `src/ov167/btlv_scu.c` (the hack's own wild triple intro): a fainted wild mon isn't shown and has no gauge, and the
    message names only those there ("A wild Rayquaza appeared!").
  - `src/system/game_data.c` (`PaperWhite2_GameData_SetParty`, declared in `include/system/game_data.h`): makes the
    copies the game's party and back.
  - `src/ov012/zone_change.c` (`ZoneChange_OnFieldLoad`): ends a run the player left another way.
  - `src/ov167/btl_main.c` (`GetRunMode`): a run's battle is run mode 2, the Subway's forfeit.
  - `src/ov167/btl_client.c` (`BattleClient_ActionSelectEscape`): the forfeit's own question,
    `Bank0019_Text_EntralinkRunForfeit` in `res/text/system/0019.txt`.
  - `src/ov167/btl_server_flow.c` (`ServerControl_GiveExp`): no prestige for a copy of a Pokémon below 100.
  - `src/ov012/scrcmd_vm.c`, `src/ov012/script_sys.c`: command 0x2f8 `EntralinkRun`; the debug menu's `Debug` moves to
    0x2f9 (`include/asm/field_script.inc`, `tools/script/field_commands.json`, `res/paperwhite2/scripts/commands.json`).
- Scripts and text:
  - `res/field/scripts/global_10490.s`: the four exits check `ENTRALINK_RUN_ACTION_CAN_LEAVE`; Script_9 (10498, the
    enemy's talk script) runs the battle and its outcome. Text: five lines at the end of `global_10490.txt`
    (`RanFromNightmare` is the forfeit's).
  - `res/field/events/entralink.json`: the hub's events cleared (above); `entralink.s` Script_10 is the remaining NPC's
    Yes/No warp out.
- `generated/vars.txt`: `EVENT_WORK_ENTRALINK_RUN_ROOM` (0x405b), `_ORDER` (0x405c), `_CLEARED` (0x405d).
- Data: `res/paperwhite2/entralink/` (below); packer `tools/paperwhite2/entralink_run.py`, wired into `configure.py`
  (`--hack`), writing `build/include/generated/paperwhite2/entralink_run_config.h`; its test
  `tools/paperwhite2/test_entralink_run.py`.

## The data

All names are the repo's constants. The packer checks both files against their schemas
(`run.schema.json`, `challenge.schema.json`, beside them) and the rules below. **A new challenge file needs
`python3 configure.py w2_us --hack` again** (the build's inputs are listed when configuring).

`res/paperwhite2/entralink/run.json`:

| Field | What |
| --- | --- |
| `pool` | Challenge IDs (file names in `challenges/`) the rooms before the last are drawn from, at most 15, no repeats |
| `pool_rooms` | How many rooms are drawn, without repeats; at most the pool's size and 4 (one variable, a nibble each) |
| `final` | The last room's challenge |
| `room_maps` | `ZONE_ENTREE_FOREST*` zones of the drawn rooms, taken in turn; each needs a bottom exit |
| `final_map` | The last room's zone |

`res/paperwhite2/entralink/challenges/<id>.json`, one challenge each; its ID is the file's name:

| Field | What |
| --- | --- |
| `name` | For the editor (not shown in game yet) |
| `tier` | 1-255, for the editor and later room picks |
| `format` | `single` (1 enemy), `double` (1-2), `triple` (1-3), `raid` (exactly 1: a triple battle with it in the center) |
| `weather` | Optional `BTL_WEATHER_*` from the battle's start; without it, the field's |
| `enemies[]` | 1-3 of: `species` (`SPECIES_*`), `form` (0), `level` (70), `moves` (1-4 `MOVE_*`, replacing the level's), `ability` (`ABILITY_*` or `"hidden"`; without it one of the species' two), `item` (`ITEM_*`), `gender` (`male`/`female`; random), `shiny` (false), `actor`: `x`, `z` (tiles, 0-31) and `facing` (`DIR_*`) |

Parenthesised values are the defaults. A room is 32 by 32 tiles: the exits are at x 15-16 z 9 (top), z 24 (bottom),
and x 5 / x 26 at z 15-17 (left, right); the player arrives at x 15 z 23. Each enemy gets its own actor (IDs 0-2);
talking to any of them starts the battle, and a win removes them all.

## The room format

`res/paperwhite2/entralink/rooms/<id>.json`, one room each, with `room.schema.json` beside them; its ID is the file's
name. Edited in the editor's **Entree** page (`editor/src/modules/entree/`). It **replaces `challenges/` at the wiring
step**: until the game and the packer read it, the game still reads `run.json` and `challenges/` (the format above), and
the four rooms here are the prototype's four challenges converted (Dialga, Ho-Oh and the Rayquaza raid generic rooms,
Darkrai the final room). All names are the repo's constants.

| Field | What |
| --- | --- |
| `name` | For the editor |
| `rounds` | Optional: the rounds it is kept to, any of `1` (before the first boss), `2` (before the second), `3` (before the final room). Left out, a generic room that can come up in any round |
| `role` | `room` (one of a round's rooms), `boss` (ends round 1 or 2; the bosses have their own pool) or `final` (the run's last room) |
| `weather` | Optional `BTL_WEATHER_*` for its battles from their start (`BTL_WEATHER_NONE` for clear); left out, random (designed later) |
| `battles[]` | Up to 8 of: `id` (lower case, the name NPCs use), `format` (`single` 1 enemy, `double` 1-2, `triple` 1-3, `raid` exactly 1 in the center), `enemies[]` (1-3, as a challenge's without `actor`: `species`, `form`, `level`, `moves`, `ability`, `item`, `gender`, `shiny`, same defaults) |
| `npcs[]` | Up to 16 of the NPC record below. If none spawns, the room is free and the player goes on |

An NPC:

| Field | What |
| --- | --- |
| `type` | `battle` (talking starts the battle it names), `item` (gives an item), `rest` (opens the rest menu) or `buff` (the buff menu); the last two are built later |
| `battle` | A battle NPC's battle, by `id`. Several NPCs may start one battle (Kyogre and Groudon side by side for one double battle); several battles, one NPC each, let the player choose |
| `enemy` | A battle NPC's enemy (0 the first, the default) whose overworld sprite it shows and whose cry it plays |
| `item`, `count` | An item NPC's item (`ITEM_*`) and how many (1) |
| `sprite` | Optional `OBJ_CODE_*`: its own overworld sprite, any Pokémon's or person's. Without it a battle NPC shows its enemy's walking Pokémon (`OBJ_CODE_POKEMON_<species>`), an item NPC the item ball (`OBJ_CODE_110`); rest and buff NPCs need one. A new Nightmare with no walking sprite needs one too (the editor warns) |
| `flag` | Optional `EVENT_FLAG_*`: it spawns only while the flag is set (the Nightmare Ball after a finished run) |
| `chance` | Its chance to spawn, 1-100 percent (100) |
| `x`, `z`, `facing` | Its tile (0-31) and `DIR_*` |

**No map per room.** The game will pick the clearing by the door taken (the left door leads to a clearing with an
entrance on its right), so a room is placed on the clearings' shared 32 by 32 grid: every clearing has its exits at the
same tiles (x 15-16 z 9, x 15-16 z 24, x 5 and x 26 at z 15-17) and only some of them. The editor draws one clearing
faintly behind the grid, switchable, and checks each NPC against all nine: on an exit of any clearing is an error, on a
tile blocked in any is a warning, as is standing where the player arrives (x 15 z 23).

**Levels are base values:** the run will scale the enemies with the number of rooms visited (designed later).

The editor's other checks: a battle NPC naming no battle or a missing one, a battle no NPC starts, more enemies than the
format takes, a battle NPC showing an enemy its battle doesn't have, an item NPC without an item, two NPCs on one tile,
and over all the rooms: no final room, a round with no rooms, round 1 or 2 with no boss.

## How it works

- **Run state:** three saved event variables (room 1-5, 0 outside a run; the pool places drawn, a nibble a room; the
  room won). The Entralink's field menu has no Save, so a run can't be saved mid-way. Each map load
  (`ZoneChange_OnFieldLoad`) ends a run the player is no longer in (any zone outside the forest, or a run without its
  copies, as after loading a save made in one), so leaving it another way (the debug menu's warps) also ends it.
- **Rooms:** `EventEntreeForestWarp` with the run's zone instead of `SymbolMap_GetZone`; the zone's init script
  (`EntreeForestSpawnAllPkm`, type 4, which runs on every load) spawns the enemies, skipping any already there and a
  won room's.
- **Battles:** the enemy party made as the forest makes its Pokémon (`PokeParty_CreatePkm`, the data's form, ability,
  item, moves, gender and shininess), `BtlSetup_SetWildNormal` with the format's style, the field's status with the
  data's weather, then `EventWildBattleCall_Create` with the script's own fade-in (`CallWildBattleEnd`). A raid's party
  is three copies of the enemy, the first and third fainted (HP 0): with the btl_main hook they keep their places, so
  positions 1 and 5 are empty and the enemy is at 3, the center.
- **Not catchable:** `ThrowBall` treats a run's battle as a trainer's: the ball is used up with "The Trainer blocked
  the Ball! Don't be a thief!".

## Step 2: the level-100 team and the forfeit (2026-11-15)

### The team

- **At the run's start** (`EntralinkRun_Start`) the party is copied into `sRunParty` (ARM9 main BSS, 0x534 bytes, which
  no map change, battle or menu frees) and each copy that isn't an egg is set to level 100 (`setLevel`: the level's
  Exp., stats recalculated) and healed (`PokeParty_Recover`: HP, PP, status). Eggs are copied untouched. Then
  `GameData`'s party pointer points at the copies. Everything that reads `GameData_GetParty` (the party screen, the
  summary, the follower, `BtlSetup_LoadPlayerParty` and the battle's copy back) sees the copies with no other hook.
- **The real party never moves**: it stays in the save's own party block (`SAVE_BLOCK_PARTY`), which nothing writes
  during a run, since only `GameData` reached it through that pointer. So **any save, whatever made it, writes the real
  party**, and a power-off loses nothing. This is why the pointer swap was chosen over copying the copies into the
  party block: the "block every save path" problem goes away.
- **Damage carries:** HP, PP and status are simply the copies'.
- **No Exp., moves or evolution:** the copies are level 100, so `ServerControl_GiveExp` gives no Exp., nothing levels,
  so nothing learns a move or evolves after a battle. Its prestige branch now asks `EntralinkRun_CanGainPrestige`: a
  copy gains prestige only if its real Pokémon (found by PID in the real party, wherever the player moved the copy) is
  level 100. Copies do gain EVs from run battles (their stats moved by 1 in the test); they're discarded with them.
- **The run's end** (`EntralinkRun_End`: Darkrai beaten, a loss, a forfeit, the hub warp, or a map load outside the
  forest) points `GameData` back at the real party, after writing each level-100 Pokémon's prestige from its copy
  (only when it changed, so the others stay byte for byte). Held items used up in the run come back, since the real
  party never changed. A lost run no longer heals: the real party comes back as it went in.

### The forfeit

- `GetRunMode` returns 2 for a run's battle (`ENTRALINK_RUN_BTL_SETUP_FLAG`), the Battle Subway's mode: RUN asks a
  Yes/No, with the run's own question ("If you run, you'll wake from the nightmare and your run will end. Run
  anyway?", `Bank0019_Text_EntralinkRunForfeit`); No goes back to the command menu. Yes always escapes: in mode 2 the
  client skips `CheckEscapeBlocked` and the server `ServerEvent_CheckSureEscape`, the speed roll and
  `ServerEvent_CheckEscapeBlocked`, so no trap (Mean Look, Shadow Tag, Arena Trap, Fairy Lock) holds and no Smoke
  Ball or Run Away message shows. The battle ends with `BTL_RESULT_FLEE`, which `EntralinkRun_FinishBattle` returns as
  `ENTRALINK_RUN_RESULT_FORFEIT`: "You turned away from the nightmare and woke up...", then the hub as for a loss.
- **Escapes by moves**, unchanged in effect from the prototype but now silent and unblockable (mode 2 makes
  `ServerControl_EscapeSub` always succeed): the player's Teleport, and Roar/Whirlwind used on the foe
  (`BattleHandler_QuitBattle`), end the battle at once without the question, which ends the run (Teleport as a
  forfeit, `BTL_RESULT_FLEE`). A foe that escapes the same way ends it as a loss. In the prototype these already ended
  the run (any result but a win does); left as they are, since the run's challenges choose the foes' moves.

### Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `roguelike2/`)

The save's party: six Pokémon at levels 15-24. Before the run, slot 0 was poked to level 100 with prestige level 2,
progress 3 (and damaged, asleep), slot 1 fainted and poisoned, slot 5 made an egg.

- **The copies** (`sRunParty`, read in room 1): five at level 100 with recalculated stats (e.g. Keldeo 323 HP, Attack
  330), all at full HP, full PP and no status (the fainted, poisoned one at 215/215); the egg byte for byte the same as
  the real one; slot 0 keeping its prestige. The battle and the party screen show "Lv. 100" and the prestige
  Pokémon's "Lv. 102".
- **The real party** in the save's block: unchanged through the whole run (decrypted, compared after walking in the
  rooms, after battles and at each end).
- **Carrying over:** a move's PP used in room 1's battle (20 to 19) was still 19 in room 4.
- **Prestige:** winning the Rayquaza raid gave the level-100 copy 91 Prestige Points and the copies of the others none;
  after Darkrai the real slot 0's prestige was written back (3074 to 342018), and the real party was otherwise the
  same as before the run, byte for byte apart from the prestige and its checksum.
- **A win** (Darkrai, room 4 reached by setting the room variable): back at the hub, run over, party restored.
- **A loss** (Rayquaza, the copies poked to faint): "You woke from the nightmare...", the hub, the real party exactly as
  before (including the slot 0's damage and sleep, and the fainted slot 1).
- **The forfeit** against a foe made faster (Speed 999) and given Shadow Tag in RAM: the question, No back to the
  command menu, RUN again, Yes ended the battle with no other message, "You turned away from the nightmare and woke
  up...", the hub, the real party exactly as before.
- **A party of one**, then the debug menu's "Warp to last Pokémon Center" from room 1: the copy at level 100 in the
  party screen; the warp ended the run (room 0) and gave back the real party exactly.
- **No Save** in the field menu in a forest room (screenshot).

Not tested: a real level-100 Pokémon (slot 0 was poked, so its copy kept stale stats until the battle recalculated
them), Teleport and Roar in a run battle, a run with a full party's held items used up, real hardware.

### Saving, now and later

- **Now:** nothing in the run's zones saves (the field menu has no Save there, no Entralink or forest script uses
  `Scrcmd_Save_SaveDataWrite`), and even if something did (the C-Gear's wireless parts, if any were reachable), it
  would write the real party, because the copies are outside the save. The run's variables would be saved mid-run;
  loading such a save finds a run without its copies, and the first map load ends it.
- **Later, a real mid-run save** needs the opposite of what a stash would: the real party is already in the save, so
  it is the **copies** (6 x 220 bytes, 0x534 with the party's header) and the run's state that need a place in the
  save, in the freed Symbol block (survey 3.3, 2128 bytes), and loading would point `GameData` at them again.

### Gaps found

- **Held items can be duplicated or lost:** taking a copy's held item in the party screen puts it in the real bag,
  and the real Pokémon still holds it after the run; giving a copy an item from the bag loses it at the run's end.
  The run bag (design section 1) would settle this; until then the party screen's Item command could be hidden in a
  run. A decision for the user.
- **Bag items on the copies:** an evolution stone or a Rare Candy from the real bag works on a copy (the stone evolves
  it, until the run's end) and is used up. Same fix as above.
- **The follower** walks as the copy: its steps and any gift it finds in a run are counted on the copy and lost at the
  end (a gift put in the bag stays).
- **Time-based form changes** (Shaymin at night, the seasons' Deerling and Sawsbuck, `ShayminForm_*` and
  `TransformVsPokePartyBySeason` on `SaveControl_GetPokePartySave`) still apply to the real party during a run, as they
  would outside it; the copies keep the form they started with.

## The re-entry question

**Re-entering the same map works as a fresh room.** Tested by poking the room-maps table in RAM to `entree_forest`
twice: from room 1 in `entree_forest` (Ho-Oh standing in it), the top exit led to room 2 in `entree_forest` again, with
Ho-Oh gone and Rayquaza standing there. The map change reloads the zone and runs its init script again. So the rooms
don't need to alternate; they do in run.json now only because the user's plan names both maps.

## Tested (py-desmume, the user's save copy, 2026-11-15)

- The debug menu's Player... > Entralink warps in ("Riku warped to the Entralink!"); the hub shows no NPC near the
  Entree and no monolith event.
- Three boots gave three orders (`[Dialga, Ho-Oh, Rayquaza]`, `[Ho-Oh, Dialga, Rayquaza]`, `[Dialga, Rayquaza,
  Ho-Oh]`): the order is random per run.
- Rooms: 1 and 3 in `entree_forest` (zone 0x118), 2 in `entree_forest_6` (0x11d), 4 in `entree_forest_2` (0x119)
  with Darkrai. Each room's enemy stood at x 15 z 14 and started its battle; an exit before the win showed the message
  and stepped back; after the win, exits up, left and right each led to the next room.
- The raid: a triple battle, "A wild Rayquaza appeared!", one enemy gauge, the battle's positions (BtlPosPoke) empty
  at 1 and 5 with Rayquaza at 3, the center, and the left Pokémon's target screen showing Rayquaza in the middle with
  the two sides empty. Won by attacking.
- Ho-Oh's battle started in harsh sunlight (its `weather`).
- After Darkrai's win: the hub's entrance (31, 36), the run over (room 0).
- A loss (Darkrai): "You woke from the nightmare...", the party healed, the hub's entrance, run over (before step 2).
- Running away (a Smoke Ball): the same (before step 2's forfeit).
- A Poké Ball in Dialga's battle: refused, "Don't be a thief!".
- A new run after a lost one: walking off the top edge again starts a fresh run at room 1 with a new order.
- The hub's NPC: Yes took the player back to where the debug warp left (the city's spot).
- No Save in the field menu in the Entralink zones (vanilla), so a run can't be saved mid-way.
- Battles were won by poking the party's stats (999) and levels (100, which also stops the hack's party-wide Exp.
  Share from teaching moves); losses by poking the party's HP.

Not tested: double and triple challenges with two or three enemies (no data has one yet), shiny/gender/hidden-ability
enemies, a run left by other means (the debug menu's warps), real hardware.

## Known gaps and next steps

- **Messages:** the ball refusal says "The Trainer blocked the Ball!" (the user is fine with it: the run's bag won't
  hold balls).
- **Level 100 and the forfeit:** done in step 2 (above), with its gaps (held items, bag items on the copies).
- **Damage carrying over** is the copies'; rest rooms, the run bag, buffs, markers over the exits, the C-Gear screen,
  rewards: not started.
- **Save:** a real mid-run save would need the run's state (room, order, buffs, run bag, seed) and the copies in the
  freed Symbol block (survey 3.3) and a Save in the Entralink's menu; the three variables are the prototype's
  stand-in.
- **The forest grid:** a run ignores `SymbolMap` (areas, `deepestArea`); the zones' other layouts (two and three exits)
  aren't used yet. An exit's direction is ignored: every exit leads to the same next room.
- **Exits** step the player back; a marker in front of each exit would say what lies behind it (design section 1).
- The Entralink is still reached only by the debug menu.
