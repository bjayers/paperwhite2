#ifndef PAPERWHITE2_FOLLOWING_OPTIONS_H
#define PAPERWHITE2_FOLLOWING_OPTIONS_H

#include "types.h"
#include "app/config_panel_work.h"
#include "struct_decls.h"

// Paper White 2: the Following Pokémon's row of the options screen, FOLLOWERS: ON/OFF under the five options, which
// sets Config's followersOff (src/paperwhite2/ov140/paperwhite2_following_options.c), ported from Pokeweb's
// options.c (docs/paperwhite2/following-pokemon.md). Each wraps the screen's function that its hook in config_panel.c
// replaces

// The rows, then the Followers row's windows and values' frames
void PaperWhite2_FollowingOptionsInit(ConfigPanelScroll *scroll, u16 textBg, u16 rowsBg, ConfigPanelGraphic *graphic,
                                      const ConfigPanelOptions *options, HeapID heapId, Font *font, MsgData *msgData);
void PaperWhite2_FollowingOptionsExit(ConfigPanelScroll *scroll);
// The rows' input with the Followers row's cursor, its value and its drawing
void PaperWhite2_FollowingOptionsMain(ConfigPanelScroll *scroll, ConfigPanelUi *ui, ConfigPanelMsg *msg,
                                      ConfigPanelGraphic *graphic, ConfigPanelAppBar *appBar);
// The cursor as the bar sees it: the Followers row is the last option
s32 PaperWhite2_FollowingOptionsGetCursor(ConfigPanelScroll *scroll);
// Whether nothing changed, the Followers row included
BOOL PaperWhite2_FollowingOptionsEquals(const ConfigPanelOptions *a, const ConfigPanelOptions *b);
// Saves the options and the Followers row's value
void PaperWhite2_FollowingOptionsApply(const ConfigPanelOptions *options);

#endif // PAPERWHITE2_FOLLOWING_OPTIONS_H
