#include "asm/field_script.inc"
#include "text/script/global_10105.h"
#ifdef PAPERWHITE2
#include "constants/natures.h"
#include "paperwhite2/pokemon_center.h"
#endif

// Script plugin 13, from the only plugin whose commands it decodes with

    ScriptEntry Script_1
    ScriptEntriesEnd
    WorkSetConst 0x8020, 0
    WorkSetConst 0x8021, 0

Script_1:
#ifdef PAPERWHITE2
    // Paper White 2: the Global Terminal's counter (the right of the three upstairs) is Training Services', in every
    // Pokémon Center: one attendant with a scrolling list of services, each for a party Pokémon, that the original
    // game spreads over its towns or doesn't have. Every price and requirement is res/paperwhite2/pokemon_center/
    // services.json's training (paperwhite2/pokemon_center.h's fees), and each is paid in full before the change, or
    // for the Name Rater and the Move Relearner only once it happened. docs/paperwhite2/design/pokemon-center.md
    // The variables: 0x8020 the service, 0x8021 the Pokémon's slot, 0x8022 whether one was picked, 0x8023 a Yes/No,
    // 0x8024 an action's result, 0x8025 a choice of a list, 0x8026 a loop's value, 0x8027 a fee, 0x8028 a value.
    // Word 0 is the Pokémon's name; word 2 is the money window's too (MoneyWinDisp and MoneyWinUpdate write it), so
    // it holds only what a message shows before the money changes or the window comes back
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    MoneyWinDisp 31, 1
    PokemonCenter POKEMON_CENTER_ACTION_GET_CHAMPION_DISCOUNT, 0, 4, 0x8024
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_TrainingGreet
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingDiscount, 0x8011, 4, 0

L_TrainingGreet:
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingWelcome, 0x8011, 4, 0

L_TrainingMenu:
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8020
    ListMenuAdd Global10105_Text_TrainingMenuNameRater, 65535, 0
    ListMenuAdd Global10105_Text_TrainingMenuRelearner, 65535, 1
    ListMenuAdd Global10105_Text_TrainingMenuDeleter, 65535, 2
    ListMenuAdd Global10105_Text_TrainingMenuHyper, 65535, 3
    ListMenuAdd Global10105_Text_TrainingMenuEffort, 65535, 4
    ListMenuAdd Global10105_Text_TrainingMenuAbility, 65535, 5
    ListMenuAdd Global10105_Text_TrainingMenuGrooming, 65535, 6
    ListMenuAdd Global10105_Text_TrainingMenuBall, 65535, 7
    ListMenuAdd Global10105_Text_TrainingMenuNature, 65535, 8
    ListMenuAdd Global10105_Text_Cancel, 65535, 9
    ListMenuShow
    WorkCmpConst 0x8020, 0
    VMJumpIf CMP_NE, L_TrainingChoseNot0
    VMCall L_TrainingNameRater
    VMJump L_TrainingAgain

L_TrainingChoseNot0:
    WorkCmpConst 0x8020, 1
    VMJumpIf CMP_NE, L_TrainingChoseNot1
    VMCall L_TrainingRelearner
    VMJump L_TrainingAgain

L_TrainingChoseNot1:
    WorkCmpConst 0x8020, 2
    VMJumpIf CMP_NE, L_TrainingChoseNot2
    VMCall L_TrainingDeleter
    VMJump L_TrainingAgain

L_TrainingChoseNot2:
    WorkCmpConst 0x8020, 3
    VMJumpIf CMP_NE, L_TrainingChoseNot3
    VMCall L_TrainingHyper
    VMJump L_TrainingAgain

L_TrainingChoseNot3:
    WorkCmpConst 0x8020, 4
    VMJumpIf CMP_NE, L_TrainingChoseNot4
    VMCall L_TrainingEffort
    VMJump L_TrainingAgain

L_TrainingChoseNot4:
    WorkCmpConst 0x8020, 5
    VMJumpIf CMP_NE, L_TrainingChoseNot5
    VMCall L_TrainingAbility
    VMJump L_TrainingAgain

L_TrainingChoseNot5:
    WorkCmpConst 0x8020, 6
    VMJumpIf CMP_NE, L_TrainingChoseNot6
    VMCall L_TrainingGroom
    VMJump L_TrainingAgain

L_TrainingChoseNot6:
    WorkCmpConst 0x8020, 7
    VMJumpIf CMP_NE, L_TrainingChoseNot7
    VMCall L_TrainingBall
    VMJump L_TrainingAgain

L_TrainingChoseNot7:
    WorkCmpConst 0x8020, 8
    VMJumpIf CMP_NE, L_TrainingBye
    VMCall L_TrainingNature

L_TrainingAgain:
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingAnythingElse, 0x8011, 4, 0
    VMJump L_TrainingMenu

L_TrainingBye:
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingBye, 0x8011, 4, 0
    LastKeyWait
    ActorMsgClose
    MoneyWinClose
    WorkSetConst 0x8020, 0
    WorkSetConst 0x8021, 0
    WorkSetConst 0x8022, 0
    WorkSetConst 0x8023, 0
    WorkSetConst 0x8024, 0
    WorkSetConst 0x8025, 0
    WorkSetConst 0x8026, 0
    WorkSetConst 0x8027, 0
    WorkSetConst 0x8028, 0
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

// After the message that asks for one, opens the party screen: 0x8022 is 1 when a Pokémon that isn't an Egg was
// picked, its slot 0x8021 and its name in word 0
L_TrainingPick:
    ActorMsgClose
    CallPokeSelect 0, 0x8022, 0x8021, 0
    MoneyWinDisp 31, 1
    WorkCmpConst 0x8022, 0
    VMJumpIf CMP_EQ, L_TrainingPicked
    WorkSetConst 0x8022, 1
    WordSetPartyPokeName 0, 0x8021
    PokePartyIsEgg 0x8024, 0x8021
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_NE, L_TrainingPicked
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingEgg, 0x8011, 4, 0
    WorkSetConst 0x8022, 0

L_TrainingPicked:
    VMReturn

// Asks Yes or No, and with Yes pays fee 0x8027: 0x8024 is 1 when it was paid. Too little money says so
L_TrainingAskPay:
    YesNoWin 0x8023
    WorkSetConst 0x8024, 0
    WorkCmpConst 0x8023, 0
    VMJumpIf CMP_NE, L_TrainingAskPayDone
    PokemonCenter POKEMON_CENTER_ACTION_PAY_FEE, 0x8027, 0, 0x8024
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_EQ, L_TrainingAskPayPaid
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingNoMoney, 0x8011, 4, 0
    VMReturn

L_TrainingAskPayPaid:
    MoneyWinUpdate
    SEPlay SEQ_SE_SYS_22

L_TrainingAskPayDone:
    VMReturn

// 0x8024 is 1 when the player has fee 0x8027, else it says the fee is too much
L_TrainingHasFee:
    PokemonCenter POKEMON_CENTER_ACTION_HAS_FEE, 0x8027, 0, 0x8024
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_EQ, L_TrainingHasFeeDone
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, 0x8027, 1, 0x8028
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingNeedFee, 0x8011, 4, 0

L_TrainingHasFeeDone:
    VMReturn

// The Name Rater's rename screen (global_2225.s), paid only when the name changed. Pokémon of another Trainer keep
// their names, as the Name Rater's do
L_TrainingNameRater:
    WorkSetConst 0x8027, POKEMON_CENTER_FEE_NAME_RATER
    VMCall L_TrainingHasFee
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_NE, L_TrainingNameDone
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingNameWhich, 0x8011, 4, 0
    VMCall L_TrainingPick
    WorkCmpConst 0x8022, 1
    VMJumpIf CMP_NE, L_TrainingNameDone
    PokePartyIsOriginGame 0x8024, 0x8021
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_NE, L_TrainingNameOwn
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingNameForeign, 0x8011, 4, 0
    VMReturn

L_TrainingNameOwn:
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, POKEMON_CENTER_FEE_NAME_RATER, 1, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingNameCost, 0x8011, 4, 0
    YesNoWin 0x8023
    WorkCmpConst 0x8023, 0
    VMJumpIf CMP_NE, L_TrainingNameDone
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingNameGo, 0x8011, 4, 0
    ActorMsgClose
    CallPokeNameInput 0x8024, 0x8021, 1
    MoneyWinDisp 31, 1
    WordSetPartyPokeName 0, 0x8021
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_NE, L_TrainingNameChanged
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingNameSame, 0x8011, 4, 0
    VMReturn

L_TrainingNameChanged:
    PokemonCenter POKEMON_CENTER_ACTION_PAY_FEE, POKEMON_CENTER_FEE_NAME_RATER, 0, 0x8024
    MoneyWinUpdate
    SEPlay SEQ_SE_SYS_22
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingNameDone, 0x8011, 4, 0

L_TrainingNameDone:
    VMReturn

// The Move Relearner's screen (global_2260.s's Script_2), for its item and money, taken only when a move was learned
L_TrainingRelearner:
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_RELEARNER_FEE, 0, 3, 0x8024
    PokemonCenter POKEMON_CENTER_ACTION_HAS_RELEARNER_FEE, 0, 0, 0x8024
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_EQ, L_TrainingRelearnerPick
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingRelearnerFee, 0x8011, 4, 0
    VMReturn

L_TrainingRelearnerPick:
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingRelearnerWhich, 0x8011, 4, 0
    VMCall L_TrainingPick
    WorkCmpConst 0x8022, 1
    VMJumpIf CMP_NE, L_TrainingRelearnerDone
    MoveReminderCheckPkm 0x8024, 0x8021
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_NE, L_TrainingRelearnerHasMoves
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingRelearnerNone, 0x8011, 4, 0
    VMReturn

L_TrainingRelearnerHasMoves:
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingRelearnerCost, 0x8011, 4, 0
    YesNoWin 0x8023
    WorkCmpConst 0x8023, 0
    VMJumpIf CMP_NE, L_TrainingRelearnerDone
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingRelearnerChoose, 0x8011, 4, 0
    ActorMsgClose
    MoveReminderCallMoveSelect 0x8024, 0x8021
    MoneyWinDisp 31, 1
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_TrainingRelearnerLearned
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingRelearnerCancel, 0x8011, 4, 0
    VMReturn

L_TrainingRelearnerLearned:
    PokemonCenter POKEMON_CENTER_ACTION_PAY_RELEARNER_FEE, 0, 0, 0x8024
    MoneyWinUpdate
    SEPlay SEQ_SE_SYS_22
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingRelearnerPaid, 0x8011, 4, 0

L_TrainingRelearnerDone:
    VMReturn

// The Move Deleter's screen (global_2260.s's Script_1), which can delete HMs too, for a Pokémon that knows two moves
// or more
L_TrainingDeleter:
    WorkSetConst 0x8027, POKEMON_CENTER_FEE_MOVE_DELETER
    VMCall L_TrainingHasFee
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_NE, L_TrainingDeleterDone
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingDeleterWhich, 0x8011, 4, 0
    VMCall L_TrainingPick
    WorkCmpConst 0x8022, 1
    VMJumpIf CMP_NE, L_TrainingDeleterDone
    PokePartyGetMoveCount 0x8024, 0x8021
    WorkCmpConst 0x8024, 2
    VMJumpIf CMP_GE, L_TrainingDeleterMoves
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingDeleterOneMove, 0x8011, 4, 0
    VMReturn

L_TrainingDeleterMoves:
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingDeleterChoose, 0x8011, 4, 0
    ActorMsgClose
    CallPokeMoveReplace 0x8024, 0x8025, 0x8021, 0
    MoneyWinDisp 31, 1
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_NE, L_TrainingDeleterDone
    PokePartyGetMove 0x8026, 0x8021, 0x8025
    WordSetMoveName 1, 0x8026
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, POKEMON_CENTER_FEE_MOVE_DELETER, 2, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingDeleterCost, 0x8011, 4, 0
    VMCall L_TrainingAskPay
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_NE, L_TrainingDeleterDone
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingDeleterDone, 0x8011, 4, 0
    MEPlay SEQ_ME_WASURE
    MEWait
    PokePartyLearnMove 0x8021, 0x8025, 0

L_TrainingDeleterDone:
    VMReturn

// One stat's IV to 31, for Battle Points, after the Hall of Fame and for a Pokémon of the least level. The Battle
// Points show in the money window's place meanwhile, and the money comes back after
L_TrainingHyper:
    PokemonCenter POKEMON_CENTER_ACTION_BP_WIN_DISP, 31, 1, 0x8024
    VMCall L_TrainingHyperService
    MoneyWinDisp 31, 1
    VMReturn

L_TrainingHyperService:
    // The Champion's check comes first, so the lead stands in for the Pokémon not yet picked
    PokemonCenter POKEMON_CENTER_ACTION_CHECK_HYPER_TRAINING, 0, 0, 0x8024
    WorkCmpConst 0x8024, HYPER_TRAINING_NOT_CHAMPION
    VMJumpIf CMP_NE, L_TrainingHyperPick
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingHyperChampion, 0x8011, 4, 0
    VMReturn

L_TrainingHyperPick:
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingHyperWhich, 0x8011, 4, 0
    VMCall L_TrainingPick
    PokemonCenter POKEMON_CENTER_ACTION_BP_WIN_DISP, 31, 1, 0x8024
    WorkCmpConst 0x8022, 1
    VMJumpIf CMP_NE, L_TrainingHyperDone
    PokemonCenter POKEMON_CENTER_ACTION_CHECK_HYPER_TRAINING, 0x8021, 0, 0x8024
    WorkCmpConst 0x8024, HYPER_TRAINING_LEVEL_LOW
    VMJumpIf CMP_NE, L_TrainingHyperLevelOk
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingHyperLevel, 0x8011, 4, 0
    VMReturn

L_TrainingHyperLevelOk:
    WorkCmpConst 0x8024, HYPER_TRAINING_ALL_MAX
    VMJumpIf CMP_NE, L_TrainingHyperStats
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingHyperAllMax, 0x8011, 4, 0
    VMReturn

L_TrainingHyperStats:
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, POKEMON_CENTER_FEE_HYPER_TRAINING, 2, 0x8024
    PokemonCenter POKEMON_CENTER_ACTION_GET_BP, 0, 0, 0x8028
    WordSetNumber 3, 0x8028, 5
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingHyperChoose, 0x8011, 4, 0
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8025
    WorkSetConst 0x8026, TRAINING_STAT_HP

L_TrainingHyperList:
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_STAT, 0x8026, 4, 0x8024
    PokemonCenter POKEMON_CENTER_ACTION_GET_IV, 0x8021, 0x8026, 0x8024
    WorkCmpConst 0x8024, 31
    VMJumpIf CMP_LT, L_TrainingHyperListOpen
    ListMenuAdd Global10105_Text_TrainingHyperStatMax, 65535, 0x8026
    VMJump L_TrainingHyperListNext

L_TrainingHyperListOpen:
    ListMenuAdd Global10105_Text_TrainingHyperStat, 65535, 0x8026

L_TrainingHyperListNext:
    WorkAdd 0x8026, 1
    WorkCmpConst 0x8026, TRAINING_STAT_ALL
    VMJumpIf CMP_LT, L_TrainingHyperList
    ListMenuAdd Global10105_Text_Cancel, 65535, TRAINING_STAT_ALL
    ListMenuShow
    WorkCmpConst 0x8025, TRAINING_STAT_ALL
    VMJumpIf CMP_GE, L_TrainingHyperDone
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_STAT, 0x8025, 4, 0x8024
    PokemonCenter POKEMON_CENTER_ACTION_GET_IV, 0x8021, 0x8025, 0x8024
    WorkCmpConst 0x8024, 31
    VMJumpIf CMP_LT, L_TrainingHyperAsk
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingHyperStatIsMax, 0x8011, 4, 0
    VMReturn

L_TrainingHyperAsk:
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingHyperCost, 0x8011, 4, 0
    YesNoWin 0x8023
    WorkCmpConst 0x8023, 0
    VMJumpIf CMP_NE, L_TrainingHyperDone
    PokemonCenter POKEMON_CENTER_ACTION_PAY_BP, POKEMON_CENTER_FEE_HYPER_TRAINING, 0, 0x8024
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_EQ, L_TrainingHyperPaid
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingHyperNoBP, 0x8011, 4, 0
    VMReturn

L_TrainingHyperPaid:
    PokemonCenter POKEMON_CENTER_ACTION_BP_WIN_DISP, 31, 1, 0x8024
    SEPlay SEQ_SE_SYS_22
    PokemonCenter POKEMON_CENTER_ACTION_MAX_IV, 0x8021, 0x8025, 0x8024
    PokePartyGetSpecies 0x8026, 0x8021
    PokePartyGetForme 0x8028, 0x8021
    PokeVoicePlay 0x8026, 0x8028
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingHyperDone, 0x8011, 4, 0

L_TrainingHyperDone:
    VMReturn

// Resets one stat's EVs or all, each with its fee, and recalculates the stats
L_TrainingEffort:
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingEffortWhich, 0x8011, 4, 0
    VMCall L_TrainingPick
    WorkCmpConst 0x8022, 1
    VMJumpIf CMP_NE, L_TrainingEffortDone
    PokemonCenter POKEMON_CENTER_ACTION_GET_EV, 0x8021, TRAINING_STAT_ALL, 0x8024
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_NE, L_TrainingEffortStats
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingEffortNone, 0x8011, 4, 0
    VMReturn

L_TrainingEffortStats:
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, POKEMON_CENTER_FEE_EFFORT_ONE, 1, 0x8024
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, POKEMON_CENTER_FEE_EFFORT_ALL, 2, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingEffortChoose, 0x8011, 4, 0
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8025
    ListMenuAdd Global10105_Text_TrainingEffortAll, 65535, TRAINING_STAT_ALL
    WorkSetConst 0x8026, TRAINING_STAT_HP

L_TrainingEffortList:
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_STAT, 0x8026, 4, 0x8024
    ListMenuAdd Global10105_Text_TrainingHyperStat, 65535, 0x8026
    WorkAdd 0x8026, 1
    WorkCmpConst 0x8026, TRAINING_STAT_ALL
    VMJumpIf CMP_LT, L_TrainingEffortList
    ListMenuAdd Global10105_Text_Cancel, 65535, 7
    ListMenuShow
    WorkCmpConst 0x8025, TRAINING_STAT_ALL
    VMJumpIf CMP_GT, L_TrainingEffortDone
    VMJumpIf CMP_EQ, L_TrainingEffortAll
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_STAT, 0x8025, 4, 0x8024
    PokemonCenter POKEMON_CENTER_ACTION_GET_EV, 0x8021, 0x8025, 0x8024
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_NE, L_TrainingEffortOne
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingEffortStatZero, 0x8011, 4, 0
    VMReturn

L_TrainingEffortOne:
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingEffortCostOne, 0x8011, 4, 0
    WorkSetConst 0x8027, POKEMON_CENTER_FEE_EFFORT_ONE
    VMCall L_TrainingAskPay
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_NE, L_TrainingEffortDone
    PokemonCenter POKEMON_CENTER_ACTION_RESET_EV, 0x8021, 0x8025, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingEffortDoneOne, 0x8011, 4, 0
    VMReturn

L_TrainingEffortAll:
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingEffortCostAll, 0x8011, 4, 0
    WorkSetConst 0x8027, POKEMON_CENTER_FEE_EFFORT_ALL
    VMCall L_TrainingAskPay
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_NE, L_TrainingEffortDone
    PokemonCenter POKEMON_CENTER_ACTION_RESET_EV, 0x8021, TRAINING_STAT_ALL, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingEffortDoneAll, 0x8011, 4, 0

L_TrainingEffortDone:
    VMReturn

// Swaps the two normal abilities, or gives the hidden one, each with its fee
L_TrainingAbility:
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingAbilityWhich, 0x8011, 4, 0
    VMCall L_TrainingPick
    WorkCmpConst 0x8022, 1
    VMJumpIf CMP_NE, L_TrainingAbilityDone
    // Its ability's name, in word 1
    PokemonCenter POKEMON_CENTER_ACTION_CHECK_ABILITY, 0x8021, ABILITY_CHANGE_SWAP, 0x8024
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, POKEMON_CENTER_FEE_ABILITY_SWAP, 3, 0x8024
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, POKEMON_CENTER_FEE_ABILITY_HIDDEN, 4, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingAbilityChoose, 0x8011, 4, 0
    ListMenuAnchorTopRight 31, 5, 0, 1, 0x8025
    ListMenuAdd Global10105_Text_TrainingAbilitySwap, 65535, ABILITY_CHANGE_SWAP
    ListMenuAdd Global10105_Text_TrainingAbilityHidden, 65535, ABILITY_CHANGE_HIDDEN
    ListMenuAdd Global10105_Text_Cancel, 65535, 2
    ListMenuShow
    WorkCmpConst 0x8025, ABILITY_CHANGE_HIDDEN
    VMJumpIf CMP_GT, L_TrainingAbilityDone
    PokemonCenter POKEMON_CENTER_ACTION_CHECK_ABILITY, 0x8021, 0x8025, 0x8024
    WorkSetConst 0x8028, Global10105_Text_TrainingAbilityOnlyOne
    WorkCmpConst 0x8024, ABILITY_RESULT_ONLY_ONE
    VMJumpIf CMP_EQ, L_TrainingAbilityRefuse
    WorkSetConst 0x8028, Global10105_Text_TrainingAbilityHasHidden
    WorkCmpConst 0x8024, ABILITY_RESULT_HAS_HIDDEN
    VMJumpIf CMP_EQ, L_TrainingAbilityRefuse
    WorkSetConst 0x8028, Global10105_Text_TrainingAbilityNoHidden
    WorkCmpConst 0x8024, ABILITY_RESULT_NO_HIDDEN
    VMJumpIf CMP_EQ, L_TrainingAbilityRefuse
    WorkSetConst 0x8028, Global10105_Text_TrainingAbilityAlready
    WorkCmpConst 0x8024, ABILITY_RESULT_ALREADY_HIDDEN
    VMJumpIf CMP_EQ, L_TrainingAbilityRefuse
    WorkSetConst 0x8028, Global10105_Text_TrainingAbilitySex
    WorkCmpConst 0x8024, ABILITY_RESULT_OK
    VMJumpIf CMP_NE, L_TrainingAbilityRefuse
    WorkSetConst 0x8027, POKEMON_CENTER_FEE_ABILITY_SWAP
    WorkSetConst 0x8028, Global10105_Text_TrainingAbilityCostSwap
    WorkCmpConst 0x8025, ABILITY_CHANGE_SWAP
    VMJumpIf CMP_EQ, L_TrainingAbilityAsk
    WorkSetConst 0x8027, POKEMON_CENTER_FEE_ABILITY_HIDDEN
    WorkSetConst 0x8028, Global10105_Text_TrainingAbilityCostHidden

L_TrainingAbilityAsk:
    ActorMsg MSGFILE_SCRIPT, 0x8028, 0x8011, 4, 0
    VMCall L_TrainingAskPay
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_NE, L_TrainingAbilityDone
    PokemonCenter POKEMON_CENTER_ACTION_CHANGE_ABILITY, 0x8021, 0x8025, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingAbilityDone, 0x8011, 4, 0
    VMReturn

L_TrainingAbilityRefuse:
    ActorMsg MSGFILE_SCRIPT, 0x8028, 0x8011, 4, 0

L_TrainingAbilityDone:
    VMReturn

// Raises friendship by a grooming course, to at most 255
L_TrainingGroom:
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingGroomWhich, 0x8011, 4, 0
    VMCall L_TrainingPick
    WorkCmpConst 0x8022, 1
    VMJumpIf CMP_NE, L_TrainingGroomDone
    PokemonCenter POKEMON_CENTER_ACTION_GET_FRIENDSHIP, 0x8021, 0, 0x8024
    WorkCmpConst 0x8024, 255
    VMJumpIf CMP_LT, L_TrainingGroomCourses
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingGroomMax, 0x8011, 4, 0
    VMReturn

L_TrainingGroomCourses:
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, POKEMON_CENTER_FEE_GROOMING, 1, 0x8024
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, POKEMON_CENTER_FEE_GROOMING_2, 2, 0x8024
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, POKEMON_CENTER_FEE_GROOMING_3, 3, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingGroomChoose, 0x8011, 4, 0
    ListMenuAnchorTopRight 31, 5, 0, 1, 0x8025
    ListMenuAdd Global10105_Text_TrainingGroomBrush, 65535, 0
    ListMenuAdd Global10105_Text_TrainingGroomDeluxe, 65535, 1
    ListMenuAdd Global10105_Text_TrainingGroomRoyal, 65535, 2
    ListMenuAdd Global10105_Text_Cancel, 65535, 3
    ListMenuShow
    WorkCmpConst 0x8025, 2
    VMJumpIf CMP_GT, L_TrainingGroomDone
    WorkSetConst 0x8027, POKEMON_CENTER_FEE_GROOMING
    WorkAdd 0x8027, 0x8025
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, 0x8027, 5, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingGroomCost, 0x8011, 4, 0
    VMCall L_TrainingAskPay
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_NE, L_TrainingGroomDone
    PokemonCenter POKEMON_CENTER_ACTION_GROOM, 0x8021, 0x8025, 0x8024
    PokePartyGetSpecies 0x8026, 0x8021
    PokePartyGetForme 0x8028, 0x8021
    PokeVoicePlay 0x8026, 0x8028
    WorkSetConst 0x8028, Global10105_Text_TrainingGroomDoneBrush
    WorkAdd 0x8028, 0x8025
    ActorMsg MSGFILE_SCRIPT, 0x8028, 0x8011, 4, 0

L_TrainingGroomDone:
    VMReturn

// Moves the Pokémon into a Poké Ball of the bag, which is taken, and the old one is gone
L_TrainingBall:
    PokemonCenter POKEMON_CENTER_ACTION_NEXT_BALL, 0, 0, 0x8024
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_NE, L_TrainingBallFee
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingBallNone, 0x8011, 4, 0
    VMReturn

L_TrainingBallFee:
    WorkSetConst 0x8027, POKEMON_CENTER_FEE_BALL_CHANGE
    VMCall L_TrainingHasFee
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_NE, L_TrainingBallDone
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingBallWhich, 0x8011, 4, 0
    VMCall L_TrainingPick
    WorkCmpConst 0x8022, 1
    VMJumpIf CMP_NE, L_TrainingBallDone
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingBallChoose, 0x8011, 4, 0
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8025
    WorkSetConst 0x8026, 0

L_TrainingBallList:
    PokemonCenter POKEMON_CENTER_ACTION_NEXT_BALL, 0x8026, 0, 0x8026
    WorkCmpConst 0x8026, 0
    VMJumpIf CMP_EQ, L_TrainingBallListed
    WordSetItemName 4, 0x8026
    ListMenuAdd Global10105_Text_TrainingBallEntry, 65535, 0x8026
    VMJump L_TrainingBallList

L_TrainingBallListed:
    ListMenuAdd Global10105_Text_Cancel, 65535, 0
    ListMenuShow
    WorkCmpConst 0x8025, 0
    VMJumpIf CMP_EQ, L_TrainingBallDone
    WorkCmpConst 0x8025, 0xfffe
    VMJumpIf CMP_EQ, L_TrainingBallDone
    WordSetItemName 4, 0x8025
    PokemonCenter POKEMON_CENTER_ACTION_IS_BALL, 0x8021, 0x8025, 0x8024
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_TrainingBallAsk
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingBallSame, 0x8011, 4, 0
    VMReturn

L_TrainingBallAsk:
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, POKEMON_CENTER_FEE_BALL_CHANGE, 1, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingBallCost, 0x8011, 4, 0
    WorkSetConst 0x8027, POKEMON_CENTER_FEE_BALL_CHANGE
    VMCall L_TrainingAskPay
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_NE, L_TrainingBallDone
    PokemonCenter POKEMON_CENTER_ACTION_SET_BALL, 0x8021, 0x8025, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingBallDone, 0x8011, 4, 0

L_TrainingBallDone:
    VMReturn

// Changes the nature, its own field, and recalculates the stats
L_TrainingNature:
    WorkSetConst 0x8027, POKEMON_CENTER_FEE_NATURE_CHANGE
    VMCall L_TrainingHasFee
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_NE, L_TrainingNatureDone
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingNatureWhich, 0x8011, 4, 0
    VMCall L_TrainingPick
    WorkCmpConst 0x8022, 1
    VMJumpIf CMP_NE, L_TrainingNatureDone
    PokemonCenter POKEMON_CENTER_ACTION_GET_NATURE, 0x8021, 0, 0x8028
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_NATURE, 0x8028, 1, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingNatureChoose, 0x8011, 4, 0
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8025
    WorkSetConst 0x8026, NATURE_HARDY

L_TrainingNatureList:
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_NATURE, 0x8026, 4, 0x8024
    WorkCmpWork 0x8026, 0x8028
    VMJumpIf CMP_EQ, L_TrainingNatureListNow
    ListMenuAdd Global10105_Text_TrainingNatureEntry, 65535, 0x8026
    VMJump L_TrainingNatureListNext

L_TrainingNatureListNow:
    ListMenuAdd Global10105_Text_TrainingNatureEntryNow, 65535, 0x8026

L_TrainingNatureListNext:
    WorkAdd 0x8026, 1
    WorkCmpConst 0x8026, NATURE_QUIRKY
    VMJumpIf CMP_LE, L_TrainingNatureList
    ListMenuAdd Global10105_Text_Cancel, 65535, 0x8026
    ListMenuShow
    WorkCmpConst 0x8025, NATURE_QUIRKY
    VMJumpIf CMP_GT, L_TrainingNatureDone
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_NATURE, 0x8025, 4, 0x8024
    WorkCmpWork 0x8025, 0x8028
    VMJumpIf CMP_NE, L_TrainingNatureAsk
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingNatureSame, 0x8011, 4, 0
    VMReturn

L_TrainingNatureAsk:
    PokemonCenter POKEMON_CENTER_ACTION_WORD_SET_FEE, POKEMON_CENTER_FEE_NATURE_CHANGE, 2, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingNatureCost, 0x8011, 4, 0
    VMCall L_TrainingAskPay
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_NE, L_TrainingNatureDone
    PokemonCenter POKEMON_CENTER_ACTION_SET_NATURE, 0x8021, 0x8025, 0x8024
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_TrainingNatureDone, 0x8011, 4, 0

L_TrainingNatureDone:
    VMReturn
    .balign 4, 0
#else
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMCall L_0047
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_0026:
    ActorMsgClose
    GameCommCheckDSiWiFi 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0045
    RTCallGlobal 2005
    VMReturn

L_0045:
    VMReturn

L_0047:
    WorkSetConst 0x8022, 0
    WorkSetConst 0x8023, 0
    WorkSetConst 0x8024, 0
    WorkSetConst 0x8025, 0
    VMStackPushFlag EVENT_FLAG_0x006a
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0084
    // "Sorry, we're getting things ready.\nPlease come back later."
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_SorryWereGettingThings, 0x8011, 4, 0
    LastKeyWait
    ActorMsgClose
    VMReturn

L_0084:
    PokePartyGetCount 0x8022, 4
    VMStackPush 0x8022
    VMStackPushConst 0
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_00AF
    // "You have at least one Pokémon\nthat can't be taken in."
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_HaveLeastOnePokemon, 0x8011, 4, 0
    LastKeyWait
    ActorMsgClose
    VMReturn

L_00AF:
    // "Welcome to the Global Terminal![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_WelcomeGlobalTerminal, 0x8011, 4, 0
    WorkSetConst 0x8023, 0
    WorkSetConst 0x8024, 1

L_00C7:
    VMStackPush 0x8024
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_029B
    WorkCmpConst 0x8023, 0
    VMJumpIf CMP_EQ, L_00ED
    VMJump L_010B

L_00ED:
    // "Would you like to use\nNintendo Wi-Fi Connection?"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_WouldLikeUseNintendo, 0x8011, 4, 0
    VMCall L_02B5
    WorkGet 0x8023, 0x8020
    VMJump L_0295

L_010B:
    WorkCmpConst 0x8023, 1
    VMJumpIf CMP_EQ, L_011E
    VMJump L_0163

L_011E:
    ItemCheckAmount ITEM_VS_RECORDER, 1, 0x8025
    VMStackPush 0x8025
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_014B
    // "In the Global Terminal, you can battle or\ntrade Pokémon with Pokémon fans from[f000]븀\u0000\naround the world by connecting to[f000]븀\u0000\nNintendo Wi-Fi Connection.[f000]븁\u0000\nFor details, please listen to the\nexplanation at each facility.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_GlobalTerminalCanBattle, 0x8011, 4, 0
    VMJump L_0157

L_014B:
    // "In the Global Terminal, you can\ntrade Pokémon with Pokémon fans from[f000]븀\u0000\naround the world by connecting to[f000]븀\u0000\nNintendo Wi-Fi Connection.[f000]븁\u0000\nFor details, please listen to the\nexplanation at each facility.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_GlobalTerminalCanTrade, 0x8011, 4, 0

L_0157:
    WorkSetConst 0x8023, 0
    VMJump L_0295

L_0163:
    WorkCmpConst 0x8023, 2
    VMJumpIf CMP_EQ, L_0176
    VMJump L_0188

L_0176:
    VMCall L_03A6
    WorkGet 0x8023, 0x8020
    VMJump L_0295

L_0188:
    WorkCmpConst 0x8023, 3
    VMJumpIf CMP_EQ, L_019B
    VMJump L_01AD

L_019B:
    VMCall L_0A70
    WorkGet 0x8023, 0x8020
    VMJump L_0295

L_01AD:
    WorkCmpConst 0x8023, 4
    VMJumpIf CMP_EQ, L_01C0
    VMJump L_01D2

L_01C0:
    VMCall L_13E4
    WorkGet 0x8023, 0x8020
    VMJump L_0295

L_01D2:
    WorkCmpConst 0x8023, 5
    VMJumpIf CMP_EQ, L_01E5
    VMJump L_01F7

L_01E5:
    VMCall L_14A8
    WorkGet 0x8023, 0x8020
    VMJump L_0295

L_01F7:
    WorkCmpConst 0x8023, 10
    VMJumpIf CMP_EQ, L_020A
    VMJump L_0222

L_020A:
    // "Please do visit again."
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_PleaseVisitAgain, 0x8011, 4, 0
    WorkSetConst 0x8023, 12
    VMJump L_0295

L_0222:
    WorkCmpConst 0x8023, 11
    VMJumpIf CMP_EQ, L_0235
    VMJump L_024D

L_0235:
    // "Communication error."
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_CommunicationError, 0x8011, 4, 0
    WorkSetConst 0x8023, 12
    VMJump L_0295

L_024D:
    WorkCmpConst 0x8023, 12
    VMJumpIf CMP_EQ, L_0260
    VMJump L_0270

L_0260:
    LastKeyWait
    ActorMsgClose
    WorkSetConst 0x8024, 0
    VMJump L_0295

L_0270:
    WorkCmpConst 0x8023, 13
    VMJumpIf CMP_EQ, L_0283
    VMJump L_028F

L_0283:
    WorkSetConst 0x8024, 0
    VMJump L_0295

L_028F:
    WorkSetConst 0x8024, 0

L_0295:
    VMJump L_00C7

L_029B:
    WorkSetConst 0x8025, 0
    WorkSetConst 0x8024, 0
    WorkSetConst 0x8023, 0
    WorkSetConst 0x8022, 0
    VMReturn

L_02B5:
    WorkSetConst 0x8026, 0
    WorkSetConst 0x8027, 0
    WorkSetConst 0x8028, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32806
    ItemCheckAmount ITEM_PROP_CASE, 1, 0x8027
    ItemCheckAmount ITEM_VS_RECORDER, 1, 0x8028
    VMStackPush 0x8028
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_02FB
    ListMenuAdd 9, 65535, 2

L_02FB:
    ListMenuAdd 10, 65535, 3
    VMStackPush 0x8027
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackPush 0x8028
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_032E
    ListMenuAdd 11, 65535, 4

L_032E:
    VMStackPush 0x8028
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0349
    ListMenuAdd 12, 65535, 5

L_0349:
    ListMenuAdd 13, 65535, 1
    ListMenuAdd 14, 65535, 10
    ListMenuShow
    VMStackPush 0x8026
    VMStackPushConst 65534
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_037A
    WorkSetConst 0x8020, 10
    VMJump L_0380

L_037A:
    WorkGet 0x8020, 0x8026

L_0380:
    WorkSetConst 0x8028, 0
    WorkSetConst 0x8027, 0
    WorkSetConst 0x8026, 0
    VMReturn
    WorkSetConst 0x8029, 0
    WorkSetConst 0x802a, 0
    WorkSetConst 0x802b, 0

L_03A6:
    WorkSetConst 0x802c, 0
    WorkSetConst 0x802d, 0
    WorkSetConst 0x802e, 0
    WorkSetConst 0x802d, 0
    WorkSetConst 0x802e, 1

L_03C4:
    VMStackPush 0x802e
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_055B
    WorkCmpConst 0x802d, 0
    VMJumpIf CMP_EQ, L_03EA
    VMJump L_0408

L_03EA:
    // "Would you like to take the\nRandom Matchup challenge?"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_WouldLikeTakeRandom, 0x8011, 4, 0
    VMCall L_056F
    WorkGet 0x802d, 0x8020
    VMJump L_0555

L_0408:
    WorkCmpConst 0x802d, 4
    VMJumpIf CMP_EQ, L_041B
    VMJump L_042D

L_041B:
    VMCall L_05C5
    WorkGet 0x802d, 0x8020
    VMJump L_0555

L_042D:
    WorkCmpConst 0x802d, 1
    VMJumpIf CMP_EQ, L_0440
    VMJump L_0452

L_0440:
    VMCall L_06F5
    WorkGet 0x802d, 0x8020
    VMJump L_0555

L_0452:
    WorkCmpConst 0x802d, 2
    VMJumpIf CMP_EQ, L_0465
    VMJump L_0477

L_0465:
    VMCall L_07FC
    WorkGet 0x802d, 0x8020
    VMJump L_0555

L_0477:
    WorkCmpConst 0x802d, 3
    VMJumpIf CMP_EQ, L_048A
    VMJump L_049C

L_048A:
    VMCall L_08AD
    WorkGet 0x802d, 0x8020
    VMJump L_0555

L_049C:
    WorkCmpConst 0x802d, 252
    VMJumpIf CMP_EQ, L_04AF
    VMJump L_04C1

L_04AF:
    WorkSetConst 0x8020, 11
    WorkSetConst 0x802e, 0
    VMJump L_0555

L_04C1:
    WorkCmpConst 0x802d, 254
    VMJumpIf CMP_EQ, L_04D4
    VMJump L_04E6

L_04D4:
    WorkSetConst 0x8020, 0
    WorkSetConst 0x802e, 0
    VMJump L_0555

L_04E6:
    WorkCmpConst 0x802d, 255
    VMJumpIf CMP_EQ, L_04F9
    VMJump L_050B

L_04F9:
    WorkSetConst 0x8020, 10
    WorkSetConst 0x802e, 0
    VMJump L_0555

L_050B:
    WorkCmpConst 0x802d, 251
    VMJumpIf CMP_EQ, L_051E
    VMJump L_0530

L_051E:
    WorkSetConst 0x8020, 12
    WorkSetConst 0x802e, 0
    VMJump L_0555

L_0530:
    WorkCmpConst 0x802d, 253
    VMJumpIf CMP_EQ, L_0543
    VMJump L_0555

L_0543:
    WorkSetConst 0x8020, 13
    WorkSetConst 0x802e, 0
    VMJump L_0555

L_0555:
    VMJump L_03C4

L_055B:
    WorkSetConst 0x802e, 0
    WorkSetConst 0x802d, 0
    WorkSetConst 0x802c, 0
    VMReturn

L_056F:
    WorkSetConst 0x802f, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32815
    ListMenuAdd 54, 65535, 1
    ListMenuAdd 55, 65535, 4
    ListMenuAdd 56, 65535, 254
    ListMenuShow
    VMStackPush 0x802f
    VMStackPushConst 65534
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_05B7
    WorkSetConst 0x8020, 254
    VMJump L_05BD

L_05B7:
    WorkGet 0x8020, 0x802f

L_05BD:
    WorkSetConst 0x802f, 0
    VMReturn

L_05C5:
    WorkSetConst 0x8030, 0
    WorkSetConst 0x8031, 0
    WorkSetConst 0x8032, 0
    // "A Random Matchup is a battle with other\nPokémon fans from around the world.[f000]븁\u0000\nThere are five kinds of Random Matchups:\nSingle, Double, Triple, Rotation,[f000]븀\u0000\nand Launcher.[f000]븁\u0000\nAlso, Random Matchups have two modes:\nFree mode and Rating mode.[f000]븁\u0000\nIn Free mode, everyone can participate\nin battles freely.[f000]븁\u0000\nIn Rating mode, you may participate in\nbattles after you set Game Sync, access[f000]븀\u0000\nthe Pokémon Global Link website with your[f000]븀\u0000\ncomputer, and register your[f000]븀\u0000\nGame Sync ID.[f000]븁\u0000\nhttp://www.pokemon-gl.com/\n(Pokémon Global Link)[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_RandomMatchupBattleOther, 0x8011, 4, 0
    WorkSetConst 0x8031, 1

L_05E9:
    VMStackPush 0x8031
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_06DB
    // "Would you like to know more details?"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_WouldLikeKnowMore, 0x8011, 4, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32816
    ListMenuAdd 59, 65535, 0
    ListMenuAdd 60, 65535, 1
    ListMenuAdd 61, 65535, 2
    ListMenuAdd 99, 65535, 3
    ListMenuAdd 62, 65535, 4
    ListMenuShow
    WorkCmpConst 0x8030, 0
    VMJumpIf CMP_EQ, L_064E
    VMJump L_0660

L_064E:
    // "Free mode is for casual battles against\nother Pokémon fans around the world.[f000]븁\u0000\nFeel free to challenge it![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_FreeModeCasualBattles, 0x8011, 4, 0
    VMJump L_06D5

L_0660:
    WorkCmpConst 0x8030, 1
    VMJumpIf CMP_EQ, L_0673
    VMJump L_0685

L_0673:
    // "Rating mode is recommended for those who\nwant to master battles.[f000]븁\u0000\nWhen communication is established, you\nare likely to battle against a person with[f000]븀\u0000\na similar Rating.[f000]븁\u0000\nYour Rating starts at 1500. When you win,\nit goes up. When you lose, it goes down.[f000]븁\u0000\nSo the higher your Rating is, the\nstronger you are as a Trainer![f000]븁\u0000\nThere's one thing you should be careful\nabout in Rating mode.[f000]븁\u0000\nYour record and Rating will be erased if\nyou connect to Nintendo Wi-Fi Connection[f000]븀\u0000\nwith a different DS System.[f000]븁\u0000\nSo please be careful if you switch![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_RatingModeRecommendedThose, 0x8011, 4, 0
    VMJump L_06D5

L_0685:
    WorkCmpConst 0x8030, 2
    VMJumpIf CMP_EQ, L_0698
    VMJump L_06AA

L_0698:
    // "There are several special rules\nfor Random Matchups.[f000]븁\u0000\nAny Pokémon higher than Lv. 50 will be\nset to that level for the battle.[f000]븁\u0000\nPokémon nicknames won't be used.[f000]븁\u0000\nYou have a limited time to choose Pokémon\nfor a battle and to give orders to your[f000]븀\u0000\nPokémon during the battle.[f000]븁\u0000\nDon't exceed the time limit,\nor your Pokémon and its moves[f000]븀\u0000\nwill be chosen for you![f000]븁\u0000\nThere's also a time limit on the battle.[f000]븁\u0000\nThe winner will be determined when time\nruns out, even if both sides still have[f000]븀\u0000\nPokémon standing.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_ThereSeveralSpecialRules, 0x8011, 4, 0
    VMJump L_06D5

L_06AA:
    WorkCmpConst 0x8030, 3
    VMJumpIf CMP_EQ, L_06BD
    VMJump L_06CF

L_06BD:
    // "Be aware that if the system is turned\noff or loses power during a[f000]븀\u0000\nWi-Fi Competition or a Random Matchup,[f000]븀\u0000\nyou cannot participate in a competition[f000]븀\u0000\nor a Random Matchup again for one hour.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_AwareIfSystemTurned, 0x8011, 4, 0
    VMJump L_06D5

L_06CF:
    WorkSetConst 0x8031, 0

L_06D5:
    VMJump L_05E9

L_06DB:
    WorkSetConst 0x8020, 0
    WorkSetConst 0x8032, 0
    WorkSetConst 0x8031, 0
    WorkSetConst 0x8030, 0
    VMReturn

L_06F5:
    WorkSetConst 0x8033, 0
    WorkSetConst 0x8034, 0
    GetMatchState 0, 0x8033
    VMStackPush 0x8033
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0753
    GetMatchState 2, 0x8033
    VMStackPush 0x8033
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_074D
    // "Since the system was turned off or lost\npower during a Wi-Fi Competition or[f000]븀\u0000\na Random Matchup, you cannot participate[f000]븀\u0000\nin a competition or a Random Matchup[f000]븀\u0000\nfor one hour.[f000]븁\u0000\nPlease come back again\nafter one hour has passed."
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_SinceSystemTurnedOff, 0x8011, 4, 0
    WorkSetConst 0x8020, 251
    VMReturn
    VMJump L_0753

L_074D:
    SetMatchState 5, 0x8033

L_0753:
    VMCall L_0026
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0774
    WorkSetConst 0x8020, 255
    VMReturn

L_0774:
    // "Which Battle would you like\nto choose?"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_WhichBattleWouldLike, 0x8011, 4, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32819
    ListMenuAdd 67, 65535, 0
    ListMenuAdd 68, 65535, 1
    ListMenuAdd 69, 65535, 2
    ListMenuAdd 70, 65535, 3
    ListMenuAdd 71, 65535, 4
    ListMenuAdd 72, 65535, 5
    ListMenuShow
    VMStackPush 0x8033
    VMStackPushConst 4
    VMStackCmp CMP_GT
    VMJumpIf CMP_STACK, L_07D6
    WorkSetConst 0x8020, 254
    VMReturn

L_07D6:
    WorkGet 0x8029, 0x8033
    WorkSetConst 0x802a, 15
    WorkAdd 0x802a, 0x8033
    WorkSetConst 0x8020, 2
    WorkSetConst 0x8034, 0
    WorkSetConst 0x8033, 0
    VMReturn

L_07FC:
    WorkSetConst 0x8035, 0
    WorkSetConst 0x8036, 0
    WorkSetConst 0x8036, 73
    WorkAdd 0x8036, 0x8029
    ActorMsg MSGFILE_SCRIPT, 0x8036, 0x8011, 4, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32821
    ListMenuAdd 78, 65535, 0
    ListMenuAdd 79, 65535, 1
    ListMenuAdd 80, 65535, 2
    ListMenuShow
    VMStackPush 0x8035
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0862
    WorkSetConst 0x8020, 3
    VMJump L_089F

L_0862:
    VMStackPush 0x8035
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0899
    WorkSetConst 0x8036, 81
    WorkAdd 0x8036, 0x8029
    ActorMsg MSGFILE_SCRIPT, 0x8036, 0x8011, 4, 0
    WorkSetConst 0x8020, 2
    VMJump L_089F

L_0899:
    WorkSetConst 0x8020, 1

L_089F:
    WorkSetConst 0x8036, 0
    WorkSetConst 0x8035, 0
    VMReturn

L_08AD:
    WorkSetConst 0x8037, 0
    WorkSetConst 0x8038, 0
    WorkSetConst 0x8039, 0
    ActorMsgClose
    CheckPartyRegulation 0x802a, 0x8037
    VMStackPush 0x8037
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_08E8
    WorkSetConst 0x8020, 254
    VMReturn
    VMJump L_0915

L_08E8:
    VMStackPush 0x8037
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0915
    VMStackPush 0x8000
    WorkSet 0x8000, 0x802a
    RTCallGlobal 10260
    VMStackPop 0x8000
    WorkSetConst 0x8020, 255
    VMReturn

L_0915:
    WorkGet 0x802b, 0x8037
    SetMatchInProgress
    SetMatchState 4, 1
    RTGetZoneID 0x8039
    FieldSetNextZone 0x8039, 1, 10, 65535, 1
    FlagSet EVENT_FLAG_CONTINUE_SCRIPT
    WorkSetConst EVENT_WORK_CONTINUE_SCRIPT, 1
    SetSoftResetBlocked 0, 0
    VMStackPush 0x8000
    VMStackPush 0x8001
    VMStackPush 0x8002
    VMStackPush 0x8003
    VMStackPush 0x8004
    VMStackPush 0x8005
    RTCallGlobal 2003
    WorkSet 0x8037, 0x8000
    VMStackPop 0x8005
    VMStackPop 0x8004
    VMStackPop 0x8003
    VMStackPop 0x8002
    VMStackPop 0x8001
    VMStackPop 0x8000
    VMStackPush 0x8037
    VMStackPushConst 0
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_09B0
    WorkSetConst 0x8020, 255
    ClearMatchInProgress
    FlagReset EVENT_FLAG_CONTINUE_SCRIPT
    WorkSetConst EVENT_WORK_CONTINUE_SCRIPT, 0
    SetMatchState 4, 0
    SetSoftResetBlocked 1, 0
    VMReturn

L_09B0:
    VMStackPush 0x8000
    RTCallGlobal 2004
    WorkSet 0x8037, 0x8000
    VMStackPop 0x8000
    VMStackPush 0x8037
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_09FB
    WorkSetConst 0x8020, 255
    ClearMatchInProgress
    FlagReset EVENT_FLAG_CONTINUE_SCRIPT
    WorkSetConst EVENT_WORK_CONTINUE_SCRIPT, 0
    SetMatchState 4, 0
    SetSoftResetBlocked 1, 0
    VMReturn
    VMJump L_0A2E

L_09FB:
    VMStackPush 0x8037
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0A2E
    WorkSetConst 0x8020, 252
    ClearMatchInProgress
    FlagReset EVENT_FLAG_CONTINUE_SCRIPT
    WorkSetConst EVENT_WORK_CONTINUE_SCRIPT, 0
    SetMatchState 4, 0
    SetSoftResetBlocked 1, 0
    VMReturn

L_0A2E:
    FunfestBGMReturn
    PokePartyRecoverAll
    VMCall L_1656
    NetConnectWiFiBattle 0x802a, 0x802b
    VMCall L_1670
    WorkSetConst 0x8020, 253
    WorkSetConst 0x8039, 0
    WorkSetConst 0x8038, 0
    WorkSetConst 0x8037, 0
    VMReturn
    WorkSetConst 0x802b, 0
    WorkSetConst 0x802a, 0
    WorkSetConst 0x8029, 0

L_0A70:
    WorkSetConst 0x803a, 0
    WorkSetConst 0x803b, 0
    WorkSetConst 0x803c, 0
    WorkSetConst 0x803b, 0
    WorkSetConst 0x803c, 1

L_0A8E:
    VMStackPush 0x803c
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0BD5
    WorkCmpConst 0x803b, 0
    VMJumpIf CMP_EQ, L_0AB4
    VMJump L_0AC6

L_0AB4:
    VMCall L_0BE9
    WorkGet 0x803b, 0x8020
    VMJump L_0BCF

L_0AC6:
    WorkCmpConst 0x803b, 3
    VMJumpIf CMP_EQ, L_0AD9
    VMJump L_0AF1

L_0AD9:
    // "You may trade Pokémon with other\nPokémon fans from around the world with[f000]븀\u0000\nGlobal Trade.[f000]븁\u0000\nGlobal Trade has two forms: GTS and\nGTS Negotiations.[f000]븁\u0000\nPlease be careful, because each has a\ndifferent way of trading.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_MayTradePokemonOther, 0x8011, 4, 0
    WorkSetConst 0x803b, 0
    VMJump L_0BCF

L_0AF1:
    WorkCmpConst 0x803b, 1
    VMJumpIf CMP_EQ, L_0B04
    VMJump L_0B16

L_0B04:
    VMCall L_0C53
    WorkGet 0x803b, 0x8020
    VMJump L_0BCF

L_0B16:
    WorkCmpConst 0x803b, 2
    VMJumpIf CMP_EQ, L_0B29
    VMJump L_0B3B

L_0B29:
    VMCall L_1043
    WorkGet 0x803b, 0x8020
    VMJump L_0BCF

L_0B3B:
    WorkCmpConst 0x803b, 254
    VMJumpIf CMP_EQ, L_0B4E
    VMJump L_0B60

L_0B4E:
    WorkSetConst 0x8020, 0
    WorkSetConst 0x803c, 0
    VMJump L_0BCF

L_0B60:
    WorkCmpConst 0x803b, 255
    VMJumpIf CMP_EQ, L_0B73
    VMJump L_0B85

L_0B73:
    WorkSetConst 0x8020, 10
    WorkSetConst 0x803c, 0
    VMJump L_0BCF

L_0B85:
    WorkCmpConst 0x803b, 252
    VMJumpIf CMP_EQ, L_0B98
    VMJump L_0BAA

L_0B98:
    WorkSetConst 0x8020, 11
    WorkSetConst 0x803c, 0
    VMJump L_0BCF

L_0BAA:
    WorkCmpConst 0x803b, 253
    VMJumpIf CMP_EQ, L_0BBD
    VMJump L_0BCF

L_0BBD:
    WorkSetConst 0x8020, 13
    WorkSetConst 0x803c, 0
    VMJump L_0BCF

L_0BCF:
    VMJump L_0A8E

L_0BD5:
    WorkSetConst 0x803c, 0
    WorkSetConst 0x803b, 0
    WorkSetConst 0x803a, 0
    VMReturn

L_0BE9:
    WorkSetConst 0x803d, 0
    // "Would you like to make a Global Trade?"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_WouldLikeMakeGlobal, 0x8011, 4, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32829
    ListMenuAdd 17, 65535, 1
    ListMenuAdd 18, 65535, 2
    ListMenuAdd 19, 65535, 3
    ListMenuAdd 20, 65535, 254
    ListMenuShow
    VMStackPush 0x803d
    VMStackPushConst 65534
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0C45
    WorkSetConst 0x8020, 254
    VMJump L_0C4B

L_0C45:
    WorkGet 0x8020, 0x803d

L_0C4B:
    WorkSetConst 0x803d, 0
    VMReturn

L_0C53:
    WorkSetConst 0x803e, 0
    WorkSetConst 0x803f, 0
    WorkSetConst 0x8040, 0
    WorkSetConst 0x803f, 0
    WorkSetConst 0x8040, 1

L_0C71:
    VMStackPush 0x8040
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0D8D
    WorkCmpConst 0x803f, 0
    VMJumpIf CMP_EQ, L_0C97
    VMJump L_0CA9

L_0C97:
    VMCall L_0DA1
    WorkGet 0x803f, 0x8020
    VMJump L_0D87

L_0CA9:
    WorkCmpConst 0x803f, 1
    VMJumpIf CMP_EQ, L_0CBC
    VMJump L_0CCE

L_0CBC:
    VMCall L_0E03
    WorkGet 0x803f, 0x8020
    VMJump L_0D87

L_0CCE:
    WorkCmpConst 0x803f, 2
    VMJumpIf CMP_EQ, L_0CE1
    VMJump L_0CF3

L_0CE1:
    VMCall L_0ECD
    WorkGet 0x803f, 0x8020
    VMJump L_0D87

L_0CF3:
    WorkCmpConst 0x803f, 252
    VMJumpIf CMP_EQ, L_0D06
    VMJump L_0D18

L_0D06:
    WorkSetConst 0x8020, 252
    WorkSetConst 0x8040, 0
    VMJump L_0D87

L_0D18:
    WorkCmpConst 0x803f, 254
    VMJumpIf CMP_EQ, L_0D2B
    VMJump L_0D3D

L_0D2B:
    WorkSetConst 0x8020, 0
    WorkSetConst 0x8040, 0
    VMJump L_0D87

L_0D3D:
    WorkCmpConst 0x803f, 255
    VMJumpIf CMP_EQ, L_0D50
    VMJump L_0D62

L_0D50:
    WorkSetConst 0x8020, 255
    WorkSetConst 0x8040, 0
    VMJump L_0D87

L_0D62:
    WorkCmpConst 0x803f, 253
    VMJumpIf CMP_EQ, L_0D75
    VMJump L_0D87

L_0D75:
    WorkSetConst 0x8020, 253
    WorkSetConst 0x8040, 0
    VMJump L_0D87

L_0D87:
    VMJump L_0C71

L_0D8D:
    WorkSetConst 0x8040, 0
    WorkSetConst 0x803f, 0
    WorkSetConst 0x803e, 0
    VMReturn

L_0DA1:
    WorkSetConst 0x8041, 0
    // "Would you like to make a GTS trade?"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_WouldLikeMakeGts, 0x8011, 4, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32833
    ListMenuAdd 22, 65535, 2
    ListMenuAdd 23, 65535, 1
    ListMenuAdd 24, 65535, 254
    ListMenuShow
    VMStackPush 0x8041
    VMStackPushConst 65534
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0DF5
    WorkSetConst 0x8020, 254
    VMJump L_0DFB

L_0DF5:
    WorkGet 0x8020, 0x8041

L_0DFB:
    WorkSetConst 0x8041, 0
    VMReturn

L_0E03:
    WorkSetConst 0x8042, 0
    WorkSetConst 0x8043, 0
    // "You may trade Pokémon in two ways when\nusing GTS.[f000]븁\u0000\nYou may offer a Pokémon for trade\nor search among offered Pokémon.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_MayTradePokemonTwo, 0x8011, 4, 0
    WorkSetConst 0x8043, 1

L_0E21:
    VMStackPush 0x8043
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0EB9
    // "Should I describe things in\ngreater detail?"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_ShouldDescribeThingsGreater, 0x8011, 4, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32834
    ListMenuAdd 29, 65535, 0
    ListMenuAdd 30, 65535, 1
    ListMenuAdd 31, 65535, 2
    ListMenuShow
    VMStackPush 0x8042
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0E88
    // "You will be asked to put up the\nPokémon you are offering to trade.[f000]븁\u0000\nAt that time, you will be asked what\nPokémon you would like in return.[f000]븁\u0000\nIf another player offers your desired\nPokémon in return for your offered[f000]븀\u0000\nPokémon, the trade will go through.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_WillAskedPutUp, 0x8011, 4, 0
    VMJump L_0EB3

L_0E88:
    VMStackPush 0x8042
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0EAD
    // "You may search among the Pokémon\nthat are offered by other Trainers.[f000]븁\u0000\nThey will all identify what Pokémon\ntheir Trainers want back in return.[f000]븁\u0000\nIf you find one that you want, you\nmust provide us with the kind of[f000]븀\u0000\nPokémon wanted in return.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_MaySearchAmongPokemon, 0x8011, 4, 0
    VMJump L_0EB3

L_0EAD:
    WorkSetConst 0x8043, 0

L_0EB3:
    VMJump L_0E21

L_0EB9:
    WorkSetConst 0x8020, 0
    WorkSetConst 0x8043, 0
    WorkSetConst 0x8042, 0
    VMReturn

L_0ECD:
    WorkSetConst 0x8044, 0
    WorkSetConst 0x8045, 0
    WorkSetConst 0x8046, 0
    BoxGetCount 0x8045, 5
    PokePartyGetCount 0x8046, 5
    VMStackPush 0x8045
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackPush 0x8046
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_0F22
    // "Uh-oh![f000]븁\u0000\nI'm sorry, but your party and all your\nPC Boxes are full.[f000]븁\u0000\nTo use the GTS, you must have\nroom in your party or in a PC Box.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_UhOhImSorry, 0x8011, 4, 0
    WorkSetConst 0x8020, 255
    VMReturn

L_0F22:
    PokePartyGetCount 0x8046, 1
    VMStackPush 0x8046
    VMStackPushConst 2
    VMStackCmp CMP_LT
    VMJumpIf CMP_STACK, L_0F4F
    // "Uh-oh![f000]븁\u0000\nYou need at least two Pokémon in your\nparty to use the GTS.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_UhOhNeedLeast, 0x8011, 4, 0
    WorkSetConst 0x8020, 255
    VMReturn

L_0F4F:
    VMCall L_0026
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0F70
    WorkSetConst 0x8020, 255
    VMReturn

L_0F70:
    VMStackPush 0x8000
    VMStackPush 0x8001
    VMStackPush 0x8002
    VMStackPush 0x8003
    VMStackPush 0x8004
    VMStackPush 0x8005
    RTCallGlobal 2003
    WorkSet 0x8044, 0x8000
    VMStackPop 0x8005
    VMStackPop 0x8004
    VMStackPop 0x8003
    VMStackPop 0x8002
    VMStackPop 0x8001
    VMStackPop 0x8000
    VMStackPush 0x8044
    VMStackPushConst 0
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_0FC5
    WorkSetConst 0x8020, 255
    VMReturn

L_0FC5:
    VMStackPush 0x8000
    RTCallGlobal 2004
    WorkSet 0x8044, 0x8000
    VMStackPop 0x8000
    VMStackPush 0x8044
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0FF8
    WorkSetConst 0x8020, 255
    VMReturn
    VMJump L_1013

L_0FF8:
    VMStackPush 0x8044
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_1013
    WorkSetConst 0x8020, 252
    VMReturn

L_1013:
    JoinAvenueRecordActivity 17
    FunfestBGMReturn
    PokePartyRecoverAll
    VMCall L_1656
    NetConnectGTS
    VMCall L_1670
    WorkSetConst 0x8020, 253
    WorkSetConst 0x8046, 0
    WorkSetConst 0x8045, 0
    WorkSetConst 0x8044, 0
    VMReturn

L_1043:
    WorkSetConst 0x8047, 0
    WorkSetConst 0x8048, 0
    WorkSetConst 0x8049, 0
    WorkSetConst 0x8048, 0
    WorkSetConst 0x8049, 1

L_1061:
    VMStackPush 0x8049
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_1189
    WorkCmpConst 0x8048, 0
    VMJumpIf CMP_EQ, L_1087
    VMJump L_10A5

L_1087:
    // "Would you like to start\nPokémon GTS Negotiations?"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_WouldLikeStartPokemon, 0x8011, 4, 0
    VMCall L_119D
    WorkGet 0x8048, 0x8020
    VMJump L_1183

L_10A5:
    WorkCmpConst 0x8048, 1
    VMJumpIf CMP_EQ, L_10B8
    VMJump L_10CA

L_10B8:
    VMCall L_11F3
    WorkGet 0x8048, 0x8020
    VMJump L_1183

L_10CA:
    WorkCmpConst 0x8048, 2
    VMJumpIf CMP_EQ, L_10DD
    VMJump L_10EF

L_10DD:
    VMCall L_12BD
    WorkGet 0x8048, 0x8020
    VMJump L_1183

L_10EF:
    WorkCmpConst 0x8048, 252
    VMJumpIf CMP_EQ, L_1102
    VMJump L_1114

L_1102:
    WorkSetConst 0x8020, 252
    WorkSetConst 0x8049, 0
    VMJump L_1183

L_1114:
    WorkCmpConst 0x8048, 254
    VMJumpIf CMP_EQ, L_1127
    VMJump L_1139

L_1127:
    WorkSetConst 0x8020, 0
    WorkSetConst 0x8049, 0
    VMJump L_1183

L_1139:
    WorkCmpConst 0x8048, 255
    VMJumpIf CMP_EQ, L_114C
    VMJump L_115E

L_114C:
    WorkSetConst 0x8020, 255
    WorkSetConst 0x8049, 0
    VMJump L_1183

L_115E:
    WorkCmpConst 0x8048, 253
    VMJumpIf CMP_EQ, L_1171
    VMJump L_1183

L_1171:
    WorkSetConst 0x8020, 253
    WorkSetConst 0x8049, 0
    VMJump L_1183

L_1183:
    VMJump L_1061

L_1189:
    WorkSetConst 0x8049, 0
    WorkSetConst 0x8048, 0
    WorkSetConst 0x8047, 0
    VMReturn

L_119D:
    WorkSetConst 0x804a, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32842
    ListMenuAdd 33, 65535, 2
    ListMenuAdd 34, 65535, 1
    ListMenuAdd 35, 65535, 254
    ListMenuShow
    VMStackPush 0x804a
    VMStackPushConst 65534
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_11E5
    WorkSetConst 0x8020, 254
    VMJump L_11EB

L_11E5:
    WorkGet 0x8020, 0x804a

L_11EB:
    WorkSetConst 0x804a, 0
    VMReturn

L_11F3:
    WorkSetConst 0x804b, 0
    WorkSetConst 0x804c, 0
    // "In GTS Negotiations, you set the trading\nconditions based on what kinds of[f000]븀\u0000\nPokémon you'd like to trade.[f000]븁\u0000\nIf you find a person with matching\nconditions, you may proceed to a[f000]븀\u0000\nNegotiation Trade with that person.[f000]븁\u0000\nIn order to trade, you need to have two\nor more Pokémon in your party.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_GtsNegotiationsSetTrading, 0x8011, 4, 0
    WorkSetConst 0x804c, 1

L_1211:
    VMStackPush 0x804c
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_12A9
    // "Should I describe things in\ngreater detail?"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_ShouldDescribeThingsGreater_2, 0x8011, 4, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32843
    ListMenuAdd 40, 65535, 0
    ListMenuAdd 41, 65535, 1
    ListMenuAdd 42, 65535, 2
    ListMenuShow
    VMStackPush 0x804b
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_1278
    // "In a Negotiation Trade, each person\noffers three Pokémon to trade.[f000]븁\u0000\nThen, each person will choose one of the\nother person's three Pokémon.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_NegotiationTradeEachPerson, 0x8011, 4, 0
    VMJump L_12A3

L_1278:
    VMStackPush 0x804b
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_129D
    // "You can set three conditions in a\nNegotiation Trade: the level of Pokémon[f000]븀\u0000\nto trade, the Pokémon you want to[f000]븀\u0000\nreceive, and the Pokémon up for offer.[f000]븁\u0000\nYou may trade with a person whose\nconditions match yours, or choose[f000]븀\u0000\nTrade Rendezvous to try another trade[f000]븀\u0000\nwith a previous trading partner.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_CanSetThreeConditions, 0x8011, 4, 0
    VMJump L_12A3

L_129D:
    WorkSetConst 0x804c, 0

L_12A3:
    VMJump L_1211

L_12A9:
    WorkSetConst 0x8020, 0
    WorkSetConst 0x804c, 0
    WorkSetConst 0x804b, 0
    VMReturn

L_12BD:
    WorkSetConst 0x804d, 0
    WorkSetConst 0x804e, 0
    PokePartyGetCount 0x804e, 1
    VMStackPush 0x804e
    VMStackPushConst 2
    VMStackCmp CMP_LT
    VMJumpIf CMP_STACK, L_12F6
    // "Uh-oh![f000]븁\u0000\nYou need at least two Pokémon in your\nparty to use GTS Negotiations.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_UhOhNeedLeast_2, 0x8011, 4, 0
    WorkSetConst 0x8020, 255
    VMReturn

L_12F6:
    VMCall L_0026
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_1317
    WorkSetConst 0x8020, 255
    VMReturn

L_1317:
    VMStackPush 0x8000
    VMStackPush 0x8001
    VMStackPush 0x8002
    VMStackPush 0x8003
    VMStackPush 0x8004
    VMStackPush 0x8005
    RTCallGlobal 2003
    WorkSet 0x804d, 0x8000
    VMStackPop 0x8005
    VMStackPop 0x8004
    VMStackPop 0x8003
    VMStackPop 0x8002
    VMStackPop 0x8001
    VMStackPop 0x8000
    VMStackPush 0x804d
    VMStackPushConst 0
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_136C
    WorkSetConst 0x8020, 255
    VMReturn

L_136C:
    VMStackPush 0x8000
    RTCallGlobal 2004
    WorkSet 0x804d, 0x8000
    VMStackPop 0x8000
    VMStackPush 0x804d
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_139F
    WorkSetConst 0x8020, 255
    VMReturn
    VMJump L_13BA

L_139F:
    VMStackPush 0x804d
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_13BA
    WorkSetConst 0x8020, 252
    VMReturn

L_13BA:
    JoinAvenueRecordActivity 18
    FunfestBGMReturn
    PokePartyRecoverAll
    VMCall L_1656
    NetConnectGTSNegotiation
    VMCall L_1670
    WorkSetConst 0x8020, 253
    WorkSetConst 0x804e, 0
    WorkSetConst 0x804d, 0
    VMReturn

L_13E4:
    WorkSetConst 0x804f, 0
    WorkSetConst 0x8050, 0
    WorkSetConst 0x8050, 1

L_13F6:
    VMStackPush 0x8050
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_149A
    // "Would you like to view or upload\nMusical Photos?"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_WouldLikeViewUpload_2, 0x8011, 4, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32847
    ListMenuAdd 50, 65535, 0
    ListMenuAdd 51, 65535, 1
    ListMenuAdd 52, 65535, 2
    ListMenuShow
    VMStackPush 0x804f
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_1463
    WorkSetConst 0x8021, 1
    VMCall L_156C
    WorkSetConst 0x8050, 0
    VMJump L_1494

L_1463:
    VMStackPush 0x804f
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_1488
    // "With Musical Photos, you may post a photo\nyou took at the Pokémon Musical in[f000]븀\u0000\nNimbasa City by using the Vs. Recorder.[f000]븁\u0000\nYou may also view photos taken by other\npeople, sorted by the Pokémon you like.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_MusicalPhotosMayPost, 0x8011, 4, 0
    VMJump L_1494

L_1488:
    WorkSetConst 0x8020, 0
    WorkSetConst 0x8050, 0

L_1494:
    VMJump L_13F6

L_149A:
    WorkSetConst 0x8050, 0
    WorkSetConst 0x804f, 0
    VMReturn

L_14A8:
    WorkSetConst 0x8051, 0
    WorkSetConst 0x8052, 0
    WorkSetConst 0x8052, 1

L_14BA:
    VMStackPush 0x8052
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_155E
    // "Would you like to view or upload\nBattle Videos?"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_WouldLikeViewUpload, 0x8011, 4, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32849
    ListMenuAdd 45, 65535, 0
    ListMenuAdd 46, 65535, 1
    ListMenuAdd 47, 65535, 2
    ListMenuShow
    VMStackPush 0x8051
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_1527
    WorkSetConst 0x8021, 0
    VMCall L_156C
    WorkSetConst 0x8052, 0
    VMJump L_1558

L_1527:
    VMStackPush 0x8051
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_154C
    // "With Battle Videos, you may post a\nBattle Video you took with your[f000]븀\u0000\nVs. Recorder or view Battle Videos from[f000]븀\u0000\nother Trainers.[f000]븁\u0000\nYou may search the Battle Videos by\nPokémon, battle facility, ranking, etc.[f000]븁\u0000\nThe Battle Video you post will be assigned\na 12-digit code.[f000]븁\u0000\nYour friends may view your Battle Video\nby entering this 12-digit code here.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_BattleVideosMayPost, 0x8011, 4, 0
    VMJump L_1558

L_154C:
    WorkSetConst 0x8020, 0
    WorkSetConst 0x8052, 0

L_1558:
    VMJump L_14BA

L_155E:
    WorkSetConst 0x8052, 0
    WorkSetConst 0x8051, 0
    VMReturn

L_156C:
    WorkSetConst 0x8053, 0
    VMCall L_0026
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_1593
    WorkSetConst 0x8020, 10
    VMReturn

L_1593:
    VMStackPush 0x8000
    VMStackPush 0x8001
    VMStackPush 0x8002
    VMStackPush 0x8003
    VMStackPush 0x8004
    VMStackPush 0x8005
    RTCallGlobal 2003
    WorkSet 0x8053, 0x8000
    VMStackPop 0x8005
    VMStackPop 0x8004
    VMStackPop 0x8003
    VMStackPop 0x8002
    VMStackPop 0x8001
    VMStackPop 0x8000
    VMStackPush 0x8053
    VMStackPushConst 0
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_15E8
    WorkSetConst 0x8020, 10
    VMReturn

L_15E8:
    VMStackPush 0x8000
    RTCallGlobal 2004
    WorkSet 0x8053, 0x8000
    VMStackPop 0x8000
    VMStackPush 0x8053
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_161B
    WorkSetConst 0x8020, 10
    VMReturn
    VMJump L_1636

L_161B:
    VMStackPush 0x8053
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_1636
    WorkSetConst 0x8020, 11
    VMReturn

L_1636:
    FunfestBGMReturn
    VMCall L_1656
    NetConnectBattleVideo 0x8021
    VMCall L_1670
    WorkSetConst 0x8020, 13
    WorkSetConst 0x8053, 0
    VMReturn

L_1656:
    // "Right this way, please.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Global10105_Text_RightWayPlease, 0x8011, 4, 0
    ActorMsgClose
    RTCallGlobal 2105
    FieldSetNextZoneHere
    FlagSet EVENT_FLAG_CONTINUE_SCRIPT
    VMReturn

L_1670:
    RTCallGlobal 2106
    VMReturn
    .balign 4, 0
#endif
