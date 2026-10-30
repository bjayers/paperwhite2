#include "types.h"
#include "gfl/random.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/level_scaling_config.h"
#include "save/event_work.h"

// Paper White 2: the conditions module's matcher, selection, seeds and level scaling, in main, where the field's
// overlays and the apps (the Dexnav) can all call them. It reads only the context and the table, so the host test
// (tools/paperwhite2/test_conditions.py) compiles it as it is. See include/paperwhite2/conditions.h

// A linear congruential generator's constants, Numerical Recipes'
#define RANDOM_MULTIPLIER 1664525
#define RANDOM_INCREMENT 1013904223
#define PERCENT 100
#define LEVEL_LOWEST 1
#define LEVEL_HIGHEST 100
// The bits of the masks of CONDITION_OP_MASK
#define MASK_BITS 32

// The part of the context that each kind reads (CONDITION_CONTEXT_*); a chance reads none
static const u8 sConditionKindParts[CONDITION_KIND_COUNT] = {
    CONDITION_CONTEXT_WORLD,   CONDITION_CONTEXT_WORLD,   CONDITION_CONTEXT_WORLD,    CONDITION_CONTEXT_WORLD,
    CONDITION_CONTEXT_WORLD,   CONDITION_CONTEXT_WORLD,   CONDITION_CONTEXT_FIELD,    CONDITION_CONTEXT_FIELD,
    CONDITION_CONTEXT_PARTY,   CONDITION_CONTEXT_PARTY,   CONDITION_CONTEXT_SUBJECT,  CONDITION_CONTEXT_SUBJECT,
    CONDITION_CONTEXT_SUBJECT, CONDITION_CONTEXT_SUBJECT, CONDITION_CONTEXT_SUBJECT,  CONDITION_CONTEXT_SUBJECT,
    CONDITION_CONTEXT_SUBJECT, CONDITION_CONTEXT_SUBJECT, CONDITION_CONTEXT_FOLLOWER, 0,
};

static const u8 *Conditions_GetBytes(const ConditionTable *table, u32 offset);
static u32 Conditions_GetEnd(const ConditionTable *table, u32 index);
static BOOL Conditions_InList(const ConditionTable *table, u32 list, u32 value);
static BOOL Conditions_MatchSpecies(const ConditionTable *table, const Condition *clause, const ConditionContext *ctx);
static u32 Conditions_GetValue(const Condition *clause, const ConditionContext *ctx);
static BOOL Conditions_MatchClause(const ConditionTable *table, const Condition *clause, const ConditionContext *ctx,
                                   u32 *rng);

u32 Conditions_Hash(u32 a, u32 b) {
    u32 hash = a * 0x9e3779b1 + b;

    hash ^= hash >> 16;
    hash *= 0x85ebca6b;
    hash ^= hash >> 13;
    hash *= 0xc2b2ae35;
    hash ^= hash >> 16;
    return hash;
}

u32 Conditions_Random(u32 *state, u32 max) {
    *state = *state * RANDOM_MULTIPLIER + RANDOM_INCREMENT;
    // The state mixed, so that neighboring seeds (a zone's load counter, say) don't give neighboring draws
    return (u32)(((u64)Conditions_Hash(*state, 0) * max) >> 32);
}

u32 Conditions_Seed(const ConditionContext *ctx, u32 seed, u32 key) {
    switch (seed) {
    case CONDITION_SEED_LOAD:
        return Conditions_Hash(ctx->loadSeed, key);
    case CONDITION_SEED_DAY:
        return Conditions_Hash(ctx->daySeed, key);
    }
    return GFL_RandomLC(0);
}

BOOL Conditions_IsTableValid(const ConditionTable *table, u32 size) {
    const ConditionRule *rule;
    u32 i;

    if (size < sizeof(ConditionTable) || table->magic != CONDITION_TABLE_MAGIC ||
        table->version != CONDITION_TABLE_VERSION || table->size > size ||
        table->ruleCount > CONDITION_TABLE_MAX_RULES ||
        sizeof(ConditionTable) + (table->ruleCount + table->listCount) * sizeof(u16) > table->size) {
        return FALSE;
    }
    for (i = 0; i < (u32)(table->ruleCount + table->listCount); i++) {
        if (table->offsets[i] % sizeof(u32) != 0 || table->offsets[i] + sizeof(u32) > table->size) {
            return FALSE;
        }
    }
    for (i = 0; i < table->ruleCount; i++) {
        rule = Conditions_GetRule(table, i);
        if (table->offsets[i] + sizeof(ConditionRule) + rule->clauseCount * sizeof(Condition) >
            Conditions_GetEnd(table, i)) {
            return FALSE;
        }
    }
    return TRUE;
}

const ConditionRule *Conditions_GetRule(const ConditionTable *table, u32 index) {
    return (const ConditionRule *)Conditions_GetBytes(table, table->offsets[index]);
}

const Condition *Conditions_GetClauses(const ConditionRule *rule) {
    return (const Condition *)(rule + 1);
}

const void *Conditions_GetPayload(const ConditionTable *table, u32 index, u32 *size) {
    const ConditionRule *rule = Conditions_GetRule(table, index);
    u32 start = table->offsets[index] + sizeof(ConditionRule) + rule->clauseCount * sizeof(Condition);

    *size = Conditions_GetEnd(table, index) - start;
    return Conditions_GetBytes(table, start);
}

BOOL Conditions_MatchRule(const ConditionTable *table, u32 index, const ConditionContext *ctx, u32 *rng) {
    const ConditionRule *rule = Conditions_GetRule(table, index);
    const Condition *clauses = Conditions_GetClauses(rule);
    u32 i;

    for (i = 0; i < rule->clauseCount; i++) {
        if (!Conditions_MatchClause(table, &clauses[i], ctx, rng)) {
            return FALSE;
        }
    }
    return TRUE;
}

s32 Conditions_Select(const ConditionTable *table, const ConditionContext *ctx, u32 share, u32 *rng, u32 *matched) {
    u32 own[CONDITION_TABLE_MAX_RULES / MASK_BITS];
    u32 *bits = matched != NULL ? matched : own;
    const ConditionRule *rule;
    s32 above = CONDITION_TABLE_MAX_RULES;
    s32 priority;
    BOOL lower;
    u32 total;
    u32 pick;
    u32 i;

    for (i = 0; i < CONDITION_TABLE_MAX_RULES / MASK_BITS; i++) {
        bits[i] = 0;
    }
    for (i = 0; i < table->ruleCount; i++) {
        if (Conditions_MatchRule(table, i, ctx, rng)) {
            bits[i / MASK_BITS] |= 1 << (i % MASK_BITS);
        }
    }
    // Each priority that matched, from the highest: its rules by weight in share percent of the checks, and always
    // when no lower one matched
    while (TRUE) {
        priority = -1;
        for (i = 0; i < table->ruleCount; i++) {
            rule = Conditions_GetRule(table, i);
            if ((bits[i / MASK_BITS] >> (i % MASK_BITS)) & 1 && rule->priority < above && rule->priority > priority) {
                priority = rule->priority;
            }
        }
        if (priority < 0) {
            return -1;
        }
        total = 0;
        lower = FALSE;
        for (i = 0; i < table->ruleCount; i++) {
            rule = Conditions_GetRule(table, i);
            if ((bits[i / MASK_BITS] >> (i % MASK_BITS)) & 1) {
                if (rule->priority == priority) {
                    total += rule->weight;
                } else if (rule->priority < priority) {
                    lower = TRUE;
                }
            }
        }
        if (total != 0 && (!lower || share >= CONDITION_SHARE_ALL || Conditions_Random(rng, PERCENT) < share)) {
            pick = Conditions_Random(rng, total);
            for (i = 0; i < table->ruleCount; i++) {
                rule = Conditions_GetRule(table, i);
                if ((bits[i / MASK_BITS] >> (i % MASK_BITS)) & 1 && rule->priority == priority) {
                    if (pick < rule->weight) {
                        return i;
                    }
                    pick -= rule->weight;
                }
            }
        }
        above = priority;
    }
}

u32 Conditions_MedianLevel(u8 *levels, u32 count) {
    u32 i;
    u32 j;
    u8 level;

    if (count == 0) {
        return 0;
    }
    for (i = 1; i < count; i++) {
        level = levels[i];
        for (j = i; j > 0 && levels[j - 1] > level; j--) {
            levels[j] = levels[j - 1];
        }
        levels[j] = level;
    }
    return levels[(count - 1) / 2];
}

u32 Conditions_ScaledLevel(u32 median) {
    s32 level = (s32)(median * LEVEL_SCALING_PERCENT / PERCENT) + LEVEL_SCALING_OFFSET;

    if (level < LEVEL_SCALING_MIN) {
        return LEVEL_SCALING_MIN;
    }
    if (level > LEVEL_SCALING_MAX) {
        return LEVEL_SCALING_MAX;
    }
    return level;
}

u32 Conditions_ScaledLevelMin(u32 scaled) {
    if (scaled < LEVEL_LOWEST + LEVEL_SCALING_SPREAD) {
        return LEVEL_LOWEST;
    }
    return scaled - LEVEL_SCALING_SPREAD;
}

u32 Conditions_ScaledLevelMax(u32 scaled) {
    if (scaled + LEVEL_SCALING_SPREAD > LEVEL_HIGHEST) {
        return LEVEL_HIGHEST;
    }
    return scaled + LEVEL_SCALING_SPREAD;
}

// The table's bytes from an offset, which its rules and lists are laid out in
static const u8 *Conditions_GetBytes(const ConditionTable *table, u32 offset) {
    return (const u8 *)table + offset;
}

// Where a rule's payload ends: at the next rule, the first list, or the table's end
static u32 Conditions_GetEnd(const ConditionTable *table, u32 index) {
    if (index + 1 < (u32)(table->ruleCount + table->listCount)) {
        return table->offsets[index + 1];
    }
    return table->size;
}

// A binary search of the table's sorted list
static BOOL Conditions_InList(const ConditionTable *table, u32 list, u32 value) {
    const u16 *items;
    u32 low = 0;
    u32 high;
    u32 middle;

    if (list >= table->listCount) {
        return FALSE;
    }
    items = (const u16 *)Conditions_GetBytes(table, table->offsets[table->ruleCount + list]);
    high = items[0];
    items++;
    while (low < high) {
        middle = (low + high) / 2;
        if (items[middle] == value) {
            return TRUE;
        }
        if (items[middle] < value) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    return FALSE;
}

// The subject's species against an entry of any form or of one form, or a list of them
static BOOL Conditions_MatchSpecies(const ConditionTable *table, const Condition *clause, const ConditionContext *ctx) {
    u32 withForm = CONDITION_SPECIES_ENTRY(ctx->species, ctx->form);

    if (clause->op == CONDITION_OP_IN_LIST) {
        return Conditions_InList(table, clause->arg, ctx->species) || Conditions_InList(table, clause->arg, withForm);
    }
    return clause->arg == ctx->species || clause->arg == withForm;
}

// The context's value that a clause compares
static u32 Conditions_GetValue(const Condition *clause, const ConditionContext *ctx) {
    switch (clause->kind) {
    case CONDITION_KIND_SEASON:
        return ctx->season;
    case CONDITION_KIND_PERIOD:
        return ctx->period;
    case CONDITION_KIND_WEATHER:
        return ctx->weather;
    case CONDITION_KIND_FLAG:
        return EventWork_FlagGet(ctx->eventWork, clause->arg);
    case CONDITION_KIND_VAR:
        return *EventWork_GetWkPtr(ctx->eventWork, clause->arg);
    case CONDITION_KIND_ZONE:
        return ctx->zone;
    case CONDITION_KIND_EXTERIOR:
        return ctx->exterior;
    case CONDITION_KIND_PARTY_LEVEL:
        return ctx->medianLevel;
    case CONDITION_KIND_SCALED_LEVEL:
        return ctx->scaledLevel;
    case CONDITION_KIND_LEVEL:
        return ctx->level;
    case CONDITION_KIND_NATURE:
        return ctx->nature;
    case CONDITION_KIND_HP:
        return ctx->hpPercent;
    case CONDITION_KIND_STATUS:
        return ctx->status;
    case CONDITION_KIND_FRIENDSHIP:
        return ctx->friendship;
    case CONDITION_KIND_STEPS:
        return ctx->steps;
    case CONDITION_KIND_FOLLOWER:
        return ctx->followerSpecies;
    }
    return 0;
}

static BOOL Conditions_MatchClause(const ConditionTable *table, const Condition *clause, const ConditionContext *ctx,
                                   u32 *rng) {
    u32 part;
    u32 value;
    u32 operand;

    if (clause->kind >= CONDITION_KIND_COUNT) {
        return FALSE;
    }
    // A clause on a part that the caller didn't fill fails
    part = sConditionKindParts[clause->kind];
    if ((ctx->filled & part) != part) {
        return FALSE;
    }
    switch (clause->kind) {
    case CONDITION_KIND_CHANCE:
        return Conditions_Random(rng, PERCENT) < clause->value;
    case CONDITION_KIND_TERRAIN:
        return (ctx->terrain & clause->value) != 0;
    case CONDITION_KIND_TYPE:
        return ((clause->value >> ctx->type1) & 1) || ((clause->value >> ctx->type2) & 1);
    case CONDITION_KIND_SPECIES:
        return Conditions_MatchSpecies(table, clause, ctx);
    }
    value = Conditions_GetValue(clause, ctx);
    operand = clause->kind == CONDITION_KIND_VAR ? clause->value : clause->arg;
    switch (clause->op) {
    case CONDITION_OP_EQ:
        return value == operand;
    case CONDITION_OP_NE:
        return value != operand;
    case CONDITION_OP_GE:
        return value >= operand;
    case CONDITION_OP_LE:
        return value <= operand;
    case CONDITION_OP_GT:
        return value > operand;
    case CONDITION_OP_LT:
        return value < operand;
    case CONDITION_OP_IN_LIST:
        return Conditions_InList(table, clause->arg, value);
    case CONDITION_OP_ANY:
        return value != 0;
    case CONDITION_OP_RANGE:
        return clause->arg <= value && value <= clause->value;
    case CONDITION_OP_MASK:
        return value < MASK_BITS && ((clause->value >> value) & 1);
    case CONDITION_OP_SET:
        return value;
    case CONDITION_OP_UNSET:
        return !value;
    }
    return FALSE;
}
