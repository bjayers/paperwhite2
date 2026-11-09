# Pokédex Info: the Area sub-page (research and plan, 2026-11-08)

A sixth sub-page of the Info page, between Evo and Matchups: the town map on the top screen with the areas where the
Pokémon lives glowing in its seasons' colours, and on the bottom screen its seasons, methods, levels, rates, times and
weathers. The AREA page of the touch bar is cut later. Plan only: no game code changes yet.

**[V]** = read in the source or measured from the data; **[I]** = inferred, to check while building.

## The user's decisions

- Six sub-pages: Stats, Data, Moves, Evo, **Area**, Matchups.
- Top screen: the original AREA page's map with its highlights, coloured by season: pink spring, green summer, red
  autumn, blue winter. **An area's glow cycles through the colours of each season the Pokémon is there; an area where
  it is all year glows plain white.** No per-condition filtering of the map.
- Bottom screen: rate, levels, the **encounter method** (with icons), the preferred weather and time, a legend of its
  seasons, and other info.
- The user draws: season, time, weather and method icons about the type icons' size; the tab bar for six sub-pages
  (one per selected tab); the Area bottom-screen art.

## 1. How the original AREA page works

All in `src/ov298/pokedex_detail_map.c` (`POKEDEX_DETAIL_MAP_PROC_FUNCS`), with overlay 144 loaded for the town map's
table.

- **Engine and screen [V].** The map is on the **main engine** (`CLACT_SURFACE_MAIN`, `PALTYPE_MAIN_BG_EX`), which the
  detail screen shows on the **bottom** on Area/Cry/Forms (`GX_DISP_SELECT_SUB_MAIN`) and on the **top** on the Info
  page (`pokedex_detail.c`, `mainOnTop`). So on the Info page the map's engine is already the top screen's.
- **The map: two 256-colour BGs [V]** (`PokedexDetailMap_LoadMapBG`, `sPokedexDetailMapBGSetups`): BG 2 (characters
  `a/0/8/4` 5, 0x4000 bytes at char base 0x10000, screen 17 at 0x2000) over BG 3 (characters 7, 0xb000 bytes used of
  0xc000 at 0x14000, screen 16 at 0x3000), both `BGMODE_EXTENDED` (affine extended, 256-colour tiles, 16-bit map
  entries) with **extended palettes** (`a/0/8/4` 0, 4096 colours, into ext slots 2 and 3, bank G); the screens use
  only ext palette 0 [V, rendered]. The map's art covers y 0-167, black under it (the touch bar's rows) [V, rendered].
  On leaving, `sPokedexDetailMapDefaultBGSetups` puts BG 2 and 3 back as 16-colour text BGs.
- **The highlights are OBJs, one per place [V]** (`PokedexDetailMap_CreateAreas`): 85 actors (`TOWNMAP_PLACE_COUNT`)
  of `ARCID_POKEDEX_GRA` characters 15 (32 x 272 px, 4352 bytes), cells 29, animations 46, at each place's
  `TOWNMAP_PARAM_AREA_X/Y` with its `TOWNMAP_PARAM_AREA_ANIM` sequence (`res/town_map/<zone>.json`'s `area`), in
  semi-transparent mode (`ClActor_SetObjMode(.., 1)`). Shown by `PokedexDetailMap_ShowAreas` where the habitat file
  names the place in the season shown and the player's flag doesn't hide it (`PLACE_HIDDEN`).
- **Their colour: one shared OBJ palette row [V]** (`a/1/5/7` palette 5 into main OBJ row 7): a red in three shades,
  indices 6-8 (255,74,123), (205,49,82), (148,32,49); the rest unused.
- **The glow is alpha blending, not a palette animation [V]** (`PokedexDetailMap_SetHighlight`, `_UpdateGlow`,
  `PokedexCommon_StepGlow` in `src/ov302/pokedex_common.c`): BLDALPHA's EVA follows a cosine from 1 to 15 (of 16) with a
  period of 64 frames (phase step 0x400), EVB = 16 - EVA, so the semi-transparent area OBJs pulse over the map. The
  page's other OBJs are made opaque meanwhile (`_SetActorsOpaque`) so only the areas glow. Windows 0 and 1 cover
  y 0-167, so the touch bar below isn't blended. "Nowhere this season" dims the map instead (alpha 12/4).
- **Data [V]:** `ARCID_POKEDEX_AREA` (176, `a/1/7/6`, 243,556 bytes), an LZ file per species: `allYear`, then per
  season `none` and a `HABITAT_*` byte for each of the 85 places (land 0x07, water 0x18, fishing 0x60) in
  `sPokedexDetailMapZones`' order. It's the original data: **the hack hasn't regenerated it** (encounters.md). It
  isn't in `res/`.
- **Other OBJs [V]:** the town map's own (`a/0/8/4` palette 2 rows 0-4, characters 8, 32 x 448 = 7168 bytes): cursor,
  picked place, player's marker, visited places' markers; and the season label and arrows (`a/1/5/7` palette 6 rows
  5-6, characters 16). A panel slides in on the other engine's BG 7 with the place's name and the land/water/fishing
  icons, and the touch bar's button opens the Habitat List of the picked place.
- **Heap [V/I]:** everything in the detail heap: the work (~1.7 KB [I]), the town map table (85 x 27 u16 = 4590 bytes
  [V]), a habitat file (345 bytes [V]), print queues and windows, a renderer and a 16-actor unit. Loading reads the
  characters through the heap: the largest is BG 3's 0xb000 (45 KB) plus the 8 KB palette, so ~55 KB transient [I].

**Can each area have its own colour? Yes [V].** Every area is its own actor, and `ClActor_SetPalette` (or
`_SetPlttProxy`) sets an actor's palette row. Load the area palette recoloured into several rows (one per season and
one for all year) and set each actor's row; the glow (alpha) keeps working, as it isn't palette-based.

## 2. Areas in several seasons

The data, per species and place (all 489 species with wild habitats, 1438 place records [V, this data]): **70% of the
records are all year, 14% one season, 8% two, 9% three.** 232 species have at least one seasonal place.

Proposal (as the user decided):
- **All year: white**, steady (its own row).
- **One season:** that season's colour, steady.
- **Two or three seasons:** the actor's palette row steps through the place's own seasons, one step per glow period
  (64 frames, ~1.07 s), switched at the glow's dimmest point (EVA 1, phase 0x8000), so the change doesn't flash. All
  places step together: step `k` shows the place's `k mod n`-th season (in spring, summer, autumn, winter order).
- Cost: five main OBJ palette rows; at most ~26 `ClActor_SetPalette` calls a second (Unfezant: 18 places).
- The bottom screen's season icons are the legend; optionally the icon of the step's season can be marked while it
  shows (open question).
- A palette-row-per-mask animation would also work (at most 6 distinct masks per species [V]) but needs more rows
  and a VBlank palette write; per-actor rows are simpler.

## 3. What the encounter data distinguishes [V]

From `res/paperwhite2/encounters/` (`species.schema.json`, `settings.json`) and the runtime's constants:

| Condition | Values | In today's data |
| --- | --- | --- |
| Season | spring, summer, autumn, winter (`SEASON_*`) | all used, per habitat or `by_season` |
| Time (`DAY_PERIOD_*`) | morning, day, evening, night, late night | 2680 slots all five; 26 night + late night only |
| Weather | any `WEATHER_*`; the Habitat Dex groups them into **clear** (sunny, flutter, tints), **rain** (rain, gusty rain), **thunderstorm**, **snow** (flakes, blizzard, diamond dust), **sandstorm** (both) | none restricted yet (all "any") |
| Method (`ENCTYPE_*`) | grass, dark grass, rustling, surf, rippling surf, fishing, rippling fishing | grass 1102, dark grass 528, rustling 676, surf 202, rippling surf 126, fishing 167, rippling fishing 146 |
| Rustling kind (the area's `spots`) | shaking grass (85 areas), dust cloud (47), bridge shadow (3) | |
| Rarity tier | common 55, uncommon 25, rare 12, very rare 7, exotic 1 (shares, %) | all used |
| Levels | the species' `levels.min`/`max` (the gate and the cap; the level itself scales with the party) | per species |
| Outbreaks | per species: places, methods, seasons, times (19 species) | 40% of the place's encounters |
| Extra conditions | `when` (conditions engine) | none yet |
| Overworld wanderers | `overworld` (5 species) | |
| Story flags | the place's `TownMap_CheckFlag` (hidden until visited) as the original | |

So the icons: **4 seasons, 5 times, 5 weathers, 9 methods** (grass, dark grass, shaking grass, dust cloud, bridge
shadow, surf, rippling surf, fishing, rippling fishing) **+ an outbreak badge**. Methods per species [V]: 1 (190),
2 (141), 3 (116), 4 (38), 5 (3), 6 (1: Dratini).

**"Preferred" time and weather:** for each method, the contexts (season x time x weather group) where the species
appears; its share there is computed as the runtime does (tiers present split among their Pokémon, rescaled). The
preferred ones are those where its best share is highest. With today's data that's usually all of them (48 species'
shares vary by time at all [V]); the page then shows all as available, none marked. The level gate is ignored
(assume a party high enough); outbreaks shown apart, with their badge.

**What the bottom screen lists**, one row per method (sorted grass, dark grass, rustling kinds, surf, rippling,
fishing, rippling fishing): the method's icon, the levels ("Lv. 36-66"), the rarity tier (or range) and the rate
range over its places and contexts ("6-69%"); then the seasons (legend), times and weathers it appears in, preferred
ones marked. Places aren't listed (the map shows them).

**A build-time index**, beside the Habitat Dex (`tools/paperwhite2/encounters.py`, a new `area_index` written into
`ARCID_POKEDEX_GRA` as a hack member, 155+, rebuilt when `res/paperwhite2/encounters/` or `res/town_map/` change):
- header: magic, version, the species' offsets (u32 x 650, 2.6 KB);
- per species: a place block (place index u8, season mask u8) for each place it's at (1438 records, 2.9 KB), then a
  method block per method (method u8 incl. rustling kind, tier low/high, rate low/high in % or 1/2 %, season mask,
  time mask, preferred time mask, weather group mask, preferred weather mask, flags: outbreak/rule/wanderer: ~12
  bytes); ~2000 method rows, ~24 KB;
- total ~30 KB in the archive [I, prototype: 3426 habitat entries]; the page reads its species' range only (largest
  ~0.6 KB) with `GFL_ArcToolReadEx`-by-offset as the sprite middles' member is read.
- The rates come from the same rules as `encounters.py odds` (refactor its slot computation into a function on the
  candidates, so the index, `odds` and the editor agree; `encounters-packed.test.ts` style check).
- Nature Preserve is the only area on no town map place [V] (as in the original).

## 4. The map on the top screen

**Feasible, and on the same engine [V].** The Info page shows the main engine on top; the map page already draws
there.

- **Layers:** BG 0 (the 3D sprite) off while Area shows (as the move panel does); BG 1 keeps the head bar (rows 0-2)
  and the entry's text windows are freed and restored (`PokedexInfo_FreeText` / `_RestoreText`, already there for the
  move panel); BG 2 and 3 become the map (BG mode 5: BG 0 3D, BG 1 text, BG 2/3 extended), and go back to the entry's
  panels and grid on leaving.
- **The head bar covers y 0-23, so the map scrolls 24 px down [V, rendered]:** its 168 rows (y 0-167) then fill
  y 24-191 exactly. BG 2/3 y offset -24, every map OBJ +24. Without it the head bar would hide the top row of places
  (Opelucid, Twist Mountain, Icirrus).
- **VRAM [V]:** main BG bank A's 0x10000-0x1ffff hold the entry's BG 2/3 characters; the map needs 0x4000 + 0xb000 at
  0x10000 and 0x14000 and its screens at 0x2000/0x3000 (the same places as the entry's): the map overwrites the entry's
  BG 2/3 there, and leaving Area reloads them (`a/1/5/7` 0x1a characters, screens 0x29 and 0x20; a reload function in
  `src/ov296/pokedex_info.c` under `PAPERWHITE2`). No free bank for both (H and I are sub-only; A-G are taken).
  Extended palettes: bank G is already `GX_VRAM_BGEXTPLTT_23_G` [V] and slots 2-3 are exactly its 16 KB; standard BG
  palette rows aren't touched. Main OBJ (bank E, 64 KB): the area characters 4.3 KB (+ 7 KB for the player marker if
  kept) [V].
- **Overlay 144 can't load on the Info page [V]:** ov144 is 0x0219cec0-0x0219f9a0, ov296 (the entry)
  0x0219d720-0x0219fc00. It's only needed for `TownMapData_Load` / `_GetParam` (`src/ov144/townmap_data.c`, a
  4-line LZ read of `ARCID_TOWNMAP_DATA` 85 and an array index): the hack reads it itself, or better, the build index
  carries the places' animation and position (85 x 5 bytes) so the page needs no town map table at all.
  `TownMap_CheckFlag` is in ov012 (field, loaded) [V]; `PokedexCommon_*Glow` in ov302 (loaded) [V].
- **OBJ palette rows (main) [V/I]:** the entry uses rows 2-4 (type icons) and 5 (footprint), the move panel 9-11 (closed
  while Area shows), the page fade covers rows 0-7 (`PokedexDetailPalFade`, 0xff). Proposal: the entry's OBJs are freed
  with its text (already the move panel's path); the five glow rows in **rows 3-7** (all year 3, spring 4, summer 5,
  autumn 6, winter 7: inside the faded rows), the player marker (if kept) in row 0-2 from the town map's palette.
- **Actors:** only the places the species is at (max 26 [V]) in a unit of Area's own (the detail unit has 96 places,
  most used by the other sub-pages [I]); OAM main has 124 [V]. ClAct resources: Area takes 1 character, 1 palette and
  1 cell/animation slot (the area OBJs) only while it shows, as Evo does (others hold 29-30 of 32 [V, plugins.md]).
- **The glow:** alpha as the original, but full screen (no touch bar on top: no windows needed), and the page's fades
  (`PokedexDetailBlend`) restored on leaving.
- **Heap:** persistent < 6 KB (index range, actors, unit, resources) [I]; transient ~55 KB while loading the
  characters [I]. The Info page has ~90-100 KB free [V, earlier measurement], so it fits without growing; measure the
  low-water mark during Area's load in the emulator (`heap.py`) in phase 2. If short, grow `HEAPID_POKEDEX_DETAIL`
  by 64 KB (0xa0000 to 0xb0000; HEAPID_USER has ~660 KB free) [I].

## 5. Layouts

### Top screen

The head bar (title INFO; could read AREA while Area shows), then the map from y 24, highlights over it. Nothing for
the user to draw. Templates: `area_top_map.png`, `area_top_shapes.png`, `area_top_frame1-4.png`.

### Bottom screen (sub engine)

Same frame as the other sub-pages: grid BG 4, the art and buttons BG 6, the panels' windows BG 7, the touch bar
y 168-191. The icons are 4 x 2-tile blocks of BG 7's content window, tile-aligned, their map entries in the icons'
palette row (as the original's land/water/fishing icons use `GFL_BGSysSetScrPaletteNo`); no OBJ resources needed.

| Region | y | Contents |
| --- | --- | --- |
| Tab bar | 0-17 (tab hangs to 18) | art |
| Seasons | 24-39 | label at x 8; season icons at x 48, 88, 128, 168 (only those it's at); "All year" at x 210 |
| Methods | 48-135 | up to 4 rows at 24 px (icon at x 16, y 48/72/96/120): levels at x 56, rarity at x 136 (font 1), rate right-aligned at x 244 |
| Time | 136-151 | label; 5 time icons at x 48, 88, 128, 168, 208 |
| Weather | 152-167 | label; 5 weather icons at the same x |

Available ones shown, unavailable ones left out (the art's empty socket shows), preferred ones marked by the code (a
gold underline in the text window) [proposal]. More than 4 methods (4 species): "+N more" and a touch on the panel
pages through them (open question).

### Palette rows (sub BG) [V/I]

Today: 1-2 grid, 3 panels, 4-5 buttons, 6-10 the five arts, 11 Matchups' window, 12 Evo's window, 13 the touch bar's,
14-15 unused [I]; the page fade covers 0-12. Proposal: **arts in 6-11** (Area's art 10 or 11 by the new order:
Stats 6, Data 7, Moves 8, Evo 9, Area 10, Matchups 11), **12 the content window's palette, loaded by whichever of
Matchups, Evo, Area shows** (Matchups' text colours move from 11 to 12, loaded as it shows, as Evo's are), and **the
icons' 16 colours in row 12 while Area shows** with Area's text in its art's row. That keeps everything inside the
faded rows. Check rows 0, 14, 15 in the emulator before relying on them.

### The six-tab bar

Today: five tabs centred at x 64-192, 32 apart (`BAR_TAB_X` 64, `BAR_TAB_PITCH` 32) [V]; a tab's column is 32 px
wide, y 0-17; the selected tab in the arts is ~42 px wide at its top, ~26 at its bottom, hanging to y 18; the icons
~12-16 px, above the yellow line at y 14 [V, read from the arts]. **Six tabs: centres 48, 80, 112, 144, 176, 208**
(`BAR_TAB_X` 48), Area 5th at x 176; columns x 32-223. Moves' sets bar (its gap under the Moves tab) moves 16 px left
with it. Templates `tabs6_<page>.png` rebuild the user's tabs at the new places, an empty slot for Area's icon.

## 6. The art the user draws

| File (in `res/paperwhite2/pokedex_art/`) | Size | Colours / palette | What |
| --- | --- | --- | --- |
| `info_stats.png`, `info_data.png`, `info_moves.png`, `info_evo.png`, `info_matchups.png` (redrawn tab bars) | 256 x 192 (only y 0-23 change) | 15 + transparent, each art's own (sub BG rows 6-11) | the six-tab bar with that tab selected; from `tabs6_<page>.png` |
| `info_area.png` (new) | 256 x 192 | 15 + transparent, its own row (sub BG 10) | the Area bottom screen, with its tab bar (`tabs6_area.png`), panels behind the seasons/methods/time/weather regions, empty sockets for icons; from `area_canvas.png` |
| `area_icons.png` (new) | 160 x 80: 25 slots of 32 x 16 | 15 + transparent, **one palette for the whole sheet** (sub BG row 12 while Area shows) | row 1 seasons (4), row 2 times (5), row 3 weathers (5), row 4 methods grass, dark grass, shaking grass, dust cloud, bridge shadow, row 5 surf, rippling surf, fishing, rippling fishing, outbreak; from `area_icons_template.png` |
| `area_glow.png` (new) | 48 x 80: 5 rows x 3 swatches of 16 x 16 | 3 colours a row (light, mid, dark) | the map's glow: spring, summer, autumn, winter, all year (main OBJ rows 3-7); from `area_glow_template.png` |

Icon size: 32 x 16 as the type icons (`a/0/8/2`, 32 x 16 OBJs) [V]; on BG 7 they are 4 x 2 tiles, so each slot is
drawn exactly on its 32 x 16 grid cell. The season icons should use the glow's colours so they work as the legend.

## 7. Phases

1. **Data index** (`encounters.py area-index`, member 155 of `ARCID_POKEDEX_GRA`, with the places' animation and
   position): the odds refactor shared with `odds`; a check that prints a species' rows; the size.
2. **The tab and the map:** `POKEDEX_INFO_SUBPAGE_AREA` (six tabs, `BAR_TAB_X` 48, the cycle order, Left/Right/L/R),
   a new `paperwhite2_pokedex_info_area.c`: on show, free the entry's text and OBJs, BG 0 off, BG mode 5, the map's
   characters/screens/ext palettes, scroll -24, the area actors with their season rows and the glow; on hide, the
   entry's BG 2/3 reloaded and its text restored. Measure heap and VRAM. Placeholder tabs until the art.
3. **The bottom screen** with placeholder panels and grey 32 x 16 boxes for icons, the text from the index (new
   messages in `pokedex_data.txt`: Seasons, Time, Weather, All year, method names, "Area unknown").
4. **The user's art:** `info_area.png`, the five redrawn tab bars, `area_icons.png`, `area_glow.png` through
   `screen_art.py` targets (as the other sub-pages).
5. Cut the touch bar's AREA page.

**Reuse:** the same `area_icons.png` (one sheet, one palette) can feed the Habitat Dex's filters (seasons, times,
weathers, methods as its tabs) and the DexNav's top panel (season, time, weather of the moment, and the method), each
loading the sheet's tiles into its own BG or converting them to OBJs with `obj_remap.py`. The area index's per-method
rows are what the DexNav's "what if" and Info's Habitat Dex link would want too.

## As built (2026-11-08, phases 1-3)

The details are in `docs/paperwhite2/plugins.md` (Pokédex, Area). Where the build differs from the plan above:

- **The user's decisions:** Area between Evo and Matchups (D-pad and L/R include it), the head bar stays INFO, every
  place shows (visited or not), the player's marker stays; the glow cycles through the seasons of the places not met
  all year, all-year places white; unmet seasons, times and weathers show greyed (light grey copies of their icons); a
  species never met in the wild says "Not found in the wild".
- **Rows by terrain (the user's, 2026-11-09; this replaced the method rows and their merging):** at most four rows,
  walking, dark grass, surfing and fishing, the empty ones left out and the shown ones centred in the methods' area.
  Walking's icon is the terrain of the areas where it is walked into (by grass or the area's rustling spots): grass,
  cave floor, sand, puddle or bridge, or a generic walking icon where they differ. The row's special version (walking:
  shaking grass, dust clouds, bridge shadows; surfing: rippling water; fishing: rippling water; dark grass: none) puts
  a 16 by 16 mark on each side of the icon where the Pokémon is met by it too or only by it; met only by it, the icon is
  grey, except a bridge's (a bridge area has only shadows). The rarity is the normal method's, or the special
  version's where only it applies. The outbreak badge is gone (the flag stays in the index, and a row whose only
  encounters are outbreaks still reads "Outbreak"). The terrains come from fixed lists in `encounters.py` (sand: Route
  4, the Desert Resort; puddles: Icirrus City, the Moor of Icirrus, Route 8; floors: the Castelia Sewers, Celestial
  Tower, Dragonspiral Tower's inside, Relic Castle, the Strange House), the `dust` areas (cave floor) and the `shadow`
  areas without grass (bridge), checked against the encounter tiles of the areas' maps: the puddle areas have swamp
  tiles and no grass, the sand areas deep sand, the buildings floor tiles (Relic Castle some sand too). No area has
  two terrains, so no per-area setting was needed. The Village Bridge has grass and dark grass besides its shadows, so
  it is a grass area whose shadows are walking's special version; only the Driftveil Drawbridge and the Marvelous
  Bridge are bridges, and no species walks only there, so no row shows the bridge icon today (Ducklett's mixes the
  bridge with the Moor's puddles: generic walking).
- **The user's changes of 2026-11-08:** the icons on solid white, as their tiles replaced the art behind them (OBJs with transparent pixels since 2026-11-09; the
  bottom art keeps its transparent parts, which show the grid: the user's choice, 2026-11-09); "All seasons", "All times of day" and "All
  weathers" in place of the icons where they would all be coloured (for the seasons only when every place glows
  white; any season-specific place shows the four icons, each coloured where it is met); no gold marks (the season
  glowing, the preferred times and weathers) and no rates; and the current Pokémon's box over the head bar's right
  end on the top screen (its party icon and name; a placeholder until the user drew `area_top_box.png`, in since
  2026-11-09).
- **Members:** the new art is `ARCID_POKEDEX_GRA` 152-154, so Evo's members moved to 155-157 (`pokedex_evo.py`'s
  `ARCHIVE_MEMBERS` is 155); the index is 158, the icons 159 and the box's art 160, all written by
  `pokedex_evo.py archive`.
- **The index** has no tier or rate per place, only per row (lowest and highest over its places and contexts); a row's
  rates are the species' summed share over its forms. Version 2 (rows by terrain): 22.0 KB, 496 species, the largest
  block 104 bytes.
- **Bottom palette rows:** arts 6-11; row 12 the content window's on Matchups and Evo, loaded in the VBlank as the
  sub-page changes; Area's text is in the panels' row 3 (not its art's). Its icons are sub OBJs since 2026-11-09 (below),
  so sub BG rows 12 (for Area), 14 and 15 are free of them.
- **Layout (2026-11-09, the user's background `info_area.png` with its boxes 2 px higher than the mockup
  `area-example.png`'s):** the icons and the text at the mockup's pixels, 2 px higher. The seasons' bar (y 21-38 inside)
  has no label: icons at x 52, 92, 132, 172, y 22, "All seasons" centred (x 128, y 27). Rows 19 px apart, centred in
  the methods' box (y 46-120): rows at y 47/66/85/104 (4), 56/75/94 (3), 66/85 (2), 75 (1), each row's left mark,
  icon and right mark at x 13, 29 and 61 at the row's own y (the mockup's yellow boxes); levels x 88 at the row's y
  (font 0), rarity x 159, y + 4 (font 1). "Time" and "Weather" at x 17, y 134 and 151 (font 1); times' icons y 129,
  weathers' y 146, both at x 61, 97, 133, 169, 205; "All times of day" / "All weathers" at x 64 on the label's line;
  "Not found in the wild" centred at y 76. The bottom box (y 128-162 inside) is the same height as before, moved up
  2 px like the others. `pokedex_area_templates.py` writes `area_reference*.png` (the art with the slots and text where
  the page puts them, 1 to 4 rows, with and without the tiles' grid) from the C file's places.
- **The icons as OBJs (2026-11-09):** each icon is a sub OBJ of 32 by 16 (the type icons' cells, centred) at its exact
  place, its clear pixels showing the art; the special marks' slot is cut into two icons (left mark, right mark), each
  16 by 16 in its icon's left half. Each icon has at most 7 colours, so `pokedex_area.py` packs each whole (and its
  grey copy, clear pixels clear) into one of three OBJ palette rows: sub OBJ 14 and 15 (unused) and 4 (Moves' knob's,
  shown only on Moves). One character resource holds all 52 (13 KB of sub OBJ VRAM); each OBJ's image proxy points at
  its icon and its palette proxy at its row. They are made as Area shows (anew for each species, up to 26) and freed as
  another sub-page shows; Area's VBlank task loads the rows' colours in the VBlank that first shows the OBJs, keeping
  the knob's row, and puts it back in the VBlank that shows another sub-page (measured: row 4 the knob's again on
  Moves and Evo; no in-between frame between Area and Evo or Moves either way). The page's OBJ unit has 128 actors
  (96 in the original) for them.
- **The icon sheet (2026-11-09):** row 1's fifth slot holds the two special marks (left and right halves); row 4 grass,
  dark grass, cave floor, sand, bridge; row 5 surf, puddle, fishing, walking and an unused slot. The user's updated
  sheet (still unfinished: the marks' slot is empty, the old method icons stand in for some terrains) has 27 colours,
  at most 6 an icon, and transparent pixels; with the greys it fills the three rows' 45 places.
- **Main OBJ rows:** the marker in row 0, the glow in rows 1 (all year), 6, 7, 14 and 15 (the plan's 3-7 hold the
  entry's type icons' and footprint's palettes, which stay loaded); the current Pokémon's box in 12 (its party icon)
  and 13 (the box's art, its 16 colours).
- **The box:** the user's `area_top_box.png`, x 129-255, y 0-31 (four 32 by 32 OBJs from x 128), with a slanted left
  edge; the party icon's 32 by 32 at x 156, y 0 and the name at x 190, y 8 (font 0, or font 1 at y 10 past x 252),
  moved right from the placeholder's x 148 and 184 so that the icon clears the slant's gold line (it reaches x 155 at
  the bottom); the name in the art's palette's dark (11) and light grey (6). Opening the map with it measured 86 KB
  free at the lowest (the box's art adds 2 KB).
- **VRAM swap:** the map's 62 KB of characters go to VRAM at once where the entry has none, and the rest (about
  9 KB: the BGs' blank first characters, the panels' and the caught labels') with the screens in the VBlank that
  switches the BGs; all 62 KB in the VBlank ran into the next frame in the emulator. Frame-by-frame captures of
  opening and leaving show no in-between frame.
- **Heap:** opening Area left 21 KB free at 0xa0000, so the detail heap is 0xb0000 now (99 KB at the lowest); with the
  icons as OBJs and the 128-actor unit, opening Area with the map left 82 KB free at the lowest (largest block 74 KB).
- **Placeholders:** the glow colours (the template's, until `area_glow.png`); the special marks and some terrain icons
  (see the icon sheet above). Not done: phase 4's `area_glow.png` target, phase 5 (cutting the
  touch bar's AREA page).

## Templates

`tools/paperwhite2/pokedex_templates.py` (which calls `tools/paperwhite2/pokedex_area_templates.py`) writes them
into `build/pokedex_templates/` with a README section "Area": `area_top_map.png`, `area_top_shapes.png`,
`area_top_frame1-4.png`, `area_top_box.png`, `tabs6_<page>.png`, `tabs6_sheet.png`, `area_canvas.png`, `area_reference.png`,
`area_reference_tiles.png`, `area_icons_template.png`, `area_icons_guide.png`, `area_glow_template.png`.
The sample is Unfezant; its rates in the reference are approximate (own candidates only).

## Open questions

1. More than 4 methods: answered (2026-11-09) by the rows by terrain with special marks (As built).
2. Times and weathers: show unavailable ones dimmed (needs a second palette row) or leave them out?
3. Mark the season currently glowing on the bottom legend while the map cycles?
4. The head bar's title on Area: INFO, or AREA?
5. Keep the player's marker and the visited-places markers on the map (one more OBJ resource slot)? And keep hiding
   places not visited yet, as the original?
6. Glow colours: the template's defaults (pink, green, red-orange, blue, white) or the user's.
