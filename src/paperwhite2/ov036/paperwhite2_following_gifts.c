#include "types.h"
#include "constants/pokemon.h"
#include "gfl/heap.h"
#include "paperwhite2/following_gifts.h"
#include "paperwhite2/following_reactions.h"
#include "pml/poke_party.h"
#include "save/bag.h"
#include "system/game_data.h"

// Paper White 2: the Following Pokémon's contextual gifts, ported from Pokeweb's gifts.c. A party member has ten gift
// slots, each given once. The claims are kept in the Pokémon's own data, so they go with it into the PC and trades:
// in the top 16 bits of block C's ribbons, whose low 10 bits are the slots' claims. The game reads that u64 as
// ribbons too: PokeParty_CheckAnyRibbon sees a Pokémon that has given a gift as one that has a ribbon. Kept as the
// original stores it

#define GIFT_SLOTS 10
#define CLAIMS_MASK ((1u << GIFT_SLOTS) - 1)
#define CLAIMS_SHIFT 48
#define CLAIMS_RIBBONS (0xffffULL << CLAIMS_SHIFT)
// PML_PkmGetParamBlockCore's block of PkmBlockC
#define BLOCK_C 2

// Whether a party member is the snapshot's Pokémon, and no egg
static BOOL IsSnapshotPokemon(PartyPkm *pkm, const FollowingReactionSnapshot *snapshot) {
    return pkm != NULL && PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL) == snapshot->pokemon.personality &&
           PokeParty_GetParam(pkm, PKM_PARAM_ID, NULL) == snapshot->pokemon.trainer &&
           PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL) == snapshot->pokemon.species &&
           PokeParty_GetParam(pkm, PKM_PARAM_FORM, NULL) == snapshot->pokemon.form &&
           PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL) == 0;
}

static PartyPkm *FindSnapshotPokemon(GameData *gameData, const FollowingReactionSnapshot *snapshot) {
    PokeParty *party = GameData_GetParty(gameData);
    PartyPkm *pkm;
    u32 count;
    u32 i;

    if (party == NULL) {
        return NULL;
    }
    count = PokeParty_GetPkmCount(party);
    if (count > PARTY_SIZE) {
        count = PARTY_SIZE;
    }
    for (i = 0; i < count; i++) {
        pkm = PokeParty_GetPkm(party, i);
        if (IsSnapshotPokemon(pkm, snapshot)) {
            return pkm;
        }
    }
    return NULL;
}

// Reads a party member's claims and its whole 16 bits into old (either may be NULL), and claims those of set. FALSE,
// with nothing read, when its data doesn't sum to its checksum
static BOOL AccessClaims(PartyPkm *pkm, u16 *claims, u16 set, u16 *old) {
    BoxPkm *box = &pkm->base;
    BOOL wasEncrypted;
    PkmBlockC *blockC;
    u16 value;

    wasEncrypted = PML_PkmDecrypt(box);
    // Data that was encrypted and doesn't sum to its checksum is encrypted again as it was, keeping its checksum,
    // where PML_PkmReEncrypt would compute a new one
    if (wasEncrypted && PML_CryptoGenKey(&box->contentBuffer, sizeof(PkmBuffer)) != box->checksum) {
        box->boxDecrypted = FALSE;
        PML_CryptoRun(&box->contentBuffer, sizeof(PkmBuffer), box->checksum);
        return FALSE;
    }
    blockC = PML_PkmGetParamBlockCore(box, box->pid, BLOCK_C);
    value = blockC->ribbons >> CLAIMS_SHIFT;
    if (claims != NULL) {
        *claims = value & CLAIMS_MASK;
    }
    if (old != NULL) {
        *old = value;
    }
    if (set != 0) {
        blockC->ribbons |= (u64)set << CLAIMS_SHIFT;
    }
    PML_PkmReEncrypt(box, wasEncrypted);
    return TRUE;
}

BOOL FollowingGifts_ReadClaims(GameData *gameData, const FollowingReactionSnapshot *snapshot, u16 *claims) {
    PartyPkm *pkm = FindSnapshotPokemon(gameData, snapshot);

    return pkm != NULL && AccessClaims(pkm, claims, 0, NULL);
}

s32 FollowingGifts_Grant(GameData *gameData, const FollowingReactionSnapshot *snapshot,
                         const FollowingGiftChoice *choice) {
    PartyPkm *pkm;
    BagSave *bag;
    u16 claims = 0;
    u16 old = 0;
    BOOL wasEncrypted;
    PkmBlockC *blockC;

    if (choice == NULL || choice->slot >= GIFT_SLOTS || choice->item == 0 || choice->quantity == 0) {
        return FOLLOWING_GIFT_STALE;
    }
    pkm = FindSnapshotPokemon(gameData, snapshot);
    if (pkm == NULL || !AccessClaims(pkm, &claims, 0, &old) || (claims & (1u << choice->slot))) {
        return FOLLOWING_GIFT_STALE;
    }
    bag = GameData_GetBag(gameData);
    if (bag == NULL) {
        return FOLLOWING_GIFT_STALE;
    }
    // The bag checks the item, its pocket, the count and the room for it
    if (!BagSave_CheckAvailItemSpace(bag, choice->item, choice->quantity, HEAPID_GAMEEVENT)) {
        return FOLLOWING_GIFT_NOT_GIVEN;
    }
    if (!AccessClaims(pkm, NULL, 1u << choice->slot, NULL)) {
        return FOLLOWING_GIFT_STALE;
    }
    if (BagSave_AddItem(bag, choice->item, choice->quantity, HEAPID_GAMEEVENT)) {
        return FOLLOWING_GIFT_GIVEN;
    }
    // The item wasn't added after all: the claims go back to what they were. Nothing ran in between, so the party
    // member is found again without its checksum checked
    pkm = FindSnapshotPokemon(gameData, snapshot);
    if (pkm != NULL) {
        wasEncrypted = PML_PkmDecrypt(&pkm->base);
        blockC = PML_PkmGetParamBlockCore(&pkm->base, pkm->base.pid, BLOCK_C);
        blockC->ribbons = (blockC->ribbons & ~CLAIMS_RIBBONS) | (u64)old << CLAIMS_SHIFT;
        PML_PkmReEncrypt(&pkm->base, wasEncrypted);
    }
    return FOLLOWING_GIFT_NOT_GIVEN;
}
