# The Entralink roguelike: the first prototype

Built 2026-11-15 on `entralink-roguelike.md`'s design and survey (sections 1 and 3), to answer "does it work": a run of
four rooms in the Entree Forest, each with a legendary to battle, from a cleared Entralink hub. No buffs, no damage or
HP numbers, no C-Gear screen. Step 2 (same day) added the level-100 team and the forfeit, step 3 the room format, the
run's bag, catching and saved progress; see "Step 2" and "Step 3" below.

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
- `generated/vars.txt`: the prototype's run state was variables 0x405b-0x405d until step 3, which keeps it in RAM.
- Data: `res/paperwhite2/entralink/` (below); packer `tools/paperwhite2/entralink_run.py`, wired into `configure.py`
  (`--hack`), writing `build/include/generated/paperwhite2/entralink_run_config.h`; its test
  `tools/paperwhite2/test_entralink_run.py`.

## The data

All names are the repo's constants. The packer (`tools/paperwhite2/entralink_run.py`) checks `run.json` and every room
against their schemas (beside them) and the rules below, and fails with a message naming the file. **A new room file
needs `python3 configure.py w2_us --hack` again** (the build's inputs are listed when configuring). Until step 3 the
game read `challenges/` (one challenge per file, an enemy's `actor` placing it); step 3 replaced it with `rooms/`.

`res/paperwhite2/entralink/run.json`:

| Field | What |
| --- | --- |
| `rounds` | 1-3 rounds in order, each `rooms` (how many rooms of role `room` are drawn for it: kept to that round, or to none) and `boss` (rounds 1 and 2: a room of role `boss` ends it; false). The final room follows the last round. No room twice in a run; at most 15 rooms with the final |
| `room_maps` | `ZONE_ENTREE_FOREST*` zones of the rooms before the final, taken in turn; each needs a bottom exit |
| `final_map` | The final room's zone |
| `field_weather` | Optional `WEATHER_*` (`include/system/zone_weather.h`): the field weather of the rooms without a `weather`; left out, the forest's own |

The prototype's run: one round of 3 rooms (Dialga, Ho-Oh and the Rayquaza raid, the three rooms of role `room`), then
Darkrai (role `final`). `progress_ids.json` (`progress_ids.schema.json`) holds the next progress ids the editor gives.

## The room format

`res/paperwhite2/entralink/rooms/<id>.json`, one room each, with `room.schema.json` beside them; its ID is the file's
name. Edited in the editor's **Entree** page (`editor/src/modules/entree/`); the game reads it since step 3. The four
rooms are the prototype's four challenges converted (Dialga, Ho-Oh and the Rayquaza raid generic rooms, Darkrai the
final room). All names are the repo's constants.

| Field | What |
| --- | --- |
| `name` | For the editor |
| `rounds` | Optional: the rounds it is kept to, any of `1` (before the first boss), `2` (before the second), `3` (before the final room). Left out, a generic room that can come up in any round |
| `role` | `room` (one of a round's rooms), `boss` (ends round 1 or 2; the bosses have their own pool) or `final` (the run's last room; one is drawn if there are several) |
| `weather` | Optional `BTL_WEATHER_*`: its battles start in it, and the field shows the matching weather (none and sun: clear, the field has no harsh sun; rain: rain; hail: snow; sandstorm: sandstorm). Left out, the battles take the field's and the field `run.json`'s `field_weather` |
| `battles[]` | Up to 8 of: `id` (lower case, the name NPCs use), `progress_id` (its won-ever bit, below), `format` (`single` 1 enemy, `double` 1-2, `triple` 1-3, `raid` exactly 1 in the center), `enemies[]` (1-3: `species`, `form` (0), `level` (70), `moves`, `ability` (`ABILITY_*` or `"hidden"`), `item`, `gender`, `shiny` (false), `catch`, `progress_id`) |
| `npcs[]` | Up to 16 of the NPC record below. If no battle NPC spawns, the room is free: its exits are open at once |

An enemy's `catch` (left out: it can't be caught): `after` (a list of `"<room id>/<battle id>"`, battles that must have
been won at least once, in any run or earlier in this one; empty: from the first encounter) and `once` (true: never
again once caught). With it the enemy needs its own `progress_id` (its caught-ever bit).

An NPC:

| Field | What |
| --- | --- |
| `type` | `battle` (talking starts the battle it names), `item` (gives an item into the run's bag, then goes), `rest` or `buff` (for now their `before` dialogue, or "This nightmare isn't ready for you yet..."; their menus come later) |
| `battle` | A battle NPC's battle, by `id`. Several NPCs may start one battle (Kyogre and Groudon side by side for one double battle); several battles, one NPC each, let the player choose: **winning one opens the room and every battle NPC goes**, the other battles too |
| `enemy` | A battle NPC's enemy (0 the first, the default) whose overworld sprite it shows and whose cry it plays |
| `item`, `count` | An item NPC's item (`ITEM_*`) and how many (1); if the run's bag has no room, it says so and stays |
| `sprite` | Optional `OBJ_CODE_*`: its own overworld sprite. Without it a battle NPC shows its enemy's walking Pokémon (`OBJ_CODE_POKEMON_<species>`), an item NPC the item ball (`OBJ_CODE_110`), rest and buff NPCs the Lady (`OBJ_CODE_LADY`). A new Nightmare with no walking sprite needs one (the editor warns) |
| `requires` | Optional list: `"<room id>/<battle id>"` (that battle won at least once in any run) and `"run/completed"` (the final room beaten at least once); it spawns only if all hold |
| `chance` | Its chance to spawn, 1-100 percent (100), rolled once as the player enters the room |
| `dialogue` | Optional `before` (on talking; a battle NPC's before its battle) and `after` (a battle NPC's, after its battle is won or its enemy caught, before the room opens): a message in the text files' codes (below) |
| `x`, `z`, `facing` | Its tile (0-31) and `DIR_*` |

**Dialogue** is written as a line of `res/text/` with real line breaks (or `\n`): `{be01}` waits for a key and
`{be00}` starts a new page after one, as the text files use them, and **`{0100:0}` is the player's name** (the script
sets word 0 to it before every message; no other word is set yet). The build packs every room's NPCs' messages, room by
room in ID order, into the script text bank `entralink_dialogue` (`res/text/script/entralink_dialogue.txt` is one line,
`\from{entralink.dialogue}`; `SCRIPT_TEXT_ENTRALINK_DIALOGUE` in `generated/script_text_banks.txt`), and the header
gives each NPC its messages' numbers. Nothing is kept by hand.

**Progress ids** are the save's bits (Step 3's progress block): every battle has its own `progress_id` (0-1023) and
every catchable enemy its own (0-511), unique over all rooms within their kind, never changed or reused once given. The
editor gives them on save from `progress_ids.json`'s `next_battle` and `next_catch`; the packer refuses a missing or
duplicated one, or one not below the next.

**No map per room.** The game will pick the clearing by the door taken (the left door leads to a clearing with an
entrance on its right), so a room is placed on the clearings' shared 32 by 32 grid: every clearing has its exits at the
same tiles (x 15-16 z 9, x 15-16 z 24, x 5 and x 26 at z 15-17) and only some of them. The editor draws one clearing
faintly behind the grid, switchable, and checks each NPC against all nine: on an exit of any clearing is an error, on a
tile blocked in any is a warning, as is standing where the player arrives (x 15 z 23).

**Levels are base values:** the run will scale the enemies with the number of rooms visited (designed later).

The editor's other checks: a battle NPC naming no battle or a missing one, a battle no NPC starts, more enemies than the
format takes, a battle NPC showing an enemy its battle doesn't have, an item NPC without an item, two NPCs on one tile,
and over all the rooms: no final room, a round with no rooms, round 1 or 2 with no boss.

**In the editor (step 3):** an NPC's dialogue is typed in its panel (Before, or On talking, and After the battle), with
Wait and New page buttons, a Fit to the window button (breaks lines too wide at a space, adds a wait where a line would
scroll away unread), warnings for both, and the talk window's preview: the reusable `text/DialogueField.tsx`. An
enemy's Can be caught, Only after (battles of any room, "Room name: battle id") and Only once; an NPC's Spawns after
(the same picker, plus Finished a run). Save first gives new battles and catchable enemies their `progress_id` from
`progress_ids.json` (created if missing; the numbers only go up, from above every id in use, so none is reused or
changed), shown read-only in the battle's header and beside Can be caught; Duplicate drops the copy's ids so it gets
new ones. Renaming a battle or a room renames what every room's `after` and `requires` name of it. The Run section above
the rooms edits `run.json`'s `field_weather`. The checks add: a catch or spawn condition naming a battle no room has, two
battles or catches with one progress id, a room called `run`, an After message on a non-battle NPC.

## How it works

- **Run state:** in RAM since step 3 (`EntralinkRunState`, ARM9 main: the room, the rooms drawn, the room's exits open,
  its NPCs spawned and gone, its field weather, the talked-to NPC, the battle's catches); the prototype's three saved
  variables (0x405b-0x405d) are free again. The Entralink's field menu has no Save, so a run can't be saved mid-way.
  Each map load (`ZoneChange_OnFieldLoad`) ends a run the player is no longer in (any zone outside the forest, or a run
  without its copies), so leaving it another way (the debug menu's warps) also ends it.
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

## Step 3: rooms, the run's bag, catching and saved progress (2026-11-15)

The game reads the room format (above) instead of `challenges/`, which is gone. The roguelike uses **no event flags or
variables**: the run lives in RAM, what lasts in the save's freed Symbol block.

### Files

- `src/paperwhite2/ov012/paperwhite2_entralink_run.c`: the draw (each round's rooms and boss, then the final, at random
  without repeats), entering a room (which NPCs spawn: `requires`, then `chance`; a room with no battle NPC is open at
  once; its field weather), spawning, the battles, the catches' conditions, and the command's actions.
- `src/paperwhite2/main/paperwhite2_entralink_run_state.c`, `include/paperwhite2/entralink_run_state.h`: the run's state
  (`sRunState`) and its bag (`sRunBag`), in ARM9 main, which the battle, the battle's return, the bag and the zone's
  weather reach and no overlay change frees.
- `src/paperwhite2/main/paperwhite2_entralink_progress.c`, `include/paperwhite2/entralink_progress.h`: the progress block.
- `include/paperwhite2/entralink_run_actions.h`: the command's actions (now 12) and results, for the scripts.
- Hooks (`#ifdef PAPERWHITE2`, `// Paper White 2:`): `game_data.c` (`PaperWhite2_GameData_SetBag`),
  `myitem_savedata.c` (`BagSave_GetItemHandleAddCheck`: the run bag's slots), `itemmenu.c` (the pockets shown, no To
  Free Space), `b_bag_item.c` (the Nightmare Ball in the battle's balls pocket), `zone_weather.c` (`GetWeatherAll`: a
  room's field weather), `btl_server_flow_sub.c` (`PaperWhite2_ThrowBall_CanCatch`, `CheckBallCapture`),
  `event_battle_return.c` (the catch into the real party), `pml_item.c` (the ball's icon and look), `save_table.c` and
  `symbol_save.c` (the block).
- Scripts and text: `global_10490.s` Script_9 (any NPC: `TALK` gives its type; battle, item, rest/buff paths; the
  dialogue subroutine `L_RunDialogue` shows a message of `SCRIPT_TEXT_ENTRALINK_DIALOGUE` over the NPC with
  `ActorMsg`, after `WordSetPlayerName 0`), Script_6 (the back door); five lines at the end of `global_10490.txt`.

### The run's bag

- `EntralinkRun_Start` empties `sRunBag` (a whole `BagSave` in RAM, 0x9ec bytes) and points `GameData`'s bag at it, as
  step 2 does the party; `EntralinkRun_End` (a win, a loss, a forfeit, the back door, a warp out) points it back and
  empties it. Everything that reads `GameData_GetBag` sees it: the bag screen, the party screen's Give and Take, the
  battle's bag (`BtlSetup`'s bag), item NPCs, so step 2's holes are closed: a copy's held item comes from and goes to
  the run's bag, and the real bag's stones and Rare Candy are out of reach. The real bag stays in the save's block,
  which any save writes.
- It holds 32 items, 16 medicine and 16 berries (`ENTRALINK_RUN_BAG_*`), and nothing in the TMs and Key Items pockets
  (`BagSave_GetItemHandleAddCheck`). The bag screen's arrows and pocket buttons go only to Items, Medicine and
  Berries, it opens on Items if the cursor was elsewhere, and To Free Space is left out. **The other pockets' buttons
  are still drawn** (touching them does nothing).
- Items used up in a battle are taken from the run's bag as from the real one.

### Catching

- **The Nightmare Ball** (`ITEM_NIGHTMARE_BALL`, unused item 126; `docs/paperwhite2/items.md`). At a run battle's
  start, each enemy whose `catch` holds (its `after` battles won, and not caught if `once`) is noted by its PID with its
  catch id; `ThrowBall` lets the Nightmare Ball catch only those (always, as the Master Ball), and refuses every other
  ball in a run and the Nightmare Ball anywhere else, with the trainer battle's "Don't be a thief!".
- The caught Pokémon goes to the **real party** (`EntralinkRun_GetCatchParty`, the save's party block during a run), or
  a Box if it is full, at its own level, with the Pokédex, nickname and Box messages as usual; it is never one of the
  copies, and stays after the run. A capture counts as winning: the battle's won bit, the catch's caught bit, the room
  open (and the after dialogue).

### The progress block

The Symbol block (`SAVE_BLOCK_SYMBOL`, 0x850 bytes at 0x22a00 and its copy at 0x48a00), reused in place (survey 3.3):

| Offset | Size | What |
| --- | --- | --- |
| 0x00 | 4 | magic `0x45325750` ("PW2E") |
| 0x04 | 2 | version, 1 |
| 0x06 | 2 | runs completed (the final room beaten), at most 0xffff; **"run completed" is this above 0** (`requires`' `run/completed`) |
| 0x08 | 0x80 | battles won at least once, a bit per battle `progress_id` (1024) |
| 0x88 | 0x40 | enemies caught at least once, a bit per catch `progress_id` (512) |
| 0xc8 | 0x788 | free, zero (for a mid-run save or unlocks later) |

- No encryption or checksum of its own: the save's CRC of the block covers it. `EntralinkProgress_Get` clears a block
  without the magic or with another version to an empty progress, so an old save's forest data is dropped the first
  time a run reads it, and the next save writes the new layout; a new game's init writes it directly.
- The forest's original code (`symbol_save.c`, `symbol_map.c`, the Game Sync's arrivals) gets an empty forest in RAM
  from `getAreaNPCData` instead (`EntralinkProgress_GetOldForestBlock`, 0x850 bytes of BSS), and
  `SymbolSave_HasPokemon`, which read the flash's copy, answers FALSE: nothing reads or writes the old layout.
- Written: a battle's bit when it is won or its enemy caught; a catch's bit; the count when the final room is won. All
  in RAM until the game is next saved (the Entralink has no Save: the player saves after going back to their world).

### The back door and the exits

The exit every room is entered by (the bottom one, `ENTRALINK_RUN_BACK_EXIT`, Script_6; in room 1 the one back toward
the hub) asks "Return to the Entralink? Your run will end here." Yes ends the run as a forfeit does (the real party and
bag back, the run bag emptied) and warps to the hub's entrance; No steps the player back. It asks in a cleared room too.
The other exits are blocked until a battle is won (or open at once in a free room) and lead to the next room.

### Weather

A room's field weather is set as the player enters it (`fieldWeather`), and `GetWeatherAll` returns it in a forest
zone during a run, after a forced weather and before the battle-weather and calendar rules; its battles start in the
room's `weather`. `run.json`'s `field_weather` is the default for rooms without one (none set: the forest's own).

### Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `roguelike3/`)

With two temporary test rooms (deleted before the commit): `zz_pair` (rain; a double battle Kyogre and Groudon started
by two NPCs with before and after dialogue, a single Pikachu battle with a before line, a Potion NPC requiring
`zz_pair/solo`) and `zz_free` (no battles: a Nightmare Ball NPC ×3 with dialogue using `{0100:0}`, a Rare Candy NPC
requiring `run/completed`, a Potion NPC at 1%, a rest NPC, an Oran Berry NPC ×5).

- **The old save:** its Symbol block's forest data was cleared to the progress layout on the first read (magic, version
  1, nothing set); after a save both copies in the file held the new layout.
- **Spawning:** `zz_pair` spawned its three battle NPCs and not the Potion NPC (`zz_pair/solo` unwon); `zz_free` its
  balls, rest and berry NPCs, not the Rare Candy one (no run completed) nor the 1% one; in a run after a completed run,
  the Rare Candy NPC spawned.
- **Weather:** `zz_pair`'s rain on the field (screenshot) and in its battles (the battle's weather icon).
- **Two NPCs, one battle:** Kyogre's NPC showed "We are two." over it, the double battle started, after the win "You
  beat us both!", "The nightmare faded away!", and all three battle NPCs went (the Pikachu battle's too): the won bit
  10 set. In a later run the Pikachu battle won instead took the double battle's NPCs away (bit 11).
- **A free room:** `zz_free`'s exits open at once.
- **Item NPCs:** "A ball for the nightmare, Riku.", then "Riku found Nightmare Ball ×3!", the NPC gone, the run's bag
  holding 3; the berries into the Berries pocket. The rest NPC: the placeholder line.
- **The run's bag:** empty at each run's start; the bag screen showed Items, Medicine and Berries only (the arrows
  cycled those three); Give put an Oran Berry on a copy (5 to 4 in the run's bag) and Take put it back (5); the battle's
  bag showed the Nightmare Ball in its balls pocket. After a win, the back door's Yes and a forfeit-free run end, the
  run's bag was empty and the real bag in the save block **byte for byte** as at the run's start.
- **The Nightmare Ball:** refused on Dialga in the first run (its `after`, `dialga/dialga`, unwon; Dialga's room had a
  catch for the test then), and on the test room's Pikachu (no `catch`); a Poké Ball put in the run's bag refused
  ("Don't be a thief!"). In the next run, after Dialga's battle had been won and the game saved and reloaded, it
  caught Dialga (3 shakes' worth, the Master Ball's path): the party was full, so Dialga went to a Box at level 70
  (Exp. 428,750), in the Dream Ball's look (ball 25); the caught bit set, the room open. In a third run Dialga's
  battle had no catchable enemy (`once`), so the ball was refused.
- **Progress across a save:** after run 1 (runs 1, won 0, 1 and 10) the player went back to their world by the hub's
  Lady and saved with the field menu; the exported save held the same in both copies, and the save booted again
  carried it into the next run.
- **The back door:** No in room 1 (before and after its battle was won) asked and stepped the player back; Yes in room
  3 ended the run at the hub: the real party and bag back, the run's bag empty.
- **The real data** (after the test rooms were removed): a run drew three rooms and Darkrai; the Rayquaza raid was won
  (bit 3).
- The packer's tests (`tools/paperwhite2/test_entralink_run.py`, run with a stand-in for `pytest.raises`), the editor's
  tests (232 pass).

Not tested: a loss in step 3 (it ends the run through the same `EntralinkRun_End` as the back door), a catch into a
party with room (the test party was full), a raid or a double battle's catch, a boss round, real hardware.

### Gaps and decisions for the user

- **No catchable enemy in the real rooms:** Dialga had `catch: { after: ["dialga/dialga"] }` for the test; it was left
  out of the commit because the editor's tests count the real data's catches. Which Nightmares can be caught, and where
  the Nightmare Ball is found (an item NPC with `requires: ["run/completed"]`, as planned), is for the user.
- **Messages:** "Riku found Nightmare Ball ×3!" uses the item's singular name; the rest/buff placeholder; the back door's
  question. All in `global_10490.txt`.
- **The run's bag's hidden pockets** still have their buttons drawn.
- **Dialogue inserts:** only the player's name (`{0100:0}`) is set. Others (the NPC's enemy's species name, say) would
  each need a word set before the message.
- **Archive 228** (the battle bag's pockets) isn't built from `res/items`; the Nightmare Ball is added to the balls
  pocket in code.
- **Memory:** ARM9 main grew about 5 KB (the run's bag 2.5 KB, the old forest's RAM block 2.1 KB, code); the DS arena
  has 58 KB left.

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
