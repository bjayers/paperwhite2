# The Entralink roguelike: the first prototype

Built 2026-11-15 on `entralink-roguelike.md`'s design and survey (sections 1 and 3), to answer "does it work": a run of
four rooms in the Entree Forest, each with a legendary to battle, from a cleared Entralink hub. No buffs, no damage or
HP numbers, no C-Gear screen. Step 2 (same day) added the level-100 team and the forfeit, step 3 the room format, the
run's bag, catching and saved progress, step 4 the run's rounds with repeats, the dialogue's window styles and the
greyed pockets, step 5 the doors' rooms drawn on entering a room, the markers and the rounds' fogs, step 6 the room
types, templates, rest and item rooms and the ground and hidden items, step 7 the enemy choice rooms, Dream Dust,
the shops and the Dowsing MCHN; see "Step 2" to "Step 7" below.

## What a run is

1. **The hub** (`ZONE_ENTRALINK`) has no tutorial and one NPC (the Lady south of the Entree), who
   asks and takes the player back to their own world (`CallEntralinkWarpOut`); since the buffs' phase 7 also the
   Reserve Box NPC beside her, with the PC and the Reserve Box (`entralink-buffs.md`, section 14). Walking off the hub's south walkway
   still asks the same (vanilla's Script_14). The Entree itself opens the records' menu ("The Entree's menu").
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
| `rounds` | 1-3 rounds in order, each `rooms` (how many rooms of role `room` are drawn for it: kept to that round, or to none) and `boss` (rounds 1 and 2: a room of role `boss` ends it, from the bosses kept to that round, else the generic ones; false). The final room follows the last round. Rooms repeat only once every fitting room has come up (step 4, "The draw"); at most 15 rooms with the final |
| `room_maps` | `ZONE_ENTREE_FOREST*` zones of the rooms before the final, taken in turn; each needs a bottom exit, and north, east and west exits for its doors (step 5) |
| `final_map` | The final room's zone |
| `pre_boss_map` | Optional (step 5): the zone of the room played just before a boss or the final room, a clearing with only north and south exits, whose north door leads to it. Left out, those rooms take the room maps with only the north door open |
| `field_weather` | Optional `WEATHER_*` (`include/system/zone_weather.h`): the field weather of the rounds without a `field_weather` of their own; left out, the forest's own |
| `rounds[].field_weather` | Optional (step 5): the round's fog, in its rooms and its boss's; the final room takes the last round's. Left out, the run's `field_weather` |
| `unknown_chance` | Optional (step 5): the percent chance (0-100, 5) that a door to a room of role `room` shows ??? whatever is behind it |
| `marker_spots` | Optional (step 5): `north`, `east` and `west`, each `[x, z]`, the top-left tile of the door's 2 by 2 marker on the clearings' grid (left out: 15, 12; 21, 16; 9, 16) |

The run (step 4): 3 rounds of 3 rooms, rounds 1 and 2 each ending in a boss, then the final room: 12 rooms. The
generic rooms are Dialga, the Rayquaza raid and Prince or Princess (each comes up 3 times a run), the bosses Seaside
Gales (`ho_oh.json`, kept to round 1) and Time and Space (kept to round 2), the final Darkrai. `progress_ids.json` (`progress_ids.schema.json`) holds the next progress ids the editor gives.

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
| `weather` | Optional `BTL_WEATHER_*`: its battles start in it. Since step 5 the field doesn't show it (step 3 showed the matching field weather): the field has its round's fog. Left out, the battles take the field's |
| `marker` | Optional (step 5): what lies in front of any door leading to it, `enemy`, `challenge`, `boss`, `rest`, `gift`, `event`, `shop`, `unknown` (always ???) or `final`; left out, its role's (`enemy`, `boss`, `final`). `catch` is never set: the game shows it instead of `enemy`, `challenge` or `boss` while one of its enemies can be caught and the run's bag holds a Nightmare Ball |
| `battles[]` | Up to 8 of: `id` (lower case, the name NPCs use), `progress_id` (its won-ever bit, below), `format` (exactly: `single` 1 enemy, `double` 2, `triple` 3, `raid` 1 in the center; the packer and the editor refuse other counts, and the game plays a short double or triple as the format its enemies fill), `enemies[]` (1-3: `species`, `form` (0), `level` (70), `moves`, `ability` (`ABILITY_*` or `"hidden"`), `item`, `gender`, `shiny` (false), `catch`, `progress_id`) |
| `npcs[]` | Up to 16 of the NPC record below. If no battle NPC spawns, the room is free: its exits are open at once |

An enemy's `catch` (left out: it can't be caught): `after` (a list of `"<room id>/<battle id>"`, battles that must have
been won at least once, in any run or earlier in this one; empty: from the first encounter) and `once` (true: never
again once caught). With it the enemy needs its own `progress_id` (its caught-ever bit).

An NPC:

| Field | What |
| --- | --- |
| `type` | `battle` (talking starts the battle it names), `item` (gives an item into the run's bag, then goes), `rest` or `buff` (for now their `before` dialogue, or "This nightmare isn't ready for you yet..."; their menus come later), the step 6 and 7 types below, and `ambient` (scenery that fades or runs away as the player comes near; below) |
| `battle` | A battle NPC's battle, by `id`. Several NPCs may start one battle (Kyogre and Groudon side by side for one double battle); several battles, one NPC each, let the player choose: **winning one opens the room and every battle NPC goes**, the other battles too |
| `enemy` | A battle NPC's enemy (0 the first, the default) whose overworld sprite it shows and whose cry it plays |
| `item`, `count` | An item NPC's item (`ITEM_*`) and how many (1); if the run's bag has no room, it says so and stays |
| `sprite` | Optional `OBJ_CODE_*`: its own overworld sprite. Without it a battle NPC shows its enemy's walking Pokémon (`OBJ_CODE_POKEMON_<species>`, a form's `_FORM_<n>` or else its species', `_MALE`/`_FEMALE` where the sexes differ; the packer writes the code, so the hack's new species and forms get theirs), an item NPC the item ball (`OBJ_CODE_110`), rest and buff NPCs the Lady (`OBJ_CODE_LADY`). A Nightmare with no walking sprite needs one (an error in the packer and the editor) |
| `requires` | Optional list: `"<room id>/<battle id>"` (that battle won at least once in any run) and `"run/completed"` (the final room beaten at least once); it spawns only if all hold |
| `chance` | Its chance to spawn, 1-100 percent (100), rolled once as the player enters the room |
| `dialogue` | Optional `before` (on talking; a battle NPC's before its battle) and `after` (a battle NPC's, after its battle is won or its enemy caught, before the room opens): a message in the text files' codes (below); `before_style` and `after_style`, each message's window (below; `talk` if left out) |
| `x`, `z`, `facing` | Its tile (0-31) and `DIR_*` |
| `marker` | Optional (step 5): an icon floating over its head, `npc_markers/<marker>.png` by name |
| `behaviour`, `near`, `return`, `far`, `distance` | An ambient's only (2026-11-20, below): `fade` (the default) or `flee`; the tiles from the player at which it reacts (3); a fading one's `return` (false) and the tiles at which it comes back (6, more than `near`); a fleeing one's run (4 tiles) |

**Dialogue** is written as a line of `res/text/` with real line breaks (or `\n`): `{be01}` waits for a key and
`{be00}` starts a new page after one, as the text files use them, and **`{0100:0}` is the player's name** (the script
sets word 0 to it before every message; no other word is set yet). The build packs every room's NPCs' messages, room by
room in ID order, into the script text bank `entralink_dialogue` (`res/text/script/entralink_dialogue.txt` is one line,
`\from{entralink.dialogue}`; `SCRIPT_TEXT_ENTRALINK_DIALOGUE` in `generated/script_text_banks.txt`), and the header
gives each NPC its messages' numbers. Nothing is kept by hand.

**Window styles** (step 4), each message's own: `talk`, the talk balloon with its tail at the NPC (`ActorMsg`, frame
`TALKMSG_WIN_FRAME_NORMAL`); `bubble`, the tailless balloon across the bottom of the screen (`InfoMsg`, Frost's
"BubbleMessage"); `yell`, the spiky balloon at the NPC, which shakes with a sound as it opens (`ActorMsg` with
`TALKMSG_WIN_FRAME_SPIKY`, as Ghetsis's and the Grunts' shouts); `event`, the system window (`SystemMsg`), for
narration. All four are 30 by 4 tiles with the text at 8, 0, so one width limit serves them all. (`ScreamMsg`, the
legendaries' tailless spiky roars, is a fifth the format could add.)

**Progress ids** are the save's bits (Step 3's progress block): every battle has its own `progress_id` (0-1023) and
every catchable enemy its own (0-511), unique over all rooms within their kind, never changed or reused once given. The
editor gives them on save from `progress_ids.json`'s `next_battle` and `next_catch`; the packer refuses a missing or
duplicated one, or one not below the next.

**No map per room.** The game will pick the clearing by the door taken (the left door leads to a clearing with an
entrance on its right), so a room is placed on the clearings' shared 32 by 32 grid: every clearing has its exits at the
same tiles (x 15-16 z 9, x 15-16 z 24, x 5 and x 26 at z 15-17) and only some of them. The editor draws one clearing
faintly behind the grid, switchable, and checks each NPC against all nine: on an exit of any clearing is an error, on a
tile blocked in any is a warning, as is standing where the player arrives (x 15 z 23).

**Levels are base values:** since phase 5 of the buffs (`entralink-buffs.md` section 12) the run scales the enemies' stats
with its depth across the run (run.json's `enemy_scaling`, each enemy's `scale`; raids take their place's multipliers with their HP times `raid_hp_factor`; bosses and the final room the curve at their round's last room times `boss_bonus`, entralink-buffs.md 15.2); their levels stay as given.

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
- **Rooms:** `EventEntreeForestWarp` with the run's zone instead of `SymbolMap_GetZone` (since step 5 the pre-boss map
  before a boss or the final room); the zone's init script
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
  without repeats; step 4 lets them repeat), entering a room (which NPCs spawn: `requires`, then `chance`; a room with no battle NPC is open at
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
  are still drawn** (touching them does nothing; step 4 greys them).
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
| 0xc8 | 4 | the Reserve Box's slots in use, a bit each (`entralink-buffs.md`, phase 7, section 14) |
| 0xcc | 0x78 | the Reserve Box's Pokémon, a PID per slot (30), searched for in the PC boxes whenever the box is used |
| 0x144 | 4 | the hub shop's Dream Shards, at most 99,999 (`entralink-buffs.md` section 19) |
| 0x148 | 4 | the Dream Shards spent in the hub shop, which its Reset gives back |
| 0x14c | 0x80 | the hub shop's bought picks: 32 entries of a card's key (u16, a hash of its ID; 0 free) and its count (u8) |
| 0x1cc | 0x454 | the records (`EntralinkRecords`, "Records" below) |
| 0x620 | 1 | the hub's fog (`ENTRALINK_HUB_FOG_*`, "The ranks' rewards" below), then 3 unused |
| 0x624 | 0x22c | free, zero (556 bytes, for unlocks later; a mid-run save no longer fits here) |

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
- **The run's bag's hidden pockets** still have their buttons drawn (greyed since step 4).
- **Dialogue inserts:** only the player's name (`{0100:0}`) is set. Others (the NPC's enemy's species name, say) would
  each need a word set before the message.
- **Archive 228** (the battle bag's pockets) isn't built from `res/items`; the Nightmare Ball is added to the balls
  pocket in code.
- **Memory:** ARM9 main grew about 5 KB (the run's bag 2.5 KB, the old forest's RAM block 2.1 KB, code); the DS arena
  has 58 KB left.

## Step 4: the run's rounds, window styles and greyed pockets (2026-11-16)

### The draw

`EntralinkRun_Start` draws each round's rooms, then its boss, then the final room. Every room is drawn from a pool:

- a round's rooms: role `room`, kept to that round or generic (no `rounds`);
- a round's boss: role `boss` kept to that round if any is, else the generic bosses;
- the final: role `final`, any.

From its pool the draw takes, at random, one of the rooms **other than the room just before** that have come up the
**fewest times** in the run so far. So no room comes up twice while one that fits hasn't come up, a room never comes up
twice in a row, and the repeats spread evenly (the least used first). Only when the room just before is the only one
that fits does it come up again (a round with one room). A pool with no room skips that place.

The packer (`tools/paperwhite2/entralink_run.py`, `draw_problems`) and the editor (`model.ts`, `runProblems`) check it
alike: **errors** (the build stops) for no final room, a round asking for rooms with no room in its pool, a boss round
with no boss, a boss on round 3, more than 15 rooms; **warnings** (the build prints them) when a round asks for more
rooms than its pool has, the same room twice in a row (a pool of one), or the run drawing more rooms or bosses than
it has (repeats). The real run warns: "the rounds draw 9 rooms from 3".

### Window styles

`ENTRALINK_RUN_ACTION_SHOW_DIALOGUE` (12) loads the talked-to NPC's message from `entralink_dialogue`, formats it with
the script's words (the player's name) and shows it in its style's window: `CallFieldActorMessageDispStrBuf` (talk,
yell), `loadMsgBox` (bubble, the bottom row) or `PaperWhite2_SystemMsgStrBuf` (event, a `#ifdef PAPERWHITE2` addition
to `src/ov036/scrcmd_msg.c`: `SystemMsg`'s window with any message); the script (`L_RunDialogue`) waits for A and
closes it with `MsgWinCloseAll`, which closes any of the four as its own close command does. The NPC table has
`beforeStyle` and `afterStyle` (`ENTRALINK_STYLE_*`).

In the editor each message box has a **Window** switch (Talk, Bubble, Yell, Event; talk is left out of the file) and
its preview (`text/TextBox.tsx`'s `look`) draws that window: the normal frame with its tail, without, the spiky frame
(`TalkMsgWin_DrawSpikyFrame`'s tiles) with its tail, or the system window (winframe 9, palette 3, font palette 7,
light on dark). The default look of every other preview is unchanged.

### The run's greyed pockets

In a run the bag's pocket buttons of TMs, Key Items and Free Space (the pockets a run's bag doesn't show) are greyed:
`ItemMenuDisp_GreyPocketTab` (`src/ov142/itemmenu_disp.c`) loads a grey copy of the tabs' palette (each colour's
average at 3/4) into the lower screen's OBJ palette 15, which the bag leaves free (zero outside a run), and points the
tab at it; the palette is added to the dimming behind a menu. Outside a run nothing changes.

### Run's editor section

The Entree page's **Run** section (above the rooms, closable with Hide; remembered in the browser): Field weather;
**Rounds** with Add round and Remove last at its top, each round's rooms and (rounds 1-2) "then a boss", and under it
the live summary ("Round 1: 3 rooms, then a boss (1 round-1 boss room) - 3 generic rooms + 0 round-1 rooms can be
drawn"); **Maps** (`room_maps`, `final_map`, read only); and the draw's checks. The list column is 290 pixels wide.

### Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `entree4/`)

- **The draw:** ten runs from one hub savestate, each with a new seed: all ten orders different and all right: rooms
  1-3, 5-7 and 9-11 generic, room 4 Seaside Gales, room 8 Time and Space, room 12 Darkrai, no room twice in a row,
  each generic room 3 times.
- **A full run** (order Prince or Princess, Rayquaza raid, Dialga, **Seaside Gales**, Rayquaza raid, Prince or
  Princess, Dialga, **Time and Space**, Prince or Princess, Dialga, Rayquaza raid, **Darkrai**): rooms in
  `entree_forest` and `entree_forest_6` in turn, Darkrai in `entree_forest_2`. The nine generic rooms' battles and
  Darkrai's were won, each opening the room, the top exit leading to the next; the two boss rooms showed their NPCs
  (Ho-Oh and Lugia; Dialga, Giratina-Origin and Palkia) and were opened by their state, since the test's way of
  winning (the foes at 1 HP) doesn't find a double or triple battle's Pokémon (the boss battles themselves are step 3's
  code). After Darkrai: the hub, the run over, runs completed 1, battles won 0, 1, 3 and 5.
- **The styles:** Prince or Princess's Gardevoir NPC's before message in each style (its `beforeStyle` poked in the
  table): talk (the balloon over it, tail down), bubble (the bottom balloon), yell (the spiky balloon, shaking), event
  (the dark system window); after A each closed and the battle started.
- **The bag:** in a run, the TMs, Key Items and Free Space buttons grey; at the hub (no run) all as before, palette 15
  empty.
- Packer tests (13), the editor's tests (all pass), `verify_dsi_rom.py`.

Not tested: a style on an after message or an item NPC's (the same subroutine), the greyed tabs behind the bag's item
menu (the run's bag was empty), real hardware.

## Money (2026-11-17)

A run's loss no longer costs money: `CalcLossMoney` (`btl_main.c`) leaves the loss at 0 for a battle with
`ENTRALINK_RUN_BTL_SETUP_FLAG`, so the wild loss's "dropped $X in panic" (and a trainer battle's "paid out") is never
shown and the setup's money change (`unkA4`, which `event_battle_return.c` adds or takes) is 0. A forfeit
(`BTL_RESULT_FLEE`) never reached the loss money. A win keeps the original's: a wild battle has no prize money, so only
Pay Day's (or a Pass Power's) bonus could add any, which is left as it is. Nothing else of the game outside the run
changes on a loss or a win: the copies take the friendship, Exp. and Pickup items and are thrown away, the real party
and bag are untouched; the Pokédex's seen entries and the battle records count as in any battle.

Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `tints/`): the money set to 50000, the
copies made to faint in room 1's battle: "out of usable Pokémon", "blacked out", no money message, the hub, money still
50000. The same battle with the run's flag cleared as it was created (a plain wild battle): "Riku dropped $3600 in
panic...", money 46400, as the original.

## Step 5: doors drawn on entry, markers, round fogs (2026-11-17)

### The doors

A run is still its places in order (each round's rooms, its boss, then the final), but a place's room is no longer
drawn at the start: **entering a room draws the rooms behind its forward doors** (north, east, west; south is the back
door) for the next place, and **the door taken decides the next room** (`EntralinkRun_EnterRoom`, `_DrawDoors`; the
state's `doorRooms`). Only the first room is drawn at the start. Each door's room comes from the place's pool by step
4's rules (the least used so far, never the room just played), and the doors get different rooms while the pool has
enough; then a room behind another door again, and the room just played only if it is the only one that fits. The real
run's rounds have three generic rooms, one just played, so two doors differ and the third repeats one of them.

**Before a boss or the final room** the current room is in `pre_boss_map` (run.json's: `ZONE_ENTREE_FOREST_5` until
the new two-exit zone replaces it) and only its north door has a room behind it, the boss or the final room; east and
west say "A nightmare blocks the way." The other rooms use `room_maps` in turn, which have all four exits. A boss room's
doors lead to the next round's rooms. The script's exits pass their own exit (`ENTRALINK_RUN_NORTH_EXIT`, `_WEST_EXIT`,
`_EAST_EXIT`) to `ENTRALINK_RUN_ACTION_CAN_LEAVE`, which blocks a door with no room behind it, and
`MapChangeEntreeForest`'s direction now reaches `EntralinkRun_CreateExitEvent`.

### When a room is done

The exits open and the markers show at the same moment: a battle room once its battle is won (the script's
`ENTRALINK_RUN_ACTION_CLEAR_ROOM`, after the after message; `EntralinkRun_FinishBattle` no longer opens it); a room
with no battle once every NPC that came up in it is used (an item NPC's item taken, a rest or buff NPC talked to: the
new `ENTRALINK_RUN_ACTION_NPC_USED`, 13, at the end of Script_9's rest/buff path; the state's `npcsUsed`); a room where
nothing came up at once. An item NPC that can't give its item (the bag full) isn't used, so a gift room stays shut until
its item is taken.

### The markers

- **What a door shows** (`EntralinkRun_GetDoorMarker`): the room's `marker`; `catch` instead of enemy, challenge or
  boss when an enemy of the room can be caught now (`EntralinkRun_CanCatch`: its `after` battles won, not spent if
  `once`) and the run's bag holds a Nightmare Ball (looked at every 16 frames, so it follows the bag); ??? for a door
  whose unknown roll came up (`unknown_chance`, rolled per door of role `room` as the room is entered, never for a boss
  or the final). Nothing until the room is done, and nothing in front of a door with no room behind it.
- **How they are drawn** (`src/paperwhite2/ov036/paperwhite2_entralink_markers.c`, `include/paperwhite2/entralink_markers.h`):
  a billboard system of their own (`BillboardActorSys`, 12 materials, 19 actors), made in the field's heap the first
  time a run's room needs it and freed with the field's billboards (`FieldG3D_Free`), drawn in the field's effects
  pass (after the shadows, with the objects' depth offset) and updated from the field's update (`fieldmap.c`, three
  `#ifdef PAPERWHITE2` hooks). Its scene has the field effects' scale (8) and polygon IDs. A ground marker is a quad
  lying on the ground (`BILLBOARD_ACTOR_TYPE_FACE_CAMERA_Y_FLAT`, as the footprints and the actors' shadows lie), 2 by
  2 tiles, at the ground's height (`FieldG3DMapper_GetTerrainAll`); an NPC's marker is a quad facing the camera over
  the NPC's sprite (its billboard size, 16, 32 or 64, plus 10 units), following the actor, gone when the NPC goes. Both
  unlit (the art's own colours), and in the fog like the map. Chosen over the field effects' own billboard system
  (which the footprints, grass and shadows share, 58 materials, and whose material loader writes outside its table
  when full) and over the follower emotes' private scenes (one quad each, drawn by hand): a system of their own keeps
  the effects' materials and needs no draw code. The textures are loaded as the room is entered (what the doors show
  then, and the NPCs' markers), while the screen fades in, so none is sent to VRAM in the middle of play, except a
  catch marker that comes later.
- **The art:** `res/paperwhite2/entralink/markers/<type>.png` (32 by 32, the ten types) and
  `npc_markers/<name>.png` (16 by 16, any number), indexed PNGs of up to 16 colours, index 0 clear. The packer
  (`entralink_run.py`, `marker_members`) makes each a BTX0 of one GX_TEXFMT_PLTT16 texture and its palette;
  `field_actor_data.py` puts them in the model table (a/0/4/7) from member 24, after the Following Pokémon's, the ground
  markers in `ENTRALINK_MARKER_*` order, then the NPC markers by name; the header gives the members' numbers
  (`ENTRALINK_RUN_MARKER_FILE`, `ENTRALINK_RUN_NPC_MARKER_FILE`, `ENTRALINK_NPC_MARKER_<NAME>`). The ten and four (rest,
  buff, item, shop) in the commit are placeholders: a disc of a colour with a letter (E, !, B, R, G, *, $, ?, D, C).
  A new NPC marker needs `python3 configure.py w2_us --hack` again.
- **Orientation (2026-11-18):** the ground markers were drawn upside down: the game's flat billboards
  (`BILLBOARD_ACTOR_TYPE_FACE_CAMERA_Y_FLAT`, `billboard.c`) put the texture's top edge on the quad's south side, a
  vertical flip only (checked in py-desmume with an "F" with a red top-left corner, from the south: the F's bar at the
  bottom, the corner at the bottom left). The packer now reverses a ground marker's rows (`marker_texture(flat=True)`),
  so the PNG reads as the player sees it, its top toward the north; the original code, which the footprints and shadows
  share, is untouched. The NPC markers (camera-facing quads) were upright and are unchanged.
- **Editor (2026-11-18):** every marker's PNG is on Graphics & Palettes' Sprite sheets page (the ten room markers
  and each NPC marker, listed by `tools/paperwhite2/entralink_marker_art.py list`, so a new `npc_markers/` PNG shows
  without an edit): see it, Download/Import PNG (indexed, or RGB(A) of at most 15 colors; 32 by 32 or 16 by 16; index
  past 15 refused, no clear pixel warned) and edit the 16-color palette, then Apply.
- **Memory:** about 2.3 KB more code and data in overlays 12 and 36 (the DS arena 54 KB left, from 56); at run time
  about 2.5 KB of the field heap for the system (its scene's 12 materials and 19 actors, handles and allocators) and
  about 150 bytes per texture kept after trimming, at most 12; VRAM 544 bytes per ground marker's texture and palette,
  160 per NPC marker's. Nothing outside a run.

### The rounds' fogs and the rooms' weather

Each round has its own field weather (run.json `rounds[].field_weather`): round 1 the pink fog (`WEATHER_CUSTOM_TINT_9`),
round 2 the dark purple fog (`_8`), round 3 and the final room the black fog (`_7`), tints.json's "Pink fog", "Dark
purple fog" and "Black fog". The packer resolves a round without one to the run's `field_weather`, and
`EntralinkRun_EnterRoom` sets the round's as the room's field weather. A room's `weather` is now its battles' only
(`EntralinkRoom`'s `fieldWeather` became `marker`; `EntralinkRound` has `fieldWeather`). After a battle the fog stays:
the run's weather comes before the battle's weather that `GetWeatherAll` keeps for a while.

### The editor

- **Room:** a Marker picker of the nine types' icons, the role's marked as the default (left out of the file); the
  Weather row says it is the battles'.
- **NPC:** a Marker picker (None, or the icons of `npc_markers/`).
- **Run:** a Fog per round (the tints shown by name, "Custom tint 9: Pink fog"), Unknown doors (`unknown_chance`), the
  pre-boss map read only, and the Marker spots (x, z per door).
- **The grid** draws the three spots as 2 by 2 areas ("north marker: keep clear"); the checks warn when an NPC stands
  on one, and give an error for an NPC marker with no art.

### Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `markers/`)

With temporary test data (not committed): Dialga catchable from the first encounter and in rain, the raid catchable
only after Time and Space's battle (never won in the save), Prince or Princess marked `unknown`, and `zz_gift`, a
round-1 room with no battle: a Nightmare Ball ×2 item NPC (NPC marker `item`) and a rest NPC (`rest`).

- **Doors on entry:** three runs: room 1 Rayquaza raid, doors Dialga / Prince or Princess / Dialga; room 1 Prince or
  Princess, doors Dialga / raid / raid; then room 2 (through the east door) the raid, as drawn, with doors Dialga /
  Prince or Princess / Dialga. The pool of two (the room just played excluded) gives two different rooms.
- **Hidden until done, the real flow:** in room 1 (Prince or Princess) no markers and the north exit blocked; the
  Gardevoir battle won, the after message and "The nightmare faded away!": three enemy markers at the spots (shot
  `m3_cleared.png`); the east door led to the raid, the room drawn behind it.
- **A gift room:** nothing on the ground on entering, the NPC markers + and R floating over the ball and the Lady
  (`m4_npc_markers.png`); after the item was taken still shut (the rest NPC unused); after talking to the rest NPC the
  room done and the markers shown.
- **Types:** doors set to Dialga, the raid and Prince or Princess with a Nightmare Ball in the run's bag: catch, enemy
  (its condition unmet), unknown (`m4_types_ball.png`); the ball taken out of the bag: enemy, enemy, unknown.
- **The pre-boss room:** place 3 in `ZONE_ENTREE_FOREST_5` (the run.json stand-in) with Ho-Oh behind the north door
  and nothing behind east and west; Dialga's battle in rain ("It started to rain!", `m4_dialga_battle.png`) while the
  field kept the pink fog before and after; done, one boss marker (`m4_preboss_done.png`); the east exit blocked; north
  to Seaside Gales in `entree_forest_6`.
- **The fogs:** places 1-4 pink (`WEATHER_CUSTOM_TINT_9`), place 5 dark purple (`_8`, `m4_fog_round2.png`), place 10
  black (`_7`, `m4_fog_round3.png`; the run's place poked).
- **unknown_chance 100** (a scratch copy): every door of room 1 ???; the room before the final (place 11, poked) in the
  pre-boss map with Darkrai's marker behind the north door and no unknown roll.
- **The editor:** the Run section with the fogs and spots, the room's and an NPC's marker pickers, the spots on the
  grid (screenshots `ed2-run-spots.png`, `ed3-room-npc.png`, `ed4-npc-marker.png`); its tests (234) and the packer's
  (14, three new: the markers, an NPC marker's art, the members) pass.

Not tested: real hardware (the markers' first upload while playing, a catch marker appearing after a ball is picked
up), a run through the real two-exit pre-boss zone (another branch makes it), a full run with every room's battle
fought (the places past 5 were reached by poking the run's place).

## The pre-boss map (2026-11-17)

`ZONE_ENTREE_FOREST_10` (zone 276, 0x114) is a tenth clearing for the room before a boss: north and south exits only.
It was the unused `ZONE_NS_CASTLE_GATE_10` (the unused zone nearest the forest's 280-288), made with
`tools/paperwhite2/new_map.py create` from `entree_forest_5`'s chunk with its props (`MAP_MODEL_ENTREE_FOREST_10_00_00`,
`MAP_MATRIX_ENTREE_FOREST_10`). Its header is `entree_forest_5`'s field for field but the matrix, scripts and text:
parent `ZONE_ENTRALINK`, `AREA_ENTREE_FOREST`, `SEQ_BGM_PALACE`, camera 35, battle background 6, place name shown,
transition 0, cycling. Its events are `entree_forest_5`'s without the east exit: the north trigger (15-16, 9, Script_5,
10494), the south one (15-16, 24, the back door, Script_6, 10495) and the init script 10492; its zone and init scripts
are `entree_forest_5`'s too. The chunk still has the east opening (26, 15-17) until the user closes it in the Map
Editor; walking into it does nothing.

**A forest zone everywhere:** every check of "in the forest" goes through `GetZoneIsEntreeForest` (`zonedata.c`: the
blank C-Gear, the actors' offsets and shadows, the beacons, the run's own checks in `paperwhite2_entralink_run.c` and
`paperwhite2_entralink_run_state.c`), so that function also takes `ZONE_ENTREE_FOREST_10` (`#ifdef PAPERWHITE2`). The
forest's grid (`SymbolMap_GetZone`) is outside the run and leaves the zone out. A later clearing is one more comparison
there. The run takes it as a room map with no code change: `run.json`'s `room_maps` or `final_map` naming it is enough
(the packer turns the constant into its number; the schema's `x-constant` takes any `ZONE_ENTREE_FOREST*`).

Tested (py-desmume, the user's save copy, a scratch build whose `run.json` put room 1 in it, scripts in the session's
scratchpad `forest10/`): room 1 loads in zone 276 looking like `entree_forest_5`, the lower screen blank; the south
exit asks "Return to the Entralink?", No steps back; the north exit before the win says "A nightmare blocks the way."
and steps back; at the east opening (26, 16) nothing happens; the room opened, the north exit leads to room 2
(`entree_forest_6`, zone 285).

## Step 6: room types, templates, rest and item rooms, ground and hidden items (2026-11-18)

Decided with the user the same day (the session's spec `roomtypes_spec.md`, sections 1-6). The editor's side (the
room's Type, the Templates group, the Items tab, the run's new settings, the flower tiles) is in its own entry of
STATUS.md.

### The data

`room.schema.json` gains `type`; the NPC record new types. `run.schema.json` gains:

| Field | What |
| --- | --- |
| `rounds[].type_weights` | Optional `{ enemy, challenge, item, buff, rest, event, shop }`, each 0-255: the weights a forward door of the round draws a room type by; a type left out takes its default (50, 12, 10, 10, 10, 5, 3) |
| `custom_chance` | Optional (25): the percent chance that a rest, item, buff or shop door leads to a premade room of the type (rooms/, if one fits) rather than its template |
| `ground_item_chance` | Optional (30): the percent chance of a ball on the ground in a room with no hand-placed `item` or `item_choice` NPC |
| `hidden_item_chance` | Optional (20): the percent chance of a hidden item on one of the clearing's flower tiles |

A room's `type`:

| Field | What |
| --- | --- |
| `type` | Optional, role `room` only: `enemy` (the default), `challenge`, `rest`, `item`, `buff`, `shop`, `event`. Its door marker by default: enemy, challenge, rest, gift (item and buff), shop, event; an explicit `marker` still wins. Boss and final rooms ignore it |

The new NPC types:

| Type | What |
| --- | --- |
| `heal` | Heals every Pokémon that hasn't fainted (HP, status, PP; `PokeParty_Recover` on each, eggs and HP 0 skipped), with the Pokémon Center's jingle |
| `revive` | With no fainted Pokémon: "None of your Pokémon has fainted. No one needs reviving." Else the party screen (`CallPokeSelect`); a Pokémon that hasn't fainted: "That Pokémon hasn't fainted." and the party screen again; a fainted one revived to full HP, its status cleared (PP untouched). B leaves the choice open |
| `gift` | A list (`ListMenuAnchorTopLeft`) of 3 cards drawn as the room is entered: since the buffs' phase 2 each a buff of the gift pool at buffs.json's `gift_buff_chance`, else an item from the item table's `gift` pool; an item taken goes into the run's bag ("Riku received ..."), a buff to the run's buffs (`entralink-buffs.md`, section 9). B leaves the choice open |
| `shop` | A placeholder: its dialogue or "The shop isn't open yet..." (step 7). Talking counts as used (a shop room is then done), but it isn't the room's choice |
| `item_choice` | An item ball (`OBJ_CODE_110`) whose item is drawn from the `item_room` pool as the room is entered, the room's balls each another item; its bag icon floats over it. "It's X! Will you take it?" Yes puts it in the run's bag |
| `buff_choice` | Since the buffs' phase 2: its dialogue, then the room's offer of buffs (drawn on entry, the `buff_room` pool), one taken the room's choice (`entralink-buffs.md`, section 9); the template has one ball. Its sprite is the item ball with the `buff` NPC marker (no palette swap: the ball's palette comes from the archive per sprite, and a tinted copy needs a new sprite) |
| `rest`, `buff` | Unchanged (their dialogue or the placeholder line) |
| `swap` | Since the buffs' phase 7 (`entralink-buffs.md`, section 14): for `run.json`'s `swap_dust` in Dream Dust, a Pokémon of the hub's Reserve Box joins the team as a level 100 copy made like the run's first ones, in place of a copy that hasn't fainted, which leaves the run; a choice NPC, in the `rest` and `pre_boss_rest` templates |

**The choice:** using one heal, revive, gift, item_choice or buff_choice NPC (`ENTRALINK_RUN_ACTION_MAKE_CHOICE`) makes
the room's choice: every other NPC of those types and the shops go, and the room is done (markers, exits). A used NPC
that stays (heal, revive, gift) says "Go on. The nightmare awaits." A room with such an NPC isn't done by its battles
(bonus battles stay optional and can be fought after); a room with neither battles nor choice NPCs is done once every
NPC is used, as before.

**Templates** (`templates/<name>.json`, the room format, role `room`, type their file's): `rest` (heal, revive, gift),
`item` (three item_choice balls), `buff` (one buff_choice ball since the buffs' phase 2), `shop` (one shop), `pre_boss_rest` (heal, revive,
gift, shop) and an optional `event`. Placeholders at x 11-20, z 14, facing down, markers rest/item/shop/buff. They come
after the rooms in the header's room table (`isTemplate`, never in a pool), `ENTRALINK_TEMPLATE_*`; their NPCs'
dialogue goes into `entralink_dialogue` after the rooms'. Their battles (none yet) get progress ids but aren't keys of
`requires` or `catch.after`. A missing template is an error when the run draws its type (a weight above 0 in some
round; `pre_boss_rest` always), else a warning (`template_problems`).

**The item table** (`items.json`, `items.schema.json`): `{ "items": [ { item, weight 1-255, rounds?, price?, pools } ] }`
(an object, not a bare list, so it carries `$schema`). The starting table: Potion, Super/Hyper Potion, Full Restore,
Revive, Max Revive, Ether, Elixir, Full Heal, the five status berries, Lum and Sitrus, X Attack/Defend/Speed/
Special/Sp. Def and the Nightmare Ball, with placeholder weights, rounds and prices.

| Pool | Drawn for |
| --- | --- |
| `item_room` | an item room's balls; their icons are packed |
| `gift` | a gift NPC's 3 |
| `shop` | step 7 |
| `ground` | the ball on the ground and the hidden item |

An entry fits a draw when it has the pool and the round (the place's: a pre-boss rest's is its round's, the final
room's the last), and the Nightmare Ball only while something can be caught: an enemy whose catch holds now
(`EntralinkRun_CanCatch`: its `after`, not spent if `once`) in a room that can still come up (role room or boss kept to
this round or a later one, or generic, or a final room). Draws within one choice differ.

**Flower tiles** (`flower_tiles.json`, `flower_tiles.schema.json`: `{ "ZONE_ENTREE_FOREST_n": [[x, z], ...] }`, keys by
`patternProperties`, which `tools/data/datajson.py` now validates): generated by `tools/paperwhite2/entralink_flowers.py`
from each clearing's map model: a tile is a flower tile when the faces textured `out25_hana01`-`03` or `out37_hana01`
(the Entree Forest's "hana", flower, textures) cover at least 0.2 of it (`map_reader.Chunk`'s clipped pieces). The
forest's flowers are small patches of two triangles, each over 2 by 2 tiles; the list has 15-44 tiles a clearing,
none in `entree_forest_9` (no flower texture). Rewriting keeps a list's tiles in their order and appends what the model
adds; clearings in their numbers' order, an empty one left out, in the data files' layout (as the editor writes it).
`--check` says which lists differ from the models, `--show ZONE` draws one.

### The draw

- **Places:** a round's rooms, then, before its boss and before the final room, the **pre-boss rest**
  (`ENTRALINK_ROLE_PRE_BOSS`, the `pre_boss_rest` template). The real run: 3 + rest + boss, 3 + rest + boss, 3 + rest +
  final = 15 (`ENTRALINK_RUN_ROOMS_MAX` now 20). The last room of a round and the pre-boss rest are in `pre_boss_map`
  (as before: the next place isn't a round's room); the last room's north door shows the rest marker.
- **A forward door to a round's room** (`EntralinkRun_DrawTypedRoom`): a type by the round's weights, with rest out after
  a rest room and rest and shop out just before the pre-boss rest; then enemy and challenge from rooms/ (step 4's
  least-used rules), event from rooms/ or its template, rest/item/buff/shop from rooms/ at `custom_chance` else the
  template. A type that gives no room has its weight zeroed and the type is drawn again; all zero, the door is shut.
  The unknown roll is unchanged.
- **The first room** (no door) is an enemy room (any room of the round if there is none).
- **Room types in the packer and editor alike** (`draw_problems` with the templates, `runProblems`): an error when a
  round's weights add up to 0 or no weighted type has a room or template; a warning for each round's weighted types
  with none (the real data: challenge and event, which the game skips); the repeat warnings count only enemy,
  challenge and event rooms.

### Items in a room

On entry (`EntralinkRun_DrawRoomItems`): the item room balls' items, the gift's 3, then the ball on the ground (no
hand-placed item NPC, `ground_item_chance`, the `ground` pool) on a random tile that the clearing's collision lets the
player walk on (`terrain_0.csv`, packed as a 32-bit row per z, `EntralinkClearing.blocked`), not an exit, not under a
door's marker, not an NPC's that came up, not within one tile of the arrival (15, 23); and the hidden item
(`hidden_item_chance`, the `ground` pool) on a random flower tile of the clearing (`EntralinkClearing`'s flower tiles)
with no NPC or ball on it. The ball is an actor with ID 16 (after the room's 16 NPCs), the item ball, talked to through
script 10498 (`ENTRALINK_RUN_NPC_GROUND`, 100 since the buffs' phase 7). The hidden item has no event: `FieldEventProvider_Grid_CheckForEvent`
(`src/ov036/fieldmap_event.c`, `#ifdef PAPERWHITE2`) asks `EntralinkRun_CheckHiddenItem` after the bg events, with the
tile in front of the player, and starts script 10499 (`global_10490.s` Script_10): "Riku found X!" into the run's bag.
**No Dowsing MCHN:** it is a key item, which the run's bag doesn't hold, so it can't be used in a run (step 7 lets the
run's bag hold it).

### The level-100 copies' items

`EntralinkRun_KeepParty` clears every copy's held item except one that decides its form, as the form-by-item code
reads it: Arceus's plates (`PaperWhite2_GetArceusPlateForm` not 0), Genesect's Drives (`PML_ItemGetGenesectDriveForme`
not 0), Giratina's Griseous Orb. The real party keeps its items.

### The bag icons

`marker_members` appends, after the NPC markers, a BTX0 per item of the `item_room` pool (in the table's order): the
item's bag icon (`res/items/<icon>/icon.png`) with the palette the bag shows it with, both from `pml_item.c`'s
`ITEM_GRAPHICS_CHARS_AND_PALETTES` (the Super Potion is the Potion's icon in its own palette), 32 by 32
GX_TEXFMT_PLTT16, index 0 clear: `ENTRALINK_RUN_ITEM_ICON_FILE`. An item_choice NPC's marker is
`ENTRALINK_NPC_MARKER_ICON | icon`; the markers' system draws it as a 2 by 2 tiles camera-facing quad over the ball (its
bottom just over the ball). a/0/4/7 rebuilds when `items.json`, `pml_item.c` or `res/items` change.

**Memory:** VRAM 544 bytes per icon (512 of texels, 32 of palette), 3 in an item room (1.6 KB); the field heap
about 150 bytes per icon kept after trimming, and the markers' system has 16 materials (from 12: about 32 bytes more).
Code: overlay 12 +4.3 KB (7.0 KB of text, 2.0 KB of tables now), overlay 36 +0.1 KB, ARM9 main +0.2 KB (the state's
items, 52 bytes). The DS arena: 46 KB left (from 50).

### Script and text

`global_10490.s` Script_9's new branches (`L_RunHealNpc`, `L_RunReviveNpc`, `L_RunGiftNpc`, `L_RunShopNpc`,
`L_RunItemChoice`, `L_RunBuffChoice`, `L_RunChoiceDone`, `L_RunGiveItem` for the ball on the ground) and Script_10;
twelve lines at the end of `global_10490.txt` (`RunHealed` ... `RunChoiceDone`); actions 14-21
(`entralink_run_actions.h`).

### Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `roomtypes/`)

- **Door types:** 16 runs from the hub with the RNG seeded differently: 48 doors, 25 enemy rooms, 8 rest, 7 item,
  6 buff, 2 shop (challenge and event skipped: no rooms). Each type forced by poking the rounds' weights in RAM: rest,
  item, buff and shop gave all three doors their template; challenge or event against enemy 5:1 gave enemy rooms only.
  After a rest room (rest and enemy 1:1): no rest door. Entering place 2 (rest, shop and enemy 1:1:1): enemy doors only.
- **Rest (template):** heal: slot 0 (1 HP, poisoned, PP 0) to full, its status and PP restored; slot 1 (fainted) still
  0 HP; revive and gift gone, the room done (shot `heal_done.png`). Revive with none fainted: the line, the choice
  open; with slot 1 fainted, slot 0 chosen first: "That Pokémon hasn't fainted.", then slot 1: "Klink was revived!"
  (0 to 375 HP, poison cleared; `rv6.png`). Gift: Super Potion, Pecha Berry, Aspear Berry in the list (`gift_list.png`);
  the second into the run's Berries; heal and revive gone, done.
- **Item room:** three different items (Sitrus Berry, Super Potion, Hyper Potion) with their bag icons over the balls
  (`item_icons.png`); "It's Super Potion! Will you take it?" Yes: into Medicine, the two other balls and icons gone, done.
- **Buff room:** the three balls with the buff marker (`buff_room.png`); one talked to: the line, the others gone, done.
- **Pre-boss:** place 2 to place 3 (in `ZONE_ENTREE_FOREST_10`), its north door to the pre-boss rest, the others shut
  (the rest marker, `place3_door_rest_marker.png`); the pre-boss rest in zone 276 with heal, revive, gift and shop
  (`preboss_rest.png`); the shop: "The shop isn't open yet..." (used, not the choice); heal: the others gone, done; north
  to Ho-Oh's room (Seaside Gales, zone 280).
- **Ground and hidden items** (a scratch build with both chances 100): room 1's ball at (9, 10) (`ground_ball.png`)
  taken by talking (a Pecha Berry into the run's bag, the ball gone); the hidden Nightmare Ball at (9, 21), a flower
  tile, found with A from (9, 22) ("Riku found Nightmare Ball!"), A again found nothing.
- **The Nightmare Ball** at weight 255 in every pool (scratch builds): with the real data (Time and Space catchable,
  round 2) drawn 12 times in 60 draws of round 1; with no catchable enemy anywhere, 0 in 60.
- **The copies:** the real party given Leftovers, a Flame Plate on an Arceus (poked) and a Griseous Orb on a
  non-Giratina: the copies held only the Flame Plate; the real party kept all three.
- The packer's tests (21, seven new), the editor's (after merging its branch), `verify_dsi_rom.py`.

Not tested: real hardware; a premade rest/item/buff/shop room at `custom_chance` (no such room yet); a bonus battle in a
choice room; the gift with a full bag; an event template.

## Step 7: playtest fixes, enemy choice rooms, Dream Dust and shops (2026-11-18)

Decided with the user the same day (the session's spec `dust_spec.md`, sections A-E). The editor's side is in this
section too (the Entree page: the room type, the Run section's Dream Dust, the Items tab's price unit).

### Fixes and small changes

- **The doors before the pre-boss rest** (the doors of a round's second-to-last room, which lead to its last) draw any
  type but rest and shop. The game did so since step 6 (`EntralinkRun_DrawTypedRoom`'s `beforeRest`): retested, 12
  draws of place 3's doors with the default weights gave 23 enemy rooms, 9 buff and 4 item rooms (challenge and event
  have no room yet); every type weighted 1 gave none of rest or shop in 24 doors.
- **The item room's icons:** a bag icon's picture is in the top-left 24 by 24 of its 32 by 32, so it sat about 5 pixels
  left of the ball's middle and 15 above it. The packer moves the picture right 4 (centring the 24 in the 32; 8 would
  overshoot by 4) and down 8 (`ICON_SHIFT`, `shift_picture`), in the icons' textures only; the icons' place in the world
  is unchanged. Shots `item_before_zoom.png`, `item_zoom.png`.
- **The NPC markers** stood straight up from the NPC's feet (world y), but the NPC's sprite, a quad facing the camera,
  stands along the camera's up, which leans back from the camera as far as it looks down: so the marker was in front of
  the head, lower on the screen, bigger and a little to the left (it also left out the sprite's draw offsets). They now
  go from where the sprite is drawn (`CopyActorPosAllAdd` and the field's actor y offset) along the camera's up
  (`Markers_GetCameraUp`: the camera's up vector less its part along the view), 2 units over the sprite's top
  (`NPC_MARKER_GAP`, from 10). The item icons keep their place. Shots `rest_before_zoom.png`, `rest_zoom.png`.
- **NPC marker art (placeholders):** `npc_markers/challenge.png` (an orange disc, !), `heal.png` (pink, H) and
  `revive.png` (purple, V); the rest and pre-boss rest templates' heal and revive NPCs take them (they had the old
  generic `rest`; their sprites, the user's, are kept). A new NPC of those types gets them in the editor
  (`NPC_DEFAULT_MARKERS`). Graphics & Palettes lists them with no change (`entralink_marker_art.py list`).
- **Triple battles can't stall:** in Time and Space (Dialga, Giratina, Palkia) with the run's party down to its first
  (alone on the left) and Giratina and Palkia poked to 0 HP at the first command, Dialga alone in the foe's first slot,
  the opposite corner: the turn's end showed "AUTO CENTER" and moved both to the middle
  (`ServerControl_TripleBattleShiftToCenter`, which counts the living by HP and compares their slots), and Oinkums'
  Arm Thrust then hit Dialga ("It's super effective! Hit 4 times!"); the battle was won. The raid with one Pokémon
  (Rayquaza alone in the middle, which reaches every slot) was won by attacking. The run's fainted-in-place hook
  (`PokeCon_CreateClientParty`) only orders the foe's party as the battle starts, so it doesn't touch the shift: nothing
  to fix. Shot `triple_center.png`.

### Enemy choice rooms

| Where | What |
| --- | --- |
| `room.schema.json` `type` | `enemy_choice` (`ENTRALINK_TYPE_ENEMY_CHOICE`, 7): an enemy room with several battles to choose from, one NPC each; it plays as any battle room (winning one opens the room, the others go) |
| `room.schema.json` `marker` | `enemy_choice` (`ENTRALINK_MARKER_ENEMY_CHOICE`, 10, after catch so the other markers keep their members): `markers/enemy_choice.png`, a placeholder (a magenta disc, EE); the default of an enemy_choice room; catch replaces it as it does enemy's |
| `run.schema.json` `type_weights` | `enemy_choice`, default 8 (enemy's default 50 -> 42) |
| The packer, the editor | Warnings: an enemy_choice room with fewer than 2 battles, an enemy room with more than 1 (`room_problems`, `checkRoom`); the types' lists, weights table, filters and pickers include it |

Prince or Princess (two battles, an enemy room) is warned now: whether it becomes an enemy_choice room is the user's
call (it would come up at enemy_choice's weight, 8, instead of enemy's, 42).

### Dream Dust

| run.json | What |
| --- | --- |
| `dust` | Optional `{ enemy, enemy_choice, challenge, boss, final }`, each 0-9999 (40, 50, 80, 150, 0): what a battle won gives by its room (a boss's, the final room's, else its type's; a battle in a room of another type, a bonus battle in a rest room, an enemy room's) |
| `dust_round_percent` | Optional, 1-3 entries of 0-1000 (100, 150, 200): the percent of it in rounds 1, 2, 3 (a boss's and pre-boss rest's round is its round's, the final room's the last); a round left out takes the last given |
| `shop_items` | Optional 1-8 (5): how many different items a shop sells |

- **Earned:** `EntralinkRun_FinishBattle` on a win or a capture adds `EntralinkRun_GetBattleDust` (the kind's times the
  round's percent / 100) to the state's `dust` (at most 65535) and keeps it in `dustGained`. The script
  (`L_RunDust`, after the battle and before the NPC's after message, on a cleared room and after the final room) asks
  `ENTRALINK_RUN_ACTION_GET_DUST` (22: arg 0 the gain, 1 the total) and shows "You gathered N Dream Dust!\n(total M)"
  (`Global10490_Text_RunGatheredDust`) when the gain isn't 0 (the final's default 0 shows nothing).
- **Kept** in `EntralinkRunState` (RAM, `dust`, `dustGained`), so it is 0 at a run's start and gone at its end (the
  state is cleared both times). No carry-over, no conversion. Shown in the shop; the C-Gear display comes later.

### Shops

- **The screen:** the game's own Poké Mart screen (`src/ov036/scrcmd_shop.c`), which already sells for money, BP or a
  tutor's shards: a fourth currency, `SHOP_CURRENCY_DREAM_DUST`, under `#ifdef PAPERWHITE2`. The script command
  `CallFriendlyShopBuy ENTRALINK_RUN_SHOP_ID, var` (0xfc, a shop ID no Mart uses; `entralink_run_actions.h`) lists the
  room's goods (`ShopUI_LoadEntralinkRunItems`), titles the balance "Dream Dust" and shows it ("140 Dust"), prices
  "60 Dust", asks "Ether, and you want 1. That will be 60 Dream Dust. OK?", refuses with "You don't have enough Dream
  Dust.", takes the Dust from the run's state (no money, no records, no beacon: the run touches nothing outside it) and
  puts the item in the game's bag, which is the run's. Buy only (the command is the Mart's buy screen). Six lines at the
  end of `res/text/script/scrcmd_shop.txt` (`ScrcmdShop_Text_DreamDust` ... `_WantWillDustOk`).
- **The stock** is drawn as the room is entered when a shop NPC came up (`EntralinkRun_DrawShop`): `shop_items`
  different items of the item table's `shop` pool by the draw's rules (weights, rounds, the Nightmare Ball only while
  something can be caught, the Dowsing MCHN only while not held), each at its entry's `price`, kept in the state
  (`shopItems`, `shopPrices`, `shopCount`) for the room. Since the buffs' phase 2 it also draws buffs.json's
  `shop_buffs` buffs (`shopBuffs`), sold from a list of their own: a shop with buffs left first asks Items (this
  screen), Buffs or Leave (`entralink-buffs.md`, section 9).
- **The choice:** the shop is now a choice NPC (`EntralinkRun_IsChoiceType`): talking to it opens the shop, and closing
  it makes the room's choice (`ENTRALINK_RUN_ACTION_MAKE_CHOICE`) whether anything was bought or not, so in the pre-boss
  rest the heal, revive and gift NPCs go, and a shop room is done. The shop that was the choice opens again when talked
  to (the stock as it was); the other choice NPCs say "Go on. The nightmare awaits." as before.
  `Global10490_Text_RunShopClosed` is gone.

### The Dowsing MCHN

- The user may add `ITEM_DOWSING_MCHN` to `items.json` (rare, in the item_room or shop pools); none is in it now.
- **The run's bag** holds 1 key item (`ENTRALINK_RUN_BAG_KEY_ITEMS`), and its Key Items pocket is shown, its tab not
  greyed, while it holds the Dowsing MCHN (`ItemMenu_IsPocketShown`, `itemmenu.c`). The Entralink forces the season,
  which blocks every key item's Use (`ItemMenu_CanUseInMode`): the run's bag is let through. The Dowsing's field check
  (action 9, `FieldActionBlockCheck_NormalZoneNotRoyalUnova`) refuses the Entralink's zones, which aren't "normal":
  `PaperWhite2_FieldActionBlockCheck_Dowsing` (`itemuse_event.c`) allows a run's forest rooms.
- **Finding:** the Dowsing's search (`src/ov086/dowsing.c`, `DowsingSearch_Next`) has, in a run's forest room, one hit:
  the room's hidden item as a `HiddenItem` of the room's zone (`DowsingSearch`'s `runItem`, in its heap work: overlay
  86 has no .bss in the link), there while the state's `hiddenItem` isn't taken. Found with A as before (script 10499).
- **Once per run:** not drawn while the run's bag holds it (`ItemFilter`'s `dowsing`). Gone at the run's end with the
  rest of the run's bag; the real bag never had it.

### Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `dust/`)

- **Doors before the pre-boss rest:** above (12 seeded draws, then every type at 1).
- **Icons and markers:** before and after, the item template's balls and the rest template's NPCs from (15, 18)
  (`item_before_zoom.png`/`item_zoom.png`, `rest_before_zoom.png`/`rest_zoom.png`): the icons centred over the balls,
  just above them; the markers centred over the heads (H and V on the heal and revive NPCs).
- **Triple corner and raid:** above (`triple_center.png`).
- **enemy_choice:** Prince or Princess poked to the type: drawn behind doors (3 of 24 with every type at 1); its marker
  EE in front of the doors (`enemy_choice_markers_zoom.png`).
- **Dust:** a new run 0; room 1 (The Illusionist, enemy, round 1) won: 40, "You gathered 40 Dream Dust! (total 40)"
  (`dust_room1_00.png`); Time and Space as round 2's boss (place 10): +225 (150 x 150%); Prince or Princess as
  enemy_choice in round 3 (place 11): +100 (50 x 200%), total 365; the back door: the run over, 0; a new run: 0.
- **Shop room** (the template behind room 1's doors): stock Ether 60, Potion 20, X Sp. Def 50, Nightmare Ball 100,
  Pecha Berry 20; with 1 Dust "You don't have enough Dream Dust." and nothing bought; closing it: the room done (choice,
  markers); talked to again it opened, and with 200 Dust a Potion: 180 left, the Potion in the run bag's Medicine
  (`short_sheet.png`, `shop_sheet.png`). 30 seeded shop stocks: always 5 different items, the Nightmare Ball in 9; with
  every catch poked away, 0 in 20.
- **Pre-boss rest:** its shop (5 items) opened and closed without buying: heal, revive and gift gone, the room done.
- **Dowsing MCHN** (poked into the run's bag, the hidden item poked to (13, 20)): the Key Items pocket shown with it
  (its tab red), Use, the Dowsing screen pointing to it, "Riku found Potion!" with A from (13, 21), then no signal
  (`dw_sheet.png`); with the item table's first entry poked to it at weight 255, three shop stocks drew it when not held
  and none when held; after the back door the run bag was empty and the real bag without it.
- The packer's tests (24, three new), the editor's (251, two new), `verify_dsi_rom.py`, the plain build's module
  check.

Not tested: real hardware; buying the Dowsing MCHN from a shop's screen (the draw and the bag were tested apart); a
shop with fewer than 5 items in its pool.

### Memory

Code: overlay 12 +0.45 KB, overlay 36 +0.52 KB (the shop 0.36), overlay 86 +0.16 KB, overlay 142 +44 bytes, ARM9 main
+56 bytes (the state +40 of .bss). The DS arena: 45 KB left (from 46). At run time: the shop's screen is the Mart's,
in its own heaps and freed when it closes; the Dowsing's search work +12 bytes; VRAM as before per marker texture (the
enemy_choice marker 544 bytes, each NPC marker 160) only while shown.

## Fixes: new species' NPC sprites and short doubles and triples (2026-11-20)

From the user's room `apples_to_applin` (a triple with one Dipplin, a battle NPC with no sprite), both proven in
py-desmume (scripts in the session's scratchpad `applin/`):

- **The NPC was invisible.** A battle NPC without a sprite was packed with sprite 0, and the game looked its enemy up in
  the walking table (a/2/0/8, `GetPokemonFieldOBJCODE`), which has 620 rows, the original's species only: none for
  Dipplin (690) or for any of the hack's walking sprites (`OBJ_CODE_POKEMON_` from 0x4000). The lookup's
  `TPOKE_INDEX_NONE` isn't negative, so the original's bug (`tpoke_data.c`, `// BUG:`) read row 0xffff past the table:
  object code 0, an actor with no sprite. **Now** the packer writes the code itself (`walking_sprite`): the names the
  table's rows have (checked: all 620 are `OBJ_CODE_POKEMON_<species>`, a form's `_FORM_<n>`, a sex's `_MALE`/`_FEMALE`),
  so the hack's own sprites come too, and a form without its own shows its species'. The editor's `walkingSprite`
  picks the same; a species with none is an error in both (it was a warning in the editor). Since 2026-11-21 a
  species without a walking sprite shows its follower sprite instead (entralink-buffs.md 20).
- **The crash.** In a double or triple the foe's AI (`AIGetHighestDamagingMoveWithPartners`, `tr_ai.c`) loops over
  every place of its side (`GetClientBattlerCount`), and with fewer Pokémon than places `TrAI_GetPartyMon` gives NULL:
  `CanPokemonBattle` reads the null BattleMon's `core.src` (0) and `PokeParty_GetParam` decrypts and re-encrypts a
  Pokémon at address 0, which is the ITCM's mirror. That rewrites `mainRenderer` (clact_itcm, 0x01ff8020), and the next
  sprite draw runs garbage: an undefined instruction at 0x01ff802e, the crash screen's exception (its PC+4 of 4 and the
  OS exception functions are the handler's own). A raid has no such hole: its sides are fainted copies. **Now** the
  packer and the editor require exactly a format's enemies (single 1, double 2, triple 3, raid 1), and the run plays a
  battle that has fewer as the format they fill (`EntralinkRun_CreateBattle`): one enemy as a single, two as a double.
  Not a raid-like centred triple: that would add fainted copies, the raid's look, without the raid's HP and boss
  protections, and the data is refused anyway; the fallback only keeps a build with such data from crashing.
- **Tested:** the room as it was (one Dipplin, triple, the packer's check bypassed for the test): its NPC shows
  Dipplin's walking sprite (actor model 0x4015 instead of 0), the battle plays as a single and is won, no exception;
  the same room with three Dipplin: a triple with all three, several turns of both sides' moves (Syrup Bomb among them), no exception; before the fix the same
  savestate hit the undefined instruction within the first turn, and a write watch on 0-0x400 caught
  `PML_CryptoRun` writing there from `TrAI_Think`.
- Cost: a few instructions of overlay 12; nothing at run time.

## Room ambients and the Entree page's inputs (2026-11-20)

### Room ambients

An NPC of type **`ambient`** is scenery: an actor with any sprite (its `sprite`, the Lady without one) and nothing to
say, which reacts when the player comes within `near` tiles (3; either way, a square round it, as the overworld's
ambients measure it) while no event runs. The user's case: many Darkrai in the final room, one of them the real battle
NPC, the others decoys that fade as the player comes near.

- **`fade`** (the default): its sprite fades out over 15 frames (the alpha of its actor's billboard, 31 down to 1, as
  the footprints fade). Without `return` it is gone for the rest of the room (its `npcsGone` bit). With `return` its
  actor goes once faded (so it doesn't block the way) and comes back at its tile, fading in, once the player is `far`
  tiles away (6); coming near again while it fades in fades it out from where it got to.
- **`flee`**: it turns and runs `distance` tiles (4) away from the player (`ACMD_WALK_4F` a tile at a time, about 8
  frames a tile): away along the farther way, else away along the other, else that other's opposite, the first that is
  open (`ActorRouteCollCheckOneTileInDir`, so trees, the clearing's edge and other actors stop it); it fades over the
  last 15 frames of its run, then is gone for the room.
- **Spawning** is any NPC's (`requires`, `chance`, rolled as the room is entered), and so are the editor's placement
  checks (exits, the arrival tile, two on a tile, blocked tiles, the doors' marker spots): while shown it blocks the
  way like any NPC. An ambient **never keeps a room from being done** (`EntralinkRun_EnterRoom` leaves it out of
  `cleared`, `EntralinkRun_CheckRoomDone` skips it), so a room of ambients only is free.
- **Talking** to one (it can be reached in the frames it fades) does nothing: Script_9 returns at once for
  `ENTRALINK_RUN_NPC_AMBIENT`, before `ActorSetEyeToEye`, so it doesn't turn to the player. Its dialogue isn't packed
  (the packer's `spoken`), and the editor hides the Dialogue section for it and warns of one in the file.
- **Code:** `src/paperwhite2/ov012/paperwhite2_entralink_ambients.c`, `PaperWhite2_EntralinkAmbientsUpdate`, called
  from the field's update beside the markers (`fieldmap.c`); `paperwhite2_entralink_run.c` gives it
  `EntralinkRun_GetAmbient`, `EntralinkRun_SpawnAmbient` (spawned hidden, shown once its billboard has the fade's
  first alpha) and `EntralinkRun_RemoveAmbient`. After a battle the room's NPCs are spawned again, and a faded
  returning one stands at home. The overworld's ambients (`paperwhite2_ambients.c`) are billboards without actors made
  from a zone's records, so they weren't reused; only their measure of "near" is.
- **Packing:** `EntralinkNpc` gains `behaviour`, `near`, `far` (0: doesn't return) and `distance` (4 bytes per NPC,
  26 bytes each); the packer refuses a fleeing ambient with `return`, a `far` not past `near`, and the ambient keys on
  another type. The schema says the defaults.
- **Not yet:** the actor's shadow stays solid while its sprite fades, and an NPC marker over an ambient doesn't fade
  (it goes with the actor).
- **Memory:** overlay 12 grows by about 1.1 KB of code (966 bytes for the new file) and 49 bytes of BSS; the NPC table
  by 4 bytes per NPC (25 NPCs now: 100 bytes). No heap or VRAM.

### The Entree page's number boxes and move pickers

- **Number boxes** (`parts.tsx`'s `NumberBox`, every number of the page: an enemy's level, form and Scale, the Run
  section's tables, Raid HP, weights, chances, prices, Dust, the Buffs tab) keep what is typed while focused and
  commit on blur, Enter or Ctrl+S (Escape goes back): a value out of range is shown red with its range in the tooltip
  and **clamped when it commits**, an empty box goes back to its value. Typing 300 over 100 in Scale no longer snaps.
  Other editors with a box that clamps at each keystroke (not changed): the Trainer Editor's party numbers, the
  Pokémon Editor's stats and learnset levels, the Shop Editor's prices, Join Avenue's trainer id, the Pokémon Center
  Editor's numbers, the Encounter Editor's percents and party level.
- **Move pickers:** an enemy's (and the Trainer Editor's party moves, the same SearchSelect) list first the moves its
  species can learn, under **Learns (N)**, each with how ("Lv. 46", "Evolving", "TM26", "HM01", "Tutor", "Egg"), then
  **All moves**; the search runs across both. A form with its own record (`form_N.json`) reads that record's learnset,
  with its species' egg moves. They come from `moves.py learnable SPECIES [--form N]` (`GET /api/moves/learnable`),
  read from disk once a session per species and form. SearchSelect's options can carry a `group`: a heading is shown
  where it changes.

## Random enemy rooms (2026-11-21)

Decided with the user the same day. A door that draws an `enemy` or `enemy_choice` room leads, at run.json's
`random_enemy_chance` (50), to a **random room** rather than a premade one of the type; to a random room too when no
premade one fits (unless the chance is 0). The first room of a run follows the same chance. Random rooms are never
raids, bosses or the final room.

| Where | What |
| --- | --- |
| `run.json` | `random_enemy_chance` (0-100, 50) and `random_rooms`: `format_weights` (single 40, double 35, triple 25), `bst` (a `{ min, max }` base stat total band for rounds 1-3, the last given for those left out; 300-480, 380-540, 450-600), `theme_chance` (70), `level` (70), `move_pool` (7), `tm_chance` (25), `hidden_ability_chance` (5), `anchors` (the battles' tiles for 1, 2 and 3 choices: `[15, 15]`; `[12, 15]`, `[19, 15]`; `[10, 15]`, `[15, 15]`, `[20, 15]`) |
| `legendaries.json` | The legendary and mythical species (the species data has no such flag), never drawn; a new legendary species goes here |
| `tools/paperwhite2/entralink_random.py` | Checks them and writes `paperwhite2/entralink_random_config.h` (the settings and the species table's member number); its `archive` command adds the species table to a/0/4/7 (`EntralinkRandomSpecies`: species, sprite, evolution family as its line's first species, base stat total, types, the female's sprite's distance from the sprite; 12 bytes each), which the game reads into the event heap only while it makes a room (memory.md) |
| `tools/paperwhite2/entralink_run.py` | Two rows after the templates, `random/enemy` and `random/enemy_choice` (`EntralinkRoom`'s new `random`, `isTemplate` so never in a pool, their types' markers), `ENTRALINK_RUN_RANDOM_ENEMY_ROOM`, `_CHOICE_ROOM` and `_ENEMY_CHANCE`; a round's enemy and enemy_choice types are never "skipped" while the chance is above 0 (`type_problems`, the editor's `runProblems`) |

**The species:** those of the Pokédex (`species_list.pokedex_species`, so never a `"pokedex": false` one), the hack's
new ones included, but legendaries.json's, that have a walking or follower sprite (the packer's `npc_sprite`: 597
today, 76 of them by their follower; Flapple and Appletun left out, their followers still Budew's; entralink-buffs.md
20; 523 before the followers) and know a damaging level-up move (power above 0) at the rooms' level.

**Making a room** (`EntralinkRun_MakeRandomRoom`, `src/paperwhite2/ov012/paperwhite2_entralink_random_rooms.c`, as the
player enters it, before its NPCs come up): 1 battle (enemy) or 2-3 at even odds (enemy choice); each battle's format
by the weights; its enemies from the round's band, the first at random and, at `theme_chance`, the others sharing a
type or the family with it; every enemy keeps off the types and families of the room's earlier choices and no species
comes twice in a battle. A rule no species fits is dropped, in the order theme-and-apart, theme, apart, distinct.
Each enemy: the level, 4 moves drawn from the last `move_pool` level-up moves it knows at it (`PML_LearnsetLvUpLoad`),
at `tm_chance` one replaced (or added, with fewer than 4) by a TM or HM (the personal data's TM bits), tutor (the free
and paid tutors' bits, `paperwhite2/move_tutors.h`) or egg move (a/1/2/4); then, if none of them is damaging
(`PML_MoveIsDamaging`), one replaced by a damaging one of those it knows. One of its two abilities at random, its
hidden one at `hidden_ability_chance` (if it has one); no item; male or female by its gender ratio (set, so the NPC's
sprite matches), genderless left to the PID; never shiny or catchable; scale 100 and progress id `ENTRALINK_NONE` (a
win sets no bit). The NPCs: one per enemy, its walking sprite (`OBJ_CODE_POKEMON_*`, the female's where the sexes
differ) or else its follower sprite (`OBJ_CODE_FOLLOWER_*`, the female's for a female), facing down; a single on its anchor, a double on it and one to the right, a triple on it with the other two
one tile back on either side (as Time and Space stands them). Talking to any of a battle's NPCs starts that battle.

**Kept in ARM9 main:** `EntralinkRandomRoom` (`include/paperwhite2/entralink_random_rooms.h`,
`src/paperwhite2/main/paperwhite2_entralink_random_room.c`) holds the room's record, its battles, enemies and NPCs as
the tables' structs (500 bytes), so they outlast the battle. The run's code reads every NPC, battle and enemy through
`EntralinkRun_GetNpc`, `_GetBattle` and `_GetEnemy`, and `EntralinkRun_GetRoom` gives the made room for a random row:
spawning, battles, catches, ground items, clearing and dust read a random room as any other.

**Scaling and Dust:** the room curve at the room's depth, no boss bonus and no per-enemy scale (entralink-buffs.md 12
and 15); Dream Dust as an enemy or enemy_choice room's.

**The editor:** the Run section's **Random rooms** (the chance, the three format weights, each round's band, Themed
battles, Level, Move pool, TM moves, Hidden ability, and the anchors as x and z per choice); a note in the Templates
group that random rooms have no template. The anchors stay in run.json rather than a template file: a template holds
whole NPCs, while random rooms need only a tile per battle, and the build checks them (every format's tiles walkable
in all the clearings and off the exits, markers and arrival, choices 2 tiles apart).

**Tested** (py-desmume, the user's save copy, a build with `random_enemy_chance` 100 and the doors' weights poked to
enemy 1 and enemy_choice 1; scripts in the session's scratchpad `randrooms/h/`): 13 random rooms, places 1-4 (round 1)
and 16-18 (round 3, the run's place poked): 20 battles, 39 enemies, every species within its round's band, no
legendary; 12 of the 15 doubles and triples themed (type or family: Charmander, Charmeleon and Torchic; Primeape and
Machamp), the choices of each room of different types and families; every moveset distinct with a damaging move, 7 with
an extra move, 1 hidden ability. Layouts (shots `layout_r3_1` single, `layout_r1_0` double, `layout_r1_1` triple,
`layout_r3_2` three choices single/double/single, `layout_r3_4` three doubles): as above. Battles: a single (Stunfisk,
round 3, 3,465 HP on the curve), a double started from its second NPC (Voltorb, with Joltik), a triple (Unown, Beldum,
Exeggcute), and the first of three doubles in a choice room: each won, the room cleared, every NPC gone (the other
choices too), Dream Dust 40, 40, 80 and 100 (enemy and enemy choice times the round's percent), the doors' markers shown.

## Records (2026-11-21)

Step 1 of the records the user decided on (2026-11-21): the data and its saving, with a debug readout; nothing in the
game shows them yet. Code: `include/paperwhite2/entralink_records.h`, `src/paperwhite2/ov012/paperwhite2_entralink_records.c`
(overlay 12), the hooks in `paperwhite2_entralink_run.c`, the battle's in `paperwhite2_entralink_battle.c`
(`RecordHit`, `EntralinkBattle_End`, called from `btl_main.c`'s result and `btl_server_flow.c`'s damage numbers), the
codex's generator `tools/paperwhite2/entralink_records.py` and its data `res/paperwhite2/entralink/records.json`.

### The layout (the progress block's 0x1cc, `EntralinkRecords`, 0x454 bytes)

| Offset | Size | What |
| --- | --- | --- |
| 0x00 | 2 | runs started (wins are the block's `runsCompleted`, 0x06) |
| 0x02 | 2 | the current win streak (a run that ends any other way ends it) |
| 0x04 | 2 | the best win streak |
| 0x06 | 2 | the fewest turns of a run won (0: no win yet); the hall of fame's run |
| 0x08 | 2 | the deepest place reached (the run's room, from 1) and its round |
| 0x0c | 4 | every Dream Shard runs gave (earned, whatever was spent; uncapped by the 99,999 held) |
| 0x10 | 8 | the biggest hit: damage (as the damage numbers show it, capped at 60,000), species, move, form, critical |
| 0x18 | 0x10 | a bit per room entered, by the room's record id (128 rooms) |
| 0x28 | 0x10 | a bit per room done |
| 0x38 | 0x40 | bosses and final rooms beaten: 16 entries of (record id + 1, flags, times beaten up to 255) |
| 0x78 | 0x20 | each of those entries' fewest turns of its battle won |
| 0x98 | 0x100 | the Nightmare codex: 64 entries of (key, flags met / caught, times beaten up to 255) |
| 0x198 | 0x200 | the buff compendium: 128 entries of (card key, flags offered / taken, times taken up to 255) |
| 0x398 | 0xa8 | the hall of fame: 6 Pokémon of (species, held item, form, shiny, nickname of 11 characters) |
| 0x440 | 0x14 | the hall of fame's golds: 5 of (card key, rank) |

- **Size:** 1,108 bytes of the block's 1,668 free; **560 bytes (0x230) left** at 0x620. An old block (the hub shop's,
  zero there) reads as no records, as does an old forest block, which the first read clears. The block's version stays 1.
- **Entries by key**, never by position: a room by its record id, a codex species by `species | form << 10`, a card by
  its key (the hub shop's FNV-1a hash of its ID), so adding, removing or reordering rooms, species or cards keeps every
  record with its owner. A full table records nothing more (the packer keeps the codex at 64; 94 cards fit in 128).
- **The levels** aren't kept in the hall of fame (the team plays at 100); nicknames are.

### Room record ids

A room of `rooms/` has a top-level `progress_id`, its **record id** (0-127, `room.schema.json`), given by the editor on
save from `progress_ids.json`'s new `next_room` like a battle's (never reused; a copied room gets a new one); the packer
refuses a room without one, two rooms with one, one at or past `next_room`, and a template with one. It goes in
`EntralinkRoom`'s `recordId` (its padding byte; templates and random rooms 0xff). The 13 rooms got 0-12 in name order.

### The codex and the special forms

`records.json`'s `special_forms` lists the forest-only forms (species and form) counted alone, today Primal Dialga
(Dialga form 1) and Shadow Lugia (Lugia form 1), the hack-added forms the rooms use (Giratina's Origin form is the
original game's; the Pokéstar Giantess is a species, not a form: neither is listed). Every added species with
`"pokedex": false` that isn't retired is a Nightmare, counted in every form under form 0's key (none exist yet). The
generated `ENTRALINK_RECORDS_CODEX` holds both; an enemy of neither isn't recorded. The editor doesn't edit the file yet.

### When they are written

| Moment | Records |
| --- | --- |
| A run starts (`EntralinkRun_Start`) | runs started |
| A battle starts (`EntralinkRun_CreateBattle`) | each codex enemy met (a raid's three are one) |
| A battle won (`EntralinkRun_FinishBattle`) | the run's turns += the battle's; a codex enemy caught, or else each beaten (+1); a boss or final room's times beaten and fewest turns |
| A card list shown (`ENTRALINK_RUN_ACTION_ADD_CARDS`: the offer, a buff room, a gift NPC, a shop) | each card offered |
| A card taken (`EntralinkRun_TakeCard`, a shop's bought too) | taken, times taken |
| Each hit of the team's on a foe (the battle) | the run's biggest hit (in its state), whether or not the numbers show |
| A battle's end (`btl_main.c`) | the battle's turns: the server's count + 1 (the turn it ended in) |
| The run's end, every way (`EntralinkRun_End`) | rooms entered and done (those left behind, the current if done or the final won); deepest place; Shards earned; the biggest hit; a win's streak, fewest turns and hall of fame (the team's copies and golds, on fewer turns only: a tie keeps the first), or the streak's end |

The run's own (turns, the battle's turns, the biggest hit, won) are 14 bytes of `EntralinkRunState`. All in RAM until
the game is next saved, as the rest of the block. Catchable now isn't stored: it follows from the catch bits and the
conditions.

### The debug readout

START > Player... > **Entralink records...**: **Show records** pages through the records, six lines a page (the run's,
the rooms' counts and ids, each boss, the codex and each entry, the cards offered and taken and each card taken, the
hall of fame and its golds; species and cards by number); **Reset records** clears the records (not the battles won,
catches, runs completed, Reserve Box or Shards). Actions `DEBUG_ACTION_RECORDS_PAGE` and `_RESET` (60, 61), list id 6
of Player....

### Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `records/h/`)

- **An old save:** its Symbol block held forest data; the run's first read cleared it, the records zero but runs started
  1 (`records_start_0.png`, the readout).
- **A loss** at place 3 (the Illusionist): streak 0, deepest place 3 of round 1, Shards earned 2, room 10 entered and
  done (the places behind were poked to it).
- **A second run:** runs started 2; Shadow Lugia's raid won with a catch poked into the run state: codex Lugia/1 met and
  caught, not beaten; the offer's three cards offered, one taken (compendium flags 3, count 1); Dialga's raid won:
  Dialga/1 met, beaten 1, its offer's card taken too; Darkrai (final) won in 1 turn: boss entry (record
  id 1, 1 time, 1 turn), streak 1 / best 1, fewest turns 3 (three battles of one turn), deepest 21 of round 3, Shards
  earned 33 (2 + 31), biggest hit 44 by Oinkums (species 499) with move 292, the hall of fame's six with nicknames;
  with two golds poked held, the hall's golds (Galvanic rank 2, Overcharge 1).
- **Saved** in game and **reloaded**: both copies of the block in the file and the block after a reboot hold the same
  records. **Reset records**: all zero, the battles won and runs completed kept.
- Not tested: a real Nightmare Ball catch (the catch path is the run's, unchanged: its PID marks the enemy), a boss of
  role boss (the final room takes the same path).

### Memory

Overlay 12 **+2,976 bytes** (the records 0.9 KB, the run's hooks 0.3 KB, the debug readout about 1.8 KB, debug builds
only); ARM9 main +14 bytes of BSS (no change to its end, alignment); overlay 167 +0.2 KB (battle only). The DS arena
left falls from 0x5ec0 to **0x5320 (20.8 KB)**. Save: the progress block, as above.

## The Entree's menu (2026-11-21)

Step 2 of the records: examining the Entree (A, in front of it) opens its menu, the Entralink monolith (overlay 143)
repurposed. The hub's bg event is back (`entralink.json`, script 4 at (31, 33)): "Checked your Entree.", then
`CallMonolith`, and under `PAPERWHITE2` Script_4 returns after it, skipping the Funfest mission's start. Code:
`include/paperwhite2/entree_menu.h`, `src/paperwhite2/ov143/` (`paperwhite2_entree_data.c` the ranks, milestones and
copies of the tables; `paperwhite2_entree_menu.c` the Status, the menu and the pages; `paperwhite2_entree_lists.c` the
lists), and `monolith_main.c`'s screen table under `PAPERWHITE2`. Text: the end of the monolith's own bank,
`res/text/system/btl_main_title.txt` (`BtlMainTitle_Text_Entree*`, placeholders).

### The screens

| Screen | Top | Bottom |
| --- | --- | --- |
| The menu | **Status**: the White Tree's rank (n/5) and the milestones reached, the Black Tree's rank, the Shards earned and the next rank's, and the monolith's White-against-Black bar drawn from the two ranks | the items in frames, two columns (Status, Records, Nightmares, Bosses, Special, Catchable, Buffs, Hall of Fame) and Exit, with the D-pad, A, B or touch; the return button closes too |
| Status | Status | rows: each White Tree milestone that counts, Done or -, the Shards earned and the next Black rank |
| Records | Status | rows (8 a page, left/right or L/R to page): deepest point (round and room), runs started, runs won, the current and best win streaks, Shards earned, the biggest hit and its Pokémon's move, the best run's total turns, rooms discovered and beaten (of the rooms of `rooms/`) |
| A list | the list's name and the entry under the cursor described | a scrolling list (`BmpMenuList`, left/right a page) |

The lists:

- **Nightmares** (the codex's Nightmare species) and **Special** (records.json's forms): "?????" until met, then the
  name; met, caught, times beaten. "Nothing here yet." while there are none (no Nightmare species exists yet).
- **Bosses**: each boss and final room of `rooms/`, by its first enemy, "?????" until its room is discovered; its
  enemies (each species once), times beaten and fewest turns, or never beaten.
- **Catchable**: every catchable enemy of the rooms of `rooms/` (a catch once): caught; locked, with the battles to win
  first (a requirement's battle by its first enemy, "Finish a run" for a run won); or catchable now.
- **Buffs**: every card of the catalogue: "?????" until offered, then its title in its tier's colour (the buffs' bank's
  own colour codes, the monolith's text colour set back after with `{ff00:498}`), "offered, never taken", or once
  taken its description at every rank (a gold's title and description for ranks I to III) and the times taken. A type
  card reads "any type".
- **Hall of Fame**: "Won in N turns", the team by nickname (species with form, shiny, held item), then the golds held
  at their ranks with their descriptions. A list rather than the original Hall of Fame viewer, which is a full app of
  its own.

### The ranks

`records.json`'s `black_ranks` (five Shards-earned thresholds, rising: 5, 20, 60, 180, 450) and `white_milestones`
(which count: `beat_final`, `catch_all`, `fill_codex`, `shop_cap`, `all_rooms`), packed by
`tools/paperwhite2/entralink_records.py` into `ENTRALINK_RECORDS_BLACK_RANKS` and `ENTRALINK_RECORDS_WHITE_MILESTONES`
(a bit each, `ENTREE_MILESTONE_*` order). The Black rank is the thresholds reached; the White rank is the counted
milestones reached, in any order: a run won (`runsCompleted`), every catch of the rooms caught, every codex entry met,
the hub shop's bought picks at `total_cap`, every room of `rooms/` entered. The editor's Entree page edits both (Run
section, **Entree ranks**: the five numbers, a checkbox a milestone). Since step 3 the ranks are computed in overlay 12
(`include/paperwhite2/entralink_ranks.h`, which stays loaded while the monolith runs), which the menu, the hub's trees
and the rewards all read ("The ranks' rewards").

### Memory

Overlay 143 only, which loads for the monolith alone and sits inside the field's span (overlay 36), below the arena:
0x6c60 to 0x9b40 (+12 KB: the code and its text tables 9.1 KB, copies of the run's rooms, battles, enemies and the
buffs' catalogue 2.9 KB, since overlay 12's are static to the run). ARM9 main and overlay 12 unchanged; the DS arena
stays 0x5320 (20.8 KB). The screens' work is on the monolith's own heap (1 MB of the user heap).

### Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `entreemenu/h/`)

- The hub's Entree opens the menu (an old save's block read and cleared by it); every item, page and list opens and
  B or the return button goes back, the menu's cursor where it was.
- **Black ranks at the boundary**: 4 Shards earned rank 0/5, next at 5; 5 Shards rank 1/5, next at 20; 450 rank 5/5,
  the highest. **White**: no milestone 0/5; a run won and the codex full 2/5 (Status lists those two Done); all five
  (every catch, the shop's 8 picks, all 13 rooms) 5/5.
- **Records** with poked values: round 3 room 12, 7 runs, 2 won, streaks 1 and 2, 450 Shards, a 12,345 hit by
  Pignite's Arm Thrust, 41 turns, 13/13 rooms discovered and 3/13 beaten, on two pages.
- **Lists**: Darkrai's final room beaten twice in 3 turns, Ho-Oh's round boss never beaten; Primal Dialga met, Shadow
  Lugia met and caught; the hall's three (Primo: Dialga form 1, shiny, Leftovers) and two golds; cards unseen, offered,
  a blue taken twice, Galvanic taken (its three ranks); Catchable with one caught, one catchable and one locked behind
  Darkrai's battle (a requirement poked into overlay 143's table copy, since no room has one); Nightmares empty.
- Not tested: touch input, a list longer than the screen paged with left/right (scrolling was).

## The ranks' rewards (2026-11-21)

Step 3 of the records, decided with the user on 2026-11-21: the two trees grow with the ranks, and each rank unlocks
something. Code: `include/paperwhite2/entralink_ranks.h`, `src/paperwhite2/ov012/paperwhite2_entralink_ranks.c` (the
ranks, moved from overlay 143, the hub's NPCs, the fog and form actions, the skip), hooks in
`paperwhite2_entralink_run.c` (`EntralinkRun_Start`, `EntralinkRun_FinishBattle`, `EntralinkRun_End`),
`src/ov130/gimmick_funfest_levels.c` (the trees), `src/ov033/entree_forest_first_warp.c` (the skip's question),
`src/ov036/scrcmd_shop.c` (the item shop), `src/ov167/btl_server_flow_sub.c` (the Nightmare Ball), `zone_weather.c`
(the fog); scripts 1 and 17-20 of `entralink.s`, Script_12 of `global_10490.s`; data `records.json`.

### The trees

The hub's two trees are the original's White and Black level models (`GimmickFunfestLevels`, overlay 130, five models
a colour, field gimmick 29 of the hub). `ShowLevels` lights the stage of the White and Black ranks in place of the
Funfest levels: **stage = rank - 1, ranks 0 and 1 both the first** (`EntralinkRanks_GetTreeStage`), rank 5 the fifth.
The stages are read as the hub's field loads (the gimmick's setup), so a rank reached shows on the next visit.

### What each rank unlocks

`records.json`'s `rewards`: each reward's tree and rank (0-5; 0 from the start), packed as `tree << 4 | rank` into
`ENTRALINK_RECORDS_REWARDS` (`ENTRALINK_REWARD_*` order); a White rank past the milestones that count is refused by
the packer. `EntralinkRanks_HasReward` compares with the rank now. The defaults:

| Tree, rank | Reward | What it does |
| --- | --- | --- |
| Black 1 | `reserve_box` | the Reserve Box NPC (id 5) is in the hub |
| Black 2 | `hub_shop` | the buff shop NPC (id 6) is in the hub |
| Black 3 | `buff_room` | every run's first room is the buff template (`sTypeTemplates[ENTRALINK_TYPE_BUFF]`), whose ball offers buffs |
| Black 4 | `dust_bonus` | a battle's Dream Dust + `dust_bonus` percent (50) |
| Black 5 | `shard_bonus` | a run's end gives `shard_multiplier` times its Dream Shards (2; the records' Shards earned count them) |
| White 1 | `difficulty` | the difficulty NPC (id 7, script 17): a placeholder line, no mechanics yet |
| White 2 | `fog` | the fog NPC (id 8, script 18): the hub's fog, pink, purple, black (the rounds' tints `WEATHER_CUSTOM_TINT_9`, `_8`, `_7`) or none, saved at the progress block's 0x620 (`hubFog`) and shown at once (`FieldSetWeather 0xffff`, which reads `GetWeatherAll`'s new hub hook) |
| White 3 | `shard_shop` | the item shop NPC (id 9, script 19): the Poké Mart's screen (shop ID `ENTRALINK_SHARD_SHOP_ID` 0xfb, currency Dream Shards) selling `shard_shop`'s goods into the real bag: a Nightmare Ball for 15, a Shiny Candy for 60. Shards spent here are spent for good (the buff shop's reset gives back only its own) |
| White 4 | `skip_round` | stepping into the forest asks "Skip the forest's first round?": Yes starts at round 2's first room with a head start, `skip_round`'s picks (6) each chosen from an offer of round 1's (an enemy room's odds) with the usual chooser, and its Dream Dust (250); No (or B) starts as before |
| White 5 | `form_change` | the form NPC (id 10, script 20): a party Pokémon picked whose species has a special form (`special_forms`: Lugia, Dialga) takes it, or goes back to form 0 (`PokeParty_ChangeForme`, stats recalculated); cosmetic |

- **The hub's NPCs** stay in `res/field/events/entralink.json` (placeholder sprites and places for the user to move:
  (26, 43), (36, 43), (26, 40), (36, 40)); the hub's init script (Script_1, `ENTRALINK_RUN_ACTION_RANKS` 0) deletes
  each whose reward is locked as the map loads, by its actor ID (`sHubNpcs`). No event flags.
- **The skip:** the forest entrance's tile runs `SCRID_ENTRALINK_RUN_START` (10501) instead of its warp when the reward
  is unlocked; the script starts the run (`EntralinkRun_Start(gameData, skipRound)`), offers the picks
  (`ENTRALINK_RUN_ACTION_SKIP_ROUND` 1, then `L_RunBuffOfferMenu`, Skip giving its Dust as after a battle), gives the
  Dust and warps (the entrance's warp, kept from the tile). The run's places before round 2 hold the pre-boss rest's
  template in `order` (no room of `rooms/`, in no pool) and `placesSkipped` (the state's), so they give no Shards and
  no room records; the enemies scale as round 2's. With `buff_room` too, round 2's first room is the buff room.
- **The Nightmare Ball outside the forest:** `PaperWhite2_ThrowBall_CanCatch` lets any ball catch in a wild battle
  that isn't a run's (the Nightmare Ball was refused there), and `CheckBallCapture` takes the Master Ball's path for it
  only in a run's battle; elsewhere `GetBallCaptureMod` gives it 1, a Poké Ball. Its description says so now.
- **Text:** placeholders at the end of `entralink.txt`, `global_10490.txt` (`RunSkip*`) and `scrcmd_shop.txt`
  (`Shard*`, `DreamShards`).
- **The editor:** the Entree page's Run section, **Ranks' rewards** under Entree ranks: each reward's tree and rank,
  the two bonuses, the skip's picks and Dust, and the item shop's goods (item and price, add and remove).

### Memory

ARM9 main +64 bytes (the hub's fog in `GetWeatherAll`), overlay 12 +1.6 KB (the ranks moved from overlay 143 0.4 KB,
the hub NPCs, fog, form and skip actions, the run's hooks), overlay 36 +0.3 KB (the item shop), overlay 143 -0.4 KB.
The DS arena left falls from 0x5320 to **0x4b60 (18.8 KB)**. Save: one byte of the progress block (0x620).

### Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `ranks/h/`)

- **The trees** with the records poked to Black/White ranks 0/0, 1/1, 3/3, 5/5 (the models shown: stages 0, 0, 2, 4;
  `ranks/shots/t1_trees_all.png`: the tree the same at 0 and 1, larger at 3, full with flowers at 5), 2/0 and 0/4
  (each tree its own stage: 0 and 1, 3 and 0).
- **The NPCs** deleted as the hub loads: all six at 0/0; fog, form, item shop and buff shop at 1/1; only the form NPC
  at 3/3; none at 5/5 (`t1_npcs_b5_w5.png`); difficulty, fog, form and item shop at 2/0; form, Reserve Box and buff
  shop at 0/4.
- **Black:** the first room an enemy room at Black 0, the buff template at 3, 4 and 5; Shadow Lugia's raid at place 5
  gave 80 Dust at Black 3 and 120 at 4 and 5; a warp away after it gave 5 Shards at Black 3 and 10 at 5.
- **The fog NPC:** pink fog at once (`t2_fog_pink_none.png`), `hubFog` 1; No fog back to clear, 0.
- **The item shop** with 100 Shards: a Nightmare Ball (85 left, the real bag's items pocket), a Shiny Candy (40 left,
  medicine pocket); with 25, the candy refused.
- **The Nightmare Ball outside a run:** a run's Ditto battle made a plain wild battle (the run's flag cleared as it is
  set): four throws took the Poké Ball's path (`GetBallCaptureMod` with item 126), the fourth caught it with its ball
  set to 126.
- **The form NPC:** party slot 0 poked to Lugia: to form 1 (stats recalculated), then back to form 0.
- **Skip round 1** at White 4: No started at place 1; Yes gave 6 picks through the chooser (6 buffs held), 250 Dust,
  and started at place 8 (round 2's first room) with 7 places skipped; a warp away at once gave no Shards.
- Not tested: the difficulty NPC beyond its line, touch input, the fog after a reboot (its byte is the saved block's).

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
  aren't used yet, but the pre-boss map is one.
- **Exits:** since step 5 each forward door leads to its own room, with a marker in front of it once the room is
  done.
- The Entralink is still reached only by the debug menu.
