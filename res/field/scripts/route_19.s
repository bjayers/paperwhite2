#include "asm/field_script.inc"
#include "text/script/route_19.h"

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
    ScriptEntriesEnd

Script_1:
    ActorsPauseAll
    EvCameraInit
    EvCameraUnbind
    EvCameraMoveTo 9688, 0, 0xed000, 0x358000, 0x1000f, 0x2ba8000, 16
    EvCameraWait
    // "Bianca: Heeey!\nThis way![f000]븁\u0000"
    // "Bianca: Come on!\nThis way![f000]븁\u0000"
    ActorMsgGendered 1024, Route19_Text_BiancaHeeeyWay, Route19_Text_BiancaComeWay, 5, 0, 0
    MsgWinCloseAll
    VMCall Script_11
    ActorCmdExec 5, Movement_01C0
    ActorCmdWait
    // "Bianca: This kinda reminds me\nof that day on Route 1.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_BiancaKindaRemindsDay, 5, 0, 0
    MsgWinCloseAll
    ActorCmdExec 5, Movement_01C8
    ActorCmdWait
    // "OK, here's how it works.[f000]븁\u0000\nThe Pokédex's pages fill up\nautomatically when you meet Pokémon![f000]븁\u0000\nAnd when you catch a Pokémon,\nmore detailed information on it[f000]븀\u0000\nis added to the Pokédex![f000]븁\u0000\nHere, I'll show you how to catch\na Pokémon! Starting...NOW![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_OkHeresHowWorks, 5, 0, 0
    MsgWinCloseAll
    PlayerGetGPos 0x8021, 0x8022
    EvCameraMoveTo 9688, 0, 0xed000, 0x3d8000, 0x1000f, 0x2b88000, 72
    ActorCmdExec 5, Movement_01D0
    ActorCmdExec 255, Movement_01D8
    ActorCmdWait
    EvCameraWait
    CallCaptureDemo
    EvCameraInit
    EvCameraUnbind
    EvCameraMoveTo 9688, 0, 0xed000, 0x3d8000, 0x1000f, 0x2b88000, 1
    EvCameraWait
    CallWildBattleEnd
    EvCameraMoveToDefault 32
    ActorWalkRoute 5, 58, 696, 1, 8, 1
    ActorCmdWait
    EvCameraWait
    EvCameraRebind
    EvCameraEnd
    // "Bianca: What a relief!\nI caught a Pokémon![f000]븁\u0000\nOh! Um...\nRight. I'll go over the important stuff.[f000]븁\u0000\nFirst, go find a healthy\nPokémon to catch![f000]븀\u0000\nYou need to remember this next bit![f000]븁\u0000\nIt's best to lower the Pokémon's HP\nbefore you try to catch it.[f000]븁\u0000\nUse your Pokémon's moves to lower the HP\nof the Pokémon you want to catch.[f000]븀\u0000\nMaking it fall asleep or paralyzing it[f000]븀\u0000\nwill make it even easier to catch![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_BiancaWhatReliefCaught, 5, 0, 0
    MsgWinCloseAll
    // "You're going to go deliver\nthe Town Map to your friend, right?[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_YoureGoingGoDeliver, 5, 0, 0
    MsgWinCloseAll
    ActorCmdExec 5, Movement_01E4
    ActorCmdWait
    // "Continue straight this way\nto get to Floccesy Town![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_ContinueStraightWayGet, 5, 0, 0
    MsgWinCloseAll
    ActorCmdExec 5, Movement_01EC
    ActorCmdWait
    // "Bye now!\nMeet lots of Pokémon[f000]븀\u0000\nand catch a lot of them, OK?[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_ByeNowMeetLots, 5, 0, 0
    MsgWinCloseAll
    VMCall Script_12
    WorkSetConst EVENT_WORK_0x40a3, 1
    FlagSet EVENT_FLAG_0x03db
    FlagReset EVENT_FLAG_0x02e3
    FlagSet EVENT_FLAG_0x02e8
    FlagSet EVENT_FLAG_0x02e7
    FlagReset EVENT_FLAG_0x02e4
    FlagReset EVENT_FLAG_0x0323
    HollowRivalSetValue 4, 0
    WorkSetConst EVENT_WORK_0x40a1, 8
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_01C0:
    Move 35, 1
    MoveEnd

Movement_01C8:
    Move 33, 1
    MoveEnd

Movement_01D0:
    Move 15, 8
    MoveEnd

Movement_01D8:
    Move 12, 2
    Move 15, 3
    MoveEnd

Movement_01E4:
    Move 35, 1
    MoveEnd

Movement_01EC:
    Move 34, 1
    MoveEnd

Script_2:
    ActorsPauseAll
    // "???: You there, Trainer![f000]븁\u0000"
    InfoMsg Route19_Text_ThereTrainer, 1
    MsgWinCloseAll
    EvCameraInit
    EvCameraUnbind
    EvCameraMoveTo 9688, 0, 0xed000, 0x5d8000, 0x6005f, 0x2b38000, 20
    ActorCmdExec 255, Movement_0332
    ActorCmdWait
    EvCameraWait
    BGMPlay SEQ_BGM_E_CHAMPION
    // "My name is Alder![f000]븁\u0000\nI'm a Trainer with a keen interest in the\nworld. One of my goals is to tell people[f000]븀\u0000\nabout how wonderful it is to walk toward[f000]븀\u0000\nthe future together with Pokémon.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_NameAlderImTrainer, 1, 0, 0
    MsgWinCloseAll
    EvCameraMoveToDefault 30
    ActorJumpToGPos 1, 93, 1, 693
    EvCameraWait
    EvCameraRebind
    EvCameraEnd
    VMSleep 14
    PlayerGetGPos 0x8021, 0x8022
    WorkAdd 0x8021, 2
    VMStackPush 0x8022
    VMStackPushConst 693
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_027C
    ActorWalkRoute 1, 0x8021, 0x8022, 1, 8, 1

L_027C:
    ActorCmdExec 255, Movement_033A
    ActorCmdWait
    ActorCmdExec 1, Movement_0342
    ActorCmdWait
    WordSetPlayerName 0
    // "And you are?[f000]븁\u0000\n...\n...[f000]븁\u0000\nHmph! So you're [f000]Ā\u0001\u0000\nfrom Aspertia City![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_HmphYoureFromAspertia, 1, 0, 0
    MsgWinCloseAll
    PlayerGetGPos 0x8021, 0x8022
    WorkCmpConst 0x8022, 693
    VMJumpIf CMP_EQ, L_02BA
    VMJump L_02C8

L_02BA:
    ActorCmdExec 1, Movement_034A
    VMJump L_02F1

L_02C8:
    WorkCmpConst 0x8022, 697
    VMJumpIf CMP_EQ, L_02DB
    VMJump L_02E9

L_02DB:
    ActorCmdExec 1, Movement_037E
    VMJump L_02F1

L_02E9:
    ActorCmdExec 1, Movement_03B2

L_02F1:
    ActorCmdWait
    WorkSetConst 0x8023, 0
    PokePartyGetMemberByType 0x8023, 2
    WordSetPartyPokeSpecies 1, 0x8023
    // "Your [f000]ā\u0001\u0001 is\na fine-looking Pokémon![f000]븁\u0000\nBut, you're not exactly\na seasoned Trainer yet...[f000]븁\u0000\nIndeed! I'll train you a little!\nFollow me![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_FineLookingPokemonBut, 1, 0, 0
    MsgWinCloseAll
    ActorCmdExec 1, Movement_03EE
    ActorCmdWait
    BGMChangeMap
    ActorDelete 1
    WorkSetConst EVENT_WORK_0x40a3, 2
    FlagSet EVENT_FLAG_0x02e2
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0332:
    Move 32, 1
    MoveEnd

Movement_033A:
    Move 3, 1
    MoveEnd

Movement_0342:
    Move 34, 1
    MoveEnd

Movement_034A:
    Move 14, 1
    Move 63, 1
    Move 13, 1
    Move 14, 1
    Move 32, 1
    Move 14, 1
    Move 12, 1
    Move 35, 1
    Move 13, 1
    Move 15, 3
    Move 12, 1
    Move 34, 1
    MoveEnd

Movement_037E:
    Move 14, 1
    Move 63, 1
    Move 12, 1
    Move 14, 1
    Move 33, 1
    Move 14, 1
    Move 13, 1
    Move 35, 1
    Move 12, 1
    Move 15, 3
    Move 13, 1
    Move 34, 1
    MoveEnd

Movement_03B2:
    Move 14, 1
    Move 63, 1
    Move 12, 1
    Move 14, 1
    Move 33, 1
    Move 14, 1
    Move 13, 1
    Move 35, 1
    Move 13, 1
    Move 15, 1
    Move 32, 1
    Move 15, 2
    Move 12, 1
    Move 34, 1
    MoveEnd

Movement_03EE:
    Move 15, 7
    MoveEnd

Script_3:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMStackPushFlag EVENT_FLAG_0x0010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_04C5
    // "Hey, you know about ledge jumping?"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_HeyKnowAboutLedge, 0, 4, 0
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_04AF
    FlagSet EVENT_FLAG_0x0010
    // "That so...\nWell then, watch me carefully![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_WellThenWatchCarefully, 0, 4, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_04DC
    ActorCmdWait
    // "From the top of the ledge![f000]븁\u0000\nBoing![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_FromTopLedgeBoing, 0, 4, 0
    VMSleep 4
    MsgWinCloseAll
    ActorCmdExec 0, Movement_04E4
    VMSleep 4
    PlayerGetDir 0x8020
    VMStackPush 0x8020
    VMStackPushConst 2
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_048D
    ActorCmdExec 255, Movement_04F4

L_048D:
    ActorCmdWait
    ActorCmdExec 0, Movement_04FC
    ActorCmdWait
    // "It's really cool how you can take\nshortcuts by jumping off these, right?"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_ItsReallyCoolHow, 0, 3, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_04BF

L_04AF:
    // "Oh...[f000]븁\u0000\nI guess you would know you can\njump off these little ledges."
    ActorMsg MSGFILE_SCRIPT, Route19_Text_OhGuessWouldKnow, 0, 0, 0
    LastKeyWait
    MsgWinCloseAll

L_04BF:
    VMJump L_04D5

L_04C5:
    // "It's really cool how you can take\nshortcuts by jumping off these, right?"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_ItsReallyCoolHow, 0, 0, 0
    LastKeyWait
    MsgWinCloseAll

L_04D5:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_04DC:
    Move 34, 1
    MoveEnd

Movement_04E4:
    Move 58, 1
    Move 10, 1
    Move 2, 1
    MoveEnd

Movement_04F4:
    Move 34, 1
    MoveEnd

Movement_04FC:
    Move 35, 1
    MoveEnd

Script_4:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Route 19"
    MsgPlaceSign Route19_Text_Route19, 3
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_5:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Route 19"
    MsgPlaceSign Route19_Text_Route19_2, 3
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_6:
    ActorsPauseAll
    ActorCmdExec 19, Movement_0570
    ActorCmdExec 40, Movement_0578
    ActorCmdWait
    ActorDelete 19
    ActorDelete 40
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Trainer Tips![f000]븁\u0000\n\nMake an effort to talk to all the\npeople you meet during your journey![f000]븁\u0000\nChances are they will have something\nuseful to tell you."
    MsgPlaceSign Route19_Text_TrainerTipsMakeEffort, 0
    MsgPlaceSignClose
    FlagSet EVENT_FLAG_0x0a75
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0570:
    Move 16, 4
    MoveEnd

Movement_0578:
    Move 16, 4
    MoveEnd

Script_7:
    ActorsPauseAll
    FlagReset EVENT_FLAG_0x02e2
    ActorAdd 1
    WordSetPlayerName 0
    // "[f000]Ā\u0001\u0000![f000]븁\u0000"
    InfoMsg Route19_Text_Empty_8, 2
    MsgWinCloseAll
    EvCameraInit
    EvCameraUnbind
    EvCameraMoveTo 9688, 0, 0xed000, 0x5d8000, 0x6005f, 0x2b38000, 40
    ActorCmdExec 255, Movement_06BC
    ActorCmdWait
    EvCameraWait
    BGMPlay SEQ_BGM_E_CHAMPION
    VMSleep 40
    EvCameraMoveToDefault 64
    ActorJumpToGPos 1, 93, 1, 693
    EvCameraWait
    EvCameraRebind
    EvCameraEnd
    VMSleep 14
    PlayerGetGPos 0x8021, 0x8022
    WorkAdd 0x8021, 2
    ActorWalkRoute 1, 0x8021, 0x8022, 1, 8, 1
    ActorCmdExec 255, Movement_06C4
    ActorCmdWait
    // "Excuse me! I forgot to tell\nyou something important![f000]븁\u0000\nFirst, take these![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_ExcuseForgotTellSomething, 1, 0, 0
    MsgWinCloseAll
    ActorCmdExec 1, Movement_06CC
    ActorCmdWait
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 155
    WorkSet 0x8001, 5
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    ActorCmdExec 1, Movement_06D4
    ActorCmdWait
    WordSetPlayerName 0
    // "Those are Oran Berries![f000]븁\u0000\nIf you give one to your Pokémon,\nits HP will be restored.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_ThoseOranBerriesIf, 1, 0, 0
    MsgWinCloseAll
    ActorCmdExec 1, Movement_06E0
    ActorCmdWait
    // "What's more! You can give your Pokémon\na Berry to hold![f000]븁\u0000\nLike this Oran Berry, for instance.\nWhen a Pokémon holds this Berry, it can[f000]븀\u0000\neat the Berry if it gets hurt in the heat[f000]븀\u0000\nof battle and regain some of its lost HP![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_WhatsMoreCanGive, 1, 0, 0
    MsgWinCloseAll
    ActorCmdExec 1, Movement_06E8
    ActorCmdWait
    // "Well... I just told you\nto challenge the Gym Leader.[f000]븁\u0000\nAspertia's Gym Leader\nis a very strong Pokémon Trainer![f000]븁\u0000\nBut you have nothing to worry about![f000]븁\u0000\nIf you think hard about what the\nPokémon at your side can do,[f000]븀\u0000\nand what you should do as a Trainer,[f000]븀\u0000\nvictory will be yours![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_WellJustToldChallenge, 1, 0, 0
    MsgWinCloseAll
    ActorCmdExec 1, Movement_06F0
    ActorCmdWait
    // "And then you should take on\nstronger and stronger Trainers...[f000]븀\u0000\nActually, take on the Gym Leaders[f000]븀\u0000\nof each city![f000]븁\u0000\nWorking together with your Pokémon\nis what makes you grow as a Trainer.[f000]븁\u0000\nAs you and your Pokémon grow stronger,\nyour world will get broader![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Route19_Text_ThenShouldTakeStronger, 1, 0, 0
    MsgWinCloseAll
    ActorCmdExec 1, Movement_06F8
    ActorCmdWait
    BGMChangeMap
    ActorDelete 1
    WorkSetConst EVENT_WORK_0x40a3, 4
    FlagSet EVENT_FLAG_0x02e2
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_06BC:
    Move 32, 1
    MoveEnd

Movement_06C4:
    Move 35, 1
    MoveEnd

Movement_06CC:
    Move 14, 1
    MoveEnd

Movement_06D4:
    Move 15, 1
    Move 34, 1
    MoveEnd

Movement_06E0:
    Move 33, 1
    MoveEnd

Movement_06E8:
    Move 100, 1
    MoveEnd

Movement_06F0:
    Move 34, 1
    MoveEnd

Movement_06F8:
    Move 15, 7
    MoveEnd

Script_8:
    ActorsPauseAll
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_9:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Know what? I'm searching for\nPokémon in the tall grass![f000]븁\u0000\nThat's right! If you don't want\nto meet Pokémon, avoid the tall grass!"
    ParentActorMsg MSGFILE_SCRIPT, Route19_Text_KnowWhatImSearching, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_10:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "You can use Surf?\nNice! We can be Surf buddies!"
    ParentActorMsg MSGFILE_SCRIPT, Route19_Text_CanUseSurfNice, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_11:
    PlayerGetGPos 0x8021, 0x8022
    VMStackPush 0x8021
    VMStackPushConst 53
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_076F
    ActorWalkRoute 255, 53, 698, 1, 8, 0
    ActorCmdWait
    VMJump L_0779

L_076F:
    ActorCmdExec 255, Movement_077E
    ActorCmdWait

L_0779:
    ActorCmdWait
    VMReturn
    .byte 0x00

Movement_077E:
    Move 12, 1
    MoveEnd

Script_12:
    ActorCmdExec 5, Movement_07A8
    VMSleep 16
    ActorCmdExec 255, Movement_07B8
    ActorCmdWait
    SEPlay SEQ_SE_KAIDAN
    ActorDelete 5
    SEWait
    VMReturn

Movement_07A8:
    Move 13, 1
    Move 14, 5
    Move 13, 6
    MoveEnd

Movement_07B8:
    Move 33, 1
    MoveEnd

Script_13:
    ActorsPauseAll
    PlayerGetDir 0x800a
    ActorSetEyeToEye
    PVPlay 504, 0
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_080E
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_080E
    Random 0x8008, 99
    WorkCmpConst 0x8008, 90
    VMJumpIf CMP_GE, L_080E
    WorkCmpConst 0x8008, 10
    VMJumpIf CMP_GE, L_081A
    VMJump L_0833

L_080E:
    VMCall Script_17
    VMJump L_08A2

L_081A:
    Random 0x8009, 2
    WorkCmpConst 0x8009, 1
    VMJumpIf CMP_EQ, L_084C
    VMJump L_085C

L_0833:
    Random 0x8009, 2
    WorkCmpConst 0x8009, 1
    VMJumpIf CMP_EQ, L_086C
    VMJump L_0882

L_084C:
    ActorCmdExec 8, Movement_08A8
    ActorCmdWait
    VMJump L_0898

L_085C:
    ActorCmdExec 8, Movement_08B4
    ActorCmdWait
    VMJump L_0898

L_086C:
    ActorCmdExec 8, Movement_08C0
    ActorCmdWait
    VMCall Script_15
    VMJump L_0898

L_0882:
    ActorCmdExec 8, Movement_08CC
    ActorCmdWait
    VMCall Script_15
    VMJump L_0898

L_0898:
    ActorDelete 8
    VMJump L_08A2

L_08A2:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_08A8:
    Move 75, 1
    Move 16, 2
    MoveEnd

Movement_08B4:
    Move 75, 1
    Move 19, 3
    MoveEnd

Movement_08C0:
    Move 75, 1
    Move 16, 2
    MoveEnd

Movement_08CC:
    Move 75, 1
    Move 19, 3
    MoveEnd

Script_14:
    VMHalt

Script_15:
    Random 0x8008, 64
    WorkGet 0x8000, 0x8008
    WorkAdd 0x8000, 149
    ItemCheckSpace 0x8000, 1, 0x800c
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_0911
    // "It dropped something...[f000]븁\u0000"
    SystemMsg Route19_Text_DroppedSomething, 0
    WorkSetConst 0x8001, 1
    RTCallGlobal 2805

L_0911:
    VMReturn
    .byte 0x00

Script_16:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 23, 0
    ActorCmdExec 11, Movement_09B2
    ActorCmdWait
    PokePartyGetParam 0x8009, 0, 158
    WorkDiv 0x8009, 5
    WorkMul 0x8009, 4
    CallWildBattle 23, 0x8009, 1
    WildBattleGetResult 0x8008
    PokePartyGetCount 0x8009, 2
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0961
    VMJump L_096D

L_0961:
    CallWildBattleEnd
    ActorDelete 11
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_096D:
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_0980
    VMJump L_0986

L_0980:
    CallWildLose
    ActorsUnpauseAll
    VMHalt

L_0986:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0999
    VMJump L_09A5

L_0999:
    CallWildBattleEnd
    ActorDelete 11
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_09A5:
    CallWildBattleEnd
    ActorDelete 11
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Movement_09B2:
    Move 75, 1
    MoveEnd

Script_17:
    ActorCmdExec 8, Movement_0A4E
    ActorCmdWait
    PokePartyGetParam 0x8009, 0, 158
    WorkDiv 0x8009, 5
    WorkMul 0x8009, 4
    CallWildBattle 504, 0x8009, 1
    WildBattleGetResult 0x8008
    PokePartyGetCount 0x8009, 2
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_09FD
    VMJump L_0A09

L_09FD:
    CallWildBattleEnd
    ActorDelete 8
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_0A09:
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_0A1C
    VMJump L_0A22

L_0A1C:
    CallWildLose
    ActorsUnpauseAll
    VMHalt

L_0A22:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0A35
    VMJump L_0A41

L_0A35:
    CallWildBattleEnd
    ActorDelete 8
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_0A41:
    CallWildBattleEnd
    ActorDelete 8
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Movement_0A4E:
    Move 75, 1
    MoveEnd

Script_18:
    ActorsPauseAll
    PlayerGetDir 0x800a
    ActorSetEyeToEye
    PVPlay 509, 0
    WorkCmpConst 0x800a, 0
    VMJumpIf CMP_EQ, L_0A77
    VMJump L_0A91

L_0A77:
    ActorCmdExec 19, Movement_0AF2
    ActorCmdExec 12, Movement_0AFA
    ActorCmdWait
    ActorDelete 19
    ActorDelete 12

L_0A91:
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_0AA4
    VMJump L_0ABE

L_0AA4:
    ActorCmdExec 19, Movement_0B0A
    ActorCmdExec 12, Movement_0B12
    ActorCmdWait
    ActorDelete 19
    ActorDelete 12

L_0ABE:
    WorkCmpConst 0x800a, 3
    VMJumpIf CMP_EQ, L_0AD1
    VMJump L_0AEB

L_0AD1:
    ActorCmdExec 19, Movement_0B22
    ActorCmdExec 12, Movement_0B2A
    ActorCmdWait
    ActorDelete 19
    ActorDelete 12

L_0AEB:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Movement_0AF2:
    Move 16, 4
    MoveEnd

Movement_0AFA:
    Move 75, 1
    Move 19, 2
    Move 16, 5
    MoveEnd

Movement_0B0A:
    Move 16, 4
    MoveEnd

Movement_0B12:
    Move 75, 1
    Move 17, 1
    Move 18, 8
    MoveEnd

Movement_0B22:
    Move 16, 4
    MoveEnd

Movement_0B2A:
    Move 75, 1
    Move 19, 2
    Move 16, 5
    MoveEnd

Script_19:
    ActorsPauseAll
    PlayerGetDir 0x800a
    ActorSetEyeToEye
    PVPlay 506, 0
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_0B5B
    VMJump L_0BAB

L_0B5B:
    Random 0x8008, 10
    WorkCmpConst 0x8008, 8
    VMJumpIf CMP_GE, L_0B74
    VMJump L_0B7E

L_0B74:
    ActorCmdExec 28, Movement_0CC2
    ActorCmdWait

L_0B7E:
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_LE, L_0B91
    VMJump L_0BA1

L_0B91:
    ActorCmdExec 28, Movement_0CE2
    ActorCmdWait
    VMJump L_0BAB

L_0BA1:
    ActorCmdExec 28, Movement_0D02
    ActorCmdWait

L_0BAB:
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_0BBE
    VMJump L_0BFE

L_0BBE:
    Random 0x8008, 10
    WorkCmpConst 0x8008, 6
    VMJumpIf CMP_GE, L_0BD7
    VMJump L_0BE1

L_0BD7:
    ActorCmdExec 28, Movement_0D0A
    ActorCmdWait

L_0BE1:
    WorkCmpConst 0x8008, 6
    VMJumpIf CMP_LT, L_0BF4
    VMJump L_0BFE

L_0BF4:
    ActorCmdExec 28, Movement_0D1E
    ActorCmdWait

L_0BFE:
    WorkCmpConst 0x800a, 0
    VMJumpIf CMP_EQ, L_0C11
    VMJump L_0C1B

L_0C11:
    ActorCmdExec 28, Movement_0D26
    ActorCmdWait

L_0C1B:
    WorkCmpConst 0x800a, 3
    VMJumpIf CMP_EQ, L_0C2E
    VMJump L_0C38

L_0C2E:
    ActorCmdExec 28, Movement_0D2E
    ActorCmdWait

L_0C38:
    PokePartyGetParam 0x8009, 0, 158
    WorkDiv 0x8009, 5
    WorkMul 0x8009, 4
    CallWildBattle 506, 0x8009, 1
    WildBattleGetResult 0x8008
    PokePartyGetCount 0x8009, 2
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0C71
    VMJump L_0C7D

L_0C71:
    CallWildBattleEnd
    ActorDelete 28
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_0C7D:
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_0C90
    VMJump L_0C96

L_0C90:
    CallWildLose
    ActorsUnpauseAll
    VMHalt

L_0C96:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0CA9
    VMJump L_0CB5

L_0CA9:
    CallWildBattleEnd
    ActorDelete 28
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_0CB5:
    CallWildBattleEnd
    ActorDelete 28
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Movement_0CC2:
    Move 75, 1
    Move 21, 1
    Move 23, 2
    Move 20, 2
    Move 22, 2
    Move 21, 1
    Move 43, 1
    MoveEnd

Movement_0CE2:
    Move 75, 1
    Move 20, 1
    Move 23, 2
    Move 21, 2
    Move 22, 2
    Move 20, 1
    Move 43, 1
    MoveEnd

Movement_0D02:
    Move 75, 1
    MoveEnd

Movement_0D0A:
    Move 75, 1
    Move 21, 3
    Move 32, 1
    Move 20, 3
    MoveEnd

Movement_0D1E:
    Move 75, 1
    MoveEnd

Movement_0D26:
    Move 75, 1
    MoveEnd

Movement_0D2E:
    Move 75, 1
    MoveEnd

Script_20:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 509, 0
    ActorCmdExec 29, Movement_0DF4
    ActorCmdExec 33, Movement_0DFC
    ActorCmdExec 34, Movement_0E04
    ActorCmdWait
    Random 0x8008, 99
    WorkCmpConst 0x8008, 95
    VMJumpIf CMP_GE, L_0D73
    VMJump L_0DD7

L_0D73:
    FlagGet EVENT_FLAG_0x0226, 0x800c
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_0D8C
    VMJump L_0DD7

L_0D8C:
    Random 0x8008, 7
    WorkGet 0x8000, 0x8008
    WorkAdd 0x8000, 565
    ItemCheckSpace 0x8000, 1, 0x800c
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_0DE9
    // "Loin-loooin![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, Route19_Text_LoinLoooin, 0, 0
    ActorMsgClose
    // "It drops a feather at your feet...[f000]븁\u0000"
    SystemMsg Route19_Text_DropsFeatherFeet, 0
    InfoMsgClose
    WorkSetConst 0x8001, 1
    RTCallGlobal 2805
    VMJump L_0DE9

L_0DD7:
    // "Purrrr-purr?  Purr-loin![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, Route19_Text_PurrrrPurrPurrLoin, 0, 0
    ActorMsgClose
    VMJump L_0DE9

L_0DE9:
    FlagSet EVENT_FLAG_0x0226
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_0DF4:
    Move 75, 1
    MoveEnd

Movement_0DFC:
    Move 75, 1
    MoveEnd

Movement_0E04:
    Move 75, 1
    MoveEnd

Script_21:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 23, 0
    ActorCmdExec 36, Movement_0EAA
    ActorCmdWait
    PokePartyGetParam 0x8009, 0, 158
    WorkDiv 0x8009, 5
    WorkMul 0x8009, 4
    CallWildBattle 23, 0x8009, 1
    WildBattleGetResult 0x8008
    PokePartyGetCount 0x8009, 2
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0E59
    VMJump L_0E65

L_0E59:
    CallWildBattleEnd
    ActorDelete 36
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_0E65:
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_0E78
    VMJump L_0E7E

L_0E78:
    CallWildLose
    ActorsUnpauseAll
    VMHalt

L_0E7E:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0E91
    VMJump L_0E9D

L_0E91:
    CallWildBattleEnd
    ActorDelete 36
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_0E9D:
    CallWildBattleEnd
    ActorDelete 36
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Movement_0EAA:
    Move 75, 1
    MoveEnd

Script_22:
    ActorsPauseAll
    PlayerGetDir 0x800a
    ActorSetEyeToEye
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_0ECD
    VMJump L_0EDF

L_0ECD:
    VMCall Script_25
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    VMJump L_0EED

L_0EDF:
    ActorCmdExec 39, Movement_0EF4
    ActorCmdWait
    ActorDelete 39

L_0EED:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_0EF4:
    Move 75, 1
    Move 16, 2
    MoveEnd

Script_23:
    ActorsPauseAll
    PlayerGetDir 0x800a
    ActorSetEyeToEye
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_0F1B
    VMJump L_0F2D

L_0F1B:
    VMCall Script_26
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    VMJump L_0F3B

L_0F2D:
    ActorCmdExec 53, Movement_0F42
    ActorCmdWait
    ActorDelete 53

L_0F3B:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Movement_0F42:
    Move 75, 1
    Move 19, 2
    MoveEnd

Script_24:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 16, 0
    ActorCmdExec 52, Movement_0FEC
    ActorCmdWait
    PokePartyGetParam 0x8009, 0, 158
    WorkDiv 0x8009, 5
    WorkMul 0x8009, 4
    CallWildBattle 16, 0x8009, 1
    WildBattleGetResult 0x8008
    PokePartyGetCount 0x8009, 2
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0F9B
    VMJump L_0FA7

L_0F9B:
    CallWildBattleEnd
    ActorDelete 52
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_0FA7:
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_0FBA
    VMJump L_0FC0

L_0FBA:
    CallWildLose
    ActorsUnpauseAll
    VMHalt

L_0FC0:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0FD3
    VMJump L_0FDF

L_0FD3:
    CallWildBattleEnd
    ActorDelete 52
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_0FDF:
    CallWildBattleEnd
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 52
    VMHalt
    .balign 4, 0

Movement_0FEC:
    Move 75, 1
    MoveEnd

Script_25:
    PVPlay 273, 0
    ActorCmdExec 39, Movement_108A
    ActorCmdWait
    PokePartyGetParam 0x8009, 0, 158
    WorkDiv 0x8009, 5
    WorkMul 0x8009, 4
    CallWildBattle 273, 0x8009, 1
    WildBattleGetResult 0x8008
    PokePartyGetCount 0x8009, 2
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_103D
    VMJump L_1049

L_103D:
    CallWildBattleEnd
    ActorDelete 39
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_1049:
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_105C
    VMJump L_1062

L_105C:
    CallWildLose
    ActorsUnpauseAll
    VMHalt

L_1062:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_1075
    VMJump L_1081

L_1075:
    CallWildBattleEnd
    ActorDelete 39
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_1081:
    CallWildBattleEnd
    ActorDelete 39
    VMReturn
    .byte 0x00

Movement_108A:
    Move 75, 1
    MoveEnd

Script_26:
    PVPlay 273, 0
    ActorCmdExec 53, Movement_1128
    ActorCmdWait
    PokePartyGetParam 0x8009, 0, 158
    WorkDiv 0x8009, 5
    WorkMul 0x8009, 4
    CallWildBattle 273, 0x8009, 1
    WildBattleGetResult 0x8008
    PokePartyGetCount 0x8009, 2
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_10DB
    VMJump L_10E7

L_10DB:
    CallWildBattleEnd
    ActorDelete 53
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_10E7:
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_10FA
    VMJump L_1100

L_10FA:
    CallWildLose
    ActorsUnpauseAll
    VMHalt

L_1100:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_1113
    VMJump L_111F

L_1113:
    CallWildBattleEnd
    ActorDelete 53
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_111F:
    CallWildBattleEnd
    ActorDelete 53
    VMReturn
    .balign 4, 0

Movement_1128:
    Move 75, 1
    MoveEnd
