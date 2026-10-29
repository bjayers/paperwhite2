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
