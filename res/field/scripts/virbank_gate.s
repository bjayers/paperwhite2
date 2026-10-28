#include "asm/field_script.inc"
#include "text/script/virbank_gate.h"

    ScriptEntry Script_1
    ScriptEntry Script_2
    ScriptEntry Script_3
    ScriptEntry Script_4
    ScriptEntry Script_5
    ScriptEntriesEnd

Script_1:
    ActorsPauseAll
    GimmickGateViewBoard 36
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_2:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "You know what they say.\nCheerful company shortens the miles!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankGate_Text_KnowWhatTheySay, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_3:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Do you know about Audino, the Pokémon\nwho hide in rustling grass?[f000]븁\u0000\nI wonder why Audino give other Pokémon\nso many Exp. Points."
    ParentActorMsg MSGFILE_SCRIPT, VirbankGate_Text_KnowAboutAudinoPokemon, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_4:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "When we walk, grass rustles!\nIt's Pokémon hide-and-seek!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankGate_Text_WhenWeWalkGrass, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_5:
    ActorsPauseAll
    PlayerGetGPos 0x8021, 0x8022
    ActorCmdExec 0, Movement_0176
    VMSleep 4
    ActorCmdExec 255, Movement_017E
    ActorCmdWait
    VMStackPush 0x8022
    VMStackPushConst 4
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00B9
    // "Hello!\nOh, you...[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankGate_Text_HelloOh, 0, 0, 0
    VMJump L_00BE

L_00B9:
    // "Hello!\nOh, you...[f000]븁\u0000"
    InfoMsg VirbankGate_Text_HelloOh, 1

L_00BE:
    MsgWinCloseAll
    VMStackPush 0x8022
    VMStackPushConst 4
    VMStackCmp CMP_NE
    VMJumpIf CMP_STACK, L_00E1
    ActorWalkRoute 255, 13, 4, 1, 8, 1

L_00E1:
    ActorCmdWait
    WorkSetConst 0x8023, 0
    PokePartyGetCount 0x8023, 1
    WorkSetConst 0x8024, 0
    PokePartyGetMemberByType 0x8024, 2
    WordSetPartyPokeSpecies 0, 0x8024
    WordSetNumber 1, 0x8023, 1
    VMStackPush 0x8023
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_012C
    // "You are with one Pokémon!\nYou love [f000]ā\u0001\u0000 very much, right?[f000]븁\u0000\nBut are you OK?\nYou'll be in trouble when you encounter[f000]븀\u0000\nPokémon that [f000]ā\u0001\u0000 is weak against.[f000]븁\u0000\nHere! I'll give you these,\nso you can have more Pokémon.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankGate_Text_OnePokemonLoveVery, 0, 0, 0
    VMJump L_0138

L_012C:
    // "You are with [f000]Ȁ\u0001\u0001 Pokémon.[f000]븁\u0000\nBut if you have more Pokémon,\nyour journey should be even more fun![f000]븁\u0000\nHere! I'll give you these,\nso why don't you catch more Pokémon?[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankGate_Text_PokemonButIfHave, 0, 0, 0

L_0138:
    MsgWinCloseAll
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 3
    WorkSet 0x8001, 2
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    // "You know what they say.\nCheerful company shortens the miles!"
    ActorMsg MSGFILE_SCRIPT, VirbankGate_Text_KnowWhatTheySay, 0, 0, 0
    LastKeyWait
    MsgWinCloseAll
    WorkSetConst EVENT_WORK_0x4151, 1
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Movement_0176:
    Move 75, 1
    MoveEnd

Movement_017E:
    Move 32, 1
    MoveEnd
    .balign 4, 0
