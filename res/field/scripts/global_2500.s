#include "asm/field_script.inc"
#include "text/script/global_2500.h"

    ScriptEntry Script_1
    ScriptEntry Script_2
    ScriptEntry Script_3
    ScriptEntry Script_4
    ScriptEntry Script_5
    ScriptEntry Script_6
    ScriptEntry Script_7
    ScriptEntry Script_8
    ScriptEntriesEnd

Script_1:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    // "It's lined with Pokémon picture books."
    InfoMsg Global2500_Text_ItsLinedPokemonPicture, 2
    LastKeyWait
    InfoMsgClose_0039
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_2:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    // "Are these books for Pokémon\nto read?"
    InfoMsg Global2500_Text_TheseBooksPokemonRead, 2
    LastKeyWait
    InfoMsgClose_0039
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_3:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    // "It's chock full of Pokémon books and\nphoto collections."
    InfoMsg Global2500_Text_ItsChockFullPokemon, 2
    LastKeyWait
    InfoMsgClose_0039
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_4:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    // "There are lots of Pokémon magazines![f000]븁\u0000\n“Pokémon Pal\"\n“Pokémon Handbook\"[f000]븀\u0000\n“Adorable Pokémon\""
    InfoMsg Global2500_Text_ThereLotsPokemonMagazines, 2
    LastKeyWait
    InfoMsgClose_0039
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_5:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    PokePartyGetCount 0x8008, 0
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_00D9
    FlagGet EVENT_FLAG_0x0227, 0x8008
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_00D9
    Random 0x8008, 100
    WorkCmpConst 0x8008, 95
    VMJumpIf CMP_GE, L_02F8
    WorkCmpConst 0x8008, 85
    VMJumpIf CMP_GE, L_0103
    WorkCmpConst 0x8008, 70
    VMJumpIf CMP_GE, L_00E8
    VMJump L_00D9

L_00D9:
    // "It's a trash can."
    InfoMsg Global2500_Text_ItsTrashCan, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_036E

L_00E8:
    Random 0x8008, 8
    WorkAdd 0x8008, 12
    InfoMsg 0x8008, 2
    LastKeyWait
    InfoMsgClose_0039
    VMJump L_036E

L_0103:
    Random 0x8008, 100
    WorkCmpConst 0x8008, 99
    VMJumpIf CMP_EQ, L_011C
    VMJump L_0134

L_011C:
    Random 0x8008, 16
    WorkGet 0x8000, 0x8008
    WorkAdd 0x8000, 1
    VMJump L_02CA

L_0134:
    WorkCmpConst 0x8008, 98
    VMJumpIf CMP_EQ, L_0147
    VMJump L_015F

L_0147:
    Random 0x8008, 9
    WorkGet 0x8000, 0x8008
    WorkAdd 0x8000, 492
    VMJump L_02CA

L_015F:
    WorkCmpConst 0x8008, 90
    VMJumpIf CMP_GE, L_0172
    VMJump L_017E

L_0172:
    WorkSetConst 0x8000, 234
    VMJump L_02CA

L_017E:
    WorkCmpConst 0x8008, 80
    VMJumpIf CMP_GE, L_0191
    VMJump L_01A9

L_0191:
    Random 0x8008, 2
    WorkGet 0x8000, 0x8008
    WorkAdd 0x8000, 42
    VMJump L_02CA

L_01A9:
    WorkCmpConst 0x8008, 70
    VMJumpIf CMP_GE, L_01BC
    VMJump L_01D4

L_01BC:
    Random 0x8008, 4
    WorkGet 0x8000, 0x8008
    WorkAdd 0x8000, 30
    VMJump L_02CA

L_01D4:
    WorkCmpConst 0x8008, 60
    VMJumpIf CMP_GE, L_01E7
    VMJump L_01FF

L_01E7:
    Random 0x8008, 9
    WorkGet 0x8000, 0x8008
    WorkAdd 0x8000, 86
    VMJump L_02CA

L_01FF:
    WorkCmpConst 0x8008, 55
    VMJumpIf CMP_GE, L_0212
    VMJump L_022A

L_0212:
    Random 0x8008, 9
    WorkGet 0x8000, 0x8008
    WorkAdd 0x8000, 45
    VMJump L_02CA

L_022A:
    WorkCmpConst 0x8008, 3
    VMJumpIf CMP_EQ, L_023D
    VMJump L_0255

L_023D:
    Random 0x8008, 92
    WorkGet 0x8000, 0x8008
    WorkAdd 0x8000, 328
    VMJump L_02CA

L_0255:
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0268
    VMJump L_0274

L_0268:
    WorkSetConst 0x8000, 259
    VMJump L_02CA

L_0274:
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0287
    VMJump L_0293

L_0287:
    WorkSetConst 0x8000, 504
    VMJump L_02CA

L_0293:
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_02A6
    VMJump L_02B2

L_02A6:
    WorkSetConst 0x8000, 591
    VMJump L_02CA

L_02B2:
    Random 0x8008, 64
    WorkGet 0x8000, 0x8008
    WorkAdd 0x8000, 149
    VMJump L_02CA

L_02CA:
    ItemCheckSpace 0x8000, 1, 0x800c
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_036E
    // "Someone threw this away?"
    InfoMsg Global2500_Text_SomeoneThrewAway, 2
    LastKeyWait
    InfoMsgClose_0039
    WorkSetConst 0x8001, 1
    RTCallGlobal 2805
    VMJump L_036E

L_02F8:
    Random 0x8008, 100
    WorkCmpConst 0x8008, 90
    VMJumpIf CMP_GE, L_034F
    WorkCmpConst 0x8009, 40
    VMJumpIf CMP_GT, L_031E
    VMJump L_0337

L_031E:
    Random 0x8008, 100
    WorkCmpConst 0x8008, 70
    VMJumpIf CMP_GE, L_0343
    VMJump L_0337

L_0337:
    WorkSetConst 0x8010, 568
    VMJump L_035B

L_0343:
    WorkSetConst 0x8010, 569
    VMJump L_035B

L_034F:
    WorkSetConst 0x8010, 446
    VMJump L_035B

L_035B:
    // "There's a Pokémon inside!"
    InfoMsg Global2500_Text_TheresPokemonInside, 2
    LastKeyWait
    InfoMsgClose_0039
    RTCallGlobal 10854
    VMJump L_036E

L_036E:
    RecordAdd 43, 1
    JoinAvenueRecordActivity 11
    FlagSet EVENT_FLAG_0x0227
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_6:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    // "The shelves are jammed with vibrant\nPokémon goods."
    InfoMsg Global2500_Text_ShelvesJammedVibrantPokemon, 2
    LastKeyWait
    InfoMsgClose_0039
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_7:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    // "It looks like a cabinet full of\nPokémon goods."
    InfoMsg Global2500_Text_LooksLikeCabinetFull, 2
    LastKeyWait
    InfoMsgClose_0039
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_8:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    // "Goods are arranged on the shelves in a\nvery orderly fashion."
    InfoMsg Global2500_Text_GoodsArrangedShelvesVery, 2
    LastKeyWait
    InfoMsgClose_0039
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .balign 4, 0
