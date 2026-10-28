#include "asm/field_script.inc"
#include "text/script/virbank_complex_2.h"

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
    ScriptEntriesEnd

Script_1:
    ActorsPauseAll
    VMStackPushFlag EVENT_FLAG_0x0132
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00EA
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Hey there, Trainer!\nIt looks like you've got energetic[f000]븀\u0000\nPokémon there with ya![f000]븁\u0000\nCan I ask a favor?[f000]븁\u0000\nI need to get the Workers\nin this complex fired up![f000]븁\u0000\nHow about it?\nHelp a guy out, will ya?"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_HeyThereTrainerLooks, 0, 0
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00D6
    // "Yeah! That's what I like to hear![f000]븁\u0000\nThere are some new Workers\nhere in the complex![f000]븁\u0000\nGo get those three raring to go!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_YeahThatsWhatLike, 0, 0
    LastKeyWait
    MsgWinCloseAll
    FlagSet EVENT_FLAG_0x0132
    VMJump L_00E4

L_00D6:
    // "Really? Nobody really wants\nanything enough anymore!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_ReallyNobodyReallyWants, 0, 0
    LastKeyWait
    MsgWinCloseAll

L_00E4:
    VMJump L_019B

L_00EA:
    VMStackPushFlag EVENT_FLAG_0x0133
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackPushFlag EVENT_FLAG_0x0134
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackPushFlag EVENT_FLAG_0x0135
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_0187
    VMStackPush 0x8000
    VMStackPush 0x8001
    VMStackPush 0x8002
    VMStackPush 0x8003
    VMStackPush 0x8004
    VMStackPush 0x8005
    VMStackPush 0x8006
    WorkSet 0x8000, 619
    WorkSet 0x8001, 1
    WorkSet 0x8002, 465
    WorkSet 0x8003, 4
    WorkSet 0x8004, 5
    WorkSet 0x8005, 5
    RTGetTextFile 0x8006
    RTCallGlobal 2800
    VMStackPop 0x8006
    VMStackPop 0x8005
    VMStackPop 0x8004
    VMStackPop 0x8003
    VMStackPop 0x8002
    VMStackPop 0x8001
    VMStackPop 0x8000
    VMJump L_019B

L_0187:
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "OK![f000]븁\u0000\nThe three new Workers are\nin different parts of the complex!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_OkThreeNewWorkers, 0, 0
    LastKeyWait
    ActorMsgClose

L_019B:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_2:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMStackPushFlag EVENT_FLAG_0x0132
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01D1
    // "Working at this complex\nwas my dream...[f000]븁\u0000\nBut now that it's come true,\nI've got everything I want..."
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_WorkingComplexDreamBut, 0, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_023F

L_01D1:
    VMStackPushFlag EVENT_FLAG_0x0133
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01F8
    // "I came to this complex so\nmy Pokémon could accomplish a lot![f000]븁\u0000\nThat means that as a Trainer,\nI have to work like crazy!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_CameComplexPokemonCould, 0, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_023F

L_01F8:
    // "Working at this complex\nwas my dream...[f000]븁\u0000\nBut now that it's come true,\nI've got everything I want...[f000]븁\u0000\nWhat? The foreman said so? OK, fine.\nWe just have to battle, right?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_WorkingComplexDreamBut_2, 0, 0
    MsgWinCloseAll
    CallTrainerBattle TRAINER_WORKER_ISAAC, 0, 0
    TrainerBattleIsVictory 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_022B
    CallTrainerBattleEnd
    VMJump L_022D

L_022B:
    CallTrainerLose

L_022D:
    // "I came to this complex so\nmy Pokémon could accomplish a lot![f000]븁\u0000\nThat means that as a Trainer,\nI have to work like crazy!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_CameComplexPokemonCould, 0, 0
    LastKeyWait
    MsgWinCloseAll
    FlagSet EVENT_FLAG_0x0133

L_023F:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_3:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMStackPushFlag EVENT_FLAG_0x0132
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0275
    // "I'm happy just to be with\nmy awesome Pokémon!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_ImHappyJustAwesome, 0, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_02E3

L_0275:
    VMStackPushFlag EVENT_FLAG_0x0134
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_029C
    // "I completely forgot![f000]븁\u0000\nIf I don't work really hard, my Pokémon\nwon't have a chance to shine![f000]븁\u0000\nAll riiight! Time to get to work!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_CompletelyForgotIfDont, 0, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_02E3

L_029C:
    // "I'm happy just to be with\nmy awesome Pokémon![f000]븁\u0000\nWhat? A battle?\nI guess so... I'll play a bit.[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_ImHappyJustAwesome_2, 0, 0
    MsgWinCloseAll
    CallTrainerBattle TRAINER_WORKER_MITCHELL, 0, 0
    TrainerBattleIsVictory 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_02CF
    CallTrainerBattleEnd
    VMJump L_02D1

L_02CF:
    CallTrainerLose

L_02D1:
    // "I completely forgot![f000]븁\u0000\nIf I don't work really hard, my Pokémon\nwon't have a chance to shine![f000]븁\u0000\nAll riiight! Time to get to work!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_CompletelyForgotIfDont, 0, 0
    LastKeyWait
    MsgWinCloseAll
    FlagSet EVENT_FLAG_0x0134

L_02E3:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_4:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMStackPushFlag EVENT_FLAG_0x0132
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0319
    // "Every day is the same..."
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_EveryDaySame, 0, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_0387

L_0319:
    VMStackPushFlag EVENT_FLAG_0x0135
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0340
    // "It's OK if every day's the same\nwhen I'm working at this complex![f000]븀\u0000\nIt means there aren't any problems!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_ItsOkIfEvery, 0, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_0387

L_0340:
    // "Every day is the same...[f000]븁\u0000\nI get bored when things don't change,\nso I don't mind battling you![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_EveryDaySameGet, 0, 0
    MsgWinCloseAll
    CallTrainerBattle TRAINER_WORKER_NATHAN, 0, 0
    TrainerBattleIsVictory 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0373
    CallTrainerBattleEnd
    VMJump L_0375

L_0373:
    CallTrainerLose

L_0375:
    // "It's OK if every day's the same\nwhen I'm working at this complex![f000]븀\u0000\nIt means there aren't any problems!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_ItsOkIfEvery, 0, 0
    LastKeyWait
    MsgWinCloseAll
    FlagSet EVENT_FLAG_0x0135

L_0387:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_5:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    WorkCmpConst EVENT_WORK_0x40dd, 0
    VMJumpIf CMP_EQ, L_03A7
    VMJump L_04B7

L_03A7:
    // "Heating crude oil separates\nit into many different components...[f000]븀\u0000\nThat's what this distillation tower is for![f000]븁\u0000\nIt's also known as a topper,\nbut I want to call it a distillation tower."
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_HeatingCrudeOilSeparates, 0, 0
    MsgWaitAdvance
    MsgWinCloseAll
    ActorCmdExec 7, Movement_0708
    ActorCmdWait
    PlayerGetDir 0x8010
    WorkCmpConst 0x8010, 0
    VMJumpIf CMP_EQ, L_03D6
    VMJump L_03E4

L_03D6:
    ActorCmdExec 7, Movement_0710
    VMJump L_0426

L_03E4:
    WorkCmpConst 0x8010, 3
    VMJumpIf CMP_EQ, L_03F7
    VMJump L_0405

L_03F7:
    ActorCmdExec 7, Movement_0718
    VMJump L_0426

L_0405:
    WorkCmpConst 0x8010, 2
    VMJumpIf CMP_EQ, L_0418
    VMJump L_0426

L_0418:
    ActorCmdExec 7, Movement_0720
    VMJump L_0426

L_0426:
    ActorCmdWait
    // "Oh! My knowledge overflowed,\nand it was overheard!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_OhKnowledgeOverflowedOverheard, 0, 0
    MsgWaitAdvance
    MsgWinCloseAll
    WorkCmpConst 0x8010, 0
    VMJumpIf CMP_EQ, L_0449
    VMJump L_045D

L_0449:
    ActorWalkRoute 7, 30, 40, 0, 1, 0
    VMJump L_0491

L_045D:
    WorkCmpConst 0x8010, 3
    VMJumpIf CMP_EQ, L_047D
    WorkCmpConst 0x8010, 2
    VMJumpIf CMP_EQ, L_047D
    VMJump L_0491

L_047D:
    ActorWalkRoute 7, 30, 40, 0, 1, 0
    VMJump L_0491

L_0491:
    VMSleep 16
    ActorCmdExec 255, Movement_0728
    ActorCmdWait
    ActorSetGPos 7, 8, 0, 47, 2
    WorkSetConst EVENT_WORK_0x40dd, 1
    VMJump L_0701

L_04B7:
    WorkCmpConst EVENT_WORK_0x40dd, 1
    VMJumpIf CMP_EQ, L_04CA
    VMJump L_05E2

L_04CA:
    // "The smokestacks of the complex\nrise up into the sky.[f000]븁\u0000\nThat powerful silhouette\nis sure breathtaking, isn't it?[f000]븁\u0000\nBy the way, they're burning up\nwaste gas.[f000]븁\u0000\nRecently, they've found all sorts\nof uses for this gas, though."
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_SmokestacksComplexRiseUp, 0, 0
    MsgWaitAdvance
    MsgWinCloseAll
    ActorCmdExec 7, Movement_0730
    ActorCmdWait
    PlayerGetDir 0x8010
    WorkCmpConst 0x8010, 0
    VMJumpIf CMP_EQ, L_04F9
    VMJump L_0507

L_04F9:
    ActorCmdExec 7, Movement_0738
    VMJump L_0549

L_0507:
    WorkCmpConst 0x8010, 2
    VMJumpIf CMP_EQ, L_051A
    VMJump L_0528

L_051A:
    ActorCmdExec 7, Movement_0740
    VMJump L_0549

L_0528:
    WorkCmpConst 0x8010, 1
    VMJumpIf CMP_EQ, L_053B
    VMJump L_0549

L_053B:
    ActorCmdExec 7, Movement_0748
    VMJump L_0549

L_0549:
    ActorCmdWait
    // "Oh! You overheard some\nof my vast stock of knowledge!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_OhOverheardSomeVast, 0, 0
    MsgWaitAdvance
    MsgWinCloseAll
    WorkCmpConst 0x8010, 0
    VMJumpIf CMP_EQ, L_056C
    VMJump L_057A

L_056C:
    ActorCmdExec 7, Movement_0750
    VMJump L_05BC

L_057A:
    WorkCmpConst 0x8010, 2
    VMJumpIf CMP_EQ, L_058D
    VMJump L_059B

L_058D:
    ActorCmdExec 7, Movement_0764
    VMJump L_05BC

L_059B:
    WorkCmpConst 0x8010, 1
    VMJumpIf CMP_EQ, L_05AE
    VMJump L_05BC

L_05AE:
    ActorCmdExec 7, Movement_0774
    VMJump L_05BC

L_05BC:
    VMSleep 16
    ActorCmdExec 255, Movement_0788
    ActorCmdWait
    ActorSetGPos 7, 20, 65535, 58, 3
    WorkSetConst EVENT_WORK_0x40dd, 2
    VMJump L_0701

L_05E2:
    WorkCmpConst EVENT_WORK_0x40dd, 2
    VMJumpIf CMP_EQ, L_05F5
    VMJump L_0701

L_05F5:
    // "Those gas holders are sure an\nexpression of harmony, aren't they?[f000]븁\u0000\nThere's a reason behind that shape.[f000]븁\u0000\nA sphere is best for withstanding\nthe tremendous pressure inside.[f000]븁\u0000\nIt would be nice if they would draw\na Pokémon on these gas holders, too."
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_ThoseGasHoldersSure, 0, 0
    MsgWaitAdvance
    MsgWinCloseAll
    PlayerGetDir 0x8010
    WorkCmpConst 0x8010, 3
    VMJumpIf CMP_EQ, L_061A
    VMJump L_0628

L_061A:
    ActorCmdExec 7, Movement_0790
    VMJump L_0649

L_0628:
    WorkCmpConst 0x8010, 1
    VMJumpIf CMP_EQ, L_063B
    VMJump L_0649

L_063B:
    ActorCmdExec 7, Movement_0798
    VMJump L_0649

L_0649:
    ActorCmdWait
    VMStackPushFlag EVENT_FLAG_0x0136
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_06E7
    // "Oh! You overheard some\nof my breathtaking knowledge.[f000]븁\u0000\nAre you actually...interested\nin what I have to say?[f000]븁\u0000\nThat would mean I have\na complex buddy![f000]븁\u0000\nThat makes me really happy!\nWell then, take this with you!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_OhOverheardSomeBreathtaking, 0, 0
    MsgWaitAdvance
    MsgWinCloseAll
    ItemCheckSpace ITEM_ETHER, 1, 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_06B7
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 38
    WorkSet 0x8001, 1
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    FlagSet EVENT_FLAG_0x0136
    VMCall Script_8
    VMJump L_06E1

L_06B7:
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 38
    WorkSet 0x8001, 1
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    ActorCmdExec 7, Movement_07A0
    ActorCmdWait

L_06E1:
    VMJump L_06FB

L_06E7:
    // "I know a lot about the complex, right?[f000]븁\u0000\nI was even scouted by the foreman,\nbut I'm happy just looking at it!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_KnowLotAboutComplex, 0, 0
    MsgWaitAdvance
    MsgWinCloseAll
    VMCall Script_8

L_06FB:
    VMJump L_0701

L_0701:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_0708:
    Move 75, 1
    MoveEnd

Movement_0710:
    Move 33, 1
    MoveEnd

Movement_0718:
    Move 34, 1
    MoveEnd

Movement_0720:
    Move 35, 1
    MoveEnd

Movement_0728:
    Move 33, 1
    MoveEnd

Movement_0730:
    Move 75, 1
    MoveEnd

Movement_0738:
    Move 33, 1
    MoveEnd

Movement_0740:
    Move 35, 1
    MoveEnd

Movement_0748:
    Move 32, 1
    MoveEnd

Movement_0750:
    Move 15, 1
    Move 13, 1
    Move 15, 6
    Move 13, 5
    MoveEnd

Movement_0764:
    Move 13, 1
    Move 15, 7
    Move 13, 5
    MoveEnd

Movement_0774:
    Move 15, 1
    Move 13, 2
    Move 15, 6
    Move 13, 5
    MoveEnd

Movement_0788:
    Move 35, 1
    MoveEnd

Movement_0790:
    Move 34, 1
    MoveEnd

Movement_0798:
    Move 32, 1
    MoveEnd

Movement_07A0:
    Move 35, 1
    MoveEnd

Script_6:
    WorkCmpConst EVENT_WORK_0x40dd, 0
    VMJumpIf CMP_EQ, L_07BB
    VMJump L_07CD

L_07BB:
    ActorSetGPos 7, 29, 0, 32, 0
    VMJump L_0817

L_07CD:
    WorkCmpConst EVENT_WORK_0x40dd, 1
    VMJumpIf CMP_EQ, L_07E0
    VMJump L_07F2

L_07E0:
    ActorSetGPos 7, 8, 0, 47, 2
    VMJump L_0817

L_07F2:
    WorkCmpConst EVENT_WORK_0x40dd, 2
    VMJumpIf CMP_EQ, L_0805
    VMJump L_0817

L_0805:
    ActorSetGPos 7, 20, 65535, 58, 3
    VMJump L_0817

L_0817:
    VMHalt
    .byte 0x00

Script_7:
    ActorsPauseAll
    VMStackPushFlag EVENT_FLAG_0x01d3
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_08B4
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Oh my! Why, you have a\nPokédex, don't you?[f000]븁\u0000\nI heard that the newest Pokédex\nhas an amazing function called[f000]븀\u0000\nthe Habitat List![f000]븁\u0000\nCould you use it to show me what kind\nof Pokémon live in this complex?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_OhWhyHavePokedex, 0, 0
    PokeDexCheckHabitatList 456, 0, 0, 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_08A0
    // "Amazing!\nThe Habitat List is filled up![f000]븁\u0000\nSo amazing! There are so many\nPokémon living in this complex![f000]븁\u0000\nHere, take these as thanks![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_AmazingHabitatListFilled, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 3
    WorkSet 0x8001, 5
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    FlagSet EVENT_FLAG_0x01d3
    // "If you fill up the Habitat Lists, you might\ncomplete the Pokédex before you know it!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_IfFillUpHabitat, 0, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_08AE

L_08A0:
    // "Oh? You don't have the\nHabitat List for the complex[f000]븀\u0000\nfilled up yet..."
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_OhDontHaveHabitat, 0, 0
    LastKeyWait
    MsgWinCloseAll

L_08AE:
    VMJump L_08C8

L_08B4:
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "If you fill up the Habitat Lists, you might\ncomplete the Pokédex before you know it!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_IfFillUpHabitat, 0, 0
    LastKeyWait
    ActorMsgClose

L_08C8:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_8:
    PlayerGetDir 0x8010
    WorkCmpConst 0x8010, 3
    VMJumpIf CMP_EQ, L_08E5
    VMJump L_08F3

L_08E5:
    ActorCmdExec 7, Movement_0936
    VMJump L_0914

L_08F3:
    WorkCmpConst 0x8010, 1
    VMJumpIf CMP_EQ, L_0906
    VMJump L_0914

L_0906:
    ActorCmdExec 7, Movement_0946
    VMJump L_0914

L_0914:
    VMSleep 16
    ActorCmdExec 255, Movement_095A
    ActorCmdWait
    ActorSetGPos 7, 29, 0, 32, 0
    WorkSetConst EVENT_WORK_0x40dd, 0
    VMReturn

Movement_0936:
    Move 12, 1
    Move 14, 4
    Move 12, 8
    MoveEnd

Movement_0946:
    Move 14, 1
    Move 12, 1
    Move 14, 3
    Move 12, 8
    MoveEnd

Movement_095A:
    Move 34, 1
    MoveEnd

Script_9:
    ActorsPauseAll
    ActorCmdExec 1, Movement_0A0E
    ActorCmdExec 36, Movement_0A16
    ActorCmdWait
    EvCameraInit
    EvCameraUnbind
    EvCameraMoveTo 10000, 0, 0xc0000, 0xf8000, 0, 0x3e0000, 20
    EvCameraWait
    ActorNew 13, 62, 1, 43, 323, 0
    ActorNew 17, 62, 1, 44, 324, 0
    ActorCmdExec 43, Movement_0A1E
    ActorCmdExec 44, Movement_0A2A
    ActorCmdWait
    ActorCmdExec 43, Movement_0A36
    ActorCmdExec 44, Movement_0A62
    ActorCmdWait
    ActorCmdExec 43, Movement_0A8E
    ActorCmdExec 44, Movement_0A9E
    ActorCmdWait
    ActorCmdExec 43, Movement_0AAE
    ActorCmdExec 44, Movement_0ABA
    ActorCmdWait
    ActorDelete 43
    ActorDelete 44
    EvCameraMoveToDefault 20
    EvCameraWait
    EvCameraRebind
    EvCameraEnd
    ActorsUnpauseAll
    VMHalt

Movement_0A0E:
    Move 1, 1
    MoveEnd

Movement_0A16:
    Move 1, 1
    MoveEnd

Movement_0A1E:
    Move 49, 1
    Move 61, 1
    MoveEnd

Movement_0A2A:
    Move 49, 1
    Move 61, 1
    MoveEnd

Movement_0A36:
    Move 12, 1
    Move 15, 5
    Move 13, 2
    Move 14, 6
    Move 12, 2
    Move 15, 2
    Move 13, 2
    Move 14, 2
    Move 12, 1
    Move 15, 1
    MoveEnd

Movement_0A62:
    Move 13, 1
    Move 14, 5
    Move 12, 2
    Move 15, 6
    Move 13, 2
    Move 14, 2
    Move 12, 2
    Move 15, 2
    Move 13, 1
    Move 14, 1
    MoveEnd

Movement_0A8E:
    Move 14, 1
    Move 15, 2
    Move 14, 1
    MoveEnd

Movement_0A9E:
    Move 14, 1
    Move 15, 2
    Move 14, 1
    MoveEnd

Movement_0AAE:
    Move 49, 1
    Move 69, 1
    MoveEnd

Movement_0ABA:
    Move 49, 1
    Move 69, 1
    MoveEnd

Script_10:
    RTCallGlobal 10852
    FlagGet EVENT_FLAG_0x01f4, 0x8008
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0AE3
    VMJump L_0AE7

L_0AE3:
    FlagSet EVENT_FLAG_0x024f

L_0AE7:
    FlagGet EVENT_FLAG_0x0212, 0x8008
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0B00
    VMJump L_0B04

L_0B00:
    FlagSet EVENT_FLAG_0x024f

L_0B04:
    FlagGet EVENT_FLAG_0x01fe, 0x8008
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0B1D
    VMJump L_0B21

L_0B1D:
    FlagSet EVENT_FLAG_0x0250

L_0B21:
    FlagGet EVENT_FLAG_0x0208, 0x8008
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0B3A
    VMJump L_0B3E

L_0B3A:
    FlagSet EVENT_FLAG_0x0250

L_0B3E:
    Random 0x8008, 4
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0B57
    VMJump L_0B63

L_0B57:
    ObjInitNPCGPos 23, 1, 6, 0, 41

L_0B63:
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0B76
    VMJump L_0B9B

L_0B76:
    FlagGet EVENT_FLAG_0x0222, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0B8F
    VMJump L_0B9B

L_0B8F:
    ObjInitNPCGPos 23, 1, 21, 0, 39

L_0B9B:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0BAE
    VMJump L_0BD3

L_0BAE:
    FlagGet EVENT_FLAG_0x0250, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0BC7
    VMJump L_0BD3

L_0BC7:
    ObjInitNPCGPos 23, 1, 23, 0, 45

L_0BD3:
    Random 0x8008, 5
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0BEC
    VMJump L_0BF8

L_0BEC:
    ObjInitNPCGPos 30, 1, 22, 0, 41

L_0BF8:
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0C0B
    VMJump L_0C30

L_0C0B:
    FlagGet EVENT_FLAG_0x0220, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0C24
    VMJump L_0C30

L_0C24:
    ObjInitNPCGPos 30, 1, 26, 0, 46

L_0C30:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0C43
    VMJump L_0C4F

L_0C43:
    ObjInitNPCGPos 30, 1, 9, 0, 32

L_0C4F:
    WorkCmpConst 0x8008, 3
    VMJumpIf CMP_EQ, L_0C62
    VMJump L_0C87

L_0C62:
    FlagGet EVENT_FLAG_0x021f, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0C7B
    VMJump L_0C87

L_0C7B:
    ObjInitNPCGPos 31, 1, 8, 0, 42

L_0C87:
    Random 0x8008, 5
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0CA0
    VMJump L_0CAC

L_0CA0:
    ObjInitNPCGPos 32, 1, 8, 0, 35

L_0CAC:
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0CBF
    VMJump L_0CE4

L_0CBF:
    FlagGet EVENT_FLAG_0x0220, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0CD8
    VMJump L_0CE4

L_0CD8:
    ObjInitNPCGPos 32, 1, 26, 0, 46

L_0CE4:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0CF7
    VMJump L_0D03

L_0CF7:
    ObjInitNPCGPos 32, 1, 9, 0, 32

L_0D03:
    WorkCmpConst 0x8008, 3
    VMJumpIf CMP_EQ, L_0D16
    VMJump L_0D3B

L_0D16:
    FlagGet EVENT_FLAG_0x021f, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0D2F
    VMJump L_0D3B

L_0D2F:
    ObjInitNPCGPos 31, 1, 8, 0, 42

L_0D3B:
    Random 0x8008, 5
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0D54
    VMJump L_0D60

L_0D54:
    ObjInitNPCGPos 29, 1, 22, 0, 41

L_0D60:
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0D73
    VMJump L_0D98

L_0D73:
    FlagGet EVENT_FLAG_0x0220, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0D8C
    VMJump L_0D98

L_0D8C:
    ObjInitNPCGPos 29, 1, 26, 0, 46

L_0D98:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0DAB
    VMJump L_0DB7

L_0DAB:
    ObjInitNPCGPos 29, 1, 8, 0, 35

L_0DB7:
    WorkCmpConst 0x8008, 3
    VMJumpIf CMP_EQ, L_0DCA
    VMJump L_0DEF

L_0DCA:
    FlagGet EVENT_FLAG_0x021f, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0DE3
    VMJump L_0DEF

L_0DE3:
    ObjInitNPCGPos 31, 1, 8, 0, 42

L_0DEF:
    Random 0x8008, 5
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0E08
    VMJump L_0E14

L_0E08:
    ObjInitNPCGPos 31, 1, 9, 0, 32

L_0E14:
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0E27
    VMJump L_0E4C

L_0E27:
    FlagGet EVENT_FLAG_0x0222, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0E40
    VMJump L_0E4C

L_0E40:
    ObjInitNPCGPos 31, 1, 22, 0, 39

L_0E4C:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0E5F
    VMJump L_0E6B

L_0E5F:
    ObjInitNPCGPos 31, 1, 8, 0, 35

L_0E6B:
    WorkCmpConst 0x8008, 3
    VMJumpIf CMP_EQ, L_0E7E
    VMJump L_0EA3

L_0E7E:
    FlagGet EVENT_FLAG_0x021f, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0E97
    VMJump L_0EA3

L_0E97:
    ObjInitNPCGPos 31, 1, 8, 0, 42

L_0EA3:
    VMHalt
    .byte 0x00

Script_11:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 12, Movement_0F40
    ActorCmdWait
    PlayerGetDir 0x8008
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0EF2
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0F02
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0F12
    WorkCmpConst 0x8008, 3
    VMJumpIf CMP_EQ, L_0F22
    VMJump L_0F32

L_0EF2:
    ActorCmdExec 12, Movement_0F48
    ActorCmdWait
    VMJump L_0F32

L_0F02:
    ActorCmdExec 12, Movement_0F50
    ActorCmdWait
    VMJump L_0F32

L_0F12:
    ActorCmdExec 12, Movement_0F58
    ActorCmdWait
    VMJump L_0F32

L_0F22:
    ActorCmdExec 12, Movement_0F60
    ActorCmdWait
    VMJump L_0F32

L_0F32:
    PVPlay 58, 0
    PVWait
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0F40:
    Move 75, 1
    MoveEnd

Movement_0F48:
    Move 48, 1
    MoveEnd

Movement_0F50:
    Move 49, 1
    MoveEnd

Movement_0F58:
    Move 51, 1
    MoveEnd

Movement_0F60:
    Move 50, 1
    MoveEnd

Script_12:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 13, Movement_0FFC
    ActorCmdWait
    PlayerGetDir 0x8008
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0FE1
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0FE1
    WorkCmpConst 0x8008, 3
    VMJumpIf CMP_EQ, L_0FA7
    VMJump L_0FF5

L_0FA7:
    PVPlay 58, 0
    ActorCmdExec 13, Movement_1004
    ActorCmdWait
    ActorCmdExec 255, Movement_1020
    ActorCmdExec 13, Movement_1028
    ActorCmdWait
    ActorCmdExec 13, Movement_1030
    ActorCmdExec 255, Movement_1048
    ActorCmdWait
    VMJump L_0FF5

L_0FE1:
    // "Grr-ow-ow! Gruff!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_GrrOwOwGruff, 0, 0
    LastKeyWait
    ActorMsgClose
    VMJump L_0FF5

L_0FF5:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_0FFC:
    Move 75, 1
    MoveEnd

Movement_1004:
    Move 19, 1
    Move 2, 1
    Move 50, 1
    Move 17, 1
    Move 18, 3
    Move 16, 1
    MoveEnd

Movement_1020:
    Move 34, 1
    MoveEnd

Movement_1028:
    Move 35, 1
    MoveEnd

Movement_1030:
    Move 17, 1
    Move 19, 2
    Move 16, 1
    Move 34, 1
    Move 50, 1
    MoveEnd

Movement_1048:
    Move 33, 1
    Move 35, 1
    MoveEnd

Script_13:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 17, Movement_1076
    ActorCmdWait
    WorkSetConst 0x8010, 100
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 17
    VMHalt

Movement_1076:
    Move 75, 1
    MoveEnd

Script_14:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 18, Movement_10A0
    ActorCmdWait
    WorkSetConst 0x8010, 227
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 18
    VMHalt

Movement_10A0:
    Move 75, 1
    MoveEnd

Script_15:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 19, Movement_10CA
    ActorCmdWait
    WorkSetConst 0x8010, 109
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 19
    VMHalt

Movement_10CA:
    Move 75, 1
    MoveEnd

Script_16:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 20, Movement_10F4
    ActorCmdWait
    WorkSetConst 0x8010, 81
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 20
    VMHalt

Movement_10F4:
    Move 75, 1
    MoveEnd

Script_17:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 21, Movement_111E
    ActorCmdWait
    WorkSetConst 0x8010, 88
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 21
    VMHalt

Movement_111E:
    Move 75, 1
    MoveEnd

Script_18:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 22, Movement_1148
    ActorCmdWait
    WorkSetConst 0x8010, 303
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 22
    VMHalt

Movement_1148:
    Move 75, 1
    MoveEnd

Script_19:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 23, Movement_1172
    ActorCmdWait
    WorkSetConst 0x8010, 509
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 23
    VMHalt

Movement_1172:
    Move 75, 1
    MoveEnd

Script_20:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 24, Movement_119C
    ActorCmdWait
    WorkSetConst 0x8010, 100
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 24
    VMHalt

Movement_119C:
    Move 75, 1
    MoveEnd

Script_21:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 25, Movement_11C6
    ActorCmdWait
    WorkSetConst 0x8010, 109
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 25
    VMHalt

Movement_11C6:
    Move 75, 1
    MoveEnd

Script_22:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 29, Movement_11F0
    ActorCmdWait
    WorkSetConst 0x8010, 239
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 29
    VMHalt

Movement_11F0:
    Move 75, 1
    MoveEnd

Script_23:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 30, Movement_121A
    ActorCmdWait
    WorkSetConst 0x8010, 240
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 30
    VMHalt

Movement_121A:
    Move 75, 1
    MoveEnd

Script_24:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 31, Movement_1244
    ActorCmdWait
    WorkSetConst 0x8010, 239
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 31
    VMHalt

Movement_1244:
    Move 75, 1
    MoveEnd

Script_25:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 32, Movement_126E
    ActorCmdWait
    WorkSetConst 0x8010, 240
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 32
    VMHalt

Movement_126E:
    Move 75, 1
    MoveEnd

Script_26:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 527, 0
    // "Koro-koro![f000]븁\u0000\nKoro-moriii!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_KoroKoroKoroMoriii, 0, 0
    LastKeyWait
    ActorMsgClose
    PVWait
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_27:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 58, 0
    // "Arr... Grawr!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_ArrGrawr, 0, 0
    LastKeyWait
    ActorMsgClose
    PVWait
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_28:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 58, 0
    // "Rawrf!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_Rawrf, 0, 0
    LastKeyWait
    ActorMsgClose
    PVWait
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_29:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 58, 0
    // "Grow-wow-wow!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_GrowWowWow, 0, 0
    LastKeyWait
    ActorMsgClose
    PVWait
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_30:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 58, 0
    // "Arf-fraf!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex2_Text_ArfFraf, 0, 0
    LastKeyWait
    ActorMsgClose
    PVWait
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_31:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 41, Movement_1338
    ActorCmdWait
    WorkSetConst 0x8010, 172
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 41
    VMHalt

Movement_1338:
    Move 75, 1
    MoveEnd

Script_32:
    ActorsPauseAll
    ActorSetEyeToEye
    ActorCmdExec 42, Movement_1362
    ActorCmdWait
    WorkSetConst 0x8010, 58
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 42
    VMHalt

Movement_1362:
    Move 75, 1
    MoveEnd
    .balign 4, 0
