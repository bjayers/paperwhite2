#include "asm/field_script.inc"
#include "text/script/virbank_city_pokemon_center.h"

// Script plugin 13, from the zones that use this file

    ScriptEntry Script_1
    ScriptEntry Script_2
    ScriptEntry Script_3
    ScriptEntry Script_4
    ScriptEntry Script_5
    ScriptEntry Script_6
    ScriptEntriesEnd

Script_1:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 255
    WorkSet 0x8001, 1
    RTCallGlobal 10110
    VMStackPop 0x8001
    VMStackPop 0x8000
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_2:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 22
    WorkSet 0x8001, 1
    RTCallGlobal 10110
    VMStackPop 0x8001
    VMStackPop 0x8000
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_3:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Listen! Challenge Poison-type Pokémon\nwith Poison-type Pokémon![f000]븀\u0000\nAt least, that's what Roxie told me.[f000]븁\u0000\nRoxie's a Gym Leader!\nShe plays an instrument. Pretty cool!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_ListenChallengePoisonType, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_4:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    WorkSetConst 0x8020, 0
    TrainerCardGetBadgeCount 0x8020
    VMStackPush 0x8020
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00C9
    // "The more Gym Badges you have,\nthe more items you can buy at a shop.[f000]븀\u0000\nI didn't know that!"
    ActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_MoreGymBadgesHave, 7, 0, 0
    VMJump L_00DC

L_00C9:
    WordSetNumber 0, 0x8020, 1
    // "So you have [f000]Ȁ\u0001\u0000 Badges?[f000]븁\u0000\nOh! Then, you must be able to buy\na lot of items at a shop."
    ActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_HaveBadgesOhThen, 7, 0, 0

L_00DC:
    LastKeyWait
    MsgWinCloseAll
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_5:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Hi! I have some questions for you![f000]븁\u0000\nIf you want to play, where do\nyou prefer: outside or at home?"
    ActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_HiHaveSomeQuestions, 8, 2, 0
    ListMenuAnchorTopRight 31, 1, 0, 0, 32784
    ListMenuAdd 11, 65535, 1
    ListMenuAdd 12, 65535, 2
    ListMenuAdd 13, 65535, 3
    ListMenuShow
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_013C
    WorkSetConst 0x8008, 1
    VMJump L_0174

L_013C:
    VMStackPush 0x8010
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_015B
    WorkSetConst 0x8008, 2
    VMJump L_0174

L_015B:
    VMStackPush 0x8010
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0174
    WorkSetConst 0x8008, 3

L_0174:
    // "I see! I see![f000]븁\u0000\nThen, which one are you interested in:\nthe thing everybody knows[f000]븀\u0000\nor the thing nobody knows?"
    ActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_SeeSeeThenWhich, 8, 2, 0
    ListMenuAnchorTopRight 31, 1, 0, 0, 32784
    ListMenuAdd 14, 65535, 1
    ListMenuAdd 15, 65535, 2
    ListMenuAdd 13, 65535, 3
    ListMenuShow
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01C2
    WorkSetConst 0x8009, 1
    VMJump L_01FA

L_01C2:
    VMStackPush 0x8010
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01E1
    WorkSetConst 0x8009, 2
    VMJump L_01FA

L_01E1:
    VMStackPush 0x8010
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01FA
    WorkSetConst 0x8009, 3

L_01FA:
    // "Oh, really?[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_OhReally, 8, 2, 0
    VMStackPush 0x8008
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMStackPush 0x8009
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMStackCmp CMP_OR
    VMJumpIf CMP_STACK, L_023F
    // "In my view, you are a person with\ncommon sense!"
    ActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_ViewPersonCommonSense, 8, 2, 0
    UnityTowerSetRatingLevel 0
    VMJump L_031D

L_023F:
    VMStackPush 0x8008
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackPush 0x8009
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_0278
    // "I'd say you are quite active!"
    ActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_IdSayQuiteActive, 8, 2, 0
    UnityTowerSetRatingLevel 1
    VMJump L_031D

L_0278:
    VMStackPush 0x8008
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackPush 0x8009
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_02B1
    // "I'd say you are very curious!"
    ActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_IdSayVeryCurious, 8, 2, 0
    UnityTowerSetRatingLevel 2
    VMJump L_031D

L_02B1:
    VMStackPush 0x8008
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMStackPush 0x8009
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_02EA
    // "I'd say you are quite composed!"
    ActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_IdSayQuiteComposed, 8, 2, 0
    UnityTowerSetRatingLevel 4
    VMJump L_031D

L_02EA:
    VMStackPush 0x8008
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMStackPush 0x8009
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_031D
    // "I'd say you are quite relaxed!"
    ActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_IdSayQuiteRelaxed, 8, 2, 0
    UnityTowerSetRatingLevel 3

L_031D:
    LastKeyWait
    MsgWinCloseAll
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_6:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    WorkCmpConst EVENT_WORK_0x4050, 1
    VMJumpIf CMP_EQ, L_036A
    WorkCmpConst EVENT_WORK_0x4050, 2
    VMJumpIf CMP_EQ, L_037A
    WorkCmpConst EVENT_WORK_0x4050, 3
    VMJumpIf CMP_EQ, L_038A
    WorkCmpConst EVENT_WORK_0x4050, 4
    VMJumpIf CMP_EQ, L_039A
    VMJump L_03AA

L_036A:
    // "Imagine a quaint town:\nrolling fields of flowers,[f000]븀\u0000\nred-roofed houses,\nsnow-capped mountains in the distance...[f000]븁\u0000\nAaaand, ACTION![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_ImagineQuaintTownRolling, 0, 0
    VMJump L_03BA

L_037A:
    // "Ugh, this suit is so hot...[f000]븁\u0000\nOh, uh... right!\nSummer![f000]븁\u0000\nTime to cut and project\nanother season?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_UghSuitHotOh, 0, 0
    VMJump L_03BA

L_038A:
    // "Maybe we can film on Route 20...[f000]븁\u0000\nBut it's so hard to get\na permit to film there in autumn.[f000]븁\u0000\nMaybe we can project\nanother season?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_MaybeWeCanFilm, 0, 0
    VMJump L_03BA

L_039A:
    // "The perfect time to wear this suit\n...[f000]븀\u0000\nis when it's cold.[f000]븁\u0000\nReady to cut and project\nanother season?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_PerfectTimeWearSuit, 0, 0
    VMJump L_03BA

L_03AA:
    // "The world is a green screen,\nand YOU are the star![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_WorldGreenScreenStar, 0, 0
    VMJump L_03BA

L_03BA:
    ListMenuAnchorTopRight 30, 8, 0, 1, 32780
    ListMenuAdd 22, 0, 0
    ListMenuAdd 23, 0, 1
    ListMenuAdd 24, 0, 2
    ListMenuAdd 25, 0, 3
    ListMenuAdd 30, 0, 4
    ListMenuShow
    ActorMsgClose
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_0436
    WorkCmpConst 0x800c, 1
    VMJumpIf CMP_EQ, L_044C
    WorkCmpConst 0x800c, 2
    VMJumpIf CMP_EQ, L_0462
    WorkCmpConst 0x800c, 3
    VMJumpIf CMP_EQ, L_0478
    WorkCmpConst 0x800c, 4
    VMJumpIf CMP_EQ, L_048E
    VMJump L_053B

L_0436:
    WorkSetConst EVENT_WORK_0x4050, 1
    // "Imagine the aroma of endless\nfields of flowers...[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_ImagineAromaEndlessFields, 0, 0
    VMJump L_0539

L_044C:
    WorkSetConst EVENT_WORK_0x4050, 2
    // "Whatever you do...\ndon't try to cool off in the canals.[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_WhateverDontTryCool, 0, 0
    VMJump L_0539

L_0462:
    WorkSetConst EVENT_WORK_0x4050, 3
    // "This city does feel quite \"autumn,\"\ndoesn't it?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_CityDoesFeelQuite, 0, 0
    VMJump L_0539

L_0478:
    WorkSetConst EVENT_WORK_0x4050, 4
    // "Want a suit of your own?\nIt's warm![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_WantSuitOwnIts, 0, 0
    VMJump L_0539

L_048E:
    // "Projecting seasons naturally in...\nIn 3...[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_ProjectingSeasonsNaturally3, 0, 0
    ListMenuAnchorTopRight 30, 8, 0, 1, 32780
    ListMenuAdd 32, 0, 4
    ListMenuAdd 33, 0, 5
    ListMenuAdd 34, 0, 6
    ListMenuAdd 35, 0, 7
    ListMenuShow
    ActorMsgClose
    WorkCmpConst 0x800c, 4
    VMJumpIf CMP_EQ, L_04FF
    WorkCmpConst 0x800c, 5
    VMJumpIf CMP_EQ, L_050B
    WorkCmpConst 0x800c, 6
    VMJumpIf CMP_EQ, L_0517
    WorkCmpConst 0x800c, 7
    VMJumpIf CMP_EQ, L_0523
    VMJump L_053B

L_04FF:
    WorkSetConst EVENT_WORK_0x4050, 0
    VMJump L_0529

L_050B:
    WorkSetConst EVENT_WORK_0x4050, 5
    VMJump L_0529

L_0517:
    WorkSetConst EVENT_WORK_0x4050, 6
    VMJump L_0529

L_0523:
    WorkSetConst EVENT_WORK_0x4050, 7

L_0529:
    // "2...[f000]븁\u0000\n1...[f000]븁\u0000\nACTION![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityPokemonCenter_Text_21Action, 0, 0
    VMJump L_0539

L_0539:
    ActorMsgClose

L_053B:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0
