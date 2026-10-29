#include "types.h"
#include "gfl/arc.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_positioning.h"

// Paper White 2: the Following Pokémon's positioning table, ported from Pokeweb's positioning.c, which read it from
// member 0 of its own archive. The table is now file 2 of ARCID_MMODEL_TBL, after the model table and the registry:
// "FWPO", a 24-byte header, then its land rows of 12 bytes and its Surf rows of 8. Only the chosen land row is read

#define POSITIONING_MAGIC ('F' | 'W' << 8 | 'P' << 16 | (u32)'O' << 24)
#define POSITIONING_VERSION 1
#define POSITIONING_HEADER_SIZE 24
// The size of a row of the Surf table, which the base package doesn't read
#define POSITIONING_SURF_ROW_SIZE 8

static u16 Read16(const u8 *p) {
    return p[0] | (u16)p[1] << 8;
}

static u32 Read32(const u8 *p) {
    return Read16(p) | (u32)Read16(p + 2) << 16;
}

BOOL FollowingPositioning_ReadLand(ArcTool *arc, u32 row, u32 count, u32 registryCrc, u8 *out) {
    u8 header[POSITIONING_HEADER_SIZE];
    u32 length;
    u32 land;
    u32 surf;
    u32 i;

    if (GFL_ArcToolGetDataMax(arc) <= FOLLOWING_POSITIONING_FILE) {
        return FALSE;
    }
    length = GFL_ArcToolGetDataLength(arc, FOLLOWING_POSITIONING_FILE);
    if (length < POSITIONING_HEADER_SIZE) {
        return FALSE;
    }
    GFL_ArcToolReadRange(arc, FOLLOWING_POSITIONING_FILE, 0, POSITIONING_HEADER_SIZE, header);
    land = Read16(header + 6);
    surf = Read16(header + 8);
    // The header gives the rows' sizes and the CRC-32 of the registry it was written for
    if (Read32(header) != POSITIONING_MAGIC || Read16(header + 4) != POSITIONING_VERSION ||
        header[10] != FOLLOWING_POSITIONING_ROW_SIZE || header[11] != POSITIONING_SURF_ROW_SIZE ||
        length != POSITIONING_HEADER_SIZE + land * FOLLOWING_POSITIONING_ROW_SIZE + surf * POSITIONING_SURF_ROW_SIZE ||
        land != count || row >= count || Read32(header + 12) != registryCrc) {
        return FALSE;
    }
    GFL_ArcToolReadRange(arc, FOLLOWING_POSITIONING_FILE,
                         POSITIONING_HEADER_SIZE + row * FOLLOWING_POSITIONING_ROW_SIZE, FOLLOWING_POSITIONING_ROW_SIZE,
                         out);
    for (i = 0; i < 4; i++) {
        if (out[i] > FOLLOWING_MAX_AUTHORED_GAP) {
            return FALSE;
        }
    }
    return TRUE;
}
