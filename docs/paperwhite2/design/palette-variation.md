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
| The follower's and the wanderers' overworld sprites | a palette of their own on their billboards (below): `PaperWhite2_ActorPalettes_Set` as the sprite is chosen (the follower's `SetVariation` beside each `sCode` and the preload; `Wanderers_Spawn`), `_Bind` every frame (`PaperWhite2_FollowingUpdate`, `Wanderers_Draw`), `_Capture` in `FldBillboardActor_LoadMaterial` |

MCSS's way: `MCSSSys_SetPaletteVariation(system, species, personality)` sets a pending individual on the system (a
field of its own, private to `mcss.c`), which the next load consumes as it reads the palette (`MCSSSys_VaryPalette`, in
both `LoadMCSSGraphicsData` paths), before the sprite keeps its colours for fades and blends. The palette forms
(`PAPERWHITE2_PALETTE_FORM_FILES`, Arceus) take it on top: the palette read is the form's. Wild Pokémon vary too.

**Not:** party and box icons (shared palettes), the Pokédex (species, not individuals; it sets only the Spinda
callback), the field's "show Pokémon" script picture and the HM cut-in (`scrcmd_poke_disp.c`, `fld3d_ci.c`: species
only, no PID), the evolution scene's sparkle pieces, the GTS.

## Field sprites: a palette of their own

The field's sprites share one material an object code (`field_actor_billboard.c`'s cache), and so one palette: every
wanderer of a species looked alike, and the follower's colours were baked into the shared sheet, so switching (L/R)
between two party members with the same follower sprite kept the first one's until the field reloaded. Now each
wanderer and the follower draw a copy of their billboard's material (`src/paperwhite2/ov036/paperwhite2_actor_palettes.c`,
`include/paperwhite2/actor_palettes.h`): the same texture VRAM, with a 16-colour palette of its own, its sprite's
colours varied by its PID; the shared material stays unvaried for everything else that draws it (ambients, NPCs).

- **Slots:** one a wanderer (3), then the follower's (`ACTOR_PALETTE_FOLLOWER`). `_Set(slot, objCode, species, PID)`
  before the sprite's load is asked for; `_Bind(slot, sys, billboard)` every frame the billboard is out: it makes the
  copy (`PaperWhite2_BillboardActorScene_AddMaterialOwnPltt` in `billboard.c`, a scene slot copied from the source with
  its own `plttKey`), sends the colours through the billboard system's VBlank transfer, and puts the billboard on the
  copy while it shows its shared material. A new billboard (the follower's after a switch reuses the handle or takes
  another), another material or another PID makes it again or re-sends the colours, so the switched follower shows
  its own colours from its first frame. `_Release` when a wanderer goes; `_ReleaseAll` in `FldBillboardActor_Exit`.
- **The base colours:** a trimmed sheet keeps no palette in main memory and palette VRAM can't be read back, so
  `_Capture` in `FldBillboardActor_LoadMaterial` keeps the colours of every follower sprite (object code from
  `FOLLOWING_CODE_BASE`) and of any sprite a slot waits for, 8 at a time (the oldest no slot shows replaced first).
  A slot whose sprite was loaded before it was wanted, below `FOLLOWING_CODE_BASE` (a stock sprite an NPC loaded),
  finds none and keeps the shared, unvaried material.
- **Cost:** 32 bytes of texture palette VRAM a slot, 128 bytes at most (4 slots) of the field's 16 KB; no texture
  VRAM; one of the 96 billboard materials a slot; 0x224 bytes of overlay 36's BSS (slots and captures).
- **Wanderers' PIDs:** a wanderer's whole PID is rolled as it spawns (`EventWildBattleCall_PickWanderer` calls
  `FieldEncount_RollWildPID`, the battle's own rolls), kept in its `WildPkmParam` (`pid`, `fixedPid`), and
  `FieldEncount_CreateWildPkm` makes its battle's Pokémon with it: the field sprite, the battle sprite and the Pokémon
  caught have the same PID, so the same variation (the overworld and battle palettes are different sheets, turned by
  the same key).

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
- **Field palettes** (py-desmume, scratchpad `palvar2/`, 2026-11-18): on Route 20, every bound slot's colours equal
  the reference on its captured sprite colours, and its billboard's scene material is its copy (own palette address
  next to the shared one's). Two Lillipup wanderers drew different colours on screen (e.g. (224,200,112) against
  (216,200,112)); a touched wanderer's battle Pokémon had its PID (0x99915bb7: `FieldEncount_CreateWildPkm`'s param
  and the PID it made, the battle's variation call with key 0x5b), and the Pokémon caught (sent to Box 1) had it in
  memory too. With Always shiny each spawn rolled until shiny (1118 and 2749 rolls) and showed the shiny sprite;
  without, one roll each. L/R from the lead Pignite to a second Pignite (another key): the slot's PID changed at the
  press, and the new billboard was on its own palette with the new colours as it came out (read every 10 frames).
