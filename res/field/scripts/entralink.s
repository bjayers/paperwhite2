#include "asm/field_script.inc"
#include "text/script/entralink.h"
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
    ScriptEntry Script_9
    ScriptEntry Script_10
    ScriptEntry Script_11
    ScriptEntry Script_12
    ScriptEntry Script_13
    ScriptEntry Script_14
#ifdef PAPERWHITE2
    ScriptEntry Script_15
    ScriptEntry Script_16
    ScriptEntry Script_17
    ScriptEntry Script_18
    ScriptEntry Script_19
    ScriptEntry Script_20
#endif
    ScriptEntriesEnd
    WorkSetConst 0x8020, 0

Script_1:
#ifdef PAPERWHITE2
    // Paper White 2: the hub's NPCs of the Entree's ranks' rewards that aren't unlocked yet go
    // (paperwhite2/entralink_ranks.h)
    EntralinkRun ENTRALINK_RUN_ACTION_RANKS, 0, 0, 0x8000
#endif
    VMHalt

Script_2:
    VMHalt

Script_3:
    ActorsPauseAll
    WorkSetConst EVENT_WORK_0x4000, 1
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_4:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    VMCall L_0064
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_0064:
    // "Checked your Entree.[f000]븁\u0000"
    SystemMsg Entralink_Text_CheckedEntree, 2
    SystemMsgClose
    FadeOutBlackQ
    FadeWait
    FieldClose
    CallMonolith
    FieldOpen
    FadeInBlackQ
    FadeWait
#ifdef PAPERWHITE2
    // Paper White 2: the Entree's menu (src/paperwhite2/ov143/) has no Funfest missions to start
    VMReturn
#endif
    IsFestMissionAvailable 0x8010
    WorkCmpConst 0x8010, 1
    VMJumpIf CMP_EQ, L_0091
    VMJump L_0099

L_0091:
    VMReturn
    VMJump L_00BA

L_0099:
    WorkCmpConst 0x8010, 2
    VMJumpIf CMP_EQ, L_00AC
    VMJump L_00BA

L_00AC:
    VMCall L_00BC
    VMReturn
    VMJump L_00BA

L_00BA:
    VMReturn

L_00BC:
    VMStackPushFlag EVENT_FLAG_0x0986
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00D5
    VMCall L_00D9

L_00D5:
    FunfestMissionStart
    VMReturn

L_00D9:
    ActorCmdExec 0, Movement_0198
    ActorCmdWait
    ActorCmdExec 255, Movement_01A0
    ActorCmdWait
    // "Good! You've managed\nto receive a mission.[f000]븁\u0000\nThe first mission is the...\nBerry search, I see.[f000]븁\u0000\nThat should be just\nthe mission for a beginner like you.[f000]븁\u0000\nCities and routes have places\nthat glow.[f000]븁\u0000\nYou should find Berries there.\nSearch carefully![f000]븁\u0000\nAfter the mission, come back here, and\na new power will be granted...[f000]븁\u0000\nThat's it for now.\nGet going![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_GoodYouveManagedReceive, 0, 0, 0
    MsgWinCloseAll
    VMReturn

Script_8:
    ActorsPauseAll
    ActorCmdExec 0, Movement_01D0
    ActorCmdWait
    ActorCmdExec 0, Movement_01DC
    ActorCmdWait
    ActorCmdExec 255, Movement_01B0
    ActorCmdWait
    // "Welcome to the Entralink.[f000]븁\u0000\nHmm?[f000]븁\u0000\nJudging by your expression, you don't\nseem to know where you are.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_WelcomeEntralinkHmmJudging, 0, 0, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_01A0
    ActorCmdWait
    // "This place is called the Entralink...\nIt's a mysterious place[f000]븀\u0000\nthat links people.[f000]븁\u0000\nIt is also a place where you can hone\nyour skills by helping out[f000]븀\u0000\nnearby adventurers.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_PlaceCalledEntralinkIts, 0, 0, 0
    ActorCmdExec 0, Movement_01A8
    // "...Hmm.\nIt's a bit hard to explain with words.[f000]븁\u0000\nAs an adventurer,\nyou should test yourself[f000]븀\u0000\nto learn what it is...[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_HmmItsBitHard, 0, 0, 0
    ActorCmdWait
    MsgWinCloseAll
    ActorCmdExec 0, Movement_0198
    ActorCmdWait
    // "As a start, talk to this Entree\nto receive a mission.[f000]븁\u0000\nThen deliver your power to it!"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_StartTalkEntreeReceive, 0, 0, 0
    LastKeyWait
    MsgWinCloseAll
    MedalDiscover 77
    MedalDiscover 221
    MedalDiscover 223
    MedalDiscover 225
    MedalDiscover 229
    MedalDiscover 227
    WorkSetConst EVENT_WORK_0x404d, 1
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_0198:
    Move 32, 1
    MoveEnd

Movement_01A0:
    Move 33, 1
    MoveEnd

Movement_01A8:
    Move 35, 1
    MoveEnd

Movement_01B0:
    Move 34, 1
    MoveEnd
    Move 1, 1
    MoveEnd
    Move 3, 1
    MoveEnd
    VMHalt
    .byte 0x01
    .byte 0x00
    .byte 0xfe
    .balign 4, 0

Movement_01D0:
    Move 3, 1
    Move 75, 1
    MoveEnd

Movement_01DC:
    Move 15, 1
    MoveEnd

Script_11:
    ActorsPauseAll
    ActorCmdExec 0, Movement_01D0
    ActorCmdWait
    ActorCmdExec 0, Movement_01DC
    ActorCmdWait
    ActorCmdExec 255, Movement_01B0
    ActorCmdWait
    // "Oh, you're back...[f000]븁\u0000\nWhoa!\nThis is wonderful![f000]븀\u0000\nYou've completed the mission![f000]븁\u0000\nAs I promised, you'll receive a\nnew power...not from me, but[f000]븀\u0000\nfrom this Entree.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_OhYoureBackWhoa, 0, 0, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_0198
    ActorCmdWait
    // "The Entree gathers\nwishes from people.[f000]븁\u0000\nThese wishes resonate with each other\nand turn into Pass Powers, which[f000]븀\u0000\nhelp adventurers.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_EntreeGathersWishesFrom, 0, 0, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_01A8
    ActorCmdWait
    // "Go ahead and receive it.\nTalk to the Entree[f000]븀\u0000\nand receive a Pass Power!"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_GoAheadReceiveTalk, 0, 0, 0
    LastKeyWait
    MsgWinCloseAll
    WorkSetConst EVENT_WORK_0x404d, 4
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_12:
    ActorsPauseAll
    ActorCmdExec 0, Movement_01D0
    ActorCmdWait
    ActorCmdExec 0, Movement_01DC
    ActorCmdWait
    ActorCmdExec 255, Movement_01B0
    ActorCmdWait
    // "Oh, you're back...[f000]븁\u0000\nHmm...\nThe mission failed, I see...[f000]븁\u0000\nIt's a bit difficult in the beginning,\nso you need to try again and again.[f000]븀\u0000\nYou'll get better before too long.[f000]븁\u0000\nAnyway, I'll give you these\nfor your hard work![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_OhYoureBackHmm, 0, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 575
    WorkSet 0x8001, 10
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    // "As I promised, you'll receive\na new power...not from me,[f000]븀\u0000\nbut from this Entree.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_PromisedYoullReceiveNew, 0, 0, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_0198
    ActorCmdWait
    // "The Entree gathers\nwishes from people.[f000]븁\u0000\nThese wishes resonate with each other\nand turn into Pass Powers, which[f000]븀\u0000\nhelp adventurers.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_EntreeGathersWishesFrom, 0, 0, 0
    MsgWinCloseAll
    ActorCmdExec 0, Movement_01A8
    ActorCmdWait
    // "Go ahead and receive it.\nTalk to the Entree[f000]븀\u0000\nand receive a Pass Power!"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_GoAheadReceiveTalk, 0, 0, 0
    LastKeyWait
    MsgWinCloseAll
    WorkSetConst EVENT_WORK_0x404d, 4
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_13:
    ActorsPauseAll
    ActorCmdExec 0, Movement_0198
    ActorCmdWait
    ActorCmdExec 255, Movement_01A0
    ActorCmdWait
    // "You've received Pass Power(s), I see.[f000]븁\u0000\nNow you've become a real adventurer.[f000]븁\u0000\nUse your Pass Powers to help\nnearby adventurers![f000]븁\u0000\nTo use a Pass Power, you need a certain\nnumber of Pass Orbs.[f000]븁\u0000\nReceive missions from time to time\nand collect Pass Orbs.[f000]븁\u0000\nThat's all from me.[f000]븁\u0000\nIt is now up to you\nwhat you think and do.[f000]븁\u0000\nI hope you have a wonderful\nadventure waiting for you...[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_YouveReceivedPassPower, 0, 0, 0
    MsgWinCloseAll
    // "You can use a Pass Power by tapping\nthe Tag Log on your C-Gear.[f000]븁\u0000\nTap the green triangle icon in\nthe Tag Log."
    SystemMsg Entralink_Text_CanUsePassPower, 0
    LastKeyWait
    MsgWinCloseAll
    WorkSetConst EVENT_WORK_0x404d, 6
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_5:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMStackPush EVENT_WORK_0x404d
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0351
    // "First, talk to the Entree and\naccept a mission.[f000]븁\u0000\nThen deliver your wishes\nto the Entree!"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_FirstTalkEntreeAccept, 0, 2, 0
    VMJump L_037C

L_0351:
    VMStackPush EVENT_WORK_0x404d
    VMStackPushConst 4
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0376
    // "Go ahead!\nReceive the Pass Power from the Entree!"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_GoAheadReceivePass, 0, 2, 0
    VMJump L_037C

L_0376:
    VMCall L_0386

L_037C:
    LastKeyWait
    MsgWinCloseAll
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_0386:
    WorkSetConst 0x8021, 0
    WorkSetConst 0x8022, 0

L_0392:
    VMStackPush 0x8021
    VMStackPushConst 555
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_042A
    // "Is there anything you'd like to know\nabout the Entralink?"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_ThereAnythingYoudLike_2, 0, 2, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32802
    ListMenuAdd 27, 65535, 0
    ListMenuAdd 28, 65535, 1
    ListMenuAdd 29, 65535, 10
    ListMenuShow
    WorkCmpConst 0x8022, 0
    VMJumpIf CMP_EQ, L_03E7
    VMJump L_03F9

L_03E7:
    // "Missions test adventurers.[f000]븁\u0000\nComplete these missions and you'll\nreceive helpful things like Pass Orbs[f000]븀\u0000\nand Pass Powers.[f000]븁\u0000\nTalk to the Entree to start a mission, or\nuse Tag Log on your C-Gear[f000]븀\u0000\nto join someone else's mission.[f000]븁\u0000\nYou'll gain more power that way.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_MissionsTestAdventurersComplete, 0, 2, 0
    VMJump L_0424

L_03F9:
    WorkCmpConst 0x8022, 1
    VMJumpIf CMP_EQ, L_040C
    VMJump L_041E

L_040C:
    // "Pass Powers are mysterious powers.[f000]븁\u0000\nYou can register up to three of them\nin your C-Gear.[f000]븁\u0000\nYou use them by aiming at\npeople you pass by with the[f000]븀\u0000\nTag Log.[f000]븁\u0000\nBut you need Pass Orbs to use\nPass Powers.[f000]븁\u0000\nYou should carry out a mission\nand collect Pass Orbs.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_PassPowersMysteriousPowers, 0, 2, 0
    VMJump L_0424

L_041E:
    WorkSetConst 0x8021, 555

L_0424:
    VMJump L_0392

L_042A:
    WorkSetConst 0x8022, 0
    WorkSetConst 0x8021, 0
    // "The Entralink is an island where\nadventurers are linked...[f000]븁\u0000\nMeet many adventurers\nand hone your skills."
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_EntralinkIslandWhereAdventurers, 0, 2, 0
    VMReturn

Script_6:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    WorkSetConst 0x8023, 0
    WorkSetConst 0x8024, 0

L_0458:
    VMStackPush 0x8023
    VMStackPushConst 555
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_04F0
    // "Is there anything you'd like to know\nabout participants?"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_ThereAnythingYoudLike_4, 1, 2, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32804
    ListMenuAdd 43, 65535, 0
    ListMenuAdd 44, 65535, 1
    ListMenuAdd 45, 65535, 10
    ListMenuShow
    WorkCmpConst 0x8024, 0
    VMJumpIf CMP_EQ, L_04AD
    VMJump L_04BF

L_04AD:
    // "When you start a Funfest Mission,\nnearby adventurers can participate[f000]븀\u0000\nin the same mission using the Tag Log[f000]븀\u0000\non their C-Gear.[f000]븁\u0000\nIt may take some time before the mission\ninvitations are received. They should wait[f000]븀\u0000\na little while and check their Tag Logs.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_WhenStartFunfestMission, 1, 2, 0
    VMJump L_04EA

L_04BF:
    WorkCmpConst 0x8024, 1
    VMJumpIf CMP_EQ, L_04D2
    VMJump L_04E4

L_04D2:
    // "When you have participants in your\nFunfest Mission, their actions also count[f000]븀\u0000\nas part of your score.[f000]븁\u0000\nIn a mission, items are found at the same\nlocation for everyone.[f000]븁\u0000\nYou may be able to talk to each other\nto make missions easier for everybody.[f000]븁\u0000\nOne more thing. Sometimes you may fail\nto receive scores from other people.[f000]븁\u0000\nWorlds don't always resonate\nas they should, it seems.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_WhenHaveParticipantsFunfest, 1, 2, 0
    VMJump L_04EA

L_04E4:
    WorkSetConst 0x8023, 555

L_04EA:
    VMJump L_0458

L_04F0:
    WorkSetConst 0x8024, 0
    WorkSetConst 0x8023, 0
    // "It seems that the more adventurers\nyou gather, the more power you bring[f000]븀\u0000\nto the Entralink."
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_SeemsMoreAdventurersGather, 1, 2, 0
    LastKeyWait
    MsgWinCloseAll
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_7:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    WorkSetConst 0x8025, 0
    WorkSetConst 0x8026, 0

L_0526:
    VMStackPush 0x8025
    VMStackPushConst 555
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_05BE
    // "Is there anything you'd like to know\nabout the Entree?"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_ThereAnythingYoudLike_3, 2, 2, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32806
    ListMenuAdd 36, 65535, 0
    ListMenuAdd 37, 65535, 1
    ListMenuAdd 38, 65535, 10
    ListMenuShow
    WorkCmpConst 0x8026, 0
    VMJumpIf CMP_EQ, L_057B
    VMJump L_058D

L_057B:
    // "You'll find more and more types of\nFunfest Missions you can receive from the[f000]븀\u0000\nEntree as you advance in your adventure.[f000]븁\u0000\nTalking to people or battling other\nTrainers will give you more mission types.[f000]븁\u0000\nPlease listen to other people\nwhen they express their wishes.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_YoullFindMoreMore, 2, 2, 0
    VMJump L_05B8

L_058D:
    WorkCmpConst 0x8026, 1
    VMJumpIf CMP_EQ, L_05A0
    VMJump L_05B2

L_05A0:
    // "Raising the Entralink's level\ngives you new types of Pass Powers.[f000]븁\u0000\nThe Entralink level can sometimes go\nup as you complete a Funfest Mission.[f000]븁\u0000\nThe higher the score is,\nthe more likely the level is to go up.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_RaisingEntralinksLevelGives, 2, 2, 0
    VMJump L_05B8

L_05B2:
    WorkSetConst 0x8025, 555

L_05B8:
    VMJump L_0526

L_05BE:
    WorkSetConst 0x8026, 0
    WorkSetConst 0x8025, 0
    // "The Entree grows little by little,\nas if it responds to people's wishes."
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_EntreeGrowsLittleBy, 2, 2, 0
    LastKeyWait
    MsgWinCloseAll
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_9:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "The Entree Forest connects dreams\nand reality.[f000]븁\u0000\nPeople say dreams come true here.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_EntreeForestConnectsDreams, 5, 2, 0
    WorkSetConst 0x8027, 0
    WorkSetConst 0x8028, 0

L_0600:
    VMStackPush 0x8027
    VMStackPushConst 555
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_0698
    // "Is there anything you'd like to know\nabout the Entree Forest?"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_ThereAnythingYoudLike, 5, 2, 0
    ListMenuAnchorTopRight 31, 1, 0, 1, 32808
    ListMenuAdd 7, 65535, 0
    ListMenuAdd 8, 65535, 1
    ListMenuAdd 9, 65535, 10
    ListMenuShow
    WorkCmpConst 0x8028, 0
    VMJumpIf CMP_EQ, L_0655
    VMJump L_0667

L_0655:
    // "The Entree Forest is a place where\ndreams come true.[f000]븁\u0000\nWhen a dreaming Pokémon wakes up in\nGame Sync, its dream will come true in[f000]븀\u0000\nthis forest.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_EntreeForestPlaceWhere, 5, 2, 0
    VMJump L_0692

L_0667:
    WorkCmpConst 0x8028, 1
    VMJumpIf CMP_EQ, L_067A
    VMJump L_068C

L_067A:
    // "Pokémon that your Pokémon met in its\ndream will show up in the Entralink[f000]븀\u0000\nin a Forest Clearing.[f000]븁\u0000\nPokémon in a Forest Clearing will be\nyour friends for sure![f000]븁\u0000\nIf you move the Pokémon to the Deepest\nClearing, they will wait for you there.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_PokemonPokemonMetIts, 5, 2, 0
    VMJump L_0692

L_068C:
    WorkSetConst 0x8027, 555

L_0692:
    VMJump L_0600

L_0698:
    WorkSetConst 0x8028, 0
    WorkSetConst 0x8027, 0
    // "When your Pokémon wakes up from a\ndream, please come to this forest."
    ActorMsg MSGFILE_SCRIPT, Entralink_Text_WhenPokemonWakesUp, 5, 2, 0
    LastKeyWait
    MsgWinCloseAll
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_10:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
#ifdef PAPERWHITE2
    // Paper White 2: the hub's one NPC (res/field/events/entralink.json) asks and takes the player back to their own
    // world, as walking off the hub's south edge does (Script_14)
    // "You can go back to your\nown world from here.[f000]븁\u0000\nDo you want to go back?"
    SystemMsg Entralink_Text_CanGoBackOwn, 2
    YesNoWin 0x8010
    SystemMsgClose
    WorkCmpConst 0x8010, 0
    VMJumpIf CMP_NE, L_HubNpcStay
    CallEntralinkWarpOut

L_HubNpcStay:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
#endif
    // "You can go back to the original world\nfrom this place.[f000]븁\u0000\nIf you want to go back to the original\nworld, please come back here."
    ParentActorMsg MSGFILE_SCRIPT, Entralink_Text_CanGoBackOriginal, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

#ifdef PAPERWHITE2
Script_15:
    // Paper White 2: the hub's Reserve Box NPC (phase 7 of the Entralink's buffs, res/field/events/entralink.json):
    // the PC's Box as a Pokémon Center's PC opens it, and the Reserve Box (paperwhite2/entralink_reserve.h), the box
    // Pokémon set aside for the run's rest stops' swaps
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    SystemMsg Entralink_Text_ReserveNpcHello, 2
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8010
    ListMenuAdd Entralink_Text_ReserveNpcUsePc, 65535, 0
    ListMenuAdd Entralink_Text_ReserveNpcReserveBox, 65535, 1
    ListMenuAdd Entralink_Text_ReserveNpcCancel, 65535, 2
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8010, 0
    VMJumpIf CMP_EQ, L_HubPc
    WorkCmpConst 0x8010, 1
    VMJumpIf CMP_EQ, L_HubReserveMenu

L_HubReserveNpcEnd:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_HubPc:
    // Paper White 2: the PC's Box modes (the original's Deposit, Withdraw, Move Pokémon and Move Items, global_10090.s);
    // the Box's close button ends it all, as at a Pokémon Center
    SEPlay SEQ_SE_PC_LOGIN
    SystemMsg Entralink_Text_ReservePcAccessed, 2

L_HubPcMenu:
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8010
    ListMenuAdd Entralink_Text_ReservePcMove, 65535, 2
    ListMenuAdd Entralink_Text_ReservePcDeposit, 65535, 0
    ListMenuAdd Entralink_Text_ReservePcWithdraw, 65535, 1
    ListMenuAdd Entralink_Text_ReservePcItems, 65535, 3
    ListMenuAdd Entralink_Text_ReservePcCancel, 65535, 4
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8010, 3
    VMJumpIf CMP_GT, L_HubPcEnd
    FadeOutBlackQ
    FadeWait
    CallPC 0x8011, 0x8010
    FadeInBlackQ
    FadeWait
    WorkCmpConst 0x8011, 0
    VMJumpIf CMP_EQ, L_HubPcEnd
    SEPlay SEQ_SE_PC_LOGIN
    SystemMsg Entralink_Text_ReservePcWhat, 2
    VMJump L_HubPcMenu

L_HubPcEnd:
    SEPlay SEQ_SE_PC_LOGOFF
    VMJump L_HubReserveNpcEnd

L_HubReserveMenu:
    // Paper White 2: the Reserve Box: its Pokémon as they are now (one released or moved into the party drops off),
    // one picked can be taken out, and Add opens the PC Box to pick one
    EntralinkRun ENTRALINK_RUN_ACTION_RESERVE_COUNT, 0, 0, 0x8011
    EntralinkRun ENTRALINK_RUN_ACTION_RESERVE_COUNT, 1, 1, 0x8011
    SystemMsg Entralink_Text_ReserveBoxWhat, 2
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8010
    EntralinkRun ENTRALINK_RUN_ACTION_RESERVE_ADD_OPTIONS, 0, 0, 0x8011
    ListMenuAdd Entralink_Text_ReserveBoxAdd, Entralink_Text_ReserveBoxAddInfo, 100
    ListMenuAdd Entralink_Text_ReserveBoxClose, Entralink_Text_ReserveBoxCloseInfo, 101
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8010, 100
    VMJumpIf CMP_EQ, L_HubReserveAdd
    WorkCmpConst 0x8010, 100
    VMJumpIf CMP_GT, L_HubReserveNpcEnd
    WorkSet 0x8014, 0x8010
    EntralinkRun ENTRALINK_RUN_ACTION_RESERVE_NAME, 0x8014, 0, 0x8011
    SystemMsg Entralink_Text_ReserveBoxRemoveAsk, 2
    YesNoWin 0x8011
    SystemMsgClose
    WorkCmpConst 0x8011, 0
    VMJumpIf CMP_NE, L_HubReserveMenu
    EntralinkRun ENTRALINK_RUN_ACTION_RESERVE_REMOVE, 0x8014, 0, 0x8011
    SystemMsg Entralink_Text_ReserveBoxRemoved, 2
    VMJump L_HubReserveSaid

L_HubReserveAdd:
    EntralinkRun ENTRALINK_RUN_ACTION_RESERVE_COUNT, 2, 0, 0x8011
    WorkCmpConst 0x8011, 0
    VMJumpIf CMP_EQ, L_HubReserveFull
    SystemMsg Entralink_Text_ReserveBoxPick, 2
    LastKeyWait
    SystemMsgClose
    FadeOutBlackQ
    FadeWait
    EntralinkRun ENTRALINK_RUN_ACTION_RESERVE_PICK_BOX, 0, 0, 0x8011
    FadeInBlackQ
    FadeWait
    WorkCmpConst 0x8011, ENTRALINK_RESERVE_NONE
    VMJumpIf CMP_EQ, L_HubReserveMenu
    EntralinkRun ENTRALINK_RUN_ACTION_RESERVE_ADD, 0x8011, 0, 0x8012
    WorkCmpConst 0x8012, ENTRALINK_RESERVE_ADDED
    VMJumpIf CMP_EQ, L_HubReserveAdded
    WorkCmpConst 0x8012, ENTRALINK_RESERVE_ALREADY
    VMJumpIf CMP_EQ, L_HubReserveAlready
    WorkCmpConst 0x8012, ENTRALINK_RESERVE_FULL
    VMJumpIf CMP_EQ, L_HubReserveFull
    SystemMsg Entralink_Text_ReserveBoxNotAdded, 2
    VMJump L_HubReserveSaid

L_HubReserveAdded:
    SystemMsg Entralink_Text_ReserveBoxAdded, 2
    VMJump L_HubReserveSaid

L_HubReserveAlready:
    SystemMsg Entralink_Text_ReserveBoxAlready, 2
    VMJump L_HubReserveSaid

L_HubReserveFull:
    SystemMsg Entralink_Text_ReserveBoxFull, 2

L_HubReserveSaid:
    LastKeyWait
    SystemMsgClose
    VMJump L_HubReserveMenu

Script_16:
    // Paper White 2: the hub's shop NPC (entralink-buffs.md section 19, res/field/events/entralink.json): blue and
    // purple buffs for Dream Shards, a pick at a time, held from every run's start (paperwhite2/entralink_hub_shop.h),
    // and a reset that gives every Shard spent back
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    SystemMsg Entralink_Text_ShopHello, 2

L_HubShopTop:
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8010
    ListMenuAdd Entralink_Text_ShopBuy, 65535, 0
    ListMenuAdd Entralink_Text_ShopReset, 65535, 1
    ListMenuAdd Entralink_Text_ShopCancel, 65535, 2
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8010, 0
    VMJumpIf CMP_EQ, L_HubShopList
    WorkCmpConst 0x8010, 1
    VMJumpIf CMP_EQ, L_HubShopReset

L_HubShopEnd:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

L_HubShopList:
    EntralinkRun ENTRALINK_RUN_ACTION_SHARDS, 1, 1, 0x8011
    EntralinkRun ENTRALINK_RUN_ACTION_SHARDS, 2, 2, 0x8011
    EntralinkRun ENTRALINK_RUN_ACTION_SHARDS, 3, 3, 0x8011
    SystemMsg Entralink_Text_ShopWhich, 2
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8010
    // (its first line the Shards and picks, which shows the list again)
    ListMenuAdd Entralink_Text_ShopStatus, Entralink_Text_ShopStatusInfo, ENTRALINK_RUN_CARD_OTHER
    EntralinkRun ENTRALINK_RUN_ACTION_SHOP_ADD_CARDS, 0, 0, 0x8011
    ListMenuAdd Entralink_Text_ShopClose, Entralink_Text_ShopCloseInfo, 101
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8010, ENTRALINK_RUN_CARD_OTHER
    VMJumpIf CMP_EQ, L_HubShopList
    WorkCmpConst 0x8010, ENTRALINK_RUN_CARD_OTHER
    VMJumpIf CMP_GT, L_HubShopEnd
    WorkSet 0x8014, 0x8010
    EntralinkRun ENTRALINK_RUN_ACTION_SHOP_PICK, 0x8014, 0, 0x8011
    WorkCmpConst 0x8011, ENTRALINK_SHOP_NO_SHARDS
    VMJumpIf CMP_EQ, L_HubShopNoShards
    WorkCmpConst 0x8011, ENTRALINK_SHOP_SOLD_OUT
    VMJumpIf CMP_EQ, L_HubShopSoldOut
    WorkCmpConst 0x8011, ENTRALINK_SHOP_CARD_MAX
    VMJumpIf CMP_EQ, L_HubShopCardMax
    SystemMsg Entralink_Text_ShopAsk, 2
    YesNoWin 0x8011
    SystemMsgClose
    WorkCmpConst 0x8011, 0
    VMJumpIf CMP_NE, L_HubShopList
    EntralinkRun ENTRALINK_RUN_ACTION_SHOP_BUY, 0x8014, 0, 0x8011
    SEPlay SEQ_SE_SYS_22
    SystemMsg Entralink_Text_ShopBought, 2
    VMJump L_HubShopSaid

L_HubShopNoShards:
    SystemMsg Entralink_Text_ShopNoShards, 2
    VMJump L_HubShopSaid

L_HubShopSoldOut:
    SystemMsg Entralink_Text_ShopSoldOut, 2
    VMJump L_HubShopSaid

L_HubShopCardMax:
    SystemMsg Entralink_Text_ShopCardMax, 2

L_HubShopSaid:
    LastKeyWait
    SystemMsgClose
    VMJump L_HubShopList

L_HubShopReset:
    EntralinkRun ENTRALINK_RUN_ACTION_SHARDS, 4, 1, 0x8011
    EntralinkRun ENTRALINK_RUN_ACTION_SHARDS, 2, 2, 0x8012
    WorkCmpConst 0x8012, 0
    VMJumpIf CMP_EQ, L_HubShopResetNone
    SystemMsg Entralink_Text_ShopResetAsk, 2
    YesNoWin 0x8012
    SystemMsgClose
    WorkCmpConst 0x8012, 0
    VMJumpIf CMP_NE, L_HubShopEnd
    EntralinkRun ENTRALINK_RUN_ACTION_SHOP_RESET, 0, 0, 0x8012
    SystemMsg Entralink_Text_ShopResetDone, 2
    LastKeyWait
    SystemMsgClose
    VMJump L_HubShopEnd

L_HubShopResetNone:
    SystemMsg Entralink_Text_ShopResetNone, 2
    LastKeyWait
    SystemMsgClose
    VMJump L_HubShopEnd

Script_17:
    // Paper White 2: the hub's difficulty NPC (the difficulty reward, paperwhite2/entralink_ranks.h), a placeholder
    // until the difficulty tiers come
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    SystemMsg Entralink_Text_DifficultyHello, 2
    LastKeyWait
    SystemMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_18:
    // Paper White 2: the hub's fog NPC (the fog reward): the hub's fog, one of the forest's rounds' tints or none,
    // saved in the progress block and shown at once
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    SystemMsg Entralink_Text_FogHello, 2
    ListMenuAnchorTopLeft 1, 1, 0, 1, 0x8010
    ListMenuAdd Entralink_Text_FogPink, 65535, ENTRALINK_HUB_FOG_PINK
    ListMenuAdd Entralink_Text_FogPurple, 65535, ENTRALINK_HUB_FOG_PURPLE
    ListMenuAdd Entralink_Text_FogBlack, 65535, ENTRALINK_HUB_FOG_BLACK
    ListMenuAdd Entralink_Text_FogNone, 65535, ENTRALINK_HUB_FOG_NONE
    ListMenuAdd Entralink_Text_FogCancel, 65535, ENTRALINK_HUB_FOG_COUNT
    ListMenuShow
    SystemMsgClose
    WorkCmpConst 0x8010, ENTRALINK_HUB_FOG_COUNT
    VMJumpIf CMP_GE, L_HubFogEnd
    EntralinkRun ENTRALINK_RUN_ACTION_HUB_FOG, 1, 0x8010, 0x8011
    FieldSetWeather 0xffff, 0
    SystemMsg Entralink_Text_FogDone, 2
    LastKeyWait
    SystemMsgClose

L_HubFogEnd:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_19:
    // Paper White 2: the hub's item shop (the shard_shop reward): the Poké Mart's screen with records.json's
    // shard_shop goods, for Dream Shards into the real bag
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    SystemMsg Entralink_Text_ShardShopHello, 2
    LastKeyWait
    SystemMsgClose
    CallFriendlyShopBuy ENTRALINK_SHARD_SHOP_ID, 0x8000
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_20:
    // Paper White 2: the hub's form NPC (the form_change reward): a party Pokémon of a species with a special form
    // (records.json's special_forms) takes that form, or goes back to its usual one
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    SystemMsg Entralink_Text_FormHello, 2
    YesNoWin 0x8010
    SystemMsgClose
    WorkCmpConst 0x8010, 0
    VMJumpIf CMP_NE, L_HubFormEnd
    CallPokeSelect 0, 0x8011, 0x8012, 0
    WorkCmpConst 0x8011, 0
    VMJumpIf CMP_EQ, L_HubFormEnd
    EntralinkRun ENTRALINK_RUN_ACTION_FORM, 0, 0x8012, 0x8013
    WordSetPartyPokeName 0, 0x8012
    WorkCmpConst 0x8013, ENTRALINK_FORM_TO_SPECIAL
    VMJumpIf CMP_EQ, L_HubFormToSpecial
    WorkCmpConst 0x8013, ENTRALINK_FORM_TO_USUAL
    VMJumpIf CMP_EQ, L_HubFormToUsual
    SystemMsg Entralink_Text_FormNone, 2
    VMJump L_HubFormSaid

L_HubFormToSpecial:
    SystemMsg Entralink_Text_FormAskSpecial, 2
    VMJump L_HubFormAsk

L_HubFormToUsual:
    SystemMsg Entralink_Text_FormAskUsual, 2

L_HubFormAsk:
    YesNoWin 0x8010
    SystemMsgClose
    WorkCmpConst 0x8010, 0
    VMJumpIf CMP_NE, L_HubFormEnd
    EntralinkRun ENTRALINK_RUN_ACTION_FORM, 1, 0x8012, 0x8013
    MEPlay SEQ_ME_ITEM
    SystemMsg Entralink_Text_FormChanged, 2
    MEWait

L_HubFormSaid:
    LastKeyWait
    SystemMsgClose

L_HubFormEnd:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
#endif

Script_14:
    ActorsPauseAll
    // "You can go back to your\nown world from here.[f000]븁\u0000\nDo you want to go back?"
    SystemMsg Entralink_Text_CanGoBackOwn, 2
    YesNoWin 0x8010
    SystemMsgClose
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_06FF
    CallEntralinkWarpOut
    VMJump L_0709

L_06FF:
    ActorCmdExec 255, Movement_0710
    ActorCmdWait

L_0709:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_0710:
    Move 8, 1
    MoveEnd
