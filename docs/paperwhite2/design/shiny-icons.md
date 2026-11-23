# Shiny party/box icons from the three shared icon banks (experiment, 2026-11-22)

Analysis only: nothing in `res/`, `src/` or the tools changed. Scripts and outputs are in the cloud session's
scratchpad (`.../scratchpad/shinyicons/`: `analyze.py`, `report.py`, `render.py`, `diag.py`, `bank4.py`, `free.py`,
`calib.py`); the contact sheets are in `C:\Modding\Pokemon ROM Hack Workspace\Pokemon Paper White\shinyicons\`.

**The question.** Party/box icons (`icon.png`, `icon_female.png`, 32×64, two frames) are drawn in one of the three
16-colour banks of `res/pokemon/shared/icon_palettes.pal` (`sPokeIconPalettes`, `src/system/poke_icon.c:45`; the
box's `icon_palettes_box.pal` has the same three banks plus a grey fourth). The idea: give a shiny a copy of its
icon re-indexed onto whichever of the three banks best fits its battle shiny colours, so shinies get a different icon
without any new palette.

## 1. Method

For each of the 728 icons with battle palettes (665 species, 60 sprite forms, 3 female icons; Arceus' palette-only
forms have no icon of their own; one of the 729 icons has no battle palettes and was skipped):

1. **The icon's bank** is read from the icon PNG's palette (it holds its bank's colours, as `icon_bank` in
   `tools/data/pokemon_graphics.py` reads it).
2. **Each icon colour gets a battle normal index.** I tried two ways:
   - **E**: the follower remap's method E (`follower-palette-remap.md`), unchanged, with the icon as the "sheet".
   - **G (guided, used for the results)**: frame 0 of the icon is laid over `front_single.png` by bounding boxes
     (mirrored if that agrees better), and each icon colour takes the battle index that is close in colour *and*
     where its pixels fall: cost `dE - 6 * log p(index | icon colour)`. E's neutral rule (neutrals go to neutrals)
     applies, and strong icon colours (chroma 15 or more) keep their hue family. Then F's per-pixel pass picks among
     look-alike battle indices, so one icon colour can split.

   Why G: the shared banks are generic colours, so matching by colour alone often finds the wrong role. Dragonite's
   orange body is brown in its icon, and E matched it to the belly's tan, which stays tan in the shiny, so E's shiny
   Dragonite stayed orange. G matches it to the body, which turns green. G also gets Eevee's silver, Metagross's
   silver and Rayquaza's black. It is worse on a few, such as Snivy, and doesn't change the overall picture.
3. **Targets.** Each (icon colour, battle index) pair targets the battle shiny colour plus the icon's offset from the
   battle normal colour, in OKLab: all of the lightness offset, half of the tint offset. This keeps the icon's own
   shading. Taking the shiny colour as is would flatten the icon's two shades of one part into one.
4. **Fitting a bank.** Targets within 3 dE are pooled. Then a Hungarian assignment runs over the bank's 15 colours,
   each offered three times, with a merge penalty (6 dW per square-root pixel) on the copies. The cost per pixel
   group is `sqrt(pixels) * dW`, plus F's rules: a neutral target pays for a tinted colour, a coloured one pays for a
   hue change and for losing chroma. The bank with the lowest cost wins, and the icon's own bank gets an 8% discount,
   so nothing changes when nothing needs to.

## 2. Results

### 2.1 Scoring, and why the numbers are soft

Colour error against the targets is small everywhere: median 5.3 dE, p90 9.1. It doesn't tell whether the icon
reads as the shiny, because the targets themselves come from a loose icon-to-battle colour map. So I scored icons
against the battle sprite's colours directly. For each image I built a colour histogram, outlines left out (12 hue
bins plus 3 neutral bins), and measured:

- **gain**: how much closer the shiny icon's histogram is to the battle shiny's than the normal icon's is;
- **icon shift**: how much the icon changed;
- **battle shift**: how much the battle shiny differs from the normal.

The classes:
- **good**: gain at least 0.12 and icon shift at least 0.2;
- **fair**: gain at least 0.05 and icon shift at least 0.1;
- **subtle**: battle shift under 0.12;
- **poor**: the rest.

Calibration against 60 icons labelled by eye:
- Of 39 that read as the shiny, 31 are classed good and 5 fair.
- Of 11 that fail, 8 are classed poor.

On the 30-species key sheet the classifier is much harsher than the eye: it calls Magikarp, Tepig, Dipplin and
Volcarona poor, and they read fine. So treat the automatic counts as a lower bound, and the eye counts below as the
estimate.

### 2.2 Counts (728 icons)

| | good | fair | poor | subtle |
| --- | --- | --- | --- | --- |
| **three banks** (classifier) | 294 | 118 | 271 | 45 |
| three banks, a fourth shiny bank added (classifier) | 316 | 117 | 250 | 45 |
| own palette per shiny, no bank constraint (classifier; the slot-cache upper bound, section 3) | 457 | 116 | 110 | 45 |

**By eye** (the honest number):

| Sheet | reads as the shiny | partly | fails | subtle shiny |
| --- | --- | --- | --- | --- |
| random 30 (seed 11) | 18 | 3 | 6 | 3 |
| key 30 | 18 | 7 | 4 | 1 |

Extrapolated to all 728, the three banks give about 60% readable shiny icons (about 440), about 10% partial (about
75), and about 20% that fail (about 145). The other 10% have a battle shiny too subtle to show at icon size.

Other figures:
- **Banks chosen:** 315 to bank 0, 238 to bank 1, 175 to bank 2. 479 keep their own bank, re-indexed.
- **No change:** only 29 shiny icons come out identical to the normal one and would need no file.

### 2.3 Contact sheets

Each row: label (bank change, class, gain and icon shift, target error) | normal icon | **proposed shiny icon (three
banks)** | the same icon with its own derived palette (the slot-cache alternative) | battle normal | battle shiny.
Icons are at 3x and battle sprites at 1x, on grey.

- `key_shiny_icons.png`: the 30 requested species.
- `worst_shiny_icons.png`: the 30 worst by the classifier.
- `random_shiny_icons.png`: 30 random.

Each has a `.txt` listing.

Key sheet by eye:
- **Read well:** Charizard (black), Rayquaza (black), Umbreon (blue rings), Lucario, Zekrom (teal), Dipplin (gold),
  Krokorok, Eevee (silver), Tepig (yellow), Sableye (gold), Magikarp (gold), Mewtwo (green tail), Zoroark (purple),
  Haxorus (black), Chandelure (orange), Volcarona (gold).
- **Partly:** Gyarados (magenta rather than red), Metagross, Reshiram, Snivy, Jynx, Ditto (teal for light blue),
  Lapras, Dragonite (dark green).
- **Fail:** Pikachu (bank yellow, no orange), Hydreigon, Butterfree, Oshawott.
- **Subtle:** Gengar and Garchomp, whose shinies barely change.

### 2.4 Poor-fit patterns

Measured (`diag.py`): the banks' colours are rarely the limit. Only 8 icons have shiny colours that no single bank
covers within 12 dE (2 blue, 2 pink, 2 purple, 1 green, 1 red). Of the 196 poor icons with a measurable battle
shiny, the classifier gives these causes:

- **Changed, but not toward the shiny (124):**
  - Bank combinations: the shiny needs colours from two banks. Hydreigon needs bank 2's magenta fur and bank 1's
    green body, Gyarados picks magenta over red, and Treecko comes out red. No bank holds both a green and a purple,
    or an orange and a cyan.
  - Generic icon colours: an icon colour matched to the wrong battle role. Golbat and Toxicroak go white instead of
    green or teal.
- **Barely changed (67):**
  - The shiny changes a part that the icon draws in a shared, generic colour, or that is a few pixels at icon size:
    Banette, Gothitelle, Bastiodon, Pupitar, Lairon, Chinchou, Solrock, Dusknoir, Oshawott.
  - Small shifts, such as Pikachu's yellow to orange, fall inside one bank colour's reach, so the icon keeps that
    colour.
- **The palette has no such colour (5).**

By hue, the failed targets are spread out, led by purple, pink, blue and green: purple 38 icons, pink 36, green 33,
blue 27, yellow 27, red 23, cyan 20. That matches the banks' gaps: bank 0 has no green, bank 2 has no green and no
orange, and only bank 1 has greens, but it has no blue or purple.

The classifier also flags some that read fine by eye: most Unown forms (blue), Kyogre, Sealeo, Quagsire, Furret,
Murkrow, Vaporeon, Darkrai and Sharpedo all turn the right pink, magenta or blue.

**Choosing the bank by the histogram** instead of the colour cost gives classifier counts of 356 good, 134 fair and
193 poor. This is partly circular, and by eye it's about one icon better on the random 30 (Swellow and Relicanth
better, Claydol worse). It isn't worth the extra step.

## 3. Alternatives and their costs

| | ROM | Runtime | Quality |
| --- | --- | --- | --- |
| **A. Shiny icon images on the three banks** (this experiment) | Every shiny icon is a new char member in `a/0/0/7`: 1,072 B each, uncompressed like the originals. About 700 icons differ, so about 750 KB. One table gives each icon slot its shiny member and bank (about 2 B per slot, about 1.5 KB) | None. No new palettes or OBJ slots: `PokeIcon_GetFileOfPkm` and `PokeIcon_GetPaletteOfPkm` return the shiny member and bank when the Pokémon is shiny, which covers the 12 files that use the `Pkm` functions (party, box and others) everywhere, a box full of shinies included. The 26 files that call `PokeIcon_GetPalette(species, form, sex, egg)` have no shiny flag and would need one, screen by screen | About 60% read, 10% partial, 20% fail (eye) |
| B. A 4th shared bank for shinies (a 5th, ...) | 32 B per bank in each of the two bank files, plus the same images as A | Every one of the about 35 screens that loads the bank file gets one more OBJ palette slot used, and the slots after it move. Each screen's slot layout needs an audit, a risk for little gain | Measured with a 4th bank built from the failing shinies' colours (11 medoids plus 4 neutrals): 22 more good and 21 fewer poor icons (+3% of icons). The bottleneck is the mapping and the bank combinations, not hues missing from the set |
| C. Own palette per shiny, the slot cache (`shiny-palettes.md` 1.4, 4.3) | One derived 16-colour NCLR per icon slot and variant (72 B, about 54 KB for one variant). No new images: the icon keeps its pixels | `PokeIconPalCache` per screen, with free OBJ slots. The party list has 4 slots, the in-battle party list 6 and the PC box 3, so a box with more distinct shinies than that falls back to normal colours past the third. Other screens stay normal unless each is changed | Classifier: 457 good, 110 poor (against 294 and 271 for A). By eye on the sheets' third column, clearly better (Pikachu orange, Dragonite and Hydreigon green, Ditto blue, Lapras purple, Banette, Golbat, Minccino, Toxicroak right). Its limit: one colour per icon index, so F's per-pixel split is lost (rarely visible at 32×32) |

## 4. Recommendation

- **If shiny icons should look right where they're seen most (party, battle party list), use C, the slot cache.**
  It's the better result (63% good by the classifier, against A's 40%), it costs about 54 KB rather than about
  750 KB, and the per-icon palettes are already designed in `shiny-palettes.md` 1.4. Its weak spot, a box of many
  shinies, falls back gracefully to normal colours.
- **If shiny icons should show everywhere with no slot management, A works for about 6 in 10 species as generated.**
  The rest would need a review pass: a per-icon override of the map, as `icon.json` in `shiny-palettes.md` 1.4, or
  of the bank. Budget about 750 KB of ROM.
- A and C can be combined later: C where a screen has the cache, A's images as the fallback elsewhere. That costs
  both ROM budgets.
- **Don't add shared banks (B).** The measured gain is about 3% of icons, against an OBJ-slot audit of about 35
  screens.
- **Either way, map icon colours by placement as well as colour** (G here), because the banks' generic colours make
  a colour-only map pick the wrong role. A follow-up, untried: align the icon with the battle sprite more precisely
  than by bounding boxes. Poses differ, and the box match is crude for sprites like Dragonite's.

This needs the user's look at the sheets before any choice; the playtest note in memory applies to tuning.

## 5. Can a box show 30 icons with a palette each? (research, 2026-11-22)

Measured in py-desmume on the current hack build with a copy of the user's save, PC box open (Castelia Center's PC),
and from the code. Scripts: `.../scratchpad/iconpal/` (`hw.py` dumps VRAMCNT, DISPCNT, OBJ palettes, OAM and OBJ
VRAM; `hooks_box.py` logs `GX_LoadOBJPltt` and `GFL_VRAMManagerAlloc` while the box opens).

**The box's hardware** (`ov255/box2_main.c: sVramBanks`, confirmed by VRAMCNT): A main BG, B main OBJ (128 KB, 1D
128K mapping), C sub BG, D sub OBJ, no 3D. **E, F, G, H and I are unmapped** (LCDC); DISPCNT has no BG or OBJ
extended palettes on either engine. The tray (icons) is the main engine, on the touch screen.

**Main OBJ palette rows** (the loads and the cells that use them): 0-2 file 72 (box UI), 3-6 the icon banks and the
search grey, 7 file 70, 9-11 the touch bar (its cells use palettes 0-2 only), 13 the held item, 14 the markings.
**Free: 8, 12 and 15** (12 and 15 hold leftovers of whole-file writes, but no cell uses them). This confirms the
slot cache's three.

**Main OBJ VRAM**: one GFL VRAM manager, contiguous allocations from 0x200 to 0x12F80 (124 resources, 75.9 KB),
**52 KB free** at the top; nothing more is allocated while the box runs (switching boxes, the box list). The icon
actors are 66 (30 tray + party + scrolling tray), each a 512-byte 4bpp char of file 75 (96 of those are loaded).
**The box already draws 8bpp OBJs**: the box list's tray thumbnails (`trayIconChar`, 32x32 8bpp, cell 73, palette
0), coloured with indices 0x10-0x2F of the normal 256-colour OBJ palette (file 72's rows 1-2).

### 5.1 Routes

- **8bpp icons with OBJ extended palettes (feasible, the one that scales).** Map **G** (or F) as main OBJ extended
  palette (`GX_VRAM_OBJEXTPLTT_0_G` in `sVramBanks`; the game does this elsewhere: ov143 uses F, gtsnego bank I, and
  `arc_util.c`/`palanm.c` load and fade OBJ extended palettes). 16 palettes x 256 colours = 256 icon palettes, so a
  box of 30 shinies plus the party and the held icon all get their own. What it takes:
  - Extended palette 0 must carry file 72's rows 0-2 too, since the tray thumbnails (8bpp, palette 0) switch to it.
    Icons use the other bands: pixel = band * 16 + index (0 stays 0), OAM palette = the extended palette.
  - Icons convert at load time from the 4bpp char (512 B to 1,024 B; no ROM images). `TransferIconChar` and
    `Box2Obj_LoadTrayPokeIcons` write 0x400; file 75's placeholders become 1 KB; the icon cell needs an 8bpp copy
    (attr0 bit 13) in place of `PokeIcon_GetCellFile_Main()` for the box.
  - VRAM: 66 icons x +512 B = +33 KB, inside the 52 KB free (about 19 KB left; doubling all 96 file-75 chars would
    leave 4 KB). Palette writes need the bank briefly in LCDC (`GX_BeginLoadOBJExtPltt`), best in VBlank.
  - `ClAct` takes the actor palette as `location / 32 + n`, so a palette proxy is not needed: write the bands
    directly and set the OAM palette with `ClActor_SetPalette`. The box search (`box_search_graphic.c`) remaps F as
    texture palette, so use **G**, and remap it on return (`Box2Main_InitVramBanks`).
  - Effort: about 2-3 days in ov255 (VRAM config, ext palette 0 copy, conversion, cell, char size, a per-tray band
    allocator, the held/moving icon, search grey as a band), plus an emulator and hardware check. Risk: 8bpp
    placeholders the box writes elsewhere (the moving icon, `Box2Obj_SetTrayPokeIcon`), and other 8bpp OBJs.
- **Slots only (the slot cache):** 3 rows in the box (8, 12, 15), 4 in the party list (12-15, from the code), 6+ in
  the battle party list. Cheap, but the box falls back past 3 distinct shinies.
- **Per-row HBlank swaps: not worth it.** The tray has 5 rows of 6 at a 24 px pitch and the icons are 32 px tall, so
  neighbouring rows overlap by 8 px (a swap mid-overlap recolours the row above), the held icon moves freely, and 3
  free rows x 5 still gives only 15. Needs an HBlank DMA table per frame.
- **Palette animation / time-sharing:** no; icons are on screen at the same time.

### 5.2 The other icon screens

| Screen | Engine | OBJ rows free | Extended palette possible |
| --- | --- | --- | --- |
| Party list (`ov165/plist_sys.c`) | main, B 128K | 12-15 (4) | Yes: G free (D, F are 3D); 6 icons, slots suffice |
| Battle party list (`ov287`, battle's `ov167/btlv_core.c` banks) | sub, I 16K | 6, 7, 10-15 | No: the sub engine's only OBJ extended bank is I, which is its OBJ VRAM; slots suffice |
| Summary (`ov207`) | | | Shows no party icons (no `PokeIcon` use) |

### 5.3 Six shared banks instead of three

The icon's bank is a nibble per icon in `sPokeIconPalettes` (`poke_icon.c`), so 0-5 fits with no format change;
`PokeIcon_GetPalette*` return it and each screen calls `ClActor_SetPalette(actor, bank, mode)` against a resource
loaded at its base row, so a bank is row = base + bank.
- **The palette file**: `icon_palettes.pal` is 48 colours (3 rows) and `ClActSys_LoadPlttEx/LoadPltt` load the
  whole file. A 6-row file writes 3 more rows at base + 3..5 on all 35 screens (the `PokeIcon_GetPaletteFile`
  callers), clobbering or being clobbered by whatever sits there. Each screen needs an audit and many a new layout.
- **The box** has exactly 3 free rows (8, 12, 15), not contiguous with 3-6, so 3 more banks need three one-row
  loads there and a bank-to-offset map in `GetPokeIconPalette` (bank 3 to row 8, etc.; the grey stays at 6). That
  uses the box's last free rows: no slot cache on top. The party list's 3 extra rows go to 12-14 the same way.
- **Normal or shiny only**: if normal icons move to banks 3-5, all ~35 screens must load 6 banks or those icons show
  wrong colours. If only shiny icon images (option A) use 3-5, only the screens that show shinies need them (box,
  party, battle party list), and the rest show normal icons on 0-2. Cost: the three screens, about a day; for normal
  icons, the 35-screen audit (several days, with emulator checks per screen).

**Recommendation.** For per-individual shiny icons in the box, **8bpp + extended palette G** is the only route that
reaches 30+ and is a contained ov255 change; the party list can take the slot cache (or the same G route), the
battle party list slots. If three new shared banks are preferred, keep them for shiny icon images only (box, party,
battle party list), loaded per row in the box; it costs every free box row.

## 6. One icon per species with its own palette on every screen? (research, 2026-11-22)

The question: drop the three shared banks entirely, keep **one icon image per species-form re-indexed onto its
battle palette** (`normal.pal`, `shiny.pal` for a shiny), and have every screen that shows icons give each visible
icon its own 16 colours. Then no screen may be left on the banks: an unconverted screen would draw battle-palette
indices with bank colours (garbage).

Measured in py-desmume on the current hack build with a copy of the user's save (Pokédex filled with the debug menu's
Fill Pokédex), from the code otherwise. Scripts and states: `.../scratchpad/iconscreens/` (`drive.py`, `steps.py`,
`hw.py` as section 5's, `survey.py` lists every icon loader with its row and the overlay's VRAM table).

### 6.1 Facts that hold for every screen

- **Every icon screen reserves 3 OBJ rows for the banks** (`PokeIcon_GetPaletteFile` loaded whole). Dropping the
  banks frees those 3 rows, so **a screen showing at most 3 icons at once is always easy**: each icon takes one of
  them. 4-6 icons need 1-3 more free rows; more need an extended palette.
- **OBJ extended palettes apply only to 8bpp OBJs** (4bpp OBJs always use the standard rows). So the extended route
  means converting the icon to 8bpp at load (pixel = band × 16 + index, 0 stays 0: 512 B to 1 KB per frame pair, no
  ROM images) and an 8bpp copy of the icon cells (attr0 bit 13, tile numbers doubled), 2 new `a/0/0/7` members.
  Banks: main engine **F or G**, sub engine **only I**, so a sub screen whose OBJ VRAM is I (16 KB) can't have them.
- `ClActSys_LoadPltt*` already writes to extended palettes (`src/gfl/clact.c`: an offset of 0x200 and up is
  extended, the bank put in LCDC around the write), but the per-icon palettes are better written directly (VBlank,
  `GX_LoadOBJPltt` / the extended bank in LCDC): **a ClAct palette resource per icon would use the screen's palette
  slots**, which are sized per screen (`plttCount`).
- **ClAct character slots don't change**: an 8bpp icon is still one character resource (twice the bytes), and an
  extended palette isn't a ClAct resource at all. Icons load when shown or scrolled in, not every frame.
- 26 files call `PokeIcon_GetPalette(species, form, sex, egg)` with no shiny flag; for normal icons they need only
  the species-form's `normal.pal`, for shinies a flag added screen by screen (as section 3 said).

### 6.2 The two Pokédex cases (measured)

**Pokédex list (ov299, `pokedex_list_obj.c`).** VRAMCNT A main BG, B main OBJ, C sub BG, D sub OBJ; **E, F, G, H, I
unused** (LCDC). A pool of 16 icon actors per screen (`POKEDEX_LIST_ICON_COUNT`), refilled as rows scroll in.
- Bottom (main, touch screen): **8 icons visible** (rows 008-014: OAM rows 4/5/6 hold 1+3+4 icons; up to 9 mid-scroll).
  Rows: 0-3 list UI (file 53), 4-6 banks, 7-10 touch bar (4-row file, cells use 7-9), 11/12 the shown Pokémon's
  sprite (double-buffered, `MON_PALETTE_OFFSET`). Free: 13-15. Without banks: 4-6, 13-15, likely 10 = **7 < 8**.
- Top (sub): up to 7 icons (6 rows + OBJ-window copies, which take no colours); **only rows 0-2 are used**, so 13
  rows free: standard rows suffice.
- **Route:** top: rows. Bottom: **8bpp + main OBJ extended palette in G** (16 icons × +512 B = +8 KB of main OBJ
  VRAM; B's top 17 KB was untouched in the dump). About 1 day. (Alternative without 8bpp: a row per *visible* icon,
  reassigned as rows scroll, from 7 rows: fails by 1-2 rows at the bottom edge, not worth it.)

**Info page, Evo tab, Eevee (8 icons).** The hack's Info VRAM (`pokedex_detail_graphic.c`'s `PAPERWHITE2` table,
confirmed by VRAMCNT: A main BG, G main BG ext palettes, B textures, F texture palettes, C sub BG, **D sub OBJ
128 KB**, E main OBJ 64 KB, **H and I off**). The strip is on the sub engine (the bottom screen on this page).
- Sub OBJ rows: 0-2 Matchups' type icons, 3 cursor, 4 knob, 5-7 Evo's banks, 8-10 touch bar, up to 13 coloured; **14
  and 15 free**. While Evo shows, OAM uses only 5-7 (the icons) and 8 (touch bar).
- Families over 5 members: only Eevee's (8). Wurmple 5, Tyrogue and Ralts 4, the rest 3 or fewer.
- **Route A, extended palette I** (I is free here): map I as `GX_VRAM_SUB_OBJEXTPLTT_0_I` while Evo shows, convert
  the 8 icons to 8bpp into Evo's one character resource (8 × 0x800 = 16 KB of D, which had about 86 KB free), one
  band per icon. Evo's palette resource can go (3 ClAct resources become 2). About 1 day; fades of this page are
  palette fades of the standard rows, so the icons need the bands faded too or the strip hidden during them.
- **Route B, standard rows:** 5-7 + 14-15 = 5 rows fits every family but Eevee's; for 8, take 0-4 too while Evo
  shows (type icons, cursor and knob aren't drawn then) and restore those 5 rows (160 B) as Evo hides, as Flavour
  already does with its rows. About half a day, no VRAM change.
- **The 32/32 ClAct character slots are unaffected by either route** (6.1). Area's box icon (main row 12, one icon)
  is easy: write its palette into its own row.

### 6.3 Every screen

"Rows" = enough standard rows once the 3 bank rows are freed. "Ext" = 8bpp + extended palette. Engines: m main,
s sub. Counts are the most icons visible at once (code; measured where noted).

| Screen (file) | Icons, engine | Rows free / banks | Ext palette bank possible | Route | Verdict |
| --- | --- | --- | --- | --- | --- |
| PC box (`ov255/box2_obj.c`, `box2_seq.c`) | 30 tray + 6 party + held, m | 8, 12, 15 (measured) | G (F is the search's) | Ext G (section 5.1), 2-3 days | needs work |
| Party list (`ov165/plist_sys.c`, `plist_plate.c`) | 6, m | 12-15 + 6-8 = 7 | G (D, F are 3D) | Rows | easy |
| Party list, battle mode (`ov165/plist_battle.c`) | up to 6, s | banks at 6-8; audit | no (sub) | Rows if 3 more free, else share by species | easy-needs work |
| Battle party list (`ov287/b_plist_obj.c`) | 6, s (I 16 KB) | 6, 7, 10-15 (section 5.2) | no | Rows | easy |
| Battle lower screen (`ov168/btlv_input.c`) | 3, s (I) | banks 11-13 | no | Rows (≤ 3) | easy |
| Battle scenario team (`ov288/b_scenario_graphic.c`) | 6, s (I) | banks 0-2; audit | no | Rows | easy-needs audit |
| Save report (`ov087/report.c`, field) | 6 party, s (field: I is sub OBJ) | banks 0-2; audit vs C-Gear rows | no (field leaves only F, main) | Rows | needs audit |
| Pokédex list (`ov299/pokedex_list_obj.c`) | 8 m (9 mid-scroll), 7 s | m 7 / s 13 (measured) | G main, I sub | Ext G bottom, rows top | needs work (1 day) |
| Pokédex Info Evo (`paperwhite2_pokedex_info_evo.c`) | 8 (Eevee), s | 14-15 + 5-7 (measured) | I | Rows with 0-4 borrowed, or Ext I | needs work (0.5-1 day) |
| Pokédex Info Area box (`paperwhite2_pokedex_info_area.c`) | 1, m | row 12 | | Rows | easy |
| Pokédex Info Flavour tab (`paperwhite2_pokedex_info_flavour.c`) | 0: uses the icon cells for its tab art, one bank row | | | keep a row of the old palette or own palette | easy |
| Pokédex Forms (`ov298/pokedex_detail_form.c`) | 2, s | banks | | Rows | easy |
| Pokédex habitat map, original (`ov298/pokedex_detail_map.c`) | 2, s | banks | | Rows | easy |
| Habitat list (`ov303/pokedex_habitat_graphic.c`) | 1, m (30 in the hack's 6 by 5 grid: icon-screens.md 4.3) | banks | | Rows (ext G in the hack) | easy |
| DexNav (`paperwhite2_dexnav.c`) | 18 grid (touch) + 1 big (top), **BG**, 3 BG rows (5-7) | BG rows: 16 per screen, font 4, chosen 8, the grid art's | BG ext palettes (E/F/G free in habitat's table; sub BG ext is H, already mapped) | 8bpp BG layer with ext palettes, or the grid as OBJs on main ext G | needs work (1 day) |
| Name input (`ov280/name_input.c`) | 1, m | banks | | Rows | easy |
| Battle video select (`ov306/btl_rec_sel.c`) | 2, m | banks | | Rows | easy |
| Trial House award (`ov313/th_award.c`) | 4, m | banks + 1 | | Rows | easy |
| Trade box (`ov194/pokemontrade_2d.c`) | 60 actors (12 columns × 5), about 30 visible, s (D) | banks 3-5 | **I free** (E, C, H, G, AB, F used) | Ext I | needs work (1-2 days), needs 2 DSes or a link setup to test |
| Trade offer (`ov194/pokemontrade_nego.c`) | 6+6, m or s | banks; audit | G? (G is main OBJ there: only I, sub) | Rows if 9 free, else Ext I on sub | needs work |
| GTS box (`ov214/worldtrade_box.c`) | 30, m (AB 256 KB) | audit | G or F | Ext G | needs work, Wi-Fi |
| Wi-Fi/IR battle party select (`ov036/party_select_list.c`) | 6 + 6 battle box, m | banks 6-8; audit | G | Rows or Ext G | needs work, wireless |
| Multi battle list (`ov171/vs_multi_list.c`) | 6, m | banks 0-2; audit | G | Rows | easy-needs audit |
| Wi-Fi Club (`ov173/wifi_p2pmatch.c`) | 12, m | banks 11-13 | G | Ext G | needs work, Wi-Fi |
| IR ranking (`ov180/irc_ranking.c`) | a few per list, m + s | banks 1-3 both | G / I | Rows | easy-needs audit, IR |
| Mystery Gift album (`ov197/mystery_album.c`) | up to 4 cards' icons, m (E 64 KB) | banks 12-14 | G | Rows | easy |
| Game Sync (`ov199/gsync_disp.c`) | 1 (both), m + s | banks 0-2 | | Rows | easy, Wi-Fi |
| Mailbox (`ov215/mb_obj.c`) | 3 per mail, s (I) | banks 0-2 | no | Rows (≤ 3) | easy |
| Xtransceiver local (`ov259/local_tvt_util.c`) | 6, s (I) | banks 8-10; audit | no | Rows | needs audit, wireless |
| Wi-Fi battle match (`ov262/wifibattlematch_view.c`) | 6 per card (2 cards) + list, m/s | banks at the card's slot / 5-7 | G / I | Rows per card, Ext if both cards' 12 | needs work, Wi-Fi |
| Battle Recorder video list / video (`ov268/br_bvrank_proc.c`, `br_record_proc.c`) | 5 rows / 12, m | banks 4-6 | G (one table) or none (`OBJ_32_FG`) | Rows / Ext G | needs work (12), part Wi-Fi |
| Battle Recorder profile (`ov271/br_util.c`) | 1, m | banks 4-6 | | Rows | easy |
| Pokéstar book / record (`ov322/pkwd_book.c`, `ov325/pkwd_record_monitor.c`) | 7 s / 6 m | banks; audit | I / G | Rows | easy-needs audit |
| Unova Link (`ov332/cygnus_flow.c`) | 12, m | banks 4-6 | G (sub is I) | Ext G or a row per visible entry | needs work |
| No icons drawn (use the pack/unpack helpers only) | `ov033/event_chatot.c`, `ov062/pokewood_system.c`, `ov199/gsync_state.c`, `ov255/box2_main.c`, `ov287/b_plist_main.c` | | | | none |

Not icon screens: the bag (no party bar in this game), the summary (section 5.2), Day Care (no screen), the Hall of
Fame and the evolution scene (battle sprites, MCSS), the hack's Entree, Wonder Trade and follower menus (no
`ARCID_POKEICON` use; Wonder Trade picks in the PC box and plays the trade scene, so the box covers it).

### 6.4 Shared work, effort and conclusion

- **Shared pieces (about 4 days):** the build step that re-indexes every icon onto its battle palette (the
  experiment's mapping, inverted: the icon's colours to `normal.pal`'s indices) and the editor's import; a palette
  source per icon slot (`normal.pal`/`shiny.pal` read from the battle archive, or a packed 64 B per species-form in
  `a/0/0/7`); a small main-ARM9 helper: a per-screen row pool (rows given by the screen, shared by icons of the same
  species-form-shininess, refcounted) and a band allocator for extended palettes with the 4bpp-to-8bpp conversion and
  VBlank uploads; the 8bpp cell files.
- **Per screen:** about 15 easy ones at 1-3 hours each with an emulator check (2-4 days); about 9 needing audit or a
  row juggle (2-3 days); about 9 needing the extended route (box 2-3 days, list, Evo, DexNav, trade, GTS, Wi-Fi Club,
  Unova Link, BR video: about 1 day each).
- **Testing is the hard part, not the code:** the GTS, Wi-Fi Club, Wi-Fi battle match, Game Sync and BR's online
  lists need servers; the trade, IR and Xtransceiver screens need a second DS or a link harness. Their icons can be
  forced into the screens in the emulator (writing the data the screen reads), but not reached by play.
- **Conclusion: achievable everywhere; nothing is blocked.** Every screen either shows at most 3-6 icons (rows), or
  has F/G (main) or I (sub) free for an extended palette. The only sub-engine screens without an extended palette
  (sub OBJ in I: battle, battle party list, field save report, mailbox, Xtransceiver) show 6 icons or fewer. Total
  **about 3-4 weeks**, of which roughly a third is the extended-palette screens and a third verification.
- **A cheaper intermediate step** (worth doing first): keep one image per species and drop the bank copy, but give
  each icon a 16-byte map from its battle-palette indices to the nearest bank indices (about 12 KB for all icons),
  applied when the icon's characters are read from `ARCID_POKEICON` (one hook in the character loaders). Unconverted
  screens then show option A's quality (section 3) instead of garbage, so screens can move to own palettes one at a
  time, the busy ones (box, party, battle party list, Pokédex) first, and the wireless ones last or never if they are
  removed.

## 7. Icon remap preview (normal) (experiment, 2026-11-22)

Preview only, nothing in `res/` changed. Scripts and outputs: `.../scratchpad/iconremap/` (`remap_icons.py`,
`flag.py`, `render.py`). Every icon was re-indexed onto its species-form's battle `normal.pal` with
`tools/paperwhite2/palette_remap.py` as used for the follower sheets (method F: E's colour map, then the per-pixel
look-alike pass), with its two frames laid side by side as one 64×32 sheet (frame width 32) so both frames share one
map and index 0 stays transparent. Battle art as for followers: the form's own art, `fm` when the species has female
battle art but one icon, `f` for the three `icon_female.png`.

- **744 icons**: 655 species (egg included), 3 female icons, 69 forms with icons, and Arceus' 17 palette-only forms
  (the base icon's remapped pixels on each form's `normal.pal`; form 9 is the ??? form). Skipped: `bad_egg` (no battle
  palette) and the Pokéstar props. Hydrapple remaps onto its placeholder (Budew) palettes. Castform's and Cherrim's
  forms have their own icons and palettes, so unlike the follower sheets they need no opt-out.
- **Outputs:** `before_after.png` (62 rows: Charizard, Treecko, Clefairy, starters, darks and greys, pastels, Rotom,
  Deoxys, Unown, Castform, Cherrim, Arceus, the hack's forms and species), `all_icons_normal.png` (25 boxes of 30, dex
  order, forms after their base) with `all_icons_index.txt`, `flagged.txt` and `flagged_1..4.png`.
- **The three anomalies are gone on the normal palette:** Charizard's outline is dark, Treecko's belly is its battle
  red, and Clefairy's ears take the battle pink and brown.
- **Flagged: 207**, plus 131 on a watch list. The reasons: an icon colour with no `normal.pal` colour within 15 dE
  (136), mean shift over 10 dE (80), 3% or more of pixels off by over 20 dE (72), outline lightness class changed (36),
  a colour shifting over 20 (28), an outline lighter (5), a tinted outline (2, Rotom's Mow form among them). **The
  numbers measure distance from the vanilla bank colours, not error:** most flagged icons move toward the battle
  sprite's colours, as Ditto, Mudkip, Vaporeon, Probopass and Spiritomb do. Worth a look by eye: Togepi (yellow
  becomes brown; watch list, mean 9.1), Rotom's base form (its blue aura goes grey), Ho-Oh, Exeggcute, Igglybuff,
  and Arceus form 13 (a 20 dE yellow).

## 8. Method G (experiment, 2026-11-22)

Preview only, nothing in `res/` changed. Scripts and outputs: `.../scratchpad/iconremap_g/` (`g.py`, `flag_g.py`,
`render_g.py`, `diag.py`; F's pixels are section 7's). The user's review of round 1: most flagged F icons look good,
so distance from vanilla is not error and G keeps F's colours unless the battle sprite clearly disagrees.

### 8.1 Diagnosis

1. **Vanilla icon colours don't say what a part is.** Over 1,684 parts with good registration (16 px or more, at
   least 80% on the battle silhouette, at least 70% of the battle pixels under them in one hue ramp), the battle
   art under the part is in a different ramp from the one F's colour match chose in 23% of the coloured parts and 20%
   of the grey/white ones. 72 grey/white parts sit on coloured battle pixels (the bank had no colour for them:
   Oshawott's and Dewott's blue, Gengar's and Spiritomb's purple, Piloswine's brown). Seen in the examples:
   Kricketune's and Kricketot's red, Sawsbuck summer's leaves (the bank olive F reads as tan), autumn's red, Suicune's
   purple mane, Exeggcute's peach, Ho-Oh's orange. **Confirmed.**
2. **Battle palettes have no shared outline scale.** 98% of vanilla silhouette-edge pixels are the two shared greys:
   `#414141` (L 40, 84-88% of the edge in the top half) and `#62625a` (L 51, 86% in the bottom quarter). Across
   icons, the outline lightness of vanilla spans 39.8-50.7 (p10-p90, spread 10.9); F's spans 24.8-48.2 (spread
   23.4). **Confirmed:** F's outlines vary twice as much, since each battle palette's dark colour sits at its own L.

### 8.2 What G does

- **a. Registration.** The battle `front_single(_female).png` is scaled onto each icon frame's silhouette bounding
  box and searched over x/y scale (0.8-1.2), offset (±2 px), and horizontal flip, then refined; the score is
  silhouette IoU plus 0.3 × internal-edge agreement. Median IoU 0.72 (p10 0.57, p90 0.84); 47 icons under 0.55.
- **b. Parts.** Outline pixels are the two shared greys touching transparency, or in thin lines inside (at most 5 of
  them in a 3×3). The rest is cut into 4-connected parts of one vanilla colour family (complete linkage, hue within
  25°; light and dark greys apart), linked between the two frames by the frame shift. Battle colours are grouped
  into ramps the same way (hue within 20°, 28° when the art puts them side by side; low-chroma and dark colours join
  the nearest hue). Each part votes with the battle pixels under it (battle outline colours left out). A large part
  whose battle pixels show a second ramp in one place is split there.
- **Conservative choice.** A part keeps F's colours unless the vote clearly disagrees: 60% of its votes for one ramp
  and at least twice F's ramp's share, and either F's colour is grey where the battle pixels are coloured (chroma
  5.5 or more and 3 above F's), or F is low-chroma brown where the battle is 5 chroma more saturated, or the hues are
  30° apart (2.5×, and 24 px or more, or a small part whose whole colour family votes the same way, so eyes and gems
  stay put), or the battle is white/grey under a 24 px part F coloured. Parts under 8 px keep F. When most of a
  colour family switches, the rest of it follows where the art doesn't prefer F's ramp. Overrides: 473 grey parts
  coloured, 275 hue changes, 82 by consensus, 35 brown to saturated, 5 to white; 392 icons have at least one, 265
  over 5% of their pixels, 100 over 20%.
- **c. Shading.** An overridden part takes the battle colours under it (the ramp's, plus near hues the art shades it
  with), and its vanilla colours map onto them in lightness order (monotone, with a small allowed shift, merges
  penalised). Kept parts are reshaded the same way only where F inverted the vanilla lightness order or moved it by
  more than 18 L (32 icons).
- **d. Outlines.** **G1:** each outline pixel takes the darkest shade of the ramp it borders (a dark colour next to
  the ramp in the art counts; a ramp with nothing under L 45 uses the art's darkest). **G2:** outlines keep the
  vanilla greys in fixed slots 14 (`#62625a`) and 15 (`#414141`); slots 1-13 hold the battle indices the icon uses,
  so its palette is "13 battle indices + 2 greys", built from `normal.pal` and later `shiny.pal` with one index list.
  The icons need 2-13 battle colours (median 8; 13 for one), so none overflowed. One with more would merge its
  closest same-ramp shades.
- **e. Forms.** Palette-only forms (Arceus) reuse the base icon's G pixels and G2 index list on each form's palette;
  forms with own icons (Sawsbuck, Rotom, Deoxys, Castform...) register against their own battle sprite.

### 8.3 Results

Contrast across 727 icons (palette-only forms aside), OKLab L ×100 (`contrast.txt`):

| | outline L p10 / median / p90 | spread | light (median > 50) | outline-to-interior contrast (median) |
| --- | --- | --- | --- | --- |
| vanilla | 39.8 / 39.8 / 50.7 | 10.9 | 16% | 29.3 |
| F | 24.8 / 39.2 / 48.2 | 23.4 | 7% | 31.2 |
| G1 | 21.5 / 24.8 / 24.8 | 3.3 | 0% | 48.5 |
| G2 | 39.8 / 39.8 / 50.7 | 10.9 | 16% | 28.8 |

G2 gives every icon the vanilla outline scale, with the same top-dark, bottom-light gradient, and keeps the vanilla
contrast. G1 makes outlines uniform but near-black, with much stronger contrast than vanilla, and on icons with many
inner lines (Arceus) a coloured ramp's dark shade turns up inside the body. The interior lightness range is the same
for both (median 38.4, vanilla 38.9).

By eye (`before_after.png`, 84 rows: the 28 examples plus round 1's sample, frame 0, vanilla | F | G1 | G2 |
battle): fixed or improved: Ho-Oh (orange, not dark red), Oshawott, Dewott and Simipour (blue, not grey), Suicune's
purple mane, Kricketune and Kricketot red, Sawsbuck summer green leaves and autumn red, Gengar, Spiritomb, Empoleon,
Whiscash, Vileplume, Rotom's aura, Exeggcute lighter and peach. Unchanged from F (the vote wasn't clear): Gloom,
Natu, Snivy's body (60% of the battle pixels under it are its cream face and belly), Garbodor mostly brown (its
battle green has chroma 4-7, too weak a vote), Sawsbuck spring (no pink: the flowers are too small to vote), Tangela,
Igglybuff (reshaded lighter). Wrong or doubtful: Wailord's body whitened, Seedot darker, Bulbasaur and Ivysaur teal
(the battle sprite's own colour). Arceus forms: consistent across forms now (base pixels reused); G2 is the clean one.

- **Flagged: 393** (`flagged.txt`, `flagged_1..10.png`, risky ones first): 392 icons where a part changed hue family
  from F (the review list, both fixes and mistakes), 17 of them with registration under 0.55, and one shiny-like
  result (Dipplin). Watch list 49: F kept although 75% or more of the battle pixels under a 24 px part said another
  ramp (Garbodor, Snivy and the like). No G2 overflows.
- **Outputs** copied to `C:\Modding\Pokemon ROM Hack Workspace\Pokemon Paper White\iconremap_g\`:
  `before_after.png`, `all_icons_G1.png` and `all_icons_G2.png` with their index txt files (fit and G2 colour count
  per icon), `flagged.txt`, `flagged_1..10.png`, `contrast.txt`.
- **Recommendation:** G2's outlines (fixed vanilla greys) with G's conservative part overrides on top of F. It costs
  two palette slots, which every icon can spare. Review the override list before adopting it; to make it stricter,
  raise the override's purity and ratio thresholds in `g.py`.

## 9. Method H (experiment, 2026-11-22)

Preview only, nothing in `res/` changed. Scripts and outputs: `.../scratchpad/iconremap_h/` (`h.py` = G plus the H
block `h_block.py`, `flag_h.py`, `render_h.py`, `diag_h.py`, `coldiff.py`). The user's review of G: G2's outlines
are kept. G fixed many icons, but Wailord, Empoleon, Snorlax, Magikarp, Vaporeon, Gyarados and Entei regressed,
and Gloom, Vileplume and Tangela were still wrong.

### 9.1 Causes, proven per example

`diagnosis.png` has one row per example: vanilla | battle sprite warped onto the icon by the registration | parts
by decision | F | G2 | H. `diagnosis.txt` has each part's numbers. Five failure classes:

- **A. The pose differs but the silhouette fits** (registration votes from the wrong body region):
  - **Wailord:** IoU 0.83, but internal-edge agreement 0.17. The 286 px main body part (the vanilla blue family)
    lies 86% on the battle sprite's white belly, so G's rule "battle white here" whitened it.
  - **Snorlax:** the lying icon over the sitting sprite. The grey body (69 px) voted the cream belly and the cream
    belly (40 px) voted blue, so G swapped them.
  - **Entei:** the white mane (34 px) lies on the tan body, and the red face (2 × 10 px) on tan.
- **B. Small, distinctive parts misregistered:**
  - **Empoleon:** the orange crest (56 + 14 px) and white chest (20 px) were sent to the body's blue.
  - **Vaporeon:** the yellow frill (16 + 10 px) was sent to blue.
- **C. Pale colours grouped with a saturated ramp.** In Magikarp's battle palette, `#ffe6c5` (L 94, chroma 5)
  joined the orange ramp. The white fins (20 px) voted "coloured" and were shaded orange.
- **D. Reshading part by part, inconsistently:**
  - **Gyarados:** G made no overrides. Two of its parts were reshaded lighter and the rest kept F's dark blue, so
    the icon came out patchy.
  - **Vaporeon:** a 46 px part was reshaded into a one-colour purple ramp, turning its light-blue pixels dark purple.
- **E. F was already wrong inside a part, and G couldn't reach it:**
  - **Highlights leaving the ramp:** F sends a part's lightest vanilla shade to another hue family when the part's
    ramp has no shade that light. In Gloom, `#a4c5ff` goes to cream yellow (52 px): that is the "yellow face". In
    Vileplume, `#a4c5ff` goes to pink (45 px).
  - **Small-part protection:** Gloom's face part (10 px, 100% blue-grey vote) was blocked by G's 24 px rule.
  - **Look-alike specks:** in Tangela, 17 detail parts of the body's own colour family were put on the red ramp by
    F's per-pixel pass (78 red px, versus the battle sprite's red feet only).
  - **Right ramp, wrong lightness:** Ho-Oh's `#ee739c` (L 72) goes to `#940800` (L 43) although the ramp has
    `#ff5a10` (L 68). Exeggcute and Igglybuff have the same problem. These are round 1's "very dark" icons.

### 9.2 What H does

- **A second, pose-free witness: colour shares.** Each icon gets one global assignment of its vanilla colour
  families to battle ramps. It weighs area share against the battle ramps' shares (front and back sprites
  together, battle outline colours left out), hue (weighted by both chromas), the colour-or-grey difference (a grey
  vanilla family may take colour), and the lightness range. It is found by coordinate descent from three starts:
  F's, the registration's and the cheapest per family. Each family also gets a confidence margin.
- **A part leaves F's ramp only when the registration and the shares agree** (reg+share: 553 parts). Exception: a
  battle ramp with 8% or more of the art that F never uses, when the registration has no opinion and the shares are
  sure (34 parts). Where the registration disagrees with both, F stays (keep-conflict: 169). This rule stops A and
  B: Wailord's body, Snorlax's swap, Entei's mane, Empoleon's crest and chest and Vaporeon's frill all have the
  shares on F's side.
- **One ramp per vanilla family:**
  - Small parts follow the family's decision (family: 1,098 parts).
  - Coloured details whose F ramp has under 20% support under them take the family's ramp (detail-family: 1,044).
  - Pixels that F sent off the part's ramp without battle support come back into it (off-ramp: 363 parts). This
    fixes Gloom, Vileplume and Tangela.
- **Lightness:** a pixel F put on the right ramp but more than 15 L from its vanilla colour takes the family map's
  shade when that is 10 L closer (83 parts). This fixes Ho-Oh, Exeggcute and Igglybuff.
- **Shading:** one map per (family, ramp), so the same vanilla colour always gets the same shade (fixes D). The
  vanilla lightness order maps onto the battle colours under the family's parts.
- **Pale ramp members:** colours of L 85 or more with chroma under 5.5 count as white (fixes C: Magikarp's fins,
  Cottonee's cotton).
- **Unchanged from G:** the outlines (G2's vanilla greys in slots 14-15), and Arceus reusing the base icon's pixels.
  Each icon needs at most 13 battle colours.

### 9.3 Results (by eye, `before_after.png`: 100 rows, the names from rounds 1-3 and the earlier sample)

- **Round 3's regressions: 6 of 7 fixed.** Wailord, Snorlax, Magikarp and Entei are back to F's colours. Empoleon
  and Vaporeon are better than F: Empoleon gets a navy body, gold crest and white chest; Vaporeon gets a blue body,
  cream frill and purple fins. Gyarados is now evenly lighter blue, closer to the battle sprite's `#41b4ee` than
  F's dark navy, but different from F: the user should judge it.
- **Still-wrong examples: 3 of 3 fixed.** Gloom's face and body are blue-grey with orange petals. Vileplume has a
  red flower and a navy body. Tangela's red went from 78 px to 15, all at the feet, where the battle sprite has red
  feet.
- **G's fixes kept:** Ho-Oh, Oshawott, Dewott, Simipour, Suicune, Kricketune, Kricketot, the Sawsbuck forms, Gengar,
  Spiritomb, Piloswine, Whiscash, Quagsire, Rotom's aura, Cottonee (white again).
- **Lost or doubtful:**
  - Exeggcute is light salmon, not G's peach.
  - Bulbasaur and Ivysaur keep F's green rather than G's teal.
  - Seedot is still darker than F.
  - Snivy's body is still yellow-green, and Garbodor still mostly brown.
- **Review lists** (H vs another method, 3% or more of the non-outline pixels a different colour, largest first):
  - `flagged_vs_g2.txt` and `flagged_vs_g2_1..13.png`: **489 icons** where H differs from G2.
  - `flagged_vs_f.txt` and `flagged_vs_f_1..11.png`: **414 icons** where H differs from F (273 by 10% or more,
    105 by 30% or more).
  - The first vs-F page is almost all moves toward the battle colours: Furret, Gengar, Vulpix, Golbat, Muk, Grimer,
    Nidorina, Murkrow and Honchkrow, Venusaur. Doubtful there: Seedot, Tympole and Swoobat.
- **Outputs**, copied to `C:\Modding\Pokemon ROM Hack Workspace\Pokemon Paper White\iconremap_h\`:
  `before_after.png`, `all_icons_H.png` with `all_icons_H_index.txt`, the two review lists and their pages,
  `diagnosis.png` and `diagnosis.txt`, and `h_summary.txt` (the decision counts).

## 10. Method I (experiment, 2026-11-22)

Preview only, nothing in `res/` changed. Scripts and outputs: `.../scratchpad/iconremap_i/` (`i.py`, `render_i.py`,
`flag_i.py`, `checks.py`, `maptable.py`). The user rated H the best batch so far and listed what was left. The user
also asked that I use no registration, and set two rules: a coloured pixel never becomes index 0, and a connected
group of one vanilla index stays one new index.

### 10.1 Causes in H (`maptable.py h KEY` gives each vanilla colour's result)

- **Cherubi:** two vanilla pinks of different families are shaded independently on one battle ramp. `#ee739c`
  (L 72) goes to `#ff8bac` (L 78) and `#f694f6` (L 81) to `#de6283` (L 67): the lightness order is inverted.
- **Mismagius:** the vanilla greys (the bank had no purple) go to the ramp's darkest shades. `#838373` (L 61)
  goes to `#4a395a` (L 40), and `#62625a` interior pixels to L 40-43.
- **Vaporeon:** 27 + 16 px of the light blues `#8b7bff` (L 67) and `#a4c5ff` (L 83) go to the one-colour fin
  purple `#521073` (L 37).
- **Tympole:** the cream face family (55% of the icon) went to the black ramp, which has 53% of the battle art. The
  shares outweighed hue, and the registration agreed, so `#eec58b` (L 85) became `#414141`.
- **Wurmple:** `#ee739c` (L 72) and `#ffb4a4` (L 84) both go to `#f6626a` (L 69). The ramp has no lighter red, so
  lightness matching merged two vanilla shades.
- **Rotom Mow:** no pixel became index 0, in F, G2 or H. The vanilla light-blue grass spray `#a4c5ff` (15 px) goes
  to `#bdbdbd`, F's choice and the only near colour in the battle art. That grey is close to the box-tray grey,
  so the pixels seem to vanish.
- **Hydrapple:**
  - Its battle art is still Budew's placeholder, without the apple's red.
  - H's per-part decisions split vanilla `#e64a29` between `#cd0031` (237 px) and green (68 px).
  - In H, 667 icons have at least one connected same-index group with more than one new index. 5,808 groups in
    all; most are bank-grey groups split between outline and interior. Counting other colours only: 1,316 groups
    in 257 icons. F has 1,305 in 209 (its per-pixel look-alike pass), G2 has 1,400 in 270.
- **Snivy:** its main green `#9ccd4a` (L 79, 59% of the icon) went to the yellow ramp. The green ramp only reaches
  L 67, so F's colour match and H's lightness rule both favoured yellow.
- **Sawsbuck:** the bank has no pink, so the spring flowers' `#f694f6` goes to grey `#acacac` (F's choice; the
  shares agreed for so small a family). The autumn leaves are bank olive, and their red comes only from the
  battle art's shares.

### 10.2 What I does (no registration)

- **Evidence:** the vanilla colour families (area, hue, chroma, lightness) and F's family ramp, used as a prior.
  From the battle art: the colour shares of the front and back sprites.
- **Global assignment of families to ramps**, by coordinate descent from F's assignment and from the greedy one.
  Costs:
  - hue 0.6, with any hue difference over 75° between two chromatic colours forbidden;
  - colour to grey 1.0; grey to colour 0.35, or 1.0 for vanilla greys of L 85 and up, which really are white;
  - lightness outside the ramp's range 2.0;
  - F prior 0.25, plus 0.5 for leaving F's ramp for one within 36° of it;
  - share TVD 1.0.
- **One new index per vanilla index** in the whole icon, so every connected group stays one colour.
  - Bank-grey groups touching transparency keep the vanilla outline greys (slots 14-15).
  - Bank-grey groups inside the icon are coloured.
  - A family whose F colours lie outside the battle art's ramps keeps F's most common colour per vanilla index
    (Hydrapple's red).
- **Shading per ramp, jointly over every family on it:**
  - It follows the vanilla lightness order, which fixes Cherubi.
  - Two colours of one family never share a shade while the ramp has enough shades, which fixes Wurmple.
  - Two families may share a shade.
  - Shades darker than L 30 and the battle outline colours are kept off vanilla colours of L 45 and up, which
    fixes the dark bodies.
  - An a/b cost toward F's colour, when that colour is on the same ramp, keeps F's hue inside mixed ramps.

### 10.3 Results

- **Checks over all 744 icons:**

  | | F | G2 | H | I | IH |
  | --- | --- | --- | --- | --- | --- |
  | coloured pixels that became index 0 | 0 | 0 | 0 | 0 | 0 |
  | connected same-index groups split | 3,154 | 5,898 | 5,808 | 0 | 0 |

  I also asserts the index-0 rule per icon. The counts are in `checks.txt`.
- **The user's notes (`before_after_I.png`: 104 rows):** fixed:
  - Cherubi's order;
  - Mismagius and Vaporeon lighter;
  - Tympole's cream face;
  - Wurmple shaded;
  - Hydrapple's apple one red;
  - Snivy and Serperior green.

  Not fixed:
  - Rotom Mow's spray is still grey, by the same cause.
  - Sawsbuck spring has no pink.
- **I regresses many of H's hue fixes.** Without the registration, a family the bank coloured wrongly can only move
  through the shares, which cannot tell which family should move. I differs from H on **613** icons (201 by half or
  more of the pixels). Lost: Sawsbuck autumn's red, Skuntank's purple (pale), Whimsicott's cream (brown), Smeargle
  (turns green), Treecko's belly. On the other hand Furret, Seedot, Vulpix, Heatmor, Phione and Wobbuffet improve.
- **IH, a hybrid:** each vanilla colour takes the ramp H gave most of its pixels (H's hue decisions, registration
  included), then gets I's shading and rules (`before_after_IH.png`, `all_icons_IH.png`, `flagged_ih_vs_h*`).
  - Kept from H: the autumn reds, Skuntank, Whimsicott, Treecko, Hydrapple.
  - Fixed like I: Cherubi, Mismagius, Vaporeon, Wurmple; Tympole's face comes out white-cream.
  - Its index rules hold with no exceptions.
  - It differs from H on 559 icons (157 by half or more): most of that is I's lightness-ordered shading.
  - Still wrong: Snivy (H's yellow ramp), Smeargle (green spots), Sawsbuck summer much darker.
- **Recommendation:** IH over I. Pure I is not better than H overall.
- **Outputs** in `C:\Modding\Pokemon ROM Hack Workspace\Pokemon Paper White\iconremap_i\`:
  - `before_after_I.png` and `before_after_IH.png` (columns vanilla | F | H | I or IH | battle front);
  - `all_icons_I.png` and `all_icons_IH.png` with their index txt files;
  - `flagged_i_vs_h.txt` and `flagged_ih_vs_h.txt` with their pages;
  - `checks.txt`.

## 11. Shiny preview (IH) (experiment, 2026-11-22)

Preview only, nothing in `res/` changed. Scripts and outputs: `.../scratchpad/iconremap_shiny/` (`shiny.py`,
`twin_pages.py`). The user chose IH as the base and will hand-tweak Snivy, Smeargle, Sawsbuck and Mow's spray.

- **Rendering:** each IH icon keeps its pixels and its slot list (slots 1-13 = battle indices, 14-15 the vanilla
  outline greys). Slots 1-13 take their colours from the group's `shiny.pal` instead of `normal.pal`, and the two
  greys stay fixed.
  - Palette-only Arceus forms use the base icon's pixels and slots with each form's own `shiny.pal`.
  - Every group with a `normal.pal` also has a `shiny.pal`, so no form needed a fallback. `bad_egg`, which has
    neither, stays out as before.
- **Outputs**, in `C:\Modding\Pokemon ROM Hack Workspace\Pokemon Paper White\iconremap_shiny\`:
  - `all_icons_IH_shiny.png` (25 boxes) with its index;
  - `before_after_shiny.png`: 43 varied species and forms, with columns vanilla (the game shows the same icon for
    a shiny today) | IH normal | IH shiny | battle front shiny;
  - `twins.txt` and `twins_1..5.png`.
- **Wrong-twin check.** A twin is a battle index that IH uses which has a look-alike in `normal.pal` (palette_remap's
  6 dE, or 8 when both are dark) that the battle art also uses, the two more than 10 dE apart in `shiny.pal`. Such
  an icon part can take the other part's shiny colour.
  - **443 cases in 242 icons.**
  - 178 icons have a case that one of two rules would swap. Rule (a): use the look-alike the battle art uses most.
    Rule (b): F's neighbourhood choice, `BattleArt.choose`, by majority over the icon's pixels of that index.
  - `twins.txt` lists each case with its icon and battle pixel counts, normal and shiny colours, alternatives and
    both rules' picks.
  - The pages show IH normal | IH shiny | shiny swapped by rule (a) | shiny swapped by rule (b) | battle shiny.
- **Clear wrong twins, seen on page 1:**
  - Chansey's body is shiny green on index 8, which the battle art uses for 30 px. Its twin, index 13 (1,364 px),
    is cream.
  - Donphan stays olive (index 12, 272 px) where its twin, index 6 (1,048 px), is shiny orange.
  - Registeel, Graveler, Cloyster, Aggron, Cubchoo, Drilbur and Darmanitan's Zen form have the same problem.
- **Rules.**
  - The two rules agree on 279 cases (169 keep, 110 swap) and disagree on 164.
  - On page 1 by eye, rule (a) is right where (b) misses: Donphan, Charmeleon, Aggron, Cubchoo, Drilbur,
    Darmanitan.
  - Rule (a) fails in two ways. It flips near-ties, such as Treecko (214 against 225 px, turning the blue shiny
    body red). It also swaps twins that both mark real parts, such as Turtwig's two yellows (39 against 76 px).
  - **A general rule settles them:** swap only when the look-alike covers at least 3× as many battle pixels;
    otherwise keep IH's index.
    - That is 111 clear swaps (98 icons, 5,098 px); the neighbour rule agrees with 86 of them.
    - 149 cases are clear keeps.
    - 183 cases (129 icons) are within 3×, ambiguous. They stay as they are for the user's review in `twins.txt`.
  - The neighbour rule adds little and is wrong on clear cases, so it should not decide alone.

## 12. Method J (shiny-aware) (experiment, 2026-11-22)

Preview only, nothing in `res/` changed. Scripts and outputs: `.../scratchpad/iconremap_j/` (`j.py`, `finish_j.py`,
`suspects.py`).

- **Background:** the user prefers rule (a) of section 11 ("swap by most-used") over the 3× rule. The baseline is
  **IHM**: IH plus that swap, 189 swaps in 154 icons. The user asked whether the shiny palette can find wrong normal
  colours, such as parts that don't change when shiny because IH picked the wrong family (Tympole's face, Snivy's
  green).
- **J is IHM plus the shiny palette, with no registration:**
  - **(a)** A ramp whose members split apart in `shiny.pal` (hue more than 30° apart, or one chromatic and one grey)
    becomes several ramps: 1,067 extra ramps in 609 icons. Families that move together were not merged.
  - **(b)** Each vanilla family starts on its IH ramp. A shiny-change term may move it to another plausible ramp. A
    ramp is plausible when its cost per area, with F's prior left out, is at most 0.15 above that of the IH ramp. The
    term is |the icon's area share that changes when shiny − the battle sprite's|, where "changes" means a
    normal-to-shiny dE above 15 and the battle side is front + back with outline colours left out. A move needs a
    gain of at least 0.02. Result: 187 moves in 164 icons.
  - **(c)** IH's shading and rules are unchanged, then the most-used twin swap is applied.
  - **Variant J+gap:** also replaces an IH ramp that costs 0.6 more than the best ramp with the same shiny behaviour.
    It adds 130 moves and is the only variant that fixes Tympole's face (`results_j_gap.json`).
- **Outputs**, in `C:\Modding\Pokemon ROM Hack Workspace\Pokemon Paper White\iconremap_j\`:
  - `before_after_J.png`: 111 rows, with columns vanilla | IHM normal | IHM shiny | J normal | J shiny |
    battle normal | battle shiny;
  - `all_icons_J.png` and `all_icons_J_shiny.png` with their index files;
  - `review_j_vs_ihm.txt` and its 8 pages;
  - `suspects.txt` and its 7 pages.
- **Verdict: J does not beat IHM.**
  - J differs from IHM on 307 icons (100 by half or more of their pixels); J+gap differs on 339.
  - Fixed: Snivy (green, shiny teal like the battle sprite), Treecko (its shiny is no longer red), Smeargle (tan,
    not green), Ivysaur (teal), Serperior lighter. J+gap also fixes Tympole's face.
  - New mistakes, about as many among the largest differences: Poochyena white, Emolga and Sceptile yellow,
    Reuniclus tan, Cinccino brown, Genesect lilac, Elgyem dark, Arcanine darker, Donphan's shiny mixed.
  - The cause: whether a part changes when shiny is a weak signal. Many plausible ramps share the same shiny
    behaviour, and the area-share term moves whichever family closes the gap, not necessarily the wrong one. Split
    ramps also change the shading of many icons.
  - **Recommendation: keep IHM and fix by hand,** with the suspects list as the starting point.
- **Suspects list** (`suspects.txt`, pages: icon normal | icon shiny | battle normal | battle shiny), computed on IHM:
  **577 parts in 294 icons**, ranked by suspect pixels.
  - **Type A** (374 parts): a battle index that stays the same when shiny while 60% or more of its colour family
    (by battle pixels) changes, or the reverse.
  - **Type B** (203 parts): the icon's changing share is 25 points or more off the battle sprite's. Its largest
    parts on the short side are listed.
  - Snivy, Smeargle, Treecko, Donphan, Chansey and the Sawsbuck forms are on it.
  - Tympole's face is not: the battle sprite's cream face doesn't change when shiny either. Its fault (white
    instead of cream) shows only in the normal colours.

## 13. Icon review page (temporary, 2026-11-22)

The user picks, icon by icon, between IHM and J; nothing in `res/pokemon/` changes until the review is done.

- **Tool:** `tools/paperwhite2/icon_remap.py generate` ports the experiments' scripts (F of section 7, H of sections
  8-9, IH of section 10, the most-used twin swap of sections 11-12, J of section 12 and its suspects list) into one
  standard-library tool. Unused outputs (G1/G2, metrics, renders) are left out. It writes `build/icon_review/`
  (ignored, regenerable, about 20 s with 16 workers): `index.json` (each icon, whether IHM and J differ, its
  suspects), `differ.txt`, and per icon `icons/<key>/` with `icon.json` (both candidates' pixels and slots, the
  palettes, the battle front), `vanilla.png`, `ihm.png` and `j.png` (indexed, the normal colours through the slots).
- **Reproduction:** run on the same `res/` as the experiments, it gives the scratchpad's IHM (`results_ihm.json`) and
  J (`results_jm.json`) pixel for pixel, slots included, on all 744 icons, and the same suspects (577 parts in 294
  icons).
- **To decide:** IHM and J differ on **416** of the 744 icons (any pixel's normal or shiny colour; 307 by 3% or more,
  as in section 12). The other 328 keep IHM.
- **Choices:** `res/paperwhite2/icon_remap_choices.json`, `{"choices": {icon key: "ihm" | "j"}, "fix_by_hand": [icon keys]}`
  (and `k_base`, section 14.3),
  written on each click by the editor's server (`PUT /api/icon-review/choice` for the base to fix from, `PUT
  /api/icon-review/flag` for the flag; keys sorted, the data tools' JSON layout). An icon without a choice keeps IHM;
  choosing IHM where the two are the same writes no entry. "Fix by hand" is an independent flag, not a third choice: any
  icon can carry it, whichever base it has (or none), and the list is the checklist for the hand fixes.
- **Page:** the editor's sidebar, Tools, **Icon review (temporary)**: one icon at a time on the box-tray grey, vanilla
  above IHM and J (normal and shiny, 4x, the two frames animated), the battle front normal and shiny for reference.
  Click a candidate or press 1 (IHM), 2 (J), both of which go on to the next icon; the Fix by hand toggle (3) flags the
  icon and stays on it; arrows move. Filters: undecided (default), needs a choice, all, kept IHM, kept J, flagged to fix
  by hand; a progress count; suspects marked (⚑) with their reasons. Without
  `build/icon_review/` the page offers to generate it (the server runs the tool).
- **Tests:** `tools/paperwhite2/test_icon_remap.py` (a made-up species with its own palettes, battle frames, icon and
  a palette-only form) and `editor/tests/icon-review.test.ts` (the tool run on that fixture through the server's
  generator, the choices file's round trip, the page's filters).
- **Next:** once every icon is decided, write the chosen icons into `res/pokemon/` (indexed on the battle palettes
  plus the two greys), fix the flagged ones by hand, then remove the page.

## 14. Flagged icons (2026-11-22)

The user reviewed the 416 icons where IHM and J differ. Picks are in `res/paperwhite2/icon_remap_choices.json`: 282 IHM,
134 J. 131 icons are flagged to fix by hand, 86 on IHM and 45 on J. They range from tiny revisions to near-redraws.
Scripts: `.../scratchpad/iconremap_k/` (`features.py`, `classes.py`, `render_flagged.py`).

### 14.1 Patterns

- **The labels cover the 416 only.** None of the 328 icons where IHM and J are the same is flagged, so they were not
  under review. Every comparison below is within the 416: 131 flagged against 285 not, a base rate of 31%.
- **Not predictive (flag rate about the base rate):**
  - section 12's shiny suspects (30%);
  - H's registration fit;
  - how far F, IH and J disagree;
  - IHM against J (30% against 34%);
  - lightness range.
- **By kind:** forms with their own icon 8 of 52, palette-only forms 0 of 17, the one female icon flagged.
- **Weakly predictive:** more battle colours, ramps and vanilla colours (the top quarter 47-63% flagged against 15-23%
  in the bottom), and larger icons.
- **Error classes** (indicators on the user's pick, `classes.txt`). Count of flagged icons with the indicator / of
  unflagged ones (flag rate among icons that have it); the first examples:
  - **Missing battle colour family** (a family with 10% or more of the front + back art under 2% of the icon): 27 / 30
    (47%). Braviary, Swampert, Snorlax, Lugia, Treecko, Venusaur, Wartortle, Nidorina, Crobat, Jellicent.
  - **Grey where the battle art has a pale tint** (a pure grey/white battle index where the art uses a tinted colour
    within 8 L at least twice as much, 10% or more of the icon): 22 / 26 (46%). Beartic, Snorlax, Kyurem, Snover,
    Riolu, Patrat, Stoutland, Cottonee, Deino, Ponyta.
  - **A wrong-twin swap** (the icon took a look-alike): 42 / 63 (40%). Charizard, Cloyster, Chansey, Treecko, Garbodor,
    Braviary.
  - **Darker than vanilla** by 10 L or more on average: 16 / 25 (39%). Arcanine, Cinccino, Emolga, Smeargle, Shaymin,
    Serperior, Deino. Lighter than vanilla: Espeon only.
  - **Two or more vanilla colours collapsed onto one battle colour:** 24 / 39 (38%). Pidgeot, Haunter, Mew, Darkrai,
    Lilligant, Beartic, Braviary.
  - **None of these:** 21. By eye they are pose or design differences between the icon and the battle art, which no
    re-indexing fixes: Golduck, Hitmonlee, Kangaskhan, Magmar, Mantine, Lugia form 1, Makuhita, Nosepass, Torkoal,
    Solrock, Whiscash, Castform form 2, Deoxys form 2, Burmy form 1, Vespiquen, Dusknoir, Darmanitan, Crustle,
    Alomomola, Bouffalant, Sudowoodo.
- **Placeholder art** (battle art not final; no method fixes these until it lands):
  - Hydrapple's battle front is byte-identical to Budew's. It is not flagged.
  - Appletun and Dipplin are flagged. They have new battle art of their own, but it is still in progress (front and
    back rigs being reworked, uncommitted); their overworld sheets were on Budew's until recently. Redo them when
    their art is final.

### 14.2 Method K

K runs only on the flagged icons and starts from the user's pick of IHM and J. It changes whole vanilla colours (one
battle index each, so a connected group of one vanilla index stays one colour), one class at a time:

1. **grey for tint:** a vanilla colour on a pure grey/white battle index takes the pale tinted battle colour within
   8 L that the art uses at least twice as much;
2. **missing family:** a battle colour family with 10% or more of the art and under 2% of the icon takes the vanilla
   colour family closest to it in hue (within 60°, or a grey family for a weakly coloured ramp) and area, when the
   family's old ramp stays represented; it is shaded in vanilla lightness order;
3. **collapsed shades:** the colours of one vanilla family that share a battle index are spread over their ramp again;
4. **too dark:** a colour 15 L or more darker than its vanilla colour takes a lighter shade of its ramp that is 8 L
   closer, keeping the order of the ramp's other colours;

then the most-used twin swap.

- **Rules held throughout:** the G2 outline greys are kept, every slot is a battle index (so the shiny follows), and
  no coloured pixel becomes transparent (asserted).
- **Results:** K differs from the pick on 94 of the 131 icons: grey for tint 78 times, collapsed shades 27, too dark
  35, missing family 10. By eye (`.../iconremap_k/k_1..4.png`):
  - about 11 are clearly better: Snorlax and Swampert get their blue bodies; Beartic its pale blue; Arcanine, Haunter
    and Shaymin are brighter; Emolga keeps black and white; Deino, Patrat, Seedot and Smeargle are closer;
  - about 4 are worse: Bouffalant and Mightyena are too light, Stoutland loses its blue-grey cape, Drilbur goes grey;
  - the rest change only a few shades.
- **K is a fifth candidate, not a fix.** The flagged icons still need hand work.

### 14.3 The Flagged review mode

- **Tool:** `icon_remap.py generate` gives each flagged icon (`fix_by_hand` when it runs), and each icon whose choice is
  already G2, H, IH or K (flagged or not), four more candidates in
  `icon.json`'s `candidates`: **G2**, **H**, **IH** (before the twin swap) and **K**. `index.json` lists them per icon.
  - G2 is ported from the round 2 script: G's decisions on the shared registration stage (`registered_units`, which H
    now uses too), with ramps built without H's pale-is-white rule (`build_ramps(pale=False)`).
  - Checked on all 727 icons with their own pixels: G2 matches round 2's G2 pixel for pixel, and H matches round 3's
    H. IHM and J are unchanged on all 744.
  - Flagging another icon needs a new run before it gets its candidates.
- **Page:** an icon with extra candidates (flagged, or kept on one of them) shows, in order:
  - the user's pick of IHM and J (marked "your pick"; K starts from it);
  - then G2, H, IH and K, each normal and shiny.

  Number keys 1-5 pick them in that order, and **0** toggles the fix-by-hand flag (3 would pick H here). The buttons
  show their keys. Other icons keep 1 IHM, 2 J, 3 the flag.
  - While the icon is flagged, each candidate also has **Keep and unflag** (Shift and its number): it keeps the
    candidate and clears the flag in one write (`PUT /api/icon-review/choice` with `unflag: true`), for a candidate that
    fixes the icon. A plain pick keeps the flag. Unflagged, the icon keeps its extra candidates while its choice is G2,
    H, IH or K.
  - An action that drops the shown icon from the filter (unflagging it under Fix by hand, say) leaves it in the list at
    its place until the user moves on; "go to the next icon after choosing" decides whether choosing moves on.
- **Choices:** the choices file keeps its shape. `choices` values may now be `ihm`, `j`, `g2`, `h`, `ih` or `k`; the
  last four only for an icon that has those candidates (the server checks). A filter "Kept another" lists those icons,
  flagged or not.
- **K stays the same.** Keeping any candidate of an icon with extra candidates records the pick K was built from in an
  optional `k_base: {icon key: "ihm" | "j"}` (written only when it has entries; files without it still read). The tool
  builds K from `k_base`, else from the choice when it is IHM or J, else (a G2, H, IH or K choice from before `k_base`)
  from the base of the K the last run wrote, else IHM. The server drops an icon's `k_base` when its choice is cleared
  or it leaves the extra candidates' set (unflagged on IHM or J). Checked on a copy of the user's choices file
  (2026-11-22, 131 flagged, 7 on G2 or K): generating again reproduces every icon's candidates pixel for pixel, K
  included, and so it does with the 7 unflagged. (Before this, a choice of G2, H, IH or K made the next run rebuild K
  from IHM, and an unflagged icon lost its extra candidates.)
- **Tests:** in `test_icon_remap.py`, a flagged fixture icon gets all four candidates under the rules, and K takes a
  pale tint; `test_k_keeps_its_base` (unflagged on G2 the candidates stay, K from `k_base` or the last run). In
  `icon-review.test.ts`, the generator writes the candidates, the display order, the server takes K only for an icon
  with it, keep and unflag in one write with K the same after generating again, and the filter keeping the shown icon.

## 15. Applied and the sprite editor (2026-11-22)

The review is finished. Every icon's chosen candidate is now in `res/pokemon/`, next to its vanilla art. The game still
builds from the vanilla `icon.png` and the three shared banks until the in-game work lands: the hack ROM built after
the apply is byte-identical to the one before (`verify_dsi_rom.py`: intact).

### 15.1 The files

- **Per icon, beside `icon.png`:** `icon_battle.png` and `icon_battle.json`. A female icon has `icon_female_battle.*`.
  A form has them in its `form_<n>/`, including Arceus' 17 palette-only forms, which show the base icon's pixels on
  the form's palettes. `tools/paperwhite2/sprite_edit.py` defines the format.
- **The PNG:** 32x64, indexed, frame 0 above frame 1. Its 16 colours:
  - 0: the battle palette's colour 0, transparent;
  - 1-13: the slots' `normal.pal` colours, so the file views correctly in any image editor; unused slots are magenta;
  - 14-15: the outline greys `#62625a` and `#414141`.
  
  The shiny is the same pixels through `shiny.pal`.
- **The JSON:** `{"slots": [battle indices 1-15, at most 13, no repeats], "greys": ["#62625a", "#414141"]}`, in the data
  tools' layout.
- **`icon_remap.py apply`** writes the files from `build/icon_review/`: each icon's choice, or IHM where it has none.
  - It refuses a choice that the review in `build/icon_review/` doesn't have, and checks every icon before writing any.
  - It keeps icons whose files differ from their candidate (fixed by hand since) unless `--force`, and marks them
    hand-edited in the review marks (section 15.3); with `--force` it unmarks those it overwrites.
  - A battle index the methods put in two slots (65 icons; one slot per vanilla colour) is merged into one slot
    (`sprite_edit.canonical`), which changes no colour, normal or shiny.
- **Applied:** 744 icons. By method: IHM 539 (282 picked plus 257 without a choice), J 103, G2 57, K 32, IH 7, H 6.
  - Before applying, the candidates were regenerated in a fresh worktree. For every icon's chosen method they matched
    the main checkout's `build/icon_review/` pixel for pixel, slots included.
  - Checked after writing: every icon's normal and shiny colours equal its candidate's, and its transparency equals
    the vanilla icon's.
  - About 330 KB in `res/`.
- **The hand-fix checklist** (`res/paperwhite2/icon_fix_list.json`, 78 icons, ticked off with the editor's Done) was
  finished on 2026-11-23 and replaced by the review marks (section 15.3).
  - `icon_remap_choices.json` stays as the review's record, so `generate` gives the same candidates. Its
    `fix_by_hand` is no longer updated.

### 15.2 The Sprite Editor (editor, Editors, **Sprite Editor**)

- **Layout:**
  - **Left:** the species' or form's battle sprite. Front, back and the two sheets can be picked; a female icon gets
    the female art. The sprite in the other palette is above it, and the palette's swatches are below it. Clicking the
    battle sprite picks that battle index.
  - **Right:** the sprite being edited, zoomable (6-24x), with a grid and a choice of checker or box-tray grey behind
    transparency. Above it are two references:
    - the vanilla art: an icon's `icon.png` in its bank colours; a sheet as it was before the battle-palette remap,
      read with `git show 6d04855193^:…`, local only;
    - the edited sprite in the other palette.

    Clicking either reference in the other palette swaps the page's palette. The big views then show shiny colours,
    the references normal, and editing stays on the same indices.
- **Tools:**
  - pencil (S), with brushes of 1-3 px and a hover preview of the pixels it would set;
  - fill (Z): a 4-connected flood of one index, within the frame;
  - replace (R): every pixel of the clicked index becomes the swatch's, in the frame shown or, with **All frames**, in
    every frame; one undo step; the hover highlights the pixels it would change, in their new colour. The pencil's rules
    hold (a new battle index takes a slot, 13 at most; only the transparent swatch clears). The replaced index's slot
    counts as free when no pixel keeps it, so on an icon with 13 colours replacing one colour everywhere with a new one
    just moves that slot to the new battle index;
  - eyedropper (Q, or Alt+click), on either side;
  - undo and redo (Ctrl+Z, Ctrl+Y);
  - save (Ctrl+S);
  - frame thumbnails: the icon's 2 frames, or a sheet's frames, named as on the follower pages.
- **Swatches:**
  - For an icon: battle indices 1-15, a dot on the ones the icon has, the two greys and transparency. Painting a
    battle index the icon lacks takes a slot no pixel uses any more, or a new one. A 14th slot is refused with a
    warning.
  - Index 0 can only be painted with the transparent swatch. The eyedropper ignores transparency, so a coloured pixel
    never turns transparent by accident.
- **Edit colour:** changes one colour of the battle `normal.pal` or `shiny.pal` (the one shown), after a warning that it
  also changes the battle sprite and the sheets or shiny followers. For an opted-out sheet it changes its own
  `sprite.pal`.
- **Sheets:**
  - The walking and follower sheets whose `"palette"` names the group. Rows that play another group's sheet through a
    map have no sheet of their own, so they aren't listed.
  - The opted-out sheets (Castform, Cherrim, Hydrapple, the ??? Arceus) are listed under their species. They are
    edited on their own `sprite.pal`; the page says they have no battle link and no shiny colours, and sampling the
    battle sprite is off for them.
- **Navigation:**
  - The species in dex order, with a search picker whose entries show their marks (✎ hand-edited, ✓ checked) for the
    kind shown, and ◀ ▶ beside it (keys `[` and `]`) to step through the species the filter shows.
  - **Show** filters by the marks of the kind shown (an icon, or the walking and follower sheets): All, Not checked,
    Checked, Hand-edited, Generated only, each with its count. For sheets a species counts as checked when all its
    sheets are, hand-edited when any is, and species without sheets (and a female icon, which shares its species'
    sheets) are left out.
  - Stepping or picking keeps the kind (the icon, or a sheet of the same kind, follower or walking, where the species
    has one) and the frame. Stepping goes on from the species shown even when the filter no longer shows it (one just
    marked checked under Not checked).
  - The header says Saved or Unsaved changes, and the sprite's marks. Leaving unsaved changes asks first.
- **Save:** `POST /api/sprite-editor/save` runs `sprite_edit.py save-icon|save-sheet`, which checks and writes the
  files as `apply` does: the PNG via `nitro_2d.write_indexed_png`, the JSON via `datajson`.
  - An icon is saved canonical: repeated battle indices merged, unused slots dropped.
  - A sheet keeps its size, coloured from `normal.pal`, or `sprite.pal` when opted out.
  - A refused save writes nothing.
- **Tests:**
  - `test_sprite_edit.py`: keys and paths, the round trip, the checks, the save command, sheets, opt-out colours and
    paths outside `res/field/actors`.
  - `test_sprite_edit.py` also: the marks file's round trip and layout, `mark`, and saves marking hand-edited (and an
    unchanged save not).
  - `test_icon_remap.py`'s `test_apply_writes_the_chosen_icons`: choices, `same`/`kept`/`--force`, and kept icons
    marked hand-edited (unmarked with `--force`, nothing written on a dry run).
  - `editor/tests/sprite-editor.test.ts`: slot add, reuse and limit, colours and samples, the palette swap, pencil,
    lines and fill, replace (frame, all frames, the slot limit, transparency, undo), the marks, the filters and
    stepping, `canonicalIcon` against Python's, and the server's save and mark round trips. All on fixtures.
- **Next:** the in-game work: icons drawn from `icon_battle.png` with their slots coloured from the battle palettes
  (section 6). Then retire the vanilla banks and the review page.

### 15.3 The review marks (2026-11-23)

After the hand fixes the checklist became two marks per sprite, kept apart for the icons and for the walking and
follower sheets, in `res/paperwhite2/sprite_review.json` (`sprite_edit.py` reads and writes it in the data tools'
layout; its lists sorted):

    {"icons": {"hand_edited": [icon keys], "checked": [icon keys]},
     "followers": {"hand_edited": [sheet keys], "checked": [sheet keys]}}

A sheet's key is its folder under `res/field/actors` (`followers/bulbasaur`, `pokemon/bulbasaur`).

- **hand_edited:** drawn by hand rather than as `icon_remap.py apply` generated it.
  - Seeded with the 78 icons whose `icon_battle.png`/`.json` differed from what `apply` generates from the review's
    choices (candidates regenerated in a worktree; `apply --dry-run`'s "kept"). They are the checklist's 78 less
    Appletun (art in progress, no `icon_battle` yet) and Garbodor (its pixels and slots equal its candidate), plus
    Bulbasaur and Ivysaur, fixed after. No sheets yet.
  - `sprite_edit.py save-icon|save-sheet` adds the sprite when the save changes its pixels (or an icon's slots), so
    every save from the Sprite Editor that changes something marks it. Palette colour edits write the battle palette,
    not the sprite, and mark nothing.
  - `apply` keeps hand-edited icons unless `--force`, as before, marks any it keeps that aren't marked yet, and unmarks
    those `--force` overwrites.
- **checked:** the user's quick pass over every sprite: the Sprite Editor's **Mark checked** / **Checked ✓** toggle
  (key C) on the sprite shown, `sprite_edit.py mark KIND KEY checked on|off` through `POST /api/sprite-editor/mark`.
  The Review section shows the progress of both kinds (checked / total) and their hand-edited counts.

## 16. In game (2026-11-23)

The in-game work has its own file, `icon-screens.md`: the build's packing, the runtime API, the fallback onto the
banks, and every icon screen with its route and status. Phase 1 converted the party list and removed the editor's Icon
review page (`icon_remap.py` and `res/paperwhite2/icon_remap_choices.json` stay as its record). Phase 2 converted the PC box
with section 5.1's route: 8bpp icons on OBJ extended palettes in bank G (icon-screens.md section 3).
