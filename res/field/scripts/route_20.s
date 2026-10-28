#include "asm/field_script.inc"
#include "text/script/route_20.h"

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
    ScriptEntriesEnd

Script_1:
    ActorsPauseAll
    PlayerGetGPos 0x8021, 0x8022
    VMStackPush 0x8022
    VMStackPushConst 644
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00BB
    ActorCmdExec 0, Movement_011E
    VMSleep 46
    ActorCmdExec 255, Movement_012A
    VMJump L_00E2

L_00BB:
    VMStackPush 0x8022
    VMStackPushConst 646
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00E2
    ActorCmdExec 0, Movement_0132
    VMSleep 46
    ActorCmdExec 255, Movement_013E

L_00E2:
    ActorCmdWait
    // "Come on! A kid without a single\nGym Badge continuing on past here?[f000]븁\u0000\nBattle with the Trainers and Pokémon\nin this area, then battle some more![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route20_Text_ComeKidWithoutSingle_2, 0, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8022
    VMStackPushConst 645
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_010D
    ActorCmdExec 0, Movement_0146

L_010D:
    ActorCmdExec 255, Movement_014E
    ActorCmdWait
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Movement_011E:
    Move 75, 1
    Move 32, 1
    MoveEnd

Movement_012A:
    Move 33, 1
    MoveEnd

Movement_0132:
    Move 75, 1
    Move 33, 1
    MoveEnd

Movement_013E:
    Move 32, 1
    MoveEnd

Movement_0146:
    Move 34, 1
    MoveEnd

Movement_014E:
    Move 14, 1
    MoveEnd

Script_2:
    ActorsPauseAll
    ActorCmdExec 0, Movement_0238
    PlayerGetDir 0x8020
    VMStackPush 0x8020
    VMStackPushConst 3
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_0183
    VMSleep 20
    ActorCmdExec 255, Movement_0240

L_0183:
    ActorCmdWait
    PlayerGetGPos 0x8021, 0x8022
    VMStackPush 0x8022
    VMStackPushConst 644
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01AE
    ActorCmdExec 0, Movement_0248
    ActorCmdWait
    VMJump L_01CB

L_01AE:
    VMStackPush 0x8022
    VMStackPushConst 646
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01CB
    ActorCmdExec 0, Movement_0254
    ActorCmdWait

L_01CB:
    // "Hey! That gleaming thing there\nis the Basic Badge![f000]븁\u0000\nBut don't get a swelled head!\nIt's a rough world out there![f000]븀\u0000\nHere, I'll show you![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route20_Text_HeyGleamingThingThere, 0, 0, 0
    MsgWinCloseAll
    CallTrainerBattle TRAINER_HIKER_JEROME, 0, 0
    TrainerBattleIsVictory 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0200
    CallTrainerBattleEnd
    VMJump L_0202

L_0200:
    CallTrainerLose

L_0202:
    // "All right... I'm beat![f000]븁\u0000\nWith dependable Pokémon like that,\neven a kid like you can[f000]븀\u0000\nhold your own against an adult. Yup!"
    ActorMsg MSGFILE_SCRIPT, Route20_Text_AllRightImBeat, 0, 0, 0
    MsgWaitAdvance
    MsgWinCloseAll
    ActorWalkRoute 0, 160, 643, 0, 8, 0
    ActorCmdWait
    ActorCmdExec 0, Movement_0260
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x40ab, 2
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0238:
    Move 75, 1
    MoveEnd

Movement_0240:
    Move 35, 1
    MoveEnd

Movement_0248:
    Move 12, 1
    Move 34, 1
    MoveEnd

Movement_0254:
    Move 13, 1
    Move 34, 1
    MoveEnd

Movement_0260:
    Move 33, 1
    MoveEnd

Script_3:
    ActorsPauseAll
    WordSetPlayerName 0
    WordSetLoadRivalName 1
    // "[f000]Ā\u0001\u0000! Wait![f000]븁\u0000"
    InfoMsg Route20_Text_Wait, 2
    MsgWinCloseAll
    ActorSetGPos 21, 160, 65535, 650, 1
    ActorSetGPos 23, 161, 65535, 650, 1
    PlayerGetGPos 0x8021, 0x8022
    BGMPlay SEQ_BGM_E_CHEREN
    ActorWalkRoute 23, 161, 658, 4, 8, 0
    VMSleep 4
    ActorWalkRoute 21, 160, 658, 4, 8, 0
    VMSleep 8
    ActorCmdExec 255, Movement_0446
    ActorCmdWait
    VMStackPush 0x8021
    VMStackPushConst 161
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_02F4
    ActorWalkRoute 255, 161, 660, 1, 8, 0
    ActorCmdWait
    ActorCmdExec 255, Movement_044E
    ActorCmdWait

L_02F4:
    WordSetPlayerName 0
    WordSetLoadRivalName 1
    // "Cheren: Come with me, you two.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route20_Text_CherenComeTwo, 23, 0, 0
    MsgWinCloseAll
    ActorCmdExec 23, Movement_0456
    VMSleep 16
    ActorCmdExec 255, Movement_0466
    ActorCmdExec 21, Movement_046E
    ActorCmdWait
    ActorCmdExec 23, Movement_047A
    VMSleep 4
    ActorCmdExec 21, Movement_048A
    ActorCmdExec 255, Movement_049A
    ActorCmdWait
    ActorCmdExec 23, Movement_04AA
    ActorCmdWait
    // "See the dark tall grass here?[f000]븁\u0000\nIt's rare, but sometimes two\nPokémon pop out at the same time.[f000]븁\u0000\nAlso, there are stronger species of\nPokémon that hide in dark grass,[f000]븀\u0000\nso be careful if you walk through.[f000]븁\u0000\nBe sure to look in the dark grass\nas you're filling your Pokédex,[f000]븀\u0000\njust like you would tall grass.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route20_Text_SeeDarkTallGrass, 23, 0, 0
    MsgWinCloseAll
    ActorCmdExec 23, Movement_04B2
    ActorCmdWait
    // "If you're going to challenge the\nnext Gym, it's the Virbank Gym.[f000]븀\u0000\nThese might help![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route20_Text_IfYoureGoingChallenge, 23, 0, 0
    MsgWinCloseAll
    ActorCmdExec 23, Movement_04BA
    ActorCmdWait
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 151
    WorkSet 0x8001, 3
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    ActorCmdExec 23, Movement_04C2
    ActorCmdWait
    WordSetPlayerName 0
    WordSetLoadRivalName 1
    // "Here are some for you, [f000]Ā\u0001\u0001![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route20_Text_HereSome, 23, 0, 0
    MsgWinCloseAll
    // "Both of you, do your best![f000]븁\u0000\nIf you need anything,\ncall me on the Xtransceiver.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route20_Text_BothBestIfNeed, 23, 0, 0
    MsgWinCloseAll
    ActorWalkRoute 23, 161, 653, 1, 8, 0
    VMSleep 16
    ActorCmdExec 21, Movement_04CE
    ActorCmdExec 255, Movement_04D6
    ActorCmdWait
    BGMChangeMap
    // "[f000]Ā\u0001\u0001: Cheren sure knows a lot.[f000]븁\u0000\nAnd he fought those\nTeam Plasma thugs, too...[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route20_Text_CherenSureKnowsLot, 21, 0, 0
    MsgWinCloseAll
    ActorCmdExec 21, Movement_04DE
    ActorCmdExec 255, Movement_04E6
    ActorCmdWait
    // "I've decided!\nI'm going to get stronger than him![f000]븁\u0000\nYou should...[f000]븁\u0000\nDo your best! Fill up the Pokédex\nand have my back. Got it?[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route20_Text_IveDecidedImGoing, 21, 0, 0
    MsgWinCloseAll
    ActorWalkRoute 21, 162, 668, 1, 8, 0
    ActorCmdWait
    ActorDelete 23
    WorkSetConst EVENT_WORK_0x40ab, 3
    FlagSet EVENT_FLAG_0x02bf
    FlagSet EVENT_FLAG_0x0408
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0446:
    Move 32, 1
    MoveEnd

Movement_044E:
    Move 32, 1
    MoveEnd

Movement_0456:
    Move 15, 1
    Move 13, 2
    Move 34, 1
    MoveEnd

Movement_0466:
    Move 35, 1
    MoveEnd

Movement_046E:
    Move 13, 2
    Move 35, 1
    MoveEnd

Movement_047A:
    Move 13, 3
    Move 15, 2
    Move 13, 2
    MoveEnd

Movement_048A:
    Move 13, 3
    Move 15, 3
    Move 33, 1
    MoveEnd

Movement_049A:
    Move 13, 3
    Move 15, 3
    Move 33, 1
    MoveEnd

Movement_04AA:
    Move 181, 1
    MoveEnd

Movement_04B2:
    Move 32, 1
    MoveEnd

Movement_04BA:
    Move 12, 1
    MoveEnd

Movement_04C2:
    Move 14, 1
    Move 32, 1
    MoveEnd

Movement_04CE:
    Move 32, 1
    MoveEnd

Movement_04D6:
    Move 32, 1
    MoveEnd

Movement_04DE:
    Move 35, 1
    MoveEnd

Movement_04E6:
    Move 34, 1
    MoveEnd

Script_4:
    ActorsPauseAll
    VMStackPush EVENT_WORK_0x40ab
    VMStackPushConst 2
    VMStackCmp CMP_GE
    VMJumpIf CMP_STACK, L_051D
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "All right... I'm beat![f000]븁\u0000\nWith dependable Pokémon like that,\neven a kid like you can[f000]븀\u0000\nhold your own against an adult. Yup!"
    ParentActorMsg MSGFILE_SCRIPT, Route20_Text_AllRightImBeat, 0, 0
    LastKeyWait
    ActorMsgClose
    VMJump L_0531

L_051D:
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Come on! A kid without a single\nGym Badge continuing on past here?[f000]븁\u0000\nBattle with the Trainers and Pokémon\nin this area, then battle some more!"
    ParentActorMsg MSGFILE_SCRIPT, Route20_Text_ComeKidWithoutSingle, 0, 0
    LastKeyWait
    ActorMsgClose

L_0531:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_5:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    FlagGet EVENT_FLAG_0x023c, 0x8008
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0565
    // "Route 20"
    MsgPlaceSign Route20_Text_Route20, 3
    MsgPlaceSignClose
    VMJump L_0583

L_0565:
    ActorCmdExec 29, Movement_058A
    ActorCmdWait
    WorkSetConst 0x8010, 163
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 29
    VMHalt

L_0583:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Movement_058A:
    Move 75, 1
    MoveEnd

Script_6:
    ActorsPauseAll
    CallLeafPileStuck
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_7:
    WorkSetConst 0x8023, 0
    RTCGetSeason 0x8023
    VMStackPush 0x8023
    VMStackPushConst 2
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_05C3
    FlagSet EVENT_FLAG_0x038e
    VMJump L_05C7

L_05C3:
    FlagReset EVENT_FLAG_0x038e

L_05C7:
    VMStackPush EVENT_WORK_0x40ab
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_05EC
    ObjInitNPCGPos 21, 1, 162, 65533, 668
    VMJump L_060B

L_05EC:
    VMStackPush EVENT_WORK_0x40ab
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_060B
    ObjInitNPCGPos 21, 1, 151, 2, 646

L_060B:
    VMStackPush EVENT_WORK_0x40ab
    VMStackPushConst 2
    VMStackCmp CMP_GE
    VMJumpIf CMP_STACK, L_062A
    ObjInitNPCGPos 0, 1, 160, 2, 643

L_062A:
    WorkSetConst 0x8023, 0
    VMHalt

Script_8:
    VMHalt

Script_9:
    ActorsPauseAll
    WordSetPlayerName 0
    WordSetLoadRivalName 1
    VMStackPush EVENT_WORK_0x40ab
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0669
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "[f000]Ā\u0001\u0001: Help me check Route 20!"
    ParentActorMsg MSGFILE_SCRIPT, Route20_Text_HelpCheckRoute20, 0, 0
    LastKeyWait
    ActorMsgClose
    VMJump L_067D

L_0669:
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "I have to get stronger\nthan Team Plasma!"
    ParentActorMsg MSGFILE_SCRIPT, Route20_Text_HaveGetStrongerThan, 0, 0
    LastKeyWait
    ActorMsgClose

L_067D:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_10:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    ActorSetGPos 21, 146, 2, 663, 3
    TrainerBGMPlayPush TRAINER_TEAM_PLASMA_GRUNT_48
    // "Yeesh! I really hate it when\npeople won't let things go![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route20_Text_YeeshReallyHateWhen, 22, 0, 0
    MsgWinCloseAll
    CallTrainerBattle TRAINER_TEAM_PLASMA_GRUNT_48, 0, 0
    TrainerBattleIsVictory 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_06D1
    CallTrainerBattleEnd
    VMJump L_06D3

L_06D1:
    CallTrainerLose

L_06D3:
    // "Now that I think about it...[f000]븁\u0000\nIf I run this way, no one can help me!\nI have to head toward the ocean![f000]븁\u0000\nSo, with that in mind...[f000]븁\u0000\nI'm going to flee again!\nGood-bye, Virbank City![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route20_Text_NowThinkAboutIf, 22, 0, 0
    MsgWinCloseAll
    PlayerGetDir 0x8020
    VMStackPush 0x8020
    VMStackPushConst 1
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_070C
    ActorWalkRoute 22, 155, 653, 1, 4, 0
    VMJump L_071A

L_070C:
    ActorWalkRoute 22, 156, 653, 1, 4, 0

L_071A:
    VMSleep 8
    ActorCmdExec 255, Movement_086A
    ActorCmdWait
    FlagReset EVENT_FLAG_0x09fe
    BGMChangeMap
    VMStackPush 0x8020
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0769
    ActorWalkRoute 21, 156, 666, 1, 8, 0
    ActorCmdWait
    ActorCmdExec 255, Movement_0872
    ActorCmdExec 21, Movement_087A
    ActorCmdWait
    VMJump L_0814

L_0769:
    VMStackPush 0x8020
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_07A4
    ActorWalkRoute 21, 155, 667, 1, 8, 0
    ActorCmdWait
    ActorCmdExec 255, Movement_0882
    ActorCmdExec 21, Movement_088A
    ActorCmdWait
    VMJump L_0814

L_07A4:
    VMStackPush 0x8020
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_07DF
    ActorWalkRoute 21, 156, 668, 1, 8, 0
    ActorCmdWait
    ActorCmdExec 255, Movement_0892
    ActorCmdExec 21, Movement_089A
    ActorCmdWait
    VMJump L_0814

L_07DF:
    VMStackPush 0x8020
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0814
    ActorWalkRoute 21, 155, 667, 1, 8, 0
    ActorCmdWait
    ActorCmdExec 255, Movement_08A2
    ActorCmdExec 21, Movement_08AA
    ActorCmdWait

L_0814:
    WordSetPlayerName 0
    WordSetLoadRivalName 1
    // "[f000]Ā\u0001\u0001: Well, they're\nreally good at running, anyway...[f000]븁\u0000\nStill, she just said something useful![f000]븁\u0000\nThey must be moving around by boat![f000]븁\u0000\nCastelia City has a big port...\nI wonder if they headed there.[f000]븁\u0000\nOK! Let’s go back to Virbank\nand look for someone who looks like[f000]븀\u0000\nthey know a lot about ships.[f000]븁\u0000\nIf I remember right, there was a place\nto board boats on the docks.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route20_Text_WellTheyreReallyGood, 21, 0, 0
    MsgWinCloseAll
    ActorWalkRoute 21, 155, 654, 1, 8, 1
    VMSleep 8
    ActorCmdExec 255, Movement_08B2
    ActorCmdWait
    ActorDelete 21
    ActorDelete 22
    FlagSet EVENT_FLAG_0x02bd
    FlagSet EVENT_FLAG_0x02be
    WorkSetConst EVENT_WORK_0x40ab, 6
    FlagReset EVENT_FLAG_0x02d6
    WorkSetConst EVENT_WORK_0x40ac, 7
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_086A:
    Move 32, 1
    MoveEnd

Movement_0872:
    Move 35, 1
    MoveEnd

Movement_087A:
    Move 34, 1
    MoveEnd

Movement_0882:
    Move 34, 1
    MoveEnd

Movement_088A:
    Move 35, 1
    MoveEnd

Movement_0892:
    Move 35, 1
    MoveEnd

Movement_089A:
    Move 34, 1
    MoveEnd

Movement_08A2:
    Move 35, 1
    MoveEnd

Movement_08AA:
    Move 34, 1
    MoveEnd

Movement_08B2:
    Move 32, 1
    MoveEnd

Script_11:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Pokémon battles begin\nwhen eyes meet![f000]븀\u0000\nThat's a rule for Trainers!"
    ParentActorMsg MSGFILE_SCRIPT, Route20_Text_PokemonBattlesBeginWhen, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_12:
    VMHalt

Script_13:
    WorkSetConst EVENT_WORK_0x401f, 1
    RTCallGlobal 10852
    FlagSet EVENT_FLAG_0x023c
    FlagGet EVENT_FLAG_0x021c, 0x8008
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_08FF
    VMJump L_0981

L_08FF:
    FlagSet EVENT_FLAG_0x0254
    FlagSet EVENT_FLAG_0x0255
    FlagSet EVENT_FLAG_0x0256
    FlagSet EVENT_FLAG_0x0257
    WorkCmpConst EVENT_WORK_0x402f, 1
    VMJumpIf CMP_EQ, L_0922
    VMJump L_092A

L_0922:
    FlagSet EVENT_FLAG_0x021c
    FlagReset EVENT_FLAG_0x0254

L_092A:
    WorkCmpConst EVENT_WORK_0x402f, 2
    VMJumpIf CMP_EQ, L_093D
    VMJump L_0945

L_093D:
    FlagSet EVENT_FLAG_0x021c
    FlagReset EVENT_FLAG_0x0255

L_0945:
    WorkCmpConst EVENT_WORK_0x402f, 3
    VMJumpIf CMP_EQ, L_0958
    VMJump L_0960

L_0958:
    FlagSet EVENT_FLAG_0x021c
    FlagReset EVENT_FLAG_0x0256

L_0960:
    WorkCmpConst EVENT_WORK_0x402f, 4
    VMJumpIf CMP_EQ, L_0973
    VMJump L_097B

L_0973:
    FlagSet EVENT_FLAG_0x021c
    FlagReset EVENT_FLAG_0x0257

L_097B:
    VMJump L_0981

L_0981:
    VMHalt
    .byte 0x00

Script_14:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 25, Movement_0B4C
    ActorCmdWait
    WordSetPokeSpecies 0, 265
    WorkCmpConst EVENT_WORK_0x4031, 3
    VMJumpIf CMP_GE, L_09AA
    VMJump L_09C6

L_09AA:
    WorkCmpConst EVENT_WORK_0x4031, 6
    VMJumpIf CMP_LT, L_09BD
    VMJump L_09C6

L_09BD:
    // "[f000]Ā\u0001\u0000 seems happy to see you!"
    InfoMsg Route20_Text_SeemsHappySee, 2
    LastKeyWait
    InfoMsgClose_0039

L_09C6:
    WorkCmpConst EVENT_WORK_0x4031, 6
    VMJumpIf CMP_GE, L_09D9
    VMJump L_09E2

L_09D9:
    // "[f000]Ā\u0001\u0000 is really happy to see you!"
    InfoMsg Route20_Text_ReallyHappySee, 2
    LastKeyWait
    InfoMsgClose_0039

L_09E2:
    FlagGet EVENT_FLAG_DAILY_0x0aef, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0B28
    WorkCmpConst EVENT_WORK_0x4031, 3
    VMJumpIf CMP_LT, L_0A08
    VMJump L_0A11

L_0A08:
    // "[f000]Ā\u0001\u0000 looks hungry."
    InfoMsg Route20_Text_LooksHungry, 2
    LastKeyWait
    InfoMsgClose_0039

L_0A11:
    VMCall Script_29
    WorkCmpConst 0x8012, 0
    VMJumpIf CMP_EQ, L_0A74
    WorkCmpConst 0x8012, 4
    VMJumpIf CMP_EQ, L_0B37
    FlagSet EVENT_FLAG_DAILY_0x0aef
    WorkGet 0x8008, EVENT_WORK_0x4031
    WorkAdd 0x8008, 1
    WorkGet EVENT_WORK_0x4031, 0x8008
    WorkCmpConst 0x8012, 1
    VMJumpIf CMP_EQ, L_0A83
    WorkCmpConst 0x8012, 2
    VMJumpIf CMP_EQ, L_0A92
    WorkCmpConst 0x8012, 3
    VMJumpIf CMP_EQ, L_0ADD
    VMJump L_0B46

L_0A74:
    // "You don't have any berries it likes..."
    InfoMsg Route20_Text_DontHaveAnyBerries, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_0B46

L_0A83:
    // "[f000]Ā\u0001\u0000 ate the berry.[f000]븁\u0000\nIt likes the [f000][ff00]\u0001\u0002sweet[f000][ff00]\u0001\u0000 flavor,\nbut maybe it would like it better[f000]븀\u0000\nif you gave it a [f000][ff00]\u0001\u0002dry[f000][ff00]\u0001\u0000 or [f000][ff00]\u0001\u0002bitter[f000][ff00]\u0001\u0000 berry?[f000]븁\u0000\nIt still seems to have\ngrown closer to you!"
    InfoMsg Route20_Text_AteBerryLikesSweet, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_0B46

L_0A92:
    // "[f000]Ā\u0001\u0000 loves the dry flavor![f000]븁\u0000\nIt seems to have grown\ncloser to you!"
    InfoMsg Route20_Text_LovesDryFlavorSeems, 2
    LastKeyWait
    InfoMsgClose_0039
    WorkCmpConst EVENT_WORK_0x4031, 3
    VMJumpIf CMP_GE, L_0AAE
    VMJump L_0AD7

L_0AAE:
    WorkSetConst EVENT_WORK_0x402f, 1
    ActorCmdExec 25, Movement_0B54
    ActorCmdWait
    ActorSetEyeToEye
    PVPlay 265, 0
    PVWait
    // "[f000]Ā\u0001\u0000 seems stronger![f000]븁\u0000\nYou should come back and\ncheck on it later!"
    InfoMsg Route20_Text_SeemsStrongerShouldCome, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_0B46

L_0AD7:
    VMJump L_0B46

L_0ADD:
    // "[f000]Ā\u0001\u0000 loves the bitter flavor![f000]븁\u0000\nIt seems to have grown\ncloser to you!"
    InfoMsg Route20_Text_LovesBitterFlavorSeems, 2
    LastKeyWait
    InfoMsgClose_0039
    WorkCmpConst EVENT_WORK_0x4031, 3
    VMJumpIf CMP_GE, L_0AF9
    VMJump L_0B22

L_0AF9:
    WorkSetConst EVENT_WORK_0x402f, 3
    ActorCmdExec 25, Movement_0B68
    ActorCmdWait
    ActorSetEyeToEye
    PVPlay 265, 0
    PVWait
    // "[f000]Ā\u0001\u0000 seems stronger![f000]븁\u0000\nYou should come back and\ncheck on it later!"
    InfoMsg Route20_Text_SeemsStrongerShouldCome, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_0B46

L_0B22:
    VMJump L_0B46

L_0B28:
    // "[f000]Ā\u0001\u0000 looks happy with it's belly full!"
    InfoMsg Route20_Text_LooksHappyItsBelly, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_0B46

L_0B37:
    // "[f000]Ā\u0001\u0000 looks sad..."
    InfoMsg Route20_Text_LooksSad, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_0B46

L_0B46:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0B4C:
    Move 75, 1
    MoveEnd

Movement_0B54:
    Move 34, 1
    Move 32, 1
    Move 35, 1
    Move 33, 1
    MoveEnd

Movement_0B68:
    Move 34, 1
    Move 32, 1
    Move 35, 1
    Move 33, 1
    MoveEnd

Script_15:
    ActorsPauseAll
    PlayerGetDir 0x800a
    ActorSetEyeToEye
    ActorCmdExec 30, Movement_0C3A
    ActorCmdWait
    WordSetPokeSpecies 0, 220
    Random 0x8008, 100
    WorkCmpConst 0x8008, 100
    VMJumpIf CMP_GE, L_0BAC
    VMJump L_0BDB

L_0BAC:
    WorkSetConst 0x8010, 220
    RTCallGlobal 10854
    VMJump L_0C2F

L_0BBC:
    // "It dropped something..."
    InfoMsg Route20_Text_DroppedSomething, 2
    LastKeyWait
    InfoMsgClose_0039
    WorkSetConst 0x8010, 2
    WorkSetConst 0x8011, 86
    RTCallGlobal 10853
    VMJump L_0C2F

L_0BDB:
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_0C12
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_0C12
    ActorCmdExec 30, Movement_0C42
    ActorCmdWait
    WorkCmpConst 0x8008, 70
    VMJumpIf CMP_GE, L_0BBC
    VMJump L_0C2F

L_0C12:
    ActorCmdExec 30, Movement_0C5A
    ActorCmdWait
    WorkCmpConst 0x8008, 70
    VMJumpIf CMP_GE, L_0BBC
    VMJump L_0C2F

L_0C2F:
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 30
    VMHalt
    .byte 0x00

Movement_0C3A:
    Move 75, 1
    MoveEnd

Movement_0C42:
    Move 19, 1
    Move 59, 1
    Move 19, 2
    Move 16, 8
    Move 69, 1
    MoveEnd

Movement_0C5A:
    Move 16, 5
    Move 18, 8
    MoveEnd

Script_16:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 31, Movement_0CDE
    ActorCmdWait
    WordSetPokeSpecies 0, 163
    WorkSetConst 0x8010, 163
    RTCallGlobal 10854
    WorkCmpConst 0x8012, 2
    VMJumpIf CMP_EQ, L_0C96
    VMJump L_0CD4

L_0C96:
    ActorCmdExec 31, Movement_0CE6
    ActorCmdWait
    Random 0x8008, 100
    WorkCmpConst 0x8008, 20
    VMJumpIf CMP_GE, L_0CD4
    FinishAllEvents
    // "It dropped something..."
    InfoMsg Route20_Text_DroppedSomething, 2
    LastKeyWait
    InfoMsgClose_0039
    WorkSetConst 0x8010, 7
    WorkSetConst 0x8011, 565
    RTCallGlobal 10853
    VMJump L_0CD4

L_0CD4:
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 31
    VMHalt

Movement_0CDE:
    Move 75, 1
    MoveEnd

Movement_0CE6:
    Move 69, 1
    MoveEnd

Script_17:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 32, Movement_0D64
    ActorCmdWait
    WordSetPokeSpecies 0, 163
    WorkSetConst 0x8010, 163
    RTCallGlobal 10854
    WorkCmpConst 0x8012, 2
    VMJumpIf CMP_EQ, L_0D1E
    VMJump L_0D5A

L_0D1E:
    ActorCmdExec 32, Movement_0D6C
    ActorCmdWait
    Random 0x8008, 100
    WorkCmpConst 0x8008, 20
    VMJumpIf CMP_GE, L_0D5A
    // "It dropped something..."
    InfoMsg Route20_Text_DroppedSomething, 2
    LastKeyWait
    InfoMsgClose_0039
    WorkSetConst 0x8010, 7
    WorkSetConst 0x8011, 565
    RTCallGlobal 10853
    VMJump L_0D5A

L_0D5A:
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 32
    VMHalt

Movement_0D64:
    Move 75, 1
    MoveEnd

Movement_0D6C:
    Move 69, 1
    MoveEnd

Script_18:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 33, Movement_0E40
    ActorCmdWait
    WordSetPokeSpecies 0, 43
    Random 0x8008, 100
    WorkCmpConst 0x8008, 80
    VMJumpIf CMP_GE, L_0DA0
    VMJump L_0E09

L_0DA0:
    WorkSetConst 0x8010, 43
    RTCallGlobal 10854
    VMJump L_0E36

L_0DB0:
    // "It dropped something..."
    InfoMsg Route20_Text_DroppedSomething, 2
    LastKeyWait
    InfoMsgClose_0039
    Random 0x8008, 2
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0DD8
    WorkSetConst 0x8000, 35
    VMJump L_0DE4

L_0DD8:
    WorkSetConst 0x8000, 37
    VMJump L_0DE4

L_0DE4:
    ItemCheckSpace 0x8000, 1, 0x800c
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_0E36
    WorkSetConst 0x8001, 1
    RTCallGlobal 2805
    VMJump L_0E36

L_0E09:
    ActorWalkRoute 33, 166, 671, 0, 2, 0
    ActorCmdWait
    ActorCmdExec 33, Movement_0E48
    ActorCmdWait
    WorkCmpConst 0x8008, 70
    VMJumpIf CMP_GE, L_0DB0
    VMJump L_0E36

L_0E36:
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 33
    VMHalt

Movement_0E40:
    Move 75, 1
    MoveEnd

Movement_0E48:
    Move 57, 1
    Move 17, 2
    Move 69, 1
    MoveEnd

Script_19:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 34, Movement_0F24
    ActorCmdWait
    WordSetPokeSpecies 0, 43
    Random 0x8008, 100
    WorkCmpConst 0x8008, 80
    VMJumpIf CMP_GE, L_0E84
    VMJump L_0EED

L_0E84:
    WorkSetConst 0x8010, 43
    RTCallGlobal 10854
    VMJump L_0F1A

L_0E94:
    // "It dropped something..."
    InfoMsg Route20_Text_DroppedSomething, 2
    LastKeyWait
    InfoMsgClose_0039
    Random 0x8008, 2
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0EBC
    WorkSetConst 0x8000, 35
    VMJump L_0EC8

L_0EBC:
    WorkSetConst 0x8000, 37
    VMJump L_0EC8

L_0EC8:
    ItemCheckSpace 0x8000, 1, 0x800c
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_0F1A
    WorkSetConst 0x8001, 1
    RTCallGlobal 2805
    VMJump L_0F1A

L_0EED:
    ActorWalkRoute 34, 166, 671, 0, 2, 0
    ActorCmdWait
    ActorCmdExec 34, Movement_0F2C
    ActorCmdWait
    WorkCmpConst 0x8008, 70
    VMJumpIf CMP_GE, L_0E94
    VMJump L_0F1A

L_0F1A:
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 34
    VMHalt

Movement_0F24:
    Move 75, 1
    MoveEnd

Movement_0F2C:
    Move 57, 1
    Move 17, 2
    Move 69, 1
    MoveEnd

Script_20:
    ActorsPauseAll
    PlayerGetDir 0x800a
    ActorSetEyeToEye
    ActorCmdExec 36, Movement_0F7E
    ActorCmdWait
    WordSetPokeSpecies 0, 399
    ActorWalkRoute 36, 173, 669, 0, 2, 0
    ActorCmdWait
    ActorCmdExec 36, Movement_0F86
    ActorCmdWait
    VMJump L_0F73

L_0F73:
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 36
    VMHalt
    .byte 0x00

Movement_0F7E:
    Move 75, 1
    MoveEnd

Movement_0F86:
    Move 57, 1
    Move 17, 4
    Move 69, 1
    MoveEnd

Script_21:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 44, Movement_0FFC
    ActorCmdWait
    WordSetPokeSpecies 0, 543
    Random 0x8008, 100
    WorkCmpConst 0x8008, 30
    VMJumpIf CMP_GE, L_0FC2
    VMJump L_0FD2

L_0FC2:
    WorkSetConst 0x8010, 543
    RTCallGlobal 10854
    VMJump L_0FF2

L_0FD2:
    ActorWalkRoute 44, 163, 671, 0, 2, 0
    ActorCmdWait
    ActorCmdExec 44, Movement_1004
    ActorCmdWait
    VMJump L_0FF2

L_0FF2:
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 44
    VMHalt

Movement_0FFC:
    Move 75, 1
    MoveEnd

Movement_1004:
    Move 57, 1
    Move 17, 2
    Move 69, 1
    MoveEnd

Script_22:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 46, Movement_1036
    ActorCmdWait
    WorkSetConst 0x8010, 193
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 46
    VMHalt

Movement_1036:
    Move 75, 1
    MoveEnd

Script_23:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 48, Movement_1060
    ActorCmdWait
    WorkSetConst 0x8010, 269
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 48
    VMHalt

Movement_1060:
    Move 75, 1
    MoveEnd

Script_24:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 49, Movement_10EC
    ActorCmdWait
    WorkCmpConst EVENT_WORK_0x4012, 0
    VMJumpIf CMP_EQ, L_109C
    Random 0x8008, 2
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_10C2
    VMJump L_10D6

L_109C:
    ActorWalkRoute 49, 158, 646, 0, 2, 0
    ActorCmdWait
    ActorCmdExec 49, Movement_10F4
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x4012, 1
    VMJump L_10E6

L_10C2:
    WorkSetConst 0x8010, 167
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 49
    VMHalt

L_10D6:
    ActorCmdExec 49, Movement_110C
    ActorCmdWait
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_10E6:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_10EC:
    Move 75, 1
    MoveEnd

Movement_10F4:
    Move 19, 3
    Move 17, 9
    Move 19, 4
    Move 16, 1
    Move 33, 1
    MoveEnd

Movement_110C:
    Move 56, 2
    MoveEnd

Script_25:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 50, Movement_1136
    ActorCmdWait
    WorkSetConst 0x8010, 285
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 50
    VMHalt

Movement_1136:
    Move 75, 1
    MoveEnd

Script_26:
    ActorsPauseAll
    PlayerGetDir 0x800a
    ActorSetEyeToEye
    ActorCmdExec 52, Movement_11E6
    ActorCmdWait
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_11D1
    Random 0x8008, 10
    WorkCmpConst 0x8008, 7
    VMJumpIf CMP_GE, L_11D1
    VMJump L_1176

L_1176:
    ActorGetGPos 52, 0x800b, 0x800c
    WorkCmpConst 0x800b, 163
    VMJumpIf CMP_EQ, L_1191
    VMJump L_11A1

L_1191:
    ActorCmdExec 49, Movement_11EE
    ActorCmdWait
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_11A1:
    WorkCmpConst 0x800b, 165
    VMJumpIf CMP_EQ, L_11B4
    VMJump L_11C4

L_11B4:
    ActorCmdExec 49, Movement_11F6
    ActorCmdWait
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_11C4:
    WorkCmpConst 0x800c, 164
    VMJumpIf CMP_EQ, L_11D1

L_11D1:
    WorkSetConst 0x8010, 167
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 52
    VMHalt
    .byte 0x00

Movement_11E6:
    Move 75, 1
    MoveEnd

Movement_11EE:
    Move 56, 2
    MoveEnd

Movement_11F6:
    Move 56, 2
    MoveEnd

Script_27:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 56, Movement_1286
    ActorCmdWait
    WordSetPokeSpecies 0, 46
    Random 0x8008, 100
    WorkCmpConst 0x8008, 80
    VMJumpIf CMP_GE, L_122A
    VMJump L_1259

L_122A:
    WorkSetConst 0x8010, 46
    RTCallGlobal 10854
    VMJump L_127C

L_123A:
    // "It dropped something..."
    InfoMsg Route20_Text_DroppedSomething, 2
    LastKeyWait
    InfoMsgClose_0039
    WorkSetConst 0x8010, 2
    WorkSetConst 0x8011, 86
    RTCallGlobal 10853
    VMJump L_127C

L_1259:
    ActorWalkRoute 56, 156, 642, 0, 2, 0
    ActorCmdWait
    WorkCmpConst 0x8008, 70
    VMJumpIf CMP_GE, L_123A
    VMJump L_127C

L_127C:
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 56
    VMHalt

Movement_1286:
    Move 75, 1
    MoveEnd

Script_28:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 55, Movement_12B0
    ActorCmdWait
    WorkSetConst 0x8010, 43
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 55
    VMHalt

Movement_12B0:
    Move 75, 1
    MoveEnd

Script_29:
    WorkSetConst 0x8012, 0
    ItemCheckAmount ITEM_PECHA_BERRY, 1, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_1303
    ItemCheckAmount ITEM_CHESTO_BERRY, 1, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_1303
    ItemCheckAmount ITEM_RAWST_BERRY, 1, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_1303
    VMJump L_1399

L_1303:
    // "Give it a berry?[f000]븁\u0000"
    InfoMsg Route20_Text_GiveBerry, 2
    ListMenu_AnchorTopRight 30, 10, 0, 1, 32776
    ItemCheckAmount ITEM_PECHA_BERRY, 1, 0x8009
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_132E
    ListMenuAdd 20, 0, 151

L_132E:
    ItemCheckAmount ITEM_CHESTO_BERRY, 1, 0x8009
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_134B
    ListMenuAdd 21, 0, 150

L_134B:
    ItemCheckAmount ITEM_RAWST_BERRY, 1, 0x8009
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_1368
    ListMenuAdd 22, 0, 152

L_1368:
    ListMenuShow
    MsgWinCloseAll
    WorkCmpConst 0x8008, 151
    VMJumpIf CMP_EQ, L_13A5
    WorkCmpConst 0x8008, 150
    VMJumpIf CMP_EQ, L_13B9
    WorkCmpConst 0x8008, 152
    VMJumpIf CMP_EQ, L_13CD
    VMJump L_13E1

L_1399:
    WorkSetConst 0x8012, 0
    VMJump L_13ED

L_13A5:
    ItemSub ITEM_PECHA_BERRY, 1, 0x8009
    WorkSetConst 0x8012, 1
    VMJump L_13ED

L_13B9:
    ItemSub ITEM_CHESTO_BERRY, 1, 0x8009
    WorkSetConst 0x8012, 2
    VMJump L_13ED

L_13CD:
    ItemSub ITEM_RAWST_BERRY, 1, 0x8009
    WorkSetConst 0x8012, 3
    VMJump L_13ED

L_13E1:
    WorkSetConst 0x8012, 4
    VMJump L_13ED

L_13ED:
    VMReturn
    .byte 0x00

Script_30:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 14, Movement_157C
    ActorCmdWait
    WordSetPokeSpecies 0, 266
    WorkCmpConst EVENT_WORK_0x4031, 3
    VMJumpIf CMP_GE, L_1416
    VMJump L_1432

L_1416:
    WorkCmpConst EVENT_WORK_0x4031, 6
    VMJumpIf CMP_LT, L_1429
    VMJump L_1432

L_1429:
    // "[f000]Ā\u0001\u0000 seems happy to see you!"
    InfoMsg Route20_Text_SeemsHappySee, 2
    LastKeyWait
    InfoMsgClose_0039

L_1432:
    WorkCmpConst EVENT_WORK_0x4031, 6
    VMJumpIf CMP_GE, L_1445
    VMJump L_144E

L_1445:
    // "[f000]Ā\u0001\u0000 is really happy to see you!"
    InfoMsg Route20_Text_ReallyHappySee, 2
    LastKeyWait
    InfoMsgClose_0039

L_144E:
    FlagGet EVENT_FLAG_DAILY_0x0aef, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_1558
    WorkCmpConst EVENT_WORK_0x4031, 3
    VMJumpIf CMP_LT, L_1474
    VMJump L_147D

L_1474:
    // "[f000]Ā\u0001\u0000 looks hungry."
    InfoMsg Route20_Text_LooksHungry, 2
    LastKeyWait
    InfoMsgClose_0039

L_147D:
    VMCall Script_29
    WorkCmpConst 0x8012, 0
    VMJumpIf CMP_EQ, L_14E0
    WorkCmpConst 0x8012, 4
    VMJumpIf CMP_EQ, L_1567
    FlagSet EVENT_FLAG_DAILY_0x0aef
    WorkGet 0x8008, EVENT_WORK_0x4031
    WorkAdd 0x8008, 1
    WorkGet EVENT_WORK_0x4031, 0x8008
    WorkCmpConst 0x8012, 1
    VMJumpIf CMP_EQ, L_14EF
    WorkCmpConst 0x8012, 2
    VMJumpIf CMP_EQ, L_14FE
    WorkCmpConst 0x8012, 3
    VMJumpIf CMP_EQ, L_1549
    VMJump L_1576

L_14E0:
    // "You don't have any berries it likes..."
    InfoMsg Route20_Text_DontHaveAnyBerries, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1576

L_14EF:
    // "[f000]Ā\u0001\u0000 ate the berry.[f000]븁\u0000\nIt likes the [f000][ff00]\u0001\u0002sweet[f000][ff00]\u0001\u0000 flavor,\nbut maybe it would like it better[f000]븀\u0000\nif you gave it a [f000][ff00]\u0001\u0002dry[f000][ff00]\u0001\u0000 berry?[f000]븁\u0000\nIt still seems to have\ngrown closer to you!"
    InfoMsg Route20_Text_AteBerryLikesSweet_3, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1576

L_14FE:
    // "[f000]Ā\u0001\u0000 loves the dry flavor![f000]븁\u0000\nIt seems to have grown\ncloser to you!"
    InfoMsg Route20_Text_LovesDryFlavorSeems, 2
    LastKeyWait
    InfoMsgClose_0039
    WorkCmpConst EVENT_WORK_0x4031, 6
    VMJumpIf CMP_GE, L_151A
    VMJump L_1543

L_151A:
    WorkSetConst EVENT_WORK_0x402f, 2
    ActorCmdExec 14, Movement_1584
    ActorCmdWait
    ActorSetEyeToEye
    PVPlay 266, 0
    PVWait
    // "[f000]Ā\u0001\u0000 seems stronger![f000]븁\u0000\nYou should come back and\ncheck on it later!"
    InfoMsg Route20_Text_SeemsStrongerShouldCome, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1576

L_1543:
    VMJump L_1576

L_1549:
    // "It doesn't seem to like [f000][ff00]\u0001\u0002bitter[f000][ff00]\u0001\u0000 flavors..."
    InfoMsg Route20_Text_DoesntSeemLikeBitter, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1576

L_1558:
    // "[f000]Ā\u0001\u0000 looks happy with it's belly full!"
    InfoMsg Route20_Text_LooksHappyItsBelly, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1576

L_1567:
    // "[f000]Ā\u0001\u0000 looks sad..."
    InfoMsg Route20_Text_LooksSad, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1576

L_1576:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_157C:
    Move 75, 1
    MoveEnd

Movement_1584:
    Move 34, 1
    Move 32, 1
    Move 35, 1
    Move 33, 1
    MoveEnd

Script_31:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 17, Movement_1724
    ActorCmdWait
    WordSetPokeSpecies 0, 268
    WorkCmpConst EVENT_WORK_0x4031, 3
    VMJumpIf CMP_GE, L_15BE
    VMJump L_15DA

L_15BE:
    WorkCmpConst EVENT_WORK_0x4031, 6
    VMJumpIf CMP_LT, L_15D1
    VMJump L_15DA

L_15D1:
    // "[f000]Ā\u0001\u0000 seems happy to see you!"
    InfoMsg Route20_Text_SeemsHappySee, 2
    LastKeyWait
    InfoMsgClose_0039

L_15DA:
    WorkCmpConst EVENT_WORK_0x4031, 6
    VMJumpIf CMP_GE, L_15ED
    VMJump L_15F6

L_15ED:
    // "[f000]Ā\u0001\u0000 is really happy to see you!"
    InfoMsg Route20_Text_ReallyHappySee, 2
    LastKeyWait
    InfoMsgClose_0039

L_15F6:
    FlagGet EVENT_FLAG_DAILY_0x0aef, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_1700
    WorkCmpConst EVENT_WORK_0x4031, 3
    VMJumpIf CMP_LT, L_161C
    VMJump L_1625

L_161C:
    // "[f000]Ā\u0001\u0000 looks hungry."
    InfoMsg Route20_Text_LooksHungry, 2
    LastKeyWait
    InfoMsgClose_0039

L_1625:
    VMCall Script_29
    WorkCmpConst 0x8012, 0
    VMJumpIf CMP_EQ, L_1688
    WorkCmpConst 0x8012, 4
    VMJumpIf CMP_EQ, L_170F
    FlagSet EVENT_FLAG_DAILY_0x0aef
    WorkGet 0x8008, EVENT_WORK_0x4031
    WorkAdd 0x8008, 1
    WorkGet EVENT_WORK_0x4031, 0x8008
    WorkCmpConst 0x8012, 1
    VMJumpIf CMP_EQ, L_1697
    WorkCmpConst 0x8012, 2
    VMJumpIf CMP_EQ, L_16A6
    WorkCmpConst 0x8012, 3
    VMJumpIf CMP_EQ, L_16B5
    VMJump L_171E

L_1688:
    // "You don't have any berries it likes..."
    InfoMsg Route20_Text_DontHaveAnyBerries, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_171E

L_1697:
    // "[f000]Ā\u0001\u0000 ate the berry.[f000]븁\u0000\nIt likes the [f000][ff00]\u0001\u0002sweet[f000][ff00]\u0001\u0000 flavor,\nbut maybe it would like it better[f000]븀\u0000\nif you gave it a [f000][ff00]\u0001\u0002bitter[f000][ff00]\u0001\u0000 berry?[f000]븁\u0000\nIt still seems to have\ngrown closer to you!"
    InfoMsg Route20_Text_AteBerryLikesSweet_2, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_171E

L_16A6:
    // "It doesn't seem to like [f000][ff00]\u0001\u0002dry[f000][ff00]\u0001\u0000 flavors..."
    InfoMsg Route20_Text_DoesntSeemLikeDry, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_171E

L_16B5:
    // "[f000]Ā\u0001\u0000 loves the bitter flavor![f000]븁\u0000\nIt seems to have grown\ncloser to you!"
    InfoMsg Route20_Text_LovesBitterFlavorSeems, 2
    LastKeyWait
    InfoMsgClose_0039
    WorkCmpConst EVENT_WORK_0x4031, 6
    VMJumpIf CMP_GE, L_16D1
    VMJump L_16FA

L_16D1:
    WorkSetConst EVENT_WORK_0x402f, 4
    ActorCmdExec 17, Movement_172C
    ActorCmdWait
    ActorSetEyeToEye
    PVPlay 268, 0
    PVWait
    // "[f000]Ā\u0001\u0000 seems stronger![f000]븁\u0000\nYou should come back and\ncheck on it later!"
    InfoMsg Route20_Text_SeemsStrongerShouldCome, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_171E

L_16FA:
    VMJump L_171E

L_1700:
    // "[f000]Ā\u0001\u0000 looks happy with it's belly full!"
    InfoMsg Route20_Text_LooksHappyItsBelly, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_171E

L_170F:
    // "[f000]Ā\u0001\u0000 looks sad..."
    InfoMsg Route20_Text_LooksSad, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_171E

L_171E:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_1724:
    Move 75, 1
    MoveEnd

Movement_172C:
    Move 34, 1
    Move 32, 1
    Move 35, 1
    Move 33, 1
    MoveEnd

Script_32:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 47, Movement_1910
    ActorCmdWait
    WordSetPokeSpecies 0, 267
    WorkCmpConst EVENT_WORK_0x4031, 3
    VMJumpIf CMP_GE, L_1766
    VMJump L_1782

L_1766:
    WorkCmpConst EVENT_WORK_0x4031, 6
    VMJumpIf CMP_LT, L_1779
    VMJump L_1782

L_1779:
    // "[f000]Ā\u0001\u0000 seems happy to see you!"
    InfoMsg Route20_Text_SeemsHappySee, 2
    LastKeyWait
    InfoMsgClose_0039

L_1782:
    WorkCmpConst EVENT_WORK_0x4031, 6
    VMJumpIf CMP_GE, L_1795
    VMJump L_179E

L_1795:
    // "[f000]Ā\u0001\u0000 is really happy to see you!"
    InfoMsg Route20_Text_ReallyHappySee, 2
    LastKeyWait
    InfoMsgClose_0039

L_179E:
    FlagGet EVENT_FLAG_DAILY_0x0aef, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_18EB
    WorkCmpConst EVENT_WORK_0x4031, 3
    VMJumpIf CMP_LT, L_17C4
    VMJump L_17CD

L_17C4:
    // "[f000]Ā\u0001\u0000 looks hungry."
    InfoMsg Route20_Text_LooksHungry, 2
    LastKeyWait
    InfoMsgClose_0039

L_17CD:
    VMCall Script_29
    WorkCmpConst 0x8012, 0
    VMJumpIf CMP_EQ, L_18DC
    WorkCmpConst 0x8012, 4
    VMJumpIf CMP_EQ, L_18FA
    FlagSet EVENT_FLAG_DAILY_0x0aef
    WorkCmpConst 0x8012, 1
    VMJumpIf CMP_EQ, L_1811
    WorkCmpConst 0x8012, 2
    VMJumpIf CMP_EQ, L_182A
    VMJump L_18CD

L_1811:
    Random 0x8008, 100
    WorkCmpConst 0x8008, 20
    VMJumpIf CMP_GE, L_18BE
    VMJump L_1843

L_182A:
    Random 0x8008, 100
    WorkCmpConst 0x8008, 50
    VMJumpIf CMP_GE, L_18BE
    VMJump L_1843

L_1843:
    Random 0x8008, 3
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_1887
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_1875
    WorkSetConst 0x8010, 14
    WorkSetConst 0x8011, 2
    VMJump L_1899

L_1875:
    WorkSetConst 0x8010, 25
    WorkSetConst 0x8011, 17
    VMJump L_1899

L_1887:
    WorkSetConst 0x8010, 9
    WorkSetConst 0x8011, 492
    VMJump L_1899

L_1899:
    // "[f000]Ā\u0001\u0000 has something for you!"
    InfoMsg Route20_Text_HasSomething, 2
    LastKeyWait
    InfoMsgClose_0039
    RTCallGlobal 10853
    WordSetPokeSpecies 0, 267
    WorkCmpConst 0x8012, 0
    VMJumpIf CMP_EQ, L_18BE
    VMJump L_1909

L_18BE:
    // "[f000]Ā\u0001\u0000 is beaming!"
    InfoMsg Route20_Text_Beaming, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1909

L_18CD:
    // "It doesn't seem to like [f000][ff00]\u0001\u0002bitter[f000][ff00]\u0001\u0000 flavors..."
    InfoMsg Route20_Text_DoesntSeemLikeBitter, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1909

L_18DC:
    // "You don't have any berries it likes..."
    InfoMsg Route20_Text_DontHaveAnyBerries, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1909

L_18EB:
    // "[f000]Ā\u0001\u0000 looks happy with it's belly full!"
    InfoMsg Route20_Text_LooksHappyItsBelly, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1909

L_18FA:
    // "[f000]Ā\u0001\u0000 looks sad..."
    InfoMsg Route20_Text_LooksSad, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1909

L_1909:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_1910:
    Move 75, 1
    MoveEnd

Script_33:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 48, Movement_1AE8
    ActorCmdWait
    WordSetPokeSpecies 0, 269
    WorkCmpConst EVENT_WORK_0x4031, 3
    VMJumpIf CMP_GE, L_193E
    VMJump L_195A

L_193E:
    WorkCmpConst EVENT_WORK_0x4031, 6
    VMJumpIf CMP_LT, L_1951
    VMJump L_195A

L_1951:
    // "[f000]Ā\u0001\u0000 seems happy to see you!"
    InfoMsg Route20_Text_SeemsHappySee, 2
    LastKeyWait
    InfoMsgClose_0039

L_195A:
    WorkCmpConst EVENT_WORK_0x4031, 6
    VMJumpIf CMP_GE, L_196D
    VMJump L_1976

L_196D:
    // "[f000]Ā\u0001\u0000 is really happy to see you!"
    InfoMsg Route20_Text_ReallyHappySee, 2
    LastKeyWait
    InfoMsgClose_0039

L_1976:
    FlagGet EVENT_FLAG_DAILY_0x0aef, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_1AC3
    WorkCmpConst EVENT_WORK_0x4031, 3
    VMJumpIf CMP_LT, L_199C
    VMJump L_19A5

L_199C:
    // "[f000]Ā\u0001\u0000 looks hungry."
    InfoMsg Route20_Text_LooksHungry, 2
    LastKeyWait
    InfoMsgClose_0039

L_19A5:
    VMCall Script_29
    WorkCmpConst 0x8012, 0
    VMJumpIf CMP_EQ, L_1AB4
    WorkCmpConst 0x8012, 4
    VMJumpIf CMP_EQ, L_1AD2
    FlagSet EVENT_FLAG_DAILY_0x0aef
    WorkCmpConst 0x8012, 1
    VMJumpIf CMP_EQ, L_19E9
    WorkCmpConst 0x8012, 3
    VMJumpIf CMP_EQ, L_1A02
    VMJump L_1AA5

L_19E9:
    Random 0x8008, 100
    WorkCmpConst 0x8008, 20
    VMJumpIf CMP_GE, L_1A96
    VMJump L_1A1B

L_1A02:
    Random 0x8008, 100
    WorkCmpConst 0x8008, 50
    VMJumpIf CMP_GE, L_1A96
    VMJump L_1A1B

L_1A1B:
    Random 0x8008, 3
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_1A5F
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_1A4D
    WorkSetConst 0x8010, 14
    WorkSetConst 0x8011, 2
    VMJump L_1A71

L_1A4D:
    WorkSetConst 0x8010, 25
    WorkSetConst 0x8011, 17
    VMJump L_1A71

L_1A5F:
    WorkSetConst 0x8010, 9
    WorkSetConst 0x8011, 492
    VMJump L_1A71

L_1A71:
    // "[f000]Ā\u0001\u0000 has something for you!"
    InfoMsg Route20_Text_HasSomething, 2
    LastKeyWait
    InfoMsgClose_0039
    RTCallGlobal 10853
    WordSetPokeSpecies 0, 269
    WorkCmpConst 0x8012, 0
    VMJumpIf CMP_EQ, L_1A96
    VMJump L_1AE1

L_1A96:
    // "[f000]Ā\u0001\u0000 is beaming!"
    InfoMsg Route20_Text_Beaming, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1AE1

L_1AA5:
    // "It doesn't seem to like [f000][ff00]\u0001\u0002dry[f000][ff00]\u0001\u0000 flavors..."
    InfoMsg Route20_Text_DoesntSeemLikeDry, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1AE1

L_1AB4:
    // "You don't have any berries it likes..."
    InfoMsg Route20_Text_DontHaveAnyBerries, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1AE1

L_1AC3:
    // "[f000]Ā\u0001\u0000 looks happy with it's belly full!"
    InfoMsg Route20_Text_LooksHappyItsBelly, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1AE1

L_1AD2:
    // "[f000]Ā\u0001\u0000 looks sad..."
    InfoMsg Route20_Text_LooksSad, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_1AE1

L_1AE1:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_1AE8:
    Move 75, 1
    MoveEnd
