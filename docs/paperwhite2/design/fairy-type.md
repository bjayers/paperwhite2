# Fairy type: the foundation

Research, design and build checklist for adding the Fairy type to Paper White 2 with the Gen 6+ matchups, shown
everywhere a type is shown, and with the existing Pokémon (and perhaps moves) that became Fairy in Gen 6 retyped. No
new moves, abilities or items here. This follows `design/moves-and-abilities.md` §8, which it replaces as the plan.

**Evidence.** Everything below was read from `src/`, `include/`, `res/`, `generated/`, `tools/` and the editor at
commit `e8910ecbc4`, and from the user's Pokeweb repo (reference only). What is inferred and not traced is marked
*(inferred)*. Nothing was built or run for §1-11; §0 is what was built after.

## 0. Built (2026-11-15)

Steps 0-4 of §11 are built, with the recommendations of §2 (decisions 1-3 and 7-8 taken as recommended; 4-6 later).
`plugins.md`'s "Fairy type" has the code's map. What differs from the plan below:

- **22 species, not 23**: §8.1's table lists 22, which is Gen 6's whole list among 1-649.
- **Slots**: `TYPE_SLOT_COUNT`, `PaperWhite2_TypeSlot` and `_SlotType` are in `include/paperwhite2/type_chart.h` (not
  a new `types.h`), with `ORIGINAL_TYPE_COUNT` (17) for the saves' per-type records. The plain build's identity
  versions are local macros (`PSTA_TYPE_SLOT`, `ITEMMENU_TYPE_SLOT`, `POKEDEX_INFO_TYPE_SLOT`...), so its code is
  unchanged.
- **The label's resource** is the packer's new sized 4bpp resource (mapping 0, a SOPC section), not member 34's
  header: the game draws it right on every screen tested, as it does `pokedex_gra`'s 137.
- **Hall of Fame**: the Pokémon's first type is mapped to Psychic where it is read (`HallOfFameDemoMain_GetPokeData`),
  which covers both tables.
- **Cheren**: messages 153-169 are Fairy with Normal ... Dark, 170 Fairy alone; `tools/paperwhite2/cheren_type_text.py`
  rewrote 41 original messages (§7's "Fairy" weaknesses, and Ghost/Dark weaknesses of Steel/Ghost and Steel/Psychic
  from the Steel change; Ghost/Dark now has one weakness).
- **The bag's actor unit** grows from 54 to 55: the original's 54 are all used, and the 18th label made the selected
  item's icon fail `ClActUnit_FindFreeActor`'s assert ("An error has occurred") on changing pockets. The other screens'
  units have room (summary 96 with no new actor, box 233, the Pokédex's 128).
- **The editor** needed nothing: its type pickers list `TYPE_FAIRY` from `generated/types.txt` (and `TYPE_NULL`, as
  before, outside the Move Editor's filter).

**Placeholders for the user to redraw**: the editor's Graphics & Palettes has a **Type icons** page for every type's art
and colors, Fairy's included: the label (export and import its PNG, or all labels as one sheet), its palette row (033),
the move button's palette (`btlv` 572) and the HUD wedge's colors. The Palettes page edits the same files:

| Art | File | Size, colors |
| --- | --- | --- |
| The FAIRY label | `res/graphics/app_menu_common/182.png` (`a/0/8/2` 182) | 32 x 16, indexed 4bpp, palette row 2 of `033.pal`: index 0 transparent, 8 the fill, 9 the edge, 15 the letters, 14 their shadow (as every label) |
| The label's two colors | `res/graphics/app_menu_common/033.pal` entries 40 and 41 (row 2's 8 and 9) | placeholder 238 132 181 and 165 66 115 |
| The battle move button | `res/graphics/btlv/572.pal` (`a/0/1/1` 572) | 16 colors used (of 256), a copy of Psychic's 469: 0-7 and 14 the button's frame and text, 8-13 the button's gradient, light to dark (placeholder pinks 255 158 206 ... 123 57 99) |
| The HUD wedge | `res/paperwhite2/type_colors.json`'s `TYPE_FAIRY` (packed into `paperwhite2/type_colors_config.h`, which `paperwhite2_type_icons.c`'s `TYPE_COLORS`/`TYPE_SHADES` take) | fill and edge, 8-bit RGB (placeholders `238 132 181`, `165 66 115`, the label's colors); the Type icons page takes them from the label |
| Hall of Fame particles and plate | (none yet) | Fairy uses Psychic's; its own would be new members of `ARCID_HALL_OF_FAME_DEMO` and a mapping |

**Proved in py-desmume** (the user's save, scratchpad `fairy-build/`): the summary's info and skills pages (FAIRY
label, Charm's), the PC box (Clefable, Gardevoir, Togekiss, Azumarill, Mawile), the Pokédex entry and its Matchups
(Dragon ×0, Poison and Steel ×2, Fighting/Bug/Dark ×0.5, Fairy ×1 in the 18th place), the Pokédex search by Fairy
(Clefairy, Togepi, Gardevoir), the bag's pockets and a TM's label; in battle Dragon Claw into Clefable "doesn't affect", Close Combat into Clefable "not very
effective", Poison Jab "super effective", Shadow Ball and Crunch into Klink neutral, Roost on Togekiss then Earthquake
hits, Conversion 2 after Dragon Claw picking Fairy (forced) and then immune to Dragon Claw; the HUD wedge, the move
buttons and the preview's colors. The game clear's medals, the PWT and the Hall of Fame are proved from the code
(their paths need the endgame), and Cheren's messages from the built bank (171 messages) and the index's code.

## 1. Summary

- **Fairy is `TYPE_FAIRY = 18`**, appended after `TYPE_NULL = 17` in `generated/types.txt` (§3). Every original check
  that treats 17 as "no type" keeps working, including Roost on a Fairy/Flying Togekiss. The cost is a gap at 17:
  tables indexed by type get an unused 17th entry, or map Fairy to slot 17 (§3.2).
- **Types aren't saved per Pokémon.** `PKM_PARAM_TYPE1/2` read the species' data every time
  (`src/system/poke_tool.c:1861`). Retyping the species in `res/` retypes every caught Pokémon, and the save format
  doesn't change.
- **The chart is already one table in ARM9 main** (`src/paperwhite2/main/paperwhite2_type_chart.c`), read by the
  battle, the AI's damage estimate, the Move Effectiveness Preview and the Pokédex's Matchups. It grows to 19 × 19,
  with a neutral row and column 17 (§4).
- **The type icons have one source.** `AppMenuCommon_GetTypeIconCharFile` and `_GetTypeIconPaletteIndex`
  (`src/system/app_menu_common.c:45-50`) serve every screen's 32 × 16 type label. One new icon member, one mapping
  there, and Fairy shows wherever those labels are drawn. The screens that keep **an array of 17 icons** each need it
  grown (§5).
- **Four original routines would write or read out of bounds for a Fairy Pokémon** and must land before any species
  is retyped (§6.1): the game-clear type medals, the PWT's party main type, the Hall of Fame's per-type effects, and
  Cheren's Xtransceiver type advice.
- **Art the user draws:** one 32 × 16 type label (with two colors added to an existing palette row), one move-button
  palette for the battle menu, and two HUD wedge colors. Pokeweb has no usable 32 × 16 Fairy label (§5.4).
- **Data:** the 22 species of §8 and, if the user wants them now, Charm, Moonlight and Sweet Kiss (§8.2).
- **Is it "fairly straightforward"?** Yes, with no blockers: no format changes, no save changes, no hard-coded
  addresses. But it is wide rather than deep: about 20 small C edits in 14 files, 3 new art members, 2 text banks
  and the data. §11 orders it into five testable steps.

## 2. Decisions for the user

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | Gen 6's Steel change: Steel no longer resists Ghost and Dark | **Include.** Fairy's balance assumes it (Steel became one of Fairy's two checks), and it is two cells of the chart. It is a change to vanilla matchups, so say so in the hack's notes |
| 2 | Retype Charm, Moonlight, Sweet Kiss to Fairy | **Include in the foundation.** Data only (3 `data.json`), all status moves, so the type matters only for their icon, Conversion and the AI's type reads. Without them a Fairy type has no Fairy move at all, and Conversion can never pick Fairy |
| 3 | Hidden Power | **No Fairy**, as in Gen 6+. Nothing to do: `hpTypes[16]` (`poke_tool.c:83`) stays |
| 4 | Arceus's Fairy form and the Pixie Plate | **Later.** Needs a new item, a new form (form 17 with type 18), its sprites, and a case in `PML_ItemGetArceusPlateType` (`poke_tool.c:~2544`). Arceus's 17 forms are form = type today |
| 5 | Fairy items: Fairy Gem, Pixie Plate, Roseli Berry; a type-boosting item (Gen 5 has no Pink Bow / Polkadot Bow) | **Later**, with the items work: each is a new item and a line in `item_handlers.c` (`CommonTypeBoostingItem`, `CommonGemPower`, resist berries) |
| 6 | Gen 6's other changes to these species (Clefable's, Wigglytuff's, Granbull's... stat buffs) | **Not foundation.** A separate data pass if wanted |
| 7 | Fairy in the PWT's Type Expert tournament and the Medal Box's type medals | **Leave Fairy out** of both: their saves have one record per original type. Make them ignore Fairy safely (§6.1) |
| 8 | Fairy = 18 (recommended) or Fairy = 17 with `TYPE_NULL` moved | **18** (§3.1) |

## 3. The constant

### 3.1 Why 18, not 17

`generated/types.txt` has `TYPE_NORMAL` 0 to `TYPE_DARK` 16 and `TYPE_NULL = 17`, "the type of a typeless move".
Gen 5 has no ??? type as a real index: 17 is only a sentinel. The original code tests it as a bare number:

- `splitTypeCore` (`src/ov167/btl_pokeparam.c:514-539`): Roost replaces Flying with `0x11`, then collapses it. A
  Fairy/Flying Togekiss under Roost becomes mono-Fairy only if Fairy isn't 17.
- `DoesMonHaveType` (`:554`), `GetTypeEffectiveness` (`btl_calc.c:142`), STAB (`btl_server_flow.c:3691`), Color
  Change (`ability_handlers.c:2196`), Conversion 2 (`move_handlers.c:5080`), the PWT (`wbt_tool.c:138-141`,
  `wbt_system.c:494`, `scrcmd_wbt.c:46`), and `TYPE_NULL` uses (`btl_server_flow.c:6271, 6644`,
  `wbt_makematch.c:227`, `poke_regulation.c:139`, whose rules are data with 17 for "any type").

Fairy as 17 (what White2Upgrade, Pokeweb and the PMC plugins assumed: `paperwhite2_type_icons.c:60` and
`paperwhite2_move_preview.c:84` say "17 itself, a Fairy type in hacks that add one") means rewriting every one of
those and any data that stores 17 as "none". Fairy as 18 means none of them change. That is the recommendation, as
`moves-and-abilities.md` §8 already said.

### 3.2 The gap at 17, and a slot helper

Tables indexed by type then need 19 entries with 17 unused, or a mapping. For the battle chart, 19 × 19 with a neutral
row and column 17 is simplest (§4). For the UI's arrays of icons, where an entry costs VRAM and a loop over "all
types" would draw slot 17, add one hack header (`include/paperwhite2/types.h`, *proposed*):

```c
// The types a screen shows, Normal to Dark and then Fairy, by slot: slot 17 is Fairy
#define PAPERWHITE2_TYPE_SLOT_COUNT 18
u32 PaperWhite2_TypeSlot(u32 type);     // TYPE_FAIRY -> 17, 0-16 as they are
u32 PaperWhite2_SlotType(u32 slot);     // 17 -> TYPE_FAIRY
```

Static inlines are enough. Every "17" below that is "the types" becomes `PAPERWHITE2_TYPE_SLOT_COUNT` with these
mappings, under `#ifdef PAPERWHITE2`.

### 3.3 Lists, text and Easy Chat

- `generated/types.txt`: `TYPE_FAIRY` after `TYPE_NULL = 17` (18 by count). The editor's pickers (`x-constant:
  "TYPE_"` in `species.schema.json` and `move.schema.json`) and every packer (`species_data.py:343`, `move_data.py`,
  `tr_ai_script.py`, `field_script.py`) are constant-driven and pick it up. Don't rerun `make_constants.py` on it.
- `res/types/fairy.json` `{ "name": "Fairy" }`.
- **The type name banks need a message 17.** `type_names.txt` and `type_names_upper.txt` are `\from{types.name}`, and
  `text_sources.types()` skips `TYPE_NULL` (`tools/text/text_sources.py:102`). With Fairy after it, Fairy's name would
  land at message 17. Give `TYPE_NULL` a placeholder message (an empty or "???" name) instead of skipping it, so
  `loadTypeTextToStrbuf(type)` reads message 18 for Fairy.
- **Easy Chat:** `pms_words.py` counts every message of `type_names_upper` as a word (`CATEGORIES`, line 38), and
  every later category's words would shift by two, changing saved sentences. Add `"TYPES": 17` to `WORD_COUNTS`
  (line 31), as moves and abilities have. Fairy is then no Easy Chat word, and `PMS_WORD_TYPE(TYPE_FAIRY)` must never
  be used.
- The Pokédex search's own type names are their own messages: append `PokedexSearchMain_Text_Fairy` to
  `res/text/system/pokedex_search_main.txt` (§7).

## 4. The chart and the battle

### 4.1 Format

A matrix, not Gen 3/4's list of triples: `PaperWhite2_TypeChart[TYPE_CHART_SIZE][TYPE_CHART_SIZE]` of u8, attacking
type first, values 0 / 2 / 4 / 8 (none, half, normal, double), `include/paperwhite2/type_chart.h` (`TYPE_CHART_SIZE
17`). `btl_calc.c:72-89` points the battle at it under `PAPERWHITE2`. `GetTypeEffectiveness` (`btl_calc.c:141`)
returns neutral for 17 before reading the table.

**Foresight, Miracle Eye, Scrappy, Gravity, Iron Ball** aren't in the chart: they are handlers on
`BATTLE_EVENT_CHECK_TYPE_EFFECTIVENESS` (`field_handlers.c:84`, the server's event at `btl_server_flow.c:6743`).
None touches Fairy, and no Gen 5 mechanic lifts Fairy's Dragon immunity, so nothing changes there.

### 4.2 The new chart (19 × 19)

- `TYPE_CHART_SIZE 19`; row and column 17 all 4 (never read, and neutral so any loop over all 19 is harmless).
- Fairy's row (attacking), by defending type, Normal ... Dark, [17], Fairy:
  `4, 8, 4, 2, 4, 4, 4, 4, 2, 2, 4, 4, 4, 4, 4, 8, 8, 4, 4`
  (2× Fighting, Dragon, Dark; ½× Poison, Steel, Fire).
- Fairy's column (defending), by attacking type, Normal ... Dark, [17], Fairy:
  `4, 2, 4, 8, 4, 4, 2, 4, 8, 4, 4, 4, 4, 4, 4, 0, 2, 4, 4`
  (2× from Poison, Steel; ½× from Fighting, Bug, Dark; immune to Dragon).
- Decision 1: Ghost→Steel and Dark→Steel from 2 to 4 (`[7][8]`, `[16][8]`).
- `tools/paperwhite2/pokedex_templates.py` reads the C file's numbers (`type_chart()`, line ~935) and indexes the
  icons after the types with `len(type_chart())` (line ~910): update it for 19 and the slot order.

### 4.3 Battle code (ov167, ov169, ov170)

| Site | Today | Change |
| --- | --- | --- |
| `GetTypeWeaknesses` (`btl_calc.c:213`), Conversion 2's list of resisting types | `i < 17` | `i < TYPE_CHART_SIZE`: row 17 is neutral, so 17 never lists. Its buffer is the handler work's 0x11 bytes (`move_handlers.c:5081`): at most 8 types ever resist one attacker, so 17 bytes still hold them |
| Conversion (`move_handlers.c:1000`), Color Change, Reflect Type, Soak, Transform, Roost | by `DoesMonHaveType` / `GetPokeType` | none |
| STAB, `GetTypeEffectiveness`, `BtlCalc_GetTypePairEffectiveness` | 17 = none | none |
| Trainer AI: `AICalcDamage` and every switch check in `btl_client.c` (3597-4000) use the chart; `res/trainers/ai/*.s` name specific types (`TYPE_STEEL` for poison immunity, Expert's pre-split physical list) | | none needed. The type-absorbing table (`btl_client.c:819`) has no Fairy ability in Gen 5 |
| Hidden Power, Judgment, Natural Gift, Weather Ball, Camouflage, Nature Power, Techno Blast | tables of Gen 5 types | none (decisions 3-5) |
| Items: type boosters, gems, resist berries (`item_handlers.c`) | one per Gen 5 type | none: no Fairy item exists |

Box data, personal data and move data store a type as a u8 (`species_data.py:121`, the move record's first byte);
nothing packs a type into fewer bits (searched for bit fields named `type`; the move preview's attribute mask is 5 bits,
`paperwhite2_move_preview.c:65`). Entree Forest stores species and moves, not types.

## 5. Icons and every screen that shows a type

### 5.1 The shared type label

- Archive `a/0/8/2` (`ARCID_APP_MENU_COMMON` 82, `res/graphics/app_menu_common/`): palette member 33 (`033.pal`,
  `AppMenuCommon_GetTypeIconPaletteFile` = 0x21), labels 34-50 for the 17 types (`0x22 + type`), then 51-55 the
  contest categories Cool-Tough, 56-58 the move categories, cells 59-61, animations 62-64. **Type 18 today would get
  member 52, Beauty's label, in palette 1** (`sTypeIconPalettes`, `app_menu_common.c:22`, 22 entries).
- Each label is a 32 × 16, 4bpp OBJ character in one of three palette rows of `033.pal`. Every screen loads those
  three rows (`ClActSys_LoadPlttRange(..., 0, 3)` in `p_sta_sys.c:421`, `itemmenu_disp.c:358`,
  `pokedex_info.c:1508`, the hack's panels...). Measured over the PNGs: the labels use indices 0, 14 and 15 shared and
  two of their own. **Row 2's indices 8-13 are unused** (magenta 255,0,255 placeholders; row 2 is Bug, Grass, Dragon
  and Smart).
- **Design:** Fairy's label is a new member **182** (`182.png`, the archive ends at 181), drawn with indices 0, 14, 15
  and two new colors put in row 2's free indices 8 and 9 (Gen 6's label pink and its dark edge). No screen needs a
  fourth palette row. Then under `PAPERWHITE2` in `app_menu_common.c`:
  - `AppMenuCommon_GetTypeIconCharFile`: `TYPE_FAIRY` → 182;
  - `AppMenuCommon_GetTypeIconPaletteIndex`: `TYPE_FAIRY` → 2.
- **Check when building:** `graphics_archive.py` makes an added PNG "a sized character resource". The labels are OBJ
  characters loaded as 1D tiles. A 32 × 16 image's tiles in rows are the same order *(inferred)*, but compare the new
  member's NCGR header (mapping mode, size fields) with member 34's, and copy 34's header if the game draws it wrong.

### 5.2 Screens and their arrays

Screens that load one label at a time from the type (`GFL_G2DIOReadOBJNCGRArc(..., GetTypeIconCharFile(type))`) need
nothing beyond §5.1. Those that preload one per type need their arrays grown (by slot, §3.2):

| Screen | Where | What it keeps | Change |
| --- | --- | --- | --- |
| Summary (info page types, skill page move types) | `src/ov207/p_status_local.h:31` `PSTA_TYPE_COUNT 17`; `p_sta_sys.c:428, 487`; `p_sta_info.c:169`, `p_sta_skill.c:585` | 17 loaded labels, indexed by type | 18 by slot |
| Bag (a TM's move type) | `include/app/itemmenu.h:81, 98` (`typeIconChr[17]`, `typeIcons[17]`); `itemmenu_disp.c:366, 388, 442, 1134` | one actor per type, shown by `typeIcons[PML_MoveGetType(move)]` | 18 by slot; **index 18 today reads past the array** |
| PC box (the selected Pokémon's types) | `src/ov255/box2_obj.c:985, 1019, 1042`; `include/app/box2_obj.h:11-18` | actors 32-48 by type; **actor 49 is the first tray icon**, so 32 + 18 is a tray icon | add one actor for Fairy (`BOX2_ACTOR_MAX` 145 → 146, a `chrRes` slot), or remap the group by slot. Note `ShowTypeIcons` hides a second type of 0 (Normal): no Fairy species is X/Normal, so no effect |
| Pokédex entry (vanilla top screen) | `src/ov296/pokedex_info.c:180-181` (`allTypeChars[TYPE_NULL]`), `:1527-1550` | 17 preloaded | 18 by slot. The struct's offsets move; it is the overlay's own work, so fine in C |
| Pokédex Info → Matchups (hack) | `src/paperwhite2/ov298/paperwhite2_pokedex_info_panels.c:534-535, 806, 934, 1330, 1367` | `TYPE_CHART_SIZE` icons in 3 rows of 6; **the 18th place was left for Fairy** (`design/pokedex.md:197`) | loop over slots, read the chart with `PaperWhite2_SlotType(i)`; arrays by slot (not `TYPE_CHART_SIZE`, which becomes 19); the move list's `type < TYPE_CHART_SIZE` (line 1330) through the slot |
| Pokédex Info → Moves, move panel (hack) | `paperwhite2_pokedex_move_panel.c:561` | one label by type | none |
| Battle menu move buttons | `src/ov168/btlv_input.c:225` `data_ov168_021f3864[17]` (BG palette member per move type, `a/0/1/1` 464-480), read at `:2453`; the label at `:2457` | | **new member 572** (`res/graphics/btlv/572.pal`, the archive ends at 571): Fairy's button palette. Map `TYPE_FAIRY` → 572. Index 18 today reads past the table |
| Battle menu's 22 "type" actors | `btlv_input.c:53, 274` | decorative pieces of the command screen's background, 22 positions | none: not types (`moves-and-abilities.md` §8 called them type actors) |
| Battle party list (moves, types) | `src/ov287/b_plist_obj.c:273-279` | one label by type | none |
| Move tutor, trade screen, PWT book, battle scenario, Habitat Dex, DexNav | `ov258/move_tutor_main.c:1389`, `ov194/pokemontrade_message.c:94`, `ov322/pkwd_book.c:1251`, `ov288/b_scenario_graphic.c:470`; the hack's ov303 files print type names | by type | none |
| Battle HUD wedges (hack) | `src/paperwhite2/ov168/paperwhite2_type_icons.c:61` `ICON_TYPE_COUNT 18`, `TYPE_COLORS`/`TYPE_SHADES` (`:151-158`, entry 17 = the plugin's Fairy `0x723c`/`0x48e9`) | colors by type | 19 entries: Fairy's colors at 18 (sampled from the new label, as the others were), 17 unused; or index by slot. Bounds checks at `:863, 875, 986` follow |
| Move Effectiveness Preview (hack) | `paperwhite2_move_preview.c:85` `MOVE_PREVIEW_TYPE_COUNT 18`, `:286, 297, 437` | a bound only; matchups from the battle's chart (`:331`) | `TYPE_CHART_SIZE`. Nothing else |
| Hall of Fame | `src/ov265/hall_of_fame_demo_main.c:88` particles, `hall_of_fame_demo_obj.c:66` palettes, by the first type (`:267`) | 17 entries | §6.1 |

### 5.3 The editor

The type pickers are generated from `generated/types.txt`, so `TYPE_FAIRY` appears in the Pokémon and Move editors with
no change. The Move Editor already filters `TYPE_NULL` (`editor/src/modules/moves/MoveEditor.tsx:415`); the species
form shows whatever the schema's constant list gives *(not checked whether it lists `TYPE_NULL`)*. The editor draws no
type icons and has no type chart page; a chart editor would be new work (the chart is C today; a JSON source packed
into the C would be the way, later).

### 5.4 The art, and Pokeweb's

| Art | Size and colors | Placeholder |
| --- | --- | --- |
| Type label "FAIRY" (`a/0/8/2` 182) | 32 × 16, 4bpp, palette row 2: indices 0 / 14 / 15 as every label, 8 and 9 the new pink and edge | the user draws it; a recolored copy of Psychic's (47) with the letters redrawn is a fine stand-in |
| `033.pal` row 2 indices 8, 9 | two colors | Gen 6's label pink and its edge |
| Move button palette (`a/0/1/1` 572) | 16 colors, a copy of a type's button palette (464-480) recolored | Psychic's (469) recolored pink |
| HUD wedge fill and shade | two RGB555 values | the plugin's `0x723c` / `0x48e9` |
| Hall of Fame particles and palette | | Psychic's (§6.1) |

Pokeweb has Fairy only in the HUD wedge tables (`runtime/battle-type-hud/assets*.h`, the 8 × 8 approved icons, whose
`icons/fairy.png` isn't in the repo) and Frost's 18 × 18 chart offsets (`src/pokeweb/typeChartModel.ts`). Its
`summary-type-icons` excludes Fairy (`README.md:17`). So no usable 32 × 16 Fairy label exists there.

## 6. Original code that a Fairy Pokémon breaks

### 6.1 Out of bounds (must land with or before the retypes)

| Where | What | Fix (under `PAPERWHITE2`) |
| --- | --- | --- |
| `src/ov012/event_game_clear.c:300-326` (game clear, Medal Box type medals) | `u32 typeCounts[17]` on the stack, `typeCounts[type1]++` for every party member: **a Fairy writes past the array** | count only types below 17 (no Fairy medal, decision 7); a party with a Fairy then earns no single-type medal, which is right |
| `src/ov055/wbt_tool.c:120` `WbtTool_GetPartyMainType` (PWT entrant's main type) | `u8 counts[17]`, `counts[type]++`: **stack write** | skip Fairy as it skips 17. The Type Expert records are one per original type (`WbtSave` 29 counts; `scrcmd_wbt.c:35-55`) |
| `src/ov055/wbt_system.c:469` (PWT's simulated NPC matches) | its own copy of the 17 × 17 chart; a retyped NPC Pokémon reads past it | read `PaperWhite2_TypeChart` |
| `src/ov265/hall_of_fame_demo_main.c:88`, `hall_of_fame_demo_obj.c:66` | particle and palette member by the first type: a Clefable or a Togekiss reads past the tables, **a wild file ID** | map Fairy to Psychic's entries (47 and 17) until there is art |
| `src/ov259/local_tvt_person_chelen.c:22, 299` (Cheren's call: "a Normal- and Flying-type Pokémon... it's weak against...") | a message per pair of types, 153 of them, by a triangular index of 17: a Fairy pair indexes past the bank's 153 | §7 |

### 6.2 Out of range, but safe

- `scrcmd_pokemon_center.c:36, 73, 318` (the type medals' Pokédex check) reads its types from its own archive
  (`ARCID_MEDAL_TYPE_SPECIES` 239), not from the species. Those stay Gen 5 types, so no Fairy reaches the array, and the
  medals keep their vanilla meaning. Leave it.
- `poke_regulation.c:139` and the PWT's `expertType` compare to data where 17 means "any".
- The Pokédex search (§7) and every screen of §5.2 that reads past an array today: all fixed there.

## 7. Text

- **Type names:** §3.3.
- **Pokédex search:** `sPokedexSearchTypeMsgs[POKEDEX_SEARCH_TYPE_COUNT + 1]` (`src/ov300/pokedex_search_main.c:54`,
  17 types then "-") is read by list position (`:634`) and by the criteria's stored type (`:638`,
  `pokedex_search_bmp.c:139-262`); the list adds `POKEDEX_SEARCH_TYPE_COUNT` rows (`pokedex_search_list.c:220`,
  `include/app/pokedex_search_main.h:24`). Add a Fairy row: the list's 18th position stores `TYPE_FAIRY`, and the
  message lookup by type maps 18. The engine compares the stored type with the species' (`ov302/pokedex_search_engine.c:185`,
  `CRITERIA_ANY` 0xff), so it needs nothing.
- **Cheren's call** (`res/text/system/local_tvt_person_chelen_type.txt`, 153 messages): append 18 messages for Fairy
  and each type with it, and index them past 153 for any pair with Fairy. The existing messages also become wrong for
  types now weak to Fairy: every message naming Dragon, Fighting or Dark as one of the Pokémon's types gains "Fairy"
  in its weaknesses where the pair's other type doesn't cancel it. Best: a small tool that writes all 171 messages from
  the chart, so they stay right after any chart edit (step 4).
- **Battle messages:** none mention a type by number.

## 8. Data

### 8.1 Species (Gen 6's Fairy retypes among 1-649)

Verified against `res/pokemon/*/data.json` (old) and Pokeweb's list (`src/pokeweb/romPatchModel.ts:100-123`), which
agree with Gen 6. None has an alternate form; Paper White 2's added species (Applin's line) and forms aren't Fairy.

| # | Species | Now | Gen 6 |
| --- | --- | --- | --- |
| 35, 36 | Clefairy, Clefable | Normal | Fairy |
| 173 | Cleffa | Normal | Fairy |
| 39, 40 | Jigglypuff, Wigglytuff | Normal | Normal/Fairy |
| 174 | Igglybuff | Normal | Normal/Fairy |
| 122 | Mr. Mime | Psychic | Psychic/Fairy |
| 439 | Mime Jr. | Psychic | Psychic/Fairy |
| 175 | Togepi | Normal | Fairy |
| 176, 468 | Togetic, Togekiss | Normal/Flying | Fairy/Flying |
| 183, 184 | Marill, Azumarill | Water | Water/Fairy |
| 298 | Azurill | Normal | Normal/Fairy |
| 209, 210 | Snubbull, Granbull | Normal | Fairy |
| 280, 281, 282 | Ralts, Kirlia, Gardevoir | Psychic | Psychic/Fairy |
| 303 | Mawile | Steel | Steel/Fairy |
| 546, 547 | Cottonee, Whimsicott | Grass | Grass/Fairy |

22 species, each `"types"` in its `data.json`. Gallade stays Psychic/Fighting. Applin's line (Grass/Dragon,
Dragon/Normal...) becomes weak to Fairy through the chart, with no data change.

### 8.2 Moves (decision 2)

Charm (204), Sweet Kiss (186) and Moonlight (236), each `"type": "TYPE_NORMAL"` today in `res/moves/<move>/data.json`.
All status moves (`ATK_DOWN_2`, `STATUS_CONFUSE`, `HEAL_HALF_MORE_IN_SUN`; Moonlight shares Morning Sun's handler,
`move_handlers.c:640`, which doesn't read the type). Retyped, they change their icon and button color, what Conversion
can pick, and what the AI's type loads see. No other Gen 5 move became Fairy.

## 9. Risks

- **Saves:** none from types. Easy Chat words keep their numbers only with the cap (§3.3). The PWT and Medal Box saves
  have no Fairy records, and the fixes of §6.1 keep Fairy out of them.
- **The order of the steps:** a retyped species before §6.1 can corrupt the stack at game clear or a PWT entry. The
  retypes (step 3) come after the guards (step 1).
- **The plain build:** every C change under `#ifdef PAPERWHITE2` (the chart already is). The constant, the text banks
  and the data change both builds' data, as the hack's other data does.
- **OAM and VRAM:** one more preloaded label (8 tiles) on the summary, bag, box and Pokédex entry; one more actor in the
  box. *(inferred)* small; check each screen once.
- **The PMC-era plugins** (wedges, preview) assumed Fairy = 17: their tables move Fairy to 18 (or slot 17), and their
  bounds become the chart's.
- **The trainer AI** sees Fairy only through the chart and type loads; no script change is needed. Smarter play
  (avoiding Dragon moves into a Fairy) already follows from `AICalcDamage`.
- **The new icon member** must be the same kind of NCGR as the others (§5.1).

## 10. Testing

py-desmume with a copy of the user's save (`emulator-testing` memory), the debug menu's Give Pokémon:

- a Clefable: summary info and skill pages, box, bag (a TM's type with Charm retyped is not a TM; check with a test
  move), Pokédex entry, Info → Matchups (Dragon 0×, Poison and Steel 2×, Fighting/Bug/Dark ½×), Pokédex search by
  Fairy, battle HUD wedge, the move buttons' color for Charm;
- in battle: Dragon Claw into Clefable (no effect), Clefable's Charm, a Fairy move's preview color (via a test move or
  Charm's icon only, since there is no damaging Fairy move yet: check the preview with a retyped test move);
- Togekiss using Roost (mono-Fairy, Ground hits it);
- Conversion 2 after a Dragon move (may pick Fairy);
- the Hall of Fame and game clear with a Fairy in the party (save first); the PWT entry with one; Cheren's call about
  Clefable and about a Dragon type;
- `tools/build/verify_dsi_rom.py build/paperwhite2.nds` after the build.

## 11. Build order

0. **Constants and text** (no behavior): `TYPE_FAIRY`, `res/types/fairy.json`, the type banks' message 17, the Easy
   Chat cap, `pokedex_search_main.txt`'s Fairy. Test: the hack build; `PMS_WORD_*` in the generated `pms_words.h`
   unchanged (diff it); the type bank has 19 messages.
1. **Chart and guards:** the 19 × 19 chart (Fairy, plus the Steel change if decided), `GetTypeWeaknesses`, the PWT's
   chart, and every §6.1 fix but Cheren's text. Test: a temporarily retyped species in a scratch build, battle
   matchups, game clear and PWT entry with it.
2. **Icons:** the label member 182 and `033.pal`, `AppMenuCommon_*` mappings, the slot helper, every array of §5.2, the
   button palette 572, the HUD colors, the preview's bound, the Matchups slot 17, the Pokédex search row. Test: every
   screen of §10 with the scratch retype. Placeholder art first; the user's art drops in after.
3. **Data:** the 22 species and the 3 moves (decision 2). Test: §10 in full on a fresh save and on the user's save
   (their caught Marill etc. become Water/Fairy).
4. **Cheren's text** from the chart (a tool) and `pokedex_templates.py`. Test: the call for a Fairy and a Dragon.
5. **Later, separate:** Arceus's Fairy form and the Pixie Plate, Fairy items, new Fairy moves (`moves-and-abilities.md`'s
   Add move), Gen 6 stat changes, a chart editor page.

Record each step in STATUS.md and plugins.md (a "Fairy type" section) as it lands.

## 12. Fairy moves (2026-11-15)

The user's decisions: the Gen 6 Fairy moves that Gen 1-5 Pokémon learn; **no** Misty Terrain (there is no terrain
system), Geomancy or Light of Ruin; no new TM (a tutor instead); the Roseli Berry and the Fairy Gem now, the Pixie
Plate and Arceus-Fairy later; the user draws the item icons.

### 12.1 Research

Gen 6 data, from memory of XY/ORAS (the numbers are well known; a "?" marks what I'm unsure of). Gen 6's "—" accuracy
is the game's 101 (never misses, as Swift). Descriptions in `res/` are our own words.

| Move | Cat. | Pow. | Acc. | PP | Prio. | Target | Effect, flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fairy Wind | special | 40 | 100 | 30 | 0 | one adjacent | none; Protect, Mirror Move |
| Disarming Voice | special | 40 | — | 15 | 0 | adjacent foes | never misses; sound, Protect, Mirror Move |
| Draining Kiss | special | 50 | 100 | 10 | 0 | one adjacent | heals 75% of the damage dealt (Gen 5's `drain` field, a percentage: data only); contact, Protect, Mirror Move |
| Play Rough | physical | 90 | 90 | 10 | 0 | one adjacent | 10% Attack -1; contact, Protect, Mirror Move |
| Moonblast | special | 95 | 100 | 15 | 0 | one adjacent | 30% Sp. Atk -1; Protect, Mirror Move (not ballistic) |
| Dazzling Gleam | special | 80 | 100 | 10 | 0 | adjacent foes | none; Protect, Mirror Move |
| Baby-Doll Eyes | status | — | 100 | 30 | +1 | one adjacent | Attack -1; Protect, Magic Coat, Mirror Move |
| Aromatic Mist | status | — | — | 20 | 0 | one adjacent ally | ally's Sp. Def +1; fails without an ally; not blocked by Protect or a Substitute (?) |

**The next step** (each needs C):

| Move | Data | What it does, and what the engine needs |
| --- | --- | --- |
| Flower Shield | Fairy, status, —, 10 PP, every Pokémon on the field | +1 Defense to every Grass-type Pokémon on the field, both sides (fails if none). A handler on `UNCATEGORIZED_MOVE` over all battlers, Dragon Cheer's per-target loop with a type test |
| Fairy Lock | Fairy, status, —, 10 PP, the field, bypasses Protect | for the next turn no Pokémon can flee or switch (Ghost types too in Gen 6?). A field condition with a 2-turn count and a check where Mean Look's trapping is tested (`BtlServerFlow`'s switch/escape checks); message "No one will be able to run away during the next turn!" (our own wording) |
| Crafty Shield | Fairy, status, —, 10 PP, the user's side, priority +3 | protects the user's side from status moves for the turn (not damaging ones). A side condition like Quick Guard/Wide Guard (`SIDE_CONDITION_*`, their handlers in `move_handlers.c`), keyed on `MOVE_CATEGORY_STATUS` instead of priority/spread |

**Who learns them** (species 1-649; the hack's Applin line learns none). Gen 6 is the source; where Gen 6 gave no
Gen 1-5 learner, a later generation's is used and said. Levels are fitted into the Gen 5 learnsets.

| Species | Move, how | Source |
| --- | --- | --- |
| Clefairy | Disarming Voice 1, Moonblast 50 | Gen 6 (the levels ?) |
| Clefable | Disarming Voice 1, Moonblast 1 (the Move Reminder) | Gen 6 ? |
| Jigglypuff | Disarming Voice 11 | Gen 6 (level ?) |
| Wigglytuff | Play Rough 1, Disarming Voice 1 | Gen 6 (Disarming Voice ?) |
| Marill, Azumarill | Play Rough 23, 25 | Gen 6 |
| Togetic | Fairy Wind 1 | Gen 6 |
| Snubbull, Granbull | Play Rough 37, 43 | Gen 6 |
| Ralts, Kirlia | Disarming Voice 1, Draining Kiss 17 | Gen 7+ (not in Gen 6; levels ?) |
| Gardevoir | Moonblast 1, Disarming Voice 1, Draining Kiss 17 | Moonblast Gen 6; the others Gen 7+ ? |
| Mawile | Play Rough 1, Fairy Wind 6, Baby-Doll Eyes 1 | Play Rough and Fairy Wind Gen 6; Baby-Doll Eyes later ? (the user's suggestion) |
| Cottonee | Fairy Wind 3 | Gen 6 ? |
| Whimsicott | Fairy Wind 1, Moonblast 50 | Gen 6 |
| Eevee | Baby-Doll Eyes 9 | Gen 6 |
| Teddiursa | Baby-Doll Eyes 1; Play Rough as an egg move | Gen 6 |
| Dazzling Gleam (Gen 6's TM99), at the tutor | Clefairy, Clefable, Cleffa, Jigglypuff, Wigglytuff, Igglybuff, Mr. Mime, Mime Jr., Mew, Togepi, Togetic, Togekiss, Marill, Azumarill, Azurill, Snubbull, Granbull, Ralts, Kirlia, Gardevoir, Mawile, Swablu, Altaria, Audino, Cottonee, Whimsicott, Celebi, Jirachi, Cresselia, Arceus (30) | Gen 6, the ones I'm sure of; perhaps also Espeon, Chimecho, Latias/Latios, Roserade, Shaymin, Meloetta, Gothitelle (not given) |

Not given, for the user to decide: **Aromatic Mist has no Gen 1-5 learner in Gen 6** (Spritzee's line only) — it is in
the game and Metronome can call it, but nothing learns it; Disarming Voice for Swablu and Altaria (ORAS ?), Draining
Kiss for the Clefairy line (not in any game I know), Play Rough at a tutor (no Gen 6 TM or tutor; Gen 8's TR list is
wide).

### 12.2 Built

**The moves** (`tools/paperwhite2/moves.py add`, then each record set to §12.1's data), IDs 566-573:

| ID | Constant | Name (12 characters) | Animation | AI effect |
| --- | --- | --- | --- | --- |
| 566 | `MOVE_FAIRY_WIND` | Fairy Wind | Silver Wind | `HIT` |
| 567 | `MOVE_DISARMING_VOICE` | **Disarm Voice** | Hyper Voice | `BYPASS_ACCURACY` |
| 568 | `MOVE_DRAINING_KISS` | **Drain Kiss** | Sweet Kiss | `RECOVER_HALF_DAMAGE_DEALT` |
| 569 | `MOVE_PLAY_ROUGH` | Play Rough | Thrash | `LOWER_ATTACK_HIT` |
| 570 | `MOVE_MOONBLAST` | Moonblast | Moonlight | `LOWER_SP_ATK_HIT` |
| 571 | `MOVE_DAZZLING_GLEAM` | **Dazzle Gleam** | Flash | `HIT` |
| 572 | `MOVE_BABY_DOLL_EYES` | **BabyDollEyes** | Charm | `ATK_DOWN` |
| 573 | `MOVE_AROMATIC_MIST` | **Aroma Mist** | Aromatherapy | `BOOST_ALLY_POWER_BY_50_PERCENT` (Helping Hand's: the ally-targeting one) |

- **Shortened names** (bold; the game's limit is 12 characters): Disarming Voice → Disarm Voice, Draining Kiss → Drain
  Kiss, Dazzling Gleam → Dazzle Gleam, Baby-Doll Eyes → BabyDollEyes, Aromatic Mist → Aroma Mist. The constants and
  folders keep the full names (`moves.py add` makes the constant from the name; the five were renamed after), so a
  longer name later changes only `name`.
- **All data:** none needs C. Draining Kiss's 75% is the record's `drain`; Disarming Voice's 101 accuracy never rolls;
  Baby-Doll Eyes' priority and Aromatic Mist's ally target are fields. No `handlers_like`.
- **The trainer AI** lists Disarming Voice with the sound moves against Soundproof (`basic.s`, under `PAPERWHITE2`).
- **Learnsets** as §12.1's table: 17 species' level-up lists, Teddiursa's egg moves, and **Dazzling Gleam at the
  Lentimas Town tutor** (`res/field/shops/move_tutors.json`: 10 Blue Shards, the menu's last, its 18th move of 32)
  with its bit in the 30 species' `by_tutor`. Lentimas because its tutor teaches the special moves (Hyper Voice, Dark
  Pulse, Dragon Pulse); it comes late in the story, as TM99 did in X and Y.
- **Not done:** Easy Chat words (decision of moves-and-abilities.md §11.8), Aromatic Mist's learners.

**The items** (unused items 123 and 124, `tools/data/rename_constant.py`):

| Item | Data | Battle | Icon (placeholder) |
| --- | --- | --- | --- |
| Roseli Berry (`ITEM_ROSELI_BERRY`, 123) | the Occa Berry's (price 2, ×10: 20; Fling 10; Natural Gift Fairy 60), Berries pocket (`sItemPockets`), sorted after the Chilan Berry; hold effect 147 (Gen 5's new items', none exists for Fairy) | `HandlerRoseliBerry`: `CommonResistBerry(..., TYPE_FAIRY, FALSE)` and the shared "weakened" message; a Berry for `PML_ItemIsBerry` (Bug Bite, Pluck, Harvest, Unnerve, Ripen) and the AI's Natural Gift table | a copy of the Pecha Berry's, `res/items/roseli_berry/icon.png`, `.pal` |
| Fairy Gem (`ITEM_FAIRY_GEM`, 124) | the Fire Gem's (price 20), Items pocket, sorted before the Fighting Gem | `HandlerFairyGemDecide`/`Power`: `CommonGemDecide`/`CommonGemPower` with `TYPE_FAIRY` and `HandlerGemEnd`: ×1.5 once, then consumed | the gems' shared icon (the Fire Gem's) with its own palette, a copy of the Psychic Gem's, `res/items/fairy_gem/icon.pal` |

Their rows in `sItemEventAddTable` are under `#ifdef PAPERWHITE2` (`item_handlers.c`), and its lookup loop runs to
`NELEMS(sItemEventAddTable)` (the original's `0xac`, its 172 rows). Not placed in the world: the debug menu's Give
item (123, 124). Places they could go: the Roseli Berry with the other resist Berries (Route 4/16's Berry spots, a
Pokémon Breeder's gift), the Fairy Gem with the Gems (`effect_encount.c`'s rustling-grass and dust-cloud items, which
pick `ITEM_FIRE_GEM + rand(17)` and would need a case for it, or a hidden item).

### 12.3 Proof (py-desmume, a copy of the user's save; scratchpad `fairymoves/`, shots in `fairymoves/shots/keep/`)

Route 6, the harness of moves-and-abilities.md §15.3 (the lead a Clefable Lv. 24 with its moves and stats written, the
damage roll at 100% and no critical hits). ROM `2ea47e931ae8f0f15ffdd6b1b64f7da608fdd0e5`, `verify_dsi_rom.py` intact.

- **Into a Dragonair Lv. 60:** "Oinkums used Moonblast!" with Moonlight's moon (effect 236), "It's super effective!",
  54 damage; Fairy Wind 24 (Silver Wind's, 318); Dazzling Gleam 44 (Flash's, 148), super effective; Disarming Voice 24
  (Hyper Voice's, 304) with **no accuracy roll**. Its Dragon Tail "doesn't affect" Clefable.
- **Roseli Berry** on the Dragonair: the ratio ×0.5, "The Roseli Berry weakened the damage to the wild Dragonair!",
  "It's super effective!", **27** damage; the next Moonblast **54** (eaten).
- **Fairy Gem** on the Clefable, Moonblast into a Snorlax: "The Fairy Gem strengthened Moonblast's power!", the power
  ratio ×1.5, **27** damage; the next **19** (used up).
- **Against a faster Snorlax:** Draining Kiss 13 damage, **10** healed (25 → 19 in another run: 75%, rounded);
  Play Rough (Thrash's, 37) 37 damage and, its 10% forced, "The wild Snorlax's Attack fell!"; Baby-Doll Eyes (Charm's)
  **before** the Snorlax's Tackle, "The wild Snorlax's Attack fell!", its Tackle 12 → 7; Aromatic Mist in a single
  battle: "Oinkums used Aroma Mist!" and nothing else (no target; Gen 6 says "But it failed!").
- **A double battle** against two Snorlax: Disarming Voice hit both (9 and 10) with no accuracy roll; Dazzling Gleam
  both (16 and 18) after the target screen's confirmation; the Klink's Aromatic Mist on the Clefable: Aromatherapy's
  animation, then the stat rise on the Clefable.
- **Summary:** the four moves with the FAIRY label, PP, power, accuracy and their descriptions (`summary_moves`).
  **Pokédex:** Clefable's Level Up list has Disarm Voice with the FAIRY label (`pokedex_moves`). **Bag:** the Roseli
  Berry in Berries with its icon and description, the Fairy Gem in Items with the pink gem (`bag_items`), given by the
  debug menu (123, 124).
- The plain `w2_us` build's modules all match (`modules.ok`; its archive checks fail as before);
  `test_moves_abilities` passes (21). The editor is unchanged.
- **Noticed:** the Pokédex Info opened from party slot 0's summary listed slot 3's learnset (a Swinub's) after slot 0's
  species was changed in memory; with slot 3 changed too it listed Clefable's. A test artifact or a bug in what the Info
  page reads; not chased (the other session's Pokédex work).

### 12.4 Built: Flower Shield, Fairy Lock, Crafty Shield, the Pixie Plate and Arceus's Fairy form (2026-11-15)

**The moves** (`moves.py add`, then each record set to Gen 6's data), IDs 574-576, all Fairy, status, never miss, 10 PP:

| ID | Constant | Name | Data | Animation | AI effect |
| --- | --- | --- | --- | --- | --- |
| 574 | `MOVE_FLOWER_SHIELD` | **FlowerShield** | quality `SPECIAL`, target `MOVE_TARGET_ALL` (Perish Song's: every Pokémon, the user too), bypasses a Substitute, not Protect's | Growth | `DEF_UP` |
| 575 | `MOVE_FAIRY_LOCK` | Fairy Lock | quality `FIELD`, target `FIELD`, Mirror Move | Imprison | `PREVENT_ESCAPE` |
| 576 | `MOVE_CRAFTY_SHIELD` | **CraftyShield** | quality `SIDE`, target `USER_SIDE`, priority +3 | Wide Guard | `QUICK_GUARD` |

Two names shortened to 12 characters (bold); the constants and folders keep the full names; the messages say "Flower
Shield", "Crafty Shield" in full. The C (`paperwhite2_battle.c`, rows under `#if defined(PAPERWHITE2) && defined(MOVE_X)`):

- **Flower Shield** (`HandlerFlowerShield`, `UNCATEGORIZED_MOVE`): of its targets, every Grass type gets Defense +1 in one
  stat change; with none, "But it failed!" (the server's, as Dragon Cheer's).
- **Fairy Lock** (`HandlerFairyLock`, `FIELD_EFFECT_MOVE`, Gravity's shape): a new field condition,
  `FIELD_CONDITION_FAIRY_LOCK` (8, `include/constants/battle.h`; `btl_field.c`'s `FIELD_EFFECT_COUNT` 9 under the hack),
  for 2 turns (the turn it is used and the next, whose choices it locks), with "No one will be able to run away during
  the next turn!" (bank 19's `NoOneCanRunAway`); it fails while the field is locked. Checked where trapping is:
  the clients' `IsMonTrapped` (`btl_client.c`: the switch, the escape and the AI's switch, `TRAP_CONDITION`, so the game's
  own "can't be switched out" and "can't escape" messages), the server's escape check (the field effect's handler on
  `CHECK_ESCAPE_BLOCKED`, `field_handlers.c`'s row) and Teleport (`HandlerTeleportCheckFail`). **Gen 6's rules:** Ghost
  types are not trapped (`PaperWhite2_IsFairyLocked`); Shed Shell, Run Away and the Smoke Ball still work (the original
  checks come first); U-turn, Baton Pass, Roar and switches after a faint aren't blocked. No end message (Gen 6 has none).
- **Crafty Shield**: a new side condition, `SIDE_CONDITION_CRAFTY_SHIELD` (14; `side_handlers.c`'s `NUM_SIDE_EFFECTS`
  15 under the hack), for the turn, with "Crafty Shield protected your team!" / "…the foe's team!" (bank 19, a side
  message in `btl_string.c`'s `sSideMessages`). Its side handler on `CHECK_NO_EFFECT` (Quick Guard's, keyed on the
  category): a status move on one of the side's Pokémon has no effect, "Crafty Shield protected [it]!" (bank 18, three
  variants), except a move a Pokémon uses on itself and one that targets every Pokémon (Perish Song, Flower Shield);
  allies' status moves are blocked too (Showdown's Gen 6). Damaging moves hit. It fails when its user moves last, but
  never for being used in a row (Gen 6's). **Metronome can call it** (Gen 6 excludes it, as this game does Quick Guard
  and Wide Guard: add it to `sMetronomeExcludedMoves` if wanted).
- **Learners:** none. Among species 1-649 no Gen 6 learner of any of the three is known to me (Flower Shield: the
  Flabébé line; Fairy Lock: Klefki; Crafty Shield: Spritzee's and Klefki's lines, roughly): the user's pick. They are in
  the game, Metronome calls them, and the editor can give them.

**The Pixie Plate** (`ITEM_PIXIE_PLATE`, unused item 125, `rename_constant.py`; items.md): the Mind Plate's data
(price 100, Fling 90) with hold effect 147, sorted with Pink Scarf (90). Held: Fairy moves ×1.2
(`HandlerPixiePlate`, `CommonTypeBoostingItem`, a row in `sItemEventAddTable`); Judgment Fairy (a case in
`HandlerJudgement`); Arceus's type Fairy (`PML_ItemGetArceusPlateType`, which `PKM_PARAM_TYPE1/2` read for a
Multitype Arceus, so the summary, the battle and every type reader follow); a plate for `IsArceusPlate` (Trick, Knock Off,
Thief and the like can't take it from Arceus). Icon: the plates' shared one with its own palette, a copy of the Mind
Plate's (`res/items/pixie_plate/icon.pal`, `ITEM_ICON_PALETTE_PIXIE_PLATE`). Not placed in the world; the debug
menu's Give item (125).

**Arceus's Fairy form is form 17**, not 18: Arceus's form is its plate's type (`PokeList_UpdateArceusForm`,
`Box2Main_PokeItemFormChange`), which would make Fairy (type 18) form 18 and leave form 17, `TYPE_NULL`'s, a dead form
with its own palettes. `PaperWhite2_GetArceusPlateForm` (`poke_tool.c`, `pml/poke_party.h`) gives the type but 17
(`ARCEUS_FORM_FAIRY`) for Fairy, and both callers use it; it is also Gen 6's number. Made with **Add form**, which now
takes palette-only species (`pokemon_form.py add arceus --from 13 --name Fairy`): `forms.count` 18, `pokedex.forms`
"Fairy" (Arceus's forms aren't in the Pokédex's form list, as before), `form_17/normal.pal` and `shiny.pal` (copies of
the Psychic form's, form 13), followers `arceus_form_17` and `_shiny` (copies of the Psychic form's). The palettes:
Arceus's 16 form pairs end where the hack's form groups start (15,065), so the hack's palette-only forms follow its
added species' groups, at `PAPERWHITE2_PALETTE_FORM_FILES` (15,185 now, generated by `pokemon_forms.py`);
`form_groups.palette_form_groups` lays them out, `pokemon_graphics.py` appends them, and `GetPokemonDataIDBase`
(`pokegra.c`) reads a palette form from `POKEMON_FORMS_ORIGINAL_PALETTE_FORMS` (16) there. Arceus's icon is one for all
forms (the original's), so it needs nothing. The musical reads Black and White's personal data, where form 17 is past
the count, so it shows Normal Arceus there.

**Placeholders for the user:** the Pixie Plate's icon palette (`res/items/pixie_plate/icon.pal`), and Arceus-Fairy's
palettes `res/pokemon/arceus/form_17/normal.pal` and `shiny.pal` (the Psychic form's pinks now) and its follower
sprites (`res/field/actors/followers/arceus_form_17*`, the Psychic form's).

**Proof** (py-desmume, a copy of the user's save, Route 6; scratchpad `fairymoves2/`, shots in `fairymoves2/shots/keep/`;
the user asked for light testing here):

- **Flower Shield**, a Bulbasaur against a wild Oddish: "Oinkums used FlowerShield!", Growth's animation, one stat
  change of Defense +1 for both, the user's and the foe's (`StatChange stat 2 change 1 mons [0, 12]`), "Oinkums's Defense
  rose!"; a Clefable using it against an Oddish raised only the Oddish (`flower_shield_*`).
- **Fairy Lock**: "No one will be able to run away during the next turn!" (bank 19's 206); then Pokémon, Klink, Shift:
  "Oinkums can't be switched out!" on the lower screen, and the choice stays open; the same steps without Fairy Lock
  switched ("Oinkums, switch out! Come back!", "Go! Klink!") (`fairy_lock_*`, `control_switch_without_fairy_lock`).
- **Crafty Shield**, a slower Clefable against a wild Pikachu's Thunder Wave: Crafty Shield first (priority), "Crafty Shield
  protected your team!", then "The wild Pikachu used Thunder Wave!", "Crafty Shield protected Oinkums!" (set 0x48d), no
  paralysis (`crafty_shield_team`).
- **Arceus** (form 17, Multitype, the Pixie Plate): the summary's Type FAIRY, the Pixie Plate as its item, the form's
  palette (the Psychic form's copy) on the summary and in battle; Judgment into a Dragonair: the power ratio ×0x1333
  (1.2), "It's super effective!" (`arceus_fairy_summary`, `arceus_fairy_judgment`).
- ROM `b9835c5102e305630eeb6f3b0d7c8defba196b83`, `verify_dsi_rom.py` intact; the plain `w2_us` build's code modules
  match (its archive checks fail as before); `test_moves_abilities` passes (21); the editor's `npm test` 219 of 220 (the
  known Applin back-rig failure).

**The skipped cases, tested** (2026-11-15, the same harness from Route 6, scratchpad `fairytest2/`; the battles set up by
memory writes to the party and the wild Pokémon, logged by hooks on the server's and the clients' functions, read from
the screens):

- **Fairy Lock** (Clefable, its moves written; a wild Snorlax using Splash): blocked a switch in the next turn
  (`CanMonSwitch` → `TRAP_CONDITION`, the lock active), and after a Tackle that turn, the switch the turn after worked
  ("You're in charge, Klink!", the lock read as inactive); Run in the next turn: "Can't escape!", then "Got away safely!"
  the turn after. **Under the lock:** a Gengar (its species written) fled ("Got away safely!": the field handler ran and
  let it) and switched; a Run Away holder fled (its popup), a Smoke Ball holder fled ("…fled using its Smoke Ball!");
  U-turn hit and brought Klink in from the party screen, Baton Pass passed to Klink ("Go! Klink!"), Roar ended the
  battle; Teleport failed ("But it failed!"; without the lock it fled).
- **Shed Shell didn't work, under Fairy Lock or without it — an original bug, fixed.** A Shed Shell holder in the lead
  got "can't be switched out!" with no trap at all, and under Mean Look. Cause, read from hooks: `CanMonSwitch`'s Shed
  Shell branch returns `TRAP_NONE` without setting `trapMonId`, and `BattleClient_ActionSwitchPokemon` passes
  `trapMonId == the switcher's ID` to the party list as "can't cancel", whose `BPlistMain_GetSwitchError` then answers 6,
  "can't be switched out"; the slot held a stale 0, the lead's ID. `btl_client.c` is complete (matching), so the
  original has the read. Fixed under `BUGFIX` or `PAPERWHITE2` (`// BUG:`): the branch sets `trapMonId` 31 and the
  ability 0, as the other `TRAP_NONE` path does. After it: Shed Shell switched with no trap, under Mean Look and under
  Fairy Lock (`trapMonId after 31`, "Go! Klink!").
- **Crafty Shield** (a slower Clefable, a wild Pikachu): Thunder Shock hit through it (30 HP); Perish Song went through
  ("Oinkums's perish count fell to 3!"); Spikes were laid on the shielded side. Double battle, Clefable's Crafty Shield and
  Klink's Swords Dance against two Pikachu's Growl: "Crafty Shield protected Oinkums!" and "…Klink!" for both Growls,
  and Klink's own Swords Dance went through (its animation, the server's stat change on Klink). Used last (the faster Pikachu's own Crafty Shield first, "…protected
  the foe's team!"): "But it failed!".
- **Flower Shield** with no Grass type (Clefable against Snorlax): "But it failed!". Double battle, Clefable's Flower
  Shield with a Chikorita ally against two Oddish: one stat change for the Chikorita and both Oddish
  (`mons [1, 12, 13]`), not the Clefable.
- **The Pixie Plate in the party screen** (Klink's slot written to a Multitype Arceus, form 0; the plate from the debug
  menu's Give item): Item > Give > the Pixie Plate: "Klink was given the Pixie Plate to hold.", the data's form 17
  (read from the party), the party icon and summary: Type FAIRY, the Pixie Plate, the form's palette. Item > Take:
  "Received the Pixie Plate from Klink.", form 0, the summary's Type NORMAL and the white palette.
- ROM `408855c6…` before the fix, `48cd0862…` after it (the Shed Shell, U-turn and Crafty Shield double runs on
  this one); `verify_dsi_rom.py` intact.
- **Still not run:** the PC's give and take (`box2_main.c`, the same `PaperWhite2_GetArceusPlateForm`), the Pokédex.
