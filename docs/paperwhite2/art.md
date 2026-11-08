# Custom art (screens)

Art drawn in an image editor (Aseprite) becomes a 2D screen of the game through `tools/paperwhite2/screen_art.py`,
which the editor's **Graphics & Palettes** runs on its **Screens** page. It writes the game's own files in `res/`,
which the build packs as it packs every graphics archive (`docs/data.md`, 2D graphics), so a converted screen is
ordinary data: `git diff w2-original -- res/graphics/` shows it.

## Targets

`res/paperwhite2/art/targets.json` (`art_targets.schema.json`) lists the screens art can replace. Each target is one
palette and the screens drawn with it; screens naming the same character sheet share its tiles, and are rebuilt
together. A target's `rows` leave out palette rows that the game uses elsewhere, and `max_tiles` is the room for its
tiles in VRAM, from the code that loads it. A target's `offset_y` (pixels, 0 by default) is for a BG that the game
scrolls up while it shows the screen (below).

| Target | Files | Where the game shows it |
| --- | --- | --- |
| `boot_logos` | `title/11.pal`, `12.png`, `13.nscr`, `14.nscr` | The first screens, which a button skips (`boot_screens.c`) |
| `copyright` | `copyright/00.pal`, `01.png`/`02.nscr`, `03.png`/`04.nscr` | The copyright lines; the credits show the top screen again in row 2's colors, and rows 1 and 2 are the credits' Japanese copyright screens' (`staff_roll_main.c`) |
| `boot_extra` | `copyright/09.pal`, `10.png`/`11.nscr`, `12.png`/`13.nscr` | The hack's own screen after the copyright (below) |
| `title_logo` | `title/white2/02.pal`, `00.png`, `01.nscr`, `03.nscr` | The title's logo and the streaks behind it, 256 colors; the credits show the logo too |
| `title_top` | `title/white2/08.pal`, `09.png`, `10.nscr` | The title's other screen, "Developed by GAME FREAK inc." |
| `pokedex_info_stats` | `pokedex_gra/131.pal`, `132.png`/`133.nscr` (new members) | The Pokédex Info page's bottom screen on Stats, under its text, bars and buttons (sub BG 6, palette row 6); the source is `res/paperwhite2/pokedex_art/info_stats.png` |
| `pokedex_info_data` | `pokedex_gra/134.pal`, `135.png`/`136.nscr` (new members) | The same on Data (palette row 7, each sub-page's art in row 6 + its place); the source is `res/paperwhite2/pokedex_art/info_data.png` |
| `pokedex_info_moves` | `pokedex_gra/140.pal`, `141.png`/`142.nscr` | The same on Moves; `info_moves.png` |
| `pokedex_info_evo` | `pokedex_gra/146.pal`, `147.png`/`148.nscr` | The same on Evo; `info_evo.png`. Its tile rows 3-6 (y 24-55, the banner's inside) are shown on the grid's BG, scrolling with the grid: they must be opaque and repeat across with a period that divides 256 (`docs/paperwhite2/plugins.md`, Evo) |
| `pokedex_info_matchups` | `pokedex_gra/149.pal`, `150.png`/`151.nscr` | The same on Matchups; `info_matchups.png` |
| `pokedex_info_moves` | `pokedex_gra/140.pal`, `141.png`/`142.nscr` (new members) | The same on Moves (palette row 8): the tab strip and the sets' bar only, the rows and track drawn by the page over it; the source is `res/paperwhite2/pokedex_art/info_moves.png` |
| `pokedex_move_panel` | `pokedex_gra/143.pal`, `144.png`/`145.nscr` (new members) | The top screen's move panel, opened from Moves (`paperwhite2_pokedex_move_panel.c`): main BG 1 in palette row 6, beside the head bar's and the text's tiles, so only about 65 different tiles fit (45 used); the art behind the text is copied into the text's windows. The source is `res/paperwhite2/pokedex_art/move_panel.png` |

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
- **`offset_y`**: when the game scrolls the screen's BG up by some pixels while it shows it (to move tile-aligned
  things on the same BG, such as the Pokédex Info page's buttons, off the tile grid), the target's `offset_y` says by
  how many. The converter moves the art down by as many pixels before cutting it into tiles, so the art shows exactly
  where it was drawn; the rows it pushes past the screen's 192 are dropped, and must be transparent (a problem
  otherwise), so the art's last `offset_y` rows are left empty. `render` and `--preview` show the screen scrolled, as
  the game does, so a render is the art as drawn. The game's scroll and `offset_y` must agree: `pokedex_info_stats`
  has 2 and `pokedex_info_matchups` 3, as `sSubpageLift` in `paperwhite2_pokedex_info_panels.c` (which
  `pokedex_templates.py` checks).

`screen_art.py render TARGET SCREEN OUT.png` exports a screen as an indexed PNG in its palette, color 0 transparent,
to draw over; the editor's **Download as PNG** is the same.

## The hack's boot screen

`boot_screens.c` shows one more screen after the copyright notice, in `PAPERWHITE2` builds
(`src/paperwhite2/ov162/paperwhite2_boot_screen.c`): its art is `ARCID_COPYRIGHT`'s members 9 to 13, the target
`boot_extra`, loaded as the copyright is, faded in and out the same way, for 90 frames or until A, B or Start. While
its palette is all black (as it is until it has art) the boot screens skip it, so the boot is as before.
