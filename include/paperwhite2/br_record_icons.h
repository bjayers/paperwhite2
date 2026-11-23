#ifndef PAPERWHITE2_BR_RECORD_ICONS_H
#define PAPERWHITE2_BR_RECORD_ICONS_H

#include "types.h"
#include "gfl/arc.h"
#include "gfl/clact.h"
#include "gfl/heap.h"

// Paper White 2: the Battle Recorder's video screen (src/ov268/br_record_proc.c, My Video's battle info) draws the
// video's icons on their own battle colours, the species' normal ones, since the video's header keeps species, form
// and sex only (docs/paperwhite2/design/icon-screens.md, phase 6). It shows up to 12 icons on the main engine, whose
// OBJ rows the Battle Recorder's common palette fills, so they are 8bpp OBJs on the main engine's OBJ extended palette
// 0 in VRAM bank G, which no Battle Recorder screen uses: icon n draws in band n of it. The bank is mapped while the
// icons exist. The screen fades its BGs only (BrFade's alpha fade), so the colours need no palette fade buffer; they
// go to VRAM in a VBlank task.

// An icon's two frames, 4bpp as the icon archive has them and 8bpp as the screen draws them
#define BR_RECORD_ICONS_SIZE 0x400
#define BR_RECORD_ICONS_SIZE_8BPP 0x800

// Makes an icon's character resource, 8bpp in band (0-11), and reads its colours into the band
u32 PaperWhite2_BrRecordIcons_LoadChars(ArcTool *handle, u32 species, u32 form, u32 sex, u32 band, HeapID heapId);
// Points an icon's actor at extended palette 0, whatever row its palette resource is at
void PaperWhite2_BrRecordIcons_InitActor(ClActor *actor);
// Once the actors are made (first is any of them, or NULL for none): sets their shared cells to 8bpp, maps bank G as
// the main engine's OBJ extended palette and starts the VBlank task that copies the colours
void PaperWhite2_BrRecordIcons_Start(ClActor *first);
// With the icons freed: unmaps bank G and ends the task
void PaperWhite2_BrRecordIcons_End(void);

#endif // PAPERWHITE2_BR_RECORD_ICONS_H
