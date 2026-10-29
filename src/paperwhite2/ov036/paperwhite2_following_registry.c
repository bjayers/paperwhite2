#include "types.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_registry.h"

// Paper White 2: the Following Pokémon's registry, read a page at a time and checked as a whole before any of it is
// used, ported from Pokeweb's registry.c. The registry is "FWDB", a 32-byte header, then its rows sorted by key
// (species, form, gender and shininess), then its zone rows sorted by zone

#define REGISTRY_HEADER_SIZE 32
// Versions 1 and 3 have rows of 24 bytes. The full package's larger registry has packed rows of 12 in versions 2
// and 4, which the base package doesn't read
#define REGISTRY_ROW_SIZE 24
// The rows that fit in a page
#define REGISTRY_PAGE_ROWS 42
#define REGISTRY_ZONE_ROW_SIZE 8

static u16 Read16(const u8 *p) {
    return p[0] | (u16)p[1] << 8;
}

static u32 Read32(const u8 *p) {
    return Read16(p) | (u32)Read16(p + 2) << 16;
}

// The CRC-32 (reflected, polynomial 0xedb88320) of size more bytes, a bit at a time
static u32 UpdateCrc(u32 crc, const u8 *p, u32 size) {
    u32 j;

    while (size--) {
        crc ^= *p++;
        for (j = 0; j < 8; j++) {
            crc = (crc >> 1) ^ ((0u - (crc & 1u)) & 0xedb88320u);
        }
    }
    return crc;
}

BOOL FollowingRegistry_Stream(FollowingRegistryInput *input) {
    u8 header[REGISTRY_HEADER_SIZE];
    const u8 *row;
    u32 version;
    u32 count;
    u32 zones;
    u32 expected;
    u32 outer;
    u32 inner;
    u32 last;
    u32 next;
    u32 first;
    u32 n;
    u32 key;
    u32 species;
    u32 modelRow;
    u32 resource;
    u32 zone;
    u32 i;
    u32 j;

    if (input == NULL || input->read == NULL || input->page == NULL || input->index == NULL ||
        input->indexCount != FOLLOWING_MAX_SPECIES + 2 || input->size < REGISTRY_HEADER_SIZE) {
        return FALSE;
    }
    input->count = input->stride = 0;
    if (!input->read(input->context, 0, header, REGISTRY_HEADER_SIZE)) {
        return FALSE;
    }
    version = Read16(header + 4);
    if (version != 1 && version != 3) {
        return FALSE;
    }
    count = Read16(header + 12);
    zones = Read16(header + 14);
    if (header[0] != 'F' || header[1] != 'W' || header[2] != 'D' || header[3] != 'B' ||
        Read16(header + 6) != FOLLOWING_REGISTRY_ABI || count == 0 || count > FOLLOWING_MAX_ROWS ||
        input->size != REGISTRY_HEADER_SIZE + count * REGISTRY_ROW_SIZE + zones * REGISTRY_ZONE_ROW_SIZE ||
        Read32(header + 8) != input->size || Read32(header + 28) != 0 || input->descriptors <= FOLLOWING_STOCK_ROWS ||
        input->descriptors > FOLLOWING_STOCK_ROWS + FOLLOWING_MAX_ROWS || input->resources == 0 ||
        Read16(header + 16) != input->descriptors || Read16(header + 18) != input->resources ||
        Read16(header + 20) != FOLLOWING_CODE_BASE || Read16(header + 22) != FOLLOWING_STOCK_ROWS) {
        return FALSE;
    }
    // The header's own CRC is of the registry with its CRC field zero, and the outer one of the registry as it is
    expected = Read32(header + 24);
    outer = UpdateCrc(~0u, header, REGISTRY_HEADER_SIZE);
    for (i = 24; i < 28; i++) {
        header[i] = 0;
    }
    inner = UpdateCrc(~0u, header, REGISTRY_HEADER_SIZE);
    last = 0;
    next = 0;
    for (first = 0; first < count;) {
        n = REGISTRY_PAGE_ROWS;
        if (n > count - first) {
            n = count - first;
        }
        if (!input->read(input->context, REGISTRY_HEADER_SIZE + first * REGISTRY_ROW_SIZE, input->page,
                         n * REGISTRY_ROW_SIZE)) {
            return FALSE;
        }
        outer = UpdateCrc(outer, input->page, n * REGISTRY_ROW_SIZE);
        inner = UpdateCrc(inner, input->page, n * REGISTRY_ROW_SIZE);
        for (i = 0; i < n; i++) {
            row = input->page + i * REGISTRY_ROW_SIZE;
            species = Read16(row);
            modelRow = Read16(row + 6);
            resource = Read16(row + 8);
            if (row[3] > 2 || row[4] > 1 || row[5] > 1 || (row[10] != 32 && row[10] != 64) || row[11] > 1) {
                return FALSE;
            }
            // Version 3 adds the side gap in byte 15, and the rest of the row is zero
            if (version == 3 && row[15] > FOLLOWING_MAX_SIDE_GAP) {
                return FALSE;
            }
            for (j = version == 3 ? 16 : 15; j < REGISTRY_ROW_SIZE; j++) {
                if (row[j] != 0) {
                    return FALSE;
                }
            }
            // The rows are sorted by species, form, gender and shininess
            key = species * 2048 + row[2] * 8 + row[3] * 2 + row[4];
            if (species == 0 || species > FOLLOWING_MAX_SPECIES || modelRow < FOLLOWING_STOCK_ROWS ||
                modelRow >= input->descriptors || resource >= input->resources || ((first + i) != 0 && key <= last)) {
                return FALSE;
            }
            while (next <= species) {
                input->index[next++] = first + i;
            }
            last = key;
        }
        first += n;
    }
    while (next < input->indexCount) {
        input->index[next++] = count;
    }
    last = 0;
    for (first = 0; first < zones;) {
        n = FOLLOWING_REGISTRY_PAGE / REGISTRY_ZONE_ROW_SIZE;
        if (n > zones - first) {
            n = zones - first;
        }
        if (!input->read(input->context,
                         REGISTRY_HEADER_SIZE + count * REGISTRY_ROW_SIZE + first * REGISTRY_ZONE_ROW_SIZE, input->page,
                         n * REGISTRY_ZONE_ROW_SIZE)) {
            return FALSE;
        }
        outer = UpdateCrc(outer, input->page, n * REGISTRY_ZONE_ROW_SIZE);
        inner = UpdateCrc(inner, input->page, n * REGISTRY_ZONE_ROW_SIZE);
        for (i = 0; i < n; i++) {
            row = input->page + i * REGISTRY_ZONE_ROW_SIZE;
            zone = Read16(row);
            if (((first + i) != 0 && zone <= last) || row[2] > 1 || row[3] != 0) {
                return FALSE;
            }
            last = zone;
        }
        first += n;
    }
    if (~outer != input->outerCrc || ~inner != expected) {
        return FALSE;
    }
    input->count = count;
    input->stride = REGISTRY_ROW_SIZE;
    return TRUE;
}
