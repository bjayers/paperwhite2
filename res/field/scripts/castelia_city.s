#include "asm/field_script.inc"
#include "text/script/castelia_city.h"

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
    ScriptEntriesEnd

Script_1:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Castelia City\nA City of Grandeur"
    MsgPlaceSign CasteliaCity_Text_CasteliaCityCityGrandeur, 1
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_2:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Castelia City\nA City of Grandeur"
    MsgPlaceSign CasteliaCity_Text_CasteliaCityCityGrandeur, 2
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_3:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Ahead: Castelia Street\nOcean Side: Cruise Dock"
    MsgPlaceSign CasteliaCity_Text_AheadCasteliaStreetOcean, 2
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_4:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Ahead: Mode Street\nOcean Side: Prime Pier"
    MsgPlaceSign CasteliaCity_Text_AheadModeStreetOcean, 2
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_5:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Ahead: Narrow Street\nOcean Side: Unity Pier"
    MsgPlaceSign CasteliaCity_Text_AheadNarrowStreetOcean, 2
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_6:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Ahead: Pokémon Gym\nOcean Side: Liberty Pier"
    MsgPlaceSign CasteliaCity_Text_AheadPokemonGymOcean, 2
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_7:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Passerby Analytics HQ\n...People pass by as they walk along."
    MsgPlaceSign CasteliaCity_Text_PasserbyAnalyticsHqPeople, 2
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_8:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Battle Company\nTalented Trainers Welcome!"
    MsgPlaceSign CasteliaCity_Text_BattleCompanyTalentedTrainers, 2
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_9:
    ActorsPauseAll
    // "Iris: This way! This way!\nC'mon! Have a look![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_IrisWayWayCmon, 12, 0, 0
    MsgWinCloseAll
    ActorCmdExec 12, Movement_0170
    ActorCmdWait
    SEPlay SEQ_SE_KAIDAN
    ActorDelete 12
    SEWait
    WorkSetConst EVENT_WORK_0x40b1, 3
    FlagSet EVENT_FLAG_0x0406
    FlagReset EVENT_FLAG_0x02f1
    WorkSetConst EVENT_WORK_0x40b2, 1
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0170:
    Move 13, 8
    MoveEnd

Script_10:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "To live surrounded by people,\ndo you have to grow to like everyone,[f000]븀\u0000\nor do you only have to like yourself?"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_LiveSurroundedByPeople, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_11:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "I wonder what Castelia\nwas like before it got this big."
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_WonderWhatCasteliaLike, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_12:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "It's wonderful how the Pokémon\nand women here are so full of life!"
    ActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_ItsWonderfulHowPokemon, 6, 1, 0
    LastKeyWait
    MsgWinCloseAll
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_13:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "The Battle Company needs\npeople for focus testing.[f000]븁\u0000\nTrainers who are confident in\ntheir abilities should come try it!"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_BattleCompanyNeedsPeople, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_14:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Seasons and trends always pass..."
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_SeasonsTrendsAlwaysPass, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_15:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "...When I fall asleep in my bed.[f000]븁\u0000\n...When my Pokémon's attack\nhits critically![f000]븁\u0000\nMy life is full of things\nthat bring me joy!"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_WhenFallAsleepBed, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_16:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "I'm a battling Clerk ⑭!\nIf I don't give up, I'll win someday!"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_ImBattlingClerkIf, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_17:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Everyone's faces blend together!\nIs that because I'm tired?"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_EveryonesFacesBlendTogether, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_18:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "When you're tired, rest!\nDon't force yourself to be energetic!"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_WhenYoureTiredRest, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_19:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Should I change my Pokémon's moves\nor its held items?"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_ShouldChangePokemonsMoves, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_20:
    ActorsPauseAll
    WorkSetConst 0x8024, 0
    WorkSetConst 0x8025, 0
    WorkSetConst 0x8026, 0
    ActorCmdExec 11, Movement_07A6
    ActorCmdWait
    PlayerGetRailPos 0x8024, 0x8025, 0x8026
    VMStackPush 0x8024
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 4
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_02F9
    ActorCmdExec 11, Movement_07AE
    VMJump L_04FB

L_02F9:
    VMStackPush 0x8024
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_033A
    ActorCmdExec 11, Movement_07BA
    VMJump L_04FB

L_033A:
    VMStackPush 0x8024
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_037B
    ActorCmdExec 11, Movement_07C2
    VMJump L_04FB

L_037B:
    VMStackPush 0x8024
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_03BC
    ActorCmdExec 11, Movement_07CE
    VMJump L_04FB

L_03BC:
    VMStackPush 0x8024
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_03FD
    ActorCmdExec 11, Movement_07DA
    VMJump L_04FB

L_03FD:
    VMStackPush 0x8024
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 28
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_043E
    ActorCmdExec 11, Movement_07E6
    VMJump L_04FB

L_043E:
    VMStackPush 0x8024
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 27
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_047F
    ActorCmdExec 11, Movement_07F2
    VMJump L_04FB

L_047F:
    VMStackPush 0x8024
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 26
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_04C0
    ActorCmdExec 11, Movement_07FE
    VMJump L_04FB

L_04C0:
    VMStackPush 0x8024
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 25
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_04FB
    ActorCmdExec 11, Movement_080A

L_04FB:
    ActorCmdWait
    // "Welcome to Castelia City!!\nIt's the Castelia Harlequin Hunt![f000]븁\u0000\nI bet this is your first visit to\nCastelia City.[f000]븁\u0000\nThat's great!\nHere, have this Bicycle![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_WelcomeCasteliaCityIts, 11, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 450
    WorkSet 0x8001, 1
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    // "The Castelia Harlequin Hunt's\nrules are simple![f000]븁\u0000\nAll you have to do is visit specific\nplaces and talk to the Harlequin there![f000]븀\u0000\nWhether you participate is up to you![f000]븀\u0000\nThe places to look are...[f000]븁\u0000\nThe Medal Office![f000]븁\u0000\nPasserby Analytics HQ![f000]븁\u0000\nAnd the Battle Company![f000]븁\u0000\nRide the Bicycle I gave\nyou, and go, go, go!"
    ActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_CasteliaHarlequinHuntsRules, 11, 0, 0
    MsgWaitAdvance
    MsgWinCloseAll
    VMStackPush 0x8024
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 4
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_057C
    ActorCmdExec 11, Movement_0816
    VMJump L_077E

L_057C:
    VMStackPush 0x8024
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_05BD
    ActorCmdExec 11, Movement_0826
    VMJump L_077E

L_05BD:
    VMStackPush 0x8024
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_05FE
    ActorCmdExec 11, Movement_0832
    VMJump L_077E

L_05FE:
    VMStackPush 0x8024
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_063F
    ActorCmdExec 11, Movement_0842
    VMJump L_077E

L_063F:
    VMStackPush 0x8024
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_0680
    ActorCmdExec 11, Movement_0852
    VMJump L_077E

L_0680:
    VMStackPush 0x8024
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 28
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_06C1
    ActorCmdExec 11, Movement_0862
    VMJump L_077E

L_06C1:
    VMStackPush 0x8024
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 27
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_0702
    ActorCmdExec 11, Movement_0872
    VMJump L_077E

L_0702:
    VMStackPush 0x8024
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 26
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_0743
    ActorCmdExec 11, Movement_0882
    VMJump L_077E

L_0743:
    VMStackPush 0x8024
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMStackPush 0x8025
    VMStackPushConst 25
    VMStackCmp CMP_EQ
    VMStackPush 0x8026
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_077E
    ActorCmdExec 11, Movement_0892

L_077E:
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x40e2, 2
    MedalDiscover 19
    FlagSet EVENT_FLAG_ARRIVED_CASTELIA_CITY
    WorkSetConst 0x8026, 0
    WorkSetConst 0x8025, 0
    WorkSetConst 0x8024, 0
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_07A6:
    Move 75, 1
    MoveEnd

Movement_07AE:
    Move 14, 1
    Move 13, 5
    MoveEnd

Movement_07BA:
    Move 13, 5
    MoveEnd

Movement_07C2:
    Move 15, 1
    Move 13, 5
    MoveEnd

Movement_07CE:
    Move 15, 2
    Move 13, 5
    MoveEnd

Movement_07DA:
    Move 15, 3
    Move 13, 5
    MoveEnd

Movement_07E6:
    Move 15, 4
    Move 13, 5
    MoveEnd

Movement_07F2:
    Move 15, 5
    Move 13, 5
    MoveEnd

Movement_07FE:
    Move 15, 6
    Move 13, 5
    MoveEnd

Movement_080A:
    Move 15, 7
    Move 13, 5
    MoveEnd

Movement_0816:
    Move 12, 5
    Move 15, 1
    Move 33, 1
    MoveEnd

Movement_0826:
    Move 12, 5
    Move 33, 1
    MoveEnd

Movement_0832:
    Move 12, 5
    Move 14, 1
    Move 33, 1
    MoveEnd

Movement_0842:
    Move 12, 5
    Move 14, 2
    Move 33, 1
    MoveEnd

Movement_0852:
    Move 12, 5
    Move 14, 3
    Move 33, 1
    MoveEnd

Movement_0862:
    Move 12, 5
    Move 14, 4
    Move 33, 1
    MoveEnd

Movement_0872:
    Move 12, 5
    Move 14, 5
    Move 33, 1
    MoveEnd

Movement_0882:
    Move 12, 5
    Move 14, 6
    Move 33, 1
    MoveEnd

Movement_0892:
    Move 12, 5
    Move 14, 7
    Move 33, 1
    MoveEnd

Script_21:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMStackPush EVENT_WORK_0x40e2
    VMStackPushConst 6
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_0A11
    // "Free-for-all! It's the Castelia\nHarlequin Hunt! You haven't visited...[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_FreeAllItsCastelia, 0, 0
    VMStackPush EVENT_WORK_0x40e2
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0920
    // "You still need to visit\nthis many places: Wow! Zero![f000]븁\u0000\nThat means you've completed\nthe Castelia Harlequin Hunt![f000]븁\u0000\nCongratulations!\nThis is a small commemorative gift![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_StillNeedVisitMany_2, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 50
    WorkSet 0x8001, 1
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    // "The Castelia Harlequin Hunt is a way\nto make more people love Castelia City![f000]븁\u0000\nThat's why we generously gave you a\nBicycle at the beginning. It's the best[f000]븀\u0000\nway to get around Castelia City![f000]븁\u0000\nKeep loving Castelia City![f000]븁\u0000\nCastelia City, Castelia City,\nCastelia City! ♪ Here we go! ♪"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_CasteliaHarlequinHuntWay, 0, 0
    LastKeyWait
    MsgWinCloseAll
    WorkSetConst EVENT_WORK_0x40e2, 6
    VMJump L_0A0B

L_0920:
    WorkSetConst 0x8027, 0
    WorkSetConst 0x8028, 0

L_092C:
    VMStackPush 0x8028
    VMStackPushConst 3
    VMStackCmp CMP_LT
    VMJumpIf CMP_STACK, L_09F6
    VMStackPush 0x8028
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackPushFlag EVENT_FLAG_0x0138
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_097A
    // "The Medal Office![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_MedalOffice, 11, 0, 0
    WorkAdd 0x8027, 1
    VMJump L_09EA

L_097A:
    VMStackPush 0x8028
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackPushFlag EVENT_FLAG_0x0139
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_09B5
    // "Passerby Analytics HQ![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_PasserbyAnalyticsHq, 11, 0, 0
    WorkAdd 0x8027, 1
    VMJump L_09EA

L_09B5:
    VMStackPush 0x8028
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMStackPushFlag EVENT_FLAG_0x013a
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_09EA
    // "The Battle Company![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_BattleCompany, 11, 0, 0
    WorkAdd 0x8027, 1

L_09EA:
    WorkAdd 0x8028, 1
    VMJump L_092C

L_09F6:
    WordSetNumber 0, 0x8027, 1
    // "You still need to visit\nthis many places: [f000]Ȁ\u0001\u0000![f000]븁\u0000\nSo explore Castelia City, and enjoy\nthe Castelia Harlequin Hunt!"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_StillNeedVisitMany, 0, 0
    LastKeyWait
    MsgWinCloseAll

L_0A0B:
    VMJump L_0A1F

L_0A11:
    // "The Castelia Harlequin Hunt is a way\nto make more people love Castelia City![f000]븁\u0000\nThat's why we generously gave you a\nBicycle at the beginning. It's the best[f000]븀\u0000\nway to get around Castelia City![f000]븁\u0000\nKeep loving Castelia City![f000]븁\u0000\nCastelia City, Castelia City,\nCastelia City! ♪ Here we go! ♪"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_CasteliaHarlequinHuntWay, 0, 0
    LastKeyWait
    MsgWinCloseAll

L_0A1F:
    WorkSetConst 0x8028, 0
    WorkSetConst 0x8027, 0
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_22:
    ActorsPauseAll
    WorkSetConst 0x8021, 0
    WorkSetConst 0x8022, 0
    WorkSetConst 0x8023, 0
    ActorGetRailPos 255, 0x8021, 0x8022, 0x8023
    VMStackPush 0x8023
    VMStackPushConst 11
    VMStackCmp CMP_GT
    VMJumpIf CMP_STACK, L_0A6D
    ActorCmdExec 0, Movement_0AD8
    ActorCmdWait

L_0A6D:
    // "Iris: Hey, c'mon![f000]븁\u0000\nThumb Pier is past here![f000]븁\u0000\nIf you mention a suspicious\nplace in Castelia City, the[f000]븀\u0000\nonly places that come to mind[f000]븀\u0000\nare Narrow Street and here![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_IrisHeyCmonThumb, 0, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8023
    VMStackPushConst 11
    VMStackCmp CMP_GT
    VMJumpIf CMP_STACK, L_0AA0
    DebugPrint 300
    ActorCmdExec 0, Movement_0AE0
    VMJump L_0AA8

L_0AA0:
    ActorCmdExec 0, Movement_0AE8

L_0AA8:
    ActorCmdWait
    WorkSetConst EVENT_WORK_0x40b1, 2
    FlagSet EVENT_FLAG_0x02ef
    FlagReset EVENT_FLAG_0x0406
    ActorAdd 12
    ActorDelete 0
    WorkSetConst 0x8023, 0
    WorkSetConst 0x8022, 0
    WorkSetConst 0x8021, 0
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0AD8:
    Move 32, 1
    MoveEnd

Movement_0AE0:
    Move 15, 12
    MoveEnd

Movement_0AE8:
    Move 15, 8
    MoveEnd

Script_23:
    VMHalt

Script_24:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    FlagGet EVENT_FLAG_0x0229, 0x8009
    WorkCmpConst 0x8009, 1
    VMJumpIf CMP_EQ, L_0C04
    // "The water's so clear here..."
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_WatersClearHere, 1, 0
    LastKeyWait
    ActorMsgClose
    ActorSetEyeToEye
    ActorCmdExec 32, Movement_0C24
    ActorCmdWait
    // "Oh―hey.[f000]븁\u0000\nSee them?[f000]븁\u0000\nThe Basculin?"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_OhHeySeeThem, 1, 0
    LastKeyWait
    ActorMsgClose
    ActorCmdExec 32, Movement_0C2C
    ActorCmdWait
    PlayerGetDir 0x800a
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_0B54
    VMJump L_0B76

L_0B54:
    ActorCmdExec 255, Movement_0C34
    ActorCmdWait
    ActorCmdExec 255, Movement_0C48
    ActorCmdExec 32, Movement_0C50
    ActorCmdWait
    VMJump L_0B78

L_0B76:
    ActorSetEyeToEye

L_0B78:
    // "Someone told me the [f000][ff00]\u0001\u0001red[f000][ff00]\u0001\u0000 stripe\nBasculin live in [f000][ff00]\u0001\u0001east[f000][ff00]\u0001\u0000 Unova,[f000]븀\u0000\nwhile the [f000][ff00]\u0001\u0002blue[f000][ff00]\u0001\u0000 live in the [f000][ff00]\u0001\u0002west[f000][ff00]\u0001\u0000."
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_SomeoneToldRedStripe, 1, 0
    LastKeyWait
    ActorMsgClose
    ActorCmdExec 32, Movement_0C58
    ActorCmdWait
    // "I didn't expect to see them\nin the harbor, though.[f000]븀\u0000\nThey're freshwater Pokémon."
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_DidntExpectSeeThem, 1, 0
    LastKeyWait
    ActorMsgClose
    ActorCmdExec 32, Movement_0C68
    ActorCmdWait
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_0BBB
    VMJump L_0BCB

L_0BBB:
    ActorCmdExec 32, Movement_0C74
    ActorCmdWait
    VMJump L_0BCD

L_0BCB:
    ActorSetEyeToEye

L_0BCD:
    ActorCmdExec 32, Movement_0C7C
    ActorCmdWait
    TrainerCardGetBadgeCount 0x8008
    WordSetNumber 0, 0x8008, 1
    // "I'm Misty.[f000]븁\u0000\nI came from Kanto to battle in the\n[f000][ff00]\u0001\u0002Pokémon World Tournament[f000][ff00]\u0001\u0000 in Driftveil.[f000]븁\u0000\nIf you're heading that way,\nyou should sign up too.[f000]븀\u0000\nMaybe you'll get to see my Starmie!"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_ImMistyCameFrom, 1, 0
    LastKeyWait
    ActorMsgClose
    ActorCmdExec 32, Movement_0C84
    ActorCmdWait
    FlagSet EVENT_FLAG_0x0229
    VMJump L_0C1E

L_0C04:
    ActorSetEyeToEye
    // "I think I'm going to watch the sea\na bit longer, but you go ahead.[f000]븀\u0000\nI'll see you in Driftveil!"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCity_Text_ThinkImGoingWatch, 1, 0
    LastKeyWait
    ActorMsgClose
    ActorCmdExec 32, Movement_0C8C
    ActorCmdWait

L_0C1E:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0C24:
    Move 75, 1
    MoveEnd

Movement_0C2C:
    Move 33, 1
    MoveEnd

Movement_0C34:
    Move 14, 1
    Move 13, 1
    Move 65, 1
    Move 65, 1
    MoveEnd

Movement_0C48:
    Move 35, 1
    MoveEnd

Movement_0C50:
    Move 34, 1
    MoveEnd

Movement_0C58:
    Move 33, 1
    Move 65, 1
    Move 65, 1
    MoveEnd

Movement_0C68:
    Move 65, 1
    Move 65, 1
    MoveEnd

Movement_0C74:
    Move 34, 1
    MoveEnd

Movement_0C7C:
    Move 65, 1
    MoveEnd

Movement_0C84:
    Move 33, 1
    MoveEnd

Movement_0C8C:
    Move 33, 1
    MoveEnd
