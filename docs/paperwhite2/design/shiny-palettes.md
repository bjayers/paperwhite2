# Shiny palettes: design

Design for the shiny palette system decided in `ROADMAP.md` ("Shiny palettes"), researched 2026-10-30 from the code
and data. Nothing here is built. "Verified" means read in the code or run on the data; "inferred" means reasoned,
not checked. The dry-run scripts are in the ROM session's scratchpad (`.../scratchpad/shiny2/`: `remap.py`,
`dry2.py`, `icons.py`, `walk.py`, `rend2.py`, `rend3.py`, results in `dry.json`) and are the prototype of the remap
tool below.

## 0. What is decided, and what this design adds

Decided (ROADMAP, user, 2026-10-29): the variant is `((pid >> 8) & 0xff) % N` with the shiny check unchanged; N is
per species and form and mostly 1; the unused Pokémon data bytes stay clean; one palette per species and form
(normal plus each shiny variant) shared by every graphic; the 174 own shiny follower sheets go; icons keep the three
shared banks for normal and use a slot cache for shiny; the editor gets a palette and index editor.

Findings that change or sharpen it (details in the sections):

1. **Re-indexing is lossy for normal colours**, and badly so for the walking sprites (section 2). Median colour
   change 19 (own follower sheets) and 30 (walking sprites) RGB units, with 4 and 67 graphics over 40. The design
   therefore has two modes per graphic, `shared` (re-indexed, the user's model) and `mapped` (the graphic keeps its
   palette and indices; a 16-entry map says which battle colour each index plays), and recommends `mapped` for the
   564 walking sprites. At runtime both are the same thing: a palette patch.
2. **The follower palette survives `BillboardActorScene_TrimMatTex`** (section 4.2), provided it is patched into the
   resource before the upload, which `FldBillboardActor_LoadMaterial` allows on every load path.
3. **The Shiny Candy keeps PID bits 8-15** (`PaperWhite2_MakeShinyPID` keeps the low 18 bits), so a candy does not
   pick a random variant; the Pokémon already has one from its original PID. `ROADMAP.md` says the candy gives a
   random one, which is only true in that the PID was random.
4. **PID bits 13-15 are inside the variant byte and also choose the box data's block order**
   (`PML_PkmGetParamBlockCore`): free for generation, but a debug action that rewrites the byte relies on the PID
   setter re-encrypting (`PokeParty_SetParam(PKM_PARAM_PID)` does, as Make shiny uses it).
5. `plist_battle.c` is the *partner* Pokémon's plate in the party screen of a multi battle; the in-battle party screen
   is probably `ov287/b_plist_*.c` (inferred from the names; `research.md` names `plist_battle.c`).

## 1. The `res/` layout and formats

### 1.1 Per species and form

The directory is the one that holds `normal.pal` and `shiny.pal` today: `res/pokemon/<species>/`, a sprite form's
`res/pokemon/<species>/form_<n>/`, and the palette-only forms (Arceus) at `res/pokemon/arceus/form_<n>/`
(`pokemon_graphics.py battle_file`; the 16 form pairs are members 15033-15064 of `a/0/0/4`, `POKEGRA_FORM_PALETTES`).
Every battle group, 751 + 16 of them, may gain:

```
normal.pal       as now: 16 colours, 0 transparent. Index k is a colour role for every graphic of the group
shiny.pal        as now: variant 1. Unchanged, so a/0/0/4's members 18/19 of every group stay byte for byte
shiny_2.pal ...  variant 2 and on, same 16 entries, same index roles as normal.pal
shiny.json       the variants' names and count; absent means one variant named "Shiny"
```

```json
{
    "$schema": "../shiny.schema.json",
    "variants": [{ "name": "Teal" }, { "name": "Gold" }]
}
```

`variants[i]` uses `shiny.pal` for i = 0 and `shiny_<i+1>.pal` for i >= 1; a missing file stops the build with its
name. The runtime number of a shiny is the 0-based `((pid >> 8) & 0xff) % count`; in code and in the follower
registry "variant 0" is normal and "variant k" is the k-th shiny, so the shiny is `variant = index + 1`. A cap of 15
variants per group (a registry nibble); the schema says so. Index 0 of every variant is transparent and ignored.
The editor's palette editor edits these files; its rule (never reorder a palette without remapping the pixels that
use it) extends to "every variant has the same index roles", which it can enforce by editing the 16 slots together.

Forms with their own palettes: a form with a sprite is its own group (`form_<n>/`), so it has its own `normal.pal`,
`shiny*.pal` and `shiny.json`; Arceus' palette-only forms are 16 more groups with the same files. The runtime
resolves (species, form) to the group exactly as `GetPokemonDataIDBase` does (`src/system/pokegra.c:268`), and the
build resolves it with the same rules from `res/pokemon/*/data.json` (`sprite_offset`, forms, `palette_forms`).
A form that `GetPokemonDataIDBase` collapses to form 0 (`form >= formCount`) shares the base group's palettes.

Musical sprites (`a/0/5/1`, `MUSICAL_POKEGRA_FORM_PALETTES`) keep variant 1 only (section 7, question 6).

### 1.2 Graphics that link to a group: the `"palette"` key

`res/field/actors/<code>/data.json` (`field_actor.schema.json`) gains an optional `"palette"` object on sprites:

```json
"palette": {
    "pokemon": "zekrom",          // a directory of res/pokemon: "<species>" or "<species>/form_<n>"
    "mode": "shared",             // or "mapped"
    "map": [0,4,5,1,...],         // mapped only: the battle index each of the 16 sheet indices plays
    "locked": true                // optional: the remap tool never rewrites this sprite
}
```

- **`shared`** (the user's model): `sprite.png`'s pixel indices are the group's palette indices. There is no
  `sprite.pal` and no `map`. The packer writes the group's `normal.pal` as the texture set's palette. Editing
  `normal.pal` recolours the sheet at the next build.
- **`mapped`**: `sprite.png` and `sprite.pal` stay as they are (the original walking sprites stay byte for byte);
  `map[k]` says which battle colour index sheet colour k stands for. The normal look is the sheet's own. A variant's
  palette is derived by the shift rule: `variant[k] = clamp(sprite.pal[k] + group.shiny[map[k]] - group.normal[map[k]])`
  per channel in 5-bit, index 0 and pure black/white kept (the rule of `research.md`, which reads right for zekrom,
  braviary, chandelure, victini and others). The tool writes `map`; a person can edit it.
- **Per-graphic override**: a sprite directory may hold `shiny.pal`, `shiny_2.pal`, ... beside `sprite.png`. A file
  there replaces the derived or shared palette for that variant for this graphic only, in either mode. This is the
  escape hatch for a graphic that cannot share (the editor's "override this graphic" button writes it).
- A sprite without `"palette"` behaves as today (own `sprite.pal`, nothing patched), which every non-Pokémon actor
  keeps.

### 1.3 Followers

A follower row's `data.json` already has `"follower": { "species", "form", "sex", "shiny", ... }`. Changes:

- `follower.shiny` (bool) becomes `follower.variant` (0 normal, k shiny variant k; the migration script converts
  `false`/`true` to 0/1). The row's palette group is *derived* from `follower.species` and `follower.form`, so
  follower rows need no `"palette"` key unless they override.
- The 174 own normal sheets (`followers/<name>/sprite.png`) get `"palette": {"pokemon": ..., "mode": "shared"}` (or
  `mapped` where the dry run says so) and lose `sprite.pal`. Their `_shiny` twins lose their directories' PNG and
  palette and get `"sprite": "<normal code>"`, as the other 1113 shiny rows already do.
- The 975 shiny rows that point at a walking sprite (`"sprite": "OBJ_CODE_POKEMON_..."`) and the 138 that point at
  another follower's normal sheet need nothing in their JSON: their palette is the group's variant, derived through
  the sheet owner's `"palette"` (for the walking sprites, `mapped` with a `map`).
- A follower whose own sheet is used in several rows (`"sprite"` references) must have the same group in all of them;
  the build checks `follower.species/form` of a row against its sheet owner's `"palette"."pokemon"` and stops on a
  mismatch unless the row has its own `"palette": { "pokemon": ... }`.

**The 564 walking sprites** (`res/field/actors/pokemon/<name>/`, `OBJ_CODE_POKEMON_*`, 564 distinct ones referenced
by the shiny rows): their `data.json` gains `"palette": { "pokemon": "<group>", "mode": "mapped", "map": [...] }`
and nothing else changes: `sprite.png` and `sprite.pal` are the original game's, so `a/0/4/8`'s 975 original members
stay byte for byte. (If the user chooses `shared` for them anyway, the tool rewrites `sprite.png` and drops
`sprite.pal`, and those members change; section 2 shows what that does to the normal colours.)

### 1.4 Icons

Normal icons are unchanged: `icon.png` plus a bank of `res/pokemon/shared/icon_palettes.pal` (the box's
`icon_palettes_box.pal`), chosen by `sPokeIconPalettes` (`src/system/poke_icon.c:45`). The three shared banks are
generic colours, not the species' (60-icon sample: the nearest battle colour to an icon colour is 36 RGB units away
at the median; 54 icons have merges), so an icon cannot be re-indexed to the battle palette without ruining it, which
is why icons are the exception.

Shiny icons: a **derived icon palette**, one 16-colour palette per (icon, variant), in the icon's own index space:
`icon_shiny[k]` by the shift rule above through a map from the bank's colour k to a battle colour. The map is
generated like a `mapped` sprite's. Files, all optional and only for review or override:

```
res/pokemon/<species>/[form_<n>/]icon_shiny.pal       override of variant 1's palette
res/pokemon/<species>/[form_<n>/]icon_shiny_2.pal     override of variant 2's ...
res/pokemon/<species>/[form_<n>/]icon.json            {"map": [16 battle indices]}  (generated, editable)
```

Female icons (`icon_female.png`) share the species' palettes (the battle palette ignores sex), with their own map
only if they differ. The generated palettes are packed into `a/0/0/7` (section 3); the derivation reads the battle
palettes, so editing a variant recolours the icon too, and an override file stops that for one icon.

Quality caveat (measured): icons map to the battle palette poorly, so the derived icons need a review pass, like the
follower shinies. A guided map (aligning the icon with the 1/3-scale battle sprite to pair pixels) is a possible
improvement; not tried.

## 2. The remap tool, and the dry run

### 2.1 Tool

`tools/paperwhite2/remap_palette.py` (stdlib; `tools/paperwhite2/` because it serves Paper White 2's sprites and the
editor, and `tools/data/` packers must not depend on it). It reuses `tools/data/nitro_2d.py` for PNG and palette I/O.

```
remap_palette.py report   [--followers] [--walking] [--icons N] [--csv FILE] [--render DIR]
remap_palette.py apply    CODE... [--mode shared|mapped] [--match nearest|injective] [--force]
remap_palette.py seed-map CODE...        # write only "map" (mapped mode); sprite untouched
remap_palette.py remap-png IN.png --from A.pal --to B.pal --match ... -o OUT.png   # the editor's index editor
```

- Candidates: the group's palette indices 1-15 that its sprites use (`front`, `back`, `front_female`, `back_female`
  PNGs; including the female art matters: `frillish_female` went from 65 to under 50 mean error), else all.
- `nearest`: each sheet colour to the nearest candidate in RGB (fewest error, merges colours). `injective`: the
  pixel-count-weighted minimum-cost assignment (Hungarian algorithm, stdlib) so distinct sheet colours stay distinct
  where candidates allow (keeps shading, more error). `shared` uses `injective`; `mapped` uses `nearest`, since
  merging costs nothing there.
- `report` prints per graphic: colours used, colours lost to merging, mean, p95 and max error (RGB Euclidean, pixel
  weighted), the share of pixels over 40, and the 3 worst colour pairs; with `--render` a before/after PNG each.
- **Hand-edited sheets**: `apply` records the SHA-1 of the PNG and `sprite.pal` it wrote in
  `res/paperwhite2/palettes/remap_state.json`. A sprite whose files differ from the record, whose `"palette"."locked"`
  is true, or that has no record but whose `data.json` already has a `"palette"` is skipped with a message and its
  report row marked `kept`; `--force` overrides. Nothing is rewritten without a record to compare, and git has the
  old PNG.
- The editor calls `remap-png` for its index editor and `report` for the review pages.

### 2.2 Dry run: the 174 own follower sheets, to the battle normal palette

Method: every normal own sheet (`res/field/actors/followers/<code>/`, the 174 with a `_shiny` twin), its sprite
palette's colours mapped to the species'/form's `normal.pal`, errors in 8-bit RGB distance, pixel weighted, frame
art only (index 0 excluded). Run on the current `res/`; the numbers are `dry.json`.

| | nearest | injective |
| --- | --- | --- |
| per-sheet mean error: median / p90 / max | 19.3 / 33.1 / 50.7 | 22.0 / 35.6 / 51.2 |
| per-sheet p95 error: median / p90 | 35.4 / 65.9 | 43.6 / 82.4 |
| per-sheet worst pixel: median / p90 | 48.0 / 80.6 | 74.2 / 168.7 |
| pixels over 40: median / p90 sheet | 1.8% / 31.7% | 7.3% / 39.6% |
| sheets with mean over 20 / 30 / 40 | 82 / 32 / 4 | 103 / 41 / 10 |
| sheets that lose colours to merging | 143 (306 colours) | 29 (81 colours) |

Histogram of mean error (nearest), by 10s: 0-9: 18, 10-19: 74, 20-29: 50, 30-39: 28, 40-49: 3, 50+: 1. One sheet
already is in the battle palette's index order (carracosta, 0.0); 6 are under 5.
Worst by injective mean: scraggy 51, cobalion 48, victini 42, duosion 42, woobat 41, swoobat 41, cottonee 41,
tornadus_form_1 40, petilil_female 40, eelektrik 40, druddigon 40, musharna 39. The worst are species whose follower
art is coloured differently from the battle sprite (scraggy, victini), not a tool failure.

What a 20-unit mean error looks like: a visible but not wrong tint (see the renders). What the shiny looks like:
the re-indexed sheet with the battle shiny palette, against today's Pokeweb shiny sheet: median 21-22, p90 56-61,
max 168 RGB units (nearest / injective), mostly where Pokeweb's colours were wrong (research.md's suspect list).
For comparison, the `mapped` derivation's shiny against today's: median 24.6, p90 63.5, max 168. Both are as far from
today's palettes as the research's 22 against Pokeweb's, which is expected: today's are the thing being replaced.

### 2.3 Dry run: the 564 walking sprites

Same method against each referencing follower's group (564 measured, none missing):

| | nearest | injective |
| --- | --- | --- |
| mean error: min / median / p90 / max | 6.8 / 29.5 / 41.2 / 104.5 | 7.1 / 32.7 / 46.3 / 104.5 |
| sprites over 20 / 30 / 40 | 513 / 272 / 67 | 528 / 346 / 134 |
| sprites with merges | 537 | 98 |

Re-indexing these would visibly recolour original game NPCs (togepi turns pink, Unown form 9 grey; the tool's
nearest-colour is poor when the walking sprite and the battle sprite are coloured differently). This is the data
behind recommending `mapped` for them.

### 2.4 Dry run: icons

60 random species' icons (seed 5, list in `icons.py`) to the battle normal palette: mean error min 15.7, median 36.4,
p90 52.5, max 64.5 (nearest); 38.7 median injective; 48 icons have merges under nearest. As said in 1.4: icons
cannot be re-indexed; the number says how loose the icon-to-battle colour map is, so the derived shiny icons are
approximate.

### 2.5 Renders (all in the scratchpad)

Columns left to right: battle front normal, battle front shiny | follower today normal, follower today shiny
(Pokeweb), follower re-indexed (injective) with battle normal, re-indexed with battle shiny | icon normal, icon
derived shiny (shift rule). Rows as named.

- `/tmp/claude-1000/-home-riku-paperwhite2/ed33b65d-513a-5b30-a72b-6382677189d9/scratchpad/shiny2/reindex_a.png`:
  zekrom (today's shiny is the wrong tan; the new one is the teal-grey), haxorus, braviary, serperior.
- `/tmp/claude-1000/-home-riku-paperwhite2/ed33b65d-513a-5b30-a72b-6382677189d9/scratchpad/shiny2/reindex_b.png`:
  frillish_female (pink follower, blue battle palette: the weak case), carracosta (identical indices), scraggy
  (high error, harmless), swoobat.
- `/tmp/claude-1000/-home-riku-paperwhite2/ed33b65d-513a-5b30-a72b-6382677189d9/scratchpad/shiny2/walking.png`:
  walking sprites dialga (error 7), claydol (30), togepi (41), unown_form_9 (105). Columns: original, nearest
  re-indexed, injective re-indexed, `mapped` shiny, re-indexed shiny. The `mapped` shiny keeps the normal look exactly
  and gives plausible shinies for dialga and claydol; unown_form_9's shiny is blue (a mismatch to check; the tool must
  report "this group's palette has no colour like the sheet's").

## 3. The build pipeline

**Committed sources** (res/): the palettes and `shiny.json` (1.1), sprite PNGs (re-indexed ones), `data.json` palette
keys, override palettes, `remap_state.json`.

**Generated at build, hack builds only** (the precedent is `HACK_ARCHIVE_MEMBERS` in `configure.py`, which packs an
archive apart and then has a hack tool add members, and `tools/paperwhite2/season_preview.py`, which writes a header
from JSON). New tool `tools/paperwhite2/shiny_palettes.py`:

| Output | What | Size (estimate) |
| --- | --- | --- |
| `a/0/0/4`, members from 15065 | the variant palettes of groups with more than one variant, NCLR of 72 bytes like members 18/19, `shiny_2` on, consecutive per group | 72 B per extra variant |
| `a/0/0/7`, members from 1510 | the derived or overridden shiny icon palettes: one NCLR (72 B) per icon slot and variant | about 750 x 72 B = 54 KB for one variant each |
| `a/0/4/7`, member 24 | the follower palette patches: `u16 index[code - 0x3000]` (0xffff none) then 32-byte palettes | 2 x 2,574 B + 32 B per patched code; 1,287 shiny rows: about 46 KB |
| `build/.../shiny_variants.h` (generated C header) | per battle group: variant count and first extra member (u8 and u16); per icon slot: first icon palette member | about 3 B x 767 + 2 B x 770 = 3.8 KB in main |

The archives are packed as before and then given members: `pokemon_graphics.py` is not changed to write them, so
**the matching build's archives stay the original's** (`hack_members` runs only with `--hack`, as for `a/0/9/6`).
`HACK_ARCHIVE_MEMBERS` is extended by three entries (`a/0/0/4`, `a/0/0/7`; `a/0/4/7` is already built by
`field_actor_data.py`, which gains the member through `following_data.py`'s `members()` next to the registry's).

**`field_actor_data.py`**:
- reads `"palette"`; for a `shared` owner, writes the texture set's palette from the group's `normal.pal` instead of
  `sprite.pal` (`sprite()` currently demands both files); for a `mapped` owner, from `sprite.pal`;
- for every code whose resolved palette differs from its sheet owner's normal palette (every shiny row; every
  variant row), computes the 16 colours (shared: the group's variant palette, `mapped`: the shift rule, override files
  win) and writes the code's patch entry;
- the 174 own shiny sheets are no longer owners: `owners`/`sprite_index` shrink, so `a/0/4/8` goes from 1,323 to
  1,149 members and the sheets' 870,408 bytes (verified: the 174 `_shiny` texture sets summed) are gone; later
  members renumber, which the packer already writes into the table's `resource` field and the registry's member
  column (the registry's "resources" header field changes with it);
- the registry gets the variant column (below).

**`following_data.py`**: registry row byte 4 `shiny` (0/1, checked `> 1` in `FollowingRegistry_Stream`,
`src/paperwhite2/ov036/paperwhite2_following_registry.c`) becomes `variant` (0-15). The sort key
`species * 2048 + form * 8 + sex * 2 + shiny` (in the packer and in the sorted check of `FollowingRegistry_Stream`)
becomes `((species * 256 + form) * 3 + sex) * 16 + variant`. Row size and layout are unchanged, so it is a new
registry *version* (5; the full package uses 2 and 4). The positioning table follows the registry's rows.

**Variant rows.** Each extra variant of a group needs a code per (sex, form row) of the group's followers, like
`OBJ_CODE_FOLLOWER_X_SHINY` today: `OBJ_CODE_FOLLOWER_X_SHINY_2`, an `obj_codes.txt` constant, a directory with a
`data.json` (`"sprite"` the normal code, `follower.variant` 2), a 28-byte table record, a 24-byte registry row and a
12-byte positioning row: about 64 bytes plus 34 for the palette, per variant row. They are created by
`shiny_palettes.py sync` (run by the editor and by hand), not at build time, because `obj_codes.txt` is a source;
the build fails with "shiny.json says 3 variants, the followers have 2" if they disagree. Rationale for rows over a
runtime variant argument: the field caches materials per object code (`FldBillboardActor_RegistCachedMat`,
`FldBillboardActor_FindCachedMat`, `src/ov036/field_actor_billboard.c`), so two variants of one species need two
codes anyway, and a map's NPC can name a variant (`model: OBJ_CODE_FOLLOWER_X_SHINY_2`).

**Byte-for-byte checks that stay valid**:
- `a/0/0/4` members 0-15064 and `a/0/0/7` members 0-1509: unchanged by this design (variants and derived icons are
  appended); add a check that the first members of the hack build equal the original's, and keep the existing
  dump/pack round trip (`pokemon_graphics.py extract` then `pack`), which ignores the new files.
- `a/0/4/8`'s 975 original members stay identical if the walking sprites are `mapped` (only `data.json` changes); a
  hack check can compare them to the original's.
- The matching build (`python3 configure.py w2_us && ninja`, no `--hack`): code unchanged (every hook under
  `#ifdef PAPERWHITE2` with the original in `#else`), archives `a/0/0/4` and `a/0/0/7` original. `a/0/4/7` and
  `a/0/4/8` already differ from the original in any build that has the followers (they pack the followers
  always); the per-archive `check_file` stamp of a plain configure for those two is therefore already failing or
  irrelevant (inferred; not run). This design adds no new difference to the matching archives.
- No longer valid: "packed `a/0/4/7`, `a/0/4/8` equal the hack ROM's member for member" (`STATUS.md` step 2/3). The
  user's `res/` is the source of truth after this; keep the imported Pokeweb palettes in git history and in
  `extract/pw2_v021`.
- `check_memory.py`: main grows by the header's tables and the small code, about 4-5 KB of the 155 KB left (STATUS).

## 4. The runtime, per graphic

### 4.1 Battle sprites and pokegra (central)

**Choke point** (verified): `GetPokemonPaletteDataNo(arcId, species, form, sex, rare, dir, egg)`
(`src/system/pokegra.c:137`) returns `formPalette`, or `base + POKEGRA_FILE_PALETTE + rareOffset`. `rareOffset` is
`rare` straight through `GetPokemonDataIDBase` (`pokegra.c:268`), which also gives the palette-only forms'
`POKEGRA_FORM_PALETTES + (spriteOffset + form - 1) * 2 + rare`. Every palette file number passes through it. MCSS
reads the NCLR by that number each time (`GFL_G2DIOReadNCLR(info->arcId, info->palette, ...)`, `src/system/mcss.c:1033`);
**there is no palette cache in MCSS** to invalidate, so a variant needs no cache key.

**Change**: let `rare` carry the variant: bit 0 shiny, bits 8-15 the 0-based shiny index, so existing `rare` users
(`if (rare)`) still work. In `GetPokemonDataIDBase`, under `#ifdef PAPERWHITE2`, split `rare` into `shiny` and
`variant`; for `variant > 0` the palette file is
`PaperWhite2_ShinyVariantFile(group, variant)` (generated header: first extra member + variant - 1), else as now.
`group` is `file / 20` for regular and form-sprite groups and `751 + (formPalette - POKEGRA_FORM_PALETTES) / 2` for
the palette-only forms; both are known inside the function.

New API, `include/paperwhite2/shiny_palettes.h`, `src/paperwhite2/main/paperwhite2_shiny_palettes.c` (main, since
battle (overlay 168), field (36), box (255), party (165) and others use it):

```c
u32 PaperWhite2_ShinyVariantCount(u32 species, u32 form);                  // 1 when none; from the generated tables
u32 PaperWhite2_PkmGraphicsRare(BoxPkm *pkm);                               // 0, or 1 | variant << 8
u32 PaperWhite2_GraphicsRare(u32 species, u32 form, u32 id, u32 pid);      // the same from the fields
```

The shiny check stays `PML_UtilPIDIsRare`. `PaperWhite2_PkmGraphicsRare` decrypts as `PML_PkmIsRare` does.

**Callers** (verified by grep; the helper replaces `PML_PkmIsRare` / `PokeParty_IsRare` where the value goes to a
graphics function, and only there; the Pokédex's, the box search's and the summary's star use stay as they are):

| Path | Where | Takes a Pokémon? |
| --- | --- | --- |
| All MCSS sprites of a `PartyPkm`/`BoxPkm`: battle (`ov168/btlv_mcss.c:1287` via `SetupPokemonLoaderByPartyPkm`), summary (`ov207/p_sta_sub.c:892,898`), trade (`ov194/pokemontrade_3d.c:634`), evolution (`ov284/evolution_demo_view.c:577-592`), egg hatch (`ov307/egg_demo_view.c:414`), intro (`ov294/intro_mcss.c:80`), Hall of Fame demo (`ov265/hall_of_fame_demo_main.c:439`) | `SetupPokemonLoaderByBoxData` (`src/system/mcss_tool.c:~90`), the one site of `PML_PkmIsRare` for them | yes: one edit covers all |
| 2D sprites of a `BoxPkm`: box (`ov255/box2_obj.c:968`), Hall of Fame demo objects, move tutor, mystery gift, cygnus_flow, event_chatot | `PokeGra_LoadClActPaletteByBoxData` / `PokeGra_LoadClActCharsByBoxData` (`pokegra.c:430-448`) and the Spinda path (`pokegra.c:371`) | yes: 3 edits in `pokegra.c` |
| Field "show Pokémon" (`ov036/fld3d_ci.c:1085`, `ov036/scrcmd_poke_disp.c:126`) | the script gives a `rare` value; `fld3d_ci.c` reads `PokeParty_IsRare(pkm)` at its creation | yes at the creator |
| Evolution demo's own sprite (`evolution_demo_view.c:909`) | `rare = PokeParty_IsRare(view->pkm)` | yes |
| World Trade, Mystery Gift album (`ov214/worldtrade_mypoke.c:544`, `ov197/mystery_album.c:1805`) | direct `GetPokemonPaletteDataNo` with `PokeParty_IsRare(pkm)` | yes |
| Hall of Fame PC (`ov256/hall_of_fame_pc_obj.c:256,306`) | `PML_UtilPIDIsRare(poke->trainerId, poke->personality)`: PID is there | yes: `PaperWhite2_GraphicsRare` |
| Pokédex pages and lists (`ov296`, `ov298`, `ov299`), `psel.c` | species, form, a stored `rare` flag; no PID | no: variant 0 (the first shiny) |
| Musical (`ov209/musical_mcss.c`, `ov210/musical_system.c`) | its own archive `a/0/5/1` | not changed |

### 4.2 Followers and field actors

**The load path** (verified). A follower is a normal billboard actor: `FldActSys_LoadStaticBillboardActor(system,
code)` (`field_actor_billboard.c:254`, called by `GetFollowerCode`'s caller at `paperwhite2_following_field.c:1900`)
reads the config, `FldBillboardActor_LoadConfigMaterial` reads the sprite's texture set with
`GFL_G3DSysReadArcToolResource`, and `FldBillboardActor_LoadMaterial(billboardActor, objCode, sizeIdx, atlasIdx,
resource, mode)` (`field_actor_billboard.c:1039`) turns it into a material. Its three modes:

| mode | callers | what happens to the resource |
| --- | --- | --- |
| -1 (flags 0, the static and cached loads, **followers**) | `FldBillboardActor_LoadCachedMaterial` | `BillboardActorSys_LoadSingleUseTexMaterial`: `GFL_G3DResUploadTexData` (texels and palette to VRAM), then `GFL_G3DResFree(resource)` |
| 1 (the pending/async actors, `FldBillboardActor_SetupPendingActor`) | async loader | `BILLBOARD_ACTOR_LOAD_TRIM`: `BillboardActorScene_AddMaterialNewTex` (uploads in `BillboardActorMaterial_BindTexture`), then `BillboardActorScene_TrimMatTex` |
| 2 (flags & 2) | `LoadCachedMaterial` | `BILLBOARD_ACTOR_LOAD_TRANSFER`: the resource is kept; faces and the palette are copied to VRAM later from it (`BillboardActorSys_TransferFace`, `BillboardActorSys_TransferPltt`, 0x20 bytes from `GFL_G3DResGetTexPaletteData`) |

**The open question, answered: the palette survives `BillboardActorScene_TrimMatTex`.** It does not matter that
Trim discards it from memory. `BillboardActorScene_TrimMatTex` (`src/gfl/billboard.c:224`) calls
`GFL_HeapResize(data, tex + texInfo.ofsTex - data)`: it shrinks the CPU copy of the resource to the *start of the
texel data*, dropping the texels and everything after them, which is where the palette data lives
(`GFL_G3DResGetTexPaletteData` is `tex + plttInfo.ofsPlttData`, after the texels). But the upload has already
happened: `AddMaterialNewTex` binds the texture first, and `GFL_G3DResUploadTexData` (`src/gfl/g3d_system.c:432`)
flushes the whole resource and runs `NNS_G3dTexLoad` and `NNS_G3dPlttLoad`, so the palette is in VRAM before Trim runs.
So: **patching the 16 colours in the resource's memory before the upload works in all three modes**; patching it
after Trim (or after a mode -1 free) would not, since the CPU copy is gone, and would need a VRAM write to
`plttAddr`. In mode 2 the retained resource, patched before it is stored, is also what `TransferPltt` copies later.

**The hook.** At the top of `FldBillboardActor_LoadMaterial`, under `#ifdef PAPERWHITE2`, before the `mode == -1`
test: `PaperWhite2_PatchSpritePalette(billboardActor->system, objCode, resource)`: look the code up in member 24 of
the actor table archive (`system->actorConfigArc`, as `ReadRegistry` does with `GFL_ArcToolReadRange`): read the
`u16` at `(objCode - FOLLOWING_CODE_BASE) * 2`; if not 0xffff, read 32 bytes at the palette's offset and copy
indices 1-15 (not 0, the transparent one) into `GFL_G3DResGetTexPaletteData(resource)`. One 2-byte and one 32-byte
read per material load, none per frame. `objCode` is `config->uid` (`LoadConfigMaterial`) or `pending->objCode`
(async), the cache's own key, so each variant code gets its own material and cache entry. A code outside the
followers' range reads nothing. Put it in `src/paperwhite2/ov036/paperwhite2_shiny_palettes_field.c` (the field
overlay), the hook one `#ifdef` line.

Inferred, to test: that the texture set's palette is 16 colours at `ofsPlttData` for the `pokeweb` format (the
`TransferPltt` 0x20-byte copy says so, and `sprite_texture_set` writes one 32-byte palette).

**The follower registry's variant column** (`paperwhite2_following_field.c`):
- `FollowingPokemon.shiny` (`include/paperwhite2/following.h:91`) becomes `variant`; `SelectFollower` (line ~1774)
  sets it from `PaperWhite2_GraphicsRare`: 0 if not shiny, else index + 1. `FollowingPokemon_IsSame`
  (`paperwhite2_following_trail.c:88`) compares it.
- `GetFollowerCode`'s scoring (line ~1693) `score += shiny == mon->shiny ? 1 : -20` becomes: equal variant +2; both
  shiny but different variants 0 (so a missing variant row falls back to another shiny, not to normal); else -20.
- Registry loading and packing change as in section 3.

### 4.3 Icons: the slot cache

**Facts** (verified). `PokeIcon_GetPalette(species, form, sex, egg)` and `PokeIcon_GetPaletteOfPkm(BoxPkm *)`
(`src/system/poke_icon.c:147,168`) return a bank number 0-2 (the box's greyed state is a fourth palette, 3); a screen
loads the whole bank file once with `ClActSys_LoadPlttEx(arc, PokeIcon_GetPaletteFile(), vram, slot * 32, heap)` (the
box uses `PokeIcon_GetAltPaletteFile()`) and then each icon actor sets `ClActor_SetPalette(actor, bank, mode)`. The
OAM palette is the resource's base slot plus the actor's number (`ClActOamMan_EntryOam`, mode 0 adds to the cell's,
mode 1 replaces it; both include the base from the proxy: `clact_itcm.c:54`), so a shiny icon in slot S is
`ClActor_SetPalette(actor, S - baseSlot, ...)` with the same actor and resource, as long as S - baseSlot is 0-15.
About 35 overlays load the icon palettes (the list is `PokeIcon_GetPaletteFile` callers); only the three below matter
for shinies at first.

**Design.** `PokeIconPalCache` (in `paperwhite2_shiny_palettes.c`, main):

```c
typedef struct { u8 vram; u8 baseSlot; u8 first; u8 count; u8 used; u16 file[8]; u32 res[8]; HeapID heap; } PokeIconPalCache;
void PaperWhite2_PokeIconPalCache_Init(PokeIconPalCache *cache, u32 vram, u32 baseSlot, u32 firstFree, u32 count, HeapID heap);
u32  PaperWhite2_PokeIconPalCache_Get(PokeIconPalCache *cache, ArcTool *arc, BoxPkm *pkm, u32 bank); // palette number for ClActor_SetPalette
void PaperWhite2_PokeIconPalCache_Release(PokeIconPalCache *cache);    // ClActSys_FreePltt each
```

`Get`: if the Pokémon is not shiny (or an egg), return `bank` (today's behaviour). Otherwise compute the icon slot and
variant, find the palette's member in `a/0/0/7` (generated table); if some cache slot holds that member, return its
offset; else if a slot is free, `ClActSys_LoadPlttRange(arc, member, vram, slot * 32, 0, 1, heap)`, remember the
resource, return its offset; else **return `bank`** (the normal colours: the fallback), so nothing ever breaks when
slots run out. The same variant of the same species shares a slot.

**Screens** (slots from the screens' own loads; verified for the party, partly for the others):

| Screen | Files and functions | Free OBJ slots | Notes |
| --- | --- | --- | --- |
| **Party list** (field, main engine) | `ov165/plist_sys.c: PokeList_LoadResources` (line 648; icons at slot 6 via `CL_RES_PLTT(6)`, line 670), `ov165/plist_plate.c: PokeListPlate_CreateIcon` (line 228, `PokeIcon_GetPaletteOfPkm`, then `ClActor_SetPalette(plate->icon, palette, 1)`) | main 12-15: loads are 0-2 (4), 3 (item), 4 (status), 5 (HP bar), 6-8 (icons), 9-11 (touch bar, 3) | 6 icons, 4 slots: fallback only past 4 distinct shinies. Init in `PokeList_LoadResources` after line 670 with base 6, first 12, count 4; release where the work's resources are freed (inferred: `PokeList` teardown frees `clResources`; find the exact function) |
| **Party list's partner plates** (multi battle) | `ov165/plist_battle.c: PokeListBattle_LoadResources` (line 136; sub engine, icons at 6 via `CL_RES_PLTT(7)`, line 190), partner icon creation (line 308) | sub: 3 (item icon) and 6-8 known; the rest not audited | needs an audit of the sub engine's slots |
| **In-battle party screen** (inferred: `ov287/b_plist_*.c`) | `ov287/b_plist_obj.c: BPlistObj_LoadPokeIconRes` (line 133; sub: icons 0-2, file 11 at 3, file 66 at 4, file 33 at 5, file 421 range at 8, HP bar at 9), `BPlistObj_SetPokeIconPalettes` (line 257) | sub 6, 7, 10-15 by the loads shown (file palette counts not checked) | 6 icons: enough |
| **PC box** (main engine) | `ov255/box2_obj.c: LoadPokeIconResources` (line 383; the box bank file with 4 palettes at slot 3), `GetPokeIconPalette` (line 486, returns 3 when a search excludes the Pokémon), `TransferIconChar` (line 493), `pokeIconPal[]` (line 431) | candidates 8, 12, 15 (loads: file 72 at 0, 3-6 icons, file 70 at 7, touch bar at 9-11, item at 13, marking at 14; the palette counts of files 72, 70 aren't checked) | up to 30 + 6 + 1 icons, 3 slots: **the fallback will be common** in a box full of shinies. Priority: the cursor's, then the held Pokémon, then by position. `GetPokeIconPalette` is called per icon at tray load, so the cache is a per-tray allocation; the search's grey stays bank 3 |

Everything else that shows icons keeps `PokeIcon_GetPalette*` and the normal banks (trade, Wi-Fi lists, records, Pokédex
lists, name input, Entralink, ...): ~30 callers, no shiny icons, nothing to change. If the user wants shiny icons
there, each is the same four-line change as the party list (init, `Get`, release), done screen by screen after an
audit of its free slots.

### 4.4 Everything else that shows a Pokémon

| Screen | Goes through | Shows variant? |
| --- | --- | --- |
| Summary (picture) | `MCSSSys_AddPartyPkm` | yes (4.1) |
| Summary's star, Pokédex register | `PML_PkmIsRare` / `PokeParty_IsRare` | star only, unchanged |
| Box sprite panel | `PokeGra_LoadClActPaletteByBoxData` | yes |
| Pokédex pages, forms, voice, list, habitat | species, form, stored `rare` | variant 0 (first shiny) only |
| Evolution, egg hatch, trade, HoF demo, intro | MCSS from the Pokémon | yes |
| Hall of Fame PC | `PaperWhite2_GraphicsRare(species, form, id, personality)` | yes |
| Field NPC/overworld Pokémon, scripts | `OBJ_CODE_*` | per code (4.2) |
| Followers | registry variant (4.2) | yes |
| Musical | `a/0/5/1` | not changed |
| World Trade, Mystery Gift | direct `GetPokemonPaletteDataNo` with the Pokémon | yes |
| Battle HP-panel icons, party plates | icon cache (4.3) | party yes; others fallback to normal |

## 5. Migration

- **Pokeweb's own shiny follower palettes** (the 174 `_shiny` sheets): the new shiny follower colours are the battle
  group's variant 1 (`shiny.pal`), so the 174 are replaced, including the wrong ones. A migration script does, in
  order: (1) `report --followers --render` to produce review pages for the 174 (today's shiny against the new; the
  scratchpad renders are the format); (2) `apply` for the follower sheets (mode `shared`/`mapped` by a threshold,
  default: `shared` when the nearest mean is under 20, else `mapped`; the user decides); (3) delete the 174
  `_shiny` PNGs and `sprite.pal`s and give their `data.json` a `"sprite"`; (4) walking sprites get `mapped` maps; (5)
  `follower.shiny` becomes `follower.variant`. The user then reviews the page and, for a species where Pokeweb's
  shiny was better (or a new variant is wanted), adds `shiny_2.pal`. The wrong ones listed in `research.md` (zekrom,
  kyurem and forms, frillish, jellicent, thundurus, tornadus, darmanitan form 1, reshiram, swoobat, venipede,
  landorus, samurott, deerling form 3, then munna, deino, druddigon, cubchoo, krokorok, accelgor, cottonee, emboar)
  need no regeneration of their own: they are simply the battle shiny now. "Hold the regeneration" in the roadmap is
  satisfied: nothing is regenerated, the palettes are dropped.
- The 1,113 shiny rows that showed normal colours become correct at the same time.
- **Existing saves**: nothing is stored; the variant is a function of the PID, the species and form, and the
  generated count. Existing shinies show variant `((pid >> 8) & 0xff) % N`, which is variant 0 (today's colours) for
  every species where N is 1, so nothing changes until a species gets a second variant. When a species gets one, a
  save's shinies of it spread over the variants at once (by the random byte they already have). Changing a species'
  N later reshuffles its shinies; say so in the editor.
- Evolution and form changes keep the PID, so the variant can change when N differs between the old and new species
  (question 3).

## 6. Phasing, effort, tests

| Phase | Work | Effort |
| --- | --- | --- |
| 0 | `shiny.schema.json`, `"palette"` in `field_actor.schema.json`, `remap_palette.py` (report/apply/remap-png) with tests, migration run and review pages | 1.5-2 days |
| 1 | Battle: the generated header, `shiny_palettes.[ch]` in main, the `GetPokemonDataIDBase` change, the 10 caller edits, hack `a/0/0/4` members, the debug action | 1.5-2 days |
| 2 | Followers: patch table (member 24), the `LoadMaterial` hook, registry v5 and variant column, `sync` of variant rows, dropping the 174 sheets (a/0/4/8 renumber) | 2-3 days |
| 3 | Icons: derived icon palettes and `a/0/0/7` members, the cache, party list first, then box, then the battle party; the others on request | 3-5 days |
| 4 | Editor integration notes (formats), docs (`data.md`, `plugins.md`, `following-pokemon.md`, `editor-notes.md`), STATUS | 0.5 day |

About 9-13 days with the user's review passes outside the count. Phases 1-3 are independent after 0; do 1 first, since
it is the single point most things use and the debug action tests everything else.

**Debug action** (`src/paperwhite2/ov012/paperwhite2_debug_commands.c`, `include/paperwhite2/debug_actions.h`; the
next free number is 38 now, the working tree uses 34-37 for conditions): `DEBUG_ACTION_PARTY_NEXT_VARIANT`, in
the Party menu next to Make shiny, entry "Shiny variant: n/N" via a `PARTY_WORDS`-style word action. Behaviour on
the target `pkm`: not shiny or an egg returns `DEBUG_VARIANT_NOT_SHINY`; `N = PaperWhite2_ShinyVariantCount(species,
form)`; N = 1 returns `DEBUG_VARIANT_ONE`; else `next = (current + 1) % N`, the new byte `b = next + N * (old byte / N)`
(or `next` if that passes 255), the new low half `(low & ~0xff00) | b << 8`, the new high half `high ^ low ^ newLow`
(so the shiny XOR is unchanged), written with `PokeParty_SetParam(pkm, PKM_PARAM_PID, ...)`; it returns the new
variant (1-based) and N in words 2 and 3. The Wurmple evolution side (high half's last digit) can change; irrelevant
in a debug tool, but copy `PaperWhite2_MakeShinyPID`'s digit rule if wanted. A second action in the same menu,
`PARTY_FOLLOWER_REFRESH`, calls the follower's re-selection (`SelectFollower`'s caller path) so the change shows
without a map change; otherwise leave and re-enter the map.

**Tests**:
1. Host (Python): `remap_palette.py` unit tests (a round trip `remap-png` with identical palettes is identity;
   injective assignment is injective; `locked`/changed-hash sprites are skipped); `shiny_palettes.py` table packer
   (patch table lookup, variant counts, original members unchanged); the variant formula against C by a host C test
   like `scratchpad/host/`.
2. Build: `--hack` builds with no warnings, `verify_dsi_rom.py` intact, `check_memory.py` passes; the first 15065 members
   of `a/0/0/4` and 1510 of `a/0/0/7`, and `a/0/4/8`'s 975, equal the original's; the matching `modules.ok` still
   passes.
3. In game (melonDS), with a species given 3 variants for the test (Zekrom, and a second one with different palette
   colours): Make shiny, then cycle the variant: summary and battle (wild and own, front and back), the box panel, the
   follower after a map change, the party icon (6 shinies of 3 variants in a party to exercise the 4 slots and the
   fallback), the box with 30 shinies, an NPC placed with `OBJ_CODE_FOLLOWER_ZEKROM_SHINY_2`, an unshiny Pokémon
   everywhere (unchanged), a save made before the change (loads, same colours for N = 1), Hall of Fame, evolution.
4. Follower loads on all three modes: a follower on a map with other billboard NPCs, a follower swapped with L/R
   across variants of one species (a stale cache would show the old colours), a map change and a return, the
   async-loaded NPC path.

## 7. Open questions for the user

1. **Mode defaults**: re-index (`shared`) costs the follower sheets a median 19-22 RGB units of normal colour (82 of 174
   over 20 by nearest) and the walking sprites a median 30 (67 over 40); `mapped` costs nothing and keeps the original
   archive members. Recommended: `mapped` for the 564 walking sprites; `shared` for follower sheets under a mean error
   threshold (20?), `mapped` above. Or all `shared` as first decided, accepting the recolouring?
2. **Cap and weights**: up to 15 variants per group (registry nibble); uniform by modulo, with the small bias when N
   does not divide 256 (N = 3 gives 86/85/85). OK, or per-variant weights (a table; more work)?
3. **Evolution**: the variant is recomputed with the new species' N, so a Pokémon can change variant when it evolves.
   Accept, or index variants by the evolution family so a line keeps its variant (more bookkeeping, a family table)?
4. **Shiny Candy**: it keeps bits 8-15, so it never picks a variant. Should it re-roll the byte (with the XOR fixed
   through the high half) so a candy gives a random variant? (The roadmap says it does.)
5. **Box icons**: with about 3 free slots, a box of shinies falls back to normal icons for most. Acceptable, or give the
   box's greyed bank slot up, or show a star marker on the fallback icons?
6. **Pokédex and musicals**: variant 0 only in the Pokédex (no PID there) and no variants in the musical. Fine?
7. **Icon quality**: the derived shiny icons are approximate (icons map to battle colours at a median distance of 36).
   Hand-reviewed per species, or invest in the guided map (aligning the icon with the battle sprite)?
8. **Variant rows**: each extra variant of a follower adds a code, a table, registry and positioning row (about 100
   bytes), created by `sync`. OK, given that a map can then name a variant? (The alternative, one code and a runtime
   variant argument, would need the material cache to key on it and gives scripts no handle.)
9. **Where to keep Pokeweb's 174 shiny palettes**: git history only, or a `docs` copy for the review?
10. **Scope of icons**: party, box and in-battle party first, everything else normal. Right?
