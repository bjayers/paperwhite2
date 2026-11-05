#ifndef PAPERWHITE2_SEASON_PREVIEW_H
#define PAPERWHITE2_SEASON_PREVIEW_H

#include "types.h"
#include "gfl/heap.h"

// Paper White 2: the Season app's 3D preview (src/paperwhite2/ov312/paperwhite2_season_preview.c), a spot of the
// field's map drawn on the main engine's BG 0 with a season's textures, animations, lights and props. Its spots, each
// a place with its camera, are res/paperwhite2/season_preview.json's, the season pages', and
// res/paperwhite2/version_preview.json's, each place of the Alter Unova page as each version has it
// (tools/paperwhite2/season_preview.py). The app maps the textures' VRAM: texture slot 0 for the textures, palette
// slot 0 for their palettes

typedef struct SeasonPreview SeasonPreview;

// The season pages' spot, and a place's (a VERSION_PLACE_*, paperwhite2/version_places.h) as White 2 has it or as
// Black 2 has it
#define SEASON_PREVIEW_SPOT_SEASON 0
#define SEASON_PREVIEW_SPOT_OF_PLACE(place, black2) (1 + (place) * 2 + ((black2) ? 1 : 0))

// Sets up the 3D system and the camera, with nothing loaded yet. Over a loaded season the preview draws a soft
// shadow, a dark ellipse that fades out from its center at the middle of line shadowY, behind the 2D layers: the
// app's banner, for the season's name
SeasonPreview *SeasonPreview_Create(HeapID heapId, int shadowY);
// Leaves the shadow out, or draws it again
void SeasonPreview_SetShadowHidden(SeasonPreview *preview, BOOL hidden);
// Frees what is loaded, the camera and the 3D system
void SeasonPreview_Free(SeasonPreview *preview);
// Loads a spot with a season's textures and props, after freeing what was loaded, and puts the camera where the spot
// has it. Returns FALSE, with nothing loaded, if the files don't fit in the heap or the textures in VRAM
BOOL SeasonPreview_Load(SeasonPreview *preview, u32 spot, u8 season);
void SeasonPreview_Unload(SeasonPreview *preview);
// Steps the animations and draws a frame, if a season is loaded
void SeasonPreview_Draw(SeasonPreview *preview);

#endif // PAPERWHITE2_SEASON_PREVIEW_H
