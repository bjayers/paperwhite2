#include "asm/field_script.inc"
#include "text/script/white_forest_pokemon_center.h"

// Script plugin 13, from the zones that use this file

    ScriptEntry Script_1
    ScriptEntry Script_2
    ScriptEntry Script_3
    ScriptEntry Script_4
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
    WorkSet 0x8000, 13
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
    // "Do you enjoy spending time\nin undisturbed nature?[f000]븁\u0000\nOr do you prefer nature sculpted into\na shape that pleases people?[f000]븁\u0000\nWhich suits you better?"
    ParentActorMsg MSGFILE_SCRIPT, WhiteForestPokemonCenter_Text_EnjoySpendingTimeUndisturbed, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

// Paper White 2: the exit leads to Black City or White Forest, as the place is now: the other city's exit is moved off
// the doorway (paperwhite2/version_places.h)
Script_4:
    VMCall L_Exit
    VMHalt

L_Exit:
    VMStackPushFlag EVENT_FLAG_BLACK2_BLACK_CITY
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_ExitWhiteForest
    ObjInitWarpGPos 0, 0, 0, 0
    VMReturn

L_ExitWhiteForest:
    ObjInitWarpGPos 1, 0, 0, 0
    VMReturn

    .balign 4, 0
