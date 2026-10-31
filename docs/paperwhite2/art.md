# Custom art (screens)

Art drawn in an image editor (Aseprite) becomes a 2D screen of the game through `tools/paperwhite2/screen_art.py`,
which the editor's **Graphics & Palettes** runs on its **Screens** page. It writes the game's own files in `res/`,
which the build packs as it packs every graphics archive (`docs/data.md`, 2D graphics), so a converted screen is
ordinary data: `git diff w2-original -- res/graphics/` shows it.

## Targets

`res/paperwhite2/art/targets.json` (`art_targets.schema.json`) lists the screens art can replace. Each target is one
palette and the screens drawn with it; screens naming the same character sheet share its tiles, and are rebuilt
together. A target's `rows` leave out palette rows that the game uses elsewhere, and `max_tiles` is the room for its
tiles in VRAM, from the code that loads it.

| Target | Files | Where the game shows it |
| --- | --- | --- |
| `boot_logos` | `title/11.pal`, `12.png`, `13.nscr`, `14.nscr` | The first screens, which a button skips (`boot_screens.c`) |
| `copyright` | `copyright/00.pal`, `01.png`/`02.nscr`, `03.png`/`04.nscr` | The copyright lines; the credits show the top screen again in row 2's colors, and rows 1 and 2 are the credits' Japanese copyright screens' (`staff_roll_main.c`) |
| `boot_extra` | `copyright/09.pal`, `10.png`/`11.nscr`, `12.png`/`13.nscr` | The hack's own screen after the copyright (below) |
| `title_logo` | `title/white2/02.pal`, `00.png`, `01.nscr`, `03.nscr` | The title's logo and the streaks behind it, 256 colors; the credits show the logo too |
| `title_top` | `title/white2/08.pal`, `09.png`, `10.nscr` | The title's other screen, "Developed by GAME FREAK inc." |

Another screen is a new entry: its palette, its sheet and screen files, the depth and the limits, all from the code
that loads it.

## How art becomes tiles

- The art is any PNG of the screen's width (256), up to its height: 192 for a whole DS screen. Indexed, RGB and RGBA
  all read; colors count, not indices, each rounded to the DS's 5 bits an axis. Transparent pixels (alpha below 128)
  are color 0, which shows the backdrop or the layer below.
- **16 colors** (`depth` 4): each 8 by 8 tile takes its colors from one palette row, 15 and the transparent one. The
  converter finds a row for each tile among the target's rows, the tiles with the most colors first, reusing a row
  that has a tile's colors already, and never changing a color that a kept screen shows.
- **256 colors** (`depth` 8): any tile can use any color; the kept screens' colors stay where they are, and the art's
  take the free entries.
- Tiles repeated, also flipped, are stored once; tile 0 stays blank. The report gives the tiles used against the
  limit, the rows used, and each tile that can't be drawn (too many colors, or no row with room), which the editor
  marks on the preview.
- A screen given no art is kept: its tiles go into the rebuilt sheet as they were.

`screen_art.py render TARGET SCREEN OUT.png` exports a screen as an indexed PNG in its palette, color 0 transparent,
to draw over; the editor's **Download as PNG** is the same.

## The hack's boot screen

`boot_screens.c` shows one more screen after the copyright notice, in `PAPERWHITE2` builds
(`src/paperwhite2/ov162/paperwhite2_boot_screen.c`): its art is `ARCID_COPYRIGHT`'s members 9 to 13, the target
`boot_extra`, loaded as the copyright is, faded in and out the same way, for 90 frames or until A, B or Start. While
its palette is all black (as it is until it has art) the boot screens skip it, so the boot is as before.
