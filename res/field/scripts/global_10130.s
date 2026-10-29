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
// Paper White 2: the debug menu that START opens in the field (src/ov036/fieldmap_event.c): a list of toggles, each
// with its state, and Close. Picking a toggle flips its flag (the debug block of docs/paperwhite2/plugins.md's Flags)
// and shows the list again. To add one: a DEBUG_ENTRY_* value, its VMCall in the list, its WorkCmpConst after the
// list, and its L_DebugAdd*/L_DebugToggle* pair, with its On and Off texts in global_10130.txt
#define DEBUG_ENTRY_ALWAYS_SHINY 0
#define DEBUG_ENTRY_CLOSE 1

Script_17:
    ActorsPauseAll

L_DebugMenu:
    // "DEBUG"
    SystemMsg Global10130_Text_DebugTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    VMCall L_DebugAddAlwaysShiny
    ListMenuAdd Global10130_Text_DebugClose, 65535, DEBUG_ENTRY_CLOSE
    ListMenuShow
    WorkCmpConst 0x8020, DEBUG_ENTRY_ALWAYS_SHINY
    VMJumpIf CMP_EQ, L_DebugToggleAlwaysShiny
    SystemMsgClose
    ActorsUnpauseAll
    VMHalt

// VMJumpIf CMP_STACK jumps when the comparison is false: these jump when the flag is set
L_DebugAddAlwaysShiny:
    VMStackPushFlag EVENT_FLAG_DEBUG_ALWAYS_SHINY
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_DebugAddAlwaysShinyOn
    ListMenuAdd Global10130_Text_DebugAlwaysShinyOff, 65535, DEBUG_ENTRY_ALWAYS_SHINY
    VMReturn

L_DebugAddAlwaysShinyOn:
    ListMenuAdd Global10130_Text_DebugAlwaysShinyOn, 65535, DEBUG_ENTRY_ALWAYS_SHINY
    VMReturn

L_DebugToggleAlwaysShiny:
    SEPlay SEQ_SE_SELECT1
    VMStackPushFlag EVENT_FLAG_DEBUG_ALWAYS_SHINY
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_DebugAlwaysShinyOff
    FlagSet EVENT_FLAG_DEBUG_ALWAYS_SHINY
    VMJump L_DebugMenu

L_DebugAlwaysShinyOff:
    FlagReset EVENT_FLAG_DEBUG_ALWAYS_SHINY
    VMJump L_DebugMenu
#endif
    .balign 4, 0
