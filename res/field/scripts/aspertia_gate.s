#include "asm/field_script.inc"
#include "text/script/aspertia_gate.h"

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
    ActorCmdExec 0, Movement_00D2
    ActorCmdWait
    WordSetPlayerName 0
    // "Hey! [f000]Ā\u0001\u0000!\nYou can't go without...[f000]븁\u0000\n...Oh?[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, AspertiaGate_Text_HeyCantGoWithout, 0, 0, 0
    MsgWinCloseAll
    PlayerGetGPos 0x8021, 0x8022
    VMStackPush 0x8021
    VMStackPushConst 7
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0066
    ActorCmdExec 255, Movement_00DA
    VMJump L_0074

L_0066:
    ActorWalkRoute 255, 7, 0x8022, 1, 8, 0

L_0074:
    ActorCmdWait
    WordSetPlayerName 0
    PokePartyGetMemberByType 0x8023, 2
    WordSetPartyPokeSpecies 1, 0x8023
    // "You're with [f000]ā\u0001\u0001![f000]븁\u0000\nOK. This is a going-away gift!\nDon't be shy. Take it.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, AspertiaGate_Text_YoureOkGoingAway, 0, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 17
    WorkSet 0x8001, 1
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    WordSetPlayerName 0
    // "When Pokémon get hurt, take it easy\nand go to a Pokémon Center."
    ActorMsg MSGFILE_SCRIPT, AspertiaGate_Text_WhenPokemonGetHurt, 0, 0, 0
    LastKeyWait
    MsgWinCloseAll
    WorkSetConst EVENT_WORK_0x40e0, 1
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Movement_00D2:
    Move 75, 1
    MoveEnd

Movement_00DA:
    Move 35, 1
    MoveEnd

Script_3:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMStackPush EVENT_WORK_0x40e0
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_015F
    WordSetPlayerName 0
    // "Hey! [f000]Ā\u0001\u0000!\nYou can't go without...[f000]븁\u0000\n...Oh?[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, AspertiaGate_Text_HeyCantGoWithout, 0, 0
    WordSetPlayerName 0
    PokePartyGetMemberByType 0x8023, 2
    WordSetPartyPokeSpecies 1, 0x8023
    // "You're with [f000]ā\u0001\u0001![f000]븁\u0000\nOK. This is a going-away gift!\nDon't be shy. Take it.[f000]븁\u0000"
    ParentActorMsg MSGFILE_SCRIPT, AspertiaGate_Text_YoureOkGoingAway, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 17
    WorkSet 0x8001, 1
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    WordSetPlayerName 0
    // "When Pokémon get hurt, take it easy\nand go to a Pokémon Center."
    ActorMsg MSGFILE_SCRIPT, AspertiaGate_Text_WhenPokemonGetHurt, 0, 0, 0
    WorkSetConst EVENT_WORK_0x40e0, 1
    VMJump L_016C

L_015F:
    WordSetPlayerName 0
    // "[f000]Ā\u0001\u0000,\nhow is your journey?"
    ParentActorMsg MSGFILE_SCRIPT, AspertiaGate_Text_HowJourney, 0, 0

L_016C:
    LastKeyWait
    MsgWinCloseAll
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_4:
    ActorsPauseAll
    VMStackPushFlag EVENT_FLAG_0x0960
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01A5
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Remember that?[f000]븁\u0000\nThe day you passed this gate\nwith your Pokémon for the first time."
    ParentActorMsg MSGFILE_SCRIPT, AspertiaGate_Text_RememberDayPassedGate, 0, 0
    LastKeyWait
    ActorMsgClose
    VMJump L_01FA

L_01A5:
    VMStackPush EVENT_WORK_0x4000
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01E6
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Hmm...\nI see. I see![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, AspertiaGate_Text_HmmSeeSee, 1, 0, 0
    // "I love to read news and information\nabout the city displayed[f000]븀\u0000\non the electric bulletin board[f000]븀\u0000\non the wall!"
    ActorMsg MSGFILE_SCRIPT, AspertiaGate_Text_LoveReadNewsInformation, 1, 0, 0
    LastKeyWait
    MsgWinCloseAll
    WorkSetConst EVENT_WORK_0x4000, 1
    VMJump L_01FA

L_01E6:
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "I love to read news and information\nabout the city displayed[f000]븀\u0000\non the electric bulletin board[f000]븀\u0000\non the wall!"
    ParentActorMsg MSGFILE_SCRIPT, AspertiaGate_Text_LoveReadNewsInformation, 0, 0
    LastKeyWait
    ActorMsgClose

L_01FA:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_5:
    RTCGetSeason 0x8009
    FlagSet EVENT_FLAG_0x01f4
    FlagSet EVENT_FLAG_0x01f5
    FlagSet EVENT_FLAG_0x01f6
    FlagSet EVENT_FLAG_0x01f7
    FlagSet EVENT_FLAG_0x01f8
    FlagSet EVENT_FLAG_0x01f9
    FlagSet EVENT_FLAG_0x01fa
    FlagSet EVENT_FLAG_0x01fb
    FlagSet EVENT_FLAG_0x01fc
    FlagSet EVENT_FLAG_0x01fd
    FlagSet EVENT_FLAG_0x01fe
    FlagSet EVENT_FLAG_0x01ff
    FlagSet EVENT_FLAG_0x0200
    FlagSet EVENT_FLAG_0x0201
    FlagSet EVENT_FLAG_0x0202
    FlagSet EVENT_FLAG_0x0203
    FlagSet EVENT_FLAG_0x0204
    FlagSet EVENT_FLAG_0x0205
    FlagSet EVENT_FLAG_0x0206
    FlagSet EVENT_FLAG_0x0207
    FlagSet EVENT_FLAG_0x0208
    FlagSet EVENT_FLAG_0x0209
    FlagSet EVENT_FLAG_0x020a
    FlagSet EVENT_FLAG_0x020b
    FlagSet EVENT_FLAG_0x020c
    FlagSet EVENT_FLAG_0x020d
    FlagSet EVENT_FLAG_0x020e
    FlagSet EVENT_FLAG_0x020f
    FlagSet EVENT_FLAG_0x0210
    FlagSet EVENT_FLAG_0x0211
    FlagSet EVENT_FLAG_0x0212
    FlagSet EVENT_FLAG_0x0213
    FlagSet EVENT_FLAG_0x0214
    FlagSet EVENT_FLAG_0x0215
    FlagSet EVENT_FLAG_0x0216
    FlagSet EVENT_FLAG_0x0217
    FlagSet EVENT_FLAG_0x0218
    FlagSet EVENT_FLAG_0x0219
    FlagSet EVENT_FLAG_0x021a
    FlagSet EVENT_FLAG_0x021b
    FlagSet EVENT_FLAG_0x021d
    FlagSet EVENT_FLAG_0x021e
    FlagSet EVENT_FLAG_0x021f
    FlagSet EVENT_FLAG_0x0220
    FlagSet EVENT_FLAG_0x0221
    FlagSet EVENT_FLAG_0x0222
    FlagSet EVENT_FLAG_0x0223
    FlagSet EVENT_FLAG_0x0224
    FlagSet EVENT_FLAG_0x0225
    FlagReset EVENT_FLAG_0x0226
    Random 0x800a, 3
    Random 0x800b, 3
    Random 0x800c, 3
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_02F1
    VMJump L_03C4

L_02F1:
    FlagReset EVENT_FLAG_0x01f4
    WorkCmpConst 0x800a, 0
    VMJumpIf CMP_EQ, L_0308
    VMJump L_030C

L_0308:
    FlagReset EVENT_FLAG_0x01f5

L_030C:
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_031F
    VMJump L_0323

L_031F:
    FlagReset EVENT_FLAG_0x01f6

L_0323:
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_0336
    VMJump L_033A

L_0336:
    FlagReset EVENT_FLAG_0x01f7

L_033A:
    WorkCmpConst 0x800b, 0
    VMJumpIf CMP_EQ, L_034D
    VMJump L_0351

L_034D:
    FlagReset EVENT_FLAG_0x01f8

L_0351:
    WorkCmpConst 0x800b, 1
    VMJumpIf CMP_EQ, L_0364
    VMJump L_0368

L_0364:
    FlagReset EVENT_FLAG_0x01f9

L_0368:
    WorkCmpConst 0x800b, 2
    VMJumpIf CMP_EQ, L_037B
    VMJump L_037F

L_037B:
    FlagReset EVENT_FLAG_0x01fa

L_037F:
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_0392
    VMJump L_0396

L_0392:
    FlagReset EVENT_FLAG_0x01fb

L_0396:
    WorkCmpConst 0x800c, 1
    VMJumpIf CMP_EQ, L_03A9
    VMJump L_03AD

L_03A9:
    FlagReset EVENT_FLAG_0x01fc

L_03AD:
    WorkCmpConst 0x800c, 2
    VMJumpIf CMP_EQ, L_03C0
    VMJump L_03C4

L_03C0:
    FlagReset EVENT_FLAG_0x01fd

L_03C4:
    WorkCmpConst 0x8009, 1
    VMJumpIf CMP_EQ, L_03D7
    VMJump L_04AA

L_03D7:
    FlagReset EVENT_FLAG_0x01fe
    WorkCmpConst 0x800a, 0
    VMJumpIf CMP_EQ, L_03EE
    VMJump L_03F2

L_03EE:
    FlagReset EVENT_FLAG_0x01ff

L_03F2:
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_0405
    VMJump L_0409

L_0405:
    FlagReset EVENT_FLAG_0x0200

L_0409:
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_041C
    VMJump L_0420

L_041C:
    FlagReset EVENT_FLAG_0x0201

L_0420:
    WorkCmpConst 0x800b, 0
    VMJumpIf CMP_EQ, L_0433
    VMJump L_0437

L_0433:
    FlagReset EVENT_FLAG_0x0202

L_0437:
    WorkCmpConst 0x800b, 1
    VMJumpIf CMP_EQ, L_044A
    VMJump L_044E

L_044A:
    FlagReset EVENT_FLAG_0x0203

L_044E:
    WorkCmpConst 0x800b, 2
    VMJumpIf CMP_EQ, L_0461
    VMJump L_0465

L_0461:
    FlagReset EVENT_FLAG_0x0204

L_0465:
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_0478
    VMJump L_047C

L_0478:
    FlagReset EVENT_FLAG_0x0205

L_047C:
    WorkCmpConst 0x800c, 1
    VMJumpIf CMP_EQ, L_048F
    VMJump L_0493

L_048F:
    FlagReset EVENT_FLAG_0x0206

L_0493:
    WorkCmpConst 0x800c, 2
    VMJumpIf CMP_EQ, L_04A6
    VMJump L_04AA

L_04A6:
    FlagReset EVENT_FLAG_0x0207

L_04AA:
    WorkCmpConst 0x8009, 2
    VMJumpIf CMP_EQ, L_04BD
    VMJump L_0590

L_04BD:
    FlagReset EVENT_FLAG_0x0208
    WorkCmpConst 0x800a, 0
    VMJumpIf CMP_EQ, L_04D4
    VMJump L_04D8

L_04D4:
    FlagReset EVENT_FLAG_0x0209

L_04D8:
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_04EB
    VMJump L_04EF

L_04EB:
    FlagReset EVENT_FLAG_0x020a

L_04EF:
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_0502
    VMJump L_0506

L_0502:
    FlagReset EVENT_FLAG_0x020b

L_0506:
    WorkCmpConst 0x800b, 0
    VMJumpIf CMP_EQ, L_0519
    VMJump L_051D

L_0519:
    FlagReset EVENT_FLAG_0x020c

L_051D:
    WorkCmpConst 0x800b, 1
    VMJumpIf CMP_EQ, L_0530
    VMJump L_0534

L_0530:
    FlagReset EVENT_FLAG_0x020d

L_0534:
    WorkCmpConst 0x800b, 2
    VMJumpIf CMP_EQ, L_0547
    VMJump L_054B

L_0547:
    FlagReset EVENT_FLAG_0x020e

L_054B:
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_055E
    VMJump L_0562

L_055E:
    FlagReset EVENT_FLAG_0x020f

L_0562:
    WorkCmpConst 0x800c, 1
    VMJumpIf CMP_EQ, L_0575
    VMJump L_0579

L_0575:
    FlagReset EVENT_FLAG_0x0210

L_0579:
    WorkCmpConst 0x800c, 2
    VMJumpIf CMP_EQ, L_058C
    VMJump L_0590

L_058C:
    FlagReset EVENT_FLAG_0x0211

L_0590:
    WorkCmpConst 0x8009, 3
    VMJumpIf CMP_EQ, L_05A3
    VMJump L_0676

L_05A3:
    FlagReset EVENT_FLAG_0x0212
    WorkCmpConst 0x800a, 0
    VMJumpIf CMP_EQ, L_05BA
    VMJump L_05BE

L_05BA:
    FlagReset EVENT_FLAG_0x0213

L_05BE:
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_05D1
    VMJump L_05D5

L_05D1:
    FlagReset EVENT_FLAG_0x0214

L_05D5:
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_05E8
    VMJump L_05EC

L_05E8:
    FlagReset EVENT_FLAG_0x0215

L_05EC:
    WorkCmpConst 0x800b, 0
    VMJumpIf CMP_EQ, L_05FF
    VMJump L_0603

L_05FF:
    FlagReset EVENT_FLAG_0x0216

L_0603:
    WorkCmpConst 0x800b, 1
    VMJumpIf CMP_EQ, L_0616
    VMJump L_061A

L_0616:
    FlagReset EVENT_FLAG_0x0217

L_061A:
    WorkCmpConst 0x800b, 2
    VMJumpIf CMP_EQ, L_062D
    VMJump L_0631

L_062D:
    FlagReset EVENT_FLAG_0x0218

L_0631:
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_0644
    VMJump L_0648

L_0644:
    FlagReset EVENT_FLAG_0x0219

L_0648:
    WorkCmpConst 0x800c, 1
    VMJumpIf CMP_EQ, L_065B
    VMJump L_065F

L_065B:
    FlagReset EVENT_FLAG_0x021a

L_065F:
    WorkCmpConst 0x800c, 2
    VMJumpIf CMP_EQ, L_0672
    VMJump L_0676

L_0672:
    FlagReset EVENT_FLAG_0x021b

L_0676:
    Random 0x800a, 3
    WorkCmpConst 0x800a, 0
    VMJumpIf CMP_EQ, L_068F
    VMJump L_0693

L_068F:
    FlagReset EVENT_FLAG_0x021d

L_0693:
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_06A6
    VMJump L_06AA

L_06A6:
    FlagReset EVENT_FLAG_0x021e

L_06AA:
    WorkCmpConst 0x800a, 2
    VMJumpIf CMP_EQ, L_06BD
    VMJump L_06C1

L_06BD:
    FlagReset EVENT_FLAG_0x021f

L_06C1:
    Random 0x800b, 3
    WorkCmpConst 0x800b, 0
    VMJumpIf CMP_EQ, L_06DA
    VMJump L_06DE

L_06DA:
    FlagReset EVENT_FLAG_0x0220

L_06DE:
    WorkCmpConst 0x800b, 1
    VMJumpIf CMP_EQ, L_06F1
    VMJump L_06F5

L_06F1:
    FlagReset EVENT_FLAG_0x0221

L_06F5:
    WorkCmpConst 0x800b, 2
    VMJumpIf CMP_EQ, L_0708
    VMJump L_070C

L_0708:
    FlagReset EVENT_FLAG_0x0222

L_070C:
    Random 0x800c, 3
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_0725
    VMJump L_0729

L_0725:
    FlagReset EVENT_FLAG_0x0223

L_0729:
    WorkCmpConst 0x800c, 1
    VMJumpIf CMP_EQ, L_073C
    VMJump L_0740

L_073C:
    FlagReset EVENT_FLAG_0x0224

L_0740:
    WorkCmpConst 0x800c, 2
    VMJumpIf CMP_EQ, L_0753
    VMJump L_0757

L_0753:
    FlagReset EVENT_FLAG_0x0225

L_0757:
    VMHalt
    .balign 4, 0
