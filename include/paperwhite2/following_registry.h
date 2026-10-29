#ifndef PAPERWHITE2_FOLLOWING_REGISTRY_H
#define PAPERWHITE2_FOLLOWING_REGISTRY_H

#include "types.h"

// Paper White 2: the Following Pokémon's registry, the table of each species and form's model row and resources
// (src/paperwhite2/ov036/paperwhite2_following_registry.c), ported from Pokeweb's registry.h

// The registry's format version, which its header gives
#define FOLLOWING_REGISTRY_ABI 1
// The size of the page that the registry is read through
#define FOLLOWING_REGISTRY_PAGE 1024

// The file of ARCID_MMODEL_TBL that holds the registry, after the model table
#define FOLLOWING_REGISTRY_FILE 1

// Reads size bytes at offset of the registry into dest, TRUE when it read them
typedef BOOL (*FollowingRegistryRead)(void *context, u32 offset, void *dest, u32 size);

// The callback and its context are used only during the one FollowingRegistry_Stream call
typedef struct {
    FollowingRegistryRead read;
    void *context;
    // The caller's page, FOLLOWING_REGISTRY_PAGE bytes
    u8 *page;
    // Filled with the first row of each species, FOLLOWING_MAX_SPECIES + 2 entries
    u16 *index;
    u32 indexCount;
    // The registry's size in bytes
    u32 size;
    // The CRC-32 of the whole registry, which its descriptor gives
    u32 outerCrc;
    // The count of rows of the model table, and of the follower's resources
    u16 descriptors;
    u16 resources;
    // Set by a valid registry: its count of rows and the size of a row
    u16 count;
    u16 stride;
} FollowingRegistryInput;

// Reads and checks the whole registry through input's page and fills its index, TRUE when it is valid. Nothing is
// allocated, and neither the callback nor a file is kept
BOOL FollowingRegistry_Stream(FollowingRegistryInput *input);

#endif // PAPERWHITE2_FOLLOWING_REGISTRY_H
