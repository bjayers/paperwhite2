#include "asm/field_script.inc"
#include "text/script/virbank_city.h"

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
    ScriptEntry Script_20
    ScriptEntry Script_21
    ScriptEntry Script_22
    ScriptEntry Script_23
    ScriptEntry Script_24
    ScriptEntry Script_25
    ScriptEntry Script_26
    ScriptEntry Script_27
    ScriptEntry Script_28
    ScriptEntry Script_29
    ScriptEntry Script_30
    ScriptEntry Script_31
    ScriptEntriesEnd

Script_1:
    ActorsPauseAll
    EvCameraInit
    EvCameraUnbind
    EvCameraMoveTo 9688, 0, 0xed000, 0xd28000, 0, 0x28b8000, 45
    EvCameraWait
    // "???: Roxie,\ndon't try to stop me![f000]븁\u0000\nI'm off to Pokéstar Studios\nto live up to my true potential![f000]븁\u0000\nMy dream is to be a ship captain\nand a movie star![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_RoxieDontTryStop, 0, 0, 0
    MsgWinCloseAll
    ActorCmdExec 1, Movement_0124
    ActorCmdWait
    // "Roxie: Get real!\nYou're a captain already, aren't you?[f000]븁\u0000\nIf that ship doesn't move,\nyou're going to cause lots of trouble![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_RoxieGetRealYoure, 1, 4, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_012C
    ActorCmdWait
    // "Captain: Oh, dear daughter.[f000]븁\u0000\nYou split your time between your\nresponsibilities as a Gym Leader and[f000]븀\u0000\nwith your band, right?[f000]븀\u0000\nI can do that, too![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_CaptainOhDearDaughter, 0, 0, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_0134
    ActorCmdWait
    ActorDelete 0
    // "Roxie: AAAAAAH![f000]븁\u0000\nYou dim-witted...dense...dumb...daft...\ndippy...dorky...doltish DOOFUS![f000]븁\u0000\nDoing double duty isn't the problem!\nYou're causing problems for people![f000]븁\u0000\nKeeping people from getting where\nthey're going because of sheer[f000]븀\u0000\nselfishness is unforgivable![f000]븁\u0000\nI've HAD it!\nI'm going to the Gym![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_RoxieAaaaaahDimWitted, 1, 4, 0
    MsgWinCloseAll
    ActorCmdExec 1, Movement_0140
    ActorCmdWait
    ActorDelete 1
    EvCameraMoveToDefault 45
    EvCameraWait
    EvCameraRebind
    EvCameraEnd
    WorkSetConst EVENT_WORK_0x40ac, 2
    FlagSet EVENT_FLAG_0x02d6
    FlagSet EVENT_FLAG_ARRIVED_VIRBANK_CITY
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0124:
    Move 15, 1
    MoveEnd

Movement_012C:
    Move 34, 1
    MoveEnd

Movement_0134:
    Move 15, 5
    Move 12, 10
    MoveEnd

Movement_0140:
    Move 13, 8
    MoveEnd

Script_2:
    ActorsPauseAll
    VMStackPushFlag EVENT_FLAG_0x01ec
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0177
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Roxie's poison is intense!\nIt stings, stings, and stiiiings![f000]븁\u0000\nBut, know what I did?\nI caught a Magnemite in the complex,[f000]븀\u0000\nand I was just fine!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_RoxiesPoisonIntenseStings_2, 0, 0
    LastKeyWait
    ActorMsgClose
    VMJump L_01AF

L_0177:
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Roxie's poison is intense!\nIt stings, stings, and stiiiings![f000]븁\u0000\nBut, know what I did?\nI caught a Magnemite in the complex,[f000]븀\u0000\nand I was just fine![f000]븁\u0000\nHere, I'll give you these,\nso go catch a Magnemite or something![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_RoxiesPoisonIntenseStings, 2, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 4
    WorkSet 0x8001, 5
    RTCallGlobal 2806
    VMStackPop 0x8001
    VMStackPop 0x8000
    FlagSet EVENT_FLAG_0x01ec

L_01AF:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_3:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "If I didn't have Pokémon, all of the work\nat the complex would make me a wreck!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_IfDidntHavePokemon, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_4:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Kid!\nDo you know about the Battle Box?[f000]븁\u0000\nIt's a convenient feature you can use\non the PCs at the Pokémon Center."
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_KidKnowAboutBattle, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_5:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "This Watchog has been with me\nsince I was born![f000]븁\u0000\nIts Keen Eye Ability\nhas helped me so many times!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_WatchogHasBeenSince, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_6:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    // "Roxie's band![f000]븁\u0000\nIt's getting hard to buy\ntickets to their shows lately! ♪[f000]븁\u0000\nMaybe they'll go on a world\ntour soon!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_RoxiesBandItsGetting, 0, 0
    LastKeyWait
    MsgWinCloseAll
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_7:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Past here is the charming wonderland--\nPokéstar Studios![f000]븁\u0000\nIt's a movie studio, but right\nnow auditions are in progress...[f000]븁\u0000\nThey're having a look at the captain's\nacting. No unauthorized people allowed!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_PastHereCharmingWonderland, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_8:
    ActorsPauseAll
    PlayerGetGPos 0x8020, 0x8021
    WorkCmpConst 0x8020, 215
    VMJumpIf CMP_EQ, L_025B
    VMJump L_0273

L_025B:
    ActorCmdExec 6, Movement_0386
    ActorCmdWait
    ActorCmdExec 255, Movement_0396
    VMJump L_02F4

L_0273:
    WorkCmpConst 0x8020, 216
    VMJumpIf CMP_EQ, L_0286
    VMJump L_029E

L_0286:
    ActorCmdExec 6, Movement_039E
    ActorCmdWait
    ActorCmdExec 255, Movement_03AA
    VMJump L_02F4

L_029E:
    WorkCmpConst 0x8020, 218
    VMJumpIf CMP_EQ, L_02B1
    VMJump L_02C9

L_02B1:
    ActorCmdExec 6, Movement_03B2
    ActorCmdWait
    ActorCmdExec 255, Movement_03BE
    VMJump L_02F4

L_02C9:
    WorkCmpConst 0x8020, 219
    VMJumpIf CMP_EQ, L_02DC
    VMJump L_02F4

L_02DC:
    ActorCmdExec 6, Movement_03C6
    ActorCmdWait
    ActorCmdExec 255, Movement_03D6
    VMJump L_02F4

L_02F4:
    ActorCmdWait
    // "Past here is the charming wonderland--\nPokéstar Studios![f000]븁\u0000\nIt's a movie studio, but right\nnow auditions are in progress...[f000]븁\u0000\nThey're having a look at the captain's\nacting. No unauthorized people allowed![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_PastHereCharmingWonderland_2, 6, 0, 0
    MsgWinCloseAll
    ActorCmdExec 255, Movement_03DE
    ActorCmdWait
    WorkCmpConst 0x8020, 215
    VMJumpIf CMP_EQ, L_0321
    VMJump L_032F

L_0321:
    ActorCmdExec 6, Movement_03E6
    VMJump L_037E

L_032F:
    WorkCmpConst 0x8020, 216
    VMJumpIf CMP_EQ, L_034F
    WorkCmpConst 0x8020, 218
    VMJumpIf CMP_EQ, L_034F
    VMJump L_035D

L_034F:
    ActorCmdExec 6, Movement_03F2
    VMJump L_037E

L_035D:
    WorkCmpConst 0x8020, 219
    VMJumpIf CMP_EQ, L_0370
    VMJump L_037E

L_0370:
    ActorCmdExec 6, Movement_03FA
    VMJump L_037E

L_037E:
    ActorCmdWait
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0386:
    Move 2, 1
    Move 75, 1
    Move 14, 1
    MoveEnd

Movement_0396:
    Move 35, 1
    MoveEnd

Movement_039E:
    Move 2, 1
    Move 75, 1
    MoveEnd

Movement_03AA:
    Move 35, 1
    MoveEnd

Movement_03B2:
    Move 3, 1
    Move 75, 1
    MoveEnd

Movement_03BE:
    Move 34, 1
    MoveEnd

Movement_03C6:
    Move 3, 1
    Move 75, 1
    Move 15, 1
    MoveEnd

Movement_03D6:
    Move 34, 1
    MoveEnd

Movement_03DE:
    Move 13, 1
    MoveEnd

Movement_03E6:
    Move 15, 1
    Move 33, 1
    MoveEnd

Movement_03F2:
    Move 1, 1
    MoveEnd

Movement_03FA:
    Move 14, 1
    Move 33, 1
    MoveEnd

Script_9:
    ActorsPauseAll
    MEPlay SEQ_ME_CALL
    // "The Xtransceiver is ringing!"
    SystemMsg VirbankCity_Text_XtransceiverRinging, 2
    MEWait
    WordSetPlayerName 0
    // "[f000]Ā\u0001\u0000 picked up the\nXtransceiver![f000]븁\u0000"
    SystemMsg VirbankCity_Text_PickedUpXtransceiver, 2
    MsgWinCloseAll
    FadeOutBlackQ
    FadeWait
    CallXTransceiver 1, 0
    FadeInBlackQ
    FadeWait
    WorkSetConst EVENT_WORK_0x40ac, 1
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_10:
    ActorsPauseAll
    VMCall Script_25
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_11:
    ActorsPauseAll
    VMStackPush EVENT_WORK_0x40ac
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0484
    WordSetPlayerName 0
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Roxie: [f000]Ā\u0001\u0000!\nHelp out!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_RoxieHelpOut, 0, 0
    MsgWaitAdvance
    MsgWinCloseAll
    ActorCmdExec 7, Movement_04A4
    ActorCmdWait
    VMJump L_049E

L_0484:
    SEPlay SEQ_SE_MESSAGE
    ActorWalkRoute 255, 239, 670, 0, 8, 1
    ActorCmdWait
    VMCall Script_25

L_049E:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_04A4:
    Move 35, 1
    MoveEnd

Script_12:
    ActorsPauseAll
    VMStackPush EVENT_WORK_0x40ac
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_04DF
    WordSetPlayerName 0
    WordSetLoadRivalName 1
    SEPlay SEQ_SE_MESSAGE
    // "[f000]Ā\u0001\u0001: Dirty Pokémon thieves..."
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_DirtyPokemonThieves, 0, 0
    MsgWaitAdvance
    MsgWinCloseAll
    VMJump L_0543

L_04DF:
    SEPlay SEQ_SE_MESSAGE
    WorkSetConst 0x8022, 0
    PlayerGetDir 0x8022
    WorkCmpConst 0x8022, 3
    VMJumpIf CMP_EQ, L_0500
    VMJump L_0514

L_0500:
    ActorWalkRoute 255, 239, 670, 0, 8, 1
    VMJump L_053B

L_0514:
    WorkCmpConst 0x8022, 1
    VMJumpIf CMP_EQ, L_0527
    VMJump L_053B

L_0527:
    ActorWalkRoute 255, 239, 670, 0, 8, 0
    VMJump L_053B

L_053B:
    ActorCmdWait
    VMCall Script_25

L_0543:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_13:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Team Plasma: What?\nThink you can beat me?"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_TeamPlasmaWhatThink, 0, 0
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_075C
    TrainerBGMPlayPush TRAINER_TEAM_PLASMA_GRUNT_47
    // "Ha ha! Your Pokémon will be\nhelping us take over the world[f000]븀\u0000\nin a few seconds![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_HaHaPokemonWill, 0, 0
    MsgWinCloseAll
    CallTrainerBattle TRAINER_TEAM_PLASMA_GRUNT_44, 0, 0
    TrainerBattleIsVictory 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_05AA
    CallTrainerBattleEnd
    VMJump L_05AC

L_05AA:
    CallTrainerLose

L_05AC:
    ActorCmdExec 8, Movement_0770
    ActorCmdExec 7, Movement_0778
    ActorCmdWait
    ActorCmdExec 9, Movement_0780
    VMSleep 8
    ActorCmdExec 11, Movement_0790
    ActorCmdExec 10, Movement_07A0
    ActorCmdWait
    // "Team Plasma: I can't believe\nkids like these caught us off guard![f000]븁\u0000\nTch... Let's run![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_TeamPlasmaCantBelieve, 0, 0
    MsgWinCloseAll
    ActorCmdExec 9, Movement_07B0
    ActorCmdWait
    ActorCmdExec 9, Movement_07BC
    ActorCmdExec 255, Movement_07C4
    ActorCmdWait
    ActorWalkRoute 9, 228, 670, 1, 4, 0
    ActorWalkRoute 10, 228, 670, 1, 4, 1
    VMSleep 4
    ActorWalkRoute 11, 228, 670, 1, 4, 1
    VMSleep 16
    ActorCmdExec 255, Movement_07E4
    ActorCmdExec 7, Movement_07EC
    ActorCmdExec 8, Movement_07F4
    ActorCmdWait
    ActorDelete 9
    ActorDelete 10
    ActorDelete 11
    ActorCmdExec 8, Movement_07FC
    ActorCmdWait
    WordSetLoadRivalName 1
    // "[f000]Ā\u0001\u0001: Tsk!\nWhat a bunch of creeps![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_TskWhatBunchCreeps, 8, 0, 0
    MsgWinCloseAll
    // "Roxie: Split up! You,\ngo check Route 20![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_RoxieSplitUpGo, 7, 0, 0
    MsgWinCloseAll
    ActorCmdExec 7, Movement_0804
    ActorCmdWait
    ActorWalkRoute 7, 237, 669, 0, 8, 1
    ActorCmdWait
    // "If I'd lost, my precious\nPokémon would've been taken![f000]븁\u0000\nThanks, you two![f000]븁\u0000\nUse this![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_IfIdLostPrecious, 7, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 420
    WorkSet 0x8001, 1
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    ActorWalkRoute 7, 228, 669, 0, 4, 0
    ActorCmdWait
    ActorDelete 7
    ActorWalkRoute 8, 238, 670, 0, 8, 1
    ActorCmdWait
    ActorCmdExec 8, Movement_081C
    VMSleep 8
    ActorCmdExec 255, Movement_0824
    ActorCmdWait
    WordSetLoadRivalName 1
    // "[f000]Ā\u0001\u0001: That's...\na Hidden Machine, right?[f000]븀\u0000\nIt's Cut![f000]븁\u0000\nPokémon that know Cut\ncan use it even when they're not[f000]븀\u0000\nin battle to cut down small trees![f000]븁\u0000\nOh! But more importantly,\nlet's go after Team Plasma![f000]븁\u0000\nC’mon! We’re splitting up\nand searching Route 20![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_ThatsHiddenMachineRight, 8, 0, 0
    MsgWinCloseAll
    ActorWalkRoute 8, 228, 670, 0, 4, 0
    VMSleep 8
    ActorCmdExec 255, Movement_082C
    ActorCmdWait
    ActorDelete 8
    SEWait
    WorkSetConst EVENT_WORK_0x40ac, 6
    FlagSet EVENT_FLAG_0x02d4
    FlagReset EVENT_FLAG_0x02bd
    FlagReset EVENT_FLAG_0x02be
    FlagSet EVENT_FLAG_0x09fe
    WorkSetConst EVENT_WORK_0x40ab, 5
    VMJump L_076A

L_075C:
    // "That's right!\nDon't try opposing us!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_ThatsRightDontTry, 0, 0
    LastKeyWait
    MsgWinCloseAll

L_076A:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0770:
    Move 3, 1
    MoveEnd

Movement_0778:
    Move 3, 1
    MoveEnd

Movement_0780:
    Move 71, 1
    Move 11, 1
    Move 72, 1
    MoveEnd

Movement_0790:
    Move 71, 1
    Move 11, 1
    Move 72, 1
    MoveEnd

Movement_07A0:
    Move 71, 1
    Move 11, 1
    Move 72, 1
    MoveEnd

Movement_07B0:
    Move 38, 4
    Move 18, 1
    MoveEnd

Movement_07BC:
    Move 18, 2
    MoveEnd

Movement_07C4:
    Move 71, 1
    Move 18, 1
    Move 72, 1
    Move 1, 1
    Move 71, 1
    Move 16, 1
    Move 72, 1
    MoveEnd

Movement_07E4:
    Move 34, 1
    MoveEnd

Movement_07EC:
    Move 34, 1
    MoveEnd

Movement_07F4:
    Move 34, 1
    MoveEnd

Movement_07FC:
    Move 14, 1
    MoveEnd

Movement_0804:
    Move 17, 1
    Move 18, 5
    Move 10, 1
    Move 63, 2
    Move 3, 1
    MoveEnd

Movement_081C:
    Move 32, 1
    MoveEnd

Movement_0824:
    Move 33, 1
    MoveEnd

Movement_082C:
    Move 34, 1
    MoveEnd

Script_14:
    VMStackPush EVENT_WORK_0x40ac
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0883
    ActorSetGPos 8, 240, 0, 671, 3
    ActorSetGPos 7, 240, 0, 669, 3
    ActorSetGPos 9, 240, 0, 670, 2
    ActorSetGPos 11, 241, 0, 671, 2
    ActorSetGPos 10, 241, 0, 669, 2

L_0883:
    VMHalt
    .byte 0x00

Script_15:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "This is Virbank City!\nCity of falling fog and rising stars!"
    MsgPlaceSign VirbankCity_Text_VirbankCityCityFalling, 1
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_16:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Pokéstar Studios Ahead\nBringing a new golden age of cinema!"
    MsgPlaceSign VirbankCity_Text_PokestarStudiosAheadBringing, 2
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_17:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Virbank City Pokémon Gym\nLeader: Roxie[f000]븀\u0000\nPoison days, poison on the stage!"
    MsgPlaceSign VirbankCity_Text_VirbankCityPokemonGym, 2
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_18:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    PVPlay 505, 0
    // "Hoooog!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_Hoooog, 0, 0
    PVWait
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_19:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "My Medal's really pretty, isn't it?![f000]븁\u0000\nIf you solve the Hint Medal riddles,\nyou can collect more and more of them!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_MedalsReallyPrettyIsnt, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_20:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "First, turn the C-Gear's power on![f000]븁\u0000\nThen tap [f000][ff00]\u0001\u0001CONNECTED[f000][ff00]\u0001\u0000\nin the center of the C-Gear screen[f000]븀\u0000\nto check the Tag Log!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_FirstTurnCGears, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_21:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "First, turn the C-Gear's power on![f000]븁\u0000\nThen tap [f000][ff00]\u0001\u0001WIRELESS[f000][ff00]\u0001\u0000.\nFinally, tap [f000][ff00]\u0001\u0001ENTRALINK[f000][ff00]\u0001\u0000![f000]븀\u0000\nIf you have some time, give it a try![f000]븀\u0000\nIt's amazing!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_FirstTurnCGears_2, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_22:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "One, two, three, four, five, six![f000]븁\u0000\nThe number of Poké Balls\nyou can put in your belt is six.[f000]븀\u0000\nSo you can take six Pokémon with you!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_OneTwoThreeFour, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_23:
    ActorsPauseAll
    EvCameraInit
    EvCameraUnbind
    EvCameraMoveTo 9688, 0, 0xed000, 0xf18000, 0, 0x29e8000, 20
    EvCameraWait
    // "Roxie: Oh, you're back.\nSo, uh...[f000]븁\u0000\nHow was your movie?[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_RoxieOhYoureBack, 1, 4, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_0BB4
    ActorCmdWait
    // "Pop Roxie: The movie was...[f000]븁\u0000\nNo, it wasn't the movie. It was me.\nI was so excited that I didn't really[f000]븀\u0000\nbecome Riolu-Man![f000]븁\u0000\nActing like that won't\nthrill or excite anyone...[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_PopRoxieMovieNo, 0, 6, 0
    MsgWinCloseAll
    // "Roxie: C'mon!\nDon't get down![f000]븁\u0000\nYou can keep trying while\nyou continue on as captain![f000]븁\u0000\nAs long as you don't cause anyone\ntrouble, I won't get mad.[f000]븁\u0000\nI don't know how the Pokéstar Studios\npeople feel about that, though![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_RoxieCmonDontGet, 1, 4, 0
    MsgWinCloseAll
    ActorCmdExec 1, Movement_0BBC
    ActorCmdWait
    ActorCmdExec 1, Movement_0BC4
    ActorCmdWait
    PlayerGetGPos 0x8020, 0x8021
    WorkCmpConst 0x8021, 669
    VMJumpIf CMP_EQ, L_09E9
    VMJump L_09F5

L_09E9:
    WorkSetConst 0x8021, 670
    VMJump L_0A33

L_09F5:
    WorkCmpConst 0x8021, 670
    VMJumpIf CMP_EQ, L_0A08
    VMJump L_0A14

L_0A08:
    WorkSetConst 0x8020, 240
    VMJump L_0A33

L_0A14:
    WorkCmpConst 0x8021, 671
    VMJumpIf CMP_EQ, L_0A27
    VMJump L_0A33

L_0A27:
    WorkSetConst 0x8021, 670
    VMJump L_0A33

L_0A33:
    ActorWalkRoute 1, 0x8020, 0x8021, 1, 8, 1
    ActorCmdWait
    PlayerGetGPos 0x8020, 0x8021
    WorkCmpConst 0x8021, 669
    VMJumpIf CMP_EQ, L_0A5C
    VMJump L_0A78

L_0A5C:
    ActorCmdExec 1, Movement_0BCC
    VMSleep 8
    ActorCmdExec 255, Movement_0BD4
    ActorCmdWait
    VMJump L_0AC0

L_0A78:
    WorkCmpConst 0x8021, 670
    VMJumpIf CMP_EQ, L_0A8B
    VMJump L_0A91

L_0A8B:
    VMJump L_0AC0

L_0A91:
    WorkCmpConst 0x8021, 671
    VMJumpIf CMP_EQ, L_0AA4
    VMJump L_0AC0

L_0AA4:
    ActorCmdExec 1, Movement_0BDC
    VMSleep 8
    ActorCmdExec 255, Movement_0BE4
    ActorCmdWait
    VMJump L_0AC0

L_0AC0:
    WordSetLoadRivalName 1
    // "Oh...\nDid you hear us?[f000]븁\u0000\nWell, it looks like everyone\nfrom Team Plasma got away...[f000]븁\u0000\nI don't feel really good about it,\nbut at least they're gone.[f000]븁\u0000\nOh! There was a lot of ruckus, but\nyou can sail to Castelia City now![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_OhDidHearUs, 1, 0, 0
    MsgWinCloseAll
    PlayerGetGPos 0x8020, 0x8021
    WorkCmpConst 0x8021, 669
    VMJumpIf CMP_EQ, L_0AEA
    VMJump L_0AF6

L_0AEA:
    WorkSetConst 0x8021, 670
    VMJump L_0B34

L_0AF6:
    WorkCmpConst 0x8021, 670
    VMJumpIf CMP_EQ, L_0B09
    VMJump L_0B15

L_0B09:
    WorkSetConst 0x8021, 669
    VMJump L_0B34

L_0B15:
    WorkCmpConst 0x8021, 671
    VMJumpIf CMP_EQ, L_0B28
    VMJump L_0B34

L_0B28:
    WorkSetConst 0x8021, 670
    VMJump L_0B34

L_0B34:
    ActorWalkRoute 1, 228, 0x8021, 1, 8, 1
    VMSleep 12
    ActorCmdExec 255, Movement_0BEC
    ActorCmdWait
    ActorDelete 1
    // "Pop Roxie: OK! I guess\nI'll do my best as a captain![f000]븁\u0000\nI'll excite and thrill everyone\nby barreling through rough waves![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_PopRoxieOkGuess, 0, 6, 0
    MsgWinCloseAll
    ActorCmdExec 255, Movement_0BF4
    ActorWalkRoute 0, 242, 669, 1, 8, 0
    ActorCmdWait
    ActorCmdExec 0, Movement_0BFC
    ActorCmdWait
    SEPlay SEQ_SE_KAIDAN
    ActorDelete 0
    SEWait
    EvCameraMoveToDefault 20
    EvCameraWait
    EvCameraRebind
    EvCameraEnd
    FlagSet EVENT_FLAG_0x02d6
    FlagReset EVENT_FLAG_0x02fb
    WorkSetConst EVENT_WORK_0x40ac, 8
    FlagReset EVENT_FLAG_0x02d2
    FlagReset EVENT_FLAG_0x02d3
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0BB4:
    Move 161, 1
    MoveEnd

Movement_0BBC:
    Move 34, 1
    MoveEnd

Movement_0BC4:
    Move 75, 1
    MoveEnd

Movement_0BCC:
    Move 32, 1
    MoveEnd

Movement_0BD4:
    Move 33, 1
    MoveEnd

Movement_0BDC:
    Move 33, 1
    MoveEnd

Movement_0BE4:
    Move 32, 1
    MoveEnd

Movement_0BEC:
    Move 34, 1
    MoveEnd

Movement_0BF4:
    Move 35, 1
    MoveEnd

Movement_0BFC:
    Move 12, 1
    MoveEnd

Script_24:
    VMStackPush EVENT_WORK_0x40ac
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0C59
    ObjInitNPCGPos 8, 3, 240, 0, 671
    ObjInitNPCGPos 7, 3, 240, 0, 669
    ObjInitNPCGPos 9, 2, 240, 0, 670
    ObjInitNPCGPos 11, 2, 241, 0, 671
    ObjInitNPCGPos 10, 2, 241, 0, 669
    VMJump L_0C84

L_0C59:
    VMStackPush EVENT_WORK_0x40ac
    VMStackPushConst 7
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0C84
    ObjInitNPCGPos 1, 3, 241, 0, 670
    ObjInitNPCGPos 0, 2, 243, 0, 670

L_0C84:
    VMHalt

Script_25:
    BGMPlay SEQ_BGM_E_PLASMA
    // "Roxie: So, are you guys\nTeam Plasma, then?[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_RoxieGuysTeamPlasma, 7, 0, 0
    MsgWinCloseAll
    // "That's right!\nWe're Team Plasma![f000]븁\u0000\nTwo years ago...\nWe were betrayed by the man[f000]븀\u0000\nwe respected as our king and hero![f000]븁\u0000\nSo our conquest of the Unova region\nended in failure![f000]븁\u0000\nHowever! We'll never give up!\nWe will persevere![f000]븁\u0000\nWe already have another\nplan in motion.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_ThatsRightWereTeam, 9, 0, 0
    MsgWinCloseAll
    ActorCmdExec 8, Movement_0D42
    ActorCmdWait
    WordSetLoadRivalName 1
    // "[f000]Ā\u0001\u0001: Shut it![f000]븁\u0000\nYou guys are the worst.\nYou talk about saving Pokémon,[f000]븀\u0000\nbut you're just Pokémon thieves![f000]븀\u0000\nDon't think I'll ever forgive you![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_ShutGuysWorstTalk, 8, 0, 0
    MsgWinCloseAll
    // "Team Plasma: In the ranch,\nwe got chased by Lillipup...[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_TeamPlasmaRanchWe, 11, 0, 0
    MsgWinCloseAll
    // "Team Plasma: And now we're getting\ninvolved in trouble. This kinda stinks.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_TeamPlasmaNowWere, 10, 0, 0
    MsgWinCloseAll
    // "Team Plasma: Well, it's OK, isn't it?\nIf we steal their Pokémon...[f000]븁\u0000\nOK, kiddos, when you're\nready, give it your best shot![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_TeamPlasmaWellIts, 9, 0, 0
    MsgWinCloseAll
    ActorCmdExec 9, Movement_0D4A
    VMSleep 8
    ActorCmdExec 11, Movement_0D52
    ActorCmdExec 10, Movement_0D5A
    ActorCmdWait
    VMSleep 20
    ActorCmdExec 8, Movement_0D62
    ActorCmdExec 7, Movement_0D6A
    ActorCmdWait
    ActorCmdExec 8, Movement_0D72
    ActorCmdWait
    // "[f000]Ā\u0001\u0001: I'll crush you\nand your new plans![f000]븁\u0000\nI can never forgive Team Plasma![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_IllCrushNewPlans, 8, 0, 0
    MsgWinCloseAll
    BGMChangeMap
    WorkSetConst EVENT_WORK_0x40ac, 5
    VMReturn
    .byte 0x00

Movement_0D42:
    Move 15, 1
    MoveEnd

Movement_0D4A:
    Move 14, 1
    MoveEnd

Movement_0D52:
    Move 14, 1
    MoveEnd

Movement_0D5A:
    Move 14, 1
    MoveEnd

Movement_0D62:
    Move 15, 1
    MoveEnd

Movement_0D6A:
    Move 15, 1
    MoveEnd

Movement_0D72:
    Move 100, 1
    MoveEnd

Script_26:
    WorkSetConst EVENT_WORK_0x401f, 1
    RTCallGlobal 10852
    WorkCmpConst 0x8012, 1
    VMJumpIf CMP_EQ, L_0F1A
    VMJump L_0D97

L_0D97:
    FlagGet EVENT_FLAG_0x021d, 0x8008
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0DB0
    VMJump L_0E16

L_0DB0:
    ObjInitNPCGPos 24, 1, 236, 0, 651
    ObjInitNPCGPos 26, 1, 210, 3, 642
    ObjInitNPCGPos 27, 1, 212, 3, 642
    ObjInitNPCGPos 31, 1, 228, 3, 647
    ObjInitNPCGPos 32, 1, 227, 3, 642
    ObjInitNPCGPos 33, 1, 228, 3, 642
    ObjInitNPCGPos 34, 1, 230, 3, 642
    ObjInitNPCGPos 37, 1, 232, 3, 666
    VMJump L_104F

L_0E16:
    FlagGet EVENT_FLAG_0x021e, 0x8008
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0E2F
    VMJump L_0E95

L_0E2F:
    ObjInitNPCGPos 24, 1, 212, 3, 647
    ObjInitNPCGPos 26, 1, 208, 3, 647
    ObjInitNPCGPos 27, 1, 212, 3, 645
    ObjInitNPCGPos 31, 1, 235, 3, 642
    ObjInitNPCGPos 32, 1, 222, 3, 645
    ObjInitNPCGPos 33, 1, 225, 3, 667
    ObjInitNPCGPos 34, 1, 194, 3, 647
    ObjInitNPCGPos 37, 1, 241, 3, 666
    VMJump L_104F

L_0E95:
    FlagGet EVENT_FLAG_0x021f, 0x8008
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0EAE
    VMJump L_0F14

L_0EAE:
    ObjInitNPCGPos 24, 1, 251, 65534, 670
    ObjInitNPCGPos 26, 1, 211, 3, 642
    ObjInitNPCGPos 27, 1, 229, 3, 642
    ObjInitNPCGPos 31, 1, 235, 3, 642
    ObjInitNPCGPos 32, 1, 237, 3, 642
    ObjInitNPCGPos 33, 1, 223, 3, 667
    ObjInitNPCGPos 34, 1, 221, 3, 642
    ObjInitNPCGPos 37, 1, 232, 3, 667
    VMJump L_104F

L_0F14:
    VMJump L_104F

L_0F1A:
    ObjInitNPCGPos 24, 1, 211, 3, 642
    ObjInitNPCGPos 26, 1, 223, 3, 642
    ObjInitNPCGPos 27, 1, 209, 3, 642
    ObjInitNPCGPos 31, 1, 229, 3, 642
    ObjInitNPCGPos 32, 1, 231, 3, 642
    ObjInitNPCGPos 33, 1, 224, 3, 642
    ObjInitNPCGPos 34, 1, 221, 3, 642
    ObjInitNPCGPos 37, 1, 239, 3, 642
    Random 0x8009, 3
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_0F93
    VMJump L_0FC3

L_0F93:
    ObjInitNPCGPos 25, 1, 222, 3, 645
    ObjInitNPCGPos 28, 1, 222, 3, 647
    ObjInitNPCGPos 29, 1, 225, 3, 667
    ObjInitNPCGPos 30, 1, 194, 3, 647

L_0FC3:
    WorkCmpConst 0x8009, 1
    VMJumpIf CMP_EQ, L_0FD6
    VMJump L_1006

L_0FD6:
    ObjInitNPCGPos 25, 1, 212, 3, 647
    ObjInitNPCGPos 28, 1, 223, 3, 667
    ObjInitNPCGPos 29, 1, 222, 3, 644
    ObjInitNPCGPos 30, 1, 224, 3, 647

L_1006:
    WorkCmpConst 0x8009, 2
    VMJumpIf CMP_EQ, L_1019
    VMJump L_1049

L_1019:
    ObjInitNPCGPos 25, 1, 194, 3, 656
    ObjInitNPCGPos 28, 1, 241, 3, 667
    ObjInitNPCGPos 29, 1, 228, 3, 647
    ObjInitNPCGPos 30, 1, 212, 3, 645

L_1049:
    VMJump L_104F

L_104F:
    VMHalt
    .byte 0x00

Script_27:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Pi-coo... coo..."
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_PiCooCoo, 0, 0
    LastKeyWait
    ActorMsgClose
    Random 0x8008, 100
    WorkCmpConst 0x8008, 95
    VMJumpIf CMP_GE, L_1081
    VMJump L_1095

L_1081:
    WorkSetConst 0x8010, 519
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 24
    VMHalt

L_1095:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_28:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Pesky Ratatta getting into\nthe shipments again...[f000]븁\u0000\nI'll get in trouble again if it\nruins anything..."
    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_PeskyRatattaGettingInto, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_29:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 88, 0
    ActorCmdExec 22, Movement_10DE
    WorkSetConst 0x8010, 88
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 22
    VMHalt

Movement_10DE:
    Move 75, 1
    MoveEnd

Script_30:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 19, 0
    ActorCmdExec 23, Movement_110E
    ActorCmdWait
    WorkSetConst 0x8010, 19
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 23
    VMHalt

Movement_110E:
    Move 75, 1
    MoveEnd

Script_31:
    ActorsPauseAll
    ActorSetEyeToEye
    Random 0x8008, 100
    WorkCmpConst 0x8008, 10
    VMJumpIf CMP_GE, L_1133
    VMJump L_115D

L_1133:
    PVPlay 19, 0
    ActorCmdExec 36, Movement_1190
    ActorCmdWait
    PVWait
    ActorCmdExec 36, Movement_1198
    ActorCmdExec 255, Movement_11A4
    ActorCmdWait
    VMJump L_1186

L_115D:
    WorkSetConst 0x8010, 19
    RTCallGlobal 10854
    // "It dropped what it dug\nout of the trash..."
    InfoMsg VirbankCity_Text_DroppedWhatDugOut, 2
    LastKeyWait
    InfoMsgClose
    WorkSetConst 0x8010, 4
    WorkSetConst 0x8011, 30
    RTCallGlobal 10853
    VMJump L_1186

L_1186:
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 36
    VMHalt

Movement_1190:
    Move 75, 1
    MoveEnd

Movement_1198:
    Move 81, 5
    Move 83, 8
    MoveEnd

Movement_11A4:
    Move 48, 1
    Move 1, 1
    MoveEnd
