#include "asm/field_script.inc"
#include "text/script/floccesy_town_pokemon_center.h"

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
    WorkSet 0x8000, 24
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
    // "Here is a little advice!\nKeep a lot of Potions![f000]븁\u0000\nHere is some more advice!\nKeep a lot of Poké Balls, too!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_HereLittleAdviceKeep, 0, 0
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
    PokePartyGetMemberByType 0x8020, 2
    WordSetPartyPokeSpecies 0, 0x8020
    WorkSetConst 0x8021, 0
    PokePartyGetParam 0x8021, 0x8020, 110
    VMStackPush 0x8021
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00E2
    // "Your [f000]ā\u0001\u0000 is male![f000]븁\u0000\nI wonder what the difference is\nbetween male and female Pokémon."
    ActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_MaleWonderWhatDifference, 9, 0, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_011B

L_00E2:
    VMStackPush 0x8021
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_010B
    // "Your [f000]ā\u0001\u0000 is female![f000]븁\u0000\nI wonder what the difference is\nbetween male and female Pokémon."
    ActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_FemaleWonderWhatDifference, 9, 0, 0
    LastKeyWait
    MsgWinCloseAll
    VMJump L_011B

L_010B:
    // "Your [f000]ā\u0001\u0000...\nIts gender is unknown.[f000]븁\u0000\nI wonder what the difference is between\nmale and female Pokémon."
    ActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_ItsGenderUnknownWonder, 9, 0, 0
    LastKeyWait
    MsgWinCloseAll

L_011B:
    WorkSetConst 0x8021, 0
    WorkSetConst 0x8020, 0
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_5:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "I read the Help on the PC.\nI feel I became smarter!"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_ReadHelpPcFeel, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_6:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    WorkCmpConst EVENT_WORK_0x4050, 1
    VMJumpIf CMP_EQ, L_018C
    WorkCmpConst EVENT_WORK_0x4050, 2
    VMJumpIf CMP_EQ, L_019C
    WorkCmpConst EVENT_WORK_0x4050, 3
    VMJumpIf CMP_EQ, L_01AC
    WorkCmpConst EVENT_WORK_0x4050, 4
    VMJumpIf CMP_EQ, L_01BC
    VMJump L_01CC

L_018C:
    // "Those flowers around the clock tower\nbloom in spring.[f000]븁\u0000\nDo you want to see them\nin another season?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_ThoseFlowersAroundClock, 0, 0
    VMJump L_01DC

L_019C:
    // "Summer nights are perfect for playing\nmy guitar while watching the stars.[f000]븁\u0000\nDo you want to see them\nin another season?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_SummerNightsPerfectPlaying, 0, 0
    VMJump L_01DC

L_01AC:
    // "There's a chill in the air in Autumn\nin these parts.[f000]븁\u0000\nDo you want to hurry time\nalong to another season?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_TheresChillAirAutumn, 0, 0
    VMJump L_01DC

L_01BC:
    // "It's cold enough in Floccesy to flurry\nin winter.[f000]븁\u0000\nDo you want to warm up\nin another season?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_ItsColdEnoughFloccesy, 0, 0
    VMJump L_01DC

L_01CC:
    // "You can change the season cycle\nbut think carefully.[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_CanChangeSeasonCycle, 0, 0
    VMJump L_01DC

L_01DC:
    ListMenu_AnchorTopRight 30, 8, 0, 1, 32780
    ListMenuAdd 11, 0, 0
    ListMenuAdd 12, 0, 1
    ListMenuAdd 13, 0, 2
    ListMenuAdd 14, 0, 3
    ListMenuAdd 19, 0, 4
    ListMenuShow
    ActorMsgClose
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_0258
    WorkCmpConst 0x800c, 1
    VMJumpIf CMP_EQ, L_026E
    WorkCmpConst 0x800c, 2
    VMJumpIf CMP_EQ, L_0284
    WorkCmpConst 0x800c, 3
    VMJumpIf CMP_EQ, L_029A
    WorkCmpConst 0x800c, 4
    VMJumpIf CMP_EQ, L_02B0
    VMJump L_035D

L_0258:
    WorkSetConst EVENT_WORK_0x4050, 1
    // "Go check out that clock tower,\nyou hear?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_GoCheckOutClock, 0, 0
    VMJump L_035B

L_026E:
    WorkSetConst EVENT_WORK_0x4050, 2
    // "Maybe your Pokémon would\nlike Stargazing too.[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_MaybePokemonWouldLike, 0, 0
    VMJump L_035B

L_0284:
    WorkSetConst EVENT_WORK_0x4050, 3
    // "Route 20's autumn leaves\nare second to none![f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_Route20sAutumnLeaves, 0, 0
    VMJump L_035B

L_029A:
    WorkSetConst EVENT_WORK_0x4050, 4
    // "Stay warm, you hear?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_StayWarmHear, 0, 0
    VMJump L_035B

L_02B0:
    // "Experiencing the seasons naturally, eh?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_ExperiencingSeasonsNaturallyEh, 0, 0
    ListMenu_AnchorTopRight 30, 8, 0, 1, 32780
    ListMenuAdd 21, 0, 4
    ListMenuAdd 22, 0, 5
    ListMenuAdd 23, 0, 6
    ListMenuAdd 24, 0, 7
    ListMenuShow
    ActorMsgClose
    WorkCmpConst 0x800c, 4
    VMJumpIf CMP_EQ, L_0321
    WorkCmpConst 0x800c, 5
    VMJumpIf CMP_EQ, L_032D
    WorkCmpConst 0x800c, 6
    VMJumpIf CMP_EQ, L_0339
    WorkCmpConst 0x800c, 7
    VMJumpIf CMP_EQ, L_0345
    VMJump L_035D

L_0321:
    WorkSetConst EVENT_WORK_0x4050, 0
    VMJump L_034B

L_032D:
    WorkSetConst EVENT_WORK_0x4050, 5
    VMJump L_034B

L_0339:
    WorkSetConst EVENT_WORK_0x4050, 6
    VMJump L_034B

L_0345:
    WorkSetConst EVENT_WORK_0x4050, 7

L_034B:
    // "That's the best way to feel\nthe seasons, after all.[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, FloccesyTownPokemonCenter_Text_ThatsBestWayFeel, 0, 0
    VMJump L_035B

L_035B:
    ActorMsgClose

L_035D:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0
