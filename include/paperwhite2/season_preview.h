#ifndef PAPERWHITE2_SEASON_PREVIEW_H
#define PAPERWHITE2_SEASON_PREVIEW_H

#include "types.h"
#include "gfl/heap.h"

// Paper White 2: the Season app's 3D preview (src/paperwhite2/ov312/paperwhite2_season_preview.c), a spot of the
// field's map drawn on the main engine's BG 0 with a season's textures, animations, lights and props. The spot and the
// camera are res/paperwhite2/season_preview.json's (tools/paperwhite2/season_preview.py). The app maps the textures'
// VRAM: texture slot 0 for the textures, palette slot 0 for their palettes

typedef struct SeasonPreview SeasonPreview;

// Sets up the 3D system and the camera, with nothing loaded yet
SeasonPreview *SeasonPreview_Create(HeapID heapId);
// Frees what is loaded, the camera and the 3D system
void SeasonPreview_Free(SeasonPreview *preview);
// Loads the spot with a season's textures and props, after freeing the last season's. Returns FALSE, with nothing
// loaded, if the files don't fit in the heap or the textures in VRAM
BOOL SeasonPreview_Load(SeasonPreview *preview, u8 season);
void SeasonPreview_Unload(SeasonPreview *preview);
// Steps the animations and draws a frame, if a season is loaded
void SeasonPreview_Draw(SeasonPreview *preview);

#endif // PAPERWHITE2_SEASON_PREVIEW_H
