#include "asm/field_script.inc"
#include "text/script/floccesy_ranch_2.h"

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
    ScriptEntry Script_32
    ScriptEntry Script_33
    ScriptEntry Script_34
    ScriptEntriesEnd

Script_1:
    VMHalt

Script_2:
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00B1
    ActorSetGPos 0, 22, 2, 32, 1
    VMJump L_00FB

L_00B1:
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00D6
    ActorSetGPos 0, 22, 3, 13, 1
    VMJump L_00FB

L_00D6:
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 4
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00FB
    ActorSetGPos 0, 47, 2, 13, 1
    VMJump L_00FB

L_00FB:
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 5
    VMStackCmp CMP_LT
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 0
    VMStackCmp CMP_NE
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_0148
    ActorSetGPos 1, 43, 2, 46, 2
    ActorSetGPos 2, 43, 2, 45, 2
    ActorSetGPos 10, 44, 2, 46, 2
    VMJump L_018B

L_0148:
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_018B
    ActorSetGPos 1, 46, 2, 42, 1
    ActorSetGPos 2, 47, 2, 42, 1
    ActorSetGPos 10, 45, 2, 40, 3
    ActorSetGPos 3, 47, 2, 40, 2

L_018B:
    VMHalt
    .byte 0x00

Script_3:
    ActorsPauseAll
    PlayerGetGPos 0x8021, 0x8022
    ActorSetGPos 0, 33, 2, 0x8022, 2
    WorkSub 0x8021, 1
    ActorWalkRoute 0, 0x8021, 0x8022, 1, 8, 0
    BGMPlayPush SEQ_BGM_E_HUE
    ActorCmdWait
    WordSetLoadRivalName 1
    // "[f000]Ā\u0001\u0001: Oh! Nice!\nYou've come here to toughen up![f000]븁\u0000\nAll right! Let's see how much\nstronger you've become! Come at me![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_OhNiceYouveCome, 0, 0, 0
    MsgWinCloseAll
    VMStackPush EVENT_WORK_0x4030
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01EE
    CallTrainerBattle TRAINER_RIVAL_4, 0, 0
    VMJump L_0217

L_01EE:
    VMStackPush EVENT_WORK_0x4030
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_020F
    CallTrainerBattle TRAINER_RIVAL_5, 0, 0
    VMJump L_0217

L_020F:
    CallTrainerBattle TRAINER_RIVAL_6, 0, 0

L_0217:
    TrainerBattleIsVictory 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_024E
    ActorSetGPos 0, 42, 2, 46, 0
    ActorSetGPos 255, 42, 2, 45, 1
    CallTrainerBattleEnd
    VMJump L_0250

L_024E:
    CallTrainerLose

L_0250:
    WordSetLoadRivalName 1
    // "[f000]Ā\u0001\u0001: Not bad...[f000]븁\u0000\nYou're thinking about how to bring out\nyour Pokémon's strength.[f000]븁\u0000\nI should be able to count\non you for backup![f000]븁\u0000\nWhat are you doing here anyway?[f000]븁\u0000\nHuh?\nA Town Map?[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_NotBadYoureThinking, 0, 0, 0
    MsgWinCloseAll
    WordSetPlayerName 0
    SEPlay SEQ_SE_ARDEMO_01
    // "[f000]Ā\u0001\u0000 handed over\nthe Town Map![f000]븁\u0000"
    SystemMsg FloccesyRanch2_Text_HandedOverTownMap, 0
    InfoMsgClose
    SEWait
    // "[f000]Ā\u0001\u0001: Tch...\nShe didn't have to do that...[f000]븁\u0000\nThanks to you, too. We just left,\nand you've already helped me out.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_TchSheDidntHave, 0, 0, 0
    MsgWinCloseAll
    FlagReset EVENT_FLAG_0x02d7
    ActorAdd 2
    ActorWalkRoute 2, 44, 45, 1, 8, 1
    VMSleep 4
    ActorAdd 1
    ActorWalkRoute 1, 44, 46, 1, 8, 1
    ActorAdd 10
    ActorWalkRoute 10, 45, 46, 1, 8, 1
    VMSleep 24
    ActorCmdExec 255, Movement_041C
    ActorCmdExec 0, Movement_0424
    ActorCmdWait
    // "???: I thought it was lively around here!\nYou were having a Pokémon battle, huh?[f000]븀\u0000\nIsn't it nice to be young![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_ThoughtLivelyAroundHere, 1, 6, 0
    MsgWinCloseAll
    WordSetLoadRivalName 1
    // "[f000]Ā\u0001\u0001: Who are you?[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_Who, 0, 4, 0
    MsgWinCloseAll
    // "???: Who am I?[f000]븁\u0000\nI'm the owner of this ranch!\nAnd this is my wife![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_WhoAmImOwner, 1, 6, 0
    MsgWinCloseAll
    PlayerGetGPos 0x8021, 0x8022
    ActorWalkRoute 2, 43, 45, 1, 8, 0
    ActorCmdWait
    // "Wife: After a Pokémon battle, you\nshould heal your Pokémon's HP, right?[f000]븀\u0000\nHere, I'll give you this![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_WifeAfterPokemonBattle, 2, 5, 0
    MsgWinCloseAll
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 17
    WorkSet 0x8001, 1
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    ActorWalkRoute 2, 43, 46, 1, 8, 0
    ActorCmdWait
    ActorCmdExec 2, Movement_042C
    ActorCmdWait
    // "And one for you![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_One, 2, 5, 0
    MsgWinCloseAll
    VMSleep 12
    ActorWalkRoute 2, 44, 45, 1, 8, 1
    ActorCmdWait
    ActorCmdExec 2, Movement_0434
    ActorCmdWait
    // "It's nice to have Potions when\nyou're far away from a Pokémon Center.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_ItsNiceHavePotions, 2, 5, 0
    MsgWinCloseAll
    // "Owner: By the way, you didn't happen\nto see a Herdier around here, did you?[f000]븁\u0000\nI can't figure out where it went.[f000]븁\u0000\nOur two Herdier are always together\nand this is the first time one has[f000]븀\u0000\nwandered off, so I'm a little worried...[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_OwnerByWayDidnt, 1, 6, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_043C
    ActorCmdWait
    WordSetLoadRivalName 1
    // "[f000]Ā\u0001\u0001: You're a little worried?\nAre you KIDDING me?![f000]븁\u0000\nYour Pokémon might be lost forever![f000]븁\u0000\nWhatever! I'll look!\n[f000]Ā\u0001\u0000! Help out![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_YoureLittleWorriedKidding, 0, 4, 0
    MsgWinCloseAll
    ActorCmdExec 255, Movement_0444
    ActorCmdExec 0, Movement_044C
    ActorCmdWait
    ActorCmdExec 1, Movement_0454
    ActorCmdExec 255, Movement_045C
    ActorCmdWait
    // "Owner: Why did he get so mad?[f000]븁\u0000\nI think it's probably just\nplaying somewhere in the ranch.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_OwnerWhyDidHe, 1, 6, 0
    MsgWinCloseAll
    // "Wife: I wonder...[f000]븁\u0000\nBy the way, dear, if your Pokémon\nget hurt, let me know.[f000]븀\u0000\nI'll make them feel better for you!"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_WifeWonderByWay, 2, 5, 0
    LastKeyWait
    MsgWinCloseAll
    ActorSetGPos 0, 25, 2, 44, 0
    WorkSetConst EVENT_WORK_0x40a7, 1
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_041C:
    Move 35, 1
    MoveEnd

Movement_0424:
    Move 35, 1
    MoveEnd

Movement_042C:
    Move 34, 1
    MoveEnd

Movement_0434:
    Move 34, 1
    MoveEnd

Movement_043C:
    Move 75, 1
    MoveEnd

Movement_0444:
    Move 34, 1
    MoveEnd

Movement_044C:
    Move 18, 11
    MoveEnd

Movement_0454:
    Move 159, 1
    MoveEnd

Movement_045C:
    Move 35, 1
    MoveEnd

Script_4:
    ActorsPauseAll
    PlayerGetGPos 0x8021, 0x8022
    WorkAdd 0x8022, 2
    ActorSetGPos 0, 21, 2, 42, 0
    ActorWalkRoute 0, 0x8021, 0x8022, 1, 8, 0
    VMSleep 24
    ActorCmdExec 255, Movement_04FA
    ActorCmdWait
    WordSetLoadRivalName 1
    // "[f000]Ā\u0001\u0001: Did Herdier...\nwander somewhere back here?[f000]븁\u0000\nLet's have a look![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_DidHerdierWanderSomewhere, 0, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8021
    VMStackPushConst 21
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_04CC
    ActorCmdExec 0, Movement_0502
    VMJump L_04D4

L_04CC:
    ActorCmdExec 0, Movement_050E

L_04D4:
    VMSleep 8
    ActorCmdExec 255, Movement_051A
    ActorCmdWait
    ActorSetGPos 0, 22, 3, 22, 0
    WorkSetConst EVENT_WORK_0x40a7, 2
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_04FA:
    Move 33, 1
    MoveEnd

Movement_0502:
    Move 19, 1
    Move 16, 12
    MoveEnd

Movement_050E:
    Move 18, 1
    Move 16, 12
    MoveEnd

Movement_051A:
    Move 32, 1
    MoveEnd

Script_5:
    ActorsPauseAll
    ActorSetGPos 0, 22, 3, 19, 0
    PlayerGetGPos 0x8021, 0x8022
    VMStackPush 0x8022
    VMStackPushConst 11
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_055B
    ActorCmdExec 0, Movement_0618
    VMSleep 40
    VMJump L_059F

L_055B:
    VMStackPush 0x8022
    VMStackPushConst 12
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0580
    ActorCmdExec 0, Movement_0624
    VMSleep 32
    VMJump L_059F

L_0580:
    VMStackPush 0x8022
    VMStackPushConst 13
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_059F
    ActorCmdExec 0, Movement_0630
    VMSleep 24

L_059F:
    ActorCmdExec 255, Movement_063C
    ActorCmdWait
    // "Oh! Here! I'll share something\ngood with you![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_OhHereIllShare, 0, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 22
    WorkSet 0x8001, 1
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    WordSetLoadRivalName 1
    // "If your Pokémon is paralyzed,\nuse one of these on it![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_IfPokemonParalyzedUse, 0, 0, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_0644
    ActorCmdWait
    ActorCmdExec 0, Movement_0650
    ActorCmdWait
    // "Still, Pokémon don't just wander\noff on their own.[f000]븁\u0000\nIn a worst-case scenario,\nit might be involved in some trouble!"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_StillPokemonDontJust, 0, 0, 0
    LastKeyWait
    MsgWinCloseAll
    WorkSetConst EVENT_WORK_0x40a7, 3
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0618:
    Move 16, 8
    Move 39, 1
    MoveEnd

Movement_0624:
    Move 16, 7
    Move 39, 1
    MoveEnd

Movement_0630:
    Move 16, 6
    Move 39, 1
    MoveEnd

Movement_063C:
    Move 34, 1
    MoveEnd

Movement_0644:
    Move 33, 1
    Move 161, 1
    MoveEnd

Movement_0650:
    Move 35, 1
    MoveEnd

Script_6:
    ActorsPauseAll
    PVPlay 507, 0
    // "Yawrp!"
    InfoMsg FloccesyRanch2_Text_Yawrp, 2
    PVWait
    MsgWaitAdvance
    MsgWinCloseAll
    ActorSetGPos 0, 35, 2, 11, 3
    ActorCmdExec 0, Movement_073C
    VMSleep 48
    PlayerGetDir 0x8020
    WorkCmpConst 0x8020, 3
    VMJumpIf CMP_EQ, L_069A
    VMJump L_06A8

L_069A:
    ActorCmdExec 255, Movement_074C
    VMJump L_06D1

L_06A8:
    WorkCmpConst 0x8020, 1
    VMJumpIf CMP_EQ, L_06BB
    VMJump L_06C9

L_06BB:
    ActorCmdExec 255, Movement_0754
    VMJump L_06D1

L_06C9:
    ActorCmdExec 255, Movement_075C

L_06D1:
    ActorCmdWait
    WordSetLoadRivalName 1
    // "Did you hear that just now?[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_DidHearJustNow, 0, 0, 0
    MsgWinCloseAll
    PlayerGetGPos 0x8021, 0x8022
    VMStackPush 0x8022
    VMStackPushConst 12
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_070B
    ActorCmdExec 0, Movement_0764
    VMJump L_0713

L_070B:
    ActorCmdExec 0, Movement_0770

L_0713:
    VMSleep 16
    ActorCmdExec 255, Movement_0778
    ActorCmdWait
    // "I'll check this area![f000]븁\u0000\nYou go deeper in the grove\nand look![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_IllCheckAreaGo, 0, 0, 0
    MsgWinCloseAll
    WorkSetConst EVENT_WORK_0x40a7, 4
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_073C:
    Move 19, 6
    Move 17, 1
    Move 75, 1
    MoveEnd

Movement_074C:
    Move 34, 1
    MoveEnd

Movement_0754:
    Move 32, 1
    MoveEnd

Movement_075C:
    Move 32, 1
    MoveEnd

Movement_0764:
    Move 17, 1
    Move 19, 5
    MoveEnd

Movement_0770:
    Move 19, 5
    MoveEnd

Movement_0778:
    Move 35, 1
    MoveEnd

Script_7:
    ActorsPauseAll
    EvCameraInit
    EvCameraUnbind
    EvCameraMoveTo 9688, 0, 0xed000, 0x338000, 0x2001f, 0x148000, 40
    PlayerGetGPos 0x8021, 0x8022
    ActorWalkRoute 255, 51, 23, 1, 8, 1
    ActorCmdWait
    ActorCmdExec 255, Movement_0A2E
    ActorCmdExec 3, Movement_0A36
    ActorCmdExec 16, Movement_0A46
    ActorCmdWait
    EvCameraWait
    PVPlay 507, 0
    // "Herdier: Yaarrrp..."
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_HerdierYaarrrp, 3, 3, 0
    PVWait
    MsgWaitAdvance
    ActorMsgClose
    WordSetLoadRivalName 1
    // "[f000]Ā\u0001\u0001: That cry!\nYou found it![f000]븁\u0000\nWhat a relief![f000]븁\u0000\nOK, I'll go call its Trainer,\nso you stay here with it![f000]븁\u0000"
    InfoMsg FloccesyRanch2_Text_CryFoundWhatRelief, 1
    MsgWinCloseAll
    ActorCmdExec 16, Movement_0A4E
    ActorWalkRoute 0, 42, 12, 1, 4, 0
    ActorCmdWait
    // "???: Tch...\nYou little pest![f000]븁\u0000\nI'm a member of a group that strikes\nfear into the hearts of those who[f000]븀\u0000\nstand before it: Team Plasma![f000]븁\u0000\nEver heard of it?"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_TchLittlePestIm, 16, 5, 0
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_083F
    // "That's right! We're the righteous group\nthat tried to conquer Unova two years[f000]븀\u0000\nback in order to liberate Pokémon![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_ThatsRightWereRighteous, 16, 5, 0
    VMJump L_084B

L_083F:
    // "Really? We're the righteous group\nthat tried to conquer Unova two years[f000]븀\u0000\nback in order to liberate Pokémon![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_ReallyWereRighteousGroup, 16, 5, 0

L_084B:
    // "Whatever...[f000]븁\u0000\nFools will never understand us...[f000]븁\u0000\nStill...[f000]븁\u0000\nFirst I got lost chasing Herdier...\nand now some nosy kid caught me![f000]븁\u0000\nAll of this is your fault!\nTake this![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_WhateverFoolsWillNever, 16, 5, 0
    MsgWinCloseAll
    ActorNew 51, 20, 1, 251, 110, 0
    VMSleep 4
    ActorWalkRoute 251, 51, 23, 1, 4, 1
    VMSleep 16
    SEPlay SEQ_SE_W003_01
    ActorCmdWait
    SEWait
    ActorDelete 251
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 348
    WorkSet 0x8001, 1
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    // "OK! I'll use this opportunity\nto retreat for now![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_OkIllUseOpportunity, 16, 5, 0
    MsgWinCloseAll
    EvCameraMoveToDefault 32
    ActorCmdExec 16, Movement_0A56
    VMSleep 20
    ActorCmdExec 255, Movement_0A6E
    ActorCmdWait
    ActorCmdExec 3, Movement_0A76
    ActorCmdExec 255, Movement_0A8E
    ActorCmdWait
    EvCameraWait
    EvCameraRebind
    EvCameraEnd
    PVPlay 507, 0
    // "Yap! Bwoof!"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_YapBwoof, 3, 3, 0
    PVWait
    MsgWaitAdvance
    MsgWinCloseAll
    ActorSetGPos 0, 46, 2, 14, 1
    ActorSetGPos 1, 46, 2, 15, 1
    ActorCmdExec 1, Movement_0A96
    VMSleep 4
    ActorCmdExec 0, Movement_0AA6
    VMSleep 80
    ActorCmdExec 255, Movement_0AB6
    ActorCmdWait
    WordSetLoadRivalName 1
    // "Owner: Herdier![f000]븁\u0000\nWhat made you come all\nthe way back here?[f000]븁\u0000\nWell, at any rate, I'm really grateful\nfor your help, you two![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_OwnerHerdierWhatMade, 1, 0, 0
    MsgWinCloseAll
    ActorCmdExec 3, Movement_0ABE
    VMSleep 48
    ActorCmdExec 0, Movement_0AD2
    ActorCmdWait
    // "[f000]Ā\u0001\u0001: You're awfully calm\nabout this![f000]븁\u0000\nYour Pokémon might have\nbeen gone for good![f000]븁\u0000\nTake better care of it![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_YoureAwfullyCalmAbout, 0, 0, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_0ADA
    VMSleep 8
    ActorCmdExec 1, Movement_0AEE
    ActorCmdExec 255, Movement_0AF6
    ActorCmdWait
    ActorDelete 0
    ActorDelete 16
    ActorCmdExec 255, Movement_0AFE
    ActorCmdExec 1, Movement_0B06
    ActorCmdWait
    // "Owner: Hmm...\nI wonder if something happened to him...[f000]븁\u0000\nIt's like he's afraid of\nlosing Pokémon...[f000]븁\u0000\nCome on, Herdier!\nEveryone's waiting! Let's go home![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_OwnerHmmWonderIf, 1, 4, 0
    MsgWinCloseAll
    FadeEx 3, 0, 16, 4
    ActorCmdExec 1, Movement_0B0E
    VMSleep 8
    ActorCmdExec 3, Movement_0B1E
    ActorCmdWait
    FadeExWait
    ActorSetGPos 1, 46, 2, 42, 1
    ActorSetGPos 2, 47, 2, 42, 1
    ActorSetGPos 10, 45, 2, 40, 3
    ActorSetGPos 3, 47, 2, 40, 2
    FadeEx 3, 16, 0, 4
    FadeExWait
    WorkSetConst EVENT_WORK_0x40a7, 5
    WorkSetConst EVENT_WORK_0x40a5, 3
    FlagSet EVENT_FLAG_0x02d9
    FlagSet EVENT_FLAG_0x02d8
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0A2E:
    Move 32, 1
    MoveEnd

Movement_0A36:
    Move 71, 1
    Move 10, 1
    Move 72, 1
    MoveEnd

Movement_0A46:
    Move 14, 1
    MoveEnd

Movement_0A4E:
    Move 33, 1
    MoveEnd

Movement_0A56:
    Move 19, 1
    Move 17, 7
    Move 18, 6
    Move 16, 7
    Move 18, 6
    MoveEnd

Movement_0A6E:
    Move 33, 1
    MoveEnd

Movement_0A76:
    Move 13, 2
    Move 15, 2
    Move 14, 2
    Move 15, 1
    Move 33, 0
    MoveEnd

Movement_0A8E:
    Move 32, 1
    MoveEnd

Movement_0A96:
    Move 13, 12
    Move 15, 5
    Move 12, 2
    MoveEnd

Movement_0AA6:
    Move 13, 13
    Move 15, 4
    Move 12, 2
    MoveEnd

Movement_0AB6:
    Move 33, 1
    MoveEnd

Movement_0ABE:
    Move 15, 1
    Move 13, 3
    Move 34, 0
    Move 50, 0
    MoveEnd

Movement_0AD2:
    Move 35, 1
    MoveEnd

Movement_0ADA:
    Move 13, 2
    Move 14, 4
    Move 12, 7
    Move 14, 5
    MoveEnd

Movement_0AEE:
    Move 34, 1
    MoveEnd

Movement_0AF6:
    Move 34, 1
    MoveEnd

Movement_0AFE:
    Move 33, 1
    MoveEnd

Movement_0B06:
    Move 32, 1
    MoveEnd

Movement_0B0E:
    Move 35, 0
    Move 13, 1
    Move 14, 4
    MoveEnd

Movement_0B1E:
    Move 14, 1
    Move 13, 1
    Move 14, 4
    MoveEnd

Script_8:
    ActorsPauseAll
    WordSetLoadRivalName 1
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0B60
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Herdier, where did you go?"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_HerdierWhereDidGo, 0, 0
    LastKeyWait
    ActorMsgClose
    VMJump L_0BE1

L_0B60:
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0B8D
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Wow, this ranch is really big!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_WowRanchReallyBig, 0, 0
    LastKeyWait
    ActorMsgClose
    VMJump L_0BE1

L_0B8D:
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0BBA
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Still, Pokémon don't just wander\noff on their own.[f000]븁\u0000\nIn a worst-case scenario,\nit might be involved in some trouble!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_StillPokemonDontJust, 0, 0
    LastKeyWait
    ActorMsgClose
    VMJump L_0BE1

L_0BBA:
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 4
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0BE1
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Look deeper in the grove!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_LookDeeperGrove, 0, 0
    LastKeyWait
    ActorMsgClose

L_0BE1:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_9:
    ActorsPauseAll
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPushFlag EVENT_FLAG_0x01e2
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_0C2B
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Owner: Thanks! It's all thanks\nto you and your Pokémon![f000]븁\u0000\nYou're really great! Hey, is that it?\nDid Alder train you?"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_OwnerThanksItsAll, 0, 0
    LastKeyWait
    ActorMsgClose
    FlagSet EVENT_FLAG_0x01e2
    VMJump L_0C7C

L_0C2B:
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPushFlag EVENT_FLAG_0x01e2
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_0C68
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "This ranch started when a fence\nwas made to protect Pokémon!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_RanchStartedWhenFence, 0, 0
    LastKeyWait
    ActorMsgClose
    VMJump L_0C7C

L_0C68:
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Owner: It is strange for Herdier\nto wander off on its own.[f000]븁\u0000\nIt always plays with the other\none or works on the ranch..."
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_OwnerStrangeHerdierWander, 0, 0
    LastKeyWait
    ActorMsgClose

L_0C7C:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_10:
    ActorsPauseAll
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPushFlag EVENT_FLAG_0x010c
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_0CC5
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "You and your Pokémon\nfound Herdier! Great!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_PokemonFoundHerdierGreat, 0, 0
    LastKeyWait
    ActorMsgClose
    FlagSet EVENT_FLAG_0x010c
    VMJump L_0D9C

L_0CC5:
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    WorkSetConst 0x8023, 0
    WorkSetConst 0x8024, 0
    WorkSetConst 0x8025, 0
    WorkSetConst 0x8026, 0
    WorkSetConst 0x8027, 0
    PokePartyGetCount 0x8023, 0

L_0CEF:
    VMStackPush 0x8023
    VMStackPush 0x8024
    VMStackCmp CMP_GT
    VMJumpIf CMP_STACK, L_0D43
    PokePartyIsFullHP 0x8025, 0x8024
    PokePartyIsFullPP 0x8026, 0x8024
    VMStackPush 0x8025
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackCmp CMP_OR
    VMJumpIf CMP_STACK, L_0D37
    WorkAdd 0x8027, 1

L_0D37:
    WorkAdd 0x8024, 1
    VMJump L_0CEF

L_0D43:
    VMStackPush 0x8027
    VMStackPushConst 1
    VMStackCmp CMP_GE
    VMJumpIf CMP_STACK, L_0D8E
    // "You and your Pokémon\nlook a little worn out...[f000]븁\u0000\nRest here a minute--you won't\nget anywhere all tired like that![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_PokemonLookLittleWorn, 0, 0
    MsgWinCloseAll
    FadeEx 3, 0, 16, 2
    FadeExWait
    PokePartyRecoverAll
    MEPlay SEQ_ME_ASA
    MEWait
    FadeEx 3, 16, 0, 2
    FadeExWait
    WorkSetConst EVENT_WORK_0x4001, 1
    VMJump L_0D9C

L_0D8E:
    // "Yup! You and your Pokémon\nare full of energy!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_YupPokemonFullEnergy, 0, 0
    LastKeyWait
    MsgWinCloseAll

L_0D9C:
    WorkSetConst 0x8027, 0
    WorkSetConst 0x8026, 0
    WorkSetConst 0x8025, 0
    WorkSetConst 0x8024, 0
    WorkSetConst 0x8023, 0
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_11:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    PVPlay 507, 0
    // "Ba woof! Bawoof!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_BaWoofBawoof, 0, 0
    PVWait
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_12:
    ActorsPauseAll
    VMStackPush EVENT_WORK_0x40a7
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0E1B
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    PVPlay 507, 0
    // "Bawoof! Ba woof!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_BawoofBaWoof, 0, 0
    PVWait
    LastKeyWait
    ActorMsgClose
    VMJump L_0E37

L_0E1B:
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    PVPlay 507, 0
    // "Herdier: Bawoo..."
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_HerdierBawoo, 0, 0
    PVWait
    LastKeyWait
    ActorMsgClose

L_0E37:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_13:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    PVPlay 179, 0
    // "Baaah!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_Baaah, 0, 0
    PVWait
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_14:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    PVPlay 179, 0
    // "Baa!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_Baa, 0, 0
    PVWait
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_15:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    PVPlay 179, 0
    // "Baawn!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_Baawn, 0, 0
    PVWait
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_16:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    PVPlay 179, 0
    // "Baa baa!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_BaaBaa, 0, 0
    PVWait
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_17:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    PVPlay 179, 0
    // "Baa haa!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_BaaHaa, 0, 0
    PVWait
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_18:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    PVPlay 179, 0
    // "Ba baaa!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_BaBaaa, 0, 0
    PVWait
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_19:
    VMHalt

Script_20:
    ActorsPauseAll
    PlayerGetDir 0x800a
    ActorSetEyeToEye
    PVPlay 161, 0
    WorkCmpConst 0x800a, 0
    VMJumpIf CMP_EQ, L_0F4C
    Random 0x8008, 99
    WorkCmpConst 0x8008, 90
    VMJumpIf CMP_GE, L_0F4C
    VMJump L_0FD3

L_0F4C:
    ActorCmdExec 18, Movement_0FEE
    ActorCmdWait
    PokePartyGetParam 0x8009, 0, 158
    WorkDiv 0x8009, 5
    WorkMul 0x8009, 4
    CallWildBattle 161, 0x8009, 1
    WildBattleGetResult 0x8008
    PokePartyGetCount 0x8009, 2
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0F8F
    VMJump L_0F97

L_0F8F:
    CallWildBattleEnd
    VMJump L_0FE3

L_0F97:
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_0FAA
    VMJump L_0FB0

L_0FAA:
    CallWildLose
    ActorsUnpauseAll
    VMHalt

L_0FB0:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0FC3
    VMJump L_0FCB

L_0FC3:
    CallWildBattleEnd
    VMJump L_0FE3

L_0FCB:
    CallWildBattleEnd
    VMJump L_0FE3

L_0FD3:
    ActorCmdExec 18, Movement_0FF6
    ActorCmdWait
    VMJump L_0FE3

L_0FE3:
    ActorDelete 18
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Movement_0FEE:
    Move 75, 1
    MoveEnd

Movement_0FF6:
    Move 75, 1
    Move 17, 5
    MoveEnd

Script_21:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 506, 0
    VMCall Script_22
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_22:
    Random 0x8008, 4
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_1031
    VMJump L_103D

L_1031:
    // "Bwoof![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_Bwoof, 0, 0
    ActorMsgClose

L_103D:
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_1050
    VMJump L_105C

L_1050:
    // "Bawow woof![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_BawowWoof, 0, 0
    ActorMsgClose

L_105C:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_106F
    VMJump L_107B

L_106F:
    // "Grrr... bawoof![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_GrrrBawoof, 0, 0
    ActorMsgClose

L_107B:
    WorkCmpConst 0x8008, 3
    VMJumpIf CMP_EQ, L_108E
    VMJump L_109A

L_108E:
    // "Brrrrrwoof![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_Brrrrrwoof, 0, 0
    ActorMsgClose

L_109A:
    VMReturn

Script_23:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 506, 0
    VMCall Script_22
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_24:
    ActorsPauseAll
    PlayerGetDir 0x800a
    ActorSetEyeToEye
    PVPlay 506, 0
    WorkCmpConst 0x800a, 0
    VMJumpIf CMP_EQ, L_10E6
    WorkCmpConst 0x800a, 3
    VMJumpIf CMP_EQ, L_1144
    VMCall Script_22
    VMJump L_1188

L_10E6:
    ActorCmdExec 23, Movement_118E
    ActorCmdWait
    ActorCmdExec 255, Movement_11A2
    ActorCmdWait
    ActorCmdExec 23, Movement_11AA
    ActorCmdWait
    ActorCmdExec 255, Movement_11BE
    ActorCmdWait
    ActorCmdExec 23, Movement_11C6
    ActorCmdExec 255, Movement_11D2
    ActorCmdExec 23, Movement_11DA
    ActorCmdWait
    ActorCmdExec 255, Movement_11FA
    ActorCmdWait
    PVPlay 506, 0
    VMCall Script_22
    VMJump L_1188

L_1144:
    ActorCmdExec 23, Movement_1202
    ActorCmdWait
    ActorCmdExec 255, Movement_121A
    ActorCmdWait
    ActorCmdExec 23, Movement_1222
    ActorCmdWait
    ActorCmdExec 255, Movement_1236
    ActorCmdWait
    ActorCmdExec 23, Movement_123E
    ActorCmdWait
    PVPlay 506, 0
    VMCall Script_22
    VMJump L_1188

L_1188:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_118E:
    Move 75, 1
    Move 18, 1
    Move 17, 1
    Move 35, 1
    MoveEnd

Movement_11A2:
    Move 34, 1
    MoveEnd

Movement_11AA:
    Move 17, 1
    Move 19, 2
    Move 16, 1
    Move 34, 1
    MoveEnd

Movement_11BE:
    Move 35, 1
    MoveEnd

Movement_11C6:
    Move 17, 2
    Move 18, 1
    MoveEnd

Movement_11D2:
    Move 33, 1
    MoveEnd

Movement_11DA:
    Move 16, 1
    Move 19, 1
    Move 17, 1
    Move 18, 2
    Move 16, 3
    Move 19, 1
    Move 33, 1
    MoveEnd

Movement_11FA:
    Move 32, 1
    MoveEnd

Movement_1202:
    Move 75, 1
    Move 17, 1
    Move 18, 2
    Move 16, 1
    Move 35, 1
    MoveEnd

Movement_121A:
    Move 34, 1
    MoveEnd

Movement_1222:
    Move 17, 1
    Move 19, 2
    Move 16, 1
    Move 34, 1
    MoveEnd

Movement_1236:
    Move 35, 1
    MoveEnd

Movement_123E:
    Move 32, 1
    Move 35, 1
    Move 33, 1
    Move 34, 1
    MoveEnd

Script_25:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 506, 0
    VMCall Script_22
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_26:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 506, 0
    VMCall Script_22
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_27:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 506, 0
    VMCall Script_22
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_28:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 113, 0
    // "Chan-sey![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_ChanSey, 0, 0
    ActorMsgClose
    FlagGet EVENT_FLAG_0x0226, 0x8009
    WorkCmpConst 0x8009, 1
    VMJumpIf CMP_EQ, L_132B
    Random 0x8008, 1
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_132B
    // "Chansey wants to heal\nyour Pokémon...  Let it?"
    SystemMsg FloccesyRanch2_Text_ChanseyWantsHealPokemon, 0
    YesNoWin 0x800c
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_12ED
    VMJump L_1317

L_12ED:
    InfoMsgClose
    PVPlay 113, 0
    // "Chan-sey![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_ChanSey, 0, 0
    ActorMsgClose
    // "Chansey used Soft-boiled![f000]븁\u0000"
    SystemMsg FloccesyRanch2_Text_ChanseyUsedSoftBoiled, 0
    InfoMsgClose
    SEPlay SEQ_SE_RECOVERY
    SEWait
    PokePartyRecoverAll
    VMJump L_132B

L_1317:
    InfoMsgClose
    // "Chance...?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_Chance, 0, 0
    MsgWinCloseAll
    VMJump L_132B

L_132B:
    FlagSet EVENT_FLAG_0x0226
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_29:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 440, 0
    // "Hapiii![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyRanch2_Text_Hapiii, 0, 0
    ActorMsgClose
    FlagGet EVENT_FLAG_0x0226, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_139D
    Random 0x8008, 99
    WorkCmpConst 0x8008, 95
    VMJumpIf CMP_GE, L_1378
    VMJump L_139D

L_1378:
    ItemCheckSpace ITEM_LUCKY_EGG, 1, 0x800c
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_139D
    WorkGet 0x8000, 231
    WorkSetConst 0x8001, 1
    RTCallGlobal 2805

L_139D:
    FlagSet EVENT_FLAG_0x0226
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_30:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 403, 0
    ActorCmdExec 42, Movement_1448
    ActorCmdWait
    Random 0x8008, 100
    WorkCmpConst 0x8008, 90
    VMJumpIf CMP_GE, L_13D5
    VMJump L_143A

L_13D5:
    Random 0x8008, 6
    WorkGet 0x8000, 0x8008
    WorkAdd 0x8000, 80
    WorkSetConst 0x8001, 1
    ItemCheckSpace 0x8000, 1, 0x800c
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_143A
    ActorCmdExec 42, Movement_1454
    ActorCmdWait
    ActorSetEyeToEye
    PVPlay 403, 0
    ActorCmdExec 255, Movement_145C
    ActorCmdWait
    // "It brought something back for you...[f000]븁\u0000"
    SystemMsg FloccesyRanch2_Text_BroughtSomethingBack, 0
    InfoMsgClose
    RTCallGlobal 2805
    ActorCmdExec 42, Movement_1464
    ActorCmdWait
    VMJump L_143A

L_143A:
    FlagSet EVENT_FLAG_0x0226
    ActorDelete 42
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_1448:
    Move 75, 1
    Move 16, 4
    MoveEnd

Movement_1454:
    Move 17, 4
    MoveEnd

Movement_145C:
    Move 75, 1
    MoveEnd

Movement_1464:
    Move 16, 4
    MoveEnd

Script_31:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 220, 0
    ActorCmdExec 43, Movement_150C
    ActorCmdWait
    Random 0x8008, 100
    WorkCmpConst 0x8008, 90
    VMJumpIf CMP_GE, L_1499
    VMJump L_14FE

L_1499:
    Random 0x8008, 2
    WorkGet 0x8000, 0x8008
    WorkAdd 0x8000, 86
    WorkSetConst 0x8001, 1
    ItemCheckSpace 0x8000, 1, 0x800c
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_14FE
    ActorCmdExec 43, Movement_1518
    ActorCmdWait
    ActorSetEyeToEye
    PVPlay 220, 0
    ActorCmdExec 255, Movement_1520
    ActorCmdWait
    // "It brought something back for you...[f000]븁\u0000"
    SystemMsg FloccesyRanch2_Text_BroughtSomethingBack, 0
    InfoMsgClose
    RTCallGlobal 2805
    ActorCmdExec 43, Movement_1528
    ActorCmdWait
    VMJump L_14FE

L_14FE:
    FlagSet EVENT_FLAG_0x0226
    ActorDelete 43
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_150C:
    Move 75, 1
    Move 16, 4
    MoveEnd

Movement_1518:
    Move 17, 4
    MoveEnd

Movement_1520:
    Move 75, 1
    MoveEnd

Movement_1528:
    Move 16, 4
    MoveEnd

Script_32:
    ActorsPauseAll
    PlayerGetDir 0x800a
    ActorSetEyeToEye
    PVPlay 285, 0
    WorkCmpConst EVENT_WORK_0x4010, 1
    VMJumpIf CMP_EQ, L_15B1
    WorkCmpConst EVENT_WORK_0x4010, 2
    VMJumpIf CMP_EQ, L_15EA
    WorkCmpConst EVENT_WORK_0x4010, 3
    VMJumpIf CMP_EQ, L_1623
    WorkCmpConst EVENT_WORK_0x4010, 4
    VMJumpIf CMP_EQ, L_165C
    WorkCmpConst 0x800a, 3
    VMJumpIf CMP_EQ, L_159B
    VMJump L_1585

L_1585:
    ActorCmdExec 45, Movement_169C
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x4010, 1
    VMJump L_1695

L_159B:
    ActorCmdExec 45, Movement_16AC
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x4010, 1
    VMJump L_1695

L_15B1:
    WorkCmpConst 0x800a, 3
    VMJumpIf CMP_EQ, L_15D4
    ActorCmdExec 45, Movement_16C0
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x4010, 2
    VMJump L_1695

L_15D4:
    ActorCmdExec 45, Movement_16C8
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x4010, 4
    VMJump L_1695

L_15EA:
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_160D
    ActorCmdExec 45, Movement_16D0
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x4010, 3
    VMJump L_1695

L_160D:
    ActorCmdExec 45, Movement_16D8
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x4010, 1
    VMJump L_1695

L_1623:
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_1646
    ActorCmdExec 45, Movement_16E0
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x4010, 4
    VMJump L_1695

L_1646:
    ActorCmdExec 45, Movement_16E8
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x4010, 2
    VMJump L_1695

L_165C:
    WorkCmpConst 0x800a, 0
    VMJumpIf CMP_EQ, L_167F
    ActorCmdExec 45, Movement_16F0
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x4010, 1
    VMJump L_1695

L_167F:
    ActorCmdExec 45, Movement_16F8
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x4010, 3
    VMJump L_1695

L_1695:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_169C:
    Move 75, 1
    Move 18, 4
    Move 17, 4
    MoveEnd

Movement_16AC:
    Move 75, 1
    Move 16, 1
    Move 19, 4
    Move 17, 5
    MoveEnd

Movement_16C0:
    Move 18, 4
    MoveEnd

Movement_16C8:
    Move 16, 6
    MoveEnd

Movement_16D0:
    Move 16, 6
    MoveEnd

Movement_16D8:
    Move 19, 4
    MoveEnd

Movement_16E0:
    Move 19, 4
    MoveEnd

Movement_16E8:
    Move 17, 6
    MoveEnd

Movement_16F0:
    Move 17, 6
    MoveEnd

Movement_16F8:
    Move 18, 4
    MoveEnd

Script_33:
    ActorsPauseAll
    PlayerGetDir 0x800a
    ActorSetEyeToEye
    PVPlay 273, 0
    ActorCmdExec 47, Movement_1794
    ActorCmdWait
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_1779
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_1763
    VMJump L_174A
    VMJump L_1789
    VMJump L_1789
    VMJump L_1789

L_174A:
    Random 0x8008, 2
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_1763
    VMJump L_1779

L_1763:
    ActorCmdExec 47, Movement_179C
    ActorCmdWait
    VMJump L_1789
    VMJump L_1789

L_1779:
    ActorCmdExec 47, Movement_17A4
    ActorCmdWait
    VMJump L_1789

L_1789:
    ActorDelete 47
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_1794:
    Move 75, 1
    MoveEnd

Movement_179C:
    Move 16, 8
    MoveEnd

Movement_17A4:
    Move 19, 8
    MoveEnd

Script_34:
    ActorsPauseAll
    PlayerGetDir 0x800a
    ActorGetGPos 50, 0x8004, 0x8005
    ActorSetEyeToEye
    PVPlay 161, 0
    Random 0x8008, 100
    WorkCmpConst 0x8008, 90
    VMJumpIf CMP_GE, L_180F
    WorkCmpConst 0x8004, 22
    VMJumpIf CMP_GE, L_1874
    WorkCmpConst 0x8004, 19
    VMJumpIf CMP_LE, L_191B
    WorkCmpConst 0x8005, 23
    VMJumpIf CMP_GE, L_19C2
    WorkCmpConst 0x8005, 12
    VMJumpIf CMP_LE, L_19D2
    VMJump L_19D2

L_180F:
    ActorCmdExec 50, Movement_19F2
    ActorCmdWait
    PokePartyGetParam 0x8009, 0, 158
    WorkDiv 0x8009, 5
    WorkMul 0x8009, 4
    CallWildBattle 161, 0x8009, 1
    WildBattleGetResult 0x8008
    PokePartyGetCount 0x8009, 2
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_186C
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_19E2
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_186C
    VMJump L_186C

L_186C:
    CallWildBattleEnd
    VMJump L_19E8

L_1874:
    WorkCmpConst 0x8005, 12
    VMJumpIf CMP_LE, L_18A1
    WorkCmpConst 0x8005, 23
    VMJumpIf CMP_GE, L_18CE
    WorkCmpConst 0x8005, 21
    VMJumpIf CMP_GE, L_18FB
    VMJump L_190B

L_18A1:
    WorkCmpConst 0x800a, 3
    VMJumpIf CMP_EQ, L_18BE
    ActorCmdExec 50, Movement_19FA
    ActorCmdWait
    VMJump L_19E8

L_18BE:
    ActorCmdExec 50, Movement_1A0A
    ActorCmdWait
    VMJump L_19E8

L_18CE:
    WorkCmpConst 0x800a, 3
    VMJumpIf CMP_EQ, L_18EB
    ActorCmdExec 50, Movement_1A1A
    ActorCmdWait
    VMJump L_19E8

L_18EB:
    ActorCmdExec 50, Movement_1A2A
    ActorCmdWait
    VMJump L_19E8

L_18FB:
    ActorCmdExec 50, Movement_1A3A
    ActorCmdWait
    VMJump L_19E8

L_190B:
    ActorCmdExec 50, Movement_1A4A
    ActorCmdWait
    VMJump L_19E8

L_191B:
    WorkCmpConst 0x8005, 12
    VMJumpIf CMP_LE, L_1948
    WorkCmpConst 0x8005, 23
    VMJumpIf CMP_GE, L_1975
    WorkCmpConst 0x8005, 21
    VMJumpIf CMP_GE, L_19A2
    VMJump L_19B2

L_1948:
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_1965
    ActorCmdExec 50, Movement_1A56
    ActorCmdWait
    VMJump L_19E8

L_1965:
    ActorCmdExec 50, Movement_1A66
    ActorCmdWait
    VMJump L_19E8

L_1975:
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_1992
    ActorCmdExec 50, Movement_1A76
    ActorCmdWait
    VMJump L_19E8

L_1992:
    ActorCmdExec 50, Movement_1A86
    ActorCmdWait
    VMJump L_19E8

L_19A2:
    ActorCmdExec 50, Movement_1A96
    ActorCmdWait
    VMJump L_19E8

L_19B2:
    ActorCmdExec 50, Movement_1AA6
    ActorCmdWait
    VMJump L_19E8

L_19C2:
    ActorCmdExec 50, Movement_1AB2
    ActorCmdWait
    VMJump L_19E8

L_19D2:
    ActorCmdExec 50, Movement_1ABE
    ActorCmdWait
    VMJump L_19E8

L_19E2:
    CallWildLose
    ActorsUnpauseAll
    VMHalt

L_19E8:
    ActorDelete 50
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_19F2:
    Move 75, 1
    MoveEnd

Movement_19FA:
    Move 75, 1
    Move 18, 2
    Move 17, 2
    MoveEnd

Movement_1A0A:
    Move 75, 1
    Move 17, 2
    Move 18, 2
    MoveEnd

Movement_1A1A:
    Move 75, 1
    Move 18, 2
    Move 16, 2
    MoveEnd

Movement_1A2A:
    Move 75, 1
    Move 16, 2
    Move 18, 2
    MoveEnd

Movement_1A3A:
    Move 75, 1
    Move 18, 2
    Move 16, 2
    MoveEnd

Movement_1A4A:
    Move 75, 1
    Move 18, 2
    MoveEnd

Movement_1A56:
    Move 75, 1
    Move 19, 2
    Move 17, 2
    MoveEnd

Movement_1A66:
    Move 75, 1
    Move 17, 2
    Move 19, 2
    MoveEnd

Movement_1A76:
    Move 75, 1
    Move 19, 2
    Move 16, 2
    MoveEnd

Movement_1A86:
    Move 75, 1
    Move 16, 2
    Move 19, 2
    MoveEnd

Movement_1A96:
    Move 75, 1
    Move 19, 2
    Move 16, 2
    MoveEnd

Movement_1AA6:
    Move 75, 1
    Move 19, 2
    MoveEnd

Movement_1AB2:
    Move 75, 1
    Move 16, 2
    MoveEnd

Movement_1ABE:
    Move 75, 1
    Move 17, 2
    MoveEnd
    .balign 4, 0
