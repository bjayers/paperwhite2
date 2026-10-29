#ifndef PAPERWHITE2_FOLLOWING_POSITIONING_H
#define PAPERWHITE2_FOLLOWING_POSITIONING_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the Following Pokémon's positioning table, the walking gaps of each follower row
// (src/paperwhite2/ov036/paperwhite2_following_positioning.c), ported from Pokeweb's positioning.h

// The file of ARCID_MMODEL_TBL that holds the positioning table
#define FOLLOWING_POSITIONING_FILE 2

// The size of a row of the land table: its gaps up, down, left and right first
#define FOLLOWING_POSITIONING_ROW_SIZE 12

// The CRC-32 of the registry that the table was written for, which the registry's own header doesn't hold: FALSE when
// the table is missing or isn't one
BOOL FollowingPositioning_ReadRegistryCrc(ArcTool *arc, u32 *crc);
// Reads row of the land table, of count rows, into out, through arc, the field actors' open handle of
// ARCID_MMODEL_TBL. FALSE, with out's gaps not to be used, when the table is missing, isn't for the registry whose
// CRC-32 is registryCrc, or has a gap out of range: the caller then keeps the gaps it computed
BOOL FollowingPositioning_ReadLand(ArcTool *arc, u32 row, u32 count, u32 registryCrc, u8 *out);

#endif // PAPERWHITE2_FOLLOWING_POSITIONING_H
