#include "asm/field_script.inc"
#include "text/script/aspertia_city_pokemon_center.h"

    ScriptEntry Script_1
    ScriptEntry Script_2
    ScriptEntry Script_3
    ScriptEntry Script_4
    ScriptEntry Script_5
    ScriptEntry Script_6
    ScriptEntry Script_7
    ScriptEntriesEnd

Script_1:
    VMHalt

Script_2:
    ActorsPauseAll
    ActorSetEyeToEye
    FlagGet EVENT_FLAG_DAILY_0x0af0, 0x800a
    WorkCmpConst 0x800a, 1
    VMJumpIf CMP_EQ, L_00FA
    Random 0x8008, 100
    WorkCmpConst 0x8008, 99
    VMJumpIf CMP_EQ, L_0077
    WorkCmpConst 0x8008, 90
    VMJumpIf CMP_GE, L_0083
    WorkCmpConst 0x8008, 70
    VMJumpIf CMP_GE, L_0095
    WorkCmpConst 0x8008, 40
    VMJumpIf CMP_GE, L_00A7
    VMJump L_00B9

L_0077:
    WorkSetConst 0x8000, 1
    VMJump L_00C5

L_0083:
    Random 0x8000, 92
    WorkAdd 0x8000, 328
    VMJump L_00C5

L_0095:
    Random 0x8000, 9
    WorkAdd 0x8000, 45
    VMJump L_00C5

L_00A7:
    Random 0x8000, 9
    WorkAdd 0x8000, 86
    VMJump L_00C5

L_00B9:
    WorkSetConst 0x8000, 50
    VMJump L_00C5

L_00C5:
    ItemCheckSpace 0x8000, 1, 0x800c
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_010C
    WorkSetConst 0x8001, 1
    // "Thank you for your visit!\nHere's you're daily gift...[f000]븁\u0000"
    ParentActorMsg 172, AspertiaCityPokemonCenter_Text_ThankVisitHeresYoure, 0, 0
    ActorMsgClose
    RTCallGlobal 2805
    FlagSet EVENT_FLAG_DAILY_0x0af0
    VMJump L_010C

L_00FA:
    // "Sorry, you've already received\ntoday's gift.[f000]븁\u0000\nPlease come again tomorrow![f000]븁\u0000"
    ParentActorMsg 172, AspertiaCityPokemonCenter_Text_SorryYouveAlreadyReceived, 0, 0
    ActorMsgClose
    VMJump L_010C

L_010C:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_3:
    RTCGetSeason 0x8009
    WorkSetConst 0x8008, 500

L_011C:
    FlagSet 0x8008
    WorkAdd 0x8008, 1
    WorkCmpConst 0x8008, 599
    VMJumpIf CMP_LE, L_011C
    FlagReset EVENT_FLAG_0x0226
    FlagReset EVENT_FLAG_0x0227
    FlagReset EVENT_FLAG_0x0228
    FlagReset EVENT_FLAG_0x0229
    FlagReset EVENT_FLAG_0x022a
    FlagReset EVENT_FLAG_0x022b
    FlagReset EVENT_FLAG_0x022c
    FlagReset EVENT_FLAG_0x022d
    FlagReset EVENT_FLAG_0x022e
    FlagReset EVENT_FLAG_0x022f
    Random 0x800a, 3
    Random 0x800b, 3
    Random 0x800c, 3
    WorkAdd 0x800a, 1
    WorkAdd 0x800b, 4
    WorkAdd 0x800c, 7
    WorkGet 0x8008, 0x8009
    WorkMul 0x8008, 10
    WorkAdd 0x8008, 500
    WorkGet 0x800e, 0x8008
    FlagReset 0x800e
    WorkAdd 0x800e, 0x800a
    FlagReset 0x800e
    WorkGet 0x800e, 0x8008
    WorkAdd 0x800e, 0x800b
    FlagReset 0x800e
    WorkGet 0x800e, 0x8008
    WorkAdd 0x800e, 0x800c
    FlagReset 0x800e
    FlagReset EVENT_FLAG_0x021c
    WorkSetConst 0x800e, 540
    WorkAdd 0x800e, 0x800a
    FlagReset 0x800e
    WorkSetConst 0x800e, 540
    WorkAdd 0x800e, 0x800b
    FlagReset 0x800e
    WorkSetConst 0x800e, 540
    WorkAdd 0x800e, 0x800c
    FlagReset 0x800e
    WorkCmpConst EVENT_WORK_0x401f, 0
    VMJumpIf CMP_EQ, L_03FC
    RTCGetTime 0x8004, 0x8005
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_0246
    WorkCmpConst 0x8009, 1
    VMJumpIf CMP_EQ, L_0266
    WorkCmpConst 0x8009, 2
    VMJumpIf CMP_EQ, L_0286
    WorkCmpConst 0x8009, 3
    VMJumpIf CMP_EQ, L_02A6
    VMJump L_03FC

L_0246:
    WorkCmpConst 0x8004, 20
    VMJumpIf CMP_GE, L_02C6
    WorkCmpConst 0x8004, 4
    VMJumpIf CMP_LE, L_02C6
    VMJump L_03FC

L_0266:
    WorkCmpConst 0x8004, 21
    VMJumpIf CMP_GE, L_02C6
    WorkCmpConst 0x8004, 3
    VMJumpIf CMP_LE, L_02C6
    VMJump L_03FC

L_0286:
    WorkCmpConst 0x8004, 20
    VMJumpIf CMP_GE, L_02C6
    WorkCmpConst 0x8004, 5
    VMJumpIf CMP_LE, L_02C6
    VMJump L_03FC

L_02A6:
    WorkCmpConst 0x8004, 19
    VMJumpIf CMP_GE, L_02C6
    WorkCmpConst 0x8004, 6
    VMJumpIf CMP_LE, L_02C6
    VMJump L_03FC

L_02C6:
    FlagReset EVENT_FLAG_0x023f
    WorkSetConst 0x800f, 560
    WorkSetConst 0x8012, 1
    VMJump L_02DC

L_02DC:
    WorkGet 0x800d, 0x8009
    WorkMul 0x800d, 3
    WorkAdd 0x800d, 0x800f
    WorkCmpConst 0x800a, 3
    VMJumpIf CMP_EQ, L_0301
    VMJump L_031B

L_0301:
    WorkGet 0x800e, 0x8008
    WorkAdd 0x800e, 3
    FlagSet 0x800e
    WorkGet 0x800e, 0x800d
    FlagReset 0x800e

L_031B:
    WorkCmpConst 0x800b, 6
    VMJumpIf CMP_EQ, L_032E
    VMJump L_034E

L_032E:
    WorkGet 0x800e, 0x8008
    WorkAdd 0x800e, 6
    FlagSet 0x800e
    WorkGet 0x800e, 0x800d
    WorkAdd 0x800e, 1
    FlagReset 0x800e

L_034E:
    WorkCmpConst 0x800c, 9
    VMJumpIf CMP_EQ, L_0361
    VMJump L_0381

L_0361:
    WorkGet 0x800e, 0x8008
    WorkAdd 0x800e, 9
    FlagSet 0x800e
    WorkGet 0x800e, 0x800d
    WorkAdd 0x800e, 2
    FlagReset 0x800e

L_0381:
    WorkGet 0x800d, 0x800f
    WorkAdd 0x800d, 12
    WorkCmpConst 0x800a, 3
    VMJumpIf CMP_EQ, L_03A0
    VMJump L_03AE

L_03A0:
    FlagSet EVENT_FLAG_0x021f
    WorkGet 0x800e, 0x800d
    FlagReset 0x800e

L_03AE:
    WorkCmpConst 0x800b, 6
    VMJumpIf CMP_EQ, L_03C1
    VMJump L_03D5

L_03C1:
    FlagSet EVENT_FLAG_0x0222
    WorkGet 0x800e, 0x800d
    WorkAdd 0x800e, 1
    FlagReset 0x800e

L_03D5:
    WorkCmpConst 0x800c, 9
    VMJumpIf CMP_EQ, L_03E8
    VMJump L_03FC

L_03E8:
    FlagSet EVENT_FLAG_0x0225
    WorkGet 0x800e, 0x800d
    WorkAdd 0x800e, 2
    FlagReset 0x800e

L_03FC:
    WorkSetConst 0x800d, 590

L_0402:
    Random 0x8008, 10
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_041B
    VMJump L_041F

L_041B:
    FlagReset 0x800d

L_041F:
    WorkAdd 0x800d, 1
    WorkCmpConst 0x800d, 599
    VMJumpIf CMP_LE, L_0402
    WorkSetConst EVENT_WORK_0x401f, 0
    RTEndGlobal

Script_4:
    Random 0x8008, 0x8010
    WorkGet 0x8000, 0x8008
    WorkAdd 0x8000, 0x8011
    ItemCheckSpace 0x8000, 1, 0x800c
    WorkCmpConst 0x800c, 0
    VMJumpIf CMP_EQ, L_0471
    WorkSetConst 0x8001, 1
    RTCallGlobal 2805
    VMJump L_0479

L_0471:
    WorkSetConst 0x8012, 0
    RTEndGlobal

L_0479:
    WorkSetConst 0x8012, 1
    RTEndGlobal
    .byte 0x00

Script_5:
    PokePartyGetParam 0x8009, 0, 158
    WorkDiv 0x8009, 5
    WorkMul 0x8009, 4
    PVPlay 0x8010, 0
    PVWait
    WorkSetConst 0x8012, 0
    CallWildBattle 0x8010, 0x8009, 1
    WildBattleGetResult 0x8008
    PokePartyGetCount 0x8009, 2
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_04E3
    WorkCmpConst 0x8009, 0
    VMJumpIf CMP_EQ, L_0501
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_04ED
    VMJump L_04F7

L_04E3:
    WorkSetConst 0x8012, 1
    CallWildBattleEnd
    RTEndGlobal

L_04ED:
    WorkSetConst 0x8012, 2
    CallWildBattleEnd
    RTEndGlobal

L_04F7:
    WorkSetConst 0x8012, 3
    CallWildBattleEnd
    RTEndGlobal

L_0501:
    CallWildLose
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_6:
    WorkCmpConst 0x8010, 149
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 154
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 156
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 157
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 159
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 164
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 168
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 169
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 171
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 172
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 174
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 179
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 184
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 189
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 194
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 199
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 201
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 204
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 206
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 207
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 208
    VMJumpIf CMP_EQ, L_084E
    WorkCmpConst 0x8010, 150
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 158
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 160
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 165
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 170
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 173
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 175
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 180
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 185
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 190
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 195
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 200
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 202
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 205
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 209
    VMJumpIf CMP_EQ, L_085A
    WorkCmpConst 0x8010, 151
    VMJumpIf CMP_EQ, L_0866
    WorkCmpConst 0x8010, 155
    VMJumpIf CMP_EQ, L_0866
    WorkCmpConst 0x8010, 161
    VMJumpIf CMP_EQ, L_0866
    WorkCmpConst 0x8010, 166
    VMJumpIf CMP_EQ, L_0866
    WorkCmpConst 0x8010, 176
    VMJumpIf CMP_EQ, L_0866
    WorkCmpConst 0x8010, 181
    VMJumpIf CMP_EQ, L_0866
    WorkCmpConst 0x8010, 186
    VMJumpIf CMP_EQ, L_0866
    WorkCmpConst 0x8010, 191
    VMJumpIf CMP_EQ, L_0866
    WorkCmpConst 0x8010, 196
    VMJumpIf CMP_EQ, L_0866
    WorkCmpConst 0x8010, 203
    VMJumpIf CMP_EQ, L_0866
    WorkCmpConst 0x8010, 210
    VMJumpIf CMP_EQ, L_0866
    WorkCmpConst 0x8010, 152
    VMJumpIf CMP_EQ, L_0872
    WorkCmpConst 0x8010, 162
    VMJumpIf CMP_EQ, L_0872
    WorkCmpConst 0x8010, 167
    VMJumpIf CMP_EQ, L_0872
    WorkCmpConst 0x8010, 177
    VMJumpIf CMP_EQ, L_0872
    WorkCmpConst 0x8010, 182
    VMJumpIf CMP_EQ, L_0872
    WorkCmpConst 0x8010, 187
    VMJumpIf CMP_EQ, L_0872
    WorkCmpConst 0x8010, 192
    VMJumpIf CMP_EQ, L_0872
    WorkCmpConst 0x8010, 197
    VMJumpIf CMP_EQ, L_0872
    WorkCmpConst 0x8010, 211
    VMJumpIf CMP_EQ, L_0872
    WorkCmpConst 0x8010, 153
    VMJumpIf CMP_EQ, L_087E
    WorkCmpConst 0x8010, 163
    VMJumpIf CMP_EQ, L_087E
    WorkCmpConst 0x8010, 178
    VMJumpIf CMP_EQ, L_087E
    WorkCmpConst 0x8010, 183
    VMJumpIf CMP_EQ, L_087E
    WorkCmpConst 0x8010, 188
    VMJumpIf CMP_EQ, L_087E
    WorkCmpConst 0x8010, 193
    VMJumpIf CMP_EQ, L_087E
    WorkCmpConst 0x8010, 198
    VMJumpIf CMP_EQ, L_087E
    WorkCmpConst 0x8010, 212
    VMJumpIf CMP_EQ, L_087E
    VMJump L_088A

L_084E:
    WorkSetConst 0x8012, 0
    VMJump L_0896

L_085A:
    WorkSetConst 0x8012, 1
    VMJump L_0896

L_0866:
    WorkSetConst 0x8012, 2
    VMJump L_0896

L_0872:
    WorkSetConst 0x8012, 3
    VMJump L_0896

L_087E:
    WorkSetConst 0x8012, 4
    VMJump L_0896

L_088A:
    WorkSetConst 0x8012, 5
    VMJump L_0896

L_0896:
    RTEndGlobal

Script_7:
    WorkCmpConst 0x8010, 1
    VMJumpIf CMP_EQ, L_08F2
    WorkCmpConst 0x8010, 2
    VMJumpIf CMP_EQ, L_09E5
    WorkCmpConst 0x8010, 3
    VMJumpIf CMP_EQ, L_0AD8
    WorkCmpConst 0x8010, 4
    VMJumpIf CMP_EQ, L_0AF0
    WorkCmpConst 0x8010, 5
    VMJumpIf CMP_EQ, L_0B08
    WorkCmpConst 0x8010, 6
    VMJumpIf CMP_EQ, L_0B20
    WorkSetConst 0x8012, 0
    VMJump L_0CA9

L_08F2:
    Random 0x8008, 10
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0979
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0985
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0991
    WorkCmpConst 0x8008, 3
    VMJumpIf CMP_EQ, L_099D
    WorkCmpConst 0x8008, 4
    VMJumpIf CMP_EQ, L_09A9
    WorkCmpConst 0x8008, 5
    VMJumpIf CMP_EQ, L_09B5
    WorkCmpConst 0x8008, 6
    VMJumpIf CMP_EQ, L_09C1
    WorkCmpConst 0x8008, 7
    VMJumpIf CMP_EQ, L_09CD
    WorkCmpConst 0x8008, 8
    VMJumpIf CMP_EQ, L_09D9
    WorkSetConst 0x8012, 158
    VMJump L_0CA9

L_0979:
    WorkSetConst 0x8012, 149
    VMJump L_0CA9

L_0985:
    WorkSetConst 0x8012, 150
    VMJump L_0CA9

L_0991:
    WorkSetConst 0x8012, 151
    VMJump L_0CA9

L_099D:
    WorkSetConst 0x8012, 152
    VMJump L_0CA9

L_09A9:
    WorkSetConst 0x8012, 153
    VMJump L_0CA9

L_09B5:
    WorkSetConst 0x8012, 154
    VMJump L_0CA9

L_09C1:
    WorkSetConst 0x8012, 155
    VMJump L_0CA9

L_09CD:
    WorkSetConst 0x8012, 156
    VMJump L_0CA9

L_09D9:
    WorkSetConst 0x8012, 157
    VMJump L_0CA9

L_09E5:
    Random 0x8008, 10
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0A6C
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0A78
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0A84
    WorkCmpConst 0x8008, 3
    VMJumpIf CMP_EQ, L_0A90
    WorkCmpConst 0x8008, 4
    VMJumpIf CMP_EQ, L_0A9C
    WorkCmpConst 0x8008, 5
    VMJumpIf CMP_EQ, L_0AA8
    WorkCmpConst 0x8008, 6
    VMJumpIf CMP_EQ, L_0AB4
    WorkCmpConst 0x8008, 7
    VMJumpIf CMP_EQ, L_0AC0
    WorkCmpConst 0x8008, 8
    VMJumpIf CMP_EQ, L_0ACC
    WorkSetConst 0x8012, 163
    VMJump L_0CA9

L_0A6C:
    WorkSetConst 0x8012, 149
    VMJump L_0CA9

L_0A78:
    WorkSetConst 0x8012, 159
    VMJump L_0CA9

L_0A84:
    WorkSetConst 0x8012, 150
    VMJump L_0CA9

L_0A90:
    WorkSetConst 0x8012, 160
    VMJump L_0CA9

L_0A9C:
    WorkSetConst 0x8012, 151
    VMJump L_0CA9

L_0AA8:
    WorkSetConst 0x8012, 161
    VMJump L_0CA9

L_0AB4:
    WorkSetConst 0x8012, 152
    VMJump L_0CA9

L_0AC0:
    WorkSetConst 0x8012, 162
    VMJump L_0CA9

L_0ACC:
    WorkSetConst 0x8012, 153
    VMJump L_0CA9

L_0AD8:
    Random 0x8008, 12
    WorkGet 0x8012, 0x8008
    WorkAdd 0x8012, 201
    VMJump L_0CA9

L_0AF0:
    Random 0x8008, 17
    WorkGet 0x8012, 0x8008
    WorkAdd 0x8012, 184
    VMJump L_0CA9

L_0B08:
    Random 0x8008, 5
    WorkGet 0x8012, 0x8008
    WorkAdd 0x8012, 169
    VMJump L_0CA9

L_0B20:
    Random 0x8008, 16
    WorkCmpConst 0x8008, 0
    VMJumpIf CMP_EQ, L_0BF5
    WorkCmpConst 0x8008, 1
    VMJumpIf CMP_EQ, L_0C01
    WorkCmpConst 0x8008, 2
    VMJumpIf CMP_EQ, L_0C0D
    WorkCmpConst 0x8008, 3
    VMJumpIf CMP_EQ, L_0C19
    WorkCmpConst 0x8008, 4
    VMJumpIf CMP_EQ, L_0C25
    WorkCmpConst 0x8008, 5
    VMJumpIf CMP_EQ, L_0C31
    WorkCmpConst 0x8008, 6
    VMJumpIf CMP_EQ, L_0C3D
    WorkCmpConst 0x8008, 7
    VMJumpIf CMP_EQ, L_0C49
    WorkCmpConst 0x8008, 8
    VMJumpIf CMP_EQ, L_0C55
    WorkCmpConst 0x8008, 9
    VMJumpIf CMP_EQ, L_0C61
    WorkCmpConst 0x8008, 10
    VMJumpIf CMP_EQ, L_0C6D
    WorkCmpConst 0x8008, 11
    VMJumpIf CMP_EQ, L_0C79
    WorkCmpConst 0x8008, 12
    VMJumpIf CMP_EQ, L_0C85
    WorkCmpConst 0x8008, 13
    VMJumpIf CMP_EQ, L_0C91
    WorkCmpConst 0x8008, 14
    VMJumpIf CMP_EQ, L_0C9D
    WorkSetConst 0x8012, 183
    VMJump L_0CA9

L_0BF5:
    WorkSetConst 0x8012, 154
    VMJump L_0CA9

L_0C01:
    WorkSetConst 0x8012, 164
    VMJump L_0CA9

L_0C0D:
    WorkSetConst 0x8012, 165
    VMJump L_0CA9

L_0C19:
    WorkSetConst 0x8012, 166
    VMJump L_0CA9

L_0C25:
    WorkSetConst 0x8012, 167
    VMJump L_0CA9

L_0C31:
    WorkSetConst 0x8012, 168
    VMJump L_0CA9

L_0C3D:
    WorkSetConst 0x8012, 174
    VMJump L_0CA9

L_0C49:
    WorkSetConst 0x8012, 175
    VMJump L_0CA9

L_0C55:
    WorkSetConst 0x8012, 176
    VMJump L_0CA9

L_0C61:
    WorkSetConst 0x8012, 177
    VMJump L_0CA9

L_0C6D:
    WorkSetConst 0x8012, 178
    VMJump L_0CA9

L_0C79:
    WorkSetConst 0x8012, 179
    VMJump L_0CA9

L_0C85:
    WorkSetConst 0x8012, 180
    VMJump L_0CA9

L_0C91:
    WorkSetConst 0x8012, 181
    VMJump L_0CA9

L_0C9D:
    WorkSetConst 0x8012, 182
    VMJump L_0CA9

L_0CA9:
    RTEndGlobal
    .balign 4, 0
