#include "asm/field_script.inc"
#include "text/script/global_10490.h"
#ifdef PAPERWHITE2
#include "paperwhite2/entralink_run_actions.h"
#endif

    ScriptEntry Script_1
    ScriptEntry Script_2
    ScriptEntry Script_3
    ScriptEntry Script_4
    ScriptEntry Script_5
    ScriptEntry Script_6
    ScriptEntry Script_7
    ScriptEntry Script_8
#ifdef PAPERWHITE2
    ScriptEntry Script_9
#endif
    ScriptEntriesEnd

Script_2:
    VMHalt

Script_3:
    EntreeForestSpawnAllPkm
    VMHalt

Script_4:
    VMHalt

Script_1:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMCall L_003E
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_003E:
    AreaNPCCmd_0218 0, 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0069
    WordSetLoadEntreeForestPkmName 0x8011, 0
    // "[f000]ā\u0001\u0000 is\nmoving around energetically!"
    SystemMsg Global10490_Text_MovingAroundEnergetically, 0
    LastKeyWait
    SystemMsgClose
    VMReturn

L_0069:
    PokePartyGetCount 0x8010, 5
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00B2
    BoxGetCount 0x8010, 5
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00B2
    WordSetLoadEntreeForestPkmName 0x8011, 0
    WordSetPlayerName 1
    // "[f000]ā\u0001\u0000 looks happy\nto meet [f000]Ā\u0001\u0001![f000]븁\u0000"
    SystemMsg Global10490_Text_LooksHappyMeet, 0
    VMCall L_011F
    VMReturn

L_00B2:
    WordSetLoadEntreeForestPkmName 0x8011, 0
    WordSetPlayerName 1
    // "[f000]ā\u0001\u0000 seems to want\nto join [f000]Ā\u0001\u0001's party...[f000]븁\u0000"
    SystemMsg Global10490_Text_SeemsWantJoinS, 2
    // "Would you like to add\nthe Pokémon to your party?"
    SystemMsg Global10490_Text_WouldLikeAddPokemon, 2
    YesNoWin 0x8010
    SystemMsgClose
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0117
    EntreeForestStartBattle 0x8011, 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0113
    RecordAdd 46, 1
    EntreeForestRemovePkm 0x8011
    ActorDelete 0x8011
    CallWildBattleEnd
    MapChangeEntreeForest 9
    VMJump L_0115

L_0113:
    CallWildBattleEnd

L_0115:
    VMReturn

L_0117:
    VMCall L_011F
    VMReturn

L_011F:
    AreaNPCCmd_0218 1, 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01A8
    WordSetLoadEntreeForestPkmName 0x8011, 0
    // "Would you like [f000]ā\u0001\u0000\nto move to the Forest Clearing?"
    SystemMsg Global10490_Text_WouldLikeMoveForest, 2
    YesNoWin 0x8010
    SystemMsgClose
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01A2
    AreaNPCCmd_0219 0x8011, 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_018E
    WordSetLoadEntreeForestPkmName 0x8011, 0
    // "There's no more room in the Forest\nClearing, so [f000]ā\u0001\u0000 could not move!"
    SystemMsg Global10490_Text_TheresNoMoreRoom_2, 2
    LastKeyWait
    SystemMsgClose
    VMReturn
    VMJump L_01A2

L_018E:
    VMCall L_0214
    // "[f000]ā\u0001\u0000 moved to\nthe Forest Clearing![f000]븁\u0000"
    SystemMsg Global10490_Text_MovedForestClearing, 0
    SystemMsgClose
    MapChangeEntreeForest 9
    VMReturn

L_01A2:
    VMJump L_0212

L_01A8:
    WordSetLoadEntreeForestPkmName 0x8011, 0
    // "Would you like [f000]ā\u0001\u0000\nto move to the Deepest Clearing?"
    SystemMsg Global10490_Text_WouldLikeMoveDeepest, 2
    YesNoWin 0x8010
    SystemMsgClose
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0212
    AreaNPCCmd_0219 0x8011, 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01FE
    WordSetLoadEntreeForestPkmName 0x8011, 0
    // "There's no more room in the Deepest\nClearing, so [f000]ā\u0001\u0000 could not move!"
    SystemMsg Global10490_Text_TheresNoMoreRoom, 2
    LastKeyWait
    SystemMsgClose
    VMReturn
    VMJump L_0212

L_01FE:
    VMCall L_0214
    // "[f000]ā\u0001\u0000 moved to\nthe Deepest Clearing![f000]븁\u0000"
    SystemMsg Global10490_Text_MovedDeepestClearing, 0
    SystemMsgClose
    MapChangeEntreeForest 9
    VMReturn

L_0212:
    VMReturn

L_0214:
    WorkSetConst 0x8020, 0
    WorkSetConst 0x8021, 0
    AreaNPCCmd_0218 3, 0x8020
    AreaNPCCmd_0218 4, 0x8021
    PVPlay 0x8020, 0x8021
    PVWait
    ActorDelete 0x8011
    VMReturn
    WorkSetConst 0x8021, 0
    WorkSetConst 0x8020, 0

Script_5:
    ActorsPauseAll
#ifdef PAPERWHITE2
    // Paper White 2: in an Entralink run, the room's exits open once its battle is won
    // (paperwhite2/entralink_run_actions.h)
    EntralinkRun ENTRALINK_RUN_ACTION_CAN_LEAVE, 0, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunExitBlocked0
#endif
    ActorCmdExec 255, Movement_025C
    ActorCmdWait
    MapChangeEntreeForest 0
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
#ifdef PAPERWHITE2

L_RunExitBlocked0:
    ActorCmdExec 255, Movement_RunExitBack0
    ActorCmdWait
    VMJump L_RunExitBlocked
    .balign 4, 0
#endif

Movement_025C:
    Move 0, 1
    MoveEnd

Script_6:
    ActorsPauseAll
#ifdef PAPERWHITE2
    // Paper White 2: in an Entralink run, the room's exits open once its battle is won
    // (paperwhite2/entralink_run_actions.h)
    EntralinkRun ENTRALINK_RUN_ACTION_CAN_LEAVE, 0, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunExitBlocked1
#endif
    ActorCmdExec 255, Movement_027C
    ActorCmdWait
    MapChangeEntreeForest 1
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
#ifdef PAPERWHITE2

L_RunExitBlocked1:
    ActorCmdExec 255, Movement_RunExitBack1
    ActorCmdWait
    VMJump L_RunExitBlocked
    .balign 4, 0
#endif
    .balign 4, 0

Movement_027C:
    Move 1, 1
    MoveEnd

Script_7:
    ActorsPauseAll
#ifdef PAPERWHITE2
    // Paper White 2: in an Entralink run, the room's exits open once its battle is won
    // (paperwhite2/entralink_run_actions.h)
    EntralinkRun ENTRALINK_RUN_ACTION_CAN_LEAVE, 0, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunExitBlocked2
#endif
    ActorCmdExec 255, Movement_029C
    ActorCmdWait
    MapChangeEntreeForest 2
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
#ifdef PAPERWHITE2

L_RunExitBlocked2:
    ActorCmdExec 255, Movement_RunExitBack2
    ActorCmdWait
    VMJump L_RunExitBlocked
    .balign 4, 0
#endif
    .balign 4, 0

Movement_029C:
    Move 2, 1
    MoveEnd

Script_8:
    ActorsPauseAll
#ifdef PAPERWHITE2
    // Paper White 2: in an Entralink run, the room's exits open once its battle is won
    // (paperwhite2/entralink_run_actions.h)
    EntralinkRun ENTRALINK_RUN_ACTION_CAN_LEAVE, 0, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunExitBlocked3
#endif
    ActorCmdExec 255, Movement_02BC
    ActorCmdWait
    MapChangeEntreeForest 3
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
#ifdef PAPERWHITE2

L_RunExitBlocked3:
    ActorCmdExec 255, Movement_RunExitBack3
    ActorCmdWait
    VMJump L_RunExitBlocked
    .balign 4, 0
#endif
    .balign 4, 0

Movement_02BC:
    Move 3, 1
    MoveEnd
#ifdef PAPERWHITE2
L_RunExitBlocked:
    // Paper White 2: an exit of an Entralink run's room before its battle is won: the player steps back
    SystemMsg Global10490_Text_NightmareBlocksWay, 2
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_RunExitBack0:
    Move 9, 1
    MoveEnd

Movement_RunExitBack1:
    Move 8, 1
    MoveEnd

Movement_RunExitBack2:
    Move 11, 1
    MoveEnd

Movement_RunExitBack3:
    Move 10, 1
    MoveEnd

// Paper White 2: talking to an Entralink run room's enemy (script 10498, paperwhite2_entralink_run.c): its cry and
// the room's battle. A win opens the exits, or after the final room ends the run at the hub; a loss or a forfeit
// (running) ends it there too, with the real party back
Script_9:
    ActorsPauseAll
    ActorSetEyeToEye
    EntralinkRun ENTRALINK_RUN_ACTION_GET_SPECIES, 0, 0, 0x8000
    PVPlay 0x8000, 0
    PVWait
    EntralinkRun ENTRALINK_RUN_ACTION_BATTLE, 0, 0, 0x8000
    EntralinkRun ENTRALINK_RUN_ACTION_BATTLE_RESULT, 0, 0, 0x8000
    CallWildBattleEnd
    WorkCmpConst 0x8000, ENTRALINK_RUN_RESULT_CLEARED
    VMJumpIf CMP_EQ, L_RunRoomCleared
    WorkCmpConst 0x8000, ENTRALINK_RUN_RESULT_RUN_WON
    VMJumpIf CMP_EQ, L_RunWon
    WorkCmpConst 0x8000, ENTRALINK_RUN_RESULT_FORFEIT
    VMJumpIf CMP_EQ, L_RunForfeited
    SystemMsg Global10490_Text_WokeFromNightmare, 2
    VMJump L_RunToHub

L_RunForfeited:
    SystemMsg Global10490_Text_RanFromNightmare, 2
    VMJump L_RunToHub

L_RunWon:
    SystemMsg Global10490_Text_DarkraiNightmareOver, 2

L_RunToHub:
    LastKeyWait
    SystemMsgClose
    EntralinkRun ENTRALINK_RUN_ACTION_WARP_HUB, 0, 0, 0x8000
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_RunRoomCleared:
    SystemMsg Global10490_Text_NightmareFaded, 2
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
#endif
