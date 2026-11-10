# Weather Editor (design)

A tool of the editor that sets, for each location, which weathers come on which days of each season: more rain on
Route 20, a thunderstorm in Virbank, snow where there is none today. This page is the research and the design; the
editor isn't built yet. **Verified** means read in the code, or seen in the emulator where it says so; **inferred**
means reasoned from the code without a test.

## 1. How White 2 picks a zone's weather (verified)

`GetWeatherAll(gsys, zoneId)` (`src/system/zone_weather.c`, main) takes the first source that gives a weather:

| # | Source | Notes |
| --- | --- | --- |
| 0 | the debug menu's Force weather | `PAPERWHITE2_DEBUG_MENU` only |
| 1 | `GetDefaultWeatherValue` (`src/ov012/field_encount_st.c`) | an empty stub in White 2: always `WEATHER_NONE` |
| 2 | **battle weather** (Paper White 2, section 6) | the weather a battle in this zone ended with, for 5 minutes |
| 3 | the Entralink's forest zones | weathers 10/11/13/14 by the connected game and a flag |
| 4 | Route 7's event (flag 0x96d) | `WEATHER_THUNDERSTORM` in White 2, `WEATHER_GUSTY_RAIN` in Black 2 |
| 5 | the player's birthday on Routes 14 and 15 | `WEATHER_SUNNY` |
| 6 | the **weather calendar**, `Calendar_GetWeather` (`src/ov012/calender.c`) | only while the game's season is the current one (`IsSeasonCurrent`) |
| 7 | the **zone header's** `weather` (`GetZoneEnvFlagsWeather`, `src/system/zonedata.c`) | also what the calendar returns for a zone it doesn't list |

**When it's asked.** `ResetWeather` stores the answer with `SetNowWeather` (`GameData.weather`, read back by
`GetNowWeather`): on a map change (`event_mapchange.c`), on a seamless zone change (`Field_SwapWeather`,
`fieldmap.c`, which also fades the field to it) and after each battle (`event_battle.c`). The field opens with
`SetWeatherInit(GetNowWeather())`. The script command `FieldSetWeather` (`src/ov012/scrcmd_weather.c`) changes the
field's weather and `SetNowWeather` too (this settles conditions.md's "unverified"); its value 0xffff means "the
zone's own" (`GetWeatherAll`). Nothing asks again within a zone, so a new day's weather shows at the next zone change.

**A zone without a calendar entry** has its zone header's weather every day: `res/field/zones/<zone>.json`, `"weather"`,
a raw number (a `WEATHER_*` value). In White 2 every zone has 0 (sunny) but Desert Resort and Route 4's sand part
(`route_4_16`) 3 (sandstorm), Desert Resort's inner zone (`desert_resort_2`) 12 (`SANDSTORM_2`) and Giant Chasm
(`giant_chasm`, `giant_chasm_3`) 9 (`TINT_9`, the white mist). The header's weather is also every calendar zone's
weather while `IsSeasonCurrent` is false.

### The calendar (verified)

- **Source:** `res/field/weather_calendar/<zone>.json`, one per zone, named after its `ZONE_` constant; each month
  lists its days with weather (`"3": "WEATHER_RAIN"`, `"9-10": "WEATHER_RAIN"`), every other day is `WEATHER_SUNNY`.
  `order.json` gives the table's order. `weather_calendar.schema.json` describes it.
- **Packer:** `tools/data/weather_calendar_data.py pack`, run by every build, the matching one too.
- **Archive:** `a/0/9/6` (`ARCID_CALENDAR`, archive 96). File 1: a u16 count, then per zone `{u16 zoneId; u16 offset}`
  (`CalendarZone`). File 0: 366 weather bytes per zone (February with its 29th), at `offset`. The hack's conditions
  tables are further members of the same archive (`HACK_ARCHIVE_MEMBERS` in `configure.py`), files 2 and up.
- **Reading:** `Calendar_Create` (in `GameData`, at boot) opens the archive and reads 24 table entries
  (`CALENDAR_ZONE_MAX`, `Calendar.zones[24]` in `include/field/calender.h`), whatever the count says. Each query
  reads one byte from file 0. **Paper White 2** (section 3) reads only the count at boot, and each query looks its
  zone up in file 1, 16 entries at a time.
- **Paper White 2's date:** the original read today's date. The hack reads one date of the current season's months,
  the same for every zone and all day (`PaperWhite2_GetWeatherDate`, `src/paperwhite2/ov012/paperwhite2_weather.c`,
  a hash of the save clock's day and the season). A season's months are those with `(month - 1) % 4` equal to it:

  | Season | Months | Dates |
  | --- | --- | --- |
  | spring | January, May, September | 92 |
  | summer | February (with the 29th), June, October | 90 |
  | autumn | March, July, November | 92 |
  | winter | April, August, December | 92 |

  So **a weather on N of a season's dates comes on about N in 90–92 of that season's days**, and two zones with a
  weather on the same dates have it on the same days (Virbank City and both Virbank Complex zones snow together).
- **Today's 24 zones:** Driftveil City, Route 6, Chargestone Cave, Mistralton City, Route 7, Twist Mountain (both),
  Icirrus City, Dragonspiral Tower (both), Route 8, Route 12, Routes 14 and 15, Floccesy Town, Pledge Grove, Route 20,
  Floccesy Ranch (both), Virbank City, Virbank Complex (both), Lentimas Town, Reversal Mountain. Every other zone has
  its header's weather. Weathers in use: sunny, flake, flutter, blizzard, diamond dust, rain, sandstorm, `TINT_9`.
  None uses `WEATHER_THUNDERSTORM`; Route 7's event is its only vanilla source.

## 2. The weathers (verified unless marked)

`include/system/zone_weather.h`; each is a `WeatherData` in an overlay that `weather.c`'s `WEATHER_OVERLAYS` loads.
Every one takes its graphics from the shared archive 0x37, not from the zone, so **any weather works in any exterior
zone** (the debug menu's Force weather shows each anywhere, plugins.md). The battle column is `ConvFieldWeatherToBtl`
(`src/ov036/field_encount.c`), from the weather the field shows.

| Value | Name | Overlay | What it is | Battle |
| --- | --- | --- | --- | --- |
| 0 | `WEATHER_SUNNY` | 74 | clear; keeps the zone's fog | none |
| 1 | `WEATHER_FLAKE` | 75 | snowflakes that sway down | none |
| 2 | `WEATHER_RAIN` | 76 | rain, with its sound | rain |
| 3 | `WEATHER_SANDSTORM` | 77 | sandstorm with a scrolling layer | sandstorm |
| 4 | `WEATHER_BLIZZARD` | 75 | flakes rushing over a scrolling layer | hail |
| 5 | `WEATHER_FLUTTER` | 75 | fluttering flakes (the calendar's winter weather of Driftveil, Route 6, Chargestone Cave, Mistralton, Route 7, Twist Mountain) | hail |
| 6 | `WEATHER_THUNDERSTORM` | 76 | heavy rain with lightning flashes | rain |
| 7 | `WEATHER_GUSTY_RAIN` | 76 | rain with gusts (Black 2's Route 7) | rain |
| 8 | `WEATHER_DIAMOND_DUST` | 75 | drifting specks; being in it gives a medal (`Field_CheckGiveDiamondDustMedal`) | none |
| 9 | `WEATHER_TINT_9` | 78 | a white mist (fog and light), Giant Chasm, Routes 14 and 15 | none |
| 10, 11, 13, 14 | `WEATHER_TINT_*` | 78 | the Entralink's tints, by the camera's defaults index (inferred: meant for the Entralink only) | none |
| 12 | `WEATHER_SANDSTORM_2` | 77 | Desert Resort's inner sandstorm | sandstorm |

- **No harsh sun.** Weather 0 is the only sunny one: clear sky with the zone's light. A sunny weather would be a new
  `WeatherData` (a warm tint through overlay 78's functions and a light file, like `TINT_9`), and new battle mapping.
- **Snow without battle effect:** flake and diamond dust. Flutter and blizzard give hail.
- **Groups (settled 2026-11-10):** every weather is in one group, `include/paperwhite2/weather_groups.h`: clear
  (sunny and the tints), rain (rain, gusty rain), thunderstorm, snow (flake, blizzard, flutter, diamond dust) and
  sandstorm (both). Encounters, conditions, the Habitat List, the Area page and the DexNav all take a weather as its
  group; flutter is snow everywhere now (it was clear in the Habitat List and the DexNav).
- **Indoors:** the weather system doesn't check whether the area is an exterior; the debug Force weather rains inside
  buildings (plugins.md). So the editor must keep weathers off interiors (`AreaData.isExterior`, through the zone's
  area), which none of the vanilla data has.

## 3. Limits (verified)

- **Zones in the calendar: 179 in Paper White 2** (raised 2026-11-10; the original's 24), all that the u16 offsets
  reach (179 years end at byte 65514). The editor reads the limit from `tools/data/weather_calendar_data.py`'s
  `CALENDAR_ZONE_MAX`; `calender.c`'s `CALENDAR_ZONE_MAX` under `PAPERWHITE2` is the same number. The hack's
  `Calendar` keeps only the table's count (`zoneCount`) instead of the 24 entries, so it is 92 bytes smaller on the
  `GameData` heap, and `Calendar_GetOffsetForZone` reads the table from file 1 on each query, 16 entries (64 bytes
  of stack) at a time: at most 12 small reads at a zone change with 179 zones, 2 with today's 24. The hack's build
  packs with `pack --hack` (`HACK_PACK_FLAGS` in `configure.py`), which takes up to 179 zones; the matching build's
  packer stops at 24. With 24 zones or fewer the archive is the original's layout (padded to 24 entries).
- **Size:** 366 bytes of ROM per zone; one byte read per weather query; no RAM for the table.
- **Granularity:** one weather per date. There is no time-of-day weather and no chance roll: the date decides.
- **Season gate:** the calendar applies only while `IsSeasonCurrent`; otherwise the header's weather.
- **Weathers past the calendar's rule** (Entralink, Route 7's event, birthday) win over it.

## 4. Encounters and weather (verified)

- The hack's encounter engine reads the conditions context's `weather`, `GetNowWeather()`
  (`paperwhite2_conditions_context.c`), and a habitat's `"weather"` list means its weathers' **groups** (section 2):
  the compiler writes every weather of the groups into the mask (`paperwhite2_encounters.c` tests
  `c->weather & (1 << ctx->weather)`), so a Pokémon listing `WEATHER_RAIN` comes in gusty rain too, and one listing
  any snow in all four snows. The thunderstorm is a group of its own: "rain and thunderstorms" lists both. No species
  lists a weather yet.
- The battle's weather comes from the field's shown weather (`FieldWeather_GetWeatherId`), which equals
  `GetNowWeather` once a transition ends.
- So whatever the editor puts in the calendar is what encounters see, the day it shows. The editor's encounters tab
  should offer a habitat's weathers from the zone's calendar (the weathers it can have in that season), and warn when a
  habitat needs a weather its zone never has.

## 5. The design

### Data model

Keep **`res/field/weather_calendar/<zone>.json`** as the one source, edited in place, as the encounters editor edits
`res/paperwhite2/encounters/`. It is already JSON in `res/`, packed at build time, with a schema, and `git diff
w2-original -- res/field/weather_calendar` shows every change. No new format: the editor's view is a different shape of
the same days.

- **Per season, a strip of its dates:** the season's three months' days in month order (spring: January 1–31, May
  1–31, September 1–30). Painting a date writes that month's day in the file. The file keeps its month form, so the
  vanilla order of dates (which the hack's hash draws uniformly) stays meaningful and the matching build still packs it.
- **The zone's default weather:** the header's `"weather"` in `res/field/zones/<zone>.json`, shown by name. It is
  the weather of a zone without a calendar, and of a calendar zone while the season isn't current.
- **Adding a zone** writes a new calendar file and adds it to `order.json`, up to `CALENDAR_ZONE_MAX` (179,
  section 3). **Removing** a zone drops its file and its
  `order.json` entry; it falls back to its header.
- **Groups** (editor-only, in `editor/` settings or `res/paperwhite2/weather/groups.json`): zones that share their
  dates, such as Virbank City with both Virbank Complex zones, or a route with its gate's outside zones. Painting one
  paints all, so neighbors keep the same weather on the same days as in vanilla. Only the editor reads it.

### The packer

`tools/data/weather_calendar_data.py` as it is: `pack --hack` from `configure.py --hack` takes up to 179 zones,
while the matching build keeps 24. Its checks stay (unknown weathers, zones, days past a month's end, duplicate
zones).

### The UI (by location; follows the Ambients panel's layout)

- **Location list:** zones by place name, as the encounter areas, with badges: "calendar", "header weather: X",
  "interior" (greyed: no weather editing), "special" (Entralink, Route 7, Routes 14/15's birthday; a note says which
  rule wins over the calendar).
- **Header section "Default weather":** the zone header's weather, a dropdown of the weathers by name.
- **Section "Calendar":** four season rows, each a strip of 90–92 date cells in three month blocks, coloured by
  weather; a palette of weathers (with each one's battle effect and a note for the Entralink tints and diamond dust's
  medal); paint and erase (erase is sunny). Beside each season: each weather's share, "rain 9 / 92 days (10%)".
- **Section "Quick fill":** "N days of W in season S", which spreads N dates evenly through the season (a fixed
  spacing, so the result is the same each time, and nested: 10 days are a subset of the 20-day choice, so a zone with
  more rain also rains on every rainy day of a zone with less), "copy from zone", "clear season".
- **Section "Group":** which zones share this calendar; editing one edits all.
- **Add / remove calendar** buttons in the location's header, with the count against the limit ("24 / 179 zones").
- **Preview:** "today" for each season mode, using the same hash (`PaperWhite2_GetWeatherDate`, its host test) to show
  which date, and so which weather, a given day gets.
- **Encounters link:** each weather lists the habitats in the zone that need it.

### What it would take to add the user's examples

- **Rain on Route 20:** Route 20 is in the calendar already (rain on 21 of spring's dates and 12 of summer's, none in
  autumn, flakes on 32 of winter's): paint more `WEATHER_RAIN` dates. Data only.
- **Thunderstorm in Virbank:** paint `WEATHER_THUNDERSTORM` on Virbank City's dates (and its group's). Data only;
  the weather works anywhere (inferred from its shared graphics and the debug override; to check in the emulator).
- **A zone with no table today** (for example Route 19): a new calendar file (up to 179 zones).

## 6. Battle weather (implemented, plugins.md "Battle weather")

A weather that a move or an ability set during a battle stays in the zone after it, over the calendar and the header:
rain as `WEATHER_RAIN`, sandstorm as `WEATHER_SANDSTORM`, hail as `WEATHER_FLUTTER` (the snow that has hail in
battle, so the next battle there has hail again), and sun as `WEATHER_SUNNY` (clear sky over the zone's own rain or
snow; there is no field sun). It lasts `BATTLE_WEATHER_SECONDS` (5 minutes of real time, by the system timer), until
the player is in another zone, or until another battle ends with another weather. It ends with a zone change's
transition. It needs an exterior zone, ignores a battle that ends with no weather or the weather the field gave it, and
isn't saved. The encounter engine sees it, since it goes through `GetWeatherAll` and `GetNowWeather`: a
rain habitat can appear after Rain Dance. The editor needs nothing for it but a note in the weather palette, and a
setting for the duration if the user wants one (today a constant).

Verified in DeSmuME: a battle ended in rain, the field rained after it, and the rain ended at its time and on a warp.
