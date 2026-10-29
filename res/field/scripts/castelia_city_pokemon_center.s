#include "asm/field_script.inc"
#include "text/script/castelia_city_pokemon_center.h"

// Script plugin 13, from the zones that use this file

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
    WorkSet 0x8000, 3
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
    PokePartyGetCount 0x8024, 4
    VMStackPush 0x8024
    VMStackPushConst 0
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_00B7
    VMCall Script_8
    VMJump L_00BD

L_00B7:
    VMCall Script_9

L_00BD:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_4:
    ActorsPauseAll
    WorkSetConst 0x8022, 0
    WorkSetConst 0x8023, 0
    PlayerGetDir 0x8022
    UnityTowerGetVisitorCountry 0x8023
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMStackPushFlag EVENT_FLAG_0x0104
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackPush EVENT_WORK_0x4001
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_0164
    // "Wanna recover Pokémon?\nOh, soooooorry![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCityPokemonCenter_Text_WannaRecoverPokemonOh, 0, 0
    MsgWinCloseAll
    WorkCmpConst 0x8022, 0
    VMJumpIf CMP_EQ, L_012F
    WorkCmpConst 0x8022, 3
    VMJumpIf CMP_EQ, L_012F
    VMJump L_013D

L_012F:
    ActorCmdExec 8, Movement_020A
    VMJump L_015E

L_013D:
    WorkCmpConst 0x8022, 2
    VMJumpIf CMP_EQ, L_0150
    VMJump L_015E

L_0150:
    ActorCmdExec 8, Movement_021A
    VMJump L_015E

L_015E:
    VMSleep 8
    ActorCmdWait

L_0164:
    // "Do you know Geonet?"
    ActorMsg MSGFILE_SCRIPT, CasteliaCityPokemonCenter_Text_KnowGeonet, 8, 2, 0
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackPush 0x8023
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_01AD
    // "You! You, using Geonet!\nI'll tell you something good[f000]븀\u0000\nbecause you're great.[f000]븁\u0000\nWith the latest technology, we can trade\nPokémon with people far away![f000]븁\u0000\n...I know it sounds crazy,\nbut give it a try. You'll be surprised!"
    ActorMsg MSGFILE_SCRIPT, CasteliaCityPokemonCenter_Text_UsingGeonetIllTell, 8, 2, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_0200

L_01AD:
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackPush 0x8023
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_01E6
    // "Oh! You know Geonet!\nGreat, great![f000]븁\u0000\nThis is even greater, lemme tell ya![f000]븁\u0000\nIf you try Geonet, you can register\nthe place where you live!"
    ActorMsg MSGFILE_SCRIPT, CasteliaCityPokemonCenter_Text_OhKnowGeonetGreat, 8, 2, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_0200

L_01E6:
    ActorCmdExec 8, Movement_022A
    ActorCmdWait
    // "You see the globe on the second floor\nof this Pokémon Center?[f000]븁\u0000\nThat is Geonet.[f000]븁\u0000\nIf you check on Geonet, you can register\nthe place where you live!"
    ActorMsg MSGFILE_SCRIPT, CasteliaCityPokemonCenter_Text_SeeGlobeSecondFloor, 8, 2, 0
    LastKeyWait
    MsgWinCloseAll

L_0200:
    FlagSet EVENT_FLAG_0x0104
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_020A:
    Move 15, 2
    Move 34, 1
    Move 63, 1
    MoveEnd

Movement_021A:
    Move 14, 1
    Move 35, 1
    Move 63, 1
    MoveEnd

Movement_022A:
    Move 32, 1
    MoveEnd

Script_5:
    WorkSetConst 0x8020, 0
    WorkSetConst 0x8021, 0
    PlayerGetGPos 0x8020, 0x8021
    VMStackPushFlag EVENT_FLAG_0x0104
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0292
    VMStackPush 0x8020
    VMStackPushConst 7
    VMStackCmp CMP_EQ
    VMStackPush 0x8021
    VMStackPushConst 12
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_0280
    VMJump L_0292

L_0280:
    ActorSetGPos 8, 7, 0, 12, 0
    WorkSetConst EVENT_WORK_0x4001, 1

L_0292:
    RTCallGlobal 10395
    WorkSetConst 0x8021, 0
    WorkSetConst 0x8020, 0
    VMHalt

Script_6:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Fennel has moved to Castelia City![f000]븁\u0000\nFennel is a professor who is\nresearching about Pokémon Trainers!"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCityPokemonCenter_Text_FennelHasMovedCastelia, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_7:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    PVPlay 531, 0
    // "Au-di-no?"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCityPokemonCenter_Text_AuDiNo, 0, 0
    PVWait
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_8:
    // "I want to know\neveryone's favorite kind of Pokémon!"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCityPokemonCenter_Text_WantKnowEveryonesFavorite, 0, 0
    LastKeyWait
    MsgWinCloseAll
    VMReturn

Script_9:
    PokePartyIsEgg 0x8025, 0
    VMStackPush 0x8025
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_031D
    // "Your favorite is that Egg, isn't it?"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCityPokemonCenter_Text_FavoriteEggIsnt, 0, 0
    VMJump L_032C

L_031D:
    WordSetPartyPokeSpecies 0, 0
    // "Your favorite is [f000]ā\u0001\u0000, isn't it?"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCityPokemonCenter_Text_FavoriteIsnt, 0, 0

L_032C:
    YesNoWin 0x8010
    VMStackPush 0x8010
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0357
    TrainerCardSetFavePokemon 0
    // "Yes, I was right! I thought so!"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCityPokemonCenter_Text_YesRightThought, 0, 0
    VMJump L_0389

L_0357:
    VMStackPush 0x8025
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_037A
    // "...Oh? Your favorite really is that Egg,\nisn't it?"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCityPokemonCenter_Text_OhFavoriteReallyEgg, 0, 0
    VMJump L_0389

L_037A:
    WordSetPartyPokeSpecies 0, 0
    // "What? Your favorite isn't [f000]ā\u0001\u0000?!"
    ParentActorMsg MSGFILE_SCRIPT, CasteliaCityPokemonCenter_Text_WhatFavoriteIsnt, 0, 0

L_0389:
    LastKeyWait
    MsgWinCloseAll
    VMReturn
    .byte 0x00

Script_10:
    RTCallGlobal 10852
    VMHalt
    .balign 4, 0
