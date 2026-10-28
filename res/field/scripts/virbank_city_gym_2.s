#include "asm/field_script.inc"
#include "text/script/virbank_city_gym_2.h"

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
    ScriptEntry Script_15
    ScriptEntriesEnd

Script_1:
    TrainerCardHasBadge 0x8008, 1
    VMStackPush 0x8008
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00B3
    VMStackPushFlag EVENT_FLAG_0x010e
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_007C
    WorkSetConst EVENT_WORK_0x4000, 1
    WorkSetConst EVENT_WORK_0x4003, 1
    VMJump L_0088

L_007C:
    WorkSetConst EVENT_WORK_0x4000, 0
    WorkSetConst EVENT_WORK_0x4003, 0

L_0088:
    VMStackPushFlag EVENT_FLAG_0x010f
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00A7
    WorkSetConst EVENT_WORK_0x4001, 1
    VMJump L_00AD

L_00A7:
    WorkSetConst EVENT_WORK_0x4001, 0

L_00AD:
    VMJump L_00BF

L_00B3:
    WorkSetConst EVENT_WORK_0x4000, 0
    WorkSetConst EVENT_WORK_0x4001, 0

L_00BF:
    VMStackPushFlag EVENT_FLAG_0x02fb
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_00EA
    WorkSetConst EVENT_WORK_0x4000, 1
    WorkSetConst EVENT_WORK_0x4001, 1
    WorkSetConst EVENT_WORK_0x4002, 1
    WorkSetConst EVENT_WORK_0x4003, 1

L_00EA:
    VMHalt

Script_2:
    VMStackPush EVENT_WORK_0x4000
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0103
    VirbankGymSetActorFlag 1

L_0103:
    VMStackPush EVENT_WORK_0x4001
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_011A
    VirbankGymSetActorFlag 2

L_011A:
    VMHalt

Script_3:
    ActorsPauseAll
    VMStackPush EVENT_WORK_0x4000
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackPush EVENT_WORK_0x4001
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMStackCmp CMP_OR
    VMJumpIf CMP_STACK, L_0157
    SEPlay SEQ_SE_MESSAGE
    WordSetPlayerName 0
    // "It's too loud!\nShe can't hear your voice!"
    InfoMsg VirbankCityGym2_Text_ItsTooLoudShe, 2
    LastKeyWait
    MsgWinCloseAll
    VMJump L_01CD

L_0157:
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    VMCall Script_10
    TrainerCardHasBadge 0x8008, 1
    VMStackPush 0x8008
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0188
    VMCall Script_11
    VMJump L_01CD

L_0188:
    VirbankGymStopModelAnimations 0
    VirbankGymStopModelAnimations 1
    VirbankGymStopModelAnimations 2
    VMStackPushFlag EVENT_FLAG_0x0960
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_01BD
    // "Your Pokémon WANTED this win![f000]븁\u0000\nKeep on going on like this,\nand do all sorts of stuff!"
    ActorMsg MSGFILE_SCRIPT, VirbankCityGym2_Text_PokemonWantedWinKeep, 0, 0, 0
    LastKeyWait
    ActorMsgClose
    VMJump L_01CD

L_01BD:
    // "Using the Pokémon I like and\ngetting through to people with[f000]븀\u0000\nthe music I like is who I am![f000]븁\u0000\nIf you can do what you enjoy\nin the way you want, then great![f000]븁\u0000\nJust be sure not to cause\nanyone any trouble!"
    ActorMsg MSGFILE_SCRIPT, VirbankCityGym2_Text_UsingPokemonLikeGetting, 0, 0, 0
    LastKeyWait
    ActorMsgClose

L_01CD:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Script_4:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "Your Pokémon WANTED this win![f000]븁\u0000\nKeep on going on like this,\nand do all sorts of stuff!"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityGym2_Text_PokemonWantedWinKeep, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_5:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    WorkSetConst 0x8020, 178
    VMStackPushFlag EVENT_FLAG_0x010e
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0223
    VMCall Script_12
    VMCall Script_13
    VMJump L_0258

L_0223:
    VMCall Script_14
    TrainerBattleIsVictory 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0252
    CallTrainerBattleEnd
    VMCall Script_13
    FlagSet EVENT_FLAG_0x010e
    VMJump L_0254

L_0252:
    CallTrainerLose

L_0254:
    TrainerFlagSet 0x8020

L_0258:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_6:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    WorkSetConst 0x8020, 179
    VMStackPushFlag EVENT_FLAG_0x010f
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0291
    VMCall Script_12
    VMCall Script_15
    VMJump L_02C6

L_0291:
    VMCall Script_14
    TrainerBattleIsVictory 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_02C0
    CallTrainerBattleEnd
    VMCall Script_15
    FlagSet EVENT_FLAG_0x010f
    VMJump L_02C2

L_02C0:
    CallTrainerLose

L_02C2:
    TrainerFlagSet 0x8020

L_02C6:
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_7:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "That's a Gym Leader for you!\nShe really brings out the charms[f000]븀\u0000\nof her Pokémon![f000]븁\u0000\nBut she's too wrapped up\nin what she's doing here..."
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityGym2_Text_ThatsGymLeaderShe, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_8:
    ActorsPauseAll
    WorkSetConst 0x8026, 0
    WorkSetConst 0x8027, 0
    PlayerGetGPos 0x8026, 0x8027
    ActorSetGPos 3, 13, 0, 6, 2
    BGMPlay SEQ_BGM_PW_LAND
    VMStackPush 0x8026
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_032D
    ActorCmdExec 3, Movement_043A
    VMJump L_0335

L_032D:
    ActorCmdExec 3, Movement_0442

L_0335:
    ActorCmdWait
    ActorCmdExec 255, Movement_044A
    ActorCmdWait
    // "Congratulations on your win,\nbut we need your help![f000]븁\u0000\nThere are some guys by the docks\ncalling themselves Team Plasma![f000]븁\u0000\nIf you deal with them,\nI'll talk to the Captain for you.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCityGym2_Text_CongratulationsWinButWe, 3, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8026
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0374
    ActorCmdExec 3, Movement_0452
    VMSleep 10
    VMJump L_0380

L_0374:
    ActorCmdExec 3, Movement_045A
    VMSleep 10

L_0380:
    BGMChangeMap
    VMStackPush 0x8026
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_03A7
    VMSleep 30
    ActorCmdExec 4, Movement_0462
    VMJump L_03B3

L_03A7:
    VMSleep 30
    ActorCmdExec 4, Movement_047A

L_03B3:
    ActorCmdWait
    VMStackPush 0x8026
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_03CE
    VMJump L_03D8

L_03CE:
    ActorCmdExec 255, Movement_0492
    ActorCmdWait

L_03D8:
    // "Did he say... Team Plasma?\nAnd after such a good battle...[f000]븁\u0000\nUgh, I'll deal with this...\nJust meet me at the docks.[f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCityGym2_Text_DidHeSayTeam, 4, 0, 0
    MsgWinCloseAll
    VMStackPush 0x8026
    VMStackPushConst 3
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0407
    ActorCmdExec 4, Movement_049A
    VMJump L_041B

L_0407:
    ActorCmdExec 4, Movement_04A2
    VMSleep 20
    ActorCmdExec 255, Movement_04AE

L_041B:
    ActorCmdWait
    ActorDelete 3
    ActorDelete 4
    WorkSetConst EVENT_WORK_0x40ad, 2
    FlagSet EVENT_FLAG_0x02d1
    FlagSet EVENT_FLAG_0x02d0
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt
    .byte 0x00

Movement_043A:
    Move 14, 9
    MoveEnd

Movement_0442:
    Move 14, 8
    MoveEnd

Movement_044A:
    Move 35, 1
    MoveEnd

Movement_0452:
    Move 15, 10
    MoveEnd

Movement_045A:
    Move 15, 9
    MoveEnd

Movement_0462:
    Move 14, 1
    Move 13, 1
    Move 14, 3
    Move 13, 2
    Move 34, 1
    MoveEnd

Movement_047A:
    Move 14, 1
    Move 13, 1
    Move 14, 4
    Move 13, 2
    Move 35, 1
    MoveEnd

Movement_0492:
    Move 34, 1
    MoveEnd

Movement_049A:
    Move 15, 10
    MoveEnd

Movement_04A2:
    Move 13, 1
    Move 15, 10
    MoveEnd

Movement_04AE:
    Move 35, 1
    MoveEnd

Script_9:
    ActorsPauseAll
    SEPlay SEQ_SE_MESSAGE
    ActorSetEyeToEye
    // "I'm running the PA![f000]븁\u0000\nI balance the sound in the venue\nso it's easy to hear![f000]븁\u0000\nAre you a Trainer?[f000]븁\u0000\nSo does that mean you're thinking about\nthe type balance of the Pokémon in[f000]븀\u0000\nyour party?"
    ParentActorMsg MSGFILE_SCRIPT, VirbankCityGym2_Text_ImRunningPaBalance, 0, 0
    LastKeyWait
    ActorMsgClose
    FinishAllEvents
    ActorsUnpauseAll
    VMHalt

Script_10:
    ISSSwitchQuery 0x8010, 3
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_04F5
    ISSSwitchDisable 3
    WorkSetConst EVENT_WORK_0x4002, 1

L_04F5:
    VMReturn
    .byte 0x00

Script_11:
    // "Get ready! I'm gonna knock\nsome sense outta ya![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCityGym2_Text_GetReadyImGonna, 0, 0, 1
    MsgWinCloseAll
    WorkSetConst 0x8024, 0
    GameGetDifficulty 0x8024
    VMStackPush 0x8024
    VMStackPushConst 2
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0531
    CallTrainerBattle TRAINER_LEADER_ROXIE_2, 0, 0
    VMJump L_0539

L_0531:
    CallTrainerBattle TRAINER_LEADER_ROXIE, 0, 0

L_0539:
    WorkSetConst 0x8024, 0
    TrainerBattleIsVictory 0x8010
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_05D7
    FlagSet EVENT_FLAG_0x02fb
    FlagReset EVENT_FLAG_0x02d1
    ActorDelete 0
    ActorAdd 4
    PlayerGetDir 0x8010
    WorkCmpConst 0x8010, 1
    VMJumpIf CMP_EQ, L_057D
    VMJump L_058B

L_057D:
    ActorCmdExec 4, Movement_06B0
    VMJump L_05CD

L_058B:
    WorkCmpConst 0x8010, 2
    VMJumpIf CMP_EQ, L_059E
    VMJump L_05AC

L_059E:
    ActorCmdExec 4, Movement_06B8
    VMJump L_05CD

L_05AC:
    WorkCmpConst 0x8010, 3
    VMJumpIf CMP_EQ, L_05BF
    VMJump L_05CD

L_05BF:
    ActorCmdExec 4, Movement_06C0
    VMJump L_05CD

L_05CD:
    ActorCmdWait
    CallTrainerBattleEnd
    VMJump L_05D9

L_05D7:
    CallTrainerLose

L_05D9:
    VMCall Script_10
    VirbankGymStopModelAnimations 0
    VirbankGymStopModelAnimations 1
    VirbankGymStopModelAnimations 2
    // "Sigh!\nWhat are you doing losing, Roxie?![f000]븁\u0000\nWell...\nI guess that means you're strong![f000]븁\u0000\nThis stinks,\nbut I gave it everything I had, and[f000]븀\u0000\nI feel revitalized and refreshed now![f000]븁\u0000\nHere!\nProof that you beat me![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCityGym2_Text_SighWhatDoingLosing, 4, 0, 0
    ActorMsgClose
    TrainerCardSaveGymVictoryParty 1
    TrainerCardAddBadge 1
    WordSetPlayerName 0
    MEPlay SEQ_ME_BADGE
    WorkSetConst 0x8025, 0
    TrainerCardGetSex 0x8025
    VMStackPush 0x8025
    VMStackPushConst 0
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_062F
    PlayFieldEffect 4
    VMJump L_0633

L_062F:
    PlayFieldEffect 56

L_0633:
    MEWait
    WorkSetConst 0x8025, 0
    // "[f000]Ā\u0001\u0000 received the\nToxic Badge from Roxie![f000]븁\u0000"
    SystemMsg VirbankCityGym2_Text_ReceivedToxicBadgeFrom, 0
    InfoMsgClose
    // "Two Badges![f000]븁\u0000\nNow Pokémon up to Lv. 30,\neven Pokémon you got in trades,[f000]븀\u0000\nwill realize how good you are[f000]븀\u0000\nand won't ignore your commands![f000]븁\u0000\nAlso, here!\nUse this TM![f000]븁\u0000"
    ActorMsg MSGFILE_SCRIPT, VirbankCityGym2_Text_TwoBadgesNowPokemon, 4, 0, 0
    ActorMsgClose
    VMStackPush 0x8000
    VMStackPush 0x8001
    WorkSet 0x8000, 336
    WorkSet 0x8001, 1
    RTCallGlobal 2805
    VMStackPop 0x8001
    VMStackPop 0x8000
    // "TM09 is Venoshock!\nIt covers the target in[f000]븀\u0000\na special poisonous liquid![f000]븁\u0000\nEven better, if your target's already\npoisoned, it does double damage![f000]븀\u0000\nHeh heh! It almost packs too much[f000]븀\u0000\nof a punch!"
    ActorMsg MSGFILE_SCRIPT, VirbankCityGym2_Text_Tm09VenoshockCoversTarget, 4, 0, 0
    LastKeyWait
    ActorMsgClose
    TrainerFlagSet TRAINER_ROUGHNECK_NICKY
    TrainerFlagSet TRAINER_GUITARIST_BILLY_JO
    WorkSetConst EVENT_WORK_0x40ad, 1
    WorkSetConst EVENT_WORK_0x410a, 1
    WorkSetConst EVENT_WORK_0x40ac, 3
    WorkSetConst EVENT_WORK_0x40ac, 4
    FlagReset EVENT_FLAG_0x02d4
    FlagSet EVENT_FLAG_0x02d5
    FlagSet EVENT_FLAG_0x096f
    VMReturn
    .balign 4, 0

Movement_06B0:
    Move 0, 1
    MoveEnd

Movement_06B8:
    Move 3, 1
    MoveEnd

Movement_06C0:
    Move 2, 1
    MoveEnd

Script_12:
    TrainerGetMessageTypes 0x8021, 0x8022, 0x8023
    TrainerSayMessage 0x8020, 0x8022, 0x8011
    LastKeyWait
    ActorMsgClose
    VMReturn

Script_13:
    ISSSwitchQuery 0x8010, 1
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_070F
    ISSSwitchDisable 1
    ISSSwitchDisable 4
    VirbankGymSetActorFlag 1
    WorkSetConst EVENT_WORK_0x4000, 1
    WorkSetConst EVENT_WORK_0x4003, 1

L_070F:
    VMReturn
    .byte 0x00

Script_14:
    TrainerGetMessageTypes 0x8021, 0x8022, 0x8023
    TrainerSayMessage 0x8020, 0x8021, 0x8011
    ActorMsgClose
    CallTrainerBattle 0x8020, 0, 0
    VMReturn

Script_15:
    ISSSwitchQuery 0x8010, 2
    VMStackPush 0x8010
    VMStackPushConst 1
    VMStackCmp CMP_EQ
    VMJumpIf CMP_STACK, L_0755
    ISSSwitchDisable 2
    VirbankGymSetActorFlag 2
    WorkSetConst EVENT_WORK_0x4001, 1

L_0755:
    VMReturn
    .balign 4, 0
