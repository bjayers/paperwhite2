# NPC limits and spawning (research)

Research for the NPC spawn system (ROADMAP "NPC spawn system", conditions.md §10): why maps freeze on entry at
about 50 NPCs, what else limits NPCs, and how to get more NPCs and more variety. Written 2026-10-30 from the code
and the data of this checkout; nothing was built or run in game.

**Verified** means read in the C (decompiled and matching, so it is the ROM's behavior) or the disassembly, or
computed from the packed archives. **Inferred** means reasoned from that, not observed in game.

## 1. Summary

- **The freeze is the zone events buffer.** `LoadZoneEntities` reads a zone's whole entities file (`a/1/2/6`) into
  a fixed buffer inside `EventData` of **0x984 = 2436 bytes**, with no size check. Each NPC record is 36 bytes. A
  larger file writes past the end of `EventData`'s heap block, into the next block, which is very likely the archive
  handle that is doing the read. (verified: buffer, missing check, sizes; inferred: the neighbor and the freeze)
- The limit is bytes, not NPCs, which explains each symptom. The background events, warps, triggers and init
  scripts share the 2436 bytes, so the NPC ceiling varies by map: 40 in Castelia City, 53 in Aspertia, 57 in Virbank,
  58 on Route 20, 62 on Route 19. It doesn't track how big or busy a map is, and the follower isn't a record, so
  it doesn't change the ceiling.
- **Hidden NPCs count fully.** A record whose spawn flag hides it is still read into the buffer. It costs no actor,
  material or save slot.
- Today every shipped map fits. Route 20 is at 2400 of 2436 bytes, one NPC from the edge. The original game's
  largest file is Pokéstar Studios at 2396, so the buffer was evidently sized to the original's data.
- The other limits (64 actors, 32 cached sprite codes, 64 texture materials, 128 billboard handles) are far from
  the user's maps today: no zone shows more than 37 NPCs or 24 distinct sprites at once.
- **Recommendation:** first confirm the cause with a padding test (§6). Then guard the limit and enlarge the buffer
  (phase 1). Port script 10852 to slot records that the conditions engine rewrites at zone load (phase 2). Add
  runtime spawn points for ambient Pokémon and people outside the event file (phase 3).

## 2. Zone entry, step by step (verified)

Map change (`FieldMapControl_InitSpawn`, `src/ov035/event_mapchange.c`) and seamless zone change
(`Field_SwapZoneByMatrix`, `src/ov036/fieldmap.c`) run the same sequence:

1. `EventData_Reset`, then `EventData_LoadEntities` / `LoadZoneEntities` (`src/ov012/eventdata_system.c`): the
   whole entities file is read with `GFL_ArcToolReadRange(entityArc, fileId, 0, size, &data->initScriptOffset)`.
   The pointers `entities`, `npcs`, `warps`, `triggers` and `initScript` point into that copy, and the counts are
   its four `u8`s. Records: `ZoneBGEntity` 0x14, `ZoneNPC` 0x24, `ZoneWarp` 0x14, `ZoneTrigger` 0x16, from the
   disassembly's multipliers and `tools/data/event_data.py`'s structs. File layout: `u32` init-script offset, 4
   counts, the records, then the init script table.
2. `FieldScript_CallOnZoneInit(gsys, 4)` (`src/ov012/script_sys.c`): `Conditions_OnZoneInit` (the hack's hook),
   then the type-2 init scripts, where 10852 and Virbank's `ObjInitNPCGPos` run. They change flags and **the loaded
   records themselves**: `ObjInitNPCGPos` calls `SetZoneNPCLocation`, which rewrites a record's position and
   direction by its index in the file and refuses rail NPCs. `SetZoneNPCMdlID` and `SetZoneNPCSCRID` also exist;
   only the PWT (`src/ov012/scrcmd_stadium.c`) uses them, to retarget records.
3. `SpawnAllZoneNPCs` (`src/ov012/field_actor.c`): for each record, it creates an actor with
   `CreateNewActorByEntity` when `scrId == 0xffff` or its spawn flag is clear. A hidden record is skipped here, so it
   costs nothing from here on.
4. `CreateNewActorByEntity` takes `GetPtrToFirstFreeActorSlot` and does **not** check it for NULL. It loads the
   config, resolves `OBJ_CODE_WORK_00..0F` from work variables (`GetWKOBJCODENPCOBJCODE`: 16 codes whose sprite a
   script sets) and creates the draw object. Sprites load asynchronously (`src/ov036/field_actor_billboard.c`).

On a continued game, the actors come back from the save (`ActorSave_Load`, `src/system/game_data.c`) rather than
from the records, and there is no zone init.

## 3. The limits

| Limit | Size | Where (verified) | What it counts | Over the limit |
| --- | --- | --- | --- | --- |
| Zone entities buffer | **2436 bytes** (`sizeof(EventData)` 0xaa8, read at +0x124; `u32` + `cache[0x880]` + `rest[0x100]`) | `LoadZoneEntities`, `include/field/event_data.h` | every record, hidden or not, plus the init scripts | silent heap overflow (§4) |
| Records per type | 255 | `u8` counts | records | the packer fails (`bytes()`) |
| Field actors | **64** | `FldActSys_Create(heapId, 64, …)` in `GameData_Create`, `sizeof(FieldActor)` 0x100 | live actors: shown NPCs, the player, the follower, script-added ones | `GetPtrToFirstFreeActorSlot` returns NULL, and `CreateNewActorByEntity` writes through it. Inferred: memory corruption near address 0, a crash or freeze |
| Actor save entries | 64 (`FIELD_ACTOR_SAVE_COUNT`) | `ActorSave_Save` | live actors only | tied to the pool |
| Actor tasks | 64 | `GFL_TCBMgrCreate(actorCapacity)` | live actors | tied to the pool |
| Sprite material cache | **32 object codes** | `FldActSys_InitBillboardActor(…, 0x20)` in `Field_InitActorSystem` | distinct object codes with a loaded sprite, plus the hero's and the zone config cache's preloads | `FldBillboardActor_RegistCachedMat` silently drops the entry. The pending actor never finds its material, so it is never shown. Each later actor of that code asks for another load, which leaks materials toward the next limit (inferred from the code) |
| Async read queue | 32 | `loader->readCount = count` | object codes waiting to load | `FldBillboardActor_ReqAsyncLoad` silently drops the request |
| Texture materials | **64** | `BillboardActorSys_Create(0x40, 0x80, …)`, `FieldG3D_Init` | one per loaded object code, as NPC sprites load (`mode -1`, a texture shared by all actors of the code) | `BillboardActorSys_ExecMatLoadRequests` / `BillboardActorSys_AddTexMat` don't check `AREAMAN_FAIL` and write before the table (already marked `// BUG:` in `src/gfl/billboard_act.c`): heap corruption |
| Billboard handles | 128 | same | one per drawn actor, plus one per reflection (`fldeff_reflect.c` uses `FldBillboardActor_AddActorPosOrReserve`) | returns `BILLBOARD_ACTOR_NONE`, which later calls index out of bounds. 2 × 64, so actors plus their reflections fit |
| Texture VRAM | not measured | `GFL_G3DResUploadTexData` | one sprite atlas per object code, beside the map's textures | the upload fails and the material is `-1`. Its budget needs a runtime measurement |

Not limits: `SpawnAllZoneNPCs` is a plain loop, the init script table is read in place, and 10852's flag loop costs
nothing that matters. The per-zone config cache (`LoadMModelSystemInfoCache`, 24 zones of the original) only
preloads.

**What a hidden NPC costs:** its 36 bytes in the buffer, and nothing else. It gets no actor, task, material or save
entry until a script shows it. (verified)

## 4. The freeze

**Verified:**

- `EventData` is one block of 0xaa8 bytes (`EventData_Create`'s literal), allocated in `GameData_Create` on
  `HEAPID_GAMESYSTEM`, a 0xc000-byte child heap (`src/system/game_system.c`).
- The entities file is read into its last 0x984 bytes with no length check.
- Right after `EventData` in the same function come the three `ArcTool` handles: entities (0x7e), encounters (0x7f)
  and 0x38. Each allocation is preceded by a 0x10-byte NNS expanded-heap block header and a 0x1c-byte
  `HeapBlockHeader` (`src/gfl/heapsys.c`). The `ArcTool` starts with its `FSFile`, and its NARC offsets and file
  count follow (`src/gfl/arc_tool.c`).

**Inferred:**

- The heap fills in order at boot, so the block after `EventData` is the entities `ArcTool`.
- Then the first 0x10 bytes of overflow hit its NNS header and the next 0x1c its GFL header. These are harmless
  until that block is freed, which happens only when `GameData` is freed.
- From **0x2c bytes over (a file of 2480 bytes or more)**, the read overwrites the `FSFile` that is performing it.
  `FS_ReadFile` keeps its command state and wait queue in that struct, so the read most plausibly never completes:
  a freeze on entry.
- A file between 2437 and 2479 bytes may enter fine and fail later (on the next zone's read through the damaged
  handle, or on quitting to the title). This would explain "roughly" 50.

**The data:** `tools/data/event_data.py pack` has no size check. The headroom of the user's busiest zones, from the
built `build/w2_us/files/a/1/2/6`, which is identical to `extract/pw2_v021`'s:

| Zone | File bytes | NPCs | BG / warps / triggers | Free bytes | NPC ceiling |
| --- | --- | --- | --- | --- | --- |
| route_20 | 2400 | 57 | 4 / 2 / 9 | 36 | 58 |
| pokestar_studios (original) | 2396 | 38 | 46 / 3 / 0 | 40 | 39 |
| route_19 | 2184 | 55 | 5 / 1 / 3 | 252 | 62 |
| castelia_city | 2168 | 33 | 23 / 20 / 4 | 268 | 40 |
| route_23 (original) | 2084 | 39 | 27 / 4 / 2 | 352 | 48 |
| floccesy_ranch_2 | 2076 | 51 | 3 / 1 / 6 | 360 | 61 |
| virbank_city | 2036 | 46 | 4 / 8 / 5 | 400 | 57 |
| aspertia_city | 2006 | 42 | 5 / 7 / 9 | 430 | 53 |
| virbank_complex_2 | 1652 | 43 | 3 / 1 / 0 | 784 | 64 |
| floccesy_town | 1488 | 32 | 3 / 5 / 6 | 948 | 58 |

The ceiling is the NPC count at which the file reaches 2436 bytes. The freeze proper is expected 1 or 2 NPCs
past it. Castelia's other zones and the Pokémon Centers are all under 640 bytes.

**Actors and materials don't explain it.** With script 10852's worst case (every rare slot shown, night, every
story-flagged NPC counted as shown), the most NPCs shown at once is 37 (route_20, virbank_city). The most distinct
object codes among them is 24 (route_20). Both are well under 64 actors and 32 cached codes. Distinct codes over all
records (33 on Route 20) don't matter, since hidden records load no sprite.

## 5. Options

### A. Guard the limit and enlarge the buffer (low cost, fixes the freeze)

- **Pack-time check:** `event_data.py pack` fails when a zone's file exceeds the buffer, and names the zone and
  bytes over. The editor can show the same budget per zone.
- **Runtime guard:** under `PAPERWHITE2`, `LoadZoneEntities` asserts, or reads at most the buffer's size.
- **A larger buffer:** under `PAPERWHITE2`, grow `EventData`'s tail, or allocate the buffer once at
  `EventData_Create`, sized by a constant the packer generates: the largest file plus a margin. Each 36 bytes buys
  one NPC per map, so 2 KB buys about 56. Nothing else reads past `cache` or relies on `sizeof(EventData)`
  (verified in the C: the only uses are in `eventdata_system.c`; code that is still only assembly wasn't
  searched).
- **Cost:** the bytes come from `HEAPID_GAMESYSTEM` (48 KB, free space unknown: measure with
  `GFL_HeapGetFreeSize(HEAPID_GAMESYSTEM)` in the debug menu). If it is short, allocate from `HEAPID_USER`'s tail
  once at boot. That costs the main arena budget, 155 KB left on a DS (`build/w2_us/memory.txt`).
- **Risk:** low. It doesn't change the actor, material or save limits, so a map can now hold more hidden duplicates
  than it can show, and more shown NPCs reach the 64-actor limit sooner.

### B. Skip hidden records at load (not recommended)

Compacting the NPC array after the read doesn't help, because the read already overflowed; it would have to stream
the records one by one. It also breaks scripts. `SpawnZoneNPCByUID` (a script's show NPC) searches the records by
uid after a flag is cleared, and `ObjInitNPCGPos` and `SetZoneNPC*` address records by index. Every dropped record
would shift both. A is simpler and keeps all of that working.

### C. Slot records rewritten at zone load (the port of 10852)

Each spawn slot is one record in the event file. At `Conditions_OnZoneInit`, which runs after the records are loaded
and before the init scripts and `SpawnAllZoneNPCs`, the conditions engine picks each group's slot and variant. It
writes the variant into the record: model, move code, event type, script, direction, params and position, through
`SetZoneNPCMdlID`, `SetZoneNPCSCRID` and `SetZoneNPCLocation`, plus new setters for the move code, event type and
rail position. An unpicked slot's record gets a flag that is always set.

- **Fit:**
  - 10852's duplicates become variants. Night replacements and Virbank's night positions are a variant with
    another model or position, which conditions.md §7 wanted ("if the spawn format allows a position override").
  - Coupled or independent picks per zone are the engine's seed keys.
  - Re-evaluating on a period change rewrites the record, then deletes and re-adds the actor by uid while it is
    off-screen.
- **Bytes saved** (the records 10852 manages, against the most it shows at once, from §4's simulation):

  | Zone | Records 10852 manages | Most shown at once | Saved |
  | --- | --- | --- | --- |
  | route_19 | 47 | 13 | about 1224 bytes |
  | floccesy_ranch_2 | 36 | 11 | about 900 bytes |
  | route_20 | 35 | 15 | about 720 bytes |
  | virbank_complex_2 | 28 | 12 | about 576 bytes |
  | aspertia_city | 28 | 14 | about 504 bytes |
  | floccesy_town | 23 | 12 | about 396 bytes |
  | virbank_city | 18 | 9 | about 324 bytes |
  | castelia_city | 17 | 9 | about 288 bytes |

  A slot that a `pick: all` group fills with several NPCs needs one record per NPC, so these are approximate.
- **Cost:** moderate. It needs a converter from each map's records (conditions.md §7's), the setters and the hook.
  The converter must renumber the record indices that `ObjInitNPCGPos` uses: 51 uses in 10 scripts, Virbank's
  among them.
- **Risk:** low. Spawning, talking, saving and continuing are the game's own paths. Rails need the rail position
  setter, since `SetZoneNPCLocation` refuses rail NPCs, and Castelia is on rails.

### D. Runtime spawn points (ambient Pokémon and people)

Each zone gets a list of spawn points in a new archive member: x, z, height, direction, a rail position where
needed, and tags (tree top, streetlight, water edge). At zone entry the engine fills a few of them:

- **The sprite** comes from a pool, or from the zone's encounters (`EventData`'s `encData`, loaded on the same entry;
  the habitat data for ambient Pokémon) through the walking Pokémon's codes (`OBJ_CODE_POKEMON_*`, table
  `a/2/0/8`) or the followers' `OBJ_CODE_FOLLOWER_*`.
- **The movement and direction** come from the point's tags.
- **The actor** is created at runtime from a `ZoneNPC` built in C. The follower does this
  (`paperwhite2_following_field.c`): it checks `actorCapacity` and `GFL_HeapGetFreeSize` first, then calls
  `CreateNewActorByParam` and checks the result.

Fit and costs:

- **Fit:** it costs no event-file bytes and gives the most variety.
- **Actors:** live actors only. Keep a per-zone budget, for example ambient ones at most 8, and the total under 64
  with room for script-added NPCs.
- **Materials:** each distinct species is one cache entry of 32, one material of 64 and one sprite atlas in texture
  VRAM. Cap distinct ambient codes per zone (for example 4) and prefer codes the zone already shows.
- **Hooks:** after `CallSpawnAllZoneNPCs` (map change) and `Field_HotswapSpawnActors` (seamless). `DeleteAllActors`
  removes them with the zone's NPCs, except actors flagged 0x20, the follower's keep-zone flag.
- **Saving and continuing:** the actors are saved and restored like any other, so on continue they come back
  without a zone init and the picks hold.
- **Uids:** reserve a range that no script or zone uses, as the follower reserves its own.
- **Cost:** high. It needs the points format and editor support, a selection that respects the 64-actor and
  32-code budgets, and talk scripts for ambient Pokémon (a cry, a shared script by species).
- **Risk:** moderate. It goes through the same creation path as the follower, which already works.

### E. Moving NPCs (as Virbank does)

`ObjInitNPCGPos` in an init script already moves a record before it spawns, for free, on the grid only. In C this
becomes a variant's position override (C). It covers "same NPC, other place by time". It doesn't add NPCs, but it
avoids duplicates. Moving an NPC while the player is in the zone needs the actor itself moved (delete and re-add
off-screen), the same as C's re-evaluation.

### F. Scenery billboards without an actor

`FldBillboardActor_AddActorPosOrReserve` draws a billboard at a position with no `FieldActor`, as reflections do.
It costs a handle (128, shared with reflections) and a material, but no actor, task or save entry. There is no
collision, script or movement code: animation is the billboard's own animation set, and anything more (paths,
culling) is new code. It doesn't survive the field being torn down for a battle or a menu, so it must be recreated
at field init (`Field_InitActorSystem`). It suits birds on a roof or the ROADMAP's flight paths. Medium cost, later.

### G. Raise the pools and share materials (not needed now)

- **Actors:** each one is 0x100 bytes in the 48 KB `HEAPID_GAMESYSTEM`. The save block has exactly 64 entries, so
  raising the pool changes the save format. High risk for no current need.
- **Materials:** the cache (32) and materials (64) live in the field heap and could rise cheaply, but texture VRAM
  is the real ceiling and is unmeasured.
- **Sharing:** the cache is keyed by object code (`config->uid`), so two codes that show the same `sprite.png`
  still load two materials. Sharing helps only by using the same code. The `OBJ_CODE_WORK_*` codes let one record's
  sprite be chosen by a variable, a cheap way to vary a record without the PWT's setter.

**Ranking:** A, then C, then D, then E (folded into C), F, B and G. A is the fix, C ports 10852 with fewer bytes,
and D is the variety.

## 6. Recommendation

**Phase 0: confirm the cause (an hour or so, in an emulator):**

1. **Padding, no NPCs.** `event_data.py` supports `"extra_padding"` after the init scripts. Give `route_20` 36, then
   44, 80 and 400 bytes of padding. The prediction: 36 (exactly 2436) works, 44 to 80 may enter and misbehave
   later, and 80 or more freezes on entry. A freeze with no new NPC proves the cause is bytes.
2. **Hidden NPCs.** Add 10 records with an always-set flag to a small map whose file stays under 2436 bytes: no
   freeze. Then push that map's file over 2480 bytes with hidden records only: a freeze, though nothing is shown.
3. **Optional:** in melonDS, a write watchpoint at `EventData + 0xaa8` (`GameData`'s `eventData`) catches the
   overflowing read. The debug menu can show the zone's file size against 2436 and
   `GFL_HeapGetFreeSize(HEAPID_GAMESYSTEM)`.
4. **Optional, to know the next limit:** a debug test zone that shows 60 or more visible NPCs (a script adding
   actors) under the byte limit. This finds the 64-actor failure and records its symptom.

**Phase 1: guard and raise.** Add the packer's size check (and expose the budget to the editor), the runtime
guard, and a buffer sized by the generated maximum (A). This ends the freeze class and makes the budget visible.

**Phase 2: the spawn groups on slot records (C).** Generate the slots from the existing records with conditions.md
§7's converter and equivalence check. Rewrite the records at `Conditions_OnZoneInit`. Remove the 10852 calls and the
`0x401f` writes, renumber the `ObjInitNPCGPos` indices, and release flags 500–599 after `flag_usage.py`. Coupled or
independent picks are per zone, by seed key. Re-evaluate on a period change off-screen, so Virbank's Murkrow leave
at dawn.

**Phase 3: spawn points (D)**, ambient Pokémon from the habitats first, with per-zone budgets of actors and distinct
codes enforced by the engine and the editor. Later come the visual-only billboards and flight paths (F).

## 7. Open points

- What really follows `EventData` in `HEAPID_GAMESYSTEM` at run time, and its free space. Phase 0, step 3 answers
  both.
- The texture VRAM free in the busiest maps, before raising the material counts or adding many distinct ambient
  species.
- Whether the 64-actor overflow freezes or corrupts silently (phase 0, step 4).

## 8. The planned spawn system (the user's idea, 2026-10-30)

Not built yet; the details are for later. This records the idea and the feasibility answer, so the encounter work
keeps what it needs.

**The idea.** In the map and NPC editor, the user makes an NPC once and gives it **instances**: each one where the
NPC may appear and when (any conditions-engine rule, so "spring and summer" is one rule, not one NPC per flag range
of 10852), with its own sprite (fixed, or taken from the area's current encounters, so one NPC serves for several
birds), movement code, direction, script, event type and so on. No predefined spawn flags. One NPC can have many
instances, but it is on one tile at a time.

**Feasible: yes**, as phase 3 (D) grown to replace slot records:

- **Storage:** the instances are in an archive of their own, read at zone entry into memory the hack allocates, so
  they cost nothing of the 2436-byte events buffer and their count has no practical cap.
- **Selection:** at zone entry the engine evaluates the zone's instances and picks at most one per NPC: the
  instances are alternatives, which gives "one tile at a time". Picks come from the engine's seeds, so the same day,
  period and zone give the same result. A day-keyed pick across zones also allows an NPC that is in one town of
  several each day, with no saved state.
- **Creation:** a live actor from a `ZoneNPC` built in C, as the follower is (`CreateNewActorByParam`, after checking
  the actor pool and the heap). The actor keeps its own script ID (`FieldActor.scrId`, verified), so talking works
  as for a placed NPC. A period change swaps or removes actors off-screen; save and continue restore them like any
  actor, with a reserved uid range.
- **Fields:** conditions; position and direction (grid now; rails need the rail position, as the follower has);
  movement code and range; script and event type; trainers (their defeat is already tracked by trainer); a fixed
  sprite, or one from the zone's current encounters filtered by a tag or type, through the follower sprites.
- **Flags:** none for appearing. Lasting state (an NPC gone for good, a one-time gift) still needs a saved flag; the
  build should assign it from a free range, so the editor only asks "disappears once done".

**Constraints for the editor's budget checker** (the user expects never to need many NPCs on screen at once, but
wants a validator in the map/NPC editor):

- 64 live actors at once: the player, the follower, placed, script-added and spawned NPCs (§3).
- 32 distinct sprite codes and 64 texture materials at once; each distinct species from the encounters is one. The
  engine needs a per-zone cap on distinct codes, and the texture VRAM of the busiest maps is still unmeasured (§7).
- Two NPCs picking one tile: the engine reserves tiles as it picks, and the editor warns.
- Converted 10852 NPCs: the `ObjInitNPCGPos` record indices in scripts (§5 C). New NPCs don't use them.

**For the encounter work:** "a sprite from the current encounters" reads the new encounter data by zone, season and
time, so each encounter entry should be easy to query by species, type and tag.

Still worth doing first: phase 0's padding test and phase 1's guard (§6), for the placed NPCs.
