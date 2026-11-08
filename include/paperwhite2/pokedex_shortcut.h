#ifndef POKEBW2_PAPERWHITE2_POKEDEX_SHORTCUT_H
#define POKEBW2_PAPERWHITE2_POKEDEX_SHORTCUT_H

#include "types.h"
#include "app/p_status.h"
#include "app/pokedex_detail.h"
#include "field/app_call.h"
#include "gfl/clact.h"
#include "gfl/heap.h"

// Paper White 2: the Pokédex's detail screen on the info page of a party Pokémon, from the party screen's menu (its
// POKéDEX item, under SUMMARY) and from the summary screen (its INFO button, the Pokédex touch bar's, or START), both
// opened from the field. It shows that Pokémon itself (its form, sex, color and Spinda's spots), as caught; Up and Down
// step through the party, without its eggs; B, X and the bar's return go back to the screen it was opened from, as it
// was. The field app call opens it as FIELD_APP_POKEDEX_INFO (src/ov012/event_field_proclink.c), with what it shows of
// each Pokémon in PokedexDetailParam's pokemon (app/pokedex_detail.h)

#define POKEDEX_SHORTCUT_PARTY_MAX 6

// The party screen's menu item, after the original's 0 to 23 (src/ov165/plist_menu.c), and its result, after the
// original's 0 to 21
#define POKELIST_MENU_POKEDEX 24
#define POKELIST_RESULT_POKEDEX 30

// The summary screen's result, after PSTATUS_RESULT_CLOSE
#define PSTATUS_RESULT_POKEDEX 3

// The field app call's (src/paperwhite2/ov012/paperwhite2_pokedex_shortcut_event.c)

// opened from the party screen (FIELD_APP_POKELIST) or the summary screen (FIELD_APP_POKESTATUS), whose param is
// prevParam: the party without its eggs, and where the chosen Pokémon is in it
void *PaperWhite2_FieldAppCall_CreatePokedexInfoParam(FieldAppCallWork *work, s32 appParam, s32 prevAppId,
                                                      const void *prevParam);
// Back to the screen it was opened from
u32 PaperWhite2_FieldAppCall_GetPokedexInfoResult(FieldAppCallWork *work, void *param);
// The party slot of the Pokémon it was opened for, for the party screen's cursor
u32 PaperWhite2_PokedexShortcut_GetPartySlot(const void *param);
// The summary screen's param as it was, for the summary to open as it was left
void PaperWhite2_PokedexShortcut_RestoreSummary(PStatusParam *summary, const void *param);

// The summary screen's INFO button (src/paperwhite2/ov207/paperwhite2_pstatus_pokedex.c): the Pokédex touch bar's
// INFO, on the bottom bar between the pages' tabs and the shortcut's checkbox, on the bar's main OBJ palette row 15

typedef struct PStatusPokedexButton PStatusPokedexButton;

// Whether the summary can open the Pokédex: the field's party, from the field menu, showing its pages
BOOL PaperWhite2_PStatusPokedex_IsAvailable(const PStatusParam *param);
PStatusPokedexButton *PaperWhite2_PStatusPokedex_Create(ClActUnit *unit, HeapID heapId);
void PaperWhite2_PStatusPokedex_Free(PStatusPokedexButton *button);
void PaperWhite2_PStatusPokedex_SetVisible(PStatusPokedexButton *button, BOOL visible);
// Whether START is pressed, or the button touched while it shows, this frame
BOOL PaperWhite2_PStatusPokedex_IsPressed(PStatusPokedexButton *button);
// Plays the button's push, which flashes it for 16 frames, and returns its actor, for the summary to wait on
ClActor *PaperWhite2_PStatusPokedex_Push(PStatusPokedexButton *button);
// Flashes the pushed button's palette with its animation, every frame
void PaperWhite2_PStatusPokedex_Update(PStatusPokedexButton *button);

#endif // POKEBW2_PAPERWHITE2_POKEDEX_SHORTCUT_H
