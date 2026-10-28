#include "asm/field_script.inc"
#include "text/script/virbank_complex.h"

    ScriptEntry Script_1
    ScriptEntry Script_2
    ScriptEntry Script_3
    ScriptEntry Script_4
    ScriptEntry Script_5
    ScriptEntry Script_6
    ScriptEntry Script_7
    ScriptEntry Script_8
    ScriptEntry Script_9
    ScriptEntriesEnd

Script_1:
    ActorsPauseAll
    FunfestMissionBroadcast 17, 0
    SEPlay SEQ_SE_MESSAGE
    // "Virbank Complex\nWhere Fire Meets Steel"
    MsgPlaceSign VirbankComplex_Text_VirbankComplexWhereFire, 2
    MsgPlaceSignClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_2:
    ActorsPauseAll
    WorkSetConst 0x8020, 0
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMStackPushFlag EVENT_FLAG_DAILY_0x0acb
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_011E
    // "Yo! This is a good deal.[f000]븁\u0000\nWhy don't you trade your Poké Ball\nfor my Great Ball?"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex_Text_YoGoodDealWhy, 0, 0
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_010A
    VMCall Script_3
    WorkCmpConst 0x8020, 0
    VMJumpIf CMP_EQ, L_009B
    VMJump L_00AB

L_009B:
    // "Oh! Seriously? You must be kidding.\nDon't you have a Poké Ball?!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex_Text_OhSeriouslyMustKidding, 0, 0
    VMJump L_0104

L_00AB:
    WorkCmpConst 0x8020, 1
    VMJumpIf CMP_EQ, L_00BE
    VMJump L_00CE

L_00BE:
    // "Oh! Seriously? You must be kidding.\nYou have way too many Great Balls!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex_Text_OhSeriouslyMustKidding_3, 0, 0
    VMJump L_0104

L_00CE:
    // "Heh, thanks! Enjoy the Great Ball!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex_Text_HehThanksEnjoyGreat, 0, 0
    MsgWaitAdvance
    MsgWinCloseAll
    WordSetItemName 0, 4
    WordSetItemName 2, 3
    MEPlay SEQ_ME_ITEM
    // "Gave the [f000]ĉ\u0001\u0000 in exchange for\nthe [f000]ĉ\u0001\u0002!"
    SystemMsg VirbankComplex_Text_GaveExchange, 0
    MEWait
    MsgWaitAdvance
    MsgWinCloseAll
    // "See? It's a good deal, isn't it?\nWe can trade again tomorrow if you want!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex_Text_SeeItsGoodDeal, 0, 0
    FlagSet EVENT_FLAG_DAILY_0x0acb

L_0104:
    VMJump L_0114

L_010A:
    // "Oh! Seriously? You must be kidding.\nUsually people are happy to trade!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex_Text_OhSeriouslyMustKidding_2, 0, 0

L_0114:
    LastKeyWait
    MsgWinCloseAll
    VMJump L_012C

L_011E:
    // "See? It's a good deal, isn't it?\nWe can trade again tomorrow if you want!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex_Text_SeeItsGoodDeal, 0, 0
    LastKeyWait
    MsgWinCloseAll

L_012C:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_3:
    ItemCheckAmount ITEM_POKE_BALL, 1, 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0155
    WorkSetConst 0x8020, 0
    VMReturn

L_0155:
    ItemCheckSpace ITEM_GREAT_BALL, 1, 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0178
    WorkSetConst 0x8020, 1
    VMReturn

L_0178:
    ItemSub ITEM_POKE_BALL, 1, 0x8010
    ItemAdd ITEM_GREAT_BALL, 1, 0x8010
    WorkSetConst 0x8020, 2
    VMReturn

Script_4:
    Random 0x8008, 4
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_01A9
    VMJump L_01CD

L_01A9:
    ObjInitNPCGPos 3, 1, 216, 0, 683
    ObjInitNPCGPos 4, 1, 221, 0, 684
    ObjInitNPCGPos 7, 1, 213, 0, 683

L_01CD:
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_01E0
    VMJump L_0204

L_01E0:
    ObjInitNPCGPos 6, 1, 207, 0, 684
    ObjInitNPCGPos 3, 1, 207, 0, 683
    ObjInitNPCGPos 4, 1, 207, 0, 681

L_0204:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0217
    VMJump L_023B

L_0217:
    ObjInitNPCGPos 6, 1, 206, 0, 682
    ObjInitNPCGPos 3, 1, 206, 0, 687
    ObjInitNPCGPos 7, 1, 207, 0, 687

L_023B:
    WorkCmpConst 0x8008, 3
    VMJumpIf CMP_EQ, L_024E
    VMJump L_0272

L_024E:
    ObjInitNPCGPos 6, 1, 215, 0, 687
    ObjInitNPCGPos 4, 1, 216, 0, 688
    ObjInitNPCGPos 7, 1, 213, 0, 687

L_0272:
    VMHalt

Script_5:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Some punk Purrloin stole my\nsandwich and ran off.[f000]븁\u0000\nHow am I supposed to work\non an empty stomach?"
    ParentActorMsg MSGFILE_SCRIPT, VirbankComplex_Text_SomePunkPurrloinStole, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_6:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    ActorCmdExec 6, Movement_02B6
    ActorCmdWait
    WorkSetConst 0x8010, 240
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 6
    VMHalt

Movement_02B6:
    Move 75, 1
    MoveEnd

Script_7:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    ActorCmdExec 7, Movement_02E4
    ActorCmdWait
    WorkSetConst 0x8010, 240
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 7
    VMHalt

Movement_02E4:
    Move 75, 1
    MoveEnd

Script_8:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    ActorCmdExec 3, Movement_0312
    ActorCmdWait
    WorkSetConst 0x8010, 239
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 3
    VMHalt

Movement_0312:
    Move 75, 1
    MoveEnd

Script_9:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    ActorCmdExec 4, Movement_0340
    ActorCmdWait
    WorkSetConst 0x8010, 239
    RTCallGlobal 10854
    FinishAllEvents
    ActorsUnpauseAll
    ActorDelete 4
    VMHalt

Movement_0340:
    Move 75, 1
    MoveEnd
