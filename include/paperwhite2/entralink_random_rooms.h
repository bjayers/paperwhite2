#ifndef PAPERWHITE2_ENTRALINK_RANDOM_ROOMS_H
#define PAPERWHITE2_ENTRALINK_RANDOM_ROOMS_H

#include "types.h"
#include "paperwhite2/entralink_run.h"
#include "struct_decls.h"

// Paper White 2: the Entralink run's random enemy rooms (docs/paperwhite2/design/entralink-roguelike-prototype.md,
// "Random enemy rooms"). A door to an enemy or enemy choice room leads at run.json's random_enemy_chance to one of the
// two random rooms of the room table (EntralinkRoom's random, after the templates), whose battles are made as the
// player enters it (src/paperwhite2/ov012/paperwhite2_entralink_random_rooms.c): one battle or a choice of 2 or 3, each
// single, double or triple, of species drawn from the round's base stat total band
// (paperwhite2/entralink_random_config.h, tools/paperwhite2/entralink_random.py). The room made is kept in ARM9 main
// (src/paperwhite2/main/paperwhite2_entralink_random_room.c), which the battle doesn't free, as the room tables'
// records, so the run reads it as it reads a premade room

// The most battles of a random room, and enemies of all its battles
#define ENTRALINK_RANDOM_BATTLES_MAX 3
#define ENTRALINK_RANDOM_ENEMIES_MAX 9

// A random room as made: the room's record (a copy of its row with its counts), its battles, enemies and NPCs (an
// NPC for each enemy, its battle's), each from 0
typedef struct {
    EntralinkRoom room;
    EntralinkBattle battles[ENTRALINK_RANDOM_BATTLES_MAX];
    EntralinkEnemy enemies[ENTRALINK_RANDOM_ENEMIES_MAX];
    EntralinkNpc npcs[ENTRALINK_RANDOM_ENEMIES_MAX];
} EntralinkRandomRoom;

// A species random rooms draw (the config's table): its sprite, its evolution family (its line's first species), its
// base stat total and types
typedef struct {
    u16 species;
    // Its walking sprite's object code, ENTRALINK_RANDOM_FEMALE_NEXT set when the female's is the next code
    u16 sprite;
    u16 family;
    u16 bst;
    u8 type1;
    u8 type2;
} EntralinkRandomSpecies;

#define ENTRALINK_RANDOM_FEMALE_NEXT 0x8000

// The random room made last, in ARM9 main
EntralinkRandomRoom *EntralinkRun_GetRandomRoom(void);
// Makes a random room from its row of the room table (enemy: one battle; enemy choice: 2 or 3) for a round, as the
// player enters it
void EntralinkRun_MakeRandomRoom(const EntralinkRoom *row, u32 round);

#endif // PAPERWHITE2_ENTRALINK_RANDOM_ROOMS_H
