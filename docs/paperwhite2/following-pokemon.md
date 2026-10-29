# Following Pokémon: the port

The plan and the map for porting Pokeweb's Following Pokémon runtime (bjayers/pokeweb-serverless, pull request #1,
branch `pr-1`, commit 315ca50 "Show the follower's own ball type", `runtime/following-pokemon/`) from its five PMC DLLs
into this source, 1:1 with the user's ROM (`orig/paperwhite2_v0.21.nds`). Only the **base package** is ported: grounded
followers, L/R cycling, dialogue, emotes, effects, scene safety, walking-gap positioning, the Options row and the
battle opening, with the follower's own ball type. Riding and custom Surf (the "full" package: `surf.c`, `land.c`,
`land_speed.c`, `transition.c` and their `.s`, `FW_MOUNT`, `FW_ARCEUS_SURF`) are dropped. The work is on the branch
`following-port`. How hack code is added is `plugins.md`.

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
| event-opcode-fetch | `0x02015970` | `VM_Run` +0x44 (`src/system/vm.c`) | `VM_Read16` | `FollowingResidentOpcode` | sees each script command's opcode, for the scene policy (keep the follower out or recall it) |
| event-callback | `0x02016cf8` | `GameEvent_RunCallback` (`src/system/game_event.c`) | whole function | `FollowingResidentCallback` | forwards the callback and notes the running event |
| event-free | `0x02016d08` | `GameEvent_Free` (same) | prologue | `FollowingResidentFree` | drops tokens tied to an event, then the original |
| event-vm-free | `0x020158f8` | `VM_Free` (`src/system/vm.c`) | whole function | `FollowingResidentVmFree` | drops a script's token, then frees as the original |
| field-actor-update | ov036 `0x02180078` | `FieldRoutine_Run` +0xd4 (`src/ov036/fieldmap.c`) | `FldActSys_Update` | `FollowingUpdate` | the follower's frame: creates, moves, recalls it, then updates the actors. Ported: `PaperWhite2_FollowingUpdate` wraps `FldActSys_Update` (step 3) |
| field-follower-matcache | ov036 `0x0217fe88` | `FieldRoutine_MapSpawnFinish` +0x58 (same) | `FieldG3D_Update` | `FollowingPreloadFollower`, then the original | binds the follower's sprite while the map is spawned. Ported: `PaperWhite2_FollowingPreloadFollower(field, field->actorSystem)` before `FieldG3D_Update` (step 3) |
| field-unload | ov036 `0x021801e4` | `FieldRoutine_MapUnload` (same) | whole function | `FollowingUnload`, then the original | frees the follower before the field's actors. Ported: `PaperWhite2_FollowingUnload` at the function's start (step 3) |
| field-actor-billboard-draw | ov036 `0x0218119a` | `FieldRenderPhase2_Fieldmap` +0xaa (same) | `BillboardActorSys_Draw` (the actors) | `FollowingDraw` | the actors' pass with the follower's and player's depth corrections and map light. Ported: `PaperWhite2_FollowingDraw` in place of the call (step 3) |
| field-terrain-billboard-draw | ov036 `0x021811b0` | `FieldRenderPhase2_Fieldmap` +0xc0 (same) | `BillboardActorSys_Draw` (the grass at `field + 0xc8`) | `FollowingTerrainDraw` | grass over the follower's feet. Ported: `PaperWhite2_FollowingTerrainDraw` in place of the call (step 3) |
| field-billboard-draw | ov036 `0x0218122e` | `FieldRenderPhase2_Fieldmap` +0x13e (same) | `BillboardActorSys_Draw` (the effects) | `FollowingEffectsDraw` | the recall flash, ball and emote bubbles. Ported: `PaperWhite2_FollowingEffectsDraw` in place of the call: the shadow pass (step 3), then `FollowingEffects_Draw` (step 4) |
| field-player-recall-direction-gate | ov036 `0x0219a610` | `FieldPlayer_GetMoveDirByKey` (`src/ov036/field_player.c`) | whole function | `FollowingPlayerMoveDir` | holds the D-pad while the follower is recalled. Ported: `PaperWhite2_FollowingHoldsPlayer` returns `PLAYER_DIR_NONE` first (step 3) |
| follower-grid-event | ov036 `0x021818bc` | `FieldEventProvider_Grid` +0x20 (`src/ov036/fieldmap_event.c`) | `FieldEventProvider_Grid_CheckForEvent` | `FollowingGridEvents` | talking to the follower (A in front of it) when the field's events found none, and the scene's menu marker for a menu they opened (L/R is in the field's update in the base package). Ported: `PaperWhite2_FollowingGridEvent(gsys, field, event, &scriptCalled, menuOpened)` after the call; a talk counts as a script called (step 4; the marker is a stub until scene.c) |
| follower-rail-event | ov036 `0x02181a6c` | `FieldEventProvider_NoGrid` +0x4 (same) | `FieldEventProvider_NoGrid_CheckForEvent` | `FollowingRailEvents` | the talk on rails, when the field's events found none. Ported: `PaperWhite2_FollowingRailEvent(gsys, field, event)` after the call (step 4) |
| event-actor-action-queued | ov012 `0x02166ecc` | `FldAct_SetAcmd` +0x4 (`src/ov012/field_actor.c`) | `SetNextActorAcmd` | `FollowingEventAction` | a script moving an actor: recall the follower if it is in the way |
| event-actor-action-reset | ov012 `0x02166ef4` | `FldAct_SetLocalAcmd` +0x4 (same) | `SetNextActorAcmd` | `FollowingEventAction` | the same |
| event-actor-allocation | ov012 `0x02166836` | `CreateNewActorByEntity` +0x1e (same) | `GetPtrToFirstFreeActorSlot` | `FollowingEventAllocate` | a new actor on the follower's tile or slot |
| event-actor-position | ov012 `0x02167c0c` | `SetActorWPosAll` (same) | prologue | `FollowingEventPosition` | an actor placed on the follower |
| event-actor-delete | ov012 `0x02166980` | `DeleteActor` (same) | prologue | `FollowingEventDelete` | the follower deleted by someone else |
| event-actor-world-step | ov012 `0x02167348` | `SetActorWPosValue` (same) | whole function | `FollowingEventWorldStep` | an actor stepping onto the follower |
| ambient-callback | ov012 `0x021671c8` | `FldAct_CallMoveProc` (same) | whole function | `FollowingAmbientUpdate` | NPCs' own movement around the follower |
| ambient-grid-collision | ov012 `0x0215e538` | `CheckActorNewPosOtherActorCollision` (`src/ov012/field_actor_tool.c`) | whole function | `FollowingAmbientGrid` | NPCs don't walk into the follower |
| ambient-rail-collision | ov036 `0x02195714` | `RailActor_CheckCollision` +0x6c (`src/ov036/field_actor_rail.c`) | `RailActor_CheckActorCollision` | `FollowingAmbientRail` | the same on rails |
| options-init | ov140 `0x0219d002` | `ConfigPanel_Init` +0x142 (`src/ov140/config_panel.c`) | `ConfigPanelScroll_Init` | `FollowingOptionsInit` | the sixth row, FOLLOWERS: ON/OFF |
| options-exit | ov140 `0x0219d0b0` | `ConfigPanel_Exit` +0x28 (same) | `ConfigPanelScroll_Exit` | `FollowingOptionsExit` | frees the row |
| options-main | ov140 `0x0219eb6e` | `ConfigPanelSeq_Input` +0x66 (same) | `ConfigPanelScroll_Main` | `FollowingOptionsMain` | the row's input and drawing |
| options-select | ov140 `0x0219dd8a` | `ConfigPanelAppBar_Main` +0x22 (same) | `ConfigPanelScroll_GetCursor` | `FollowingOptionsSelect` | the cursor on the row |
| options-compare-exit, -cancel | ov140 `0x0219ebec`, `0x0219ec22` | `ConfigPanelSeq_Input` +0xe4, +0x11a (same) | `ConfigPanelOptions_Equals` | `FollowingOptionsCompare` | a staged change counts as a change |
| options-commit | ov140 `0x0219ee2e` | `ConfigPanelSeq_Save` +0x16 (same) | `ConfigPanelOptions_Apply` | `FollowingOptionsCommit` | stores the choice in Options bit 11 |
| battle-wild-opening | ov167 `0x021d12b4` | `BtlvScu_StartEncount` +0x1f0 (`src/ov167/btlv_scu.c`) | the wild intro's procedure pointer | `FollowingBattleWild` | a slot-1 follower already on the platform: no throw, send-out or "Go!" |
| battle-trainer-opening | ov167 `0x021d12b8` | `BtlvScu_StartEncount` +0x1f4 (same) | the trainer intro's procedure pointer | `FollowingBattleTrainer` | the same in trainer battles |

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
| `positioning.narc` (30,972 bytes) | one member "FWPO" version 1: 24-byte header (2,574 land rows of 12 bytes, 0 Surf rows, the registry's CRC, payload CRC) and per row the up, down, left and right gaps (each `min(side gap + 6, 10 - abs(art X))` here) and 8 zero rider bytes; an optional member 1 of zone overrides (none) | `positioning.c` (header and one row per lookup) | the gaps in the per-follower JSON, packed with the registry, step 3 |
| `interactions.bin` (3,852 bytes) | "FWTK" ABI 1: 34 rules, 12 motions, 27 messages (UCS-2 with 0xFFFF end, 0xFFFE newline, 0xFFF0 nickname, 0xFFF1 player), 7 bubbles, with emotes.narc's size and CRC | `interaction.c` `load` (whole, into an 8 KB buffer), `reactions.c` | `a/0/4/7` member 3, from `res/paperwhite2/following/interactions.json` (rules, motions, messages as text, bubbles; `interactions.schema.json`); the emotes' size and CRC computed from members 6-19, done |
| `emotes.narc` (10,076 bytes) | 14 BTX0 members (7 bubbles × 2 frames, 32×32, 16 colors), from HeartGold | `effects.c` (members), `interaction.c` (size and CRC) | `a/0/4/7` members 6-19 (bubble order, 2 frames each), from `res/paperwhite2/following/emotes/<bubble>_{1,2}.png` and `.pal`, packed with `nitro_btx.py` (`split_from`: the search nodes Pokeweb's ndspy split kept), done |
| `effects.narc` (3,052 bytes) | 3 members: the ball model (BMD0), the send-out flash (BMD0), its texture animation (BTA0), from HeartGold's `a/1/0/3` 129, 104, 164; size and CRC compiled in (`effects_assets.h`) | `effects.c` | `a/0/4/7` members 20-22, from `res/paperwhite2/following/effects/` (`ball.nsbmd`, `send_out_flash.nsbmd`, `.nsbta`), as they are, done |
| `ball_assets.h` (4,000 bytes, compiled in) | for each White 2 ball ID 1-25, its 16x16 4bpp texture (128 bytes) and 16 BGR555 colors, from Pokeweb's `ball-art/*.png` (`import_balls.py`) | `effects.c` (put over the ball model's texture and palette) | `a/0/4/7` member 23, from `res/paperwhite2/following/balls/<ball>.png`, done (step 4) |
| `contextual-dialogues.narc` (76 bytes) | one member "FWCD" ABI 1-3 (empty: 0 rules) | `interaction.c` (whole, 4 KB), `reactions.c` | `a/0/4/7` member 4 (the NARC's member), from `res/paperwhite2/following/dialogues.json` (`dialogues.schema.json` documents ABI 3's fields), done |
| `contextual-items.narc` (76 bytes) | one member "FWTI" ABI 1-2 (empty) | `interaction.c`, `gifts.c` | `a/0/4/7` member 5 (the NARC's member), from `res/paperwhite2/following/items.json` (`items.schema.json`, ABI 2's fields), done |
| `install.json` | the installer's state | nothing in the game | not ported |
| `a/0/0/2` member 32 (`title_2` bank) | the Options rows' text, four entries changed | the Options menu | `res/text/system/`, step 5 |

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
   `interaction.c`, `reactions.c`, `gifts.c`, the rest of `field.c`, their hooks and data.
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
(`following_render.h`) is `render.c`: the actors' pass (registry Y, two pixels of lift, the follower's own light, the
strips of a 64-pixel body in front of a wall), the grass pass and the shadow pass, and the effect pose for step 4.
native.bin's values: the enabled switch is `FOLLOWING_ENABLED`; the model table's row count is file 0's first u32
(3,582), the resources are `a/0/4/8`'s file count (1,323), both checked against the registry's header by its stream,
and the registry's outer CRC-32 is the positioning table's (`FollowingPositioning_ReadRegistryCrc`, the one other file
that records it; `0xf1693dee` in the hack). The core's publish and clear went with step 3's first part.

**Stubs for step 4** (`include/paperwhite2/following_hooks.h`, each `// TODO step 4:`): the ball effects
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

## What remains

Port in this order, each step built with `--hack`, no warnings, `verify_dsi_rom.py` intact, the memory check, and a
plain build's `ninja build/w2_us/stamps/modules.ok`:

1. **Data as sources**: done (below, "The registry and positioning").
2. **Core**: done. `src/paperwhite2/main/paperwhite2_following_resident.c` and
   `include/paperwhite2/following_resident.h`: the tokens (restore, mount, summon, generic by kind and size, as the
   original) and the event hooks, which the field binds (`PaperWhite2_FollowingBindEventHooks`) and clears.
   `VM_Run` calls `PaperWhite2_FollowingOnOpcode` after each `VM_Read16`, `GameEvent_RunCallback` asks
   `PaperWhite2_FollowingHoldEvent` before the callback (TRUE returns `GAMEEVENT_CONTINUE`, the original's 0),
   `GameEvent_Free` and `VM_Free` call theirs before freeing. The original's resident bridge passed the event to the
   events module, which read the callback and the game system from it by offset; ported, the hooks get them. Main
   grew 0x220 bytes; nothing of the hack's is in the IRDO range.
3. **Field**: done but for the talk (above, "Step 3: the follower in the field"). The follower-grid-event and
   follower-rail-event hooks are only the talk and the menu's marker in the base package, so they are step 4's.
4. **Events and the rest of the field**: `events.c` (`src/paperwhite2/ov012/`, its hooks in `field_actor.c` and
   `field_actor_tool.c`, `field_actor_rail.c`), `scene.c` with `scene-policy.h` (generate it from the two policy
   JSON files in `res/paperwhite2/following/`), `effects.c` (with `ball_assets.h`, the ball types), `interaction.c`,
   `reactions.c`, `gifts.c`, the grid/rail event hooks, and the data of interactions, emotes, effects, dialogues and
   items. The stubs of `following_hooks.h` become those modules'
   calls (and the header goes), the talk (`try_talk`, the snapshot in `SelectFollower`) joins the field file, and
   `FollowingScene_Poll` takes no argument again.
5. **Options** (`src/paperwhite2/ov140/`): `options.c`, its seven hooks in `config_panel.c`, and `a/0/0/2` member 32's
   four `title_2` entries in `res/text/system/`.
6. **Battle** (`src/paperwhite2/ov167/`): `battle.c` and the two procedure pointers in `btlv_scu.c`.

Size check: the field module was 84 KB as GCC built it; overlay 36 has 0x7520 bytes before the DS arena moves, and
the arena 210 KB after the heaps.
