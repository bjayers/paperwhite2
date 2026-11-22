#include "asm/field_script.inc"
#include "text/script/global_10490.h"
#ifdef PAPERWHITE2
#include "constants/script_text_banks.h"
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
    ScriptEntry Script_10
    ScriptEntry Script_11
    ScriptEntry Script_12
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
    // Paper White 2: in an Entralink run, a door opens once the room is done, if a room is behind it
    // (paperwhite2/entralink_run_actions.h)
    EntralinkRun ENTRALINK_RUN_ACTION_CAN_LEAVE, ENTRALINK_RUN_NORTH_EXIT, 0, 0x8000
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
    // Paper White 2: in an Entralink run this is the exit the player came in by, which asks whether to go back to the
    // hub, ending the run (paperwhite2/entralink_run_actions.h)
    EntralinkRun ENTRALINK_RUN_ACTION_CAN_LEAVE, ENTRALINK_RUN_BACK_EXIT, 0, 0x8000
    WorkCmpConst 0x8000, ENTRALINK_RUN_EXIT_BACK
    VMJumpIf CMP_EQ, L_RunBackDoor
#endif
    ActorCmdExec 255, Movement_027C
    ActorCmdWait
    MapChangeEntreeForest 1
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
#ifdef PAPERWHITE2

L_RunBackDoor:
    // Paper White 2: Yes ends the run as a forfeit and warps to the hub; No steps the player back
    SystemMsg Global10490_Text_RunReturnToEntralink, 2
    YesNoWin 0x8000
    SystemMsgClose
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_NE, L_RunBackDoorStay
    VMCall L_RunShards
    EntralinkRun ENTRALINK_RUN_ACTION_WARP_HUB, 0, 0, 0x8000
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_RunBackDoorStay:
    ActorCmdExec 255, Movement_RunExitBack1
    ActorCmdWait
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0
#endif
    .balign 4, 0

Movement_027C:
    Move 1, 1
    MoveEnd

Script_7:
    ActorsPauseAll
#ifdef PAPERWHITE2
    // Paper White 2: in an Entralink run, a door opens once the room is done, if a room is behind it
    // (paperwhite2/entralink_run_actions.h)
    EntralinkRun ENTRALINK_RUN_ACTION_CAN_LEAVE, ENTRALINK_RUN_WEST_EXIT, 0, 0x8000
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
    // Paper White 2: in an Entralink run, a door opens once the room is done, if a room is behind it
    // (paperwhite2/entralink_run_actions.h)
    EntralinkRun ENTRALINK_RUN_ACTION_CAN_LEAVE, ENTRALINK_RUN_EAST_EXIT, 0, 0x8000
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
    // Paper White 2: an exit of an Entralink run's room before the room is done, or with no room behind it: the
    // player steps back
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

// Paper White 2: talking to an Entralink run room's NPC (script 10498, paperwhite2_entralink_run.c). A battle NPC: its
// dialogue, its cry and its battle; a win (or a capture) its after dialogue and the room open, or after the final room
// the run's end at the hub; a loss or a forfeit (running) end the run there too, with the real party and bag back. An
// item NPC: its dialogue and its item into the run's bag. A rest or buff NPC: its dialogue, or a placeholder for now.
// Step 6: the ball on the ground, the heal, revive, gift and shop NPCs, the item room's balls and the buff balls.
// Step 7: the Dream Dust a win gives, and the shop's screen
Script_9:
    ActorsPauseAll
    EntralinkRun ENTRALINK_RUN_ACTION_TALK, 0, 0, 0x8000
    // Paper White 2: an ambient has nothing to say, and doesn't turn to the player
    WorkCmpConst 0x8000, ENTRALINK_RUN_NPC_AMBIENT
    VMJumpIf CMP_EQ, L_RunNpcEnd
    ActorSetEyeToEye
    WorkCmpConst 0x8000, ENTRALINK_RUN_NPC_BATTLE
    VMJumpIf CMP_EQ, L_RunBattleNpc
    WorkCmpConst 0x8000, ENTRALINK_RUN_NPC_ITEM
    VMJumpIf CMP_EQ, L_RunItemNpc
    // Paper White 2: step 6's NPCs (paperwhite2/entralink_run_actions.h)
    WorkCmpConst 0x8000, ENTRALINK_RUN_NPC_GROUND
    VMJumpIf CMP_EQ, L_RunGiveItem
    WorkCmpConst 0x8000, ENTRALINK_RUN_NPC_HEAL
    VMJumpIf CMP_EQ, L_RunHealNpc
    WorkCmpConst 0x8000, ENTRALINK_RUN_NPC_REVIVE
    VMJumpIf CMP_EQ, L_RunReviveNpc
    WorkCmpConst 0x8000, ENTRALINK_RUN_NPC_GIFT
    VMJumpIf CMP_EQ, L_RunGiftNpc
    WorkCmpConst 0x8000, ENTRALINK_RUN_NPC_SHOP
    VMJumpIf CMP_EQ, L_RunShopNpc
    WorkCmpConst 0x8000, ENTRALINK_RUN_NPC_ITEM_CHOICE
    VMJumpIf CMP_EQ, L_RunItemChoice
    WorkCmpConst 0x8000, ENTRALINK_RUN_NPC_BUFF_CHOICE
    VMJumpIf CMP_EQ, L_RunBuffChoice
    WorkCmpConst 0x8000, ENTRALINK_RUN_NPC_SWAP
    VMJumpIf CMP_EQ, L_RunSwapNpc
    WorkCmpConst 0x8000, ENTRALINK_RUN_NPC_DONE
    VMJumpIf CMP_EQ, L_RunChoiceDone
    WorkSetConst 0x8002, 0
    VMCall L_RunDialogue
    WorkCmpConst 0x8001, ENTRALINK_RUN_NO_MESSAGE
    VMJumpIf CMP_NE, L_RunNpcDone
    SystemMsg Global10490_Text_RunNotReady, 2
    LastKeyWait
    SystemMsgClose

L_RunNpcDone:
    // Paper White 2: a rest or buff NPC talked to counts as used, which can finish a room with no battle
    EntralinkRun ENTRALINK_RUN_ACTION_NPC_USED, 0, 0, 0x8000
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_RunItemNpc:
    WorkSetConst 0x8002, 0
    VMCall L_RunDialogue

L_RunGiveItem:
    // Paper White 2: an item NPC's item, or the ball on the ground's, into the run's bag
    EntralinkRun ENTRALINK_RUN_ACTION_GET_ITEM, 0, 0, 0x8004
    EntralinkRun ENTRALINK_RUN_ACTION_GET_ITEM_COUNT, 0, 0, 0x8005
    EntralinkRun ENTRALINK_RUN_ACTION_GIVE_ITEM, 0, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunBagFull
    WordSetPlayerName 0
    WordSetItemName 1, 0x8004
    WordSetNumber 2, 0x8005, 2
    MEPlay SEQ_ME_ITEM
    WorkCmpConst 0x8005, 1
    VMJumpIf CMP_NE, L_RunFoundItems
    SystemMsg Global10490_Text_RunFoundItem, 2
    VMJump L_RunItemDone

L_RunFoundItems:
    SystemMsg Global10490_Text_RunFoundItems, 2

L_RunItemDone:
    MEWait
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_RunBagFull:
    SystemMsg Global10490_Text_RunBagFull, 2
    VMJump L_RunItemDone

L_RunHealNpc:
    // Paper White 2: a heal NPC heals every Pokémon that hasn't fainted, which is the room's choice
    WorkSetConst 0x8002, 0
    VMCall L_RunDialogue
    EntralinkRun ENTRALINK_RUN_ACTION_HEAL, 0, 0, 0x8000
    MEPlay SEQ_ME_ASA
    SystemMsg Global10490_Text_RunHealed, 2
    MEWait
    LastKeyWait
    SystemMsgClose
    EntralinkRun ENTRALINK_RUN_ACTION_MAKE_CHOICE, 0, 0, 0x8000
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_RunReviveNpc:
    // Paper White 2: a revive NPC revives a fainted Pokémon the player chooses, which is the room's choice; with none
    // fainted it says so, and leaving the party screen leaves the choice open
    WorkSetConst 0x8002, 0
    VMCall L_RunDialogue
    EntralinkRun ENTRALINK_RUN_ACTION_CAN_REVIVE, 0, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunNoneFainted

L_RunReviveSelect:
    CallPokeSelect 0, 0x8003, 0x8004, 0
    WorkCmpConst 0x8003, 0
    VMJumpIf CMP_EQ, L_RunNpcEnd
    EntralinkRun ENTRALINK_RUN_ACTION_REVIVE, 0x8004, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunNotFainted
    WordSetPartyPokeName 0, 0x8004
    SEPlay SEQ_SE_RECOVERY
    SystemMsg Global10490_Text_RunRevived, 2
    LastKeyWait
    SystemMsgClose
    EntralinkRun ENTRALINK_RUN_ACTION_MAKE_CHOICE, 0, 0, 0x8000
    VMJump L_RunNpcEnd

L_RunNotFainted:
    SystemMsg Global10490_Text_RunNotFainted, 2
    LastKeyWait
    SystemMsgClose
    VMJump L_RunReviveSelect

L_RunNoneFainted:
    SystemMsg Global10490_Text_RunNoneFainted, 2
    LastKeyWait
    SystemMsgClose

L_RunNpcEnd:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_RunGiftNpc:
    // Paper White 2: a gift NPC's choice of 3 cards in a list, items and buffs (buffs.json's gift_buff_chance); the
    // one taken, an item into the run's bag or a buff, is the room's choice, and B leaves the choice open. A full bag
    // or a gold replacement cancelled shows the cards again
    WorkSetConst 0x8002, 0
    VMCall L_RunDialogue

L_RunGiftMenu:
    SystemMsg Global10490_Text_RunGiftWhich, 2
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8000
    EntralinkRun ENTRALINK_RUN_ACTION_ADD_CARDS, ENTRALINK_RUN_CARDS_GIFT, 0, 0x8001
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8000, 65534
    VMJumpIf CMP_EQ, L_RunNpcEnd
    WorkSetConst 0x8003, ENTRALINK_RUN_CARDS_GIFT
    VMCall L_RunTakeCard
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunGiftMenu
    EntralinkRun ENTRALINK_RUN_ACTION_MAKE_CHOICE, 0, 0, 0x8000
    VMJump L_RunNpcEnd

L_RunShopNpc:
    // Paper White 2: a shop (step 7): its dialogue, then the Poké Mart's screen with the room's goods for Dream Dust,
    // bought into the run's bag, and its buffs (phase 2) in a list of their own, a choice of Items, Buffs or Leave
    // while it has buffs left. Talking to it is the room's choice, whether anything is bought or not
    WorkSetConst 0x8002, 0
    VMCall L_RunDialogue

L_RunShopMenu:
    EntralinkRun ENTRALINK_RUN_ACTION_COUNT_CARDS, ENTRALINK_RUN_CARDS_SHOP, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunShopMart
    SystemMsg Global10490_Text_RunShopWhat, 2
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8000
    ListMenuAdd Global10490_Text_RunShopItems, 65535, 0
    ListMenuAdd Global10490_Text_RunShopBuffs, 65535, 1
    ListMenuAdd Global10490_Text_RunShopLeave, 65535, 2
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8000, 1
    VMJumpIf CMP_EQ, L_RunShopBuffs
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_NE, L_RunShopDone
    CallFriendlyShopBuy ENTRALINK_RUN_SHOP_ID, 0x8000
    VMJump L_RunShopMenu

L_RunShopMart:
    CallFriendlyShopBuy ENTRALINK_RUN_SHOP_ID, 0x8000

L_RunShopDone:
    EntralinkRun ENTRALINK_RUN_ACTION_MAKE_CHOICE, 0, 0, 0x8000
    VMJump L_RunNpcEnd

L_RunShopBuffs:
    // Paper White 2: the shop's buffs with their prices; one bought (asked first) leaves the list
    EntralinkRun ENTRALINK_RUN_ACTION_GET_DUST, 1, 0, 0x8005
    WordSetNumber 0, 0x8005, 5
    SystemMsg Global10490_Text_RunShopBuffWhich, 2
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8000
    EntralinkRun ENTRALINK_RUN_ACTION_ADD_CARDS, ENTRALINK_RUN_CARDS_SHOP, 0, 0x8001
    ListMenuAdd Global10490_Text_RunShopBack, Global10490_Text_RunShopBackInfo, ENTRALINK_RUN_CARD_OTHER
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8000, 65534
    VMJumpIf CMP_EQ, L_RunShopMenu
    WorkCmpConst 0x8000, ENTRALINK_RUN_CARD_OTHER
    VMJumpIf CMP_EQ, L_RunShopMenu
    WorkSetConst 0x8003, ENTRALINK_RUN_CARDS_SHOP
    VMCall L_RunTakeCard
    VMJump L_RunShopMenu

L_RunItemChoice:
    // Paper White 2: an item room's ball: Yes takes its item into the run's bag, which is the room's choice
    EntralinkRun ENTRALINK_RUN_ACTION_GET_ITEM, 0, 0, 0x8004
    WordSetItemName 1, 0x8004
    SystemMsg Global10490_Text_RunTakeItem, 2
    YesNoWin 0x8000
    SystemMsgClose
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_NE, L_RunNpcEnd
    EntralinkRun ENTRALINK_RUN_ACTION_GIVE_ITEM, 0, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunBagFull
    WordSetPlayerName 0
    MEPlay SEQ_ME_ITEM
    SystemMsg Global10490_Text_RunFoundItem, 2
    MEWait
    LastKeyWait
    SystemMsgClose
    EntralinkRun ENTRALINK_RUN_ACTION_MAKE_CHOICE, 0, 0, 0x8000
    VMJump L_RunNpcEnd

L_RunSwapNpc:
    // Paper White 2: a swap NPC (phase 7): for Dream Dust, a Pokémon of the Reserve Box joins the team as a level 100
    // copy in place of a copy that hasn't fainted, which leaves the run; the swap is the room's choice. Refused with no
    // one to bring in, too little Dust, or every copy fainted; leaving the list or answering No leaves the choice open,
    // and B in the party screen goes back to the list
    WorkSetConst 0x8002, 0
    VMCall L_RunDialogue
    EntralinkRun ENTRALINK_RUN_ACTION_GET_DUST, 4, 0, 0x8005
    WordSetNumber 2, 0x8005, 5
    EntralinkRun ENTRALINK_RUN_ACTION_GET_DUST, 1, 0, 0x8005
    WordSetNumber 3, 0x8005, 5
    EntralinkRun ENTRALINK_RUN_ACTION_SWAP_CHECK, 0, 0, 0x8000
    WorkCmpConst 0x8000, ENTRALINK_SWAP_NONE
    VMJumpIf CMP_EQ, L_RunSwapNone
    WorkCmpConst 0x8000, ENTRALINK_SWAP_NO_DUST
    VMJumpIf CMP_EQ, L_RunSwapNoDust
    WorkCmpConst 0x8000, ENTRALINK_SWAP_ALL_FAINTED
    VMJumpIf CMP_EQ, L_RunSwapAllFainted

L_RunSwapMenu:
    EntralinkRun ENTRALINK_RUN_ACTION_GET_DUST, 4, 0, 0x8005
    WordSetNumber 2, 0x8005, 5
    EntralinkRun ENTRALINK_RUN_ACTION_GET_DUST, 1, 0, 0x8005
    WordSetNumber 3, 0x8005, 5
    SystemMsg Global10490_Text_RunSwapWhich, 2
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8000
    EntralinkRun ENTRALINK_RUN_ACTION_RESERVE_ADD_OPTIONS, 1, 0, 0x8001
    ListMenuAdd Global10490_Text_RunSwapCancel, Global10490_Text_RunSwapCancelInfo, ENTRALINK_RUN_CARD_OTHER
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8000, 65534
    VMJumpIf CMP_EQ, L_RunNpcEnd
    WorkCmpConst 0x8000, ENTRALINK_RUN_CARD_OTHER
    VMJumpIf CMP_EQ, L_RunNpcEnd
    WorkSet 0x8006, 0x8000

L_RunSwapSelect:
    EntralinkRun ENTRALINK_RUN_ACTION_RESERVE_NAME, 0x8006, 0, 0x8000
    SystemMsg Global10490_Text_RunSwapLeave, 2
    LastKeyWait
    SystemMsgClose
    CallPokeSelect 0, 0x8003, 0x8004, 0
    WorkCmpConst 0x8003, 0
    VMJumpIf CMP_EQ, L_RunSwapMenu
    EntralinkRun ENTRALINK_RUN_ACTION_SWAP_CAN_LEAVE, 0x8004, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunSwapCantLeave
    EntralinkRun ENTRALINK_RUN_ACTION_RESERVE_NAME, 0x8006, 0, 0x8000
    WordSetPartyPokeName 1, 0x8004
    EntralinkRun ENTRALINK_RUN_ACTION_GET_DUST, 4, 0, 0x8005
    WordSetNumber 2, 0x8005, 5
    SystemMsg Global10490_Text_RunSwapAsk, 2
    YesNoWin 0x8000
    SystemMsgClose
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_NE, L_RunNpcEnd
    EntralinkRun ENTRALINK_RUN_ACTION_SWAP, 0x8006, 0x8004, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunSwapFailed
    SEPlay SEQ_SE_RECOVERY
    SystemMsg Global10490_Text_RunSwapped, 2
    LastKeyWait
    SystemMsgClose
    EntralinkRun ENTRALINK_RUN_ACTION_MAKE_CHOICE, 0, 0, 0x8000
    VMJump L_RunNpcEnd

L_RunSwapCantLeave:
    SystemMsg Global10490_Text_RunSwapCantLeave, 2
    LastKeyWait
    SystemMsgClose
    VMJump L_RunSwapSelect

L_RunSwapNone:
    SystemMsg Global10490_Text_RunSwapNone, 2
    VMJump L_RunSwapRefused

L_RunSwapNoDust:
    SystemMsg Global10490_Text_RunSwapNoDust, 2
    VMJump L_RunSwapRefused

L_RunSwapAllFainted:
    SystemMsg Global10490_Text_RunSwapAllFainted, 2
    VMJump L_RunSwapRefused

L_RunSwapFailed:
    SystemMsg Global10490_Text_RunSwapFailed, 2

L_RunSwapRefused:
    LastKeyWait
    SystemMsgClose
    VMJump L_RunNpcEnd

L_RunBuffChoice:
    // Paper White 2: a buff ball: its dialogue, then the room's offer of cards (drawn as the room was entered, from the
    // buff room pool); the one taken is the room's choice, and B leaves it open. With no card (none fitted), the ball
    // says so and is the choice
    WorkSetConst 0x8002, 0
    VMCall L_RunDialogue
    EntralinkRun ENTRALINK_RUN_ACTION_COUNT_CARDS, ENTRALINK_RUN_CARDS_BUFF_ROOM, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunBuffRoomEmpty

L_RunBuffRoomMenu:
    SystemMsg Global10490_Text_RunBuffRoomWhich, 2
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8000
    EntralinkRun ENTRALINK_RUN_ACTION_ADD_CARDS, ENTRALINK_RUN_CARDS_BUFF_ROOM, 0, 0x8001
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8000, 65534
    VMJumpIf CMP_EQ, L_RunNpcEnd
    WorkSetConst 0x8003, ENTRALINK_RUN_CARDS_BUFF_ROOM
    VMCall L_RunTakeCard
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunBuffRoomMenu

L_RunBuffChosen:
    EntralinkRun ENTRALINK_RUN_ACTION_MAKE_CHOICE, 0, 0, 0x8000
    VMJump L_RunNpcEnd

L_RunBuffRoomEmpty:
    SystemMsg Global10490_Text_RunBuffRoomEmpty, 2
    LastKeyWait
    SystemMsgClose
    VMJump L_RunBuffChosen

L_RunTakeCard:
    // Paper White 2: takes card 0x8000 of list 0x8003 (ENTRALINK_RUN_CARDS_*): a shop's asked first, and refused
    // without the Dream Dust; a new gold with every slot full replaces a gold the player chooses (Cancel or B back to
    // the cards); then what was gained. Returns with 0x8000 1 for taken, 0 for not
    EntralinkRun ENTRALINK_RUN_ACTION_PICK_CARD, 0x8003, 0x8000, 0x8001
    WorkCmpConst 0x8001, ENTRALINK_RUN_PICK_NONE
    VMJumpIf CMP_EQ, L_RunTakeCardNot
    WorkCmpConst 0x8001, ENTRALINK_RUN_PICK_NO_DUST
    VMJumpIf CMP_EQ, L_RunTakeCardNoDust
    WorkSetConst 0x8004, ENTRALINK_RUN_SLOT_NONE
    WorkCmpConst 0x8003, ENTRALINK_RUN_CARDS_SHOP
    VMJumpIf CMP_NE, L_RunTakeCardSlot
    SystemMsg Global10490_Text_RunShopBuy, 2
    YesNoWin 0x8002
    SystemMsgClose
    WorkCmpConst 0x8002, 0
    VMJumpIf CMP_NE, L_RunTakeCardNot

L_RunTakeCardSlot:
    WorkCmpConst 0x8001, ENTRALINK_RUN_PICK_REPLACE
    VMJumpIf CMP_NE, L_RunTakeCardNow
    SystemMsg Global10490_Text_RunBuffSlotsFull, 2
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8004
    EntralinkRun ENTRALINK_RUN_ACTION_ADD_CARDS, ENTRALINK_RUN_CARDS_GOLDS, 0, 0x8002
    ListMenuAdd Global10490_Text_RunBuffCancel, Global10490_Text_RunBuffCancelInfo, ENTRALINK_RUN_CARD_OTHER
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8004, ENTRALINK_RUN_CARD_OTHER
    VMJumpIf CMP_EQ, L_RunTakeCardNot
    WorkCmpConst 0x8004, 65534
    VMJumpIf CMP_EQ, L_RunTakeCardNot

L_RunTakeCardNow:
    EntralinkRun ENTRALINK_RUN_ACTION_TAKE_CARD, 0x8004, 0, 0x8002
    WorkCmpConst 0x8002, 0
    VMJumpIf CMP_EQ, L_RunTakeCardFailed
    WordSetPlayerName 0
    MEPlay SEQ_ME_ITEM
    WorkCmpConst 0x8001, ENTRALINK_RUN_PICK_ITEM
    VMJumpIf CMP_EQ, L_RunTakeCardItem
    WorkCmpConst 0x8001, ENTRALINK_RUN_PICK_RANK_UP
    VMJumpIf CMP_EQ, L_RunTakeCardRankUp
    WorkCmpConst 0x8001, ENTRALINK_RUN_PICK_REPLACE
    VMJumpIf CMP_EQ, L_RunTakeCardReplaced
    SystemMsg Global10490_Text_RunBuffGained, 2
    VMJump L_RunTakeCardDone

L_RunTakeCardItem:
    SystemMsg Global10490_Text_RunReceivedItem, 2
    VMJump L_RunTakeCardDone

L_RunTakeCardRankUp:
    SystemMsg Global10490_Text_RunBuffRankedUp, 2
    VMJump L_RunTakeCardDone

L_RunTakeCardReplaced:
    SystemMsg Global10490_Text_RunBuffReplaced, 2

L_RunTakeCardDone:
    MEWait
    LastKeyWait
    SystemMsgClose
    EntralinkRun ENTRALINK_RUN_ACTION_FORECAST, 0, 0, 0x8002
    WorkCmpConst 0x8002, 0
    VMJumpIf CMP_EQ, L_RunTakeCardEnd

L_RunForecastMenu:
    // Paper White 2: Forecast's weather, chosen once when the card is first taken (phase 4); B asks again
    SystemMsg Global10490_Text_RunForecastAsk, 2
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8004
    ListMenuAdd Global10490_Text_RunForecastSun, Global10490_Text_RunForecastSunInfo, 1
    ListMenuAdd Global10490_Text_RunForecastRain, Global10490_Text_RunForecastRainInfo, 2
    ListMenuAdd Global10490_Text_RunForecastSand, Global10490_Text_RunForecastSandInfo, 4
    ListMenuAdd Global10490_Text_RunForecastHail, Global10490_Text_RunForecastHailInfo, 3
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8004, 65534
    VMJumpIf CMP_EQ, L_RunForecastMenu
    EntralinkRun ENTRALINK_RUN_ACTION_FORECAST, 0x8004, 0, 0x8002

L_RunTakeCardEnd:
    WorkSetConst 0x8000, 1
    VMReturn

L_RunTakeCardNoDust:
    SystemMsg Global10490_Text_RunShopNoDust, 2
    LastKeyWait
    SystemMsgClose
    VMJump L_RunTakeCardNot

L_RunTakeCardFailed:
    // Only an item can fail here: the bag is full
    SystemMsg Global10490_Text_RunBagFull, 2
    LastKeyWait
    SystemMsgClose

L_RunTakeCardNot:
    WorkSetConst 0x8000, 0
    VMReturn

L_RunBuffOffer:
    // Paper White 2: the buffs offered after a battle won (phase 2), right after its Dream Dust: a card to keep, or
    // Skip for buffs.json's skip_dust. B shows the cards again: the offer is taken or skipped. Nothing after the final
    // room's battle, which ends the run, or if no card fitted
    EntralinkRun ENTRALINK_RUN_ACTION_OFFER, 0, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunBuffOfferDone

L_RunBuffOfferMenu:
    SystemMsg Global10490_Text_RunBuffChoose, 2
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8000
    EntralinkRun ENTRALINK_RUN_ACTION_ADD_CARDS, ENTRALINK_RUN_CARDS_OFFER, 0, 0x8001
    EntralinkRun ENTRALINK_RUN_ACTION_GET_DUST, 2, 0, 0x8001
    WordSetNumber 0, 0x8001, 3
    ListMenuAdd Global10490_Text_RunBuffSkip, Global10490_Text_RunBuffSkipInfo, ENTRALINK_RUN_CARD_OTHER
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8000, 65534
    VMJumpIf CMP_EQ, L_RunBuffOfferMenu
    WorkCmpConst 0x8000, ENTRALINK_RUN_CARD_OTHER
    VMJumpIf CMP_EQ, L_RunBuffOfferSkip
    WorkSetConst 0x8003, ENTRALINK_RUN_CARDS_OFFER
    VMCall L_RunTakeCard
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunBuffOfferMenu

L_RunBuffOfferDone:
    VMReturn

L_RunBuffOfferSkip:
    EntralinkRun ENTRALINK_RUN_ACTION_SKIP_OFFER, 0, 0, 0x8006
    EntralinkRun ENTRALINK_RUN_ACTION_GET_DUST, 2, 0, 0x8005
    WordSetNumber 0, 0x8005, 3
    WordSetNumber 1, 0x8006, 5
    SystemMsg Global10490_Text_RunBuffSkipped, 2
    LastKeyWait
    SystemMsgClose
    VMReturn

L_RunChoiceDone:
    // Paper White 2: a choice NPC once the room's choice is made
    SystemMsg Global10490_Text_RunChoiceDone, 2
    LastKeyWait
    SystemMsgClose
    VMJump L_RunNpcEnd

L_RunBattleNpc:
    WorkSetConst 0x8002, 0
    VMCall L_RunDialogue
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
    VMCall L_RunDust
    WorkSetConst 0x8002, 1
    VMCall L_RunDialogue
    SystemMsg Global10490_Text_DarkraiNightmareOver, 2

L_RunToHub:
    LastKeyWait
    SystemMsgClose
    VMCall L_RunShards
    EntralinkRun ENTRALINK_RUN_ACTION_WARP_HUB, 0, 0, 0x8000
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_RunRoomCleared:
    VMCall L_RunDust
    VMCall L_RunBuffOffer
    WorkSetConst 0x8002, 1
    VMCall L_RunDialogue
    EntralinkRun ENTRALINK_RUN_ACTION_CLEAR_ROOM, 0, 0, 0x8000
    SystemMsg Global10490_Text_NightmareFaded, 2
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_RunDialogue:
    // Paper White 2: the NPC's before (0x8002 0) or after (1) message from the rooms' text bank, if it has one, in its
    // style's window (talk, bubble, yell or event), which MsgWinCloseAll closes whichever it is; the message's number
    // is left in 0x8001
    EntralinkRun ENTRALINK_RUN_ACTION_DIALOGUE, 0x8002, 0, 0x8001
    WorkCmpConst 0x8001, ENTRALINK_RUN_NO_MESSAGE
    VMJumpIf CMP_EQ, L_RunDialogueNone
    WordSetPlayerName 0
    EntralinkRun ENTRALINK_RUN_ACTION_SHOW_DIALOGUE, 0x8002, 0, 0x8001
    LastKeyWait
    MsgWinCloseAll

L_RunDialogueNone:
    VMReturn

L_RunDust:
    // Paper White 2: the Dream Dust the battle won gave (step 7), if any, and the run's now
    EntralinkRun ENTRALINK_RUN_ACTION_GET_DUST, 0, 0, 0x8005
    WorkCmpConst 0x8005, 0
    VMJumpIf CMP_EQ, L_RunDustNone
    EntralinkRun ENTRALINK_RUN_ACTION_GET_DUST, 1, 0, 0x8006
    WordSetNumber 1, 0x8005, 5
    WordSetNumber 2, 0x8006, 5
    SystemMsg Global10490_Text_RunGatheredDust, 2
    LastKeyWait
    SystemMsgClose

L_RunDustNone:
    VMReturn

L_RunShards:
    // Paper White 2: the run ends here (if a loss hasn't ended it already), and the Dream Shards its end gave, if
    // any, and the save's now (the hub shop, paperwhite2/entralink_hub_shop.h)
    EntralinkRun ENTRALINK_RUN_ACTION_SHARDS, 0, 1, 0x8005
    WorkCmpConst 0x8005, 0
    VMJumpIf CMP_EQ, L_RunShardsNone
    EntralinkRun ENTRALINK_RUN_ACTION_SHARDS, 1, 2, 0x8005
    SystemMsg Global10490_Text_RunGainedShards, 2
    LastKeyWait
    SystemMsgClose

L_RunShardsNone:
    VMReturn

Script_10:
    // Paper White 2: the room's hidden item, found by pressing A facing its flower tile (script 10499,
    // EntralinkRun_CheckHiddenItem), into the run's bag
    ActorsPauseAll
    EntralinkRun ENTRALINK_RUN_ACTION_GET_HIDDEN_ITEM, 0, 0, 0x8004
    EntralinkRun ENTRALINK_RUN_ACTION_TAKE_HIDDEN_ITEM, 0, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunBagFull
    WordSetPlayerName 0
    WordSetItemName 1, 0x8004
    MEPlay SEQ_ME_ITEM
    SystemMsg Global10490_Text_RunFoundItem, 2
    MEWait
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_11:
    // Paper White 2: SELECT in a run (SCRID_ENTRALINK_RUN_BUFFS, src/ov036/fieldmap_event.c): the buffs held, the golds
    // with their ranks then the blues and purples with their counts, each one's line in the window as the cursor is
    // on it, and the run's Dream Dust; any choice closes it
    ActorsPauseAll
    EntralinkRun ENTRALINK_RUN_ACTION_GET_DUST, 1, 0, 0x8005
    WordSetNumber 0, 0x8005, 5
    EntralinkRun ENTRALINK_RUN_ACTION_COUNT_CARDS, ENTRALINK_RUN_CARDS_HELD, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunBuffsNone
    SystemMsg Global10490_Text_RunBuffsTitle, 2
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8000
    EntralinkRun ENTRALINK_RUN_ACTION_ADD_CARDS, ENTRALINK_RUN_CARDS_HELD, 0, 0x8001
    ListMenuAdd Global10490_Text_RunBuffsClose, Global10490_Text_RunBuffsTitle, ENTRALINK_RUN_CARD_OTHER
    ListMenuShow
    SystemMsgClose
    ActorsUnpauseAll
    VMHalt

L_RunBuffsNone:
    SystemMsg Global10490_Text_RunBuffsNone, 2
    LastKeyWait
    SystemMsgClose
    ActorsUnpauseAll
    VMHalt

Script_12:
    // Paper White 2: a run's start at the hub's forest entrance with the skip_round reward (SCRID_ENTRALINK_RUN_START,
    // paperwhite2/entralink_ranks.h): skip round 1? Yes starts at round 2's first room with a head start, records.json's
    // picks each chosen from an offer of round 1's as after a battle, then its Dream Dust; either way into the forest
    ActorsPauseAll
    SystemMsg Global10490_Text_RunSkipAsk, 2
    YesNoWin 0x8007
    SystemMsgClose
    WorkCmpConst 0x8007, 0
    VMJumpIf CMP_EQ, L_RunSkipYes
    EntralinkRun ENTRALINK_RUN_ACTION_SKIP_ROUND, 0, 0, 0x8007
    VMJump L_RunSkipWarp

L_RunSkipYes:
    EntralinkRun ENTRALINK_RUN_ACTION_SKIP_ROUND, 0, 1, 0x8007
    WorkCmpConst 0x8007, 0
    VMJumpIf CMP_EQ, L_RunSkipWarp
    WordSetNumber 0, 0x8007, 2
    SystemMsg Global10490_Text_RunSkipPicks, 2
    LastKeyWait
    SystemMsgClose

L_RunSkipPick:
    EntralinkRun ENTRALINK_RUN_ACTION_SKIP_ROUND, 1, 0, 0x8000
    WorkCmpConst 0x8000, 0
    VMJumpIf CMP_EQ, L_RunSkipDust
    VMCall L_RunBuffOfferMenu
    VMJump L_RunSkipPick

L_RunSkipDust:
    EntralinkRun ENTRALINK_RUN_ACTION_SKIP_ROUND, 2, 0, 0x8007
    WorkCmpConst 0x8007, 0
    VMJumpIf CMP_EQ, L_RunSkipWarp
    WordSetNumber 0, 0x8007, 4
    MEPlay SEQ_ME_ITEM
    SystemMsg Global10490_Text_RunSkipDust, 2
    MEWait
    LastKeyWait
    SystemMsgClose

L_RunSkipWarp:
    EntralinkRun ENTRALINK_RUN_ACTION_SKIP_ROUND, 3, 0, 0x8000
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
#endif
