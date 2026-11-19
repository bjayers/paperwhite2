# Following Pokémon: the port

The plan and the map for porting Pokeweb's Following Pokémon runtime (bjayers/pokeweb-serverless, pull request #1,
branch `pr-1`, commit 315ca50 "Show the follower's own ball type", `runtime/following-pokemon/`) from its five PMC DLLs
into this source, 1:1 with the user's ROM (`orig/paperwhite2_v0.21.nds`). Only the **base package** is ported: grounded
followers, L/R cycling, dialogue, emotes, effects, scene safety, walking-gap positioning, the Options row and the
battle opening, with the follower's own ball type. Riding and custom Surf (the "full" package: `surf.c`, `land.c`,
`land_speed.c`, `transition.c` and their `.s`, `FW_MOUNT`, `FW_ARCEUS_SURF`) are dropped. The work is on the branch
`following-port`. How hack code is added is `plugins.md`.

**Since 2026-11-05 (branch `follower-rebuild`)** the events part is rebuilt: the follower waits through every event and
is recalled only when one needs its place, no event or input waits for it, and the scene policy's lists are gone
(`design/following-rewrite.md`). The rows below marked "removed" or "changed" say what of the port that undid; the
rest of this file describes the port as it was built.

## The installed runtime

The ROM has the base package of version "1.0.0" (`following/install.json`: profile `stock`, variant `base`,
dialogue animations and tile bounds on) in `patches/PokewebFollowing{Field,Events,Core,Options,Battle}W2.dll`,
which NitroKernel loads with their overlays. The repository's bundled DLLs (`src/assets/following/`, version
0.6.93-alpha) are older and differ from the installed ones in size and content; the installed ones are a build of
pull request #1's sources (`build.py`, stock profile, `FOLLOWING_VARIANT=base`).

**DLL comparison.** `build.py` needs ARM's GNU toolchain 14.2.rel1 (macOS) and CTRMap's `RPMTool` (Java), which this
machine lacks (no Java in WSL). The sources were compiled with Ubuntu's `arm-none-eabi-gcc` 14.2.1 20241119 and
`build.py`'s exact flags (`-mthumb -mcpu=arm946e-s -Os -std=c11 -fno-jump-tables -ffreestanding -fvisibility=hidden
-fno-builtin ... -DFW_STOCK=1`), the modules linked with `ld -r` as `build.py` does, and each ELF section compared
with the DLL's code image (`read_module` of `verify_packaged.py`), relocated words masked:

| Module | DLL image | ELF `.text` | Data sections | Code |
| --- | --- | --- | --- | --- |
| Core | 0x344 + 0x1c bss | 0x2b4 (DLL 0x2b0) | `.rodata` 0x18 and `.data` 0x7c equal | same functions, other register allocation |
| Options | 0x7b0 + 0x28 bss | 0x788 (DLL 0x774) | `.rodata` 0x20 and strings 0x1a equal | the same |
| Battle | 0x16c | 0x16c (DLL 0x16c) | none | same size, 124 bytes differ: register allocation and scheduling |
| Events | 0x528 + 0x1c bss | 0x4f8 (DLL 0x4f4) | `.rodata` 0x34 equal | the same |
| Field | 0xf9f8 + 0x4e68 bss | 0xe364 (DLL 0xe0d8) | `.rodata` 0x1348, strings 0x12b, `.data` 0x4ac equal | the same, 0x28c bytes smaller in the DLL |

So every data byte is pull request #1's and the code is its sources' through another build of the compiler (the
first function, `PokewebFollowingPublish`, is the same instructions with other registers). The installed Core,
Events, Options and Battle DLLs have the SHA-256s that `install.json` records; the installed Field DLL
(`f15966b8...`) differs from its `moduleSha256` (`f5d5e93e...`), so it was replaced after the install, by a
`build.py --publish-only` build installed by hand (README: "for a build that is already installed on a ROM by hand"),
which the ball type commit's data in it confirms. A byte-for-byte rebuild needs ARM's macOS toolchain and CTRMap; the
port doesn't need one, since it is C compiled by MWCC.

## Modules

| DLL | Sources (base) | Loaded with | Port to |
| --- | --- | --- | --- |
| Core (resident) | `core.c`, `object_codes.c`, `resident_events.c`, `core.s`, `resident_events.s` | ARM9 main and overlay 12 | `src/paperwhite2/main/` (small: object code lookup, event forwarding, transition tokens) |
| Field | `field.c`, `registry.c`, `effects.c`, `following.c`, `reactions.c`, `interaction.c`, `gifts.c`, `scene.c`, `render.c`, `render_math.c`, `positioning.c`, `field.s`, `field-input.s` | overlay 36 | `src/paperwhite2/ov036/` |
| Events | `events.c`, `events.s` | overlay 12 (the field actors) | `src/paperwhite2/ov012/` |
| Options | `options.c`, `options.s` | overlay 140 (the Options menu) | `src/paperwhite2/ov140/` |
| Battle | `battle.c`, `battle.s` | overlay 167 (the battle's view sequences, with 168) | `src/paperwhite2/ov167/` |

The headers (`following.h`, `native.h`, `field_layout.h`, `registry.h`, `positioning.h`, `render.h`,
`render_math.h`, `scene.h`, `scene-policy.h` generated from `event-policy.json` and `audio-event-policy.json`,
`effects.h`, `effects_assets.h`, `ball_assets.h`, `events.h`, `interaction.h`, `reactions.h`, `gifts.h`,
`resident_events.h`, `core_api.h`, `battle-entry.h`) go in `include/paperwhite2/` with the decomp's types.

Between modules the DLLs talk through tables (`FollowingCoreAPI`, `FwcApi`, the events bridge with its ABI) because
each is loaded and unloaded on its own and checked by version. Ported, a call is a plain call: the ABI numbers, size
fields and the checks that the other module is the expected build go. Code in an overlay that is called from another
overlay must be in a module loaded at that time (the core's functions are in main for that reason).

## Hooks

Every hook is in a complete decomp file, so each becomes an `#ifdef PAPERWHITE2` edit there. `FULL_COPY` replaces the
function's first instructions with a jump to the handler (a whole-function replacement, the handler calling the rest
of the original where `.s` has a continuation); `THUMB_BRANCH_LINK` replaces one call.

| Id | White 2 address | Decomp function (file) | Call or code replaced | Handler | What it does |
| --- | --- | --- | --- | --- | --- |
| object-code-lookup | `0x0200fe34` | `GetIndexOfObjID` (`src/system/field_actor_savedata.c`) | whole function | `PokewebFollowingObjectRow` | maps object codes 0x3000 and up to table rows 1008 and up, as many as the registry has |
| descriptor-offset-width | ov012 `0x02167fb8` | `GetNPCMdlInfoForOBJCODE` +0xa0 (`src/ov012/field_actor.c`) | `row * 28 + 4` truncated to 16 bits | (inline) | keeps the table offset 32-bit, since rows past 2340 overflow a u16 |
| event-opcode-fetch | `0x02015970` | `VM_Run` +0x44 (`src/system/vm.c`) | `VM_Read16` | `FollowingResidentOpcode` | sees each script command's opcode, for the scene policy (keep the follower out or recall it). **Removed** in the rebuild |
| event-callback | `0x02016cf8` | `GameEvent_RunCallback` (`src/system/game_event.c`) | whole function | `FollowingResidentCallback` | forwards the callback and notes the running event. The port also held every event while the recall played; **changed** in the rebuild to only watch (`PaperWhite2_FollowingOnEvent`) |
| event-free | `0x02016d08` | `GameEvent_Free` (same) | prologue | `FollowingResidentFree` | drops tokens tied to an event, then the original |
| event-vm-free | `0x020158f8` | `VM_Free` (`src/system/vm.c`) | whole function | `FollowingResidentVmFree` | drops a script's token, then frees as the original. **Removed** in the rebuild |
| field-actor-update | ov036 `0x02180078` | `FieldRoutine_Run` +0xd4 (`src/ov036/fieldmap.c`) | `FldActSys_Update` | `FollowingUpdate` | the follower's frame: creates, moves, recalls it, then updates the actors. Ported: `PaperWhite2_FollowingUpdate` wraps `FldActSys_Update` (step 3) |
| field-follower-matcache | ov036 `0x0217fe88` | `FieldRoutine_MapSpawnFinish` +0x58 (same) | `FieldG3D_Update` | `FollowingPreloadFollower`, then the original | binds the follower's sprite while the map is spawned. Ported: `PaperWhite2_FollowingPreloadFollower(field, field->actorSystem)` before `FieldG3D_Update` (step 3) |
| field-unload | ov036 `0x021801e4` | `FieldRoutine_MapUnload` (same) | whole function | `FollowingUnload`, then the original | frees the follower before the field's actors. Ported: `PaperWhite2_FollowingUnload` at the function's start (step 3) |
| field-actor-billboard-draw | ov036 `0x0218119a` | `FieldRenderPhase2_Fieldmap` +0xaa (same) | `BillboardActorSys_Draw` (the actors) | `FollowingDraw` | the actors' pass with the follower's and player's depth corrections and map light. Ported: `PaperWhite2_FollowingDraw` in place of the call (step 3) |
| field-terrain-billboard-draw | ov036 `0x021811b0` | `FieldRenderPhase2_Fieldmap` +0xc0 (same) | `BillboardActorSys_Draw` (the grass at `field + 0xc8`) | `FollowingTerrainDraw` | grass over the follower's feet. Ported: `PaperWhite2_FollowingTerrainDraw` in place of the call (step 3) |
| field-billboard-draw | ov036 `0x0218122e` | `FieldRenderPhase2_Fieldmap` +0x13e (same) | `BillboardActorSys_Draw` (the effects) | `FollowingEffectsDraw` | the recall flash, ball and emote bubbles. Ported: `PaperWhite2_FollowingEffectsDraw` in place of the call: the engine's own submit (the follower's oval is the engine's, as every actor's), the silhouette's snapshot of the body, then `FollowingEffects_Draw` (step 4) |
| field-player-recall-direction-gate | ov036 `0x0219a610` | `FieldPlayer_GetMoveDirByKey` (`src/ov036/field_player.c`) | whole function | `FollowingPlayerMoveDir` | holds the D-pad while the follower is recalled. Ported: `PaperWhite2_FollowingHoldsPlayer` returns `PLAYER_DIR_NONE` first (step 3). **Removed** in the rebuild |
| follower-grid-event | ov036 `0x021818bc` | `FieldEventProvider_Grid` +0x20 (`src/ov036/fieldmap_event.c`) | `FieldEventProvider_Grid_CheckForEvent` | `FollowingGridEvents` | talking to the follower (A in front of it) when the field's events found none, and the scene's menu marker for a menu they opened (L/R is in the field's update in the base package). Ported: `PaperWhite2_FollowingGridEvent(gsys, field, event, &scriptCalled, menuOpened)` after the call; a talk counts as a script called, and `FollowingScene_MarkMenu` notes the menu (step 4) |
| follower-rail-event | ov036 `0x02181a6c` | `FieldEventProvider_NoGrid` +0x4 (same) | `FieldEventProvider_NoGrid_CheckForEvent` | `FollowingRailEvents` | the talk on rails, when the field's events found none. Ported: `PaperWhite2_FollowingRailEvent(gsys, field, event)` after the call (step 4) |
| event-actor-action-queued | ov012 `0x02166ecc` | `FldAct_SetAcmd` +0x4 (`src/ov012/field_actor.c`) | `SetNextActorAcmd` | `FollowingEventAction` | a script moving an actor: recall the follower if it is in the way. Ported: `PaperWhite2_FollowingOnActorAction` before `SetNextActorAcmd`, which it skips if the observer deleted the actor (the rest of the function goes on, as the original's) |
| event-actor-action-reset | ov012 `0x02166ef4` | `FldAct_SetLocalAcmd` +0x4 (same) | `SetNextActorAcmd` | `FollowingEventAction` | the same. Ported: the same in `FldAct_SetLocalAcmd` |
| event-actor-allocation | ov012 `0x02166836` | `CreateNewActorByEntity` +0x1e (same) | `GetPtrToFirstFreeActorSlot` | `FollowingEventAllocate` | a new actor on the follower's tile or slot. Ported: `PaperWhite2_FollowingOnActorAllocate(system, &entity)` before the call, with the stack copy of the entity, as `events.s` passed it |
| event-actor-position | ov012 `0x02167c0c` | `SetActorWPosAll` (same) | prologue | `FollowingEventPosition` | an actor placed on the follower. Ported: `PaperWhite2_FollowingOnActorPosition` at the start, returning if the observer deleted the actor |
| event-actor-delete | ov012 `0x02166980` | `DeleteActor` (same) | prologue | `FollowingEventDelete` | the follower deleted by someone else. Ported: `PaperWhite2_FollowingOnActorDelete` at the start, the same |
| event-actor-world-step | ov012 `0x02167348` | `SetActorWPosValue` (same) | whole function | `FollowingEventWorldStep` | an actor stepping onto the follower. Ported: `PaperWhite2_FollowingOnActorStep` before the write (a position notice while the move code isn't set up) |
| ambient-callback | ov012 `0x021671c8` | `FldAct_CallMoveProc` (same) | whole function | `FollowingAmbientUpdate` | NPCs' own movement around the follower. Ported: `PaperWhite2_FollowingBeginAmbient` and `EndAmbient` around the move code's update |
| ambient-grid-collision | ov012 `0x0215e538` | `CheckActorNewPosOtherActorCollision` (`src/ov012/field_actor_tool.c`) | whole function | `FollowingAmbientGrid` | NPCs don't walk into the follower. Ported: the original is the static `CheckOtherActorCollision`, wrapped by `PaperWhite2_FollowingCheckGridCollision` |
| ambient-rail-collision | ov036 `0x02195714` | `RailActor_CheckCollision` +0x6c (`src/ov036/field_actor_rail.c`) | `RailActor_CheckActorCollision` | `FollowingAmbientRail` | the same on rails. Ported: `PaperWhite2_FollowingCheckRailCollision(actor, to, RailActor_CheckActorCollision(actor, to))` |
| options-init | ov140 `0x0219d002` | `ConfigPanel_Init` +0x142 (`src/ov140/config_panel.c`) | `ConfigPanelScroll_Init` | `FollowingOptionsInit` | the sixth row, FOLLOWERS: ON/OFF. Ported: `PaperWhite2_FollowingOptionsInit`, which also takes the screen's font and messages (step 5) |
| options-exit | ov140 `0x0219d0b0` | `ConfigPanel_Exit` +0x28 (same) | `ConfigPanelScroll_Exit` | `FollowingOptionsExit` | frees the row. Ported: `PaperWhite2_FollowingOptionsExit` (step 5) |
| options-main | ov140 `0x0219eb6e` | `ConfigPanelSeq_Input` +0x66 (same) | `ConfigPanelScroll_Main` | `FollowingOptionsMain` | the row's input and drawing. Ported: `PaperWhite2_FollowingOptionsMain` (step 5) |
| options-select | ov140 `0x0219dd8a` | `ConfigPanelAppBar_Main` +0x22 (same) | `ConfigPanelScroll_GetCursor` | `FollowingOptionsSelect` | the cursor on the row. Ported: `PaperWhite2_FollowingOptionsGetCursor` (step 5) |
| options-compare-exit, -cancel | ov140 `0x0219ebec`, `0x0219ec22` | `ConfigPanelSeq_Input` +0xe4, +0x11a (same) | `ConfigPanelOptions_Equals` | `FollowingOptionsCompare` | a staged change counts as a change. Ported: `PaperWhite2_FollowingOptionsEquals` at both calls (step 5) |
| options-commit | ov140 `0x0219ee2e` | `ConfigPanelSeq_Save` +0x16 (same) | `ConfigPanelOptions_Apply` | `FollowingOptionsCommit` | stores the choice in Options bit 11. Ported: `PaperWhite2_FollowingOptionsApply`, into Config's `followersOff` (step 5) |
| battle-wild-opening | ov167 `0x021d12b4` | `BtlvScu_StartEncount` +0x1f0 (`src/ov167/btlv_scu.c`) | the wild intro's procedure pointer | `FollowingBattleWild` | a slot-1 follower already on the platform: no throw, send-out or "Go!". Ported: `BtlvScu_EncountFollowingWildSingle` in `btlv_scu.c` (step 6) |
| battle-trainer-opening | ov167 `0x021d12b8` | `BtlvScu_StartEncount` +0x1f4 (same) | the trainer intro's procedure pointer | `FollowingBattleTrainer` | the same in trainer battles. Ported: `BtlvScu_EncountFollowingTrainerSingle` (step 6) |

The full package's hooks (`surf-mount-draw`, `surf-entry-mount-draw`, `mounted-surf-*`, `land-mount-flat-step`) are
not ported.

### Game calls

The C calls the game by address (`CALL(0x..., type)`) and reads its structs by offset (`U32`, `PTR`, the `Actor` and
`ActorSystem` of `native.h`). Ported, each is the decomp's function and struct field. The addresses, resolved
against `config/w2_us/arm9` (Thumb addresses have bit 0 set):

| Address | Used by | Decomp |
| --- | --- | --- |
| `0x02000018` | render | (main RAM bound, not a call) |
| `0x02005cbd` | interaction | `GFL_SndIsLoadThreadRunning` (arm9) |
| `0x02006255` | effects, field, interaction, options | `GFL_SndSEPlay` (arm9) |
| `0x020069f5` | interaction | `PokeVoice_Play` (arm9) |
| `0x02006b5d` | interaction | `PokeVoice_AdjustSpeed` (arm9) |
| `0x02008239` | gifts | `BagSave_CheckAvailItemSpace` (arm9) |
| `0x02008269` | gifts | `BagSave_AddItem` (arm9) |
| `0x02008ddd` | field | `getTrainerDataBlkAddress` (arm9) |
| `0x020159e9` | events, resident_events | `VM_Read16` (arm9) |
| `0x02016cb5` | interaction | `GameEvent_Create` (arm9) |
| `0x02016d09` | interaction | `GameEvent_Free` (arm9) |
| `0x02017355` | gifts | `GameData_GetBag` (arm9) |
| `0x0201735d` | field, gifts, scene | `GameData_GetParty` (arm9) |
| `0x0201736d` | field | `GetGameDataPlayerInfo` (arm9) |
| `0x02019311` | scene | `ConvDirToRailDir` (arm9) |
| `0x0201937d` | scene | `EventFieldClose_Callback` (arm9) |
| `0x02019401` | scene | `EventFieldCloseKeepSound_Callback` (arm9) |
| `0x02019479` | scene | `EventFieldOpen_Callback` (arm9) |
| `0x0201958d` | scene | `EventFieldSubprocessCall_Callback` (arm9) |
| `0x02019655` | scene | `EventFieldSubprocessTransitionWithCallback_Callback+0x8` (arm9) |
| `0x0201ccc5` | gifts | `PML_PkmDecrypt` (arm9) |
| `0x0201cced` | gifts | `PML_PkmReEncrypt` (arm9) |
| `0x0201cd25` | field, gifts, scene | `PokeParty_GetParam` (arm9) |
| `0x0201cdd9` | field | `PokeParty_IsRare` (arm9) |
| `0x0201ed09` | gifts | `PML_CryptoRun` (arm9) |
| `0x0201eef1` | gifts | `PML_PkmGetParamBlockCore` (arm9) |
| `0x0201fe25` | field, gifts, scene | `PokeParty_GetPkmCount` (arm9) |
| `0x0201ff35` | field, gifts, scene | `PokeParty_GetPkm` (arm9) |
| `0x02021d29` | options | `GFL_TextRendererDrawToBitmap` (arm9) |
| `0x02039dc9` | effects | `GFL_HeapAllocateCore` (arm9) |
| `0x0203a279` | effects, events, resident_events | `GFL_HeapFree` (arm9) |
| `0x0203a2d5` | effects, field, interaction | `GFL_HeapGetFreeSize` (arm9) |
| `0x0203df29` | field, interaction | `GCTX_HIDGetPressedKeys` (arm9) |
| `0x0203df4d` | field, interaction | `GCTX_HIDGetHeldKeys` (arm9) |
| `0x02044cc5` | options | `GFL_BGSysSetBGEnabled` (arm9) |
| `0x02044ea1` | options | `GFL_BGSysGetBGOffsetY` (arm9) |
| `0x02045699` | options | `GFL_BGSysSetScrPaletteNo` (arm9) |
| `0x02045841` | options | `GFL_BGSysIsScrHeapExists` (arm9) |
| `0x02045ba9` | options | `GFL_BGSysQueueScrLoad` (arm9) |
| `0x02047169` | options | `GFL_BitmapFill` (arm9) |
| `0x020480ed` | options | `BmpWin_CreateDynamic` (arm9) |
| `0x0204823d` | options | `BmpWin_Free` (arm9) |
| `0x02048271` | options | `BmpWin_FlushChar` (arm9) |
| `0x02048299` | options | `BmpWin_FlushMap` (arm9) |
| `0x02048501` | options | `BmpWin_GetBGIndex` (arm9) |
| `0x02048521` | options | `BmpWin_GetBitmap` (arm9) |
| `0x0204855d` | interaction | `GFL_StrBufCreate` (arm9) |
| `0x02048591` | interaction, options | `GFL_StrBufFree` (arm9) |
| `0x02048641` | interaction | `GFL_StrBufLoadString` (arm9) |
| `0x020489b9` | options | `GFL_MsgDataLoadStrbufNew` (arm9) |
| `0x020493f1` | effects | `GFL_G3DSysReadFSResource` (arm9) |
| `0x02049431` | effects | `GFL_G3DResFree` (arm9) |
| `0x020494d9` | effects, field | `GFL_G3DResUploadTexData` (arm9) |
| `0x02049561` | effects | `GFL_G3DResFreeTexData` (arm9) |
| `0x0204961d` | effects | `GFL_G3DResUploadTexDataCore` (arm9) |
| `0x0204964d` | effects | `GFL_G3DResGetTexData` (arm9) |
| `0x0204974d` | effects | `GFL_G3DResGetTexPaletteData` (arm9) |
| `0x02049759` | effects | `GFL_G3DMdlCreate` (arm9) |
| `0x02049801` | effects | `GFL_G3DMdlFree` (arm9) |
| `0x02049839` | effects | `GFL_G3DAnmCreate` (arm9) |
| `0x020498b5` | effects | `GFL_G3DAnmFree` (arm9) |
| `0x020498e5` | effects | `GFL_G3DActorCreate` (arm9) |
| `0x02049961` | effects | `GFL_G3DActorFree` (arm9) |
| `0x020499a1` | effects | `GFL_G3DActorBindAnm` (arm9) |
| `0x02049a11` | effects | `GFL_G3DActorSetAnmFrame` (arm9) |
| `0x02049b89` | effects | `GFL_G3DSysDrawObj` (arm9) |
| `0x0204c06d` | options | `ClActor_Create` (arm9) |
| `0x0204c135` | options | `ClActor_Delete` (arm9) |
| `0x0204c16d` | options | `ClActor_SetSurfacePos` (arm9) |
| `0x0204c4e5` | options | `ClActor_ChangeSequence` (arm9) |
| `0x0204c54d` | options | `ClActor_SetAutoAnim` (arm9) |
| `0x0204e55d` | effects | `BillboardActorMaterial_BindTexture` (arm9) |
| `0x0204e599` | effects | `BillboardActorMaterial_Set` (arm9) |
| `0x0204ebdd` | effects, render | `BillboardActorScene_Draw` (arm9) |
| `0x0204f685` | render | `BillboardActorSys_Draw` (arm9) |
| `0x020652e5` | effects | `NNS_G3dPlttGetRequiredSize` (arm9) |
| `0x02070ca9` | effects, field, interaction, options, positioning | `FS_InitFile` (arm9) |
| `0x02070de1` | effects, field, interaction, options, positioning | `FS_CloseFile` (arm9) |
| `0x02070ded` | effects, field, interaction, options, positioning | `FS_GetFileLength` (arm9) |
| `0x02070e55` | field, positioning | `FS_SeekFile` (arm9) |
| `0x02070e6d` | effects, field, interaction, options, positioning | `FS_ReadFile` (arm9) |
| `0x02070ecd` | effects, field, interaction, options, positioning | `FS_OpenFile` (arm9) |
| `0x0207acb9` | render | `OS_IsRunOnTwl` (arm9) |
| `0x02141964` | effects | `g_G3DSystem` (arm9) |
| `0x02153821` | scene | `EventScriptCall_Callback` (ov012) |
| `0x02153ee1` | scene | `ScriptWork_GetEvent` (ov012) |
| `0x02154135` | scene | `EventFinishScriptSubEvents_Callback` (ov012) |
| `0x0215a8b5` | field, scene | `EventFieldMenu_Callback` (ov012) |
| `0x0215b54d` | field | `EventFieldAppCall_Callback` (ov012) |
| `0x0215e151` | field | `ActorTerrainEffect_Splash` (ov012) |
| `0x0215e3fd` | field | `ActorRouteCollCheckCore` (ov012) |
| `0x0215e4f1` | field, interaction | `ActorRouteCollCheckOneTileInDir` (ov012) |
| `0x0215e8e5` | field | `GetTileTypeAtPosByActor` (ov012) |
| `0x0215e909` | field, scene | `GetHeightFromMap` (ov012) |
| `0x021667b9` | field | `FldActSys_Update` (ov012) |
| `0x021668c1` | field | `CreateNewActorByParam` (ov012) |
| `0x02166981` | field | `DeleteActor` (ov012) |
| `0x02166fe5` | field, render | `GetMMSysG3DMapper` (ov012) |
| `0x02167099` | field, interaction | `SetActorFaceDir` (ov012) |
| `0x02167259` | events | `SetNextActorAcmd` (ov012) |
| `0x021676fd` | field | `FldAct_SetSplashed` (ov012) |
| `0x02167aad` | events | `GetPtrToFirstFreeActorSlot` (ov012) |
| `0x02167f19` | field | `GetNPCMdlInfoForOBJCODE` (ov012) |
| `0x021684fd` | scene | `EventWildBattleCall_Callback` (ov012) |
| `0x02168bed` | scene | `EventBattleCall_Callback` (ov012) |
| `0x0216a2b5` | field | `GameData_CheckPairFlag` (ov012) |
| `0x0216b578` | events | `EVCMD_TABLE` (ov012) |
| `0x0216e680` | scene | `g_ActiveFieldScriptSubEvents` (ov012) |
| `0x0217993d` | scene | `pcEntrySound` (ov033) |
| `0x02179a29` | scene | `func_ov033_021799e8` (ov033) (the PC) |
| `0x02179ac5` | scene | `pcLogOffSound` (ov033) |
| `0x021804d1` | interaction | `Field_GetMsgBGSys` (ov036) |
| `0x02180501` | interaction | `Field_GetHeapID` (ov036) |
| `0x0218054d` | field | `Field_GetFieldEffects` (ov036) |
| `0x02180579` | interaction | `Field_GetResolvedControllerTypeID` (ov036) |
| `0x0218130d` | field | `Field_IsEventRunning` (ov036) |
| `0x0218151d` | field | `FieldEventProvider_Grid_CheckForEvent` (ov036) |
| `0x02181aa1` | field | `FieldEventProvider_NoGrid_CheckForEvent` (ov036) |
| `0x021850ad` | field, render | `FieldG3DMapper_GetTerrainAll` (ov036) |
| `0x021887d9` | interaction | `ActorMsgWin_CheckAndCreate` (ov036) |
| `0x02188815` | interaction | `MsgBGPrinter_DeleteTalkWin` (ov036) |
| `0x02188835` | interaction | `MsgBGPrinter_WaitTalkWinClose` (ov036) |
| `0x02188859` | interaction | `MsgBGPrinter_ClearTalkWin` (ov036) |
| `0x021888c5` | interaction | `MsgBGPrinter_TalkWinMain` (ov036) |
| `0x02188a09` | interaction | `MsgBGPrinter_TalkWinDrawCursor` (ov036) |
| `0x0218b1a9` | field, scene | `EventFieldMenuReturn_Callback` (ov036) |
| `0x0219386d` | field | `FldActSys_LoadStaticBillboardActor` (ov036) |
| `0x02194d8d` | field | `RailActor_MapAttrGrassProc12` (ov036) |
| `0x02194df5` | field | `RailActor_EnsureShadow` (ov036) |
| `0x02194f19` | field | `FldAct_GetFieldEffects` (ov036) |
| `0x02195729` | field, interaction | `RailActor_GetHitBitsDirNoAttr` (ov036) |
| `0x021957a9` | events | `RailActor_CheckActorCollision` (ov036) |
| `0x0219a5d9` | interaction | `FieldPlayer_ForceBrake` (ov036) |
| `0x0219a6e1` | field | `FieldPlayer_GetActor` (ov036) |
| `0x0219a6f9` | field | `FieldPlayer_GetMoveObserveStatus` (ov036) |
| `0x0219a705` | field | `FieldPlayer_GetExState` (ov036) |
| `0x0219a9d1` | field, interaction | `FieldPlayer_GetWPosInDir` (ov036) |
| `0x0219aacd` | interaction | `FieldPlayer_GetGPosInFront` (ov036) |
| `0x0219b161` | field | `FieldPlayerCore_GetMoveDirByKey` (ov036) |
| `0x0219c785` | battle | `ViewPosToBattlePos` (ov167) |
| `0x0219d1c9` | battle | `PokeCon_GetPosMonInner` (ov167) |
| `0x0219db99` | options | `ConfigPanelMsg_Print` (ov140) |
| `0x0219e055` | options | `ConfigPanelScroll_Init` (ov140) |
| `0x0219e0d5` | options | `ConfigPanelScroll_Exit` (ov140) |
| `0x0219e0e1` | options | `ConfigPanelScroll_Main` (ov140) |
| `0x0219e8ed` | options | `ConfigPanelOptions_Apply` (ov140) |
| `0x021a3779` | field | `FieldEffects_GetAreaIsExterior` (ov036) |
| `0x021a419d` | render | `GrassTask_Init` (ov036) |
| `0x021a428d` | render | `GrassTask_Update` (ov036) |
| `0x021a7491` | scene | `EventPokeVoicePlay_Callback` (ov036) |
| `0x021a82fd` | scene | `ScrcmdMsgwin_YesNoEventMain` (ov036) |
| `0x021a83d5` | scene | `ListMenuEvent_Callback` (ov036) |
| `0x021aea39` | scene | `EventWaitCameraSetEvCamera_Callback` (ov036) |
| `0x021aea61` | scene | `EventFieldCameraWait_Callback` (ov036) |
| `0x021b0625` | events, scene | `FieldRailSystem_GetUnitScale` (ov036) |
| `0x021b0725` | events | `FieldRailSystem_GetLocationPos` (ov036) |
| `0x021b084d` | scene | `RailUnit_PredictNextPos` (ov036) |
| `0x021b08c1` | scene | `RailUnit_GetPreviousCalcPos` (ov036) |
| `0x021b0a15` | scene | `RailUnit_GetCalcPos` (ov036) |
| `0x021b0a25` | scene | `RailUnit_GetMoveDirection` (ov036) |
| `0x021b0acd` | scene | `RailUnit_RequestMove` (ov036) |
| `0x021b0af9` | scene | `RailUnit_UpdateMove` (ov036) |
| `0x021b0d9d` | scene | `FieldRailSystem_IsPosNear` (ov036) |
| `0x021bac81` | battle | `GetMonID` (ov167) |
| `0x021bb0a5` | battle | `BattleMon_GetViewSrcData` (ov167) |
| `0x021d1445` | battle | `BtlvScu_EncountWildSingle` (ov167) |
| `0x021d1639` | battle | `BtlvScu_EncountTrainerSingle` (ov167) |
| `0x021d37d9` | battle | `BtlvScuWinFade_Update` (ov167) |
| `0x021d39cd` | battle | `BtlvScuGauge_Show` (ov167) |
| `0x021df309` | battle | `BtlvEffect_Start` (ov168) |
| `0x021df829` | battle | `BtlvEffect_IsBusy` (ov168) |
| `0x021df85d` | battle | `BtlvEffect_AddPokemon` (ov168) |
| `0x023fff40` | render | (main RAM bound, not a call) |

`Actor` is the decomp's field actor (`include/field/field_actor.h`), `ActorSystem` its actor system, and the offsets
into `Field`, `FieldPlayer`, the game event and the options save block are their structs' fields; the port names each
from the decomp's headers, adding fields where they are still `unk`.

## Data

| File (`following/`) | Format | Read by | Where it lives |
| --- | --- | --- | --- |
| `a/0/4/7`, `a/0/4/8` (archives) | the model table and graphics (`field_actor_data.py`) | the game's actor code, through `GetIndexOfObjID` for codes from 0x3000 | `res/field/actors/followers/`, step 2, done |
| `runtime-registry.bin` (61,808 bytes) | "FWDB" version 3: a 32-byte header (version, ABI 1, size, 2,574 rows, 0 zones, 3,582 descriptors, 1,323 resources, code base 0x3000, 1,008 stock rows, inner CRC-32) and 24-byte rows sorted by `species * 2048 + form * 8 + sex * 2 + shiny`: species, form, sex (0 male, 1 female, 2 none), shiny, placeholder flag, table row, graphics member, size (32 or 64), animation profile, art X, sprite Y, Z, side gap (0-6), 8 zero bytes | `field.c` `config` (streamed in 1 KB pages by `registry.c` `fw_registry_stream`, building a per-species index), `model` (one species' rows) | generated from `res/field/actors/followers/` (row, member, size) plus a per-follower JSON of the rest (placeholder, profile, offsets, side gap), step 3 |
| `native.bin` (32 bytes) | "FWNT": enabled (the ROM-wide switch), format 2, the registry's size, the table's and graphics' counts, the registry's CRC-32 | `field.c` `config`, `options.c` (enabled only) | derived at build time; enabled from a JSON setting, step 3 |
| `positioning.narc` (30,972 bytes) | one member "FWPO" version 1: 24-byte header (2,574 land rows of 12 bytes, 0 Surf rows, the registry's CRC, payload CRC) and per row the up, down, left and right gaps (each `min(side gap + 6, 10 - abs(art X))` here) and 8 zero rider bytes; an optional member 1 of zone overrides (none) | `positioning.c` (header and one row per lookup) | the gaps in the per-follower JSON, packed with the registry, step 3. Since the rebuild the JSON has one `gap`, written four times: the runtime always took the largest |
| `interactions.bin` (3,852 bytes) | "FWTK" ABI 1: 34 rules, 12 motions, 27 messages (UCS-2 with 0xFFFF end, 0xFFFE newline, 0xFFF0 nickname, 0xFFF1 player), 7 bubbles, with emotes.narc's size and CRC | `interaction.c` `load` (whole, into an 8 KB buffer), `reactions.c` | `a/0/4/7` member 3, from `res/paperwhite2/following/interactions.json` (rules, motions, messages as text, bubbles; `interactions.schema.json`); the emotes' size and CRC computed from members 6-19, done |
| `emotes.narc` (10,076 bytes) | 14 BTX0 members (7 bubbles × 2 frames, 32×32, 16 colors), from HeartGold | `effects.c` (members), `interaction.c` (size and CRC) | `a/0/4/7` members 6-19 (bubble order, 2 frames each), from `res/paperwhite2/following/emotes/<bubble>_{1,2}.png` and `.pal`, packed with `nitro_btx.py` (`split_from`: the search nodes Pokeweb's ndspy split kept), done |
| `effects.narc` (3,052 bytes) | 3 members: the ball model (BMD0), the send-out flash (BMD0), its texture animation (BTA0), from HeartGold's `a/1/0/3` 129, 104, 164; size and CRC compiled in (`effects_assets.h`) | `effects.c` | `a/0/4/7` members 20-22, from `res/paperwhite2/following/effects/` (`ball.nsbmd`, `send_out_flash.nsbmd`, `.nsbta`), as they are, done |
| `ball_assets.h` (4,000 bytes, compiled in) | for each White 2 ball ID 1-25, its 16x16 4bpp texture (128 bytes) and 16 BGR555 colors, from Pokeweb's `ball-art/*.png` (`import_balls.py`) | `effects.c` (put over the ball model's texture and palette) | `a/0/4/7` member 23, from `res/paperwhite2/following/balls/<ball>.png`, done (step 4) |
| `contextual-dialogues.narc` (76 bytes) | one member "FWCD" ABI 1-3 (empty: 0 rules) | `interaction.c` (whole, 4 KB), `reactions.c` | replaced: `a/0/4/7` member 4 is the dialogue library "FWDL" (Dialogue rules, gifts and steps, below) |
| `contextual-items.narc` (76 bytes) | one member "FWTI" ABI 1-2 (empty) | `interaction.c`, `gifts.c` | replaced: `a/0/4/7` member 5 is the item pools "FWPL" (below) |
| `event-policy.json`, `audio-event-policy.json` (Pokeweb's sources, not ROM files; **removed** in the rebuild, with their generator) | the reviewed script commands (375 opcodes) and cleanup finishers that keep the follower, and the eight sound events | `generate_scene_policy.py` into `scene-policy.h` | `res/paperwhite2/following/`, as they are; `tools/paperwhite2/following_scene_policy.py` writes `following_scene_policy.h` (opcodes, finishers' mask) and `following_sound_policy.h` (the sound callbacks by name, from W2's `symbols.txt`) into `build/include/generated/paperwhite2/` in `--hack` builds, done (step 4) |
| `install.json` | the installer's state | nothing in the game | not ported |
| `a/0/0/2` member 32 (`title_2` bank) | the Options rows' text, four entries changed | the Options menu | `res/text/system/title_2.txt`: `Title2_Text_Followers` (6), `FollowersOn` (21), `FollowersOff` (22), `ChooseWhetherPokemonFollow` (30), done (step 5) |

The files are read by name (`rom:/following/...`, `FS_OpenFile`). dsd builds the file system from the extracted ROM's
`config.yaml` and path order, and adding new files there is not supported by the build yet (a file would take an ID),
so the port reads them as members of an archive instead: one new NARC would still be a new file, so the plan is to
put them as new last members of an existing archive the field already uses, or, where a file is small and only
code reads it (`native.bin`, the registry header values), to build its values into a generated header as
`season_preview.py` does. Decided per file in step 3.

## Memory

The DLLs' sizes, code and data: Field 0xf9f8 + 0x4e68 bss (84 KB), Events 0x528 + 0x1c, Core 0x344 + 0x1c, Options
0x7b0 + 0x28, Battle 0x16c. The runtime also allocates its buffers on the field's heaps (an 8 KB interactions buffer, a
4 KB dialogue page and a 1 KB registry page among them; see `MEMORY-AUDIT.md` there). With the hack's code so far,
overlay 36 can grow 0x7520 bytes before the DS arena moves, and the arena has 0x34880 (210 KB) after the heaps
(`build/w2_us/memory.txt`). The field module in overlay 36 takes the 0x7520 and about 55 KB of the 210 KB; MWCC's code
may be larger or smaller than GCC's. The Options module in overlay 140 and the battle's in 167 are below the highest
overlays of their groups or small.

Nothing may be placed at main RAM `0x020933d0`-`0x020934af`, which nds-bootstrap's IRDO anti-piracy fix overwrites on
hardware. In the current hack build that range is `.rodata` of `vman.o` (`sObjTileMappingBoundaries`,
`sVRAMBankSizes`), `wm_icon.o` (`sEmptyOam`) and `net_command.o` (`sBaseCommands`). The core's code in main moves it.

## Steps

1. This map. Done.
2. The followers' sprites and table entries as sources, with constants, packing the hack's `a/0/4/7` and `a/0/4/8`
   byte for byte. Done: see below.
3. The core and the field. Done but for the talk: see "Step 3" below. The first part made the game show the follower
   codes (object-code-lookup and descriptor-offset-width); the rest is a follower that appears and walks behind the
   player, switched with L and R.
4. Events, interactions, dialogues, emotes, effects: `resident_events.c`, `events.c`, `scene.c`, `effects.c`,
   `interaction.c`, `reactions.c`, `gifts.c`, the rest of `field.c`, their hooks and data. Done: see "Step 4" below.
5. Options and its text: `options.c`, the options hooks, `a/0/0/2`'s `title_2` changes.
6. Battle: `battle.c`, the two opening hooks.

### Step 2: the follower sprites

`tools/paperwhite2/import_followers.py extract/pw2_v021/files res/field/actors` wrote the 2,574 rows that the
installer added to `a/0/4/7` (rows 1,008-3,581, codes 0x3000-0x3a0d) as `res/field/actors/followers/<name>/`, and
their constants `OBJ_CODE_FOLLOWER_<SPECIES>[_FORM_<n>][_FEMALE][_SHINY]` into `generated/obj_codes.txt`, from the
registry's species, form, sex and shininess of each row (sex 0 and 2 have no suffix, as the walking Pokémon's
`OBJ_CODE_POKEMON_`). Of the 348 sprites the installer added (`a/0/4/8` members 975-1,322), each is in the directory
of the first row that shows it; the other rows name their sprite's code in `"sprite"`: 564 of the original walking
Pokémon's (`OBJ_CODE_POKEMON_...`) and the followers' own. `field_actor_data.py` gained:

- `"sprite"`: a sprite that shows another code's `sprite.png`, as `"model"` does for models;
- `"texture_set_format": "pokeweb"`: the texture set as the installer wrote it with ndspy (textures `following0` and
  on, palette `following`, the dictionaries without their search trees, no bit 31 in the size word);
- `"sprite_batch"`: the installer appended eight sprites later (Kyurem's White and Black forms, members 1,315-1,318,
  then the Blue-Striped Basculin's and Keldeo's Resolute Form's, 1,319-1,322), out of the rows' order; their batch
  numbers 1 and 2 keep their places.

Packed, `a/0/4/7` and `a/0/4/8` equal the hack ROM's byte for byte. The registry names rows and members by number,
so until step 3 generates it, changing which followers have their own sprite would move members under it.

### Step 3, first part: the follower codes in the game

`GetIndexOfObjID` (`src/system/field_actor_savedata.c`) maps `OBJ_CODE_FOLLOWER_BULBASAUR` to
`OBJ_CODE_FOLLOWER_GENESECT_FORM_4_SHINY` to the table's rows from 1,008 (0x3f0), as the core's
`PokewebFollowingObjectRow` does once the field has published the registry's row count; the count is the sources'
now, so it holds from boot and the registry isn't asked. `GetNPCMdlInfoForOBJCODE` (`src/ov012/field_actor.c`) keeps
the record's offset in the table 32-bit (the original's u16 wraps from row 2,341), which the core's
`descriptor-offset-width` patch did in the instructions. Main grew 0x20 bytes. To test: give an NPC in
`res/field/events/` the model `OBJ_CODE_FOLLOWER_PIKACHU` (row 1,104) and one past row 2,341, such as
`OBJ_CODE_FOLLOWER_SNIVY` or `OBJ_CODE_FOLLOWER_GENESECT`; both should walk with the follower's sprite.

### The registry and positioning

Each follower's `data.json` has a `"follower"` object (`field_actor.schema.json`): species, form, sex, shiny, the
placeholder flag, the animation profile (`mirrored` or `asymmetric`), the art's offsets, the side gap and the four
walking gaps. `import_followers.py` writes it from the hack's registry and `positioning.narc`. The table row, the
graphics member and the sprite's size aren't stored: the packer knows them.

**Placement.** The registry and the positioning table are new members of the model table's archive, `a/0/4/7`
(`ARCID_MMODEL_TBL`), which `field_actor_data.py` packs (with `tools/paperwhite2/following_data.py`) whenever an
object code has a follower: member 0 the table as before, member 1 the registry (`runtime-registry.bin`'s bytes),
member 2 the positioning table (`positioning.narc`'s member 0, "FWPO"). Packed, members 1 and 2 equal the hack's
files byte for byte. An archive member rather than generated C data, since the registry is 60 KB and the
positioning table 30 KB, which as data would take that from the memory budget for good, and the runtime reads them
a page or a row at a time (`GFL_ArcToolReadRange`, as `GetNPCMdlInfoForOBJCODE` reads the table). Rather than new
ROM files, which the build can't add. The game reads only member 0, at offsets in it, so the new members change
nothing for it. The rest of the runtime's data follows as members 3 to 23 (the Data table above), packed from
`res/paperwhite2/following/` by `tools/paperwhite2/following_assets.py`, whose docstring has their formats;
`import_following_assets.py` wrote the sources of members 3 to 22 from the hack's files, and all of them pack byte for
byte. Member 23, the balls' art, was in the runtime's code (`ball_assets.h`): its PNGs are Pokeweb's `ball-art/`, and
they pack to the same 4,000 bytes.

`native.bin` goes: its counts and the registry's CRC checked an installer's files against each other, which the
packer now writes together, and its "enabled" (the ROM-wide switch, 1 in the hack) becomes a constant of the port's
header in the field step.

### Step 3: the follower in the field

`src/paperwhite2/ov036/paperwhite2_following_field.c` (header `include/paperwhite2/following_field.h`) is `field.c`
without the talk: the follower's actor (uids 0xf0-0xf8, its own move code whose update walks the trail), the swap,
the side-by-side stand, the large follower's ball under a floor and indoors, the summon after a menu, a battle or
SELECT, L/R switching (it is in the field's update in the base package, not in the grid/rail event hooks), the
SELECT toggle of the Followers setting, the shadow and grass of its tiles, the registry and the positioning row read
through the field actors' open handle of `a/0/4/7`, the preload and the unload. `paperwhite2_following_render.c`
(`following_render.h`) is `render.c`: the actors' pass (registry Y, two pixels down, the pull over the oval, the
follower's own light, the strips of a 64-pixel body in front of a wall and the smaller split of a 32-pixel one), the grass pass, and the effect pose for step 4.
Its shadow pass is gone (below, after the second melonDS test).
native.bin's values: the enabled switch is `FOLLOWING_ENABLED`; the model table's row count is file 0's first u32
(3,582), the resources are `a/0/4/8`'s file count (1,323), both checked against the registry's header by its stream,
and the registry's outer CRC-32 is the positioning table's (`FollowingPositioning_ReadRegistryCrc`, the one other file
that records it; `0xf1693dee` in the hack). The core's publish and clear went with step 3's first part.

**Stubs for step 4** (`include/paperwhite2/following_hooks.h`, each `// TODO step 4:`, all gone with step 4): the ball effects
(`FollowingEffects_*`: no send-out and no recall, so the follower just appears and disappears; `IsAvailable` is TRUE
so L/R works; no cue, rest ball, warm or draw), the talk (`FollowingTalk_*`: never active), the scene policy
(`FollowingScene_*`: attach succeeds, `Poll` returns RECALLED while `GSYS_GetNowEvent` has an event, so any event
removes the follower and it walks in again after; no PC restore, menu or battle marker; `IsStepClear` is TRUE, so
NPCs don't recall the follower), and the events bridge (`FollowingEvents_Discard`). `FollowingRestore` is the
events' restore token's layout.

**Moved and renamed.** `struct GameEvent` moved, unchanged, from `src/system/game_event.c` to
`include/system/game_event.h` (the unload walks the menu's chain); `FieldEffectGrass`, `GrassTaskParams`, `GrassTask`
and `GRASS_KIND_COUNT` from `src/ov036/fldeff_grass.c` to `include/field/field_effect.h`, which now includes
`field/field_actor.h`. `FieldActor.unk5C` is `outerDrawOffset` (the accessors' name). `Config` gains `followersOff`
(bit 11) under `PAPERWHITE2`. New in original files, under `PAPERWHITE2`: `PaperWhite2_IsShakingGrassTask`
(fldeff_grass.c, the task check of the grass pass), `PaperWhite2_FldActEnsureShadow` and
`PaperWhite2_FldActEnterGrass` (field_actor_g3dobj.c, the static `RailActor_EnsureShadow` and
`RailActor_MapAttrGrassProc12`), `PaperWhite2_IsFieldMenuReturnCallback` (field_menu_event.c).

**Not 1:1.** The debug blocks (`FollowingDebug`, `FollowingRenderDebug`) and the depth readings only they kept are
gone; the last reason is `sReason` for the talk. The packed 12-byte registry rows (full package) aren't read. The
zone overrides (positioning.narc member 1) aren't ported: none exist, and member 1 is now the registry. The SELECT
toggle's "no event" check reads the game system's event: the original read GameData + 0x18, a word of the player's
saved state. The ABI and size checks between modules are gone.

**Memory.** Overlay 36 is the highest overlay now (0x6fac0 bytes, ends 0x021ef3e0); the DS arena has 0x322c0
(200 KB) after the heaps, from 0x34880 before the field ports.

**To test** (melonDS, `build/paperwhite2.nds`): the lead walks behind the player on a route and in a town; it swaps
when the player steps back onto it; it climbs stairs and drops off ledges; on a rail map (the Skyarrow Bridge, the Driftveil
Drawbridge) it follows the rail; L and R switch it to the next party member (both together do nothing); a 64-pixel
follower stays in its ball indoors and under a bridge (the ball isn't drawn yet); grass shakes on its tile and covers
its feet; its shadow sits on the ground; it disappears while a script, the menu or a battle runs, and walks in again;
after the menu leaves the field for the party or the bag it
comes back at once beside the player; SELECT turns it off and on; a map change and a door bring it
back walking in.

### Step 4: events, the talk and the effects

Done. What is ported, each from Pokeweb's file of the same name, in `src/paperwhite2/`:

- `ov036/paperwhite2_following_effects.c` (`following_effects.h`), `effects.c`: the send-out flash, the recall's white
  silhouette shrinking into the ball, the resting ball and its hop, the refused switch's cue, the warm upload under a
  fade, the follower's own ball type (member 23's art over the ball model), the emote bubbles that the talk shows.
- `ov036/paperwhite2_following_reactions.c` and `paperwhite2_following_gifts.c`, `reactions.c` and `gifts.c`: the
  rules of the interactions, contextual dialogues and gifts, chosen by HP, friendship, status, facing, zone, species,
  form, type and tile; the gifts' claims on the party member.
- `ov036/paperwhite2_following_interaction.c` (`following_interaction.h`), `interaction.c`: the talk, A in front of
  the follower after the field's own checks found nothing (follower-grid-event, follower-rail-event in
  `fieldmap_event.c`): the motion, the bubble, the cry and the message balloon, closed with A or B.
- `ov012/paperwhite2_following_events.c` (`following_events.h`), `events.c`: the events bridge, which binds main's
  event hooks (`PaperWhite2_FollowingBindEventHooks`) for the one observer, and the hooks of overlay 12's
  `field_actor.c` and `field_actor_tool.c` and overlay 36's `field_actor_rail.c` (the event-actor-* and ambient-*
  rows above); the PC's restore token, `FollowingRestore`.
- `ov036/paperwhite2_following_scene.c` (`following_scene.h`, `following_battle_entry.h` from `battle-entry.h`),
  `scene.c`: while an event runs the follower waits if every event of the chain and every script command is one the
  policy knows, and is recalled otherwise, or when an actor of the event would walk into it; NPCs' own moves don't
  walk into it; the PC's storage keeps the restore token; the menu and a local single battle with the follower in
  front are marked (`FOLLOWING_BATTLE_PRESENT` in the setup's flags, which step 6's opening reads); the follower's
  steps wait for an actor on the way (`FollowingScene_IsStepClear`).

`include/paperwhite2/following_hooks.h`, the stubs, is gone.

**Data.** a/0/4/7 members 3 to 23 (the Data table), packed by `following_assets.py`; the two policy files, through
`following_scene_policy.py` (the Data table).

**Moved and added under PAPERWHITE2.** Unchanged into headers: `EventScriptCallData` (`field/field_script_event.h`),
`EventBattleCallWork`, `EventWildBattleCallWork` (`field/event_battle.h`), `EventFieldOpenWork`
(`field/field_event.h`), `EventSoundWork` (`field/event_sound.h`), `EventFieldMenuReturn` (`field/field_menu.h`),
`PokeVoiceEvent` (`field/scrcmd_sound.h`), `YesNoEvent` (`field/scrcmd_menu.h`). The policy's static callbacks are
asked by predicates in their files: `PaperWhite2_IsWildBattleCallCallback`, `PaperWhite2_IsBattleCallCallback`
(event_battle.c), `PaperWhite2_IsFieldOpenCallback`, `PaperWhite2_IsFieldSubprocessCallback` (field_event.c, main),
`PaperWhite2_IsFollowingSoundCallback` (event_sound.c, main, from the generated header),
`PaperWhite2_IsPokeVoicePlayCallback` (scrcmd_sound.c), `PaperWhite2_IsYesNoEventCallback`,
`PaperWhite2_IsListMenuEventCallback` (scrcmd_menu.c), `PaperWhite2_IsCameraWaitCallback` (scrcmd_camera.c), and
`PaperWhite2_GetActiveFieldScriptSubEvents` (script_sub_event.c's static). The earlier parts added
`PaperWhite2_GameEventFree`, `PaperWhite2_CanOpenActorMsgWin`, `GFL_G3DSysGetHeapID`, `GFL_G3DResSetResData` and
billboard.c's material wrappers. `CheckActorNewPosOtherActorCollision`'s original body is the static
`CheckOtherActorCollision` in hack builds.

**Not 1:1.**

- The scene's debug block (`FollowingSceneDebug`) and its reasons (`FWS_UNKNOWN_COMMAND` and the rest) are gone; the
  script ID that the Repel's exception reads from it is read from the script's work at each command, as it was.
- The original compared a callback with 0x02019655, 8 bytes into `EventFieldSubprocessTransitionWithCallback_Callback`,
  so that event never counted as the PC storage's: kept, `// BUG:` in `PaperWhite2_IsFieldSubprocessCallback`, with
  the function's start under `BUGFIX`.
- The events DLL's `DllMain` cleared main's hooks when NitroKernel unloaded it; ported, the field's unload
  (field-unload) detaches the scene, which unbinds the bridge and clears them.
- The ABI and size checks between the modules (`FollowingEventsAPI.abi`, `FWRE_ABI`) are gone.
- The interactions' and effects' records of the emotes and effects files' sizes and CRCs went with the installer.
- The original's ten gift claims in the top 16 bits of block C's ribbons are gone with its one-time gifts (Dialogue
  rules, gifts and steps, below); those bits are the game's again.

**Memory.** After the events bridge: overlay 12 0x021507c0-0x0216eea0 (0x1e6e0), overlay 36 0x0217fdc0-0x021f6be0
(0x76e20), the DS arena 0x2aac0 (170 KB) after the heaps. After the scene: overlay 12 0x02150860-0x0216ef60
(0x1e700), overlay 36 0x0217fe80-0x021f8aa0 (0x78c20), main 0xa0 bytes more, the arena 0x28c00 (163 KB). Nothing of
the hack's is in the IRDO range.

**To test** (melonDS, `build/paperwhite2.nds`), besides step 3's list:

- L or R: the follower goes back into its own ball type with the white silhouette shrinking, and the next one comes
  out with the flash; L or R with no other member to switch to gives the refused cue.
- A 64-pixel follower indoors or under a bridge waits as its resting ball, which hops, and leaves with the ball's
  sound.
- A in front of the follower: it moves, shows a bubble, cries and talks in a balloon over it, closed with A or B; at
  low HP, with a status, on grass, in a cave and facing away the talk changes; the talk works on a rail map too.
- Gifts are dialogue steps now (Dialogue rules, gifts and steps, below).
- Talking to an NPC, reading a sign, a Yes/No prompt, a list menu, a cutscene's camera, the music and fanfare
  commands: the follower stays where it is and waits, and walks on after.
- A script that moves an actor through the follower, a cutscene that moves the player, a warp or a door: the follower
  is recalled into its ball, the script waits for the ball, and the follower comes out after.
- NPCs wandering near the follower don't walk into it, on a grid and on a rail map; a crowd in Castelia doesn't
  either, and one that has to recalls it.
- The PC: log in, the storage, log off: the follower is back on its tile facing the same way.
- A wild or trainer single battle started with the follower in front, healthy and the lead: its setup carries the
  mark (the opening itself is step 6); a double battle or a link battle recalls it.
- The menu (X): the follower waits, and is back at once after the party or the bag.

### Step 5: the Options row

Done. `src/paperwhite2/ov140/paperwhite2_following_options.c` (`following_options.h`), from `options.c`: a sixth row
under the five options, FOLLOWERS: ON/OFF, with its own three windows (its name, ON, OFF) and two values' frames, the
fifth row's tiles copied under it and its palette kept as the rows scroll, its cursor told apart from Confirm's (the
screen's cursor has places for five options and the two buttons only, so the row and Confirm share `CURSOR_CONFIRM`),
left and right or a touch to pick, its explanation in the message window, a change of it counted as a change when
leaving (the question), and the choice saved in Config's `followersOff` by Confirm. `FOLLOWING_ENABLED` replaces the
original's read of `native.bin`.

The code is in its own file because its state needs a `.bss`, which `config_panel.o` has none of in dsd's linker
script (the link warns that the section is referenced but not written). So the screen's constants and the parts of
its work that the row reads (`ConfigPanelPoint`, `ConfigPanelLabel`, `ConfigPanelOptions`, `ConfigPanelBg`,
`ConfigPanelObj`, `ConfigPanelGraphic`, `ConfigPanelUi`, `ConfigPanelMsg`, `ConfigPanelAppBar`, `ConfigPanelScroll`,
and the BG, window, actor, option, cursor and input constants) moved unchanged into `include/app/config_panel_work.h`,
which only `config_panel.c` and the row include, and `config_panel.c` has PAPERWHITE2 wrappers of the seven static
functions the row calls (`PaperWhite2_ConfigPanelScrollInit`, `...ScrollExit`, `...ScrollMain`, `...ScrollGetCursor`,
`PaperWhite2_ConfigPanelOptionsEquals`, `...OptionsApply`, `PaperWhite2_ConfigPanelMsgPrint`). The seven hooks are the
options-* rows above.

**Text.** `a/0/0/2` member 32 (`title_2`): the four entries the installer changed (`optionsOriginalText` has their
originals), imported into `res/text/system/title_2.txt` with IDs that name them. Packed, those four equal the hack's.
The installer rewrote the whole file, so the hack's member is 10 bytes shorter: four entries it didn't change (19, 20,
29, 36, all spaces) lost the second terminator the original has after them, and its size isn't rounded up to four
bytes. Encoding only; they stay as the original's.

**Not 1:1.** `options.c` read the screen's font and messages through the graphics work's pointer, past its end into
the screen's work; ported, the hook passes them. The row's state is zeroed when overlay 140 loads, as the DLL's was
when NitroKernel loaded it.

**Memory.** Overlay 140 0x0219d320-0x0219fda0 (0x2a80, grows 0x23060 before the arena moves); the arena and the other
overlays unchanged.

**To test** (melonDS): Options from the menu shows FOLLOWERS under SAVE BEFORE IR with ON and OFF, the rows' colors
and bevel as the others', and its explanation "Choose whether Pokémon follow you." when the cursor reaches it; up and
down go through the row to Confirm and Quit and back (down from Quit to TEXT SPEED); left and right pick, with the
select sound; touching the row and its values picks them; OFF then Confirm saves, and the follower is gone in the
field and stays gone after a save and reload; ON then Confirm brings it back; changing only the row and then Quit or
the close icon asks whether to make the changes, and No leaves it as it was; scrolling the rows keeps the row's frames
and palette with them.

### Step 6: the battle opening

Done. `battle.c` is in `src/ov167/btlv_scu.c` under PAPERWHITE2 (`BtlvScu_EncountFollowingSingle` and its wild and
trainer entries), since it runs that file's static opening procedures, window fade and gauges on its static work types
and needs no state of its own (so no `.bss`). When the setup is a local single (`FollowingBattle_IsLocalSingle`) and
marked (`FOLLOWING_BATTLE_PRESENT`, which step 4's scene sets), and the battle isn't recorded, the player's lead is
added to its platform at the start; if it isn't party member 0 the mark goes and the original opening runs. Once the
opponent's message window has hidden (state 5 wild, 6 trainer), the trainer battle shows the opponent's gauge, the
opening's mon becomes the player's, the battle's camera starts (effect 0x236), and the opening goes on at its last
state (9, 11), which shows the player's gauge. The mark is taken off when the opening ends. The two procedures replace
the singles' in `BtlvScu_StartEncount` (battle-wild-opening, battle-trainer-opening).

**Memory.** Overlay 167 grew 0x1a0, so overlay 168 is 0x021de0a0-0x021f7000 (grows 0xb7e0 before the arena moves);
the arena unchanged.

**To test** (melonDS): a wild single battle with the follower walking behind the player: the follower's Pokémon is on
the player's platform as the battle fades in, the wild one appears, and after its message there is no throw, ball or
"Go!", the camera goes to the usual view and the player's HP bar shows; the same in a trainer battle, with the trainer's
send-out as usual and the opponent's HP bar shown; with the follower off or recalled, a double battle and a link battle,
the opening is the original's; the next battle without the follower in front opens as usual (the mark is gone).

## Fixes after the first melonDS test

**Coming back after a menu, a battle or a menu's warp.** The save's load placed the follower at once because the boot's
summon token reaches a field whose only event is the field's opening, which the scene policy keeps; the summon is placed
as soon as that ends. A menu's application and a battle stored the token too (a battle only when the follower had been
carried into its opening, `FollowingScene_IsBattleEntry`), but the rebuilt field still ran the application's call
(`EventFieldAppCall_Callback`, then the X menu it goes back to) or the battle's call in its return states, which the
policy doesn't know: it recalled, so the follower stayed away through the fade back in and the reopened menu, and a
battle it wasn't carried into (not the lead, a double battle, a trainer seen first) walked in. Now:

- The unload arms the token for a menu's application (`IsChainOf(field, IsMenuCallback)`), for a field move or item
  started from a menu that warps (`sMenuSession`: the field came back from a menu and no event has ended its chain since:
  Fly, Dig, Teleport, the Escape Rope, the Infinity dungeon's retire), and for any battle (`IsBattleCallback`) when the
  follower was out as its events began (`FollowingScene_WasOut`) or Followers are off.
- The next field compares the zone and the player's tile at once (`IsSummonOrigin`). Back where it was, the events running
  then, and the fades back in and music restores under them, are kept by the policy (`FollowingScene_BeginReturn`), and
  the follower is built and placed during them with `PlaceSummon`, the boot's placement (behind, a side, or beside when
  facing down), and waits there (`FollowingScene_PauseAs`). An application that hands the menu a field move, an item's
  event or a script (event types 2, 3, 5) doesn't keep them: the follower comes after that event, or on the field it
  warps to. A battle that ends elsewhere (a loss) walks in; a menu's request places the follower on the warp's field
  once its arrival ends.
- An application that keeps the field (the save) gives the follower back beside the player when the menu's events end
  (`RecallForScene`).
- Doors and every other map change still consume the token and walk in.

**The ball looked dark.** HeartGold's ball material is diffuse 0, ambient 31, specular and emission 0, light 0 only, so
it showed light 0's color times the palette: (21, 21, 19) of 31 in the field's usual daylight set (light 0 (22, 22, 20))
and (10, 10, 15) at night (11, 11, 16), whatever the ball's palette. The field's actors, the follower too, are lit from
the actors' preset (every area: emission 9, diffuse 31, ambient 16) and its normal, which faces the light; the ball's quad
faces south, across it. `LightBall` works the body's color out on the CPU from the same lights, preset and normal, and
draws the ball unlit in that color: white in daylight, (21, 21, 28) on that night set, as the body.

**The recall dipped into the ground.** The silhouette is a quad of the actors' scene, which stands on its bottom edge
(origin 2), so its shrink fell to its feet; and a recall begun mid-step lost the registry's Y and the lift
(`FollowingRender_EffectPose` gave up on a moved actor). The silhouette now shrinks about its middle (`KeepMiddle`) at
the drawn height, lift included, and then the ball shows at its place on the ground. Pokeweb's design was the same
("uses the last submitted ground/depth-corrected pose before shrinking in place", EFFECTS.md): the shrink toward the feet
is its origin's, not a stated intent.

## Fixes after the second melonDS test

**The recall sank, then rose.** `FollowingRender_PrivateScene` copies the live scene's scale and colors but not its
origin, so the silhouette's scene had origin 0, the quad's middle, where the field's actors stand on their bottom edge
(origin 2, `FieldG3D_Init`): the first glow frame drew the body half its height lower, and `KeepMiddle` then raised it
as it shrank. `FollowingEffects_Snapshot` now copies the origin and the texture offsets, so the first three frames are
the body's last drawn quad exactly. The snapshot is also taken in the effects' pass, after the body's submit
(`PaperWhite2_FollowingEffectsDraw`), from `FollowingRender_EffectPose`, which now carries the whole draw-only move
(X, Y and Z, and the pulled scale), not just Y. `PlaceSilhouette` replaces `KeepMiddle`: the five shrinking frames
(3440 to 768 of 4096) move the quad's middle from the body's middle to the ball's spot (`transform.translation`,
the actor's ground six units forward), where the smallest one stands, then the ball shows. A sheet that isn't the
actor's (a switch before the next `Prepare`) clears the snapshot, so the recall shows the ball throughout.

**The send-out is the recall's mirror.** `OUT_TICKS` is 12: four frames of the ball (`OUT_BALL_TICKS`, the actor
hidden), then the ball's sound and its flash while the silhouette grows out of the ball through the same five sizes
backward, and three frames of it standing. From the fifth frame the actor is shown and the actors' pass works out its
pose but doesn't submit it (`FollowingEffects_CoversBody`, the `covered` argument of `FollowingRender_Draw`); the
effects' pass takes that pose and draws the silhouette there, so its last frame and the body's first are the same
pixels. `FollowingEffects_Out` prepares the follower's own sheet first; without one, the body shows with the flash as
before. The engine starts the oval the update after the body is shown, under the growing silhouette.

**The oval over the feet.** The follower's oval is the engine's: `FldeffShadow_Draw` puts it, flat
(`BILLBOARD_ACTOR_TYPE_FACE_CAMERA_Y_FLAT`), at the actor's ground plus its model offset (the actor table's `offset`,
`modelPosOffset*`, whole world units like the lift: `CopyActorPosOffset` multiplies by `FX32_ONE`) plus one unit, and
half a unit lower for a 32-pixel type 10 or 11 outside the Entree Forest. The body quad is the same position plus
`wPosOffset`, the outer and attribute offsets and the camera's actor Y (`Field_CalcActorYOffset`, 0 to 2 units down).
`FieldRenderPhase2_Fieldmap` draws the actors with `objectProjectionMatrixOffset` added to the projection's clip Z
and the effects, the ovals, with half of it, which sorts a body in front of its oval's near half. Lowered two units, the
follower's bottom rows are behind that near half, which the shadow's later pass then draws over them wherever the
offset isn't enough. In a W-buffered room it does nothing: the buffer compares W, which clip Z doesn't change. Camera
setup 3 (`a/0/5/9`, 229 units away at 39 degrees, `swapMode` 1) is the one every Pokémon Center has, and few other zones;
the ordinary cameras are Z-buffered, and the zones with projection type 0 have the smaller offset (0x136 against
0x1ee): estimated from the projection (near 1, far 1024: a clip Z offset k is about k * distance / 2 units of
depth), half of 0x136 at 237 units is about 4.5 units, against the 5 to 7 that a two-unit drop needs.

- **Not native.** A follower offset of -2 in the actor table (`data.json` `offset.y`) would move the body and the oval
  together, as an NPC's, but it puts the oval 1 to 1.5 units under the floor, which a W-buffered room's floor then
  covers: no shadow in a Pokémon Center. The lift stays on the quad alone (`FOLLOWING_SPRITE_LIFT`, -2, unchanged).
- **The fix.** `FollowingRender_OverOval` pulls the body toward the camera along the eye ray, scaled so its picture
  doesn't move, until its bottom row clears the oval's plane: (ground + 1 - bottom) / sin(pitch), half a tile at
  most, about 5 to 8 units at the field's cameras. It runs on every map: in a Z-buffered one it only adds to the
  offset. The strips of a tall body are cut first and the base window is pulled with the rest.
- **Reverted after the third test.** The pull drew the follower in front of the player too often, and the user
  won't move the player to compensate. `FollowingRender_OverOval` is gone: the quad keeps its lowered pose, and the
  engine's oval may again show over the lowest rows of some sheets, chiefly in the Pokémon Centers' W-buffered rooms.
- **The shadow pass is gone.** Pokeweb's pass looked for the follower's oval among the effects' camera-facing quads
  (type 0) to push it away; the oval is type 3, so it never found it, and the oval was always the engine's. It
  and `FollowingRender_OvalBehind` are removed: `PaperWhite2_FollowingEffectsDraw` submits the shadows as the
  original does.

**To test** (melonDS): recall a follower standing still and mid-step (L or R to the next member, or let a script
start) and watch the first glow frame: the same pixels as the body, then shrinking down into the ball. Send one out the
same two ways: the ball for four frames, then the silhouette growing up out of it to the standing pose, and the body
on the frame after. In a Pokémon Center and outdoors, with a 32-pixel follower (Pikachu) and a 64-pixel one outdoors
(a 64-pixel follower stays in its ball indoors), in the sun and in the shade, standing and walking each way: the oval
under the feet, never over them.

**The shadow variants (2026-11-18, to pick by eye).** The debug menu's Follower... list has `Follower shadow: <name>`:
A moves to the next variant at once, with no map reload, and the list comes back on that row. It is a RAM override
(`DEBUG_OVERRIDE_FOLLOWER_SHADOW`, off after a reset, which is 0); `FldeffShadow_Draw` asks
`PaperWhite2_FollowingPlaceShadow` for the follower's actor alone, and `FollowingRender_Draw` reads it for the body,
so NPCs, the player and the wanderers never change. 0 Current; 1 and 2 the oval 2 or 4 units back along the ground
(the camera's horizontal forward, `FollowingRender_GroundBack`); 3 and 4 the oval at 80% or 65%, a unit back; 5 no
lowering (the quad without `FOLLOWING_SPRITE_LIFT`, the oval as now); 6 the oval at ground + 0.25 instead of + 1;
7 the lift on the screen only (`FollowingRender_LiftOnScreen`: the lowered quad moved back along its eye ray to the
depth it had unlowered, scaled so its pixels stay: the picture of 0 at the depth of 5, which is a native NPC's depth,
about 1.3 units nearer than now in a center and 1.6 in the forest).

- **Which maps buffer how.** The Pokémon Centers are camera setup 3, W-buffered, so the actors' clip Z offset does
  nothing there. The Entree Forest (every `entree_forest*` zone, the run's clearings too) is camera setup 35:
  Z-buffered, 237 units at 53 degrees, projection type 1 (the 0x1ee offset), but its near plane is 112 units (far 512)
  where the ordinary cameras' is 1, so the same clip Z offset is worth about 60 times less depth: about 0.08 units
  between body and oval instead of 4.5 to 7. The forest behaves as a W-buffered room.
- **The depth maths** (the body is a camera-facing quad, the oval flat at ground + 1, pitch p): lowered by L, the body
  is L sin p deeper than its feet, and the oval wins over every body row up to (1 + L) / cos p units up the quad: 3.9
  in a center, 5.0 in the forest, against the 3.5 (4 pixels) of empty rows under a sheet's feet at rest, fewer on the
  walk's down frames. That height comes from where the oval's plane crosses the body's, so moving the oval along the
  ground or shrinking it (1 to 4) only changes how wide the covered rows are, unless it moves past that line (8 units
  back in a center). Raising the body (5) or keeping its unlowered depth (7) brings it to 1 / cos p (1.3, 1.7); the
  low oval (6) to (0.25 + L) / cos p (2.9, 3.75).
- **Not a variant: keeping the oval off the body by the hardware.** A polygon ID can't do it: the DS skips a
  translucent pixel over a translucent one of the same ID, not over an opaque body. The shadow polygons' stencil (a
  mask polygon, ID 0, then the shadow with the body's ID, which isn't drawn on the body) would, but the field sorts
  translucent polygons automatically by their screen Y, so the mask can't be made to draw before the oval reliably
  without switching the whole field to manual sorting.
- In DeSmuME (scratchpad `shadow/`), with a 32-pixel Pignite: in a center at rest no variant changes the body's
  pixels, and on the walk's frames 7 differs from 0 only on the feet's bottom row, the oval no longer over it; in the
  forest 7 differs from 0 by 7 to 11 pixels at the feet, standing and on one walk frame. 1 to 4 and 6 change only the oval. melonDS and the
  hardware may differ: the choice is the user's, by eye.

**Camera-side fixes (2026-11-19, variants 8 to 11 of the same switch).** The user's rule: the follower's and the
player's geometry stay as they are (the lift keeps the follower 1.3 to 1.6 units behind the player, and the player isn't
moved); the cameras change instead, so the engine's own clip Z offset does in the centers and the forest what it does
on the ordinary maps, where the follower looks right. The follower is drawn as in variant 0 in all four.

- **Vanilla partners have nothing special.** A partner walking with the player (Hugh in the Castelia Sewers,
  `ActorPairSet` and the other `ActorPair*` commands, src/ov012/pair_sys.c) is an ordinary NPC with move code
  `MOVE_CODE_FOLLOW_PLAYER` (field_actor_movecode_pair.c), which steps into the player's last tile. Only its task runs
  after the player's (`FldAct_AddTask`, priority + 1); its billboard is drawn with every other actor, at its true
  position, with the same clip Z offset and polygon ID, and no lowering.
- **The depth the offset buys.** The actors' pass adds k = `objectProjectionMatrixOffset` (0x1ee with projection
  type 1, 0x136 with type 0) to clip Z, the effects' (the ovals) k / 2. At distance d that is k d (far + near) /
  (2 far near) units of Z-buffer depth, and the body beats its oval by half of it, G. Lowered by L (2) at pitch p, the
  oval covers the body's rows where 1 - y > G sin p (y the row's height, -L at the bottom), so none once G sin p > 1 +
  L = 3: the ordinary camera (setup 0: near 1, far 1024, 237 units, 53 degrees, type 1) has G 7.2; the forest (setup
  35, near 112, far 512, type 1) 0.08, so the oval covers 4.9 units (5.6 pixels) of the quad as in a W-buffered room;
  the centers (setup 3, type 0, 229 units, 39 degrees) W-buffered 0, the oval covering 3.9 units (4.4 pixels).
  Z-buffered there, G is 4.3: 4.3 sin 39 = 2.7, so it covers only the lowest 0.35 units (under half a pixel).
- **8 Forest near 1**: setup 35 with the near plane of a unit (the far plane stays 512). G 7.2, but **the forest's
  fog breaks**: the zone's fog (its own file, not a weather's) is set for the depths of near 112, and at near 1 every
  depth of the scene falls past its end: the whole screen is the fog's pink (`forest_full_v0_v8_v11.png`). The precision
  falls too: a step of the 15-bit depth is about 0.01 units at near 112 and 1.7 at near 1 (the ordinary maps' value),
  which the forest's model was perhaps made for; the fog hides whether anything fights. Remapping the fog would leave
  about 50 depth steps for the whole scene. Not a candidate.
- **9 Center Z-buffer**: setup 3 Z-buffered (`swapMode` 0, as nearly every other setup is). In DeSmuME the oval no
  longer covers the follower's toes, standing, beside the player and on the walk's down frames, and the player and the
  follower overlap as before (the offset moves both by the same depth). The rest of the room changes in about 120
  pixels: NPCs' toes over their ovals as the follower's; the nurse's waist a pixel or two lower over the counter's top;
  an NPC upstairs by the ledge shows his legs over its edge (`center_zbuffer_ledge_npc.png`); a few single pixels on
  edges. The floor, the stairs and the counter's floor shadow `in02_kage` don't flicker or fight. Why the centers are
  W-buffered isn't written anywhere; the likely reason is the W-buffer's even precision (the floor shadow sits 1.5
  units over the floor, about one Z step at 229 units), and the ledge and counter, which W keeps the offset from
  pulling NPCs through.
- **10 Both cameras**: 8 and 9 together (each only changes its own setup, so in a center it is 9, in the forest 8).
- **11 Offset x near** (not asked for, added for the forest's fog): the camera stays and the actors' offset (and the
  effects' half) is multiplied by the near plane in units when it is over 1 (`FollowingRender_ClipOffset` in
  `FieldRenderPhase2_Fieldmap`), which gives the ordinary maps' depth at any near plane: G 8.7 in the forest. The fog
  and the precision stay; the follower's toes show over the oval, as in 9; the actors take about 8.7 units less fog,
  as the ordinary offset gives them on other maps (200 to 340 pixels change around the actors, none elsewhere). Of the
  setups, 7 (`castelia_city_2`, near 5) is the other Z-buffered one with a near plane over 1; W-buffered ones aren't
  changed by it.
- **11 is now built in, for the forest alone (2026-11-19, after the user's melonDS test).** `FollowingRender_ClipOffset`
  takes the field's `FieldCamera` and scales the offset whenever its setup (`defaultsIndex`) is 35, with or without the
  debug menu; setup 7 and every other camera keep the vanilla offset. The variant's row stays (`11 Forest fix: now 0`)
  so the numbers don't move, and draws as 0. In DeSmuME the forest with 0 now matches the old 11 (`shadow3/`
  `forest_permanent_fix.png`: rows before 0, before 11, now 0; the light differs with the clock).
- **12a, 12b, 12c Center near 16, 32, 64** (the slots after 11): setup 3 Z-buffered as 9, with the near plane at 16, 32
  or 64 units and the offset scaled by it as 11 does, so the actors keep 9's G of 4.3. Why: in 9 the back wall's
  windows fight the wall (melonDS).
  - **The model** (`black_city_pokemon_center_m_pc01_00_00`, which every center's matrix uses). The back wall is the
    plane z = -260 (model units; world z = model + 256, y = model + 4), built of tiles that share edges and don't
    overlap: the opaque `in02_pc` bands (y 84 to 92 over the windows, 44 to 62.28 between them, -4 to 12 under them)
    and the two translucent `in02_pcwin` panes (glass and frame, alpha blend; y 62.28 to 84 and 12 to 44), x -224 to
    -48. So the wall has openings, filled by the panes in its own plane. The view outside, `in02_window`, is one opaque
    quad at z = -262, **2 units behind the wall** (x -232 to -40, y -7.2 to 87.2), larger than the openings, so it
    runs behind the solid bands too; no face joins the two planes (no reveals or sills). The fight is the window quad
    against what is 2 units in front of it: the solid red band behind which it continues (and the strips above and
    below), and the translucent panes' depth test against it. The panes and the wall bands never fight each other
    (coplanar but side by side).
  - **The depth steps.** The DS's Z-buffer keeps (z << 14) / w per vertex, 2^15 steps over the depth range, so a step
    at eye depth d is d^2 (far - near) / (32768 far near) units; the window's 2 units along z are 1.7 units of eye
    depth (the camera looks down 31.8 degrees, read from the emulator's lookat). The wall is 295 to 330 units from the
    eye with the player upstairs in front of it, 380 to 410 from the counter's floor. Steps between window and wall:

    | near | step at the wall (units) | window behind the wall (steps) |
    | ---- | ------------------------ | ------------------------------ |
    | 1 (9) | 2.4 to 5.1 | 0.33 to 0.70: fights |
    | 16 (12a) | 0.15 to 0.32 | 5.4 to 11.3 |
    | 32 (12b) | 0.07 to 0.16 | 10.9 to 23 |
    | 64 (12c) | 0.04 to 0.08 | 22.5 to 47.5 |

    A vertex's depth is rounded to half a step either way, so anything over 2 or 3 steps holds: all three should
    separate the window. The far plane stays 1024: the farthest point in view is under 500 units away. The nearest
    geometry is the front wall's top, about 156 units from the eye with the player at the door, and the actors are
    over 200, so nothing comes within even 64 of the camera. The floor decals and the counter's floor shadow
    `in02_kage` (1.5 to 2 units over the floor, about half a step at near 1) gain the same factor.
  - **The fallback**, for the model: at near 1 (or W-buffered) the window would have to sit about 6 units behind the
    wall for one step at the counter's distance and 18 for a safe three, instead of 2. Not needed if 12 works.
  - **In DeSmuME** (`shadow3/`): DeSmuME doesn't show the fight even in 9 (`center_back_wall.png`, the wall upstairs,
    the same in 0, 9 and 12a to 12c), so the windows can only be judged in melonDS. The follower's feet are as in 9
    (`center_follower_feet.png`). The side effects stay, since they come from the offset's depth and not the precision:
    the NPC by the ledge shows his legs over its edge and the nurse sits a pixel or two lower over the counter
    (`center_nurse_ledge.png`), as in 9. 12a and 12b also move a pixel row on the benches' and pods' floor edges
    upstairs; 12c doesn't. Nothing flickers between frames (only the globe's animation). Full screens:
    `center_counter_full.png`, `center_upstairs_full.png`.
- **Who shares the setups.** Setup 3: the 18 Pokémon Centers' zones plus `pokemon_league_11` and `victory_road_27`
  (the League's and Victory Road's centers), all projection type 0. Setup 35: the ten `entree_forest*` zones alone.
  A change to either setup touches only those zones. The other W-buffered setups (1, 2, 4, 10, 11, 24, 39: Skyarrow
  Bridge, Castelia's street, the bridge gates, the Tubeline Bridge, Victory Road's 2, Black City and White Forest, the
  Marine Tube) have the centers' problem too: see "The whole game" below.
- **How.** `FieldCamera_ReadDefaults` passes its setup to `FollowingRender_AdjustCamera`, which applies the setup's
  camera fix (below) and then the RAM override's experiment; the scaled offset is in `FollowingRender_ClipOffset`. The
  menu's A calls `FollowingRender_ApplyCamera`, which sets the planes and the buffering again from the setup without
  touching the camera's position: the variants show at once, with no map load. The weather fog's cache
  (`paperwhite2_weather_fog.c`) reads the planes once per setup through the same `FieldCamera_ReadDefaults`, so it sees
  the fixes; a variant changed in a zone with weather keeps the old planes there until the next map.
- **Shown** (DeSmuME, scratchpad `shadow2/`): `center_sheet.png` and `forest_sheet.png` (rows 0, 8, 9, 10, 11; the
  follower stepping down into the player's old tile, standing beside on the right, walking up toward the player,
  standing beside on the left), `center_zbuffer_diff.png` (the room's changed pixels), `center_zbuffer_nurse.png`.
  The geometry above and the shots agree.
- **Recommendation**: 9 for the centers and 11 for the forest (as a fixed change: setup 3's `swap_mode` 0 in the
  camera table, and the offset times the near plane, or setup 35's zones alone). The user picks by eye in melonDS.
  The user's melonDS test: 11 works in the forest (now built in, above); 9 fixes the feet but the windows fight, hence
  12. For the centers, 12c (near 64) has the most margin and no edge change in DeSmuME; once the user picks one, it
  becomes setup 3's row in `res/field/cameras/defaults.json` (`swap_mode` 0, `near`) with setup 3 added to the scaled
  offset. The user's tests (melonDS and a 3DS): 12a, 12b and 12c all work; 9 fights the windows. 12c is built in.

**The whole game (2026-11-19, after the user's tests of 12a to 12c).** The user saw the oval over the feet in
Castelia's street and on Skyarrow Bridge too, and asked for every affected place, each fix limited to the cameras that
need it.

- **The fixes are data**: `res/paperwhite2/follower_camera_fixes.json` (`follower_camera_fixes.schema.json`), a setup
  each: `z_buffer`, `near` (units, null keeps the setup's) and `scale_offset`, with the zones and the reason.
  `tools/paperwhite2/following_camera_fixes.py` checks it against the camera table and writes
  `paperwhite2/following_camera_fixes_config.h` (hack build only); `FollowingRender_AdjustCamera` and
  `FollowingRender_ClipOffset` read it. `res/field/cameras/defaults.json` stays vanilla. Deleting an entry reverts that
  setup alone; the debug row `13 Camera fixes off` turns them all off live, for comparing.
- **Built in now:** setup 3 (the centers, 12c: Z-buffered, near 64, the offset scaled), setup 35 (the Entree Forest,
  the offset scaled, as before), setup 7 (Castelia's Central Plaza, `castelia_city_2`: Z-buffered with a near plane
  of 5, so the offset scaled alone, the forest's fix; G sin p 2.0 to 10) and setup 24 (White Forest and Black City and
  their gates: W to Z, near 32, the offset scaled).
- **The debug rows** keep their numbers: 8, 9 (now `9 Center near 1`: the centers Z-buffered at near 1, the old 9) and
  10 are the experiments over the fixes; `11 Forest fix: now 0` and `12c Center fix: now 0` draw as 0; 12a and 12b put
  the centers' near plane at 16 or 32; 13 turns the fixes off.

**The audit** (`tools/paperwhite2/camera_audit.py`, stdlib Python). `table` reads the camera table, the zone headers'
camera setup, projection type, weather and camera areas or rails, and the zone fog table (file 29 of `a/0/8/0`, from
`extract/w2_us/` when it's there); `layers SETUP` reads the map models of the setup's zones (the map editor's
`glb_mesh.read_mesh`) with the props their chunks place (their area's bundle). For each setup: its buffering, planes,
distance and pitch to the follower (the table's zoom and pitch; for the cameras that move or stand still, the distance
from the eye to the follower's quad and that ray's pitch as DeSmuME measured them, marked *), G sin p (affected under
3), how far up the lowered quad the oval wins (units, capped where the oval's own near half doesn't reach that far on
the screen, which spares the low cameras), and the same with the near-scaled offset. Bold: affected.

| setup | buffer | near | far | distance | pitch | zones | G sin p | oval over the quad | near-scaled: G sin p, oval | fix |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Z | 1 | 1024 | 237 | 53 | abundant_shrine, abundant_shrine_2, abyssal_ruins, abyssal_ruins_2 and 533 more (moving camera, fog, weather) | 3.6 | 0.0 | - | - |
| **1** | W | 19 | 2594 | 234* | 45* | skyarrow_bridge (moving camera, fog) | 0.0 | 4.2 | 5.0, 0.0 | - |
| **2** | W | 100 | 2144 | 288* | 29* | castelia_city (moving camera) | 0.0 | 3.2 | 4.4, 0.0 | - |
| **3** | W | 1 | 1024 | 229 | 39 | accumula_town_pokemon_center, aspertia_city_pokemon_center, black_city_pokemon_center, castelia_city_pokemon_center and 16 more | 0.0 | 3.9 | 2.7, 0.3 | Z-buffer, near 64, offset x near |
| **4** | W | 1 | 2128 | 227* | 10* | bridge_gate (fog) | 0.0 | 0.9 | 1.1, 0.0 | - |
| 5 | Z | 1 | 1968 | 352 | 36 | pokemon_league | 6.2 | 0.0 | - | - |
| **6** | Z | 1 | 1536 | 158 | 20 | castelia_city_7 | 1.6 | 0.4 | - | - |
| **7** | Z | 5 | 1026 | 488* | 42* | castelia_city_2 (moving camera) | 2.0 | 1.4 | 10.0, 0.0 | offset x near |
| 8 | Z | 1 | 1536 | 348 | 38 | castelia_city_3 | 6.5 | 0.0 | - | - |
| 9 | Z | 1 | 1024 | 317 | 51 | driftveil_drawbridge, driftveil_drawbridge_gate | 7.4 | 0.0 | - | - |
| **10** | W | 1 | 1822 | 228 | 24 | tubeline_bridge, tubeline_bridge_gate (fog) | 0.0 | 2.6 | 2.8, 0.0 | - |
| **11** | W | 1 | 2848 | 237 | 53 | victory_road_2 (moving camera, fog) | 0.0 | 5.0 | 5.7, 0.0 | - |
| 12 | Z | 1 | 1024 | 237 | 42 | castelia_city_gym_2 | 3.0 | 0.0 | - | - |
| 13 | Z | 1 | 1536 | 236 | 27 | castelia_city_4 | 3.3 | 0.0 | - | - |
| 14 | Z | 1 | 1536 | 396 | 39 | castelia_city_6 | 7.4 | 0.0 | - | - |
| 15 | Z | 1 | 1536 | 217 | 28 | castelia_city_5 | 3.1 | 0.0 | - | - |
| 19 | Z | 1 | 1024 | 254 | 48 | pokemon_league_5, pokemon_league_6, pokemon_league_7, pokemon_league_8 (moving camera, fog) | 3.6 | 0.0 | - | - |
| 20 | Z | 1 | 1024 | 367 | 47 | pokemon_league_2 (moving camera) | 8.0 | 0.0 | - | - |
| 21 | Z | 1 | 1024 | 325 | 62 | pokemon_league_3 (moving camera) | 8.6 | 0.0 | - | - |
| **24** | W | 1 | 1024 | 452* | 54* | black_city, black_city_gate, white_forest, white_forest_gate (moving camera) | 0.0 | 5.1 | 11.0, 0.0 | Z-buffer, near 32, offset x near |
| 25 | Z | 1 | 1024 | 379 | 52 | castelia_city_10, castelia_city_11, castelia_city_12, castelia_city_8 and 1 more (moving camera) | 9.0 | 0.0 | - | - |
| 26 | Z | 1 | 1168 | 352 | 52 | marvelous_bridge, marvelous_bridge_gate (fog) | 8.4 | 0.0 | - | - |
| 27 | Z | 1 | 1296 | 237 | 53 | icirrus_city_2 (moving camera, fog) | 3.6 | 0.0 | - | - |
| **32** | Z | 1 | 2144 | 153 | 59 | opelucid_city_gym (moving camera) | 2.5 | 1.0 | - | - |
| **33** | Z | 1 | 1024 | 236 | 39 | celestial_tower_2, celestial_tower_3, celestial_tower_4, celestial_tower_5 (moving camera) | 2.8 | 0.3 | - | - |
| 34 | Z | 1 | 1024 | 237 | 58 | abyssal_ruins_5, abyssal_ruins_6, abyssal_ruins_7, abyssal_ruins_8 (fog) | 6.1 | 0.0 | - | - |
| **35** | Z | 112 | 512 | 237 | 53 | entree_forest, entree_forest_10, entree_forest_2, entree_forest_3 and 6 more | 0.1 | 4.9 | 7.0, 0.0 | offset x near |
| 38 | Z | 1 | 1024 | 237 | 53 | nimbasa_city_gym | 3.6 | 0.0 | - | - |
| **39** | W | 1 | 3280 | 228 | 16 | marine_tube (moving camera, fog) | 0.0 | 1.6 | 1.9, 0.0 | - |
| **40** | Z | 1 | 1024 | 342 | 25 | castelia_city_gym | 2.7 | 0.0 | - | - |
| **41** | Z | 1 | 1024 | 237 | 19 | pwt_3 | 1.5 | 0.4 | - | - |
| 44 | Z | 1 | 1536 | 225 | 37 | join_avenue | 4.1 | 0.0 | - | - |

(Setups 16 to 18, 22, 23, 28 to 31, 36, 37, 42 and 43 aren't named by any zone header. Setup 0 mixes both projection
types; the row takes the weaker offset, 0x136. The distances are to the follower standing by the player.)

- **How a W setup's near plane is chosen** (`layers`): faces whose planes are within 4 degrees and 0.05 to 4 units
  apart and overlap on that plane (decals, shadows painted on floors, windows on facades, the centers' outside view),
  the depth between them along the view (a floor's layers gap / sin(pitch) apart, a wall's about the gap), and the
  Z-buffer steps between them for near 16, 32, 64, 128 (the setup's own if larger) at the farthest the view shows
  them: the top of the screen at the player's level, H cos(fov) / sin(pitch - fov) with H the eye's height over the
  follower, or the far plane when the camera sees the horizon (pitch within half a degree of the half field of view,
  20 degrees). The smallest near keeping every pair at 3 steps or more is the setup's. That is strict: the centers'
  floor logo (`in02_logo1`, 0.12 units over the floor) is at 0.6 steps there under 12a and 2.6 under 12c, and the user
  saw nothing wrong under either; the window that fought under 9 was at 0.5.
- **Setup 24 (White Forest, Black City): fixed, near 32.** No zone fog, no weather. The camera stays at pitch 53 and
  452 units from the follower all over the city (traced in DeSmuME), so the view's farthest at the player's level is
  628 units, inside the far plane's 1024. 184 layer groups; the closest, the painted shadows `h_kage` 0.93 units over
  the Pokémon Center's wall base and the city's ground decals 1 unit over the ground, are 1.6 steps apart at near 16
  and 3.2 at 32 (6.5 at 64). The eye is 363 units over the ground, far beyond 32. The far plane is unchanged.
- **Setup 7 (Castelia's Central Plaza): fixed, the offset alone.** Already Z-buffered at near 5, so as the forest:
  the offset times 5, which gives the ordinary maps' G (10 at the plaza's 488 units). The planes, the precision and
  Castelia's weather fog don't change.
- **Not changed, for the user** (the short list):
  - **Castelia's streets (setup 2, `castelia_city`)**: no fog of its own, but the camera looks down only 23 degrees,
    3 more than the half field of view, so the far plane (2144) is in view, and the facades' windows sit 0.2 units in
    front of their walls. With the near plane at 100 (the setup's own) or 128 they stay 3 steps apart only up to 520 or
    600 units away; the buildings down the street are farther, so their windows could shimmer. Castelia's weather fog
    is also tuned on the 3DS for this camera's W-buffer (`W_BUFFER_FOG_EXTRA_STEPS`), which a Z-buffer would drop.
  - **Skyarrow Bridge (setup 1)**: a zone fog of its own (the fog table's entry 4), tuned for the W-buffer's depths,
    and the span's camera (pitch 19 to 25) sees the horizon: the painted shadows on the ramps (0.27 units over the
    road) and the parapets' layers (2 to 4 units) aren't 3 steps apart there at any near plane. On the stairs alone
    (pitch 37) near 64 would do (4.9 steps).
  - **Victory Road's outside (setup 11)**: the table's camera would clear at near 16 (4.8 steps), but the zone has a
    fog of its own (entry 3) made for W depths, which a Z-buffer remaps, and the rail camera wasn't measured.
  - **The Tubeline Bridge (10), the Marine Tube (39), the gate by Skyarrow Bridge (4)**: fog of their own, and low
    cameras (24, 16, 0 degrees) that see to the far plane: no near plane clears them. The gate's camera is level, so
    the oval covers under a unit there anyway.
  - **Z-buffered at near 1 but under 3** (6 a Castelia street, `castelia_city_7`; 32 the Opelucid Gym; 33 Celestial
    Tower; 40 the Castelia Gym; 41 the PWT's `pwt_3`): their offset is the vanilla one and scaling by a near plane of 1
    does nothing; the oval covers 0 to 1 unit of the quad (about a pixel at most, the Opelucid Gym's being the
    largest), as an NPC's does there. The only lever would be a stronger offset, which carries every actor into
    ledges and counters too. Left alone; worth a look.
  - A third way for the W-buffered outdoor setups: the actors moved nearer in W, the W-buffer's version of the
    engine's clip Z offset, which keeps the planes, the precision and the fog. Now variant 14, below.
- **Shown** (DeSmuME, scratchpad `shadow4/`, each the top screen before and after with the follower 8 times larger):
  `white_before_after.png` (White Forest: the follower's and the player's feet now over their ovals),
  `plaza_before_after.png` (the plaza: the feet's bottom row), `center2_before_after.png` (a center with 12c built
  in; `shadow3/center_follower_feet.png` has the feet under 0 and 12c), and, unchanged, `street_before_after.png`
  (Castelia's street, the oval over the feet's bottom row) and `skyarrow_before_after.png`. `white_changed_pixels.png`
  marks what changed in White Forest: the actors' feet and the animated leaves and NPCs, no geometry. DeSmuME shows
  the ovals but not z-fighting, so for 24 the layer maths is the evidence; melonDS and the 3DS are the check.

**Variant 14: the actors nearer in W (2026-11-19, debug switch only).** The user's tests passed in the centers, the
Entree Forest, the Central Plaza, White Forest and Black City. Left: the W-buffered outdoor setups 1 (Skyarrow Bridge),
2 (Castelia's streets), 4 (the gate by Skyarrow), 10 (the Tubeline Bridge), 11 (Victory Road's outside) and 39 (the
Marine Tube), whose fog is tuned for their W-buffer, so their planes and buffering stay. Variant 14 does there in true
depth what the clip Z offset does on a Z-buffered map.

- **How.** `FieldRenderPhase2_Fieldmap` calls `FollowingRender_NearerInW` on each pass's projection, after the clip Z
  offset. In the setups with a `w_pull` in `follower_camera_fixes.json` (the six above; it does nothing without the
  debug row), it multiplies the projection's x, y and z rows by 1 - pull: every eye-space point the pass draws comes
  to 1 - pull of its depth along its own ray, so its picture stays and its W (the buffer's value and the divisor)
  falls by the pull. That is everything the engine's offset reaches on a normal map: the actors' pass (the player, NPCs,
  the follower, wanderers, the grass over feet, the 3D field objects and the field effects drawn in that pass) moves
  together, so the actors keep their order among themselves (the follower covers the player no more than now). The
  camera, the planes, the buffering and the fog stay; the pulled actors take the pull's depth less fog, as the offset
  gives them on normal maps.
  - **14a Nearer in W:** the actors by the setup's `w_pull`, the effects' pass (the ovals, the follower's effects, the
    Entralink markers) in place. The pull is the smallest that clears the oval on the walk's down frames (the audit's
    `covered` with the lift at 3.75 units instead of 2: G of 5.7 to 6.8 at these views, against 3.75 to 5.8 at rest),
    at the setup's worst measured view, rounded up: a fraction of the distance, since a projection scale is one.
  - **14b Nearer in W, full:** the ordinary maps' depth: the actors by half the vanilla offset k (0x1ee: 6.0% of their
    distance) and the effects by half of that, as `FieldRenderPhase2_Fieldmap` gives a normal map at a near plane of a
    unit. Body over oval G is then a quarter of k times the distance.
- **The pulls** (units of depth at the follower; the effects' pull in brackets; normal maps at setup 0, 237 units at
  53 degrees: actors 14.3, effects 7.1, G 7.1):

  | setup | where | distance, ray pitch | w_pull | 14a pull (G) | 14b pull, effects (G) |
  | --- | --- | --- | --- | --- | --- |
  | 1 | Skyarrow Bridge: stairs, span, bend | 234, 45; 202, 21; 282, 49 | 0.032 | 7.5, 6.5, 9.0 | 14.1 (7.1), 12.2 (6.1), 17.0 (8.5) |
  | 2 | Castelia's street by the center | 288, 29 | 0.024 | 6.9 | 17.4 (8.7) |
  | 4 | the gate by Skyarrow | 227, 10 | 0.026 | 5.9 | 13.7 (6.8) |
  | 10 | the Tubeline Bridge (table) | 228, 24 | 0.029 | 6.6 | 13.7 (6.9) |
  | 11 | Victory Road's outside (table) | 237, 53 | 0.026 | 6.2 | 14.3 (7.1) |
  | 39 | the Marine Tube (table) | 228, 16 | 0.028 | 6.4 | 13.7 (6.9) |

  The smallest pull at rest (lift 2, the audit's line of 3) is 3.75 to 5.8 units with the effects in place, twice that
  with them at half: 14a's 6 to 9 is about half the normal maps' 12 to 17 and clears the down frames too. With the
  effects at half, the smallest that clears would be 11.4 to 13.5, nearly 14b's amount, so it has no row of its own.
- **Edges.** The W-buffer compares true depth, so a pulled actor shows over any surface less than pull / cos(ray pitch)
  in front of its quad, along the ground: a fence, a railing, a ledge's face or a building's corner there loses the
  rows it hid. On the screen that is a band in front of the feet pull x tan(pitch) units tall: 14a about 3.5 pixels on
  Castelia's street (reach 7.9 units, half a tile), 3.3 on the Skyarrow span, 8 to 10 on its stairs and bend, 1 at the
  gate, 3.4 on the Tubeline Bridge, 9 on Victory Road, 2 in the Marine Tube; 14b about 2.5 times that (8.7, 6.2, 16 to
  18, 3, 7, 21, 4.5). A normal map's offset reaches 24 units (21 pixels) at setup 0, so both are within what the
  ordinary maps already show. Measured: the player against Castelia's railing (the camera pulled out to 445 units
  there) shows 3 rows of legs over its top under 14a and 4 under 14b (`street_railing.png`).
- **Rounding.** The scaled matrix rounds its x and y entries to 1/4096, about 1/20000 of the picture, so a quad edge
  that lay exactly on a pixel boundary can move a pixel and a sprite repeat or drop a row: in DeSmuME one row of the
  player's hair in two of the seven 14a shots (`skyarrow_front.png`, `skyarrow_span_beside.png`), none under 14b.
  Static per pose; worth watching in melonDS.
- **In DeSmuME** (scratchpad `shadow5/`, each 0, 14a and 14b with the box zoomed 4x and the changed pixels in magenta):
  `street_beside.png` (the follower beside the player: the oval no longer over its bottom row), `street_front.png` (the
  player in front of the follower: the same order, the player's feet over its oval), `street_railing.png`,
  `skyarrow_stairs.png`, `skyarrow_beside.png`, `skyarrow_front.png`, `skyarrow_span_beside.png`. 7 to 72 pixels change
  a shot, all at the actors' feet, the railing and the rows above.
- **To test** (melonDS): START > Follower... > Follower shadow, A to `14a Nearer in W` or `14b Nearer in W, full` (13
  and its numbers stay; 14a and 14b come after it). On Castelia's street and Skyarrow Bridge first: the feet over the
  ovals, the player against the street's railing and the bridge's parapets, the player and the follower crossing.
  Building one in: drop the debug check for that setup's `w_pull` in `FollowingRender_NearerInW` (or a `w_pull_built_in`
  flag in the table).

**14a built in where it tested clean; variant 15 for Castelia (2026-11-19, after the user's melonDS tests).**

- **Built in:** setups 1 (Skyarrow Bridge), 4 (the gate by Skyarrow), 10 (the Tubeline Bridge) and 39 (the Marine
  Tube): `"w_pull_built_in": true` in `follower_camera_fixes.json` (the header's `wPullBuiltIn`), so
  `FollowingRender_NearerInW` pulls their actors by their `w_pull` always, as the centers' and the forest's fixes are,
  and `13 Camera fixes off` turns it off with the rest. 1, 10 and 39 were clean on 14a and 14b in melonDS; 4 too, but
  for a flicker on the floor that is the map's own (below).
- **Still on the switch:** setup 11 (Victory Road's outside, untested) and setup 2 (Castelia's streets): the debug row
  is now `14a Nearer in W: 2, 11` (on the others it draws as 0). 14b is unchanged.
- **Castelia's streets on 14a and 14b:** the user saw the player and the follower clear the NPCs but come over
  streetlights and railings in front of them. **Variant 15** (`15 Low oval, Castelia`, after 14b, same list and word
  slot) is for setup 2 alone, its `low_oval_pull`: the follower's oval at the ground + 0.25 (as variant 6) and the
  actors pulled by that smaller fraction, the effects in place. Elsewhere 15 draws as 0. **The follower's oval only:**
  the pull is set by the follower, whose quad is lowered by the lift (2 units, 3.75 on the walk's down frames); the
  player's and the NPCs' 32-pixel ovals sit at the ground + 0.5 already (`FldeffShadow_Draw`) and need about one unit
  (0.0036 of the distance by the audit's model), so lowering them would change every NPC on the street for nothing.
- **The smallest pulls, measured** (DeSmuME, scratchpad `shadow6/work/oval.py`: Castelia's street at 288 units and 29
  degrees, two walks of 10 and 11 steps in all four directions (208 and 236 frames) recorded three times, as is, with the follower's oval sent
  under the ground and with its body hidden too, so only the oval's pixels over the body count):

  | variant | oval | pull (fraction) | units at 288 | frames with the oval over the body |
  | --- | --- | --- | --- | --- |
  | 0 | + 1 | 0 | 0 | 89 of 208 (17 pixels at most) |
  | 14a | + 1 | 0.013 | 3.7 | 2 of 236 (3 pixels) |
  | 14a | + 1 | 0.014 (0.024 as tested) | 4.0 | none |
  | 15 | + 0.25 | 0.008 | 2.3 | 15 of 208 (4 pixels) |
  | 15 | + 0.25 | **0.009** | 2.6 | none (both walks) |

  So 14a's 0.024 had a margin (the audit's model counts the quad's empty bottom rows): its own smallest is 0.014.
- **The edge band** (pull x tan(ray) on the screen in front of the feet): at the street's 288 units, 14a as tested 3.5
  pixels, 14a at its smallest 2.0, **15 1.3**; at the harbor railing, where the camera pulls out to 445 units at 22
  degrees, 2.5 against **0.95**. Measured there (`shadow6/castelia_railing.png`, 0, 14a, 15): 14a draws 3 rows of the
  player's legs over the railing, 15 none (its changed pixels are the lowered oval's). Behind a streetlight
  (`shadow6/castelia_streetlight.png`): 14a changes 77 pixels of the player's hair around the post and its light, 15
  none of the body (10 at the feet, the oval). So 15 keeps the band to about a pixel.
- **The lowered oval against the street:** 0.25 units over it is 0.5 units along the 29-degree ray, which the
  W-buffer, keeping eye depth to a small fraction of a unit at these distances, separates by a wide margin; the
  engine's own player oval sits at + 0.5 in the same buffer and doesn't fight. DeSmuME can't show a depth fight (see
  the centers' windows), so the hardware's interpolation of W over the street's large polygons is melonDS's check.
- **Recommendation:** 15 for Castelia if the user's melonDS test of the railings, the streetlights and the oval on
  the street is clean; then setup 2 gets it built in. If it isn't, leave setup 2 alone.

**The gate's floor flicker (setup 4): the map's own, not variant 14.** The user saw, with 14 on, the floor flicker at
one spot by the red mat by the gate building's door. 14 can't reach the floor: `FieldRenderPhase2_Fieldmap` draws the
map's two passes (`FieldG3D_RenderFieldmap`, phase 1 before it and pass 1 at its start) with the camera's projection,
scales only the copy it sets for the actors, sets the effects' own copy, and puts the saved one back (`NNS_G3dGlb
SetProjectionMtx(&saved)` and a flush) before the weather, the particles and anything else; the emotion bubbles and
`Field3DBG` save and restore theirs too. In DeSmuME at two spots by the mat (`shadow6/work/gate.py`: 12 frames standing
and 16 walking, under 13, 0 and 14a) no floor pixel differs: only the actors' feet (4 to 16 pixels a frame), and the
frame-to-frame changes (the sky and the follower's idle) are the same in all three (`shadow6/gate_red_mat.png`). The
gate's model (`bridge_gate_h01b_00_00`, `camera_audit.py layers 4`) has layers that the gate's level camera sees at a
grazing angle: two translucent shadows exactly coplanar 1 unit over the floor (`kage_out` and `mise01kage`, overlapping
by the mat's far-left corner and in front of the steps) and walls' trims 0.06 to 0.16 units over their walls. Coplanar
translucent faces are where the DS's per-pixel interpolation flickers, which melonDS shows and DeSmuME doesn't. So it
is vanilla: to confirm, the same spot under `13 Camera fixes off`. A cheap fix, if it is those shadows: in the gate's
model, drop the overlap from one of the two or raise `kage_out` a quarter of a unit (a map model edit, not made).

## Small followers in front of counters

**The clipping.** In a Pokémon Center a 32-pixel follower's middle rows went into the counter on the walk's down
frames. The body is a camera-facing quad 28 units tall (32 pixels at the actors' scene scale of 7), so it leans back by
its height: at the centers' camera (camera setup 3: 229 units, 39.2 degrees) a row h units up the quad stands 0.63h
behind the feet and 0.78h above them. Every center is the map model `m_pc01_00_00`. Its nurse counter (terrain tiles
x 5 to 9 of row z 11, class 0xd4, and the PC at x 4, class 0xd6; one layer, at the floor's height 0, with the
collision flag) is, in the glb at tile 7: a foot sloping from z 192.7 at 1.5 units up to 188.4 at 8.2, a lip out to
190.3, a face back to 188.4 at 12.7 and a top at 12.7 to 13.3; the tiles beside curve back. The feet stand at z 200.
A native 32-pixel sprite (the player, at the counter) clears it: the map is built for that. The follower is drawn lower:
`FOLLOWING_SPRITE_LIFT` (2 units), and the down frames' art about 2 pixels more. A ray cast of the model shows a whole
follower losing rows 10 and 11 (from the top) at rest and rows 8 to 13 on the down frames at tiles 6 to 8. The room is
W-buffered, so the actors' clip Z offset, which keeps NPCs in front of walls on the other maps, does nothing there.
A 64-pixel body was already split (`SplitBody`).

**The small split** (`SplitSmallBody`, its own `SMALL_*` constants; `SplitBody`, its constants and its results are
unchanged). Only for a 32 by 32 face that isn't flipped, and only when the tile right behind the follower, away from the
camera on the nearer grid axis, isn't walkable at its height (`SMALL_WALL_TILES` 1, the same `IsWallAt` and three
columns as the large check, which still reads four tiles). Then:

- The field's quad keeps the bottom 8 rows, the feet, which don't move, so the oval and the grass meet them as before.
- The 24 rows above are 3 strips of 8 in the follower's own scene, as the large ones. Each moves along its own eye ray,
  shrunk so its pixels stay where they were, until its top edge stands a unit in front of the wall tile's edge along the
  ground (`sSmallLine`, eased as `sLine`), with no jut for eaves.
- The line is never in front of the feet, so no strip's top passes the bottom one along the ground, and moving toward
  the eye only raises a strip, never below the feet's window.
- A strip moves as far as its top needs, within the large split's cap (`FOLLOWING_RENDER_SPLIT_CAP`, 5 tiles of
  depth): 12.6, 7.5 and 2.3 units of depth at the centers' camera (top to bottom). `SplitSmallBody` places each strip
  with its own `FollowingRender_Strips` call, which gives the same strip as one call for all three.
- **The player limit** (the user's rule: strips never draw over the player, and the player is never moved). A strip
  whose picture overlaps the player's quad on the screen (`ScreenOverlap`: both quads' whole rectangles, each over its
  depth) moves no nearer the camera than `FOLLOWING_RENDER_SORT_BEHIND` (a unit) behind the player's quad
  (`GetSmallStripCap`). Depth is along the view axis, which is what a W-buffer compares, so in the centers too the
  strip is a unit behind the player wherever they overlap. With the player a tile in front the limit doesn't bind: the top
  strip reaches its line 1.4 behind them. Side by side at the counter, at the follower's depth, the strips can't move
  (a lowered follower stands 1.3 deeper than the player, so they move 0.3) and the counter cuts the middle rows on the
  down frames again: a row behind the player's camera-facing plane at the counter's height is behind the counter's
  face, so no pull can do both. The user accepted that. A player two tiles beside doesn't overlap.
- With no wall a tile behind, the follower draws whole, as before.

**Whether it runs at the counter.** The user saw the clipping unchanged after the strips' cap went from 6.4 units to the
large split's, which looked as if the split wasn't running. It runs: `IsWallAt` over the terrain CSV (every front tile,
x 2 to 12 of row 12, feet at z 196 to 205) finds the counter, the PC or the stairs' side a tile behind or beside it (the
counter's tiles: one layer at height 0, `above` 0, the collision flag set: not walkable, so a wall), and the file's own
`IsWallAt` to `SplitSmallBody`, compiled on the host over that terrain and camera, splits at every one of them, with the
wall line 7 units behind the feet. The facing doesn't enter the check. The ray cast clears rows 8 to 13 with either cap,
so the two versions draw the same: the 6.4 cap already covered the middle strip's 7.5 well enough. What the cast still
hides, with the split or not, is the bottom of the feet's window, which never moves: the floor covers the rows below the
terrain's height (the 3 lowest at rest, 6 on the down frames), and the counter's translucent floor shadow (`in02_kage`,
1.5 units up, out to z 201.6) dims 2 more in front of it. If the cut that shows is there, it is the lift against the
W-buffered floor, not the counter; pulling the feet's window too would need the oval and the grass moved with it.

`FollowingRender_Strips` takes its cap from the stack (`FollowingStripStack.cap`); `SplitBody` passes
`FOLLOWING_RENDER_SPLIT_CAP`, its old constant, and a host comparison of the old and new function over 2,000,000 random
64-pixel cases gave the same output in every one, again after the player limit (`SplitBody` and
`FollowingRender_Strips` didn't change). `GetWallLine`, `EaseLine` and `IsMaterialShared` are `SplitBody`'s code
moved, unchanged; the wall cache also keys on the distance read.

**To test** (melonDS): a 32-pixel follower (Pikachu) walking along a Pokémon Center's counter and the PC's, and standing
in front of them, facing each way: no middle rows cut on any frame, including the walk's down frames, the feet and the
oval where they were, and the strips meeting without a gap or a step; note any rows still cut, and whether they are
the feet's. With the player in front of, beside and behind the follower at the counter, the strips never draw over the
player (beside, the middle rows may be cut again). On a route, in a town's open square and in grass, nothing changes.
Against a building's wall a tile behind, the upper rows move toward the camera and the picture must not. A 64-pixel
follower outdoors in front of a wall: as before.

## A menu showed the waiting follower on the player

After a door or a warp the follower walks in: its actor is made at the player's own position, hidden and waiting,
until the player's first step. A menu (START's debug menu, the X menu) or any other event opened before that step
showed it there, on the player's tile, until the player walked. The cause, found in DeSmuME with a watch on the actor's
flags: the scene's pause (`Pause`, `paperwhite2_following_scene.c`) sets every follower actor's state to
`FOLLOWING_STATE_EVENT_PAUSED`, the waiting one too, and `PaperWhite2_FollowingUpdate`'s reveal (for a body whose sheet
loads after `Move` placed it) cleared the hidden flag for any paused follower. It now reveals a paused one only when the
state it goes back to after the events (`FollowingScene_GetResumeState`) is `FOLLOWING_STATE_FOLLOWING`, so a waiting
follower stays hidden through the menu and walks in on the player's first step, as without one. A follower that was out
when the menu opened stays where it was, on its trail behind the player.

## Walking sprites in the editor (2026-11-15)

A follower's walking sheet can be imported in the Pokémon Editor (Follower card, **Import a walking sprite…**, and the
Battle sprite card's zip, which carries each sheet in `follower/`): replace a sheet its rows show, or give a species
that follows with another's sheet (Flapple and Appletun with Budew's) a walking sprite of its own, which adds
`OBJ_CODE_POKEMON_<SPECIES>` after the last walking code, its `res/field/actors/pokemon/<species>/` sheet, and points
its rows at it with the layout's record fields and profile (6 frames mirrored, 8 asymmetric). `GetIndexOfObjID` ends
the walking codes at the generated `WALKING_LAST_OBJ_CODE`, so no C changes. Details and proof:
`docs/paperwhite2/design/battle-sprites.md` section 14.7.

## What remains

Every step of the base package is ported (1 to 6, above), each built with `--hack`, no warnings, `verify_dsi_rom.py`
intact, the memory check, and a plain build's `ninja build/w2_us/stamps/modules.ok`. Nothing has been tested in an
emulator yet: the lists of steps 3 to 6 are the test plan.

Open questions: none of the port's. The dialogue rules' remaining work is at the end of their section, below.

## Dialogue rules, gifts and steps

The user's design notes (2026-10-28, decided 2026-10-30) replace the contextual dialogues and one-time gifts with rules
of the conditions engine (`plugins.md`, Conditions): dialogue as steps, gifts as a step's action, pickups and ambient
emotes on the follower's own steps, and a little friendship from a talk once a day. Branch `follower-dialogue`.

### The sources and their formats

| Source | Schema | What |
| --- | --- | --- |
| `res/paperwhite2/following/dialogue/shared.json` | `dialogue.schema.json` | the rules every follower has (`rules`, the talk's; `ambient`; `pickup`), the library's message `bag_full`, and `settings.talk_friendship` |
| `res/paperwhite2/following/dialogue/species/<name>.json` | the same, with `species` | one species' own rules |
| `res/paperwhite2/following/pools.json` | `pools.schema.json` | named, weighted item lists (`item`, `weight`, `quantity`) |

Every rule is a conditions rule (`when`, `priority`, `weight`) with its consumer's fields, so the editor shares one
condition editor for all of them. The subject is the follower: `steps` are its steps since its last gift, the new
`total_steps` its total, `item_waiting` whether it keeps a found item, `terrain` its own tile's groups, `facing` the
way it faces to look at the player (the talk) or its own (ambient, pickup), and `tile_x`/`tile_y` the player's tile.
Selection is the engine's: of the rules that match, the highest priority, then a pick by weight (share 100).

- **A talk rule** has 1 to 16 steps. A step has any of `message`, `box` (default, bubble, yell, event), `emote` (a
  bubble of `interactions.json`: heart, happy, sad, angry, note, poison, ellipsis), `motion` (one of
  `interactions.json`'s 12, from 1; the sprite only), `cry` (none, cry, slow_cry), `wait` (frames) and `action`:
  `give_item` (with `quantity`), `give_pool`, `give_waiting`, `friendship` (-128 to 127), `script` (a script ID) or
  `reset_steps`. The action runs as the step begins, before its message, which names the gift as `{item}`.
- **An ambient rule** has an `emote`, a `cry` and a `cooldown` in steps.
- **A pickup rule** names its `pool`; its chance is its `when.chance`.
- **Messages** take Frost's text codes: `[N]` a new line, `[L]` the next line after A (the game's `{be01}` and a new
  line), `[C]` a new page after A (`{be00}` and a new line), and `{nickname}`, `{player}`, `{location}` (the zone's
  place name) and `{item}`, which become the game's word set's words 0 to 3. A message may be up to 1023 words, over as
  many pages as it needs: the windows' own print streams wait for A at each `[L]` and `[C]`.

`tools/paperwhite2/following_dialogue.py` packs them (its docstring has the byte layouts; `following_dialogue.py dump`
decodes the sources' blocks): member 4 "FWDL", a 32-byte header, an index of a block number per species (block 0 is the
shared rules alone), a block table, the blocks, and the texts (each once); member 5 "FWPL", the pools. A block is the
three tables of the engine (talk, ambient, pickup), each a `ConditionTable` whose rule payloads are the steps (16 bytes
each) or the ambient or pickup fields, then the rule's name for the debug menu. A species' block is the shared rules
without a species clause, the shared rules that name it, and its own; a species without any has block 0. A block
must fit 4096 bytes (the packer says which one doesn't).

### The runtime

- `paperwhite2_following_dialogue.c` (`following_dialogue.h`): reads the header, the species' index entry and its block
  (`GFL_ArcToolReadRange` through the field actors' open handle of `a/0/4/7`) into the 4 KiB buffer the contextual
  files used, checks it whole, and keeps it until the species changes or the field unloads; reads a message's words
  from the ROM only when it is shown, into the field's heap, formats them with the word set into a StrBuf, and frees
  them with the window; rolls a pool by reading its entries alone. `FollowingDialogue_FillContext` fills the context:
  world, field, party, the follower as subject with its record, its tile's terrain, the position.
- `paperwhite2_following_interaction.c`: a talk takes the library's rule first, the HeartGold interactions when none
  matches. Its steps play as before (motion, bubble, message, wait), with the step's window and action. A library step
  without a motion cries as it begins.
- `paperwhite2_following_ambient.c` (`following_ambient.h`): once a frame from `PaperWhite2_FollowingUpdate`. While the
  follower walks behind the player, or waits as its resting ball, each step of the player to another tile is a step
  of its party member; then, if it keeps no item, a pickup rule is chosen and its pool rolled, and the item waits on
  the Pokémon; then, while it is out and no talk or effect runs, an ambient rule's bubble shows over it, walking with
  it, followed by the rule's cooldown. An ambient cry is skipped while the sound system loads.
- `paperwhite2_following_data.c` (`following_data.h`): the record, the daily friendship and the gifts. A gift the Bag
  has no room for becomes the follower's waiting item if it keeps none, and the library's `bag_full` message is said
  instead of the step's; `give_waiting` gives it later (one item, whatever the pool's count). `paperwhite2_following_gifts.c`
  (the ten claims) is gone.

**Box styles**, the game's own windows (`scrcmd_msg.c`'s choices):

| Style | Window |
| --- | --- |
| default | the talk's balloon as before: `ActorMsgWin_CheckAndCreate(ACTOR_MSG_WIN_BOTTOM, TALKMSG_WIN_FRAME_NORMAL, TALKMSG_WIN_TAIL_NONE)`, the tail to the follower's side |
| bubble | an NPC's `ActorMsg` with `MSG_WIN_POS_AUTO`: `ActorMsgWin_CalcWinPosAuto` (above when the follower is farther up the screen than the player), `ActorMsgWin_GetBalloonTailParams`, `ActorMsgWin_GetBalloonOffset` |
| yell | the bubble with `TALKMSG_WIN_FRAME_SPIKY`, which shakes as it opens (`ActorMsg`'s spiky frame, as `ScreamMsg`'s) |
| event | `InfoMsg`'s plain window: `MsgBGPrinter_CreatePlainWin` across the bottom (1, 0x13, 30 by 4 tiles), no tail, closed at once with A or B |

All four were possible. **The script step** (`script`) runs after its step: the talk puts its windows and pose away and
ends the interaction, so the follower is back on its trail, then `GameEvent_Replace`s its own event with
`EventScriptCall_Create(script, the follower's actor)`. The scene policy then treats it as any script: the follower
waits through the commands it knows and is recalled for the others, as after an NPC's talk.

### The storage on the Pokémon

Five bytes, read as one 40-bit record (`FollowingRecord`): bits 0-9 the waiting item (0 none; past `ITEM_LAST` reads as
none), 10-21 the steps since the last gift (0-4095, stops there; cleared by `give_waiting` and `reset_steps`), 22-39
the total steps (0-262,143, stops there).

| Bytes | Field | PK5 offset | Param |
| --- | --- | --- | --- |
| block B 0x1c-0x1f | `PkmBlockB.unk1C` (u32) | 0x44-0x47 | `PKM_PARAM_UNK72` (`FOLLOWING_RECORD_PARAM_LOW`) |
| block C 0x16 | `PkmBlockC.unk16` (u8) | 0x5e | `PKM_PARAM_UNK76` (`FOLLOWING_RECORD_PARAM_HIGH`) |

Four bytes can't hold a 10-bit item, a useful step counter and a total; the fifth gives the total 18 bits. The other
candidates are left clean: `PkmBlockD.unk1D` (0x85, which Gen 4 transfers fill with their encounter type),
`PkmBlockD.unk1E` (0x86), `BoxPkm.unk4_3` (the header's flags word) and block C's ribbon bits.

**Evidence they are never written:**

- `src/system/poke_tool.c` writes them only in its generic set switch (`PML_PkmSetParamCore`, `PKM_PARAM_UNK72` and
  `_UNK76`); no other code names the params, and the add and block functions don't touch them.
- Every module's delinked object (`build/w2_us/delinks/`, all 1,800, complete C or not) disassembled with
  `arm-none-eabi-objdump -dr`: no call of `PokeParty_SetParam`, `PML_PkmSetParam` or their getters with r1 set to
  0x72 or 0x76 (or 0x9b, 0x9c) in the 14 instructions before it, where the same scan finds the known users of 0x9a and
  0x9d (`mystery_gift_pokemon.o`, `enc_pokeset.o`, `fld_trade.o`, `status_rcv.o`, ...). The only raw block users are
  `poke_tool.o` and the battle recorder (`battle_rec_tool.o`, which builds temporary Pokémon for videos).
- No code sets params in a loop over a range that includes them: the only such loops are the Shedinja copy's
  (`src/ov284/evolution_demo.c`: 0x19-0x35, 0x4d-0x6c, 0x78-0x8c). Shedinja is a copy of Nincada's data, so under
  `PAPERWHITE2` it now clears both fields.
- New Pokémon (wild, gifts, Mystery Gift, eggs from the Day Care, `PokeParty_CreatePkm`) start from a zeroed buffer
  and set named params only, so their record is 0; hatching and evolving keep the data.
- Poké Transfer: the parent (`src/ov181/mb_parent_sys.c`, `MBParent_StorePokemon`) stores the child's BoxPkm as it
  comes, only setting the met date. The child program converts Gen 4's data; it isn't in the decomp. PKHeX's model of
  that conversion zeroes 0x44-0x47 (Platinum and HeartGold's egg and met locations in Gen 4) and 0x5e; if a
  transferred Pokémon still had other values, they are at worst some steps, and an item past `ITEM_LAST` is none.
  Not verified against the child binary; trades and the GTS don't matter (the design notes).

**The daily friendship:** `EVENT_WORK_FOLLOWER_TALK_DAY_0` to `_5` (0x4052-0x4057, unused per
`tools/paperwhite2/var_usage.py --check`), each a Pokémon's 8-bit PID hash and the low byte of the save clock's day
number. A talk gives `talk_friendship` (1) once a day per Pokémon; a new Pokémon takes an entry of another day.

### Deep sand: the follower doesn't sink (decided 2026-11-14)

The player and NPCs sink into deep sand and lose their shadow (`ActorTerrainEffect_ApplyMoveEnd`: `_DeepSand` lowers
the drawn position 7 units on tile class 0x0c, `_UpdateShadowVisible` hides the shadow off shadow tiles); the follower
moves itself, so that pass never runs for it, as in Pokeweb's original. Calling the two functions from the follower's
`UpdateTerrain` worked (commit fba0fc732f, reverted), but the player's footprints in the sand then drew over the sunk
follower, and floating Pokémon would need exempting (only Flying types are known to the follower; the wanderers'
`"grass": false` encounter flag covers species with encounters only). The user chose to keep the follower above the
sand, shadow shown, rather than fix the draw order and add a levitation rule.

### The debug menu

START > Follower... (`res/field/scripts/global_10200.s`, actions 38-42, no new script IDs): the title shows the species,
steps and waiting item; Steps and item (the steps, the total, the item); Set steps... (a value, kept up to 4095);
Force a pickup (a pickup rule that matches at the greatest steps, chance or not, else pool 0; the item then waits);
Clear waiting item; Rules now (the talk rule that would be chosen, its priority and how many match, and the ambient
and pickup rules). Without a follower it says so.

### The sample content

- Shared: a found item (priority 20: a happy bubble, then `give_waiting` in the event window), low HP (10, hp at most
  25%), rain outdoors (5), night outdoors (4, two pages with `[C]` and `{location}`), grass (3, event window), cave
  (3), water (3: shallow water, puddles, the shore); ambient: a note while an item waits (cooldown 20), a happy bubble
  sometimes after 50 steps; pickup: `berries` (Oran, Pecha, Cheri, Leppa, Sitrus) after 100 steps at 10% a step.
- Keldeo: its Resolute Form yells (priority 2), water (6, two steps), a default and a friendship line (1).
- Snivy: sunny daytime outdoors (2) and a default (1).

### Memory

The arena on a DS: 150 KB left before (0x25960), 148 KB after (0x25060), 2.3 KB in all: overlay 36 0x740 more (the
library, the record and the ambient code, less the old dialogue and gift code), overlay 12 0x180 (the debug entries),
main the engine's new kinds. The 4 KiB block buffer is the one the contextual files had; a message takes its words
twice and its StrBuf from the field's heap while it shows, a pool roll its entries for a moment. The library is 4.5 KB
in the ROM now and can grow to hundreds of KB: only one block is ever in memory.

### To test (melonDS, `build/paperwhite2.nds`)

1. With Keldeo leading on a route, talk to it in grass: "is sniffing the grass." in the plain window across the bottom.
   On a puddle or the shore: Keldeo's two-step water line (the sprite's motion, then a happy bubble and a second
   balloon). Elsewhere: its default or friendship line (friendship 200+: Party > Friendship 255).
2. START > World > Time: Night, outdoors: the night line over two pages; A turns the page. Weather: Rain: the rain line.
   Party > a Pokémon at low HP (battle it down): the low-HP line with the slowed cry.
3. Resolute Keldeo: the spiky balloon that shakes. Snivy in sunny daytime: its sun line in the balloon above or below.
4. START > Follower... > Steps and item, walk ten tiles, again: the steps and total grow by 10 (not while it is
   recalled or a menu is open). Switch the follower with L/R: the old one's counts stay on it; the PC and a save and
   reload keep them.
5. Set steps... 100, then walk: within a few dozen steps a pickup (Steps and item shows the berry), and a note bubble
   shows over the follower now and then while walking, without stopping the player. Or Force a pickup.
6. Talk to it: "found something!", then "{player} received ... from ..." in the event window; the berry is in the Bag
   and the steps are back to 0. With the Berries pocket full: the bag_full message, and the item still waits.
7. Rules now in each place above: the talk rule named matches what the talk says (a weight pick may differ).
8. Friendship: Party > Friendship 70, talk twice: 71 after the first talk of the day, and no more that day.
9. Evolve a Nincada with a free slot and a Poké Ball after walking it: Shedinja's Steps and item reads 0.

### What remains

- **Movement routines on tiles** (running a circle if the 8 tiles are clear, running off and back): only the
  visual-only motions are built (the sprite's offset, as HeartGold's). The hook is the actions' list in
  `following_dialogue.h`: a walking action, played by the talk's motion stage with the field's collision checks
  (`ActorRouteCollCheckOneTileInDir`), and a condition on the surrounding tiles as a new clause kind.
- **No sample script step:** the `script` action and its hand-off are built and need a script to try (any global
  script ID; one of policy-known commands keeps the follower waiting).
- **Rails:** the talk's facing on a rail is the rail's line (0-3), not the compass, so `facing` clauses read the
  rail's; tile bounds read the player's grid tile, which rails don't move as on a grid.
- **Editor:** the formats are new (the schemas); Frost's editor needs the steps, boxes, pools and a page preview.
  Motions are numbers until `interactions.json` names them.
- **Not yet tested in an emulator.**
