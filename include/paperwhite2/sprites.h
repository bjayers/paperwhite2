#ifndef PAPERWHITE2_SPRITES_H
#define PAPERWHITE2_SPRITES_H

// Paper White 2: the field's sprite limits (docs/paperwhite2/plugins.md, Sprite limits), which the Overworld Editor's
// sprite bar reads from here. The sprite cache's size, the object codes whose sprites can be loaded at once
// (FldActSys_InitBillboardActor; the original's 32), and the field billboard system's materials, one each cached
// sprite's and each sprite that transfers its faces (BillboardActorSys_Create; the original's 64). The measured zones
// left 112 KB of texture VRAM free at least, at 3.5 to 4 KB a sprite (STATUS.md, 2026-11-03)
#define PAPERWHITE2_SPRITE_CACHE 48
#define PAPERWHITE2_SPRITE_MATERIALS 96
// A sprite loaded on demand is asked for only while a block of texture VRAM this large is free, so that it leaves
// about 24 KB for the maps' and effects' textures; otherwise it waits, and is asked for again once there is room
#define PAPERWHITE2_SPRITE_VRAM_ROOM 0x8000

#endif // PAPERWHITE2_SPRITES_H
