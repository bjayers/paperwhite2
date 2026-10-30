#include "types.h"
#include "constants/directions.h"
#include "constants/items.h"
#include "field/field.h"
#include "field/field_actor.h"
#include "field/field_actor_internal.h"
#include "field/field_internal.h"
#include "field/field_player.h"
#include "gfl/sound.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_ambient.h"
#include "paperwhite2/following_data.h"
#include "paperwhite2/following_dialogue.h"
#include "paperwhite2/following_effects.h"
#include "paperwhite2/following_field.h"
#include "paperwhite2/following_interaction.h"
#include "paperwhite2/following_reactions.h"

// Paper White 2: the Following Pokémon's steps, pickups and ambient emotes, from the dialogue library's pickup and
// ambient tables. See include/paperwhite2/following_ambient.h

// The frames that the last bubble step stays after it ends, as the talk's
#define BUBBLE_END_FRAMES 2
// The cry's pan, the center
#define CRY_PAN 64
#ifdef PAPERWHITE2_DEBUG_MENU
// The tries of a forced pickup's selection, whose rules may have a chance
#define FORCE_TRIES 32
#endif

typedef struct {
    // The player's tile and zone, once the follower counts
    BOOL tracking;
    s16 x;
    s16 z;
    u16 zone;
    // The bubble that shows over actor, its step and the frames into it
    BOOL showing;
    FieldActor *actor;
    FollowingBubble bubble;
    u32 index;
    u32 age;
    // The steps until the next ambient emote may show
    u16 cooldown;
} FollowingAmbient;

static FollowingAmbient sAmbient;

static void EndEmote(void) {
    // The talk takes the bubble over when it begins
    if (sAmbient.showing && !FollowingTalk_IsActive()) {
        FollowingEffects_EmoteEnd();
    }
    sAmbient.showing = FALSE;
}

void FollowingAmbient_Reset(void) {
    EndEmote();
    sAmbient.tracking = FALSE;
    sAmbient.actor = NULL;
}

static void TickEmote(void) {
    if (sAmbient.index < FOLLOWING_BUBBLE_STEPS) {
        FollowingEffects_EmoteFrame(sAmbient.actor, sAmbient.bubble.frames[sAmbient.index]);
        if (++sAmbient.age >= sAmbient.bubble.durations[sAmbient.index]) {
            sAmbient.age = 0;
            sAmbient.index++;
        }
    } else if (++sAmbient.age >= BUBBLE_END_FRAMES) {
        EndEmote();
    }
}

// A pickup: the item of the pool of the pickup rule chosen, which the Pokémon keeps. The item, or 0
static u32 Pickup(Field *field, ArcTool *arc, PartyPkm *pkm, const ConditionContext *ctx, u32 *rng) {
    s32 rule = FollowingDialogue_Select(FOLLOWING_TABLE_PICKUP, ctx, rng);
    const FollowingPickupRule *pickup;
    FollowingRecord record;
    u32 quantity;
    u32 item;

    if (rule < 0) {
        return ITEM_NONE;
    }
    pickup = FollowingDialogue_GetRule(FOLLOWING_TABLE_PICKUP, rule);
    item = FollowingDialogue_RollPool(arc, pickup->pool, rng, &quantity, Field_GetHeapID(field));
    if (item == ITEM_NONE) {
        return ITEM_NONE;
    }
    // A found item is one, whatever the pool's count: it waits on the Pokémon, which keeps one
    FollowingRecord_Read(pkm, &record);
    record.itemWaiting = item;
    FollowingRecord_Write(pkm, &record);
    return item;
}

// An ambient emote of the rule chosen, and its cooldown
static void ShowAmbient(FieldActor *actor, const FollowingPokemon *pokemon, const ConditionContext *ctx, u32 *rng) {
    s32 rule = FollowingDialogue_Select(FOLLOWING_TABLE_AMBIENT, ctx, rng);
    const FollowingAmbientRule *ambient;

    if (rule < 0) {
        return;
    }
    ambient = FollowingDialogue_GetRule(FOLLOWING_TABLE_AMBIENT, rule);
    if (!FollowingTalk_GetBubble(actor->actorSystem, ambient->emote, &sAmbient.bubble) ||
        !FollowingEffects_EmoteBegin(actor, sAmbient.bubble.emote)) {
        return;
    }
    sAmbient.showing = TRUE;
    sAmbient.actor = actor;
    sAmbient.index = sAmbient.age = 0;
    sAmbient.cooldown = ambient->cooldown;
    // The cry waits while the sound system loads, which PokeVoice_Play would spin on: an ambient one is left out
    if (ambient->cry != 0 && !GFL_SndIsLoadThreadRunning()) {
        PokeVoice_Play(pokemon->species, pokemon->form, CRY_PAN, 0, 0, 0, 0, NULL);
    }
}

void FollowingAmbient_Update(Field *field, FieldActor *actor, FieldActor *player, const FollowingPokemon *pokemon,
                             BOOL counting, BOOL shown) {
    ArcTool *arc;
    PartyPkm *pkm;
    ConditionContext ctx;
    u32 rng;

    if (sAmbient.showing &&
        (FollowingTalk_IsActive() || !shown || actor != sAmbient.actor || FollowingEffects_IsBusy())) {
        EndEmote();
    }
    if (sAmbient.showing) {
        TickEmote();
    }
    if (!counting || field == NULL || actor == NULL || player == NULL) {
        sAmbient.tracking = FALSE;
        return;
    }
    if (!sAmbient.tracking || player->zoneId != sAmbient.zone) {
        sAmbient.tracking = TRUE;
        sAmbient.x = player->gPos.x;
        sAmbient.z = player->gPos.z;
        sAmbient.zone = player->zoneId;
        return;
    }
    if (player->gPos.x == sAmbient.x && player->gPos.z == sAmbient.z) {
        return;
    }
    sAmbient.x = player->gPos.x;
    sAmbient.z = player->gPos.z;
    pkm = FollowingParty_Find(field->gameData, pokemon->personality, pokemon->trainer, pokemon->species, pokemon->form);
    if (pkm == NULL) {
        return;
    }
    FollowingRecord_AddStep(pkm);
    if (sAmbient.cooldown != 0) {
        sAmbient.cooldown--;
    }
    arc = actor->actorSystem->actorConfigArc;
    if (!FollowingDialogue_Load(arc, pokemon->species) ||
        !FollowingDialogue_FillContext(&ctx, field, pkm, actor->faceDir, player->gPos.x, player->gPos.z)) {
        return;
    }
    rng = Conditions_Seed(&ctx, CONDITION_SEED_CHECK, 0);
    if (ctx.itemWaiting == ITEM_NONE) {
        ctx.itemWaiting = Pickup(field, arc, pkm, &ctx, &rng);
    }
    if (shown && sAmbient.cooldown == 0 && !sAmbient.showing && !FollowingTalk_IsActive() &&
        !FollowingEffects_IsBusy()) {
        ShowAmbient(actor, pokemon, &ctx, &rng);
    }
}

#ifdef PAPERWHITE2_DEBUG_MENU

static s32 Abs(s32 x) {
    return x < 0 ? -x : x;
}

// The follower's party member, its actor and the player's: FALSE without them
static BOOL GetFollower(Field *field, FollowingPokemon *pokemon, FieldActor **actor, PartyPkm **pkm) {
    if (!PaperWhite2_FollowingGetSelection(pokemon, actor)) {
        return FALSE;
    }
    *pkm =
        FollowingParty_Find(field->gameData, pokemon->personality, pokemon->trainer, pokemon->species, pokemon->form);
    return *pkm != NULL;
}

BOOL FollowingDebug_GetRecord(Field *field, FollowingRecord *record, u16 *species) {
    FollowingPokemon pokemon;
    FieldActor *actor;
    PartyPkm *pkm;

    if (!GetFollower(field, &pokemon, &actor, &pkm)) {
        return FALSE;
    }
    FollowingRecord_Read(pkm, record);
    *species = pokemon.species;
    return TRUE;
}

BOOL FollowingDebug_SetSteps(Field *field, u32 steps) {
    FollowingPokemon pokemon;
    FieldActor *actor;
    PartyPkm *pkm;
    FollowingRecord record;

    if (!GetFollower(field, &pokemon, &actor, &pkm)) {
        return FALSE;
    }
    FollowingRecord_Read(pkm, &record);
    record.steps = steps;
    FollowingRecord_Write(pkm, &record);
    return TRUE;
}

BOOL FollowingDebug_ClearItem(Field *field) {
    FollowingPokemon pokemon;
    FieldActor *actor;
    PartyPkm *pkm;
    FollowingRecord record;

    if (!GetFollower(field, &pokemon, &actor, &pkm)) {
        return FALSE;
    }
    FollowingRecord_Read(pkm, &record);
    record.itemWaiting = ITEM_NONE;
    FollowingRecord_Write(pkm, &record);
    return TRUE;
}

u32 FollowingDebug_ForcePickup(Field *field) {
    FollowingPokemon pokemon;
    FieldActor *actor;
    PartyPkm *pkm;
    ConditionContext ctx;
    FollowingRecord record;
    ArcTool *arc;
    u32 rng;
    u32 item = ITEM_NONE;
    u32 quantity;
    u32 i;

    if (!GetFollower(field, &pokemon, &actor, &pkm) || actor == NULL) {
        return ITEM_NONE;
    }
    arc = actor->actorSystem->actorConfigArc;
    if (!FollowingDialogue_Load(arc, pokemon.species) ||
        !FollowingDialogue_FillContext(&ctx, field, pkm, actor->faceDir, actor->gPos.x, actor->gPos.z)) {
        return ITEM_NONE;
    }
    ctx.steps = FOLLOWING_RECORD_STEPS_MAX;
    ctx.itemWaiting = ITEM_NONE;
    rng = Conditions_Seed(&ctx, CONDITION_SEED_CHECK, 0);
    for (i = 0; i < FORCE_TRIES && item == ITEM_NONE; i++) {
        item = Pickup(field, arc, pkm, &ctx, &rng);
    }
    if (item == ITEM_NONE) {
        item = FollowingDialogue_RollPool(arc, 0, &rng, &quantity, Field_GetHeapID(field));
        if (item != ITEM_NONE) {
            FollowingRecord_Read(pkm, &record);
            record.itemWaiting = item;
            FollowingRecord_Write(pkm, &record);
        }
    }
    return item;
}

s32 FollowingDebug_GetRule(Field *field, u32 table, const char **name, u32 *priority, u32 *matches) {
    FollowingPokemon pokemon;
    FieldActor *actor;
    FieldActor *player = field->player != NULL ? FieldPlayer_GetActor(field->player) : NULL;
    PartyPkm *pkm;
    ConditionContext ctx;
    const ConditionTable *rules;
    u32 matched[CONDITION_TABLE_MAX_RULES / 32];
    s32 dx;
    s32 dz;
    u32 face;
    u32 rng;
    s32 rule;
    u32 i;

    *name = "";
    *priority = *matches = 0;
    if (!GetFollower(field, &pokemon, &actor, &pkm) || actor == NULL || player == NULL ||
        !FollowingDialogue_Load(actor->actorSystem->actorConfigArc, pokemon.species)) {
        return -2;
    }
    // The way the follower faces to look at the player, as the talk turns it on a grid
    dx = player->wPos.x - actor->wPos.x;
    dz = player->wPos.z - actor->wPos.z;
    face = Abs(dx) > Abs(dz) ? (dx < 0 ? DIR_LEFT : DIR_RIGHT) : (dz < 0 ? DIR_UP : DIR_DOWN);
    if (table != FOLLOWING_TABLE_TALK) {
        face = actor->faceDir;
    }
    if (!FollowingDialogue_FillContext(&ctx, field, pkm, face, player->gPos.x, player->gPos.z)) {
        return -2;
    }
    rules = FollowingDialogue_GetTable(table);
    if (rules == NULL) {
        return -1;
    }
    rng = Conditions_Seed(&ctx, CONDITION_SEED_CHECK, 0);
    rule = Conditions_Select(rules, &ctx, rules->share, &rng, matched);
    for (i = 0; i < rules->ruleCount; i++) {
        *matches += (matched[i / 32] >> (i % 32)) & 1;
    }
    if (rule >= 0) {
        *name = FollowingDialogue_GetName(table, rule);
        *priority = Conditions_GetRule(rules, rule)->priority;
    }
    return rule;
}

#endif
