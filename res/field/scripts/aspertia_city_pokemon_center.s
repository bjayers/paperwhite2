#include "asm/field_script.inc"
#include "text/script/aspertia_city_pokemon_center.h"

// Script plugin 13, from the zones that use this file

    ScriptEntry Script_1
    ScriptEntry Script_2
    ScriptEntry Script_3
    ScriptEntry Script_4
    ScriptEntry Script_5
    ScriptEntry Script_6
    ScriptEntry Script_7
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
    WorkSet 0x8000, 21
    WorkSet 0x8001, 1
    RTCallGlobal 10110
    VMStackPop 0x8001
    VMStackPop 0x8000
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_3:
    ActorsPauseAll
    // "Bianca: OK! I'll show you around\nthe Pokémon Center![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, AspertiaCityPokemonCenter_Text_BiancaOkIllShow, 8, 0, 0
    MsgWinCloseAll
    ActorWalkRoute 255, 7, 12, 1, 8, 0
    ActorCmdExec 8, Movement_0280
    ActorCmdWait
    ActorCmdExec 8, Movement_0290
    ActorCmdWait
    // "The Pokémon Center heals\nPokémon for free![f000]븁\u0000\nYou should bring your Pokémon here\nanytime they are weak.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, AspertiaCityPokemonCenter_Text_PokemonCenterHealsPokemon, 8, 0, 0
    MsgWinCloseAll
    // "I'll heal your Pokémon.\nHand me your Poké Ball for a sec![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, AspertiaCityPokemonCenter_Text_IllHealPokemonHand, 6, 0, 0
    MsgWinCloseAll
    PlayerSetSpecialSequence 64
    ActorCmdExec 255, Movement_0298
    ActorCmdWait
    PlayerSetSpecialSequence 8
    ActorCmdExec 255, Movement_02A0
    ActorCmdWait
    VMCall Script_7
    PokePartyRecoverAll
    RecordAdd 11, 1
    PlayerSetSpecialSequence 64
    ActorCmdExec 255, Movement_02A8
    ActorCmdWait
    PlayerSetSpecialSequence 8
    ActorCmdExec 8, Movement_02B0
    VMSleep 8
    ActorCmdExec 255, Movement_02B8
    ActorCmdWait
    // "Next, I'll explain the PC![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, AspertiaCityPokemonCenter_Text_NextIllExplainPc, 8, 0, 0
    MsgWinCloseAll
    ActorWalkRoute 255, 4, 12, 1, 8, 0
    ActorCmdExec 8, Movement_02C0
    ActorCmdWait
    ActorCmdExec 255, Movement_02CC
    ActorCmdExec 8, Movement_02D4
    ActorCmdWait
    // "This square thing is a PC!\nAny Trainer is free to use it![f000]븁\u0000\nYou can deposit Pokémon in it.[f000]븁\u0000\nAlso, you can withdraw\nPokémon from it![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, AspertiaCityPokemonCenter_Text_SquareThingPcAny, 8, 0, 0
    MsgWinCloseAll
    ActorCmdExec 8, Movement_02DC
    ActorCmdExec 255, Movement_02E4
    ActorCmdWait
    // "The next thing is over here![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, AspertiaCityPokemonCenter_Text_NextThingOverHere, 8, 0, 0
    MsgWinCloseAll
    ActorWalkRoute 8, 4, 13, 1, 8, 1
    ActorCmdWait
    ActorCmdExec 8, Movement_02EC
    ActorCmdExec 255, Movement_02F4
    ActorCmdWait
    ActorCmdExec 8, Movement_02FC
    ActorCmdExec 255, Movement_0304
    ActorCmdWait
    ActorWalkRoute 8, 9, 17, 1, 8, 0
    VMSleep 4
    ActorWalkRoute 255, 9, 16, 1, 8, 0
    ActorCmdWait
    ActorCmdExec 255, Movement_030C
    ActorCmdExec 8, Movement_0314
    ActorCmdWait
    // "This is the Poké Mart![f000]븁\u0000\nHere you can buy and\nsell many different items![f000]븁\u0000\nThe Poké Balls you use\nto catch Pokémon can also[f000]븀\u0000\nbe bought at the Poké Mart![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, AspertiaCityPokemonCenter_Text_PokeMartHereCan, 8, 0, 0
    MsgWinCloseAll
    ActorCmdExec 8, Movement_031C
    ActorCmdExec 255, Movement_0324
    ActorCmdWait
    WordSetPlayerName 0
    // "Here, [f000]Ā\u0001\u0000,\nI'll give you some Poké Balls![f000]븁\u0000"
    // "Here, [f000]Ā\u0001\u0000,\nI'll give you some Poké Balls![f000]븁\u0000"
    ActorMsgGendered 1024, AspertiaCityPokemonCenter_Text_HereIllGiveSome, AspertiaCityPokemonCenter_Text_HereIllGiveSome_2, 8, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 4
    WorkSet 0x8001, 10
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    // "Bianca: Next up![f000]븁\u0000\nI'll show you how\nto use those Poké Balls![f000]븀\u0000\nFollow me![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, AspertiaCityPokemonCenter_Text_BiancaNextUpIll, 8, 0, 0
    MsgWinCloseAll
    ActorCmdExec 8, Movement_032C
    ActorCmdWait
    SEPlay SEQ_SE_KAIDAN
    ActorDelete 8
    SEWait
    FlagReset EVENT_FLAG_0x097e
    BGMChangeMap
    WorkSetConst EVENT_WORK_0x40a1, 6
    FlagSet EVENT_FLAG_0x02dc
    FlagReset EVENT_FLAG_0x02e8
    FlagReset EVENT_FLAG_0x02e7
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0

Movement_0280:
    Move 12, 4
    Move 14, 1
    Move 35, 1
    MoveEnd

Movement_0290:
    Move 32, 1
    MoveEnd

Movement_0298:
    Move 102, 1
    MoveEnd

Movement_02A0:
    Move 0, 1
    MoveEnd

Movement_02A8:
    Move 104, 1
    MoveEnd

Movement_02B0:
    Move 34, 1
    MoveEnd

Movement_02B8:
    Move 34, 1
    MoveEnd

Movement_02C0:
    Move 14, 3
    Move 35, 1
    MoveEnd

Movement_02CC:
    Move 32, 1
    MoveEnd

Movement_02D4:
    Move 32, 1
    MoveEnd

Movement_02DC:
    Move 33, 1
    MoveEnd

Movement_02E4:
    Move 33, 1
    MoveEnd

Movement_02EC:
    Move 32, 1
    MoveEnd

Movement_02F4:
    Move 1, 1
    MoveEnd

Movement_02FC:
    Move 15, 1
    MoveEnd

Movement_0304:
    Move 13, 1
    MoveEnd

Movement_030C:
    Move 35, 1
    MoveEnd

Movement_0314:
    Move 35, 1
    MoveEnd

Movement_031C:
    Move 32, 1
    MoveEnd

Movement_0324:
    Move 33, 1
    MoveEnd

Movement_032C:
    Move 14, 2
    Move 13, 3
    MoveEnd

Script_4:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    WorkSetConst 0x8021, 0
    WorkSetConst 0x8022, 0
    PokePartyGetMemberByType 0x8021, 2
    PokePartyGetParam 0x8022, 0x8021, 112
    WordSetPlayerName 0
    WordSetPartyPokeSpecies 1, 0x8021
    WordSetLoadNature 2, 0x8022
    // "Oh?\nYour [f000]ā\u0001\u0001...[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, AspertiaCityPokemonCenter_Text_Oh, 0, 0
    // "Its Nature is [f000]Ĉ\u0001\u0002![f000]븁\u0000\nWith a Pokémon like that by your side,\nI'm sure you'll have a fun journey!"
    ParentActorMsg MSGFILE_SCRIPT, AspertiaCityPokemonCenter_Text_ItsNaturePokemonLike, 0, 0
    LastKeyWait
    MsgWinCloseAll
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_5:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "All right! Here's some advice from a\nguy who spends all of his time[f000]븀\u0000\nin Pokémon Centers![f000]븁\u0000\nWhen your Pokémon's HP goes down,\nmake sure to restore it!"
    ParentActorMsg MSGFILE_SCRIPT, AspertiaCityPokemonCenter_Text_AllRightHeresSome, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_6:
    VMStackPush EVENT_WORK_0x40a1
    VMStackPushConst 5
    VMStackCmp CMP_EQ
    VMStackPushFlag EVENT_FLAG_0x03dd
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackCmp CMP_AND
    VMJumpIf CMP_STACK, L_03D1
    ActorSetGPos 11, 1, 0, 12, 1

L_03D1:
    VMHalt
    .byte 0x00

Script_7:
    WorkSetConst 0x8020, 0
    ActorCmdExec 6, Movement_03FA
    ActorCmdWait
    PokePartyGetCount 0x8020, 1
    PokecenPlayHealingSequence 0x8020
    ActorCmdExec 6, Movement_0402
    ActorCmdWait
    VMReturn

Movement_03FA:
    Move 0, 1
    MoveEnd

Movement_0402:
    Move 1, 1
    MoveEnd
