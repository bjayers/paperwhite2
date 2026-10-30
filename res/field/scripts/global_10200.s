#include "asm/field_script.inc"
#include "text/script/global_10200.h"
#ifdef PAPERWHITE2_DEBUG_MENU
#include "paperwhite2/debug_actions.h"
#endif

    ScriptEntry Script_1
#ifdef PAPERWHITE2_DEBUG_MENU
    ScriptEntry Script_2
#endif
    ScriptEntriesEnd

Script_1:
    VMHalt

#ifdef PAPERWHITE2_DEBUG_MENU
// Paper White 2: the debug menu that START opens in the field (SCRID_PAPERWHITE2_DEBUG_MENU, src/ov036/fieldmap_event.c),
// script 10201, with its submenus as labeled blocks of this one script, which take no script IDs. A block shows its
// list, compares the result (0x8020) with its entries and jumps to each one's block; B, Back and anything else go back
// to the menu above it. The work is done by one command, Debug action, arg1, arg2, result
// (include/paperwhite2/debug_actions.h), whose result goes in 0x8025. A list entry's label is formatted with the
// script's words, so a block's Debug ..._WORDS action before its list puts each entry's state (ON/OFF, a name) in them.
// The work variables: 0x8020 a list's pick, 0x8023 the stat list's cursor, 0x8024 whether a number entry was Done,
// 0x8025 the command's result, 0x8026 a first number kept for a second (an item and its count, a species and its
// level, a variable and its value) or the Conditions readout's first rule, 0x8027 the number entry's cursor. See docs/paperwhite2/plugins.md, Debug menu
// A list's Back: a value no list's other entries take, under 0x4000, which ListMenuAdd would read as a variable
#define DEBUG_LIST_BACK 100

Script_2:
    ActorsPauseAll

L_DebugMenu:
    SystemMsg Global10200_Text_DebugTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugParty, 65535, 0
    ListMenuAdd Global10200_Text_DebugItems, 65535, 1
    ListMenuAdd Global10200_Text_DebugWorld, 65535, 2
    ListMenuAdd Global10200_Text_DebugEncounters, 65535, 3
    ListMenuAdd Global10200_Text_DebugPlayer, 65535, 4
    ListMenuAdd Global10200_Text_DebugInfo, 65535, 5
    ListMenuAdd Global10200_Text_DebugConditions, 65535, 6
    ListMenuAdd Global10200_Text_DebugFollower, 65535, 7
    ListMenuAdd Global10200_Text_DebugClose, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 0
    VMJumpIf CMP_EQ, L_DebugParty
    WorkCmpConst 0x8020, 1
    VMJumpIf CMP_EQ, L_DebugItems
    WorkCmpConst 0x8020, 2
    VMJumpIf CMP_EQ, L_DebugWorld
    WorkCmpConst 0x8020, 3
    VMJumpIf CMP_EQ, L_DebugEncounters
    WorkCmpConst 0x8020, 4
    VMJumpIf CMP_EQ, L_DebugPlayer
    WorkCmpConst 0x8020, 5
    VMJumpIf CMP_EQ, L_DebugInfo
    WorkCmpConst 0x8020, 6
    VMJumpIf CMP_EQ, L_DebugConditions
    WorkCmpConst 0x8020, 7
    VMJumpIf CMP_EQ, L_DebugFollower

L_DebugClose:
    SystemMsgClose
    ActorsUnpauseAll
    VMHalt

// The number entry, called after Debug DEBUG_ACTION_NUMBER_BEGIN: the kind's message with the number and its name,
// and a list that adds or takes the step, or makes it ten times larger or smaller, with the cursor kept where it
// was picked. Returns with 0x8024 set to 1 and the number in 0x8025 for Done, or 0 for Cancel or B
L_DebugNumber:
    WorkSetConst 0x8027, DEBUG_NUMBER_STEP_PLUS

L_DebugNumberLoop:
    Debug DEBUG_ACTION_NUMBER_SHOW, 0, 0, 0x8025
    SystemMsg 0x8025, 2
    ListMenuAnchorTopRight 31, 1, 0x8027, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugNumberPlus, 65535, DEBUG_NUMBER_STEP_PLUS
    ListMenuAdd Global10200_Text_DebugNumberMinus, 65535, DEBUG_NUMBER_STEP_MINUS
    ListMenuAdd Global10200_Text_DebugNumberStepUp, 65535, DEBUG_NUMBER_STEP_UP
    ListMenuAdd Global10200_Text_DebugNumberStepDown, 65535, DEBUG_NUMBER_STEP_DOWN
    ListMenuAdd Global10200_Text_DebugNumberDone, 65535, DEBUG_NUMBER_DONE
    ListMenuAdd Global10200_Text_DebugNumberCancel, 65535, DEBUG_NUMBER_CANCEL
    ListMenuShow
    WorkCmpConst 0x8020, DEBUG_NUMBER_DONE
    VMJumpIf CMP_EQ, L_DebugNumberDone
    WorkCmpConst 0x8020, DEBUG_NUMBER_STEP_DOWN
    VMJumpIf CMP_GT, L_DebugNumberCancel
    WorkSet 0x8027, 0x8020
    Debug DEBUG_ACTION_NUMBER_ADJUST, 0x8020, 0, 0x8025
    VMJump L_DebugNumberLoop

L_DebugNumberDone:
    Debug DEBUG_ACTION_NUMBER_GET, 0, 0, 0x8025
    WorkSetConst 0x8024, 1
    VMReturn

L_DebugNumberCancel:
    WorkSetConst 0x8024, 0
    VMReturn

// Party...: what changes the target, the party's first Pokémon until Next target picks another, and the gifts
L_DebugParty:
    Debug DEBUG_ACTION_PARTY_WORDS, 0, 0, 0x8025
    WorkCmpConst 0x8025, 0
    VMJumpIf CMP_EQ, L_DebugPartyEmpty
L_DebugPartyList:
    SystemMsg Global10200_Text_DebugPartyTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugNextTarget, 65535, 0
    ListMenuAdd Global10200_Text_DebugSetEVs, 65535, 1
    ListMenuAdd Global10200_Text_DebugSetIVs, 65535, 2
    ListMenuAdd Global10200_Text_DebugSetLevel, 65535, 3
    ListMenuAdd Global10200_Text_DebugNature, 65535, 4
    ListMenuAdd Global10200_Text_DebugMakeShiny, 65535, 5
    ListMenuAdd Global10200_Text_DebugFriendship, 65535, 6
    ListMenuAdd Global10200_Text_DebugHealParty, 65535, 7
    ListMenuAdd Global10200_Text_DebugGivePokemon, 65535, 8
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 0
    VMJumpIf CMP_EQ, L_DebugNextTarget
    WorkCmpConst 0x8020, 1
    VMJumpIf CMP_EQ, L_DebugSetEVs
    WorkCmpConst 0x8020, 2
    VMJumpIf CMP_EQ, L_DebugSetIVs
    WorkCmpConst 0x8020, 3
    VMJumpIf CMP_EQ, L_DebugSetLevel
    WorkCmpConst 0x8020, 4
    VMJumpIf CMP_EQ, L_DebugNature
    WorkCmpConst 0x8020, 5
    VMJumpIf CMP_EQ, L_DebugMakeShiny
    WorkCmpConst 0x8020, 6
    VMJumpIf CMP_EQ, L_DebugFriendship
    WorkCmpConst 0x8020, 7
    VMJumpIf CMP_EQ, L_DebugHealParty
    WorkCmpConst 0x8020, 8
    VMJumpIf CMP_EQ, L_DebugGivePokemon
    VMJump L_DebugMenu

// Before the first Pokémon, only the gift
L_DebugPartyEmpty:
    SystemMsg Global10200_Text_DebugPartyEmpty, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugGivePokemon, 65535, 8
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 8
    VMJumpIf CMP_EQ, L_DebugGivePokemon
    VMJump L_DebugMenu

L_DebugNextTarget:
    Debug DEBUG_ACTION_PARTY_NEXT, 0, 0, 0x8025
    VMJump L_DebugParty

// Set EVs...: the stats in the summary's order, with the cursor on the last one set, then the values; the 510
// total isn't enforced, so a Pokémon can be put over it to test that
L_DebugSetEVs:
    WorkSetConst 0x8023, DEBUG_STAT_HP

L_DebugSetEVsList:
    Debug DEBUG_ACTION_PARTY_WORDS, 0, 0, 0x8025
    SystemMsg Global10200_Text_DebugSetEVsTitle, 2
    ListMenuAnchorTopRight 31, 1, 0x8023, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugStatHp, 65535, DEBUG_STAT_HP
    ListMenuAdd Global10200_Text_DebugStatAttack, 65535, DEBUG_STAT_ATTACK
    ListMenuAdd Global10200_Text_DebugStatDefense, 65535, DEBUG_STAT_DEFENSE
    ListMenuAdd Global10200_Text_DebugStatSpAttack, 65535, DEBUG_STAT_SP_ATTACK
    ListMenuAdd Global10200_Text_DebugStatSpDefense, 65535, DEBUG_STAT_SP_DEFENSE
    ListMenuAdd Global10200_Text_DebugStatSpeed, 65535, DEBUG_STAT_SPEED
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, DEBUG_STAT_SPEED
    VMJumpIf CMP_GT, L_DebugParty
    WorkSet 0x8023, 0x8020
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugValue0, 65535, 0
    ListMenuAdd Global10200_Text_DebugValue128, 65535, 128
    ListMenuAdd Global10200_Text_DebugValue252, 65535, 252
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 252
    VMJumpIf CMP_GT, L_DebugSetEVsList
    Debug DEBUG_ACTION_PARTY_SET_EV, 0x8023, 0x8020, 0x8025
    SEPlay SEQ_SE_SELECT1
    SystemMsg Global10200_Text_DebugSetEVsDone, 2
    LastKeyWait
    VMJump L_DebugSetEVsList

// Set IVs...: the same, with All for the six at once
L_DebugSetIVs:
    WorkSetConst 0x8023, DEBUG_STAT_HP

L_DebugSetIVsList:
    Debug DEBUG_ACTION_PARTY_WORDS, 0, 0, 0x8025
    SystemMsg Global10200_Text_DebugSetIVsTitle, 2
    ListMenuAnchorTopRight 31, 1, 0x8023, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugStatHp, 65535, DEBUG_STAT_HP
    ListMenuAdd Global10200_Text_DebugStatAttack, 65535, DEBUG_STAT_ATTACK
    ListMenuAdd Global10200_Text_DebugStatDefense, 65535, DEBUG_STAT_DEFENSE
    ListMenuAdd Global10200_Text_DebugStatSpAttack, 65535, DEBUG_STAT_SP_ATTACK
    ListMenuAdd Global10200_Text_DebugStatSpDefense, 65535, DEBUG_STAT_SP_DEFENSE
    ListMenuAdd Global10200_Text_DebugStatSpeed, 65535, DEBUG_STAT_SPEED
    ListMenuAdd Global10200_Text_DebugStatAll, 65535, DEBUG_STAT_ALL
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, DEBUG_STAT_ALL
    VMJumpIf CMP_GT, L_DebugParty
    WorkSet 0x8023, 0x8020
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugValue0, 65535, 0
    ListMenuAdd Global10200_Text_DebugValue15, 65535, 15
    ListMenuAdd Global10200_Text_DebugValue31, 65535, 31
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 31
    VMJumpIf CMP_GT, L_DebugSetIVsList
    Debug DEBUG_ACTION_PARTY_SET_IV, 0x8023, 0x8020, 0x8025
    SEPlay SEQ_SE_SELECT1
    SystemMsg Global10200_Text_DebugSetIVsDone, 2
    LastKeyWait
    VMJump L_DebugSetIVsList

// Set level...: the experience of the level's start and the stats; the moves stay
L_DebugSetLevel:
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_LEVEL, 0, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugParty
    Debug DEBUG_ACTION_PARTY_SET_LEVEL, 0, 0, 0x8025
    Debug DEBUG_ACTION_PARTY_WORDS, 0, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    SystemMsg Global10200_Text_DebugSetLevelDone, 2
    LastKeyWait
    VMJump L_DebugParty

// Nature...: by its number, with its name
L_DebugNature:
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_NATURE, 0, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugParty
    Debug DEBUG_ACTION_PARTY_SET_NATURE, 0, 0, 0x8025
    Debug DEBUG_ACTION_PARTY_WORDS, 0, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    SystemMsg Global10200_Text_DebugNatureDone, 2
    LastKeyWait
    VMJump L_DebugParty

L_DebugMakeShiny:
    Debug DEBUG_ACTION_PARTY_MAKE_SHINY, 0, 0, 0x8025
    WorkCmpConst 0x8025, DEBUG_SHINY_ALREADY
    VMJumpIf CMP_EQ, L_DebugShinyAlready
    WorkCmpConst 0x8025, DEBUG_SHINY_EGG
    VMJumpIf CMP_EQ, L_DebugShinyEgg
    SEPlay SEQ_SE_SELECT1
    SystemMsg Global10200_Text_DebugShinyDone, 2
    LastKeyWait
    VMJump L_DebugParty

L_DebugShinyAlready:
    SystemMsg Global10200_Text_DebugShinyAlready, 2
    LastKeyWait
    VMJump L_DebugParty

L_DebugShinyEgg:
    SystemMsg Global10200_Text_DebugShinyEgg, 2
    LastKeyWait
    VMJump L_DebugParty

L_DebugFriendship:
    WorkSetConst 0x8023, 0
    SystemMsg Global10200_Text_DebugFriendshipTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugValue0, 65535, 0
    ListMenuAdd Global10200_Text_DebugValue70, 65535, 70
    ListMenuAdd Global10200_Text_DebugValue255, 65535, 255
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 255
    VMJumpIf CMP_GT, L_DebugParty
    Debug DEBUG_ACTION_PARTY_SET_FRIENDSHIP, 0x8020, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    SystemMsg Global10200_Text_DebugFriendshipDone, 2
    LastKeyWait
    VMJump L_DebugParty

L_DebugHealParty:
    Debug DEBUG_ACTION_PARTY_HEAL, 0, 0, 0x8025
    SEPlay SEQ_SE_RECOVERY
    SystemMsg Global10200_Text_DebugHealDone, 2
    LastKeyWait
    VMJump L_DebugParty

// Give Pokémon...: the species, then the level, to the party, or the PC with the party full
L_DebugGivePokemon:
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_SPECIES, 0, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugParty
    WorkSet 0x8026, 0x8025
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_LEVEL, 0, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugParty
    Debug DEBUG_ACTION_GIVE_POKEMON, 0x8026, 0, 0x8025
    WorkCmpConst 0x8025, DEBUG_GIVE_BOX
    VMJumpIf CMP_EQ, L_DebugGiveBox
    WorkCmpConst 0x8025, DEBUG_GIVE_FULL
    VMJumpIf CMP_EQ, L_DebugGiveFull
    SEPlay SEQ_SE_SELECT1
    SystemMsg Global10200_Text_DebugGiveParty, 2
    LastKeyWait
    VMJump L_DebugParty

L_DebugGiveBox:
    SEPlay SEQ_SE_SELECT1
    SystemMsg Global10200_Text_DebugGiveBox, 2
    LastKeyWait
    VMJump L_DebugParty

L_DebugGiveFull:
    SystemMsg Global10200_Text_DebugGiveFull, 2
    LastKeyWait
    VMJump L_DebugParty

// Items...
L_DebugItems:
    SystemMsg Global10200_Text_DebugItemsTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugGiveItem, 65535, 0
    ListMenuAdd Global10200_Text_DebugGiveKeyItems, 65535, 1
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 0
    VMJumpIf CMP_EQ, L_DebugGiveItem
    WorkCmpConst 0x8020, 1
    VMJumpIf CMP_EQ, L_DebugGiveKeyItems
    VMJump L_DebugMenu

// Give item...: the item, then how many
L_DebugGiveItem:
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_ITEM, 0, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugItems
    WorkSet 0x8026, 0x8025
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_COUNT, 0, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugItems
    Debug DEBUG_ACTION_GIVE_ITEM, 0x8026, 0, 0x8025
    WorkCmpConst 0x8025, 0
    VMJumpIf CMP_EQ, L_DebugGiveItemFull
    SEPlay SEQ_SE_SELECT1
    SystemMsg Global10200_Text_DebugGiveItemDone, 2
    LastKeyWait
    VMJump L_DebugItems

L_DebugGiveItemFull:
    SystemMsg Global10200_Text_DebugGiveItemFull, 2
    LastKeyWait
    VMJump L_DebugItems

L_DebugGiveKeyItems:
    Debug DEBUG_ACTION_GIVE_KEY_ITEMS, 0, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    SystemMsg Global10200_Text_DebugGiveKeyItemsDone, 2
    LastKeyWait
    VMJump L_DebugItems

// World...: the overrides with their states, and the flags and variables
L_DebugWorld:
    Debug DEBUG_ACTION_WORLD_WORDS, 0, 0, 0x8025
    SystemMsg Global10200_Text_DebugWorldTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugTime, 65535, 0
    ListMenuAdd Global10200_Text_DebugSeason, 65535, 1
    ListMenuAdd Global10200_Text_DebugWeather, 65535, 2
    ListMenuAdd Global10200_Text_DebugFlags, 65535, 3
    ListMenuAdd Global10200_Text_DebugVars, 65535, 4
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 0
    VMJumpIf CMP_EQ, L_DebugTime
    WorkCmpConst 0x8020, 1
    VMJumpIf CMP_EQ, L_DebugSeason
    WorkCmpConst 0x8020, 2
    VMJumpIf CMP_EQ, L_DebugWeather
    WorkCmpConst 0x8020, 3
    VMJumpIf CMP_EQ, L_DebugFlags
    WorkCmpConst 0x8020, 4
    VMJumpIf CMP_EQ, L_DebugVars
    VMJump L_DebugMenu

// Time: Off, or a DAY_PERIOD_* + 1
L_DebugTime:
    SystemMsg Global10200_Text_DebugTimeTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugOff, 65535, 0
    ListMenuAdd Global10200_Text_DebugPeriodMorning, 65535, 1
    ListMenuAdd Global10200_Text_DebugPeriodDay, 65535, 2
    ListMenuAdd Global10200_Text_DebugPeriodEvening, 65535, 3
    ListMenuAdd Global10200_Text_DebugPeriodNight, 65535, 4
    ListMenuAdd Global10200_Text_DebugPeriodLateNight, 65535, 5
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 5
    VMJumpIf CMP_GT, L_DebugWorld
    Debug DEBUG_ACTION_SET_DAY_PERIOD, 0x8020, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    VMJump L_DebugWorld

// Season: Off, which sets the mode a lock replaced again, or a season + 1
L_DebugSeason:
    SystemMsg Global10200_Text_DebugSeasonTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugOff, 65535, 0
    ListMenuAdd Global10200_Text_DebugModeSpring, 65535, 1
    ListMenuAdd Global10200_Text_DebugModeSummer, 65535, 2
    ListMenuAdd Global10200_Text_DebugModeAutumn, 65535, 3
    ListMenuAdd Global10200_Text_DebugModeWinter, 65535, 4
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 4
    VMJumpIf CMP_GT, L_DebugWorld
    Debug DEBUG_ACTION_SET_SEASON, 0x8020, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    VMJump L_DebugWorld

// Weather: Off, or a WEATHER_* + 1, WEATHER_SUNNY to WEATHER_DIAMOND_DUST; the tints are left out
L_DebugWeather:
    SystemMsg Global10200_Text_DebugWeatherTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugOff, 65535, 0
    ListMenuAdd Global10200_Text_DebugWeatherClear, 65535, 1
    ListMenuAdd Global10200_Text_DebugWeatherSnow, 65535, 2
    ListMenuAdd Global10200_Text_DebugWeatherRain, 65535, 3
    ListMenuAdd Global10200_Text_DebugWeatherSandstorm, 65535, 4
    ListMenuAdd Global10200_Text_DebugWeatherSnowstorm, 65535, 5
    ListMenuAdd Global10200_Text_DebugWeatherFlutter, 65535, 6
    ListMenuAdd Global10200_Text_DebugWeatherThunderstorm, 65535, 7
    ListMenuAdd Global10200_Text_DebugWeatherHeavyRain, 65535, 8
    ListMenuAdd Global10200_Text_DebugWeatherDiamondDust, 65535, 9
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 9
    VMJumpIf CMP_GT, L_DebugWorld
    Debug DEBUG_ACTION_SET_WEATHER, 0x8020, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    VMJump L_DebugWorld

// Flag get/set...: the flag's number, then its state with Set and Clear
L_DebugFlags:
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_FLAG, 0, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugWorld

L_DebugFlagState:
    Debug DEBUG_ACTION_FLAG_GET, 0, 0, 0x8025
    SystemMsg Global10200_Text_DebugFlagState, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugFlagSet, 65535, 1
    ListMenuAdd Global10200_Text_DebugFlagClear, 65535, 0
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 1
    VMJumpIf CMP_GT, L_DebugWorld
    Debug DEBUG_ACTION_FLAG_SET, 0x8020, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    VMJump L_DebugFlagState

// Variable get/set...: the variable's number (0x4000 to 0x41ae, the save's), then its value, which Change value
// enters
L_DebugVars:
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_VAR, 0, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugWorld
    WorkSet 0x8026, 0x8025

L_DebugVarState:
    Debug DEBUG_ACTION_VAR_GET, 0x8026, 0, 0x8025
    SystemMsg Global10200_Text_DebugVarState, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugVarChange, 65535, 0
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 0
    VMJumpIf CMP_NE, L_DebugWorld
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_VALUE, 0x8025, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugVarState
    Debug DEBUG_ACTION_VAR_SET, 0x8026, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    VMJump L_DebugVarState

// Encounters...: the toggles, which flip their flags and show the list again, and the overrides, whose 0 is Off
L_DebugEncounters:
    Debug DEBUG_ACTION_FLAG_WORD, 0, EVENT_FLAG_DEBUG_ALWAYS_SHINY, 0x8025
    Debug DEBUG_ACTION_FLAG_WORD, 1, EVENT_FLAG_DEBUG_NO_WILD_ENCOUNTERS, 0x8025
    Debug DEBUG_ACTION_ENCOUNTER_WORDS, 0, 0, 0x8025
    SystemMsg Global10200_Text_DebugEncountersTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugAlwaysShiny, 65535, 0
    ListMenuAdd Global10200_Text_DebugNoWildEncounters, 65535, 1
    ListMenuAdd Global10200_Text_DebugForceSpecies, 65535, 2
    ListMenuAdd Global10200_Text_DebugWildLevel, 65535, 3
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 0
    VMJumpIf CMP_EQ, L_DebugToggleAlwaysShiny
    WorkCmpConst 0x8020, 1
    VMJumpIf CMP_EQ, L_DebugToggleNoWild
    WorkCmpConst 0x8020, 2
    VMJumpIf CMP_EQ, L_DebugForceSpecies
    WorkCmpConst 0x8020, 3
    VMJumpIf CMP_EQ, L_DebugWildLevel
    VMJump L_DebugMenu

L_DebugToggleAlwaysShiny:
    Debug DEBUG_ACTION_FLAG_TOGGLE, EVENT_FLAG_DEBUG_ALWAYS_SHINY, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    VMJump L_DebugEncounters

L_DebugToggleNoWild:
    Debug DEBUG_ACTION_FLAG_TOGGLE, EVENT_FLAG_DEBUG_NO_WILD_ENCOUNTERS, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    VMJump L_DebugEncounters

L_DebugForceSpecies:
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_WILD_SPECIES, 0, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugEncounters
    Debug DEBUG_ACTION_SET_WILD_SPECIES, 0, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    VMJump L_DebugEncounters

L_DebugWildLevel:
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_WILD_LEVEL, 0, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugEncounters
    Debug DEBUG_ACTION_SET_WILD_LEVEL, 0, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    VMJump L_DebugEncounters

// Player...: the warps end the script, and the map change follows it
L_DebugPlayer:
    Debug DEBUG_ACTION_FLAG_WORD, 0, EVENT_FLAG_DEBUG_WALK_THROUGH_WALLS, 0x8025
    SystemMsg Global10200_Text_DebugPlayerTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugWarpCenter, 65535, 0
    ListMenuAdd Global10200_Text_DebugWarpZone, 65535, 1
    ListMenuAdd Global10200_Text_DebugWalkThroughWalls, 65535, 2
    ListMenuAdd Global10200_Text_DebugMoney, 65535, 3
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 0
    VMJumpIf CMP_EQ, L_DebugWarpCenter
    WorkCmpConst 0x8020, 1
    VMJumpIf CMP_EQ, L_DebugWarpZone
    WorkCmpConst 0x8020, 2
    VMJumpIf CMP_EQ, L_DebugToggleWalls
    WorkCmpConst 0x8020, 3
    VMJumpIf CMP_EQ, L_DebugMoney
    VMJump L_DebugMenu

L_DebugWarpCenter:
    SystemMsgClose
    Debug DEBUG_ACTION_WARP_LAST_CENTER, 0, 0, 0x8025
    ActorsUnpauseAll
    VMHalt

// Warp to zone...: to the zone's fly spot; a zone without one says so
L_DebugWarpZone:
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_ZONE, 0, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugPlayer
    Debug DEBUG_ACTION_WARP_ZONE, 0, 0, 0x8025
    WorkCmpConst 0x8025, 0
    VMJumpIf CMP_EQ, L_DebugNoFlySpot
    SystemMsgClose
    ActorsUnpauseAll
    VMHalt

L_DebugNoFlySpot:
    SystemMsg Global10200_Text_DebugNoFlySpot, 2
    LastKeyWait
    VMJump L_DebugPlayer

L_DebugToggleWalls:
    Debug DEBUG_ACTION_FLAG_TOGGLE, EVENT_FLAG_DEBUG_WALK_THROUGH_WALLS, 0, 0x8025
    SEPlay SEQ_SE_SELECT1
    VMJump L_DebugPlayer

// Money...: set to a number, or 100000 more
L_DebugMoney:
    SystemMsg Global10200_Text_DebugMoneyTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugMoneySet, 65535, 0
    ListMenuAdd Global10200_Text_DebugMoneyAdd, 65535, 1
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 0
    VMJumpIf CMP_EQ, L_DebugMoneySet
    WorkCmpConst 0x8020, 1
    VMJumpIf CMP_EQ, L_DebugMoneyAdd
    VMJump L_DebugPlayer

L_DebugMoneySet:
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_MONEY, 0, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugMoney
    Debug DEBUG_ACTION_MONEY_SET, 0, 0, 0x8025
    VMJump L_DebugMoneyDone

L_DebugMoneyAdd:
    Debug DEBUG_ACTION_MONEY_ADD_THOUSANDS, 100, 0, 0x8025

L_DebugMoneyDone:
    SEPlay SEQ_SE_SELECT1
    SystemMsg Global10200_Text_DebugMoneyDone, 2
    LastKeyWait
    VMJump L_DebugMoney

// Info: the zone, the position, the season, the time, the weather and the follower, on a grid or on rails
L_DebugInfo:
    Debug DEBUG_ACTION_INFO, 0, 0, 0x8025
    WorkCmpConst 0x8025, 1
    VMJumpIf CMP_EQ, L_DebugInfoRail
    SystemMsg Global10200_Text_DebugInfoGrid, 2
    LastKeyWait
    VMJump L_DebugMenu

L_DebugInfoRail:
    SystemMsg Global10200_Text_DebugInfoRail, 2
    LastKeyWait
    VMJump L_DebugMenu

// Conditions: the conditions' context (the world, then the lead and the party with the seeds), each debug sample's
// match (res/paperwhite2/conditions/debug_samples.json), three a message, then the samples' pick
L_DebugConditions:
    Debug DEBUG_ACTION_CONDITIONS_WORLD, 0, 0, 0x8025
    SystemMsg Global10200_Text_DebugConditionsWorld, 2
    LastKeyWait
    Debug DEBUG_ACTION_CONDITIONS_PARTY, 0, 0, 0x8025
    SystemMsg Global10200_Text_DebugConditionsParty, 2
    LastKeyWait
    WorkSetConst 0x8026, 0

L_DebugConditionsRules:
    Debug DEBUG_ACTION_CONDITIONS_RULES, 0x8026, 0, 0x8025
    WorkCmpConst 0x8025, 0
    VMJumpIf CMP_EQ, L_DebugConditionsPick
    WorkCmpConst 0x8025, 1
    VMJumpIf CMP_EQ, L_DebugConditionsRules1
    WorkCmpConst 0x8025, 2
    VMJumpIf CMP_EQ, L_DebugConditionsRules2
    SystemMsg Global10200_Text_DebugConditionsRules3, 2
    LastKeyWait
    WorkAdd 0x8026, 3
    VMJump L_DebugConditionsRules

L_DebugConditionsRules1:
    SystemMsg Global10200_Text_DebugConditionsRules1, 2
    LastKeyWait
    VMJump L_DebugConditionsPick

L_DebugConditionsRules2:
    SystemMsg Global10200_Text_DebugConditionsRules2, 2
    LastKeyWait

L_DebugConditionsPick:
    Debug DEBUG_ACTION_CONDITIONS_PICK, 0, 0, 0x8025
    SystemMsg Global10200_Text_DebugConditionsPick, 2
    LastKeyWait
    VMJump L_DebugMenu

// Follower...: the Following Pokémon's steps and waiting item, a pickup now, and the rules that would be chosen now
L_DebugFollower:
    Debug DEBUG_ACTION_FOLLOWER_WORDS, 0, 0, 0x8025
    WorkCmpConst 0x8025, 0
    VMJumpIf CMP_EQ, L_DebugFollowerAbsent
    SystemMsg Global10200_Text_DebugFollowerTitle, 2
    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8020
    ListMenuAdd Global10200_Text_DebugFollowerShow, 65535, 0
    ListMenuAdd Global10200_Text_DebugFollowerSetSteps, 65535, 1
    ListMenuAdd Global10200_Text_DebugFollowerPickup, 65535, 2
    ListMenuAdd Global10200_Text_DebugFollowerClearItem, 65535, 3
    ListMenuAdd Global10200_Text_DebugFollowerRules, 65535, 4
    ListMenuAdd Global10200_Text_DebugBack, 65535, DEBUG_LIST_BACK
    ListMenuShow
    WorkCmpConst 0x8020, 0
    VMJumpIf CMP_EQ, L_DebugFollowerShow
    WorkCmpConst 0x8020, 1
    VMJumpIf CMP_EQ, L_DebugFollowerSetSteps
    WorkCmpConst 0x8020, 2
    VMJumpIf CMP_EQ, L_DebugFollowerPickup
    WorkCmpConst 0x8020, 3
    VMJumpIf CMP_EQ, L_DebugFollowerClearItem
    WorkCmpConst 0x8020, 4
    VMJumpIf CMP_EQ, L_DebugFollowerRules
    VMJump L_DebugMenu

L_DebugFollowerAbsent:
    SystemMsg Global10200_Text_DebugFollowerAbsent, 2
    LastKeyWait
    VMJump L_DebugMenu

L_DebugFollowerShow:
    Debug DEBUG_ACTION_FOLLOWER_WORDS, 0, 0, 0x8025
    SystemMsg Global10200_Text_DebugFollowerRecord, 2
    LastKeyWait
    VMJump L_DebugFollower

// Set steps...: a value, which the record keeps up to 4095
L_DebugFollowerSetSteps:
    Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_VALUE, 100, 0x8025
    VMCall L_DebugNumber
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_DebugFollower
    Debug DEBUG_ACTION_FOLLOWER_SET_STEPS, 0, 0, 0x8025
    VMJump L_DebugFollowerDone

L_DebugFollowerPickup:
    Debug DEBUG_ACTION_FOLLOWER_PICKUP, 0, 0, 0x8025
    WorkCmpConst 0x8025, 0
    VMJumpIf CMP_EQ, L_DebugFollowerNothing
    SEPlay SEQ_SE_SELECT1
    SystemMsg Global10200_Text_DebugFollowerFound, 2
    LastKeyWait
    VMJump L_DebugFollower

L_DebugFollowerNothing:
    SystemMsg Global10200_Text_DebugFollowerNothing, 2
    LastKeyWait
    VMJump L_DebugFollower

L_DebugFollowerClearItem:
    Debug DEBUG_ACTION_FOLLOWER_CLEAR_ITEM, 0, 0, 0x8025

L_DebugFollowerDone:
    SEPlay SEQ_SE_SELECT1
    SystemMsg Global10200_Text_DebugFollowerDone, 2
    LastKeyWait
    VMJump L_DebugFollower

L_DebugFollowerRules:
    Debug DEBUG_ACTION_FOLLOWER_RULES, 0, 0, 0x8025
    SystemMsg Global10200_Text_DebugFollowerRule, 2
    LastKeyWait
    VMJump L_DebugFollower
#endif
