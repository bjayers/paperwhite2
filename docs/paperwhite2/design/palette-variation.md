# Palette variation

Every individual Pokémon's colours turn a little by its PID, after Polished Crystal's "slightly different hues for the
same species". Built 2026-11-18 (ROM session).

## The design

- **Input:** the PID's second byte, bits 8-15. Nothing rewrites it: the Shiny Candy (`PaperWhite2_MakeShinyPID`)
  keeps the low 16 bits, Gen 5 keeps the nature in a field of its own, and the low byte (the sex) is left out. Never
  IVs or nature, which are editable in game.
- **The transform**, on the individual's 16 BGR555 colours as the palette loads, normal and shiny alike; index 0 (the
  transparent one) is never touched:
  - the low nibble turns the **hue** by one of 16 steps from -`hue_degrees` to +`hue_degrees`: a rotation about the
    grey axis (Rodrigues' formula; sin and cos by short series), so a grey stays exactly and a colour moves by its
    distance from grey: a faint tint barely, a strong colour most;
  - bits 6-7 move the **saturation** by one of 4 steps of +/-`saturation_percent`: each channel's distance from the
    colour's mean, which greys don't have;
  - bits 4-5 move the **brightness** by one of 4 steps of +/-`brightness_percent`, weighted by the colour's own HSV
    saturation (chroma / max), so greys, white and black keep theirs;
  - every range is scaled by the species' strength; 0 or the switch off changes nothing.
- **Fixed point:** all in 32-bit integers in 1.12 fixed point, the same steps in the C, the Python reference and the
  editor's TypeScript; every signed `>>` is a floor in all three (ARM ASR, Python, JavaScript), and every division is
  of a value that can't be negative. No product reaches 2^31.

## Where it applies

| Where | Hook |
| --- | --- |
| Battle (every battler, both sides; mosaic, Substitute's end, form change and Transform reloads) | `btlv_mcss.c` beside each `MCSSSys_SetSpindaLoadCallback`, and `BtlvMcss_Transform` (the target's look and PID) |
| Summary, evolution, trade, hatching (not the egg) | `MCSSSys_AddPartyPkm` (`mcss_tool.c`) |
| Hall of Fame | `HallOfFameDemoMain_AddMcss` |
| PC box preview, move tutor, Hall of Fame list, Mystery Gift, others through `PokeGra_LoadClActPaletteByBoxData` | `pokegra.c`: loaded as before, then the varied colours replace it (`PaperWhite2_VaryClActPalette`) |
| The follower's overworld sprite | `FldBillboardActor_LoadMaterial` calls `PaperWhite2_FollowingVaryMaterial` before any mode uploads the sheet: the code of the follower picked (`SetVariation` beside each `sCode` and the preload) |

MCSS's way: `MCSSSys_SetPaletteVariation(system, species, personality)` sets a pending individual on the system (a
field of its own, private to `mcss.c`), which the next load consumes as it reads the palette (`MCSSSys_VaryPalette`, in
both `LoadMCSSGraphicsData` paths), before the sprite keeps its colours for fades and blends. The palette forms
(`PAPERWHITE2_PALETTE_FORM_FILES`, Arceus) take it on top: the palette read is the form's. Wild Pokémon vary too.

**Not:** party and box icons (shared palettes), the Pokédex (species, not individuals; it sets only the Spinda
callback), the field's "show Pokémon" script picture and the HM cut-in (`scrcmd_poke_disp.c`, `fld3d_ci.c`: species
only, no PID), the evolution scene's sparkle pieces, the GTS.

**Known limit:** the follower's material is cached by object code for the map, so cycling (L/R) between two party
members that share a follower sprite (species, form, sex, shininess) keeps the first one's colours until the field
reloads (any menu, battle or warp does).

## Data

`res/paperwhite2/palette_variation.json` (schema beside it), packed by `tools/paperwhite2/palette_variation.py` into
`paperwhite2/palette_variation_config.h`: `enabled`, `hue_degrees` (12), `brightness_percent` (6),
`saturation_percent` (10), and `species`, a list of `{ species, strength }` for those not at 100% (Unown and Kecleon
at 0). Its forms take the species' strength. The list sits in the variation file rather than in each species'
`data.json`, which the Pokémon packer owns and whose schema is the game's personal data.

**Visibility** (measured over the 656 species palettes' 9840 colours by the reference): at 12 degrees the two middle
hue steps (+/-0.8 degrees) round away entirely; +/-2.4 changes 13% of the colours, +/-4 a third, the ends two thirds
(mean 2 channel units). Brightness and saturation below about 4-5% round away; at 6% and 10% the outer steps change
about half the colours and the inner ones a few.

## Editor

The Pokémon Editor's **Palette variation** card (species and form pages): this species' strength (slider, number,
Default removes it from the list), a preview of the front sprite in 16 variants (keys 0x00, 0x11 ... 0xff, every hue
step and every brightness and saturation step), normal or shiny, drawn with `paletteVariation.ts`, and the four shared
settings.

## Tests

- **Shared vectors:** `tools/paperwhite2/palette_variation_vectors.json` (360 cases: five palettes, four settings, six
  keys, three strengths), written by `palette_variation.py --vectors`, checked by
  `tools/paperwhite2/test_palette_variation.py` (with greys, strength 0, clamping, the hue's direction and the packer)
  and `editor/tests/palette-variation.test.ts`.
- **The C** (py-desmume, scratchpad `palvar/`): an exec hook on `PaperWhite2_VaryPalette` reads each palette before
  and after and compares it with the reference: every call matched, in battle (both sides, double battle), the
  summary, the follower, a shiny wild one (input `pignite/shiny.pal`), Arceus form 10 (input `arceus/form_10/normal.pal`)
  and the PC box (the varied colours found in the sub OBJ palette RAM, the original gone). Kecleon's call changed
  nothing; greys, white and black stayed in every call.
