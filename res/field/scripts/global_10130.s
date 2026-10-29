#include "asm/field_script.inc"
#include "text/script/global_10130.h"

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
#ifdef PAPERWHITE2_DEBUG_MENU
    ScriptEntry Script_17
#endif
    ScriptEntriesEnd
    WorkSetConst 0x8020, 0

Script_1:
    ActorsPauseAll
    // "Repel's effect wore off!"
    SystemMsg Global10130_Text_RepelsEffectWoreOff, 2
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_15:
    ActorsPauseAll
    WorkSetConst 0x8021, 0
    // "Repel's effect wore off!\nUse another?"
    SystemMsg Global10130_Text_RepelsEffectWoreOff_2, 2
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0093
    RepelRearm 0x8021
    WordSetPlayerName 0
    WordSetItemName 1, 0x8021
    // "[f000]Ā\u0001\u0000 used the\n[f000]ĉ\u0001\u0001!"
    SystemMsg Global10130_Text_Used, 2
    LastKeyWait

L_0093:
    SystemMsgClose
    WorkSetConst 0x8021, 0
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_2:
    ActorsPauseAll
    // "There appears to be nothing here..."
    SystemMsg Global10130_Text_ThereAppearsNothingHere, 2
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_3:
    ActorsPauseAll
    // "The sweet scent faded for\nsome reason..."
    SystemMsg Global10130_Text_SweetScentFadedSome, 2
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_4:
    ActorsPauseAll
    WorkSetConst 0x8022, 0
    PhenomenonGetItemID 0x8022
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 0x8022
    WorkSet 0x8001, 1
    RTCallGlobal 2807
    VMStackPop 0x8001
    VMStackPop 0x8000
    WorkSetConst 0x8022, 0
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_5:
    ActorsPauseAll
    // "Landed a Pokémon![f000]븁\u0000"
    SystemMsg Global10130_Text_LandedPokemon, 2
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_6:
    ActorsPauseAll
    // "Not even a nibble...[f000]븁\u0000"
    SystemMsg Global10130_Text_NotEvenNibble, 2
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_7:
    ActorsPauseAll
    // "Reeled it in too quickly![f000]븁\u0000"
    SystemMsg Global10130_Text_ReeledTooQuickly, 2
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_8:
    ActorsPauseAll
    // "Reeled it in too late![f000]븁\u0000"
    SystemMsg Global10130_Text_ReeledTooLate, 2
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_9:
    ActorsPauseAll
    WordSetPlayerName 0
    // "[f000]Ā\u0001\u0000 warped to the Entralink![f000]븁\u0000"
    SystemMsg Global10130_Text_WarpedEntralink, 2
    SystemMsgClose
    PlayerGetExState 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0165
    PlayerSetSpecialSequence 1

L_0165:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_10:
    ActorsPauseAll
    WordSetPlayerName 0
    // "Participating in an ongoing mission\nat the Entralink![f000]븁\u0000\nYou'll return here after the mission.[f000]븁\u0000\nYou will warp to another person's\nEntralink to participate in the mission![f000]븁\u0000"
    SystemMsg Global10130_Text_ParticipatingOngoingMissionEntralink, 2
    SystemMsgClose
    PlayerGetExState 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0193
    PlayerSetSpecialSequence 1

L_0193:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_11:
    ActorsPauseAll
    // "You can't warp to the Entralink here!"
    SystemMsg Global10130_Text_CantWarpEntralinkHere, 2
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_12:
    ActorsPauseAll
    // "You can't warp because there is a\nmission going on at the Entralink."
    SystemMsg Global10130_Text_CantWarpBecauseThere, 2
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_13:
    ActorsPauseAll
    // "You can't warp to the Entralink because\nyou are connecting with someone."
    SystemMsg Global10130_Text_CantWarpEntralinkBecause, 2
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_14:
    ActorsPauseAll
    // "The connection has been lost."
    SystemMsg Global10130_Text_ConnectionHasBeenLost, 2
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_16:
    ActorsPauseAll
    // "You can't warp to the Entralink\nif you have someone with you."
    SystemMsg Global10130_Text_CantWarpEntralinkIf, 2
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

#ifdef PAPERWHITE2_DEBUG_MENU
// Paper White 2: the debug menu that START opens in the field (src/ov036/fieldmap_event.c): a message, a list of
// options, and a message for the option picked
Script_17:
    ActorsPauseAll
    // "TEST"
    SystemMsg Global10130_Text_DebugTest, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10130_Text_DebugOptionA, 65535, 0
    ListMenuAdd Global10130_Text_DebugOptionB, 65535, 1
    ListMenuAdd Global10130_Text_DebugClose, 65535, 2
    ListMenuShow
    VMStackPush 0x8020
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_DebugMenuNotOptionA
    // "You picked Option A."
    SystemMsg Global10130_Text_DebugPickedOptionA, 2
    LastKeyWait
    VMJump L_DebugMenuClose

L_DebugMenuNotOptionA:
    VMStackPush 0x8020
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_DebugMenuClose
    // "You picked Option B."
    SystemMsg Global10130_Text_DebugPickedOptionB, 2
    LastKeyWait

L_DebugMenuClose:
    SystemMsgClose
    ActorsUnpauseAll
    VMHalt
#endif
    .balign 4, 0
