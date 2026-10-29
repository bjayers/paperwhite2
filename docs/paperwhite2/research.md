# Paper White 2 research notes

Findings from reading the code, for features not built yet. Each says what was verified and what wasn't.

## Boot and title graphics (2026-10-29)

PNGs are 8-bit indexed with 256-entry JASC palettes; keep each palette's order when redrawing (docs/data.md, "2D
graphics").

| Stage | Source | Kind | Loader |
| --- | --- | --- | --- |
| Copyright and logo screens | `res/graphics/copyright/` (`ARCID_COPYRIGHT` 162): `01.png` 256×24, `03.png` 256×32, `05.png` and `07.png` 256×256 | 2D BG, PNG | `src/ov162/boot_screens.c` |
| Boot extra BG | `res/graphics/title/12.png` 256×32 (`ARCID_TITLE` 26) | 2D BG, PNG | `boot_screens.c` |
| Title screen | `res/graphics/title/`: `05.png` 32×40, `09.png` 192×16, `12.png`; the logo is `white2/00.png` (and `black2/00.png`) 256×128 | 2D BG and OBJ, PNG | `src/ov162/title.c` |
| Title screen's Kyurem | `ARCID_DEMO3D_RESOURCE` 158, members 454–460 for White 2 | 3D models and animations | `title.c` (`sResources`) |
| Game Freak logo | `res/demo/cdemo_gflogo/` (`ARCID_CDEMO_GFLOGO` 220): 152 frames, 256×256 RGBA PNG | bitmap movie | `src/ov264/cdemo_control.c` |
| Opening movie | `res/demo/cdemo_openingsw/` (`ARCID_CDEMO_OPENINGSW` 222): 626 frames | bitmap movie | `cdemo_control.c` |
| New-game intro | `res/graphics/intro/` (`ARCID_INTRO` 168): `05.png` 256×192, `professor.png` 256×128 and more; `22/23.nsbmd` are 3D | 2D, plus some 3D | `src/ov294/intro*.c` |
| Credits | `res/graphics/the_end/` (`ARCID_THE_END` 215): about 85 members, mostly 256×192 BGs; the credit text is in the system messages | 2D, PNG | `src/ov266/staff_roll_main.c`, `src/ov267/the_end.c` |

Which PNG holds which company logo isn't mapped; look at the images.

## Wild triple battles (2026-10-29)

Verdict: **medium**. The engine's triple support is generic and nothing forbids a wild triple.

- Wild setup: `FieldEncount_SetupNormal` (`src/ov036/field_encount.c`) makes `doubleBattle + 1` Pokémon from
  `src/ov036/enc_pokeset.c` (`WildPkmParam params[2]`) and calls `BtlSetup_SetWildNormal` (`src/system/btl_setup.c`),
  whose `battleStyle` is a plain field: set it to `BTL_STYLE_TRIPLE`.
- The battle's triple setup (`BtlMain_SetupAloneTriple`, `src/ov167/btl_main.c`) depends only on the style; the wild
  party copy, catching (`ThrowBall`), experience and running work by battle type, not style; the battle views and
  the wild messages handle triples.
- Needs care:
  - `GetClientAIFlags` gives wild battles AI flags 0x80 only in doubles; add a triple case if wanted.
  - A player party of fewer than 3 Pokémon: needs a guard that falls back to a double or a single.
  - The "Wild X and Y appeared!" text needs a three-name version.
  - The intro camera with three wild foes is untested.
  - Other double-only paths, such as the follower-ally multi setup, must not be taken.
- Not read: the escape chance, the dark-grass capture modifier, the AI scripts in `src/ov170/tr_ai.c`.

## Follower shiny palettes and shiny icons (2026-10-29)

- Shiny Zekrom's follower palette (`res/field/actors/followers/zekrom_shiny/sprite.pal`) is wrong: same index map as
  the normal sheet, but a recolour (tan and brown, pink key colour) instead of the teal-grey shiny. It is the same
  in Pokeweb's own `src/assets/following/gen5-followers.narc`, so there is no corrected upstream set.
- Of the followers, 348 have their own sheets (174 normal and shiny pairs); the others reuse the original walking
  sprites. Follower palettes are their own 16-colour quantisations and share no index order with the battle
  sprites' palettes, so they can't be swapped in directly.
- A data-only fix works: for each follower colour, find the nearest battle-normal colour, add the battle sprite's
  shiny minus normal difference, keep index 0 and black and white. Zekrom regenerated that way looks right (teal-grey
  body, green accents). Scripts: the scratchpad's `research2/r.py` and `h.py` (not committed).
- Suspects by comparing each follower's average shiny shift with its battle sprite's: kyurem_form_2, zekrom, kyurem,
  frillish (and female), jellicent_female, thundurus (and form 1), tornadus, darmanitan_form_1, reshiram, swoobat,
  venipede, landorus (both forms), samurott, deerling_form_3; then munna, deino, druddigon, tornadus_form_1,
  kyurem_form_1, cubchoo, krokorok, accelgor, cottonee, deerling_form_1, emboar. 51 pairs change the key colour too.
- Shiny party and box icons: the game has none. Icons use three shared 16-colour palettes chosen per species
  (`sPokeIconPalettes` in `src/system/poke_icon.c`). Showing shinies needs a shiny icon palette per species (about
  21 KB, derivable from the battle sprites' shiny shift) and, on each screen, a spare OBJ palette slot per visible
  shiny. Moderate for the party, the box and the in-battle party (`src/ov165/plist_plate.c`, `src/ov255/box2_obj.c`,
  `src/ov165/plist_battle.c`); about 35 overlays use icons in all.
