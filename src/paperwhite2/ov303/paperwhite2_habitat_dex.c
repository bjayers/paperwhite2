#include "types.h"
#include "app/pokedex_habitat.h"
#include "constants/arc.h"
#include "constants/text_banks.h"
#include "field/enc_pokeset.h"
#include "gfl/arc.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "gfl/str.h"
#include "nitro/mi.h"
#include "paperwhite2/habitat_dex.h"
#include "system/printsys.h"
#include "system/rtc.h"
#include "system/wordset.h"
#include "system/zone_weather.h"
#include "text/system/dexnav.h"

// Paper White 2: the Habitat Dex's lists and its text box (paperwhite2/habitat_dex.h)

// The Habitat List's archive (ARCID_POKEDEX_HABITAT in pokedex_common.c)
#define ARCID_HABITAT_LIST 296

// The kinds of habitat's methods, in the tabs' order
#define KIND_COUNT 3
#define KIND_METHOD_MAX (HABITAT_DEX_TAB_MAX - 1)
static const u8 sKindMethods[KIND_COUNT][KIND_METHOD_MAX] = {
    { ENCTYPE_GRASS, ENCTYPE_GRASS_RARE, ENCTYPE_GRASS_SHAKING },
    { ENCTYPE_SURF, ENCTYPE_SURF_RARE, ENCTYPE_MAX },
    { ENCTYPE_FISHING, ENCTYPE_FISHING_RARE, ENCTYPE_MAX },
};

// The methods' names, by ENCTYPE_* (the DexNav's)
static const u32 sMethodNames[ENCTYPE_MAX] = {
    Dexnav_Text_Grass,      Dexnav_Text_DarkGrass, Dexnav_Text_Rustling,  Dexnav_Text_Surf,
    Dexnav_Text_SurfRipple, Dexnav_Text_Rod,       Dexnav_Text_RodRipple,
};

// Each filter's names: any, then its values
#define SEASON_FILTERS 5
#define TIME_FILTERS (DAY_PERIOD_COUNT + 1)
#define WEATHER_FILTERS 6
static const u8 sFilterCounts[HABITAT_DEX_FILTER_COUNT] = { SEASON_FILTERS, TIME_FILTERS, WEATHER_FILTERS };
static const u32 sSeasonNames[SEASON_FILTERS] = { Dexnav_Text_AnySeason, Dexnav_Text_Spring, Dexnav_Text_Summer,
                                                  Dexnav_Text_Autumn, Dexnav_Text_Winter };
static const u32 sTimeNames[TIME_FILTERS] = { Dexnav_Text_AnyTime, Dexnav_Text_Morning, Dexnav_Text_Day,
                                              Dexnav_Text_Evening, Dexnav_Text_Night,   Dexnav_Text_LateNight };
static const u32 sWeatherNames[WEATHER_FILTERS] = { Dexnav_Text_AnyWeather,  Dexnav_Text_WeatherClear,
                                                    Dexnav_Text_WeatherRain, Dexnav_Text_WeatherThunderstorm,
                                                    Dexnav_Text_WeatherSnow, Dexnav_Text_WeatherSandstorm };
static const u32 *const sFilterNames[HABITAT_DEX_FILTER_COUNT] = { sSeasonNames, sTimeNames, sWeatherNames };

// The weathers of each weather filter, as the DexNav names a zone's weather
#define WEATHER_BIT(weather) (1 << (weather))
static const u32 sWeatherFilterBits[WEATHER_FILTERS] = {
    0,
    WEATHER_BIT(WEATHER_SUNNY) | WEATHER_BIT(WEATHER_FLUTTER) | WEATHER_BIT(WEATHER_TINT_9) |
        WEATHER_BIT(WEATHER_TINT_10) | WEATHER_BIT(WEATHER_TINT_11) | WEATHER_BIT(WEATHER_TINT_13) |
        WEATHER_BIT(WEATHER_TINT_14),
    WEATHER_BIT(WEATHER_RAIN) | WEATHER_BIT(WEATHER_GUSTY_RAIN),
    WEATHER_BIT(WEATHER_THUNDERSTORM),
    WEATHER_BIT(WEATHER_FLAKE) | WEATHER_BIT(WEATHER_BLIZZARD) | WEATHER_BIT(WEATHER_DIAMOND_DUST),
    WEATHER_BIT(WEATHER_SANDSTORM) | WEATHER_BIT(WEATHER_SANDSTORM_2),
};

// The text box: the main window's, two lines in it (the tabs and the page, then the filters), and the room between
// parts
#define BOX_X 12
#define BOX_Y 4
#define BOX_WIDTH 240
#define LINE_HEIGHT 16
#define PART_GAP 12
#define COLOR_PLAIN PRINT_COLOR(1, 2, 0)
#define COLOR_CHOSEN PRINT_COLOR(5, 6, 0)
#define COLOR_ANY PRINT_COLOR(2, 15, 0)
// The window's (POKEDEX_HABITAT_WIN_MAIN), which covers the main screen from its corner
#define WINDOW_MAIN 0

static const HabitatDexEntry *HabitatDex_GetEntries(HabitatDex *dex, u32 file, u32 *count);
static BOOL HabitatDex_Matches(HabitatDex *dex, const HabitatDexEntry *entry);
static void HabitatDex_PrintPart(HabitatDex *dex, PokedexHabitatGraphic *graphic, StrBuf *text, s16 x, s16 y,
                                 u16 color);

void PaperWhite2_HabitatDex_Init(HabitatDex *dex, HeapID heapId) {
    MI_CpuFill8(dex, 0, sizeof(HabitatDex));
    dex->data = GFL_ArcSysReadHeapNew(ARCID_HABITAT_LIST, HABITAT_DEX_MEMBER, heapId);
    if (dex->data->magic != HABITAT_DEX_MAGIC || dex->data->version != HABITAT_DEX_VERSION) {
        GFL_HeapFree((void *)dex->data);
        dex->data = NULL;
    }
    dex->msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_DEXNAV, heapId);
}

void PaperWhite2_HabitatDex_Free(HabitatDex *dex) {
    if (dex->data != NULL) {
        GFL_HeapFree((void *)dex->data);
    }
    GFL_MsgDataFree(dex->msgData);
}

void PaperWhite2_HabitatDex_Reset(HabitatDex *dex) {
    dex->tab = 0;
    dex->page = 0;
}

static const HabitatDexEntry *HabitatDex_GetEntries(HabitatDex *dex, u32 file, u32 *count) {
    const u8 *base = (const u8 *)dex->data;

    if (dex->data == NULL || file >= dex->data->count) {
        *count = 0;
        return NULL;
    }
    *count = (dex->data->offsets[file + 1] - dex->data->offsets[file]) / sizeof(HabitatDexEntry);
    return (const HabitatDexEntry *)(base + dex->data->offsets[file]);
}

static BOOL HabitatDex_Matches(HabitatDex *dex, const HabitatDexEntry *entry) {
    u8 season = dex->filters[HABITAT_DEX_FILTER_SEASON];
    u8 time = dex->filters[HABITAT_DEX_FILTER_TIME];
    u8 weather = dex->filters[HABITAT_DEX_FILTER_WEATHER];

    if (season != 0 && !(entry->seasons & (1 << (season - 1)))) {
        return FALSE;
    }
    if (time != 0 && !(entry->times & (1 << (time - 1)))) {
        return FALSE;
    }
    if (weather != 0 && entry->weather != 0 && !(entry->weather & sWeatherFilterBits[weather])) {
        return FALSE;
    }
    return TRUE;
}

// The entries are sorted by method, then rarity: a Pokémon is listed once, at its first entry that matches
void PaperWhite2_HabitatDex_Fill(HabitatDex *dex, u32 file, u32 kind, PokeDexSave *pokedex) {
    u32 count, i, j;
    const HabitatDexEntry *entries = HabitatDex_GetEntries(dex, file, &count);
    u32 method;

    dex->count = 0;
    dex->unseen = 0;
    dex->tabCount = 1;
    if (kind >= KIND_COUNT) {
        kind = 0;
    }
    // The tabs: all, then each of the kind's methods that the area has
    for (i = 0; i < KIND_METHOD_MAX && sKindMethods[kind][i] != ENCTYPE_MAX; i++) {
        for (j = 0; j < count; j++) {
            if (entries[j].method == sKindMethods[kind][i]) {
                dex->tabMethods[dex->tabCount - 1] = sKindMethods[kind][i];
                dex->tabCount++;
                break;
            }
        }
    }
    if (dex->tab >= dex->tabCount) {
        dex->tab = 0;
    }
    method = dex->tab == 0 ? ENCTYPE_MAX : dex->tabMethods[dex->tab - 1];
    for (i = 0; i < count; i++) {
        const HabitatDexEntry *entry = &entries[i];
        BOOL listed = FALSE;

        if (method == ENCTYPE_MAX) {
            for (j = 0; j < KIND_METHOD_MAX && sKindMethods[kind][j] != entry->method; j++) {
            }
            if (j == KIND_METHOD_MAX) {
                continue;
            }
        } else if (entry->method != method) {
            continue;
        }
        if (!HabitatDex_Matches(dex, entry)) {
            continue;
        }
        for (j = 0; j < dex->count; j++) {
            if (dex->list[j]->species == entry->species && dex->list[j]->form == entry->form) {
                listed = TRUE;
                break;
            }
        }
        if (listed) {
            continue;
        }
        if (!PokeDex_IsSeen(pokedex, entry->species)) {
            // An unseen Pokémon is counted once for each species
            for (j = 0; j < i; j++) {
                if (entries[j].species == entry->species && HabitatDex_Matches(dex, &entries[j])) {
                    break;
                }
            }
            if (j == i) {
                dex->unseen++;
            }
            continue;
        }
        if (dex->count < HABITAT_DEX_LIST_MAX) {
            dex->list[dex->count++] = entry;
        }
    }
    dex->pageCount = dex->count == 0 ? 1 : (dex->count + HABITAT_DEX_PAGE_SIZE - 1) / HABITAT_DEX_PAGE_SIZE;
    if (dex->page >= dex->pageCount) {
        dex->page = dex->pageCount - 1;
    }
}

const HabitatDexEntry *PaperWhite2_HabitatDex_GetCell(HabitatDex *dex, u32 cell) {
    u32 index = dex->page * HABITAT_DEX_PAGE_SIZE + cell;

    return cell < HABITAT_DEX_PAGE_SIZE && index < dex->count ? dex->list[index] : NULL;
}

u32 PaperWhite2_HabitatDex_GetPageCount(HabitatDex *dex) {
    u32 first = dex->page * HABITAT_DEX_PAGE_SIZE;
    u32 left = dex->count > first ? dex->count - first : 0;

    return left < HABITAT_DEX_PAGE_SIZE ? left : HABITAT_DEX_PAGE_SIZE;
}

BOOL PaperWhite2_HabitatDex_TurnPage(HabitatDex *dex, int direction) {
    int page = dex->page + direction;

    if (page < 0 || page >= dex->pageCount) {
        return FALSE;
    }
    dex->page = page;
    return TRUE;
}

BOOL PaperWhite2_HabitatDex_NextTab(HabitatDex *dex) {
    if (dex->tabCount <= 1) {
        return FALSE;
    }
    dex->tab = (dex->tab + 1) % dex->tabCount;
    dex->page = 0;
    return TRUE;
}

// ------------------------------------------------------------------------------------------------ The text box

static void HabitatDex_PrintPart(HabitatDex *dex, PokedexHabitatGraphic *graphic, StrBuf *text, s16 x, s16 y,
                                 u16 color) {
    u32 width = GFL_FontGetBlockWidth(text, graphic->font, 0);

    if (x + width > BOX_X + BOX_WIDTH) {
        return;
    }
    PokedexHabitatGraphic_Print(WINDOW_MAIN, text, graphic, x, y, width, LINE_HEIGHT, color);
}

void PaperWhite2_HabitatDex_Print(HabitatDex *dex, PokedexHabitatGraphic *graphic) {
    StrBuf *text = GFL_StrBufCreate(0x40, HEAPID_POKEDEX_HABITAT);
    s16 x = BOX_X;
    u32 i;

    PokedexHabitatGraphic_ClearArea(WINDOW_MAIN, graphic, BOX_X, BOX_Y, BOX_WIDTH, LINE_HEIGHT * 2);
    // The tabs, then the page on the right
    for (i = 0; i < dex->tabCount; i++) {
        GFL_MsgDataLoadStrbuf(dex->msgData, i == 0 ? Dexnav_Text_All : sMethodNames[dex->tabMethods[i - 1]], text);
        dex->tabX[i] = x;
        HabitatDex_PrintPart(dex, graphic, text, x, BOX_Y, i == dex->tab ? COLOR_CHOSEN : COLOR_PLAIN);
        x += GFL_FontGetBlockWidth(text, graphic->font, 0) + PART_GAP;
    }
    dex->tabX[dex->tabCount] = x;
    if (dex->pageCount > 1) {
        WordSet *wordSet = GFL_WordSetSystemCreateDefault(HEAPID_POKEDEX_HABITAT);
        StrBuf *format = GFL_MsgDataLoadStrbufNew(dex->msgData, Dexnav_Text_Page);

        WordSetNumber(wordSet, 0, dex->page + 1, 2, 0, TRUE);
        WordSetNumber(wordSet, 1, dex->pageCount, 2, 0, TRUE);
        GFL_WordSetFormatStrbuf(wordSet, text, format);
        HabitatDex_PrintPart(dex, graphic, text, BOX_X + BOX_WIDTH - GFL_FontGetBlockWidth(text, graphic->font, 0),
                             BOX_Y, COLOR_PLAIN);
        GFL_StrBufFree(format);
        GFL_WordSetSystemFree(wordSet);
    }
    // The filters, "any" in grey
    x = BOX_X;
    for (i = 0; i < HABITAT_DEX_FILTER_COUNT; i++) {
        GFL_MsgDataLoadStrbuf(dex->msgData, sFilterNames[i][dex->filters[i]], text);
        dex->filterX[i] = x;
        HabitatDex_PrintPart(dex, graphic, text, x, BOX_Y + LINE_HEIGHT,
                             dex->filters[i] == 0 ? COLOR_ANY : COLOR_CHOSEN);
        x += GFL_FontGetBlockWidth(text, graphic->font, 0) + PART_GAP;
    }
    dex->filterX[HABITAT_DEX_FILTER_COUNT] = x;
    GFL_StrBufFree(text);
}

BOOL PaperWhite2_HabitatDex_Touch(HabitatDex *dex, u32 x, u32 y) {
    u32 i;

    if (y < BOX_Y + LINE_HEIGHT) {
        for (i = 0; i < dex->tabCount; i++) {
            if (x >= dex->tabX[i] && x < dex->tabX[i + 1] && i != dex->tab) {
                dex->tab = i;
                dex->page = 0;
                return TRUE;
            }
        }
    } else if (y < BOX_Y + LINE_HEIGHT * 2 + 8) {
        for (i = 0; i < HABITAT_DEX_FILTER_COUNT; i++) {
            if (x >= dex->filterX[i] && x < dex->filterX[i + 1]) {
                dex->filters[i] = (dex->filters[i] + 1) % sFilterCounts[i];
                dex->page = 0;
                return TRUE;
            }
        }
    }
    return FALSE;
}
