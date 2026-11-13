# Battle sprites (MCSS): how they work, and a rig editor

Research for drawing new Gen 5 battle sprites (first a Spiky-eared Pichu form, later new species) and for an editor
that builds them from parts: import the parts, set each part's box, place and layer the parts, and animate them.
Researched 2026-11-12 from the code (`src/system/mcss.c`, `src/system/mcss_tool.c`, `src/system/pokegra.c`,
`src/ov168/btlv_mcss.c`, `lib/nnsys/src/g2d/g2d_MultiCellAnimation.c`) and the data (`res/pokemon/`, the White 2
archive `a/0/0/4`). Built since: new form groups (section 6) and the art's export and import on the existing rig
(section 14); the rig editor is not. "Verified" means read in the code or decoded from the data; "inferred"
means reasoned and not checked in the game.

The decoder and renderer that prove the decoding are in the ROM session's scratchpad
(`.../scratchpad/mcss_research/`: `mcss_decode.py` decodes one side of a sprite to JSON and renders it, `survey.py`
measures every sprite in `res/pokemon/`, renders and dumps in `out/`). They are prototypes of the importer below.

## 1. Summary

- A battle sprite is **MCSS** ("multi-cell sprite system", swan's name): a Nitro multi-cell animation whose parts are
  drawn as **textured 3D quads** of one 256×128, 16-colour image, not as 2D OBJs. Every part can move, turn and
  scale freely, per frame, and the system draws a shadow from the same quads.
- Each sprite side (front, back) is five files plus the image: cells (`NCER`), cell animations (`NANR`), multi-cells
  (`NMCR`), the multi-cell animation (`NMAR`), and MCSS's own **bin file**, which says where each cell's pixels are in
  the image and where they go. The game draws from the bin file's quads; the cells' OBJs are not drawn.
- A species, form or egg is a **group of 20 files** in `a/0/0/4` (`ARCID_POKEGRA`); `GetPokemonDataIDBase`
  (`pokegra.c`) picks the group. Female and shiny change only the image or the palette, never the rig.
- `res/pokemon/<species>/` holds all of it today: the images as indexed PNGs and the Nitro files as they are stored.
  The packer (`tools/data/pokemon_graphics.py`) can replace any existing sprite, rig included, and since 2026-11-12
  appends the hack's own form groups (section 6); a new species still needs a base of its own.
- Rules for new art (section 5): one 256×128 sheet per side, 16 colours (index 0 transparent) shared by front and
  back, the shiny palette indexing the same pixels, at most 64 parts in practice, feet at the origin.
- Proposed: a `rig.json` plus part PNGs per side as the editable source, a converter that writes the six game files,
  and an importer that turns every existing sprite into a rig, so new art can start from an original's rig
  (Spiky-eared Pichu from Pichu's).

## 2. Where the sprites live

### 2.1 The archive and its groups (verified)

`a/0/0/4` is `ARCID_POKEGRA` (`include/constants/arc.h`, `GetPokemonGraphicsARCID`). In White 2 it has 15,065
members:

| Members | Groups | What |
| --- | --- | --- |
| 0 – 12,999 | 0 – 649 | species 0 (none) to 649 (Genesect), group = species |
| 13,000 – 13,659 | 650 – 682 | the Pokéstar Studios species, group = species − 2 (the egg, 650, and the bad egg, 651, have none) |
| 13,660 – 13,679 | 683 | the egg (`POKEGRA_EGG`) |
| 13,680 – 13,699 | 684 | Manaphy's egg |
| 13,700 – 15,019 | 685 – 750 | the forms with sprites of their own (`POKEGRA_FORM_FILES` 0x3584), 66 groups, by `sprite_offset + form − 1` |
| 15,020 – 15,032 | | the Substitute doll (`BtlvMcss_SetSubstitute`, which hard-codes 0x3aac and 0x3ab2) |
| 15,033 – 15,064 | | the palettes of forms that only change colours (Arceus), normal and shiny (`POKEGRA_FORM_PALETTES` 0x3ab9) |

The ranges are full: the 66 form groups end exactly where the Substitute starts, and the Pokéstar groups end where the
egg's start (section 6).

`GetPokemonDataIDBase` (`src/system/pokegra.c`) computes a group from the species, form, sex, shininess, side and
egg flag:

- egg: group 683, or 684 for Manaphy;
- form > 0 (and below the species' form count): if the species' `palette_forms` is set, only the palette moves, to
  `0x3ab9 + (sprite_offset + form − 1) × 2 + shiny`; otherwise the group is `685 + sprite_offset + form − 1`
  (`PERSONAL_FORM_SPRITE_OFFSET`, `PERSONAL_PALETTE_FORMS`, `PERSONAL_FORM_COUNT` of form 0's personal record,
  `res/pokemon/<species>/data.json` `forms` and `palette_forms`);
- species above the bad egg: group = species − 2; otherwise group = species.

Then the side adds 0 (front) or 9 (`POKEGRA_FILE_BACK`), and the files are `GetPokemon*DataNo`'s slots:

| Slot (front / back) | File | `res/pokemon/<species>/` | Read by |
| --- | --- | --- | --- |
| 0 / 9 | 96×96 still, characters in the four-OBJ layout, LZ11 | `front_single.png` | `GetPokemonSingleCellCharacterDataNo`, 2D screens |
| 1 / 10 | female still, or empty | `front_single_female.png` | same |
| 2 / 11 | 256×128 sheet, linear (bitmap) characters, LZ11 | `front.png` | `GetPokemonCharacterDataNo`, MCSS |
| 3 / 12 | female sheet, or empty | `front_female.png` | same |
| 4 / 13 | cells `NCER` | `front_cells.ncer` | `GetPokemonCellsDataNo` |
| 5 / 14 | cell animations `NANR`, LZ11 | `front_animations.nanr.lz11` | `GetPokemonCellAnimeDataNo` |
| 6 / 15 | multi-cells `NMCR` | `front_multi_cells.nmcr` | `GetPokemonMultiCellsDataNo` |
| 7 / 16 | multi-cell animation `NMAR` | `front_multi_animations.nmar` | `GetPokemonMultiCellAnimeDataNo` |
| 8 / 17 | MCSS bin file | `front_info.bin` | `GetPokemonBinFileDataNo` |
| 18 | normal palette `NCLR`, 16 colours | `normal.pal` | `GetPokemonPaletteDataNo` |
| 19 | shiny palette | `shiny.pal` | same, + shiny |

Pichu is group 172, members 3,440 – 3,459 (sizes verified in `extract/w2_us/files/a/0/0/4`).

- **Sex** moves only the characters (slots +1), and only when the female file isn't empty
  (`GFL_ArcSysGetDataLength`): a female sprite is a second image on the **same rig and palette**. 96 species have
  female images in `res/pokemon/`.
- **Shiny** moves only the palette (slot 18 → 19). Front and back **share** the group's two palettes.
- `SetupPokemonLoaderFSTool` (`mcss_tool.c`) fills an `MCSSLoadInfo` with the seven member numbers; `MCSSSys_Add`
  loads them (`LoadMCSSGraphicsData`).

### 2.2 Who draws which form (verified)

- **MCSS (animated):** battle (`src/ov168/btlv_mcss.c`), summary (`src/ov207/p_sta_sub.c`), trade
  (`src/ov194/pokemontrade_3d.c`, `ov192`, `ov193`), evolution (`src/ov284/evolution_demo_view.c`), egg hatching
  (`src/ov307/egg_demo_view.c`), Hall of Fame (`src/ov265/hall_of_fame_demo_main.c`), the intro (`src/ov294/intro_mcss.c`),
  the Pokédex forms page (`src/ov298/pokedex_detail_form.c`) and the hack's Info page
  (`src/paperwhite2/ov298/paperwhite2_pokedex_info.c`).
- **The 96×96 still (2D OBJs, `PokeGra_LoadClAct*`):** the PC boxes (`ov255`), the Pokédex list and old Info page
  (`ov299`, `ov296`), move tutor (`ov258`), Hall of Fame PC (`ov256`), Mystery Gift (`ov197`), the GTS (`ov214`),
  the starter choice (`ov316`), field scripts that show a Pokémon (`ov036/scrcmd_poke_disp.c`) and others.
- **The musical** has its own archive, `a/0/5/1` (`ARCID_MUSICAL_POKEGRA`, `src/ov209/musical_mcss.c`), laid out by
  Black and White's personal data (`res/pokemon/<species>/musical/`). A new form isn't in it (inferred: the musical
  shows form 0).

## 3. The formats, decoded

All six files were decoded for Pichu (front and back) and Charizard (front and back), and every sprite in
`res/pokemon/` was measured (1,504 sides). Renders: `out/pichu_front_mc0.png` (assembled), `out/pichu_front_atlas.png`
(the sheet with each cell's quads outlined), `out/pichu_front_anim.png` (the animation every 8 frames), and the same
for `pichu_back` and `charizard_front`/`charizard_back`. The assembled renders match the game's look, which proves the
transforms below.

### 3.1 The sheet (`front.png`, NCGR)

- 256×128 pixels, 4 bits per pixel, **linear** (rows of pixels, not 8×8 tiles: the NCGR's `RAHC` has 16×32 tiles,
  depth 3, format 1, 16,384 bytes), LZ11-compressed in the archive. All 1,504 sides are 256×128.
- 16,384 bytes is exactly `MCSS_TEX_SIZE` (0x4000), each MCSS slot's share of texture VRAM (`load->charAddr =
  texBase + index × 0x4000`). The sheet is uploaded whole (`NNS_G2dLoadImage2DMapping`, 3D main VRAM) and used as one
  texture with `GX_TEXREPEAT_ST | GX_TEXFLIP_ST`: past an edge it repeats mirrored.
- The parts are packed anywhere on it; nothing requires an order. Pichu's sheet also holds pixels no quad uses (a
  closed-eyes strip).
- `tools/data/nitro_2d.py` reads and writes it (`character_pixels(..., linear=True)`, `patch_characters`).

### 3.2 The palette (`normal.pal`, `shiny.pal`, NCLR)

One 16-colour row (32 bytes), colour 0 transparent. `MCSS_PLTT_SIZE` 0x20 per slot. MCSS keeps a copy to blend
(`MCSS_BlendPalette`: status colours, fades) and the battle tints it (`BtlvMcss_SetPaletteBlend`). The shadow uses
the system's own shadow palette (`MCSS_SHADOW_PLTT`), not the sprite's.

### 3.3 The bin file (`front_info.bin`, MCSS's own)

The structures are `MCSSBin`, `MCSSCell`, `MCSSQuad` and `MCSSBinTail` in `src/system/mcss.c`.

```
u32 count                 number of cells (equals the NCER's cell count in all 1,504 sides)
u16 width, height         the sprite's box in pixels
s16 offsetX, offsetY      the box's offset from the origin
MCSSCell cells[count]     48 bytes each: quad, quad2 (6 fx32 each: x, y, width, height, s, t)
--- aligned down to 4 ---
u8  idleNodeCount         0xff: no idle (the sprite never stops)
u8  stopFlags             MCSSSys_GetStopCellFlags; see below
u8  idleNodes[]           cell animation indices that keep playing while idle
```

- A **quad** is a rectangle of the sheet (`s`, `t`, `width`, `height`, in pixels as fx32) placed at `x`, `y` relative
  to the cell's origin, in units of 1/16 world unit: `x / 4096 × 16` pixels, y up. All 18,004 quads in the ROM are
  at whole pixels, and all but 3 are multiples of 8 in size.
- **quad2** is optional (width 0 = none); it is drawn just in front of the first quad. 932 sides use it, typically
  for eyes over a head: Pichu's head cell 1 is a 24×24 head with a 16×8 eyes quad2.
- `width`, `height`, `offsetX`, `offsetY` are the sprite's box, which the egg hatching and evolution centre by
  (`MCSS_GetHeight`, `MCSS_GetOffsetY`). `tools/paperwhite2/pokedex_sprites.py` found it a few pixels off for some
  sprites and 64 off for Chandelure, so the hack measures its own (section 5.4). Pichu front: 31×45, offset (4, 3).
- **idle nodes** (verified in `btlv_mcss.c`): when the battle's idle pause starts, `BtlvMcss_IdleTask` stops the
  multi-cell animation and every cell animation except those listed, which go on playing. Charizard front lists 15
  (its tail flame, cells `hi`/`hi02`): it freezes and only the flame flickers. 1,317 sides list none (all freeze),
  127 have 0xff (never pause; their NMAR's sequence is labelled `nonstop`).
- **stopFlags** is read only by the move effects' scripts (`BtlvEffvm`, work values 44 – 52, `BtlvMcss_GetUnk`). It is
  1 for 166 species' fronts, all of them flying or floating (Abra, Aerodactyl, Beldum, Bronzor, Crobat, Gastly, Ho-Oh,
  ...): inferred to mean **airborne**, for effects that skip grounded Pokémon.
- Tail length is 4 bytes for 1,469 sides; 35 have more idle nodes (up to 21).

### 3.4 The cells (`front_cells.ncer`)

`CEBK` with one cell per bin cell (same count, same index), `LABL`, `UEXT`. Each cell lists OAM entries (affine,
double-size, 8×8 to 64×64) whose tiles are the same rectangles as the bin's quads, read as 32-tile-wide rows of the
sheet (Pichu's cell 0: one 16×16 OBJ at tile 103 = column 7, row 3 = s 56, t 24, the quad's). **MCSSSys_Draw never
reads the OBJs**: it only uses the cell index that the cell animation gives, as an index into the bin file. The NCER
is still loaded (`GFL_G2DIOReadNCER`) and handed to `NNS_G2dInitMCAnimationInstance`, so it must exist with the right
cell count; an importer can generate the OBJs from the quads (inferred safe; matches what the originals hold).

The cell attribute's low bits are NitroSystem's bounding radius (inferred). The `LABL` block holds the **cell
animations'** names, a copy of the NANR's (18 names for Pichu's 9 cells).

### 3.5 The cell animations (`front_animations.nanr.lz11`)

One sequence per animated part per pose set, LZ11-compressed. `ABNK` header, then sequences (16 bytes: frame count,
loop start, `animType` with the element type in the low 16 bits, play mode, first frame) and frames (8 bytes: result
offset, duration in frames, 0xBEEF). A frame's result is one of (`MCSS_GetAnimSrt`):

- **index** (`NNS_G2D_ANIMELEMENT_INDEX`): a cell number only;
- **index + SRT**: cell, rotation (u16, 65536 = a full turn), scale x and y (fx32, negative mirrors), translation
  x, y (s16 pixels);
- **index + T**: cell and translation.

Frames are **steps, not interpolated**: Game Freak keyed most parts every 6 frames (10 per second) with small rotations
and 1-pixel moves (Pichu's ear: 0°, −15°, −25°, ... per 6 frames). Changing the cell index per frame swaps the part's
picture (Charizard's flame cycles cells 16, 15, 17). Play modes: 2 (loop) in 26,144 sequences, 1 (once) in 23. Over
all sprites: 3,511 index, 17,580 SRT, 5,076 T sequences; 67,714 frames scale a part and 937 mirror one. The labels
name the parts (`body_a`, `head_a`, `ear_r_a`, ... `tail_b` for Pichu; Japanese romaji such as `atama` head, `kubi`
neck, `karada` body, `hane` wing, `hi` fire for Charizard).

### 3.6 The multi-cells (`front_multi_cells.nmcr`)

A multi-cell is one **pose set**: the list of nodes (parts) that make the whole Pokémon. Each node is 8 bytes
(`NNSG2dMultiCellHierarchyData`): the cell animation sequence it plays, its position (s16 x, y, y down; this is the
part's pivot), and `nodeAttr` (bits 8 – 15 the cell animation instance, bits 0 – 3 the play mode; 0x20 is set in all
27,047 nodes and nothing reads it).

- **Layering is the node order**: node 0 is in front, the last node at the back (`MCSSSys_Draw` steps the depth by
  0x100 per quad, and draws in reverse while translucent). Pichu front, front to back: left hand, left ear, head,
  right ear, body, right hand, tail, left foot, right foot.
- The game shares cell animation instances by index (`NNS_G2D_MCTYPE_SHARE_CELLANIM`). Play mode 0 (reset, Pichu)
  restarts each part's sequence when the multi-cell changes; 1 (continue, Charizard) plays it on from the multi-cell
  animation's total time (`SetNodeDataToCellAnim_`), so a switch keeps the parts' phase.
- Pichu has two multi-cells (its `_a` and `_b` sequences, 9 nodes each, same positions); Charizard front two (the
  second differs only in the flame node). The most in the ROM: 6 multi-cells (Ferroseed), 35 nodes (Kyurem's form 2
  back), 61 cells (Zekrom's back), 82 cell sequences (Scolipede's front).

### 3.7 The multi-cell animation (`front_multi_animations.nmar`)

The same `ABNK` format; each frame picks a multi-cell (with an optional SRT of the whole sprite, in 167
sequences, or a translation, in 214) for a duration. The sequences are the sprite's **animations**:

- **0, "stay"**: the loop played all the time. Pichu: multi-cell 0 for 240 frames, then multi-cell 1 for 108, looping.
- **1, "stop"**: the idle pause's pose (Charizard: 432 frames on multi-cell 1, whose flame node keeps animating).
- 1,408 sides have one sequence, 89 two, 7 three or four. The labels are NITRO-CHARACTER-style defaults
  (`CellAnime0`, 1,206 sides) or Game Freak's (`stay`/`stop` 58, `nonstop` 127, `egg_ani01/02` for the egg).

### 3.8 How a frame is drawn (verified, `MCSSSys_Draw` and `MCSS_DrawQuad`)

For each node of the current multi-cell, from the multi-cell animation's SRT (`mcSrt`) and the node's cell
animation's SRT (`cellSrt`), each quad's corner (u, v) of the rectangle maps to the screen as:

```
p = (quad.x + u, quad.y − v)                     pixels, y up
p = scale(cellSrt.sx, cellSrt.sy) then rotate(cellSrt.rotZ) then move(node.x + cellSrt.px, −(node.y + cellSrt.py))
p = scale(mcSrt.sx × sprite scale) then rotate(mcSrt.rotZ + sprite rotation) then move(mcSrt.px, −mcSrt.py)
p = billboard at the sprite's 3D position (or orthographic, for sprites that ask for it)
```

So a part turns and scales about its **node position** (its pivot), and the quad's x, y place the picture relative
to that pivot. The sprite's origin is its **feet**: Pichu's nodes sit at y −4 to −23, above the origin. A negative
sprite scale x mirrors it (`flip`, texture `s = 512 − s − width`), which the trade and the hack's Pokédex use.
The shadow is the same quads, flattened (`shadowRotX`, default 0xc400) with the shadow palette at half alpha.

## 4. How the game drives the animation (verified)

- **Battle** (`src/ov168/btlv_mcss.c`): `BtlvMcss_Add` adds the sprite at its position's default place and scale
  (tables at the top of the file: about 1.0 – 1.4 by position), with a shadow offset from a short per-species table
  (`BtlvMcss_GetShadowOffset`) or the default. Sequence 0 loops. At each loop end (`BtlvMcss_OnAnimationEnd`) a
  random check, more likely each time (1 in 3, 2, 1), starts the idle pause: sequence 1 if there is one, the
  multi-cell animation stopped, only the idle nodes playing, for 48, 56 or 64 frames (`BtlvMcss_IdleTask`), then
  sequence 0 again. Sprites with idle 0xff never pause. Sleep and other statuses slow the animation to a third
  (`BtlvMcss_SetAnimSpeed(..., 0x555)`) and tint the palette. Move effects can play a sequence
  (`BtlvEffvm_CmdMcssPlayAnim`) and read the stop flags.
- **Summary** (`p_sta_sub.c`) plays and pauses it (`MCSS_PauseAnimation`).
- **Egg hatching and evolution** play sequences once and centre by the bin's box (`EggDemoView_SetAnimation`).
- **The hack's Pokédex Info page** draws the front mirrored, standing on the middle that `pokedex_sprites.py`
  measured (section 5.4).

## 5. Constraints for new art

### 5.1 Hard limits (verified)

- **Sheet:** 256×128, 4bpp, one per side (front, back), and one per sex if the female differs. The parts of every pose
  and every picture swap (blinks, flames) must fit on it.
- **Colours:** 15 plus transparent (index 0), one palette for both sides and both sexes; the shiny palette is a second
  16 colours for the **same indices**.
- **Polygon IDs:** a translucent sprite gives each node its own polygon ID, clamped at 63 (`MCSS_DrawQuad`), so keep
  nodes at 64 or fewer (the ROM's most is 35).
- **Cells, sequences:** no fixed limit in the code beyond the file formats (u16 counts); the heap sizes of the screens
  that show sprites are the real bound, so stay near the ROM's maxima (61 cells, 82 sequences).
- **Quad 2:** at most two quads per cell; use a second cell or node for more.
- **Spinda:** `mcss_tool.c` hard-codes Spinda's bin member (`POKEGRA_SPINDA_BIN` 6548) and draws spots into its sheet
  at fixed pixels; a Spinda redraw must keep the head where the spots go.

### 5.2 Conventions to keep (inferred from the data)

- Quads at whole pixels and in multiples of 8, which also lets the NCER's OBJs be generated.
- Keys every 6 frames, parts turning by small angles, 1-pixel moves; a loop of a few seconds (Pichu 348 frames,
  Charizard 432).
- The origin at the feet; a floating Pokémon is drawn above the origin and sets the airborne flag.
- Front and back drawn at the same scale as the originals (the box of a small Pokémon such as Pichu is about 31×45).

### 5.3 The 96×96 still

Every group also needs `front_single.png` and `back_single.png` (and female ones when the sheet has them): 96×96,
same palette, stored as four OBJs (64×64, 32×64, 64×32, 32×32: `SINGLE_CELL_96` in `nitro_2d.py`,
`PokeGra_CellCharsToImage`). These are what the boxes and the other 2D screens show. **Measured (2026-11-12) over
the 1,667 stills of res/pokemon (each side and sex):** a still is the "stay" animation's first frame with its visible
pixels centred in the 96×96 (their box's middle at 47 to 48), 860 of them pixel for pixel; 359 have the same shape with
up to 8 pixels' colours touched up (Pichu's front: 8, an eye's and a cheek's shading), 205 up to 16 pixels, and 243
differ more (the larger sprites, whose still is cut or redrawn, and the Pokéstar props, which are bigger than 96). So
a still can be drawn from the sheets (battle_sprite.py does, section 14) and touched up after.

### 5.4 The hack's measured middles

`ARCID_POKEDEX_GRA` (`a/1/5/7`) member 161 is the hack's table (`tools/paperwhite2/pokedex_sprites.py`, packed by
`pokedex_evo.py`): a byte per `a/0/0/4` member up to 15,020, how far above its feet the middle of a sheet's visible
pixels is on its first frame, which the Info page stands each sprite by. It is computed from `res/`, so a replaced
sprite needs nothing; new groups past 15,020 need the table (and `SPRITE_MEMBERS`) extended.

## 6. What the build can and can't do today

- `configure.py` runs `tools/data/pokemon_graphics.py pack res/pokemon <game> ...` for `a/0/0/4`, `a/0/0/7`,
  `a/0/5/1`, `a/1/6/5` and `a/2/2/9`.
- `pack` walks the **original** archive's members: PNGs must keep their sizes (256×128, 96×96), palettes are patched,
  and the Nitro files and bin are copied as they are (`raw`). So **replacing an existing sprite works now**, rig and
  all, if the converter writes the six files in place (the NANR must be LZ11-compressed as `.nanr.lz11`).
- Besides the hack's form groups (below) it adds no members, and it refuses a file where the original has none
  (`"the archive has no file for this"`), so it can't give a species a female sprite it lacked.
- **A new form** (Spiky-eared Pichu as Pichu's form 1) needs a group at 751, where the Substitute is. Two options:
  move the Substitute and Arceus's palettes up (change `POKEGRA_FORM_PALETTES` in `pokegra.c`, the 0x3aac/0x3ab2 and
  other Substitute members in `BtlvMcss_SetSubstitute`, and the packer's 15,020/15,033), or leave them and put the
  hack's form groups after the palettes with a `#ifdef PAPERWHITE2` base in `GetPokemonDataIDBase` for
  `sprite_offset ≥ 66`. The second touches less. Either way Pichu's `data.json` gets `forms.count` 2 and
  `sprite_offset` 66, the form needs its own personal record, icon (`a/0/0/7`, same group layout), and footprint
  forms entry (`a/2/2/9`), and the musical keeps form 0.
- **Built (2026-11-12), the second option:** the hack's form groups (`sprite_offset + form − 1` from 66) follow the
  Arceus palettes, from member 15,065 (`POKEMON_FORMS_SPRITE_FILES`, `include/paperwhite2/pokemon_forms.h`, used by
  `GetPokemonDataIDBase` under `PAPERWHITE2`), 20 files a group in group order; the Substitute and the palettes stay
  where they are. `pokemon_graphics.py pack` appends them after walking the original archive, each file in the format
  of its species' own (so a copy of Pichu's art packs to Pichu's bytes), and the icons' after the original ones at
  1,510 (no index change; their banks come from the icon PNGs' palettes into a generated table). The middles table
  (section 5.4) runs to the groups' end. The Spiky-eared Pichu is group 66 with copies of Pichu's files; no form
  record, so no personal record, and its footprint is Pichu's. See forms-and-species.md section 11.
- **A new species** past the Pokéstar ones would be group species − 2 = 683, the egg's: the egg and the forms would
  have to move, or new species get their own base. This is part of the larger new-species work, not just sprites.
- `tools/data/trainer_graphics.py` is the model: its sources are a list of constants plus directories, it builds
  every file from source, reuses the original bytes where they come out the same, and appends new sprites.

## 7. Prior art (vocabulary only)

The file types are NitroSystem's (NCGR, NCLR, NCER, NANR, NMCR, NMAR), made by Nintendo's NITRO-CHARACTER, whose
default names (`CellAnime0`) show in the labels. General Nitro editors (Tinke, NitroPaint) open the cells and
animations; swan (ds-pokemon-hacking) names MCSS's functions. None of them is relied on here; this doc stands on the
code and the decoded files.

## 8. The editor today

`editor/` (Graphics & Palettes, `editor/README.md`) has Screens, Sprite sheets (whole OBJ sheets packed by a tool, so
far the Pokédex area icons), Item icons, Palettes (every `.pal`, including a Pokémon's `normal` and `shiny`) and a
shinies page. The Pokémon editor shows `front_single.png` in normal and shiny colours. Nothing reads the battle
sheets' rigs or plays an MCSS animation.

## 9. What an importer must produce

For each group (species, form or egg), for each side:

1. `front.png` / `back.png`: the 256×128 indexed sheet, all parts packed, index 0 transparent.
2. `*_cells.ncer`: one cell per picture of a part, OBJs generated from its quads, labels optional.
3. `*_animations.nanr.lz11`: one sequence per node per pose set, frames of index / SRT / T, durations, loop mode.
4. `*_multi_cells.nmcr`: one multi-cell per pose set: nodes in front-to-back order with sequence, pivot, instance
   index and play mode.
5. `*_multi_animations.nmar`: sequence 0 the loop, sequence 1 the idle pose if wanted.
6. `*_info.bin`: the quads of each cell, the box (computed from the visible pixels), idle nodes (or 0xff), airborne
   flag.
7. `*_single.png`: the 96×96 still.

Per group: `normal.pal`, `shiny.pal`; optional `*_female.png` and `*_single_female.png` (same rig). For a new group:
the archive members, the index formula's change, `data.json` forms, icon, footprint and the middles table (section 6).

## 10. Proposed source format

Keep the original Nitro files as they are for the sprites nobody edits. A rigged sprite gets a source folder, and a
converter (`tools/paperwhite2/mcss_rig.py`, stdlib only) writes the seven files of section 9 from it, at first into
the same folder for the existing packer, later inside the packer:

```
res/pokemon/pichu/form_1/rig/
  front.json, back.json         the rigs
  parts/front_head.png ...      one indexed PNG per part picture, in the group's palette
```

```json
{
  "side": "front",
  "pictures": [
    {"name": "head", "image": "parts/front_head.png", "box": [0, 0, 24, 24], "origin": [12, 12],
     "overlay": {"image": "parts/front_eyes.png", "box": [0, 0, 16, 8], "at": [2, 9]}}
  ],
  "nodes": [
    {"name": "hand_l", "picture": "hand_l", "pivot": [6, -9]},
    {"name": "head", "picture": "head", "pivot": [0, -18]}
  ],
  "poses": [
    {"name": "a", "play_mode": "reset",
     "tracks": {"head": [{"frame": 0, "rot": 0, "move": [0, 0]}, {"frame": 6, "rot": -15, "move": [0, -1]}]}}
  ],
  "animations": [
    {"name": "stay", "loop": true, "steps": [{"pose": "a", "frames": 240}, {"pose": "b", "frames": 108}]},
    {"name": "stop", "loop": true, "steps": [{"pose": "a", "frames": 60}]}
  ],
  "idle_nodes": ["tail"],
  "airborne": false,
  "key_every": 6
}
```

- **pictures** are the cells: a part's picture with its box (the quad's size) and origin (where the pivot sits on
  it), and an optional overlay (quad2). The converter packs them on the sheet (shelf packing, 8-pixel aligned) and
  fails if they don't fit 256×128.
- **nodes** are the parts in front-to-back order with their pivots.
- **poses** are the multi-cells; a track's keys hold rotation in degrees, scale, move and an optional picture swap.
  Keys may be sparse and **tweened** by the editor; the converter bakes them to steps every `key_every` frames (or
  every frame), since the game doesn't interpolate.
- **animations** are the NMAR sequences; "stay" first.
- Box and middle are computed, never typed.

An **"Import from ROM files"** command turns every existing sprite into this format (the decoder in
`mcss_decode.py` already reads all of it), and the converter writing them back byte-equal for an unedited rig is the
round-trip test, as the other packers have.

## 11. Proposed rig editor features

1. **Pictures:** import part PNGs (or cut them from one drawn PNG with a box tool), check colours against the group's
   palette (as the Sprite sheets page does), set each box and origin, add an overlay. Show the packed sheet and the
   space left.
2. **Nodes:** place pictures as parts by dragging their pivots on a canvas with the feet line and the box; reorder
   layers by drag; show OBJ-free bounds (the quad outline) per part.
3. **Keyframes:** a timeline per pose with a track per node: rotate, scale, move, swap picture; tweening with easing,
   baked to the game's steps; onion skin; copy a pose.
4. **Animations:** "stay" as a list of pose steps, "stop" and the idle nodes, the airborne flag, loop length.
5. **Preview:** play at 60 frames per second with MCSS's maths (section 3.8), normal and shiny, front and back,
   female, mirrored, with the shadow; in battle positions and scale; the idle pause as the battle triggers it; the
   96×96 still beside it, regenerated from frame 0.
6. **Start from a sprite:** open any original's rig (for Spiky-eared Pichu, Pichu's 9 parts and its two poses) and
   redraw its pictures in place.
7. **Checks:** sheet full, more than 15 colours, more than 64 nodes, parts outside the box the screens expect, a
   female sheet whose parts don't match the male's layout.

## 12. Open questions

- New form placement: decided and built, a hack base after the palettes (section 6). New species are still open.
- Should the rig be the only source for edited sprites (the packer builds from it) or a source that writes the Nitro
  files (two copies in git)? The trainer packer's approach suggests the former once the converter round-trips.
- The stop-flags byte as "airborne": check in a battle effect that reads work value 44 – 52.
- ~~Whether the originals' 96×96 stills are exactly frame 0~~: half are, the rest touched up (section 5.3).
- Whether any screen's heap limits the cell or sequence counts below the ROM's maxima (test a large rig on the summary,
  trade and Pokédex).
- How a female sheet with different part sizes would work: it can't, since the rig is shared; the editor should
  force the female's pictures into the male's boxes.

## 13. Recommended order

1. Turn `mcss_decode.py` into a tested reader in `tools/paperwhite2/` with a renderer, and the converter's writer;
   prove the round trip on all 1,504 sides.
2. Replace an existing sprite end to end (for example Pichu's front redrawn on its own rig) through the current packer
   and test it in battle, summary, Pokédex, evolution and the boxes.
3. Decide and build new form groups (section 6), then add Spiky-eared Pichu as Pichu's form 1 with its icon,
   footprint, personal record and middles.
4. Build the rig editor in this order: preview player, import from ROM files, pictures and nodes, keyframes and
   tweening, checks.
5. New species, with the index formula for groups past the Pokéstar species.

## 14. Built (2026-11-12): the art's export and import, on the existing rig

The first step of the rig editor's road: a sprite's **art** can be taken out, redrawn in a pixel-art editor and put
back, while its rig (cells, parts, poses, animations, info) stays as it is. `tools/paperwhite2/mcss.py` reads a side's
rig from its five files and draws any frame as MCSS does (section 3.8; the prototype of `mcss_decode.py`, tested);
`tools/paperwhite2/battle_sprite.py` exports, checks and imports; the Pokémon Editor's **Battle sprite** card, on every
species' page and every form with art of its own (Spiky-eared Pichu's `form_1/` included), runs them through the
server (`GET /api/battle-sprite/export`, `POST /api/battle-sprite/check`, with `write` to import).

### 14.1 Export (a zip, `<species>[_form_<n>]_battle_sprite/`)

- `front.png`, `back.png` (and `front_female.png`, `back_female.png` where the group has them): the 256×128 sheets,
  the res/ files byte for byte (indexed PNGs whose palette is `normal.pal`, index 0 transparent);
- `front_single.png`, `back_single.png` (and the female ones): the 96×96 stills, as they are;
- `<image>_shiny.png`: a shiny-coloured copy of each (the same indices, `shiny.pal` as the PNG's palette), the easiest
  way to see and edit the shiny palette in Aseprite, LibreSprite or GIMP: recolour its palette, import it;
- `normal.pal`, `shiny.pal` (JASC, which Aseprite's Load Palette and GIMP read);
- `guide/<sheet>.png`: the sheet three times its size with each cell's rectangle outlined in its own colour and
  numbered (a second quad, drawn over the first, as `N+`), and a legend: each piece's rectangle (`x,y w x h`) and the
  parts that show it, from the cell animations' labels (`head`, `ear_r`; Game Freak's romaji glossed: `atama (head)`,
  `mimi_l (ear left)`);
- `preview/<sheet>.png` and `_shiny.png`: the assembled first frame;
- `README.txt`: the rules (keep each piece inside its rectangle; 16 colours, index 0 transparent, one palette for
  front, back, female and stills; the shiny palette recolours the same indices; the sizes; Spinda's spots; the
  female's shared rig).

### 14.2 Import: the checks

Any subset of those files, or the zip itself (`guide/` and `preview/` are skipped), named as the export names them:

- **Errors** (nothing is written): a sheet not 256×128 or a still not 96×96; a female picture for a group without
  one (the packer can't add a member the original archive lacks); the front, back or stills giving one palette index
  two colours (they share the palette); more colours than the free indices allow (15 besides transparent); a shiny
  copy whose pixels give one index two colours, or two shiny copies changing one shiny colour differently; a palette
  file of fewer than 16 colours; stills both given and asked to be drawn.
- **Colours:** an indexed PNG keeps its indices where its colours are the palette's; an index below 16 in a new colour
  recolours that index (`normal.pal` changes, and every PNG of the group is written with the new palette, since the
  packer reads a PNG's colours against the `.pal`); a palette an editor compacted or reordered on saving is matched
  by colour; an RGB(A) PNG's colours take the palette's indices, a new colour a free one (with a warning to set its
  shiny colour). Transparent: index 0, a tRNS-transparent index, alpha under 128, or in an RGB PNG the colour of index 0.
- **Shiny:** `shiny.pal`, or a `*_shiny.png`: indexed, with the indices of the exported or the imported art, its
  palette's colours; otherwise the colour under each index's pixels. Only the colours it changes count.
- **Warnings:** changed pixels outside every piece's rectangle (the game never shows them; the preview marks them in
  red), an empty sheet, a normal colour changed with its shiny one unchanged, a new colour's index, Spinda's head
  (its spots are painted at fixed pixels), a still cut to 96×96.
- **Notes:** the colours changed, the shiny colours changed, how many of the 15 colours the sprite uses.
- With nothing changed nothing is written: an export imported unchanged leaves res/ byte for byte (the files are
  compared with what would be written).

### 14.3 The preview

The tool draws the new art on the existing rig with `mcss.render`: for each side, each of its sheets (male, female),
the "stay" animation (multi-cell animation sequence 0) a frame every 4 game frames over its loop (at most 90 frames),
as a strip of frames on one canvas (the union of the frames' visible pixels), in the normal and the shiny palette,
with the current art's first frame for comparison; the stills normal and shiny; and each sheet with its rectangles and
the changed pixels outside them. The card plays the strips at the game's speed (2× zoom). Rendering composes the three
SRTs (cell animation, node pivot, multi-cell animation) into one affine map per quad and samples each pixel's centre,
nearest; a node with play mode 0 restarts its sequence with each multi-cell frame, mode 1 runs on the animation's time.
About 1 to 2 seconds for a large sprite with a female (Abomasnow, Kyurem).

### 14.4 Stills from the sheets

"Make stills from the sheets" (`--stills-from-sheets`) draws each still as the first frame of the new sheets: where its
visible box is the size of the current still's, at the same place, else centred (the originals' placement, section
5.3). Pichu's back still comes out unchanged; its front loses the original's 8 touched-up pixels.

### 14.5 Proven

- Every one of the 752 groups with a battle sprite in res/pokemon (species, forms, egg, Pokéstar) exported and imported
  unchanged: no errors, no warnings, nothing to write; and stills drawn from the sheets for all of them without error.
- Pichu, Charizard, Abomasnow (female), Spinda, Unown's form 1 and the Spiky-eared Pichu through the CLI in write mode:
  res/ unchanged, and the `--hack` ROM byte for byte the one before (`e3f841fb...`).
- An RGBA re-encoding and a compacted, reordered indexed palette of Pichu's sheet import as nothing changed
  (`tools/paperwhite2/test_battle_sprite.py`, 12 tests; `editor/tests/battle-sprite.test.ts`, 3).
- An edited import in the editor (the Spiky-eared Pichu's ears recoloured to the cheeks' red on both sheets, a stray mark
  outside the pieces, and the shiny copy's red made green): the preview warned of the mark, Apply wrote `front.png`,
  `back.png`, `shiny.pal`; "Make stills from the sheets" then redrew both stills. In py-desmume on a copy of the user's
  save: the summary, a double battle's back sprites and the Info page show the red ears, and the shiny Pichu green ears
  and cheeks. Reverted after.

### 14.6 What the rig editor builds on

`mcss.read_rig` already gives the rig in the shape section 10 proposes to edit (cells with their quads, part names,
cell animations with their frames, multi-cells with nodes, pivots and play modes, the animations, the box, idle nodes
and stop flags), and `mcss.render` draws any frame of any animation; `battle_sprite.py`'s guide, checks and preview
are the editor's "Pictures" step for a fixed layout. Next: write the rig back (NCER, NANR, NMCR, NMAR, bin) from
`read_rig`'s shape, byte for byte for an unedited rig, then let pieces move and resize.
