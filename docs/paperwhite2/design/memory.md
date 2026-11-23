# Field memory: the DS main arena and what the hack keeps in it (2026-11-21)

On a DS the main arena, where the game makes its heaps, begins at the end of the highest overlay in main RAM and ends
at 0x023e0000; the game takes fixed heaps from it at boot (`tools/build/check_memory.py`, `build/w2_us/memory.txt`).
Every byte that ARM9 main or overlay 12 grows moves every overlay placed after them, so the arena's start, by the same
amount: in the hack's link the chain ARM9 → overlay 12 → ... → overlay 36 → ... ends at the arena, and each module of it
"grows 0x0 bytes before the arena moves". So a byte of code, data or BSS that the hack adds to ARM9 main or overlay 12
is a byte less of arena, whether or not the Entralink run is being played. Overlay 36 (the field) is in the same chain.

## The numbers

| Build | DS arena left after the heaps | Overlay 12 |
| --- | --- | --- |
| Before (the hub shop's commit, 19a999c525) | 0x4a00, 18,944 bytes (18.5 KB) | 0x2ba40 |
| After this change | 0x5e40, 24,128 bytes (23.6 KB) | 0x2a600 (−5,184) |
| The records' step 1 (prototype doc, "Records"), over 0x5ec0 / 0x2a580 before it | 0x5320, 21,280 bytes (20.8 KB) | 0x2b120 (+2,976) |
| The Entree's menu (prototype doc, "The Entree's menu"): overlay 143 only, +12 KB | 0x5320, unchanged | 0x2b120, unchanged |
| The ranks' rewards (prototype doc): ARM9 +64 bytes, overlay 12 +1.6 KB (the ranks moved from overlay 143, the hub's NPCs, fog, form and skip), overlay 36 +0.3 KB (the item shop) | 0x4b60, 19,296 bytes (18.8 KB) | 0x2b760 (+1,600) |
| Fair discovery and debug ranks (prototype doc): overlay 12 +384 bytes (the undiscovered weighting, the debug ranks); the Records page's counts in overlay 143 | 0x49e0, 18,912 bytes (18.5 KB) | 0x2b8e0 (+384) |
| Difficulty tiers (prototype doc, "Difficulty tiers"): overlay 12 +704 bytes (the tiers' tables, the tier NPC's words, the modifiers); ARM9 main unchanged (the run state's tier in its padding); overlay 143 +320 bytes | 0x4720, 18,208 bytes (17.8 KB) | 0x2bba0 (+704) |
| Overworld sheets on the battle palettes (follower-palette-remap.md section 9): overlay 36 +288 bytes (the slots read their battle palette, normal or shiny); no BSS | 0x4600, 17,920 bytes (17.5 KB) | 0x2bba0, unchanged |
| Icons on their battle palettes, phase 1 (icon-screens.md): ARM9 main +576 bytes (the icon palette API, `paperwhite2_icon_palettes.o`, with a 32-byte colour buffer in BSS); overlay 165 +32 bytes; ROM +0.95 MB in `a/0/0/7` (no RAM: the colours are read 32 bytes at a time) | 0x43c0, 17,344 bytes (16.9 KB) | 0x2bba0, unchanged |

The species' table also grew (the follower sprites let 597 species in instead of 523, and each row has a byte for the
female's sprite): kept in overlay 12 it would have cost 7.2 KB there, 2 KB more than before, so the arena would have
fallen to about 16.5 KB.

## The audit: the hack's objects in the modules that sit under the arena

Sizes from the hack build's map (`build/w2_us/arm9.o.xMAP`, the symbols of each `paperwhite2_*.o` summed by section),
before the move. Hooks inside original files (`#ifdef PAPERWHITE2`) aren't counted.

**ARM9 main**, 48.2 KB: code 18.3 KB, rodata 2.7 KB, data 0.2 KB, BSS 27.0 KB.

| Object | Size | What |
| --- | --- | --- |
| `paperwhite2_encounters.o` | 11.3 KB (BSS 8.1) | the wild encounters' runtime: `sBlock` 4 KB, `sOutbreaks` 1.8 KB, `sSpeciesOverworld` 1 KB, used in every field |
| `paperwhite2_crash_watch.o` | 7.3 KB (BSS 5.6) | the debug builds' crash report (`sCodeSums` 5.6 KB); `PAPERWHITE2_DEBUG_MENU` only |
| `paperwhite2_pokedex_save.o` | 5.6 KB (BSS 3.4) | the Pokédex's save (`sPalPadFriendList` 3.4 KB) |
| `paperwhite2_entralink_run_state.o` | 3.2 KB (BSS 2.9) | the run's state (`sRunState` 376 B) and its bag (`sRunBag` 2.5 KB) |
| `paperwhite2_entralink_run_party.o` | 3.2 KB (BSS 1.9) | the run's team (`sRunParty` 1.3 KB, `sSwaps` 512 B) |
| `paperwhite2_flag_watch.o` | 2.7 KB (BSS 2.0) | the debug menu's flag watch; `PAPERWHITE2_DEBUG_MENU` only |
| `paperwhite2_entralink_progress.o` | 2.4 KB (BSS 2.1) | the forest's original data for its old code (`sOldForest` 2.1 KB) |
| `paperwhite2_conditions.o` | 1.8 KB | the conditions' code |
| `paperwhite2_entralink_buffs.o` | 1.7 KB (rodata 0.9) | the buffs' values (`sValues` 856 B), read in battle |
| `paperwhite2_entralink_random_room.o` | 0.5 KB (BSS) | the random room made, kept through its battle |
| 22 others | 8.3 KB | under 1 KB each |

**Overlay 12** (the field's script commands), 53.5 KB: code 38.3 KB, rodata 14.5 KB, data 0.5 KB, BSS 0.2 KB.

| Object | Size | What |
| --- | --- | --- |
| `paperwhite2_entralink_run.o` | 13.1 KB (rodata 3.1) | the run's code and room tables (`sNpcs` 1.1 KB, `sEnemies` 650 B, `sClearings` 544 B, `sRooms` 280 B) |
| `paperwhite2_debug_commands.o` | 7.6 KB | the debug menu's commands; `PAPERWHITE2_DEBUG_MENU` only |
| `paperwhite2_entralink_random_rooms.o` | 7.2 KB (rodata 5.3) | random rooms: **the species' table, 5.2 KB, moved** |
| `paperwhite2_entralink_buff_offers.o` | 6.8 KB (rodata 2.6) | offers and the shops: `sBuffs` 1.9 KB, `sTeamMoves` 386 B, `sTeamAbilities` 98 B |
| `paperwhite2_wonder_trade.o` | 6.2 KB (rodata 2.9) | Wonder Trade: `sPreEvolutions` 1.4 KB, `sLeastLevels` 692 B, `sItems` 368 B |
| `paperwhite2_spawns.o` | 3.1 KB | the zones' NPC conditions |
| `paperwhite2_pokemon_center_commands.o` | 2.5 KB | the Pokémon Center's commands |
| `paperwhite2_entralink_reserve.o` | 1.6 KB | the Reserve Box |
| `paperwhite2_entralink_ambients.o` | 1.0 KB | room ambients |
| `paperwhite2_entralink_hub_shop.o` | 1.0 KB | the hub shop |
| 12 others | 3.4 KB | under 1 KB each |

**Overlay 36** (the field), 109.3 KB of the hack's: code 80.8 KB, BSS 26.6 KB (the follower's interactions 8.9 KB,
ambients 5.7 KB, the follower's field 4.6 KB, its dialogue 4.1 KB). The Following Pokémon runtime, out of this audit's
scope; `following-pokemon.md` has its memory.

## What moved: the random rooms' species table

`tools/paperwhite2/entralink_random.py archive` adds it to the model table's archive (a/0/4/7, `HACK_ARCHIVE_MEMBERS`
in `configure.py`) after the run's markers and item icons, as member `ENTRALINK_RANDOM_SPECIES_FILE` (59 today; the
header gives the number, and the tool refuses an archive whose member count isn't where the run's members end). 12
bytes a species (`EntralinkRandomSpecies`), 597 species, 7,164 bytes. `EntralinkRun_MakeRandomRoom` reads it into the
event heap's tail (`GFL_ArcSysReadHeapNew`, `HEAPID_GAMEEVENT`) as it makes a room, draws from it and frees it before
returning; the count is the member's length over the row's size.

- **Heap headroom** (py-desmume, the user's save copy): the event heap is 65,480 bytes, 65,464 free in the hub and in a
  room; at the draw, inside the map change's event and with the table allocated, 40,948 free (one block), so about
  48 KB were free before it. The field heap (1.2 MB) has about 375 KB free in a run room with markers and NPCs, and
  364 KB after a battle with the offer up: the table doesn't use it.
- **Cost:** about 60 bytes of code; a read of 7 KB from the card as a random room is entered (well under a frame's
  worth of the map change's own loading).

## Candidates left

| Candidate | Size | How | Why not now |
| --- | --- | --- | --- |
| The debug tooling (`crash_watch`, `flag_watch`, `vram_stats` in main, `debug_commands` in overlay 12, the hooks) | about 18 KB | a release build without `PAPERWHITE2_DEBUG_MENU` (configure.py's line) | the user's testing tools; a release decision |
| Wonder Trade's `sPreEvolutions` and `sLeastLevels` (overlay 12) | 2.0 KB | an archive member read a few bytes at a time (`GFL_ArcSysReadRange`, no heap) in `WonderTrade_Plan` | a/0/4/7's member tool is the random rooms'; another archive, or `HACK_ARCHIVE_MEMBERS` taking a chain of tools, is a design call; the next one to do |
| The run's RAM in main: `sRunBag` 2.5 KB, `sRunParty` 1.3 KB, `sSwaps` 0.5 KB, `sOldForest` 2.1 KB, `sRunState` 0.4 KB, the random room 0.5 KB | 7.3 KB BSS | a heap allocation for a run's length | it must outlive battles, field reloads and the save's writes; the event heap is per event, the field heap goes with the field at every battle; a heap that lasts (HEAPID_GAMESYSTEM) needs its headroom measured over a whole run, and any mistake loses the run |
| The run's room tables (`sNpcs`, `sEnemies`, `sClearings`, `sRooms`, `sBattles`, `sItems`) | 3.0 KB | members read for a run | read by pointer all through a run (`EntralinkRun_GetNpc` and the rest): a copy for the run would cost a heap the same, so only the 3 KB outside a run would come back |
| The buffs' catalogue `sBuffs` (overlay 12) | 1.9 KB | members | `EntralinkBuffs_GetBuff` hands out pointers to it to the offers, shops, viewer and text; same as the room tables |
| Team-aware offers' `sTeamMoves`, `sTeamAbilities` | 0.5 KB | a member read at the offer | small |
| Wild encounters' BSS in main (`sBlock`, `sOutbreaks`, `sSpeciesOverworld`) | 6.9 KB | | used in every field, not run-only |

## Risks avoided

- Nothing new on the field heap or in the battle's memory: the table is on the event heap's tail only inside the
  function that makes the room, freed before it returns (no other allocation of it outlives it), with 40 KB to spare.
- Nothing that is read by pointer across a run was moved (room tables, the buffs' catalogue, the run's state).
- The archive keeps every member's number: the table is appended after the run's members (followers 0-23, markers and
  icons from 24), and a/0/4/7's member 0 (the model table), which the game reads at offsets, is unchanged.
