#include "asm/field_script.inc"
#include "text/script/global_10130.h"
#ifdef PAPERWHITE2_DEBUG_MENU
#include "constants/pokemon.h"
#endif

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
// Paper White 2: the debug menu that START opens in the field (src/ov036/fieldmap_event.c), with its submenus, all in
// this one script (no new script IDs). Each menu is a labeled block that shows its list, compares the result (0x8020)
// with its entries and jumps to each one's block; B, Back and anything else go back to the menu above it. The main
// list has toggles, each with its state, and the submenus. Picking a toggle flips its flag (the debug block of
// docs/paperwhite2/plugins.md's Flags) and shows the list again. To add a toggle: a DEBUG_ENTRY_* value, its VMCall in
// the list, its WorkCmpConst after the list, and its L_DebugAdd*/L_DebugToggle* pair, with its On and Off texts in
// global_10130.txt. To add a submenu: a DEBUG_ENTRY_* value, its ListMenuAdd and WorkCmpConst, and its block
#define DEBUG_ENTRY_ALWAYS_SHINY 0
#define DEBUG_ENTRY_PARTY 1
#define DEBUG_ENTRY_CLOSE 2

// Party...: what changes the party's first Pokemon
#define DEBUG_PARTY_SET_EVS 0
#define DEBUG_PARTY_BACK 1

// Set EVs...: the stats, in the summary's order, then the values. The values' entries are the values themselves, so
// Back takes one that isn't a value. A list entry's value must stay under 0x4000, which ListMenuAdd would read as a
// variable
#define DEBUG_EV_HP 0
#define DEBUG_EV_ATTACK 1
#define DEBUG_EV_DEFENSE 2
#define DEBUG_EV_SP_ATTACK 3
#define DEBUG_EV_SP_DEFENSE 4
#define DEBUG_EV_SPEED 5
#define DEBUG_EV_BACK 6
#define DEBUG_EV_VALUE_BACK 1
// The party slot that the Party menu changes
#define DEBUG_PARTY_SLOT 0

Script_17:
    ActorsPauseAll

L_DebugMenu:
    // "DEBUG"
    SystemMsg Global10130_Text_DebugTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    VMCall L_DebugAddAlwaysShiny
    ListMenuAdd Global10130_Text_DebugParty, 65535, DEBUG_ENTRY_PARTY
    ListMenuAdd Global10130_Text_DebugClose, 65535, DEBUG_ENTRY_CLOSE
    ListMenuShow
    WorkCmpConst 0x8020, DEBUG_ENTRY_ALWAYS_SHINY
    VMJumpIf CMP_EQ, L_DebugToggleAlwaysShiny
    WorkCmpConst 0x8020, DEBUG_ENTRY_PARTY
    VMJumpIf CMP_EQ, L_DebugParty
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

// Party...
L_DebugParty:
    WorkSetConst 0x8023, DEBUG_EV_HP
    // "DEBUG: Party"
    SystemMsg Global10130_Text_DebugPartyTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10130_Text_DebugSetEVs, 65535, DEBUG_PARTY_SET_EVS
    ListMenuAdd Global10130_Text_DebugBack, 65535, DEBUG_PARTY_BACK
    ListMenuShow
    WorkCmpConst 0x8020, DEBUG_PARTY_SET_EVS
    VMJumpIf CMP_EQ, L_DebugSetEVs
    VMJump L_DebugMenu

// Set EVs...: the stat list, with the cursor on the last stat set (0x8023). Each stat's block keeps its parameter
// (0x8021), its confirmation (0x8022) and its place in the list (0x8023) for the value list
L_DebugSetEVs:
    // "DEBUG: Set EVs"
    SystemMsg Global10130_Text_DebugSetEVsTitle, 2
    ListMenuAnchorTopRight 31, 1, 0x8023, 1, 0x8020
    ListMenuAdd Global10130_Text_DebugStatHp, 65535, DEBUG_EV_HP
    ListMenuAdd Global10130_Text_DebugStatAttack, 65535, DEBUG_EV_ATTACK
    ListMenuAdd Global10130_Text_DebugStatDefense, 65535, DEBUG_EV_DEFENSE
    ListMenuAdd Global10130_Text_DebugStatSpAttack, 65535, DEBUG_EV_SP_ATTACK
    ListMenuAdd Global10130_Text_DebugStatSpDefense, 65535, DEBUG_EV_SP_DEFENSE
    ListMenuAdd Global10130_Text_DebugStatSpeed, 65535, DEBUG_EV_SPEED
    ListMenuAdd Global10130_Text_DebugBack, 65535, DEBUG_EV_BACK
    ListMenuShow
    WorkCmpConst 0x8020, DEBUG_EV_HP
    VMJumpIf CMP_EQ, L_DebugEVHp
    WorkCmpConst 0x8020, DEBUG_EV_ATTACK
    VMJumpIf CMP_EQ, L_DebugEVAttack
    WorkCmpConst 0x8020, DEBUG_EV_DEFENSE
    VMJumpIf CMP_EQ, L_DebugEVDefense
    WorkCmpConst 0x8020, DEBUG_EV_SP_ATTACK
    VMJumpIf CMP_EQ, L_DebugEVSpAttack
    WorkCmpConst 0x8020, DEBUG_EV_SP_DEFENSE
    VMJumpIf CMP_EQ, L_DebugEVSpDefense
    WorkCmpConst 0x8020, DEBUG_EV_SPEED
    VMJumpIf CMP_EQ, L_DebugEVSpeed
    VMJump L_DebugParty

L_DebugEVHp:
    WorkSetConst 0x8021, PKM_PARAM_EV_HP
    WorkSetConst 0x8022, Global10130_Text_DebugSetHpEVs
    WorkSetConst 0x8023, DEBUG_EV_HP
    VMJump L_DebugEVValues

L_DebugEVAttack:
    WorkSetConst 0x8021, PKM_PARAM_EV_ATTACK
    WorkSetConst 0x8022, Global10130_Text_DebugSetAttackEVs
    WorkSetConst 0x8023, DEBUG_EV_ATTACK
    VMJump L_DebugEVValues

L_DebugEVDefense:
    WorkSetConst 0x8021, PKM_PARAM_EV_DEFENSE
    WorkSetConst 0x8022, Global10130_Text_DebugSetDefenseEVs
    WorkSetConst 0x8023, DEBUG_EV_DEFENSE
    VMJump L_DebugEVValues

L_DebugEVSpAttack:
    WorkSetConst 0x8021, PKM_PARAM_EV_SP_ATTACK
    WorkSetConst 0x8022, Global10130_Text_DebugSetSpAttackEVs
    WorkSetConst 0x8023, DEBUG_EV_SP_ATTACK
    VMJump L_DebugEVValues

L_DebugEVSpDefense:
    WorkSetConst 0x8021, PKM_PARAM_EV_SP_DEFENSE
    WorkSetConst 0x8022, Global10130_Text_DebugSetSpDefenseEVs
    WorkSetConst 0x8023, DEBUG_EV_SP_DEFENSE
    VMJump L_DebugEVValues

L_DebugEVSpeed:
    WorkSetConst 0x8021, PKM_PARAM_EV_SPEED
    WorkSetConst 0x8022, Global10130_Text_DebugSetSpeedEVs
    WorkSetConst 0x8023, DEBUG_EV_SPEED
    VMJump L_DebugEVValues

// The values of the stat picked. Picking one sets it on the party's first Pokemon, without the 510 total's check,
// recalculates its stats (PokePartySetEV, include/paperwhite2/debug_commands.h), says so and shows the stat list again
L_DebugEVValues:
    // "DEBUG: Set EVs"
    SystemMsg Global10130_Text_DebugSetEVsTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10130_Text_DebugEV0, 65535, 0
    ListMenuAdd Global10130_Text_DebugEV128, 65535, 128
    ListMenuAdd Global10130_Text_DebugEV252, 65535, 252
    ListMenuAdd Global10130_Text_DebugBack, 65535, DEBUG_EV_VALUE_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 0
    VMJumpIf CMP_EQ, L_DebugEVSet
    WorkCmpConst 0x8020, 128
    VMJumpIf CMP_EQ, L_DebugEVSet
    WorkCmpConst 0x8020, 252
    VMJumpIf CMP_EQ, L_DebugEVSet
    VMJump L_DebugSetEVs

L_DebugEVSet:
    SEPlay SEQ_SE_SELECT1
    PokePartySetEV DEBUG_PARTY_SLOT, 0x8021, 0x8020
    WordSetNumber 0, 0x8020, 3
    // "Set {stat} EVs to [number]."
    SystemMsg 0x8022, 2
    LastKeyWait
    VMJump L_DebugSetEVs
#endif
    .balign 4, 0
