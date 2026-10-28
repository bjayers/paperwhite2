#include "asm/field_script.inc"
#include "text/script/floccesy_town.h"

    ScriptEntry Script_1
    ScriptEntry Script_2
    ScriptEntry Script_3
    ScriptEntry Script_4
    ScriptEntry Script_5
    ScriptEntry Script_6
    ScriptEntry Script_7
    ScriptEntry Script_8
    ScriptEntry Script_9
    ScriptEntry Script_10
    ScriptEntry Script_11
    ScriptEntry Script_12
    ScriptEntry Script_13
    ScriptEntry Script_14
    ScriptEntry Script_15
    ScriptEntry Script_16
    ScriptEntry Script_17
    ScriptEntry Script_18
    ScriptEntry Script_19
    ScriptEntriesEnd

Script_1:
    VMStackPush EVENT_WORK_0x40a5
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0073
    ObjInitNPCGPos 0, 1, 113, 2, 669
    VMJump L_00A2

L_0073:
    VMStackPush EVENT_WORK_0x40a5
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMStackPush EVENT_WORK_0x40a5
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMStackCmp CMP_OR
    VMJumpIf CMP_STACK, L_00A2
    ObjInitNPCGPos 0, 3, 111, 2, 669

L_00A2:
    VMHalt

Script_2:
    VMHalt

Script_3:
    ActorsPauseAll
    ActorCmdExec 0, Movement_0124
    ActorCmdWait
    PlayerGetGPos 0x8022, 0x8023
    VMStackPush 0x8023
    VMStackPushConst 695
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_00E5
    ActorWalkRoute 0, 110, 0x8023, 1, 8, 1
    ActorCmdWait
    ActorCmdExec 0, Movement_0130
    ActorCmdWait

L_00E5:
    WordSetPlayerName 0
    // "Alder: Oh, that's right! [f000]Ā\u0001\u0000,\nare your Pokémon well?[f000]븁\u0000\nYour Pokémon are always doing\ntheir best for you, the Trainer,[f000]븀\u0000\nso you must always be kind to them![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_AlderOhThatsRight, 0, 0, 0
    // "My house is just a little farther![f000]븁\u0000\nStop by the Pokémon Center\nfirst if you'd like![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_HouseJustLittleFarther, 0, 0, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_0138
    ActorCmdWait
    ActorSetGPos 0, 113, 2, 669, 1
    WorkSetConst EVENT_WORK_0x40a5, 1
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0124:
    Move 75, 1
    Move 34, 1
    MoveEnd

Movement_0130:
    Move 34, 1
    MoveEnd

Movement_0138:
    Move 15, 3
    Move 12, 11
    MoveEnd

Script_4:
    ActorsPauseAll
    PlayerGetGPos 0x8022, 0x8023
    VMStackPush 0x8022
    VMStackPushConst 113
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_017F
    WorkSub 0x8023, 1
    ActorWalkRoute 0, 0x8022, 0x8023, 1, 8, 0
    ActorCmdWait
    ActorCmdExec 0, Movement_0272
    ActorCmdWait

L_017F:
    // "Alder: Hey, this way!\nShall we start training?[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_AlderHeyWayShall, 0, 0, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_027A
    ActorCmdWait
    // "By the way...why are you\nholding two Town Maps?[f000]븁\u0000\n...[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_ByWayWhyHolding, 0, 0, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_0282
    ActorCmdWait
    // "Oh ho!\nIt's your friend's Town Map, is it?[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_OhHoItsFriends, 0, 0, 0
    MsgWinCloseAll
    VMStackPush EVENT_WORK_0x4030
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01DB
    WordSetPokeSpecies 0, 501
    VMJump L_01FE

L_01DB:
    VMStackPush EVENT_WORK_0x4030
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01F9
    WordSetPokeSpecies 0, 498
    VMJump L_01FE

L_01F9:
    WordSetPokeSpecies 0, 495

L_01FE:
    // "Your friend is the one with\nthe [f000]ā\u0001\u0000, isn't he?[f000]븁\u0000\nIt just so happens, he was training\nhis Pokémon on Route 20...[f000]븁\u0000\nWell, if that's the case, you should\ngo give him the Town Map first![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_FriendOneIsntHe, 0, 0, 0
    MsgWinCloseAll
    EvCameraInit
    EvCameraUnbind
    EvCameraMoveTo 9688, 0, 0xed000, 0x718000, 0x2001f, 0x29a5000, 40
    ActorCmdExec 0, Movement_028A
    ActorCmdWait
    EvCameraWait
    // "Just follow this road.\nIt goes to Route 20![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_JustFollowRoadGoes, 0, 0, 0
    MsgWinCloseAll
    EvCameraMoveToDefault 40
    ActorWalkRoute 0, 111, 669, 1, 8, 0
    ActorCmdWait
    EvCameraWait
    EvCameraRebind
    EvCameraEnd
    ActorCmdExec 0, Movement_0296
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x40a5, 2
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0272:
    Move 33, 1
    MoveEnd

Movement_027A:
    Move 159, 1
    MoveEnd

Movement_0282:
    Move 75, 1
    MoveEnd

Movement_028A:
    Move 12, 2
    Move 35, 1
    MoveEnd

Movement_0296:
    Move 35, 1
    MoveEnd

Script_5:
    ActorsPauseAll
    ActorCmdExec 0, Movement_0328
    ActorCmdWait
    PlayerGetGPos 0x8022, 0x8023
    VMStackPush 0x8023
    VMStackPushConst 668
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_02D9
    ActorCmdExec 255, Movement_0330
    ActorCmdExec 0, Movement_0338
    VMJump L_02FC

L_02D9:
    VMStackPush 0x8023
    VMStackPushConst 670
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_02FC
    ActorCmdExec 255, Movement_0340
    ActorCmdExec 0, Movement_0348

L_02FC:
    ActorCmdWait
    // "Just follow this road.\nIt goes to Route 20![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_JustFollowRoadGoes, 0, 0, 0
    MsgWinCloseAll
    ActorCmdExec 255, Movement_0350
    VMSleep 8
    ActorCmdExec 0, Movement_0358
    ActorCmdWait
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0328:
    Move 75, 1
    MoveEnd

Movement_0330:
    Move 33, 1
    MoveEnd

Movement_0338:
    Move 32, 1
    MoveEnd

Movement_0340:
    Move 32, 1
    MoveEnd

Movement_0348:
    Move 33, 1
    MoveEnd

Movement_0350:
    Move 15, 1
    MoveEnd

Movement_0358:
    Move 35, 1
    MoveEnd

Script_6:
    ActorsPauseAll
    PlayerGetGPos 0x8022, 0x8023
    ActorWalkRoute 0, 0x8022, 669, 1, 8, 0
    ActorCmdWait
    ActorCmdExec 0, Movement_038E
    ActorCmdWait
    VMCall Script_18
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_038E:
    Move 32, 1
    MoveEnd

Script_7:
    ActorsPauseAll
    PlayerGetGPos 0x8022, 0x8023
    ActorWalkRoute 0, 0x8022, 668, 1, 8, 0
    ActorCmdWait
    ActorCmdExec 0, Movement_03C4
    ActorCmdWait
    VMCall Script_18
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_03C4:
    Move 33, 1
    MoveEnd

Script_8:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Just follow this road.\nIt goes right to Route 20![f000]븁\u0000\nI'll be waiting here until you\ndeliver the Town Map!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_JustFollowRoadGoes_2, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_9:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "People always think the past\nor the future would be so wonderful.[f000]븁\u0000\nBut the great time we're\nspending with Pokémon[f000]븀\u0000\nis right now!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_PeopleAlwaysThinkPast, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_10:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "I always save a record of my adventure,\nso I don't forget what I've done so far![f000]븀\u0000\nIt's a good idea for any Trainer!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_AlwaysSaveRecordAdventure, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_11:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "You see, in Floccesy Ranch,\nwild Pokémon might surprise you![f000]븁\u0000\nAt times like that, only your\nown Pokémon can help you out!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_SeeFloccesyRanchWild, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_12:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "In the morning, my Pokémon come\nto wake me up when they're hungry.[f000]븁\u0000\nAt night, my Pokémon get tired\nfrom playing and take up the whole bed![f000]븁\u0000\nOh! It fills me with so much joy!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_MorningPokemonComeWake, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_13:
    ActorsPauseAll
    ActorCmdExec 10, Movement_0480
    ActorCmdWait
    ActorDelete 10
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Floccesy Town\nProphecy Flocks Here"
    MsgPlaceSign FloccesyTown_Text_FloccesyTownProphecyFlocks, 1
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0480:
    Move 16, 8
    MoveEnd

Script_14:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Are you happy you're\nable to train Pokémon?"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_HappyYoureAbleTrain, 0, 0
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_04C5
    // "Right?!\nMe too!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_RightToo, 0, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_04D3

L_04C5:
    // "Huh? But you're traveling\nwith Pokémon!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_HuhButYoureTraveling, 0, 0
    LastKeyWait
    MsgWinCloseAll

L_04D3:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_15:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "It's an old clock tower..."
    MsgPlaceSign FloccesyTown_Text_ItsOldClockTower, 2
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_16:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Want to know what Alder taught me?"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_WantKnowWhatAlder, 0, 0
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0531
    // "He said the Pokémon you throw out at\nthe start of battle is the one[f000]븀\u0000\nin the upper-left slot in your party![f000]븁\u0000\nThat's why I put a Pokémon I want\nto make stronger or a Pokémon that's[f000]븀\u0000\nalready tough in that spot!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_HeSaidPokemonThrow, 0, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_053F

L_0531:
    // "You're being too bashful!\nIt's a good opportunity! Ask away!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_YoureBeingTooBashful, 0, 0
    LastKeyWait
    MsgWinCloseAll

L_053F:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_17:
    ActorsPauseAll
    WordSetPlayerName 0
    ActorNew 113, 662, 0, 251, 249, 0
    WorkSetConst 0x8024, 0
    TrainerCardGetSex 0x8024
    VMStackPush 0x8024
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0581
    // "Bianca: Heeey![f000]븁\u0000"
    InfoMsg FloccesyTown_Text_BiancaHeeey, 2
    VMJump L_0586

L_0581:
    // "Bianca: Hey there![f000]븁\u0000"
    InfoMsg FloccesyTown_Text_BiancaHeyThere, 2

L_0586:
    MsgWinCloseAll
    WorkSetConst 0x8024, 0
    BGMPlay SEQ_BGM_E_BERU
    ActorCmdExec 255, Movement_06CA
    ActorCmdWait
    PlayerGetGPos 0x8022, 0x8023
    WorkSub 0x8022, 2
    ActorWalkRoute 251, 0x8022, 0x8023, 1, 8, 1
    ActorCmdWait
    // "I'm sorry![f000]븁\u0000\nI forgot to tell you about the\nPokédex that I gave you![f000]븁\u0000\nIt has a Habitat List too!\nIt's an amazing feature![f000]븀\u0000\nHere, let me show you...[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_ImSorryForgotTell, 251, 0, 0
    MsgWinCloseAll
    ActorCmdExec 251, Movement_06D2
    ActorCmdWait
    SEPlay SEQ_SE_SW_ZKN_KAIHOU
    // "Bianca takes your Pokédex."
    SystemMsg FloccesyTown_Text_BiancaTakesPokedex, 0
    SEWait
    MsgWaitAdvance
    InfoMsgClose
    // "With the Habitat List, you can check\nwhich Pokémon are in the area![f000]븁\u0000\nIt's a mode in the Pokédex![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_HabitatListCanCheck, 251, 0, 0
    // "To use it, open up the Pokédex like this\nand tap \"Habitat List\" right here[f000]븀\u0000\non the lower left of the Touch Screen![f000]븁\u0000\nNext, pick the area you want to see![f000]븁\u0000\nYou can see all the Pokémon that live in\nthat area. It even tells you which ones[f000]븀\u0000\nyou've already caught![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_UseOpenUpPokedex, 251, 0, 0
    VMJump L_0650
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0650
    WorkSetConst 0x8025, 0
    WorkSetConst 0x8025, 0

L_0621:
    VMStackPush 0x8025
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_064A
    // "To use it, open up the Pokédex like this\nand tap \"Habitat List\" right here[f000]븀\u0000\non the lower left of the Touch Screen![f000]븁\u0000\nNext, pick the area you want to see![f000]븁\u0000\nYou can see all the Pokémon that live in\nthat area. It even tells you which ones[f000]븀\u0000\nyou've already caught![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_UseOpenUpPokedex, 251, 0, 0
    YesNoWin 0x8025
    VMJump L_0621

L_064A:
    WorkSetConst 0x8025, 0

L_0650:
    MsgWinCloseAll
    ActorCmdExec 251, Movement_06DA
    ActorCmdWait
    // "Oh, and I have a tip for you![f000]븁\u0000\nWhen you're walking down\na path, you'll sometimes see[f000]븀\u0000\nrustling grass![f000]븁\u0000\nSometimes you can find rare\nPokémon in the rustling grass,[f000]븀\u0000\nso don't ignore it![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_OhHaveTipWhen, 251, 0, 0
    MsgWinCloseAll
    ActorCmdExec 251, Movement_06E2
    ActorCmdWait
    VMSleep 16
    ActorCmdExec 251, Movement_06EA
    ActorCmdWait
    // "Filling up the Pokédex will\nmake your world bigger![f000]븁\u0000\nSo go to many different places\nand meet many different Pokémon, OK?[f000]븁\u0000\nSee you![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_FillingUpPokedexWill, 251, 0, 0
    MsgWinCloseAll
    ActorWalkRoute 251, 113, 662, 1, 8, 0
    VMSleep 16
    BGMChangeMap
    ActorCmdWait
    ActorDelete 251
    WorkSetConst EVENT_WORK_0x4153, 2
    HollowRivalSetValue 3, 0
    FlagSet EVENT_FLAG_0x02e6
    FlagSet EVENT_FLAG_0x02e5
    WorkSetConst EVENT_WORK_0x40a8, 4
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_06CA:
    Move 34, 1
    MoveEnd

Movement_06D2:
    Move 15, 1
    MoveEnd

Movement_06DA:
    Move 75, 1
    MoveEnd

Movement_06E2:
    Move 32, 1
    MoveEnd

Movement_06EA:
    Move 35, 1
    MoveEnd

Script_18:
    // "Alder: Oh! It looks like you've\ndelivered the Town Map to your friend![f000]븁\u0000\nHrm...[f000]븁\u0000\nYou were only gone a moment,\nbut you and your Pokémon have grown.[f000]븁\u0000\nWhy, I could almost mistake you\nfor someone else![f000]븁\u0000\nWell then. Instead of training you,\nI would like you and your Pokémon[f000]븀\u0000\nto give me a hand![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyTown_Text_AlderOhLooksLike, 0, 0, 0
    MsgWinCloseAll
    ActorWalkRoute 0, 107, 662, 1, 8, 0
    VMSleep 16
    ActorCmdExec 255, Movement_075E
    ActorCmdWait
    BMCreateHandleByGPos 0x8020, 1, 107, 661
    BMHndAudioVisualAnmPlay 0x8020, 0
    BMHndAnmWait 0x8020
    ActorCmdExec 0, Movement_0766
    ActorCmdWait
    SEPlay SEQ_SE_KAIDAN
    ActorDelete 0
    SEWait
    BMHndAudioVisualAnmPlay 0x8020, 1
    BMHndAnmWait 0x8020
    BMReleaseHandle 0x8020
    WorkSetConst EVENT_WORK_0x40a5, 4
    FlagSet EVENT_FLAG_0x02db
    VMReturn

Movement_075E:
    Move 34, 1
    MoveEnd

Movement_0766:
    Move 12, 1
    MoveEnd

Script_19:
    VMHalt
