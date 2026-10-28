#include "asm/field_script.inc"
#include "text/script/pledge_grove.h"

// Script plugin 16, from the zones that use this file

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
    ScriptEntriesEnd

Script_1:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    VMCall Script_10
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_008E
    // "Three sharp marks are deeply\ncut into the rock."
    InfoMsg PledgeGrove_Text_ThreeSharpMarksDeeply, 2
    MsgWaitAdvance
    WordSetPartyPokeName 0, 0x8020
    // "[f000]Ă\u0001\u0000 seems to want to get out of\nthe Poké Ball![f000]븁\u0000\nWill you let it out?"
    InfoMsg PledgeGrove_Text_SeemsWantGetOut, 2
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_007F
    InfoMsgClose
    VMCall Script_2
    VMJump L_0088

L_007F:
    // "The Poké Ball has stopped moving..."
    InfoMsg PledgeGrove_Text_PokeBallHasStopped, 2
    LastKeyWait
    InfoMsgClose

L_0088:
    VMJump L_0097

L_008E:
    // "Three sharp marks are deeply\ncut into the rock."
    InfoMsg PledgeGrove_Text_ThreeSharpMarksDeeply, 2
    LastKeyWait
    InfoMsgClose

L_0097:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_2:
    ActorCmdExec 255, Movement_01BC
    ActorCmdWait
    VMCall Script_3
    PVPlay 647, 0
    PVWait
    ActorCmdExec 251, Movement_01C4
    ActorCmdWait
    ActorCmdExec 251, Movement_01E4
    VMSleep 16
    ActorCmdExec 255, Movement_0200
    ActorCmdWait
    ActorCmdExec 251, Movement_0208
    VMSleep 16
    ActorCmdExec 255, Movement_0214
    ActorCmdWait
    ActorCmdExec 251, Movement_021C
    ActorCmdExec 255, Movement_0240
    ActorCmdWait
    ActorCmdExec 251, Movement_0248
    VMSleep 60
    ActorCmdExec 255, Movement_0288
    ActorCmdWait
    ActorCmdExec 255, Movement_0290
    VMSleep 8
    ActorCmdExec 251, Movement_029C
    ActorCmdWait
    VMSleep 8
    ActorCmdExec 251, Movement_02A4
    ActorCmdWait
    PVPlay 647, 0
    PVWait
    ActorCmdExec 251, Movement_02B0
    ActorCmdWait
    ActorCmdExec 251, Movement_02C4
    ActorCmdWait
    PokePartyHasMove 0x8010, 548, 0x8020
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_017B
    VMCall Script_4
    VMJump L_01B4

L_017B:
    // "The determination carved into the rock\nby Cobalion, Virizion, and Terrakion[f000]븀\u0000\nreminded [f000]Ă\u0001\u0000 of Secret Sword!"
    SystemMsg PledgeGrove_Text_DeterminationCarvedIntoRock, 2
    MsgWaitAdvance
    WorkGet 0x8000, 0x8020
    WorkSetConst 0x8001, 548
    VMCall Script_5
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01B4
    VMCall Script_4
    VMJump L_01B4

L_01B4:
    VMCall Script_6
    VMReturn

Movement_01BC:
    Move 33, 1
    MoveEnd

Movement_01C4:
    Move 34, 1
    Move 63, 1
    Move 35, 1
    Move 63, 1
    Move 32, 1
    Move 63, 1
    Move 75, 1
    MoveEnd

Movement_01E4:
    Move 18, 3
    Move 16, 3
    Move 63, 2
    Move 35, 1
    Move 51, 1
    Move 63, 2
    MoveEnd

Movement_0200:
    Move 34, 1
    MoveEnd

Movement_0208:
    Move 17, 2
    Move 19, 6
    MoveEnd

Movement_0214:
    Move 33, 1
    MoveEnd

Movement_021C:
    Move 16, 2
    Move 63, 2
    Move 34, 1
    Move 63, 1
    Move 35, 1
    Move 63, 1
    Move 32, 1
    Move 63, 2
    MoveEnd

Movement_0240:
    Move 35, 1
    MoveEnd

Movement_0248:
    Move 17, 1
    Move 18, 2
    Move 32, 1
    Move 63, 2
    Move 34, 1
    Move 63, 1
    Move 17, 1
    Move 18, 2
    Move 16, 1
    Move 35, 1
    Move 63, 1
    Move 32, 1
    Move 63, 1
    Move 35, 1
    Move 63, 3
    MoveEnd

Movement_0288:
    Move 34, 1
    MoveEnd

Movement_0290:
    Move 13, 2
    Move 32, 1
    MoveEnd

Movement_029C:
    Move 33, 1
    MoveEnd

Movement_02A4:
    Move 15, 1
    Move 32, 1
    MoveEnd

Movement_02B0:
    Move 63, 3
    Move 161, 1
    Move 63, 5
    Move 75, 1
    MoveEnd

Movement_02C4:
    Move 33, 1
    MoveEnd

Script_3:
    SpPokeJump 0, 15, 3, 15, 3, 8
    SpPokeAppear 0, 15, 3, 15
    SpPokeWaitFrame 0
    FadeEx 12, 0, 16, 2
    FadeExWait
    ActorNew 15, 15, 1, 251, 122, 0
    FadeEx 12, 16, 0, 2
    FadeExWait
    SpPokeWaitAnimEnd 0
    VMReturn

Script_4:
    EvCameraInit
    EvCameraUnbind
    EvCameraMoveTo 7768, 0, 0xed000, 0xf8000, 45056, 0xbb000, 40
    EvCameraWait
    // "What?\n[f000]Ă\u0001\u0000 is...[f000]븁\u0000"
    InfoMsg PledgeGrove_Text_What, 2
    InfoMsgClose
    CallFormEvent
    FadeEx 12, 0, 16, 4
    FadeExWait
    HideActor2
    ActorDelete 251
    ActorNew 15, 13, 1, 251, 373, 0
    PlayFieldEffect 115
    PVPlay 647, 1
    FadeEx 12, 16, 0, 4
    FadeExWait
    PVWait
    PokePartySetForme 0x8020, 1
    // "[f000]Ă\u0001\u0000 has resolved to battle\nand has changed into Resolute Form!"
    InfoMsg PledgeGrove_Text_HasResolvedBattleHas, 2
    LastKeyWait
    InfoMsgClose
    EvCameraReturn 30
    EvCameraWait
    EvCameraRebind
    EvCameraEnd
    VMReturn

Script_5:
    WorkGet 0x8021, 0x8000
    WorkGet 0x8022, 0x8001
    PokePartyGetMoveCount 0x8010, 0x8021
    VMStackPush 0x8010
    VMStackPushConst 4
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_03D8
    WordSetPartyPokeName 0, 0x8021
    // "[f000]Ă\u0001\u0000 remembered the move\nSecret Sword!"
    SystemMsg PledgeGrove_Text_RememberedMoveSecretSword, 0
    MEPlay SEQ_ME_LVUP
    MEWait
    MsgWaitAdvance
    SystemMsgClose
    PokePartyLearnMove 0x8021, 0x8010, 0x8022
    WorkSetConst 0x8010, 1
    VMReturn

L_03D8:
    WorkSetConst 0x8025, 1

L_03DE:
    VMStackPush 0x8025
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0447
    VMCall Script_7
    VMStackPush 0x8026
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_041C
    WorkSetConst 0x8010, 1
    WorkSetConst 0x8025, 0
    VMJump L_0441

L_041C:
    VMCall Script_8
    VMStackPush 0x8026
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0441
    WorkSetConst 0x8010, 0
    WorkSetConst 0x8025, 0

L_0441:
    VMJump L_03DE

L_0447:
    VMReturn
    .byte 0x00

Script_6:
    SpPokeAppear 1, 15, 4, 13
    SpPokeWaitFrame 1
    FadeEx 12, 0, 16, 2
    FadeExWait
    ActorDelete 251
    FadeEx 12, 16, 0, 2
    FadeExWait
    SpPokeWaitAnimEnd 1
    SpPokeJump 1, 15, 0, 15, 3, 8
    VMReturn

Script_7:
    WorkSetConst 0x8026, 0
    WordSetPartyPokeName 0, 0x8021
    // "But [f000]Ă\u0001\u0000 can't know more\nthan four moves.[f000]븁\u0000\nDelete an existing move to make\nroom for Secret Sword?[f000]븁\u0000"
    SystemMsg PledgeGrove_Text_ButCantKnowMore, 0
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_04B2
    VMReturn

L_04B2:
    SystemMsgClose
    CallPokeMoveReplace 0x8010, 0x8023, 0x8021, 0x8022
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_04D3
    VMReturn

L_04D3:
    PokePartyGetMove 0x8024, 0x8021, 0x8023
    WordSetMoveName 1, 0x8024
    // "Is it OK to forget the\nmove [f000]ć\u0001\u0001?"
    SystemMsg PledgeGrove_Text_OkForgetMove, 0
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_04FF
    VMReturn

L_04FF:
    PokePartyGetMove 0x8024, 0x8021, 0x8023
    WordSetPartyPokeName 0, 0x8021
    WordSetMoveName 1, 0x8024
    // "1, [f000]븂\u0001\u00142, and[f000]븂\u0001\u0014... [f000]븂\u0001\u0014... [f000]븂\u0001\u0014... Ta-da![f000]븅\u0001\u0003[f000]븆\u0001\u0002[f000]븇\u0000[f000]븄\u0000[f000]븁\u0000\n[f000]Ă\u0001\u0000 forgot how to\nuse [f000]ć\u0001\u0001.[f000]븁\u0000\nAnd...[f000]븁\u0000"
    SystemMsg PledgeGrove_Text_12TaDa, 0
    // "[f000]Ă\u0001\u0000 remembered the move\nSecret Sword!"
    SystemMsg PledgeGrove_Text_RememberedMoveSecretSword, 0
    MEPlay SEQ_ME_LVUP
    MEWait
    MsgWaitAdvance
    SystemMsgClose
    PokePartyLearnMove 0x8021, 0x8023, 0x8022
    WorkSetConst 0x8026, 1
    VMReturn
    .byte 0x00

Script_8:
    // "Give up on remembering the\nmove Secret Sword?"
    SystemMsg PledgeGrove_Text_GiveUpRememberingMove, 0
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_056A
    WordSetPartyPokeName 0, 0x8021
    // "[f000]Ă\u0001\u0000 did not remember the\nmove Secret Sword.[f000]븁\u0000"
    SystemMsg PledgeGrove_Text_DidNotRememberMove, 0
    SystemMsgClose
    WorkSetConst 0x8026, 1
    VMReturn

L_056A:
    WorkSetConst 0x8026, 0
    VMReturn

Script_9:
    ActorsPauseAll
    ActorSetEyeToEye
    PVPlay 647, 0
    ActorCmdExec 0, Movement_05F6
    ActorCmdWait
    PokePartyGetParam 0x8009, 0, 158
    WorkDiv 0x8009, 5
    WorkMul 0x8009, 4
    CallWildBattle 647, 0x8009, 1
    WildBattleGetResult 0x8008
    PokePartyGetCount 0x8009, 2
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_05EB
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_05DB
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_05D3

L_05D3:
    CallWildBattleEnd
    VMJump L_05E1

L_05DB:
    CallWildLose
    ActorsUnpauseAll
    VMHalt

L_05E1:
    ActorDelete 0
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_05EB:
    FlagSet EVENT_FLAG_0x041b
    VMJump L_05D3
    .byte 0x00

Movement_05F6:
    Move 75, 1
    MoveEnd

Script_10:
    WorkSetConst 0x8010, 0
    WorkSetConst 0x8008, 0
    VMJump L_0610

L_0610:
    PokePartyGetCount 0x8009, 0
    WorkCmpWork 0x8008, 0x8009
    VMJumpIf CMP_GE, L_06A8
    PokePartyGetSpecies 0x800a, 0x8008
    WorkCmpConst 0x800a, 647
    VMJumpIf CMP_EQ, L_0642
    WorkAdd 0x8008, 1
    VMJump L_0610

L_0642:
    WorkGet 0x8020, 0x8008
    PokePartyGetMove 0x800b, 0x8020, 0
    WorkCmpConst 0x800b, 548
    VMJumpIf CMP_EQ, L_06A8
    PokePartyGetMove 0x800b, 0x8020, 1
    WorkCmpConst 0x800b, 548
    VMJumpIf CMP_EQ, L_06A8
    PokePartyGetMove 0x800b, 0x8020, 2
    WorkCmpConst 0x800b, 548
    VMJumpIf CMP_EQ, L_06A8
    PokePartyGetMove 0x800b, 0x8020, 3
    WorkCmpConst 0x800b, 548
    VMJumpIf CMP_EQ, L_06A8
    WorkSetConst 0x8010, 1
    VMJump L_06A8

L_06A8:
    VMReturn
    .balign 4, 0
