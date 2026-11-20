#ifndef PAPERWHITE2_ENTRALINK_RUN_BATTLE_H
#define PAPERWHITE2_ENTRALINK_RUN_BATTLE_H

// Paper White 2: the BtlSetup flag of an Entralink run's battles (paperwhite2/entralink_run.h), past the flags the game
// uses (0x1 to 0x10000). The battle refuses balls in one, as in a trainer battle (ThrowBall, btl_server_flow_sub.c)
#define ENTRALINK_RUN_BTL_SETUP_FLAG (1 << 20)
// And with it, a battle against a boss (the room's role boss or final, or a raid), whose foes have the bosses'
// protections (paperwhite2/entralink_battle.h)
#define ENTRALINK_RUN_BOSS_BTL_SETUP_FLAG (1 << 21)

#endif // PAPERWHITE2_ENTRALINK_RUN_BATTLE_H
