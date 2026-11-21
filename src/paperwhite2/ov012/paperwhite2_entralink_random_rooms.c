#include "types.h"
#include "constants/arc.h"
#include "constants/directions.h"
#include "constants/items.h"
#include "constants/moves.h"
#include "gfl/arc.h"
#include "gfl/heap.h"
#include "gfl/random.h"
#include "nitro/math.h"
#include "paperwhite2/entralink_random_config.h"
#include "paperwhite2/entralink_random_rooms.h"
#include "paperwhite2/entralink_run.h"
#include "paperwhite2/entralink_run_state.h"
#include "paperwhite2/move_tutors.h"
#include "pml/item.h"
#include "pml/move.h"
#include "pml/personal.h"
#include "system/game_event.h"

// Paper White 2: the Entralink run's random enemy rooms, made as the player enters one. See
// include/paperwhite2/entralink_random_rooms.h and docs/paperwhite2/design/entralink-roguelike-prototype.md, "Random
// enemy rooms"

// The species' egg moves, a count and the moves a file each (a/1/2/4, as day_care.c reads them)
#define ARCID_EGG_MOVES 124
// A species' gender ratio: always male, always female, and genderless; between them, the female's chance in 256
#define SEX_RATIO_MALE 0
#define SEX_RATIO_FEMALE 254
#define SEX_RATIO_NONE 255
// A Pokémon's moves
#define MOVES 4
// The species draw's relaxations, the strictest first: the theme (sharing a type or a family with the battle's
// first), the other choices' types and families left out, and no species twice in a battle
#define DRAW_THEME 1
#define DRAW_APART 2
#define DRAW_DISTINCT 4

// Which species a draw takes, of the species' table (read for the room being made): the round's band, the battle's
// first (the theme's, or NULL), the types (a bit each) and families of the room's other battles, and the species
// already in the battle
typedef struct {
    const EntralinkRandomSpecies *table;
    u32 tableCount;
    u16 min;
    u16 max;
    const EntralinkRandomSpecies *lead;
    u32 usedTypes;
    const u16 *families;
    u32 familyCount;
    const u16 *species;
    u32 speciesCount;
} SpeciesFilter;

// An enemy's tile from its battle's anchor, by its place and the format: a single's on it, a double's side by side, a
// triple's first in front and the other two a tile back on either side
static const s8 sFormatTiles[ENTRALINK_FORMAT_TRIPLE + 1][ENTRALINK_RUN_ENEMIES_MAX][2] = {
    { { 0, 0 } },
    { { 0, 0 }, { 1, 0 } },
    { { 0, 0 }, { -1, -1 }, { 1, -1 } },
};

static BOOL EntralinkRandom_HasValue(const u16 *values, u32 count, u32 value) {
    u32 i;

    for (i = 0; i < count; i++) {
        if (values[i] == value) {
            return TRUE;
        }
    }
    return FALSE;
}

static u32 EntralinkRandom_TypeBits(const EntralinkRandomSpecies *species) {
    return (1 << species->type1) | (1 << species->type2);
}

// Whether a species fits a draw at a strictness (DRAW_* bits)
static BOOL EntralinkRandom_Fits(const EntralinkRandomSpecies *species, const SpeciesFilter *filter, u32 strictness) {
    if (species->bst < filter->min || species->bst > filter->max) {
        return FALSE;
    }
    if ((strictness & DRAW_DISTINCT) &&
        EntralinkRandom_HasValue(filter->species, filter->speciesCount, species->species)) {
        return FALSE;
    }
    if ((strictness & DRAW_THEME) && filter->lead != NULL && species->family != filter->lead->family &&
        !(EntralinkRandom_TypeBits(species) & EntralinkRandom_TypeBits(filter->lead))) {
        return FALSE;
    }
    if ((strictness & DRAW_APART) &&
        ((EntralinkRandom_TypeBits(species) & filter->usedTypes) ||
         EntralinkRandom_HasValue(filter->families, filter->familyCount, species->family))) {
        return FALSE;
    }
    return TRUE;
}

// A species of the draw at random, from the strictest of the relaxations any species fits (the band always holds one,
// as the packer checks)
static const EntralinkRandomSpecies *EntralinkRandom_DrawSpecies(const SpeciesFilter *filter) {
    static const u8 STRICTNESS[] = { DRAW_THEME | DRAW_APART | DRAW_DISTINCT, DRAW_THEME | DRAW_DISTINCT,
                                     DRAW_APART | DRAW_DISTINCT, DRAW_DISTINCT, 0 };
    u32 level;
    u32 count;
    u32 pick;
    u32 i;

    for (level = 0; level < NELEMS(STRICTNESS); level++) {
        count = 0;
        for (i = 0; i < filter->tableCount; i++) {
            count += EntralinkRandom_Fits(&filter->table[i], filter, STRICTNESS[level]);
        }
        if (count == 0) {
            continue;
        }
        pick = GFL_RandomLC(count);
        for (i = 0; i < filter->tableCount; i++) {
            if (EntralinkRandom_Fits(&filter->table[i], filter, STRICTNESS[level]) && pick-- == 0) {
                return &filter->table[i];
            }
        }
    }
    return &filter->table[0];
}

// The moves a species can know beside its level-up ones: its TMs and HMs, its tutors' and its egg moves, other than
// those known. Returns how many, and puts the one of an index (pick) in found
static u32 EntralinkRandom_VisitExtraMoves(const PersonalData *personal, const u16 *eggMoves, const u16 *known,
                                           u32 pick, u16 *found) {
    u32 count = 0;
    u32 item;
    u32 bit;
    u32 tutor;
    u16 move;
    u32 i;

    for (item = ITEM_TM01; item <= ITEM_TM95; item++) {
        if (!PML_ItemIsTMHM(item)) {
            continue;
        }
        bit = PML_ItemGetTMBitMask(item);
        move = PML_ItemGetTMMoveID(item);
        if ((personal->machines[bit / 32] >> (bit % 32) & 1) && !EntralinkRandom_HasValue(known, MOVES, move) &&
            count++ == pick) {
            *found = move;
        }
    }
    for (bit = 0; bit < TYPE_TUTOR_MOVE_COUNT; bit++) {
        move = PaperWhite2_TypeTutorMoves[bit];
        if ((personal->tutors[0] >> bit & 1) && !EntralinkRandom_HasValue(known, MOVES, move) && count++ == pick) {
            *found = move;
        }
    }
    for (tutor = 0; tutor < MOVE_TUTOR_COUNT; tutor++) {
        for (bit = 0; bit < PaperWhite2_MoveTutorMoveCounts[tutor]; bit++) {
            move = PaperWhite2_MoveTutorMoves[tutor][bit].move;
            if ((personal->tutors[1 + tutor] >> bit & 1) && !EntralinkRandom_HasValue(known, MOVES, move) &&
                count++ == pick) {
                *found = move;
            }
        }
    }
    if (eggMoves != NULL) {
        for (i = 1; i <= eggMoves[0]; i++) {
            if (!EntralinkRandom_HasValue(known, MOVES, eggMoves[i]) && count++ == pick) {
                *found = eggMoves[i];
            }
        }
    }
    return count;
}

// A move of the extras at random (EntralinkRandom_VisitExtraMoves), or MOVE_NONE if it has none
static u16 EntralinkRandom_DrawExtraMove(u32 species, const PersonalData *personal, const u16 *known, HeapID heapId) {
    u16 *eggMoves = NULL;
    u16 move = MOVE_NONE;
    u32 count;

    if (species < GFL_ArcSysGetDataMax(ARCID_EGG_MOVES) && GFL_ArcSysGetDataLength(ARCID_EGG_MOVES, species) >= 2) {
        eggMoves = GFL_ArcSysReadHeapNew(ARCID_EGG_MOVES, species, heapId);
    }
    count = EntralinkRandom_VisitExtraMoves(personal, eggMoves, known, 0xffffffff, &move);
    if (count != 0) {
        EntralinkRandom_VisitExtraMoves(personal, eggMoves, known, GFL_RandomLC(count), &move);
    }
    if (eggMoves != NULL) {
        GFL_HeapFree(eggMoves);
    }
    return move;
}

// An enemy's moves: 4 of the last ENTRALINK_RANDOM_MOVE_POOL level-up moves it knows at its level, one replaced by an
// extra move (or added, with fewer than 4) at ENTRALINK_RANDOM_TM_CHANCE; then, if none of them is damaging, one
// replaced by a damaging one of those it knows (the packer only takes species that have one)
static void EntralinkRandom_DrawMoves(EntralinkEnemy *enemy, const PersonalData *personal, HeapID heapId) {
    LearnsetEntry learnset[LEARNSET_MAX];
    u16 pool[LEARNSET_MAX];
    u32 count = 0;
    u32 first;
    u32 known;
    u32 damaging;
    u16 move;
    u16 swap;
    u32 pick;
    u32 i;

    PML_LearnsetLvUpLoad(enemy->species, enemy->form, learnset);
    for (i = 0; i < LEARNSET_MAX && !LearnsetEntry_IsEnd(learnset[i]); i++) {
        move = LearnsetEntry_GetMove(learnset[i]);
        if (LearnsetEntry_GetLevel(learnset[i]) > enemy->level) {
            break;
        }
        if (!EntralinkRandom_HasValue(pool, count, move)) {
            pool[count++] = move;
        }
    }
    first = count > ENTRALINK_RANDOM_MOVE_POOL ? count - ENTRALINK_RANDOM_MOVE_POOL : 0;
    known = MATH_MIN(count - first, MOVES);
    MI_CpuFill16(enemy->moves, MOVE_NONE, sizeof(enemy->moves));
    // (the first moves of the pool shuffled into place)
    for (i = 0; i < known; i++) {
        pick = first + i + GFL_RandomLC(count - first - i);
        swap = pool[first + i];
        pool[first + i] = pool[pick];
        pool[pick] = swap;
        enemy->moves[i] = pool[first + i];
    }
    if (GFL_RandomLC(100) < ENTRALINK_RANDOM_TM_CHANCE) {
        move = EntralinkRandom_DrawExtraMove(enemy->species, personal, enemy->moves, heapId);
        if (move != MOVE_NONE) {
            enemy->moves[known < MOVES ? known++ : GFL_RandomLC(MOVES)] = move;
        }
    }
    for (i = 0; i < known; i++) {
        if (PML_MoveIsDamaging(enemy->moves[i])) {
            return;
        }
    }
    // A damaging move of the pool's last ones, else of all it knows
    for (first = count > ENTRALINK_RANDOM_MOVE_POOL ? count - ENTRALINK_RANDOM_MOVE_POOL : 0;; first = 0) {
        damaging = 0;
        for (i = first; i < count; i++) {
            damaging += PML_MoveIsDamaging(pool[i]);
        }
        if (damaging != 0 || first == 0) {
            break;
        }
    }
    if (damaging == 0) {
        return;
    }
    pick = GFL_RandomLC(damaging);
    for (i = first; i < count; i++) {
        if (PML_MoveIsDamaging(pool[i]) && pick-- == 0) {
            enemy->moves[known == 0 ? 0 : GFL_RandomLC(known)] = pool[i];
            return;
        }
    }
}

// An enemy of a species: the rooms' level, its moves, one of its two abilities at random (its hidden one at
// ENTRALINK_RANDOM_HIDDEN_ABILITY_CHANCE), no item, a gender by its species' ratio, not shiny, never caught; and the
// NPC that shows it, which starts its battle
static void EntralinkRandom_MakeEnemy(EntralinkEnemy *enemy, EntralinkNpc *npc, const EntralinkRandomSpecies *species,
                                      HeapID heapId) {
    PersonalData *personal = PML_PersonalLoad(species->species, 0, heapId);
    u32 ratio = personal->sexRatio;

    MI_CpuFill8(enemy, 0, sizeof(EntralinkEnemy));
    enemy->species = species->species;
    enemy->level = ENTRALINK_RANDOM_LEVEL;
    enemy->scale = 100;
    enemy->catchId = ENTRALINK_NONE;
    if (personal->abilities[2] != 0 && GFL_RandomLC(100) < ENTRALINK_RANDOM_HIDDEN_ABILITY_CHANCE) {
        enemy->ability = ENTRALINK_ABILITY_HIDDEN;
    } else if (personal->abilities[1] != 0 && GFL_RandomLC(2) != 0) {
        enemy->ability = personal->abilities[1];
    } else {
        enemy->ability = personal->abilities[0];
    }
    if (ratio == SEX_RATIO_NONE) {
        enemy->gender = ENTRALINK_GENDER_RANDOM;
    } else if (ratio == SEX_RATIO_MALE || (ratio != SEX_RATIO_FEMALE && GFL_RandomLC(256) >= ratio)) {
        enemy->gender = ENTRALINK_GENDER_MALE;
    } else {
        enemy->gender = ENTRALINK_GENDER_FEMALE;
    }
    EntralinkRandom_DrawMoves(enemy, personal, heapId);
    PML_PersonalFree(personal);

    MI_CpuFill8(npc, 0, sizeof(EntralinkNpc));
    npc->type = ENTRALINK_NPC_BATTLE;
    npc->sprite = species->sprite;
    if (enemy->gender == ENTRALINK_GENDER_FEMALE) {
        npc->sprite += species->femaleOffset;
    }
    npc->before = ENTRALINK_NONE;
    npc->after = ENTRALINK_NONE;
    npc->count = 1;
    npc->chance = 100;
    npc->direction = DIR_DOWN;
    npc->beforeStyle = ENTRALINK_STYLE_TALK;
    npc->afterStyle = ENTRALINK_STYLE_TALK;
    npc->marker = ENTRALINK_NPC_MARKER_NONE;
}

// A battle's format by run.json's weights
static u32 EntralinkRandom_DrawFormat(void) {
    static const u8 WEIGHTS[ENTRALINK_FORMAT_TRIPLE + 1] = ENTRALINK_RANDOM_FORMAT_WEIGHTS;
    u32 total = 0;
    u32 pick;
    u32 format;

    for (format = 0; format < NELEMS(WEIGHTS); format++) {
        total += WEIGHTS[format];
    }
    pick = GFL_RandomLC(total);
    for (format = 0; pick >= WEIGHTS[format]; format++) {
        pick -= WEIGHTS[format];
    }
    return format;
}

void EntralinkRun_MakeRandomRoom(const EntralinkRoom *row, u32 round) {
    static const u16 BANDS[][2] = ENTRALINK_RANDOM_BST;
    static const u8 ANCHORS[][2] = ENTRALINK_RANDOM_ANCHORS;
    EntralinkRandomRoom *random = EntralinkRun_GetRandomRoom();
    u16 families[ENTRALINK_RANDOM_ENEMIES_MAX];
    u16 species[ENTRALINK_RUN_ENEMIES_MAX];
    const EntralinkRandomSpecies *battleSpecies[ENTRALINK_RUN_ENEMIES_MAX];
    const EntralinkRandomSpecies *drawn;
    EntralinkRandomSpecies *table;
    EntralinkBattle *battle;
    SpeciesFilter filter;
    u32 choices = row->type == ENTRALINK_TYPE_ENEMY_CHOICE ? 2 + GFL_RandomLC(2) : 1;
    const u8 *anchor;
    BOOL themed;
    u32 count = 0;
    u32 c;
    u32 e;

    // The species' table from the ROM for the room's making only (7 KB of the event heap, from its
    // tail; it was data in this overlay, which kept it in the DS's main arena for good)
    table = GFL_ArcSysReadHeapNew(ARCID_MMODEL_TBL, ENTRALINK_RANDOM_SPECIES_FILE, HEAPID_TAIL(HEAPID_GAMEEVENT));
    filter.table = table;
    filter.tableCount = GFL_ArcSysGetDataLength(ARCID_MMODEL_TBL, ENTRALINK_RANDOM_SPECIES_FILE) /
                        sizeof(EntralinkRandomSpecies);
    MI_CpuFill8(random, 0, sizeof(EntralinkRandomRoom));
    random->room = *row;
    random->room.firstBattle = 0;
    random->room.firstNpc = 0;
    random->room.battleCount = choices;
    filter.min = BANDS[round - 1][0];
    filter.max = BANDS[round - 1][1];
    filter.usedTypes = 0;
    filter.families = families;
    filter.familyCount = 0;
    filter.species = species;
    for (c = 0; c < choices; c++) {
        battle = &random->battles[c];
        battle->format = EntralinkRandom_DrawFormat();
        battle->enemyCount = battle->format + 1;
        battle->firstEnemy = count;
        battle->progressId = ENTRALINK_NONE;
        anchor = ANCHORS[choices * (choices - 1) / 2 + c];
        themed = GFL_RandomLC(100) < ENTRALINK_RANDOM_THEME_CHANCE;
        filter.lead = NULL;
        filter.speciesCount = 0;
        for (e = 0; e < battle->enemyCount; e++) {
            drawn = EntralinkRandom_DrawSpecies(&filter);
            if (e == 0 && themed) {
                filter.lead = drawn;
            }
            species[filter.speciesCount++] = drawn->species;
            battleSpecies[e] = drawn;
            EntralinkRandom_MakeEnemy(&random->enemies[count], &random->npcs[count], drawn, HEAPID_GAMEEVENT);
            random->npcs[count].battle = c;
            random->npcs[count].enemy = e;
            random->npcs[count].x = anchor[0] + sFormatTiles[battle->format][e][0];
            random->npcs[count].z = anchor[1] + sFormatTiles[battle->format][e][1];
            count++;
        }
        // The room's next choices keep apart from this one's types and families
        for (e = 0; e < battle->enemyCount; e++) {
            filter.usedTypes |= EntralinkRandom_TypeBits(battleSpecies[e]);
            families[filter.familyCount++] = battleSpecies[e]->family;
        }
    }
    random->room.npcCount = count;
    GFL_HeapFree(table);
}
