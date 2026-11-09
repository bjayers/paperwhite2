#!/usr/bin/env python3
"""Writes art templates for the Pokédex Info page's bottom screen (src/paperwhite2/ov298/), drawn as the game lays the
page out: the places come from the page's layout constants (the C files' #defines), the text from its text bank
(res/text/system/pokedex_data.txt) in the game's own fonts (a/0/2/3, read from the extracted ROM), so they are exact
to the pixel. As they hold the ROM's fonts, they are written to an ignored folder, never to res/.

    pokedex_templates.py [--extract extract/w2_us] [OUT_DIR]

For each sub-page (stats, data, moves, evo, matchups) it writes:
- <page>_canvas.png: the art to draw over, 256 by 192, transparent where the grid shows: the user's art where the
  sub-page has it (res/paperwhite2/pokedex_art/info_<page>.png), else in the art's palette the Stats art's strip and
  plain panels where the page draws its own until there is art;
- <page>_reference.png: the whole screen as the game shows it over the canvas, with the game's text, bars and buttons,
  the grid's area checkered and the touch bar's marked;
- <page>_reference_tiles.png: the same with the 8 by 8 tiles' grid.

Matchups' reference has the game's type icons (a/0/8/2, as the page loads them) and the multipliers of a sample
species, worked out as the page does from the type chart (src/paperwhite2/main/paperwhite2_type_chart.c). Moves'
reference has a sample species' level-up moves (res/pokemon/), their type icons, the move relearner's cursor
(res/graphics/pokedex_gra/137-139, its 128 KB mapping) and the Pokédex list's scroll knob.

And the top screen's move panel, which a move chosen on Moves opens over the entry, once it has the user's art
(res/paperwhite2/pokedex_art/move_panel.png): move_panel_canvas.png (that art) and move_panel_reference.png / _tiles.png
(the art as the game shows it, from its converted tiles and screen, with a sample move in the art's colors that the
panel prints in, over a dark checker for the dimmed screen and the head bar, from paperwhite2_pokedex_move_panel.c's
constants).

And the top screen's entry with the info page's own text in its text window (the entry's panels, grid and head bar,
without its other text, sprite, types and footprint): top_ability_reference.png (Stats' Abilities button: a sample
species' first ability, its name in the page's gold and "Ability 1" right-aligned in the page's grey),
top_hidden_ability_reference.png (the hidden one before the species is caught), and top_items_<species>_reference.png
(Data's held items: Tepig's none, Pikachu's Light Ball, Foongus's three, the third in dark grass only), each with a
_tiles.png.

Evo's canvas is its art with the strip and panel that the page draws until the art does, and its references are
Tepig's family (evo_) and Eevee's 8 in the small layout (evo_eevee_), with the party icons (a/0/0/7), the balls
(res/paperwhite2/pokedex_art/evo_ball_*.png), the lines and the text as paperwhite2_pokedex_info_evo.c draws them; it
prints every family's row whose method falls back to its first evolution (Milotic) or doesn't fit.

Stats' and Matchups' buttons are drawn as high as the page lifts them (paperwhite2_pokedex_info_panels.c's
sSubpageLift, which must equal the art targets' offset_y), over the art as it was drawn.

And the top screen's Info panels' palettes (a/1/5/7's palette 9, rows 0 and 1, ov296's POKEDEX_GRA_PALETTE), to draw
with the same colors: top_panels_row<N>.pal (JASC), .gpl (GIMP, Aseprite) and top_panels_palette.png (the swatches).

And the planned Area sub-page's templates (the six-tab bar, the map on the top screen, the bottom screen's layout, the
icon sheet and the glow's colours), which pokedex_area_templates.py writes into the same folder.
"""
import argparse
import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.narc import read_narc  # noqa: E402
from tools.data.nitro_2d import (  # noqa: E402
    character_pixels, palette_colors, read_indexed_png, read_palette, write_indexed_png, write_palette)
from tools.paperwhite2.nitro_cells import CellBank  # noqa: E402
from tools.paperwhite2.obj_remap import OBJ_TILES, tiles_of  # noqa: E402

WIDTH, HEIGHT = 256, 192
PANELS = ROOT / "src/paperwhite2/ov298/paperwhite2_pokedex_info_panels.c"
HEADER = ROOT / "include/paperwhite2/pokedex_info.h"
ENTRY_HEADER = ROOT / "include/app/pokedex_info.h"
ENTRY = ROOT / "src/ov296/pokedex_info.c"
MOVE_PANEL = ROOT / "src/paperwhite2/ov298/paperwhite2_pokedex_move_panel.c"
TYPE_CHART = ROOT / "src/paperwhite2/main/paperwhite2_type_chart.c"
APP_MENU_COMMON = ROOT / "src/system/app_menu_common.c"
PAGE = ROOT / "src/paperwhite2/ov298/paperwhite2_pokedex_info.c"
EVO = ROOT / "src/paperwhite2/ov298/paperwhite2_pokedex_info_evo.c"
POKE_ICON = ROOT / "src/system/poke_icon.c"
TEXT = ROOT / "res/text/system/pokedex_data.txt"
# The user's art of each sub-page (screen_art.py's pokedex_info_* targets' sources)
ART = ROOT / "res/paperwhite2/pokedex_art"
ART_TARGETS = ROOT / "res/paperwhite2/art/targets.json"
# The sub-pages in the page's order (POKEDEX_INFO_SUBPAGE_*)
PAGES = ("stats", "data", "moves", "evo", "matchups")
FONTS = "files/a/0/2/3"
# The menus' common graphics: the type icons' palette (three rows) and each type's 32 by 16 characters
MENU_COMMON = "files/a/0/8/2"
TYPE_ICON_PALETTE = 0x21
TYPE_ICON_CHARS = 0x22
TYPE_ICON_WIDTH, TYPE_ICON_HEIGHT = 32, 16
# The category icons' characters (AppMenuCommon_GetCategoryIconCharFile), with the type icons' palette
CATEGORY_ICON_CHARS = 0x38
# The Pokédex's own graphics in res/ (the cursor made for its mapping, the list's knob) and the relearner's palette
GRAPHICS = ROOT / "res/graphics"
# AppTaskMenuWin's text: its top in the button, and the frame's width at each side (app_taskmenu.c)
BUTTON_TEXT_Y = 6
BUTTON_FRAME = 8
# The Pokédex's graphics, and the Info panels' palette and the rows its panels use (screens 0x20 and 0x29)
POKEDEX_GRA = "files/a/1/5/7"
TOP_PALETTE = 9
TOP_ROWS = (0, 1)
SWATCH = 16
# The touch bar's rows, the game's
TOUCHBAR_Y = 168
# The top screen's head bar ("INFO", src/ov298/pokedex_detail_headbar.c): its characters, screen and palette (row 0,
# INFO's), its title from the battle's titles' bank, printed on the characters at (24, 5) in colors 15 and 14
HEAD_BAR_CHARS = GRAPHICS / "pokedex_gra/014.png"
HEAD_BAR_SCREEN = GRAPHICS / "pokedex_gra/038.nscr"
HEAD_BAR_PALETTE = GRAPHICS / "pokedex_gra/004.pal"
HEAD_BAR_TITLE = ROOT / "res/text/system/btl_server_flow_title.txt"
HEAD_BAR_TITLE_X, HEAD_BAR_TITLE_Y = 24, 5
HEAD_BAR_ROWS = 3
# The move panel's art (screen_art.py's pokedex_move_panel target): its source, and its converted palette, tiles and
# screen, which the game shows
MOVE_PANEL_ART = ART / "move_panel.png"
MOVE_PANEL_PALETTE = GRAPHICS / "pokedex_gra/143.pal"
MOVE_PANEL_CHARS = GRAPHICS / "pokedex_gra/144.png"
MOVE_PANEL_SCREEN = GRAPHICS / "pokedex_gra/145.nscr"
# The top screen's entry (src/ov296/pokedex_info.c, the info page's top): its panels (BG 2, the Pokedex's graphics'
# screen 0x29, the head bar's rows cleared) over its grid (BG 3, screen 0x20), both of characters 0x1a in the rows of
# palette 9 that their map entries name, the head bar, and the text window at tiles (2, 17), 28 by 7, where the info
# page prints its own text in the font's palette row (a/0/2/3's palette 5) with the page's gold in it
TOP_CHARS = GRAPHICS / "pokedex_gra/026.png"
TOP_SCREEN_MID = GRAPHICS / "pokedex_gra/041.nscr"
TOP_SCREEN_BACK = GRAPHICS / "pokedex_gra/032.nscr"
TOP_PALETTE_FILE = GRAPHICS / "pokedex_gra/009.pal"
TOP_PALETTE_ROWS = 3
TEXT_WINDOW_X, TEXT_WINDOW_Y, TEXT_WINDOW_WIDTH = 2 * 8, 17 * 8, 28 * 8
FONT_PALETTE = 5
# The top references' palette: the entry's three rows, the head bar's, the font's row, then the tiles' grid
TOP_HEAD_BAR_BASE = 48
TOP_FONT_BASE = 64
TOP_TILE_LINE = 80
# A sample species for the numbers: Tepig
SAMPLE_STATS = [65, 63, 45, 45, 45, 45]
SAMPLE_DATA = ["45 (11.9%)", "Medium Slow", "\u2015", "1 HP", "62", "70"]
SAMPLE_GENDER = ("\u2642 87.5%", " / ", "12.5% \u2640")
SAMPLE_EGG = ("Field", "20", "5120 steps")
# Tepig's types (Fire) for the Matchups, and its choices: Default (Blaze changes nothing), shown chosen, and Thick Fat
SAMPLE_TYPES = (9, 9)
SAMPLE_ABILITIES = (None, "thick_fat")
# Moves' sample: its level-up moves, the cursor on the first; the move panel's sample move
SAMPLE_SPECIES = "tepig"
SAMPLE_MOVE = "arm_thrust"
# The top screen's samples: Tepig's first ability (Blaze) and its hidden one before it is caught, and the held items of
# Tepig (none), Pikachu (a Light Ball, 5%) and Foongus (three, the third in dark grass only)
SAMPLE_ITEMS_SPECIES = ("tepig", "pikachu", "foongus")
# Evo's samples: the shown species, and which of its family have been caught or seen (the rest not seen): Tepig's line
# with Pignite shown, and Eevee's 8 in the small layout
SAMPLE_EVO = (("evo", "pignite", {"tepig": "caught", "pignite": "caught"}),
              ("evo_eevee", "eevee", {"eevee": "caught", "vaporeon": "caught", "jolteon": "seen", "flareon": "seen",
                                      "espeon": "caught", "umbreon": "seen"}))
# The party icons (a/0/0/7): their palette file and the first icon's file, each species' two after it (poke_icon.c)
POKE_ICONS = "files/a/0/0/7"
POKE_ICON_FIRST = 8
POKE_ICON_SIZE = 32
BAD_EGG = "bad_egg"

# The palette: the page's placeholder colors as paperwhite2_pokedex_info_panels.c's sPanelColors (index 0 clear),
# then the template's own: the grid's checker, the touch bar, the buttons, the tiles' grid
PANEL_COLORS = [
    (0, 0, 0), (4, 4, 5), (22, 22, 23), (31, 31, 31), (7, 7, 8), (15, 15, 16), (30, 7, 6), (19, 4, 4), (31, 18, 4),
    (31, 12, 21), (31, 29, 3), (22, 18, 2), (9, 26, 7), (4, 17, 4), (7, 17, 31), (3, 9, 21),
]
CLEAR, TEXT_C, SHADOW, PANEL, BORDER, DIM = 0, 1, 2, 3, 4, 5
BAR_COLORS = [(50, 6), (80, 8), (100, 10), (130, 12)]
BLUE = 14
EXTRA = [(150, 60, 60), (110, 40, 40), (90, 140, 200), (40, 60, 100), (255, 0, 255), (120, 120, 140), (90, 90, 105)]
GRID_A, GRID_B, TOUCH, TOUCH_EDGE, BUTTON, BUTTON_EDGE, TILE_LINE = range(16, 23)
PINK = 9
# Where the art's 16 colors start in a reference's palette, after the template's
ART_BASE = 23
# The placeholder panels' colors in the art's palette (the top screen's row 0): its white, a dark grey and, for Moves'
# rows, a mid grey
ART_PANEL, ART_BORDER, ART_ROW = 4, 10, 8
# Matchups' reference: after the art's 16 colors, the type icons' 48, then a chosen button's color
ICON_BASE = ART_BASE + 16
BUTTON_CHOSEN_COLOR = (90, 200, 230)
BUTTON_CHOSEN = ICON_BASE + 48
# The multipliers' colors, as the page's MULTIPLIER_*_COLOR and sMatchupColors: above 1 and below it the battle's move
# colors, 0 a light grey, each with the panels' text's light shadow, after the chosen button's color; 1 is the panels'
# text
MATCHUP_COLORS = [(12, 22, 31), (30, 27, 11), (18, 18, 18)]
M_SUPER, M_RESISTED, M_IMMUNE = BUTTON_CHOSEN + 1, BUTTON_CHOSEN + 2, BUTTON_CHOSEN + 3
# Moves' reference: the cursor's 16 colors and the knob's after the multipliers'
CURSOR_BASE = M_IMMUNE + 1
KNOB_BASE = CURSOR_BASE + 16
BORDER_C = 4
MULTIPLIER_ONE = 64

# What the templates are and the art's limits, for the user, beside them
README = """Pokedex Info page: art templates (bottom screen: Stats, Data, Moves, Evo, Matchups; top: move panel)
===========================================================================================================

The tab bar (top 16 rows) is your art: five icons centred at x 64, 96, 128, 160 and 192, the
current tab as you draw it on each sub-page. The game prints no tab names over art; touching
a tab is its icon's column (32 px wide, y 0-17). A sub-page without art yet shows a dark strip
with its own name in the middle instead. The canvases of the sub-pages without art borrow the
Stats art's strip, so their current tab is still Stats' there: draw each sub-page's own.

Files
- stats_canvas.png: draw your art over this one. 256 x 192, the whole bottom screen.
  It now holds the placeholder tab strip (top 16 rows) and the white Stats panel.
  Transparent (palette index 0) = the animated red grid shows through.
- stats_reference.png: the screen as the game shows it over the canvas, with the game's
  own text, numbers and bars, exact to the pixel. Use it as a reference
  layer above or below your drawing.
- stats_reference_tiles.png: the same with the 8 x 8 tile grid.
- data_canvas.png, data_reference.png, data_reference_tiles.png: the same for Data. Its canvas is
  already in your palette, with your tab strip from the Stats art and plain placeholder panels
  (the Data panel and the Egg column) where the game draws its own until there is art.
  Data has no buttons. Its labels (Gender, Catch Rate, GROUP, CYCLES...) are the small font in
  mid grey (123,123,131) without a shadow; its values are near-black with the light grey shadow;
  the male share is blue (57,139,255), the female pink (255,98,172).

Colours on the reference that are NOT art
- the checker = transparent (the grid shows there)
- the blue band at the bottom (y 168-191) = the game's touch bar; leave it transparent
- the pink boxes = the game's buttons (Cry, Turn, Form, Shiny, Language, Abilities): they cover
  your art wherever a button is shown. Form, Shiny and Language only appear for some Pokemon,
  so your art shows in their place otherwise. Abilities, the sixth (y 142-165), only once the
  Pokemon is caught.
  The buttons sit 2 px above the 8 x 8 tile grid (Cry at y 22-45, each 24 px below the last):
  the game scrolls this screen's layer up 2 px and converts your art 2 px lower to match, so
  your art still shows exactly where you drew it. Keep its last 2 rows (y 190-191) transparent.

Limits
- One picture, 256 x 192, at most 16 colours in all, and one of them is the transparent
  colour, so 15 that you see.
- Any shapes or positions: the tool cuts it into 8 x 8 tiles for you. Repeated tiles (and
  flipped ones) are stored once; the screen has room for every tile being different.
- The game draws on top of your art, in its own colours:
  - the panel text: near-black (32,32,41) with a light grey shadow (180,180,189)
  - the stat bars (outline, white track and the coloured fill)
  So keep the panel behind the text light.
- The text and bars go where the reference shows them; ask to have any moved, the bars or
  the line left to your art, or the text in other colours.

The top screen's colours
- top_panels_row0.pal / .gpl and top_panels_row1.pal / .gpl: the two 16-colour palettes
  the top screen's Info panels and background use (row 0 the panels' and the grid's, row 1
  the rest of the panels'); top_panels_palette.png shows them as swatches, row 0 on top.
  In each palette, colour 0 is the transparent one.

Matchups
- matchups_canvas.png, matchups_reference.png, matchups_reference_tiles.png: the same for
  Matchups. Its canvas is in your palette, with your tab strip and the plain placeholder panel.
- The 17 type icons are the game's own sprites, drawn over everything: their places are fixed
  (3 rows of 6, the last place free for a possible new type). Under each, the damage
  multiplier against the Pokemon: a small "x" and the number in the standard font, in the
  battle's move colours: light blue (98,180,255) above x1, yellow (246,222,90) below, and a
  light grey (148,148,148) for x0, each with the same light grey shadow (180,180,189) as the
  near-black text of x1 (the sample is Tepig, Fire).
- The row of buttons at the bottom (y 141-164) are the game's buttons (1 to 3 of them,
  centered): "Default" for every ability that changes no matchup, if the Pokemon has one, then
  each ability that does (Tepig: Default, chosen, and Thick Fat). They sit 3 px above the tile
  grid, between your panel and the touch bar: as on Stats, the layer is scrolled up 3 px and
  your art converted 3 px lower, so it shows as drawn. Keep its last 3 rows (y 189-191)
  transparent.

Data
- The values' column is 1 px further left than before, the whole Egg column too, and the egg
  group names are always the small font.

Moves
- moves_canvas.png, moves_reference.png, moves_reference_tiles.png. Under the tab bar, a second
  bar (y 16-31) of the four sets, "Level Up", "TM/HM", "Tutor", "Egg", in the small font:
  the shown set near-black with its shadow, the others light grey (180,180,189), no shadow.
  Their tops are at y 20 (1 px lower than before). Their touch areas run from each name to the
  next (the gap after TM/HM is for your current tab hanging down). Your art draws this bar.
- 5 rows of moves (the game still draws its grey placeholders over your art, below the bar),
  each 22 px tall at a 24 px pitch, from y 41 (centred between the sets' bar,
  which ends at y 31, and the touch bar from y 168): the move relearner's rows,
  208 px wide with both ends slanted 6 px (x 21-228 at a row's top, 27-234 at its bottom),
  grey with a light end from x 152 (at the top). The cyan cursor round a row is the game's
  (the relearner's sprite) and fits that shape exactly, so keep the rows where they are.
- In each row: the move's type icon (a sprite, centred at x 47), its name in the standard font,
  white with a dark shadow, from x 67, and the set's detail right-aligned at x 220 in the light
  end, near-black ("Lv. 22", "TM26", the tutor's town in the small font, a dash for egg moves).
  The sample is Tepig's level-up moves.
- The scroll bar: a thin track at x 240, y 45-155, centred on the rows (the game draws a light
  line with a dark edge over your art) and the Pokedex list's yellow knob, a sprite, which moves down it as
  the list scrolls. Touching the track (x 234-255) and holding scrolls the list to that place.
- moves_unknown_reference.png (and _tiles): until the Pokemon is caught, only the sets' bar,
  no rows, scroll bar or cursor, and "Learnset Unknown" in the standard font, white with a dark
  shadow, centred at x 128 and on y 100 (its top at y 92). The move panel doesn't open then.

Evo
- evo_canvas.png: your Evo art, the strip and the tree's panel (y 25-57; x 20-236, y 64-161).
- The banner under the tab bar moves with the red grid (left 1 px every 5 frames): the game
  moves your art's tile rows 3-6 (y 24-55, the banner's inside) onto the grid's layer, which
  scrolls, and keeps the rest of your art, the banner's edges at y 22-23 and 56-58 included,
  still (rows of one colour, so they look the same). Those rows must be opaque and repeat
  across with a period that divides 256 (yours: a 4 px grid, the period 4), or a seam shows
  as they wrap; the script prints the period it finds. The references show it at rest.
- evo_reference.png, evo_reference_tiles.png: Tepig's family with Pignite shown (Tepig and
  Pignite caught, Emboar not yet seen); evo_eevee_reference.png and _tiles: Eevee's 8, the most a
  family has, in the small layout (Vaporeon and Espeon caught, Jolteon, Flareon, Umbreon seen,
  Leafeon and Glaceon not yet seen).
- The strip: each species' party icon (the game's animated sprites, 32 x 32, centred at y 41),
  in a row centred at x 128, 32 px apart, closer for big families (Eevee's 28 px). One not yet
  seen is the game's "?" icon. Touching an icon (its column of the strip) opens that Pokemon's
  page if it has been seen.
- The tree, drawn by the game in your art's colours: each row a Poke Ball 16 x 16 (your
  evo_ball_caught/seen/unknown.png), centred at x 34 for the first stage, 54 and 74 for the next,
  rows 15 px apart from y 78 (their centres); the name 10 px right of the ball's centre in the
  standard font, white (238,238,238) with a near-black (24,24,24) shadow, gold (255,238,24) for
  the Pokemon shown, "????" for one not yet seen; how it evolves right-aligned to end at x 225
  (white), in the standard font or the small one where it would reach the name. Gold lines 2 px
  wide run from each Pokemon's ball down and across into its evolutions'. More than 5 rows
  (Eevee) use the small font for everything, rows 11 px apart from y 74.
- Touching a row opens that Pokemon's page, as touching its icon does.

The move panel (top screen)
- move_panel_canvas.png: your art (move_panel.png), 256 x 192, the top screen: the panel at
  x 9-248, y 33-181, below the head bar ("INFO", the top 24 rows), which stays bright. The rest
  of the screen is dimmed while the panel is open; the Pokemon's sprite is hidden.
- move_panel_reference.png, move_panel_reference_tiles.png: your art as the game shows it, over
  a dark checker (the dimmed screen) and the head bar, with a sample move (Arm Thrust): the name
  at (20, 41) on your dark header, its type icon at the top right (centred at 224, 50),
  "Category" at (20, 74) with the category icon (its sprite centred at 105, 80, its drawn
  pixels x 91-118), "Power" (20, 87) and "Accuracy" (20, 101) with their values right-aligned
  to end with the icon (their last pixel at x 118), "PP" (138, 74) and "Priority" (138, 87)
  with theirs right-aligned to end at x 236, and the description from (20, 130), three lines 14 px
  apart: all 10 px lower than before, the name 9 px (a 2 px drop would cut the shadow of its
  p, q and y in its 16 px box).
- The text prints in your palette's colours: the name white (238,238,238) with a near-black
  (24,24,24) shadow, the rest near-black with a light grey (172,172,172) shadow; your art shows
  behind it, inside the text boxes too.
- The panel's tiles share the top screen's BG 1 with the head bar and the text boxes: your art
  takes 45 different tiles, and about 20 more are free.

The entry's text window (top screen)
- top_ability_reference.png, top_hidden_ability_reference.png, top_items_tepig_reference.png,
  top_items_pikachu_reference.png, top_items_foongus_reference.png (and _tiles): the entry's 3
  lines of description at the bottom of the top screen (tiles 2-29, rows 17-23) show other
  text on some sub-pages. On Stats, the Abilities button shows each ability in turn: its name
  in gold (255,238,24) on the first line with which one it is ("Ability 1", "Ability 2" or
  "Hidden Ability") right-aligned on the same line in a mid grey (148,148,148) with a near-black
  (24,24,24) shadow, its description in white below
  (the sample is Tepig's Blaze); the hidden one, until the Pokemon is caught, just "Hidden
  ability undiscovered." centred on the second line. On Data, the wild held items, one a line,
  the name from the left and the rate right-aligned ("Light Ball ... 5%"), the third (found
  only in dark grass) as "Dark grass only: 1%" (Foongus's BalmMushroom), or "Has no hold
  items." centred (Tepig), or "?" until caught.

When you're done, send the PNG back (any 16-colour PNG, indexed or not, transparency as
transparent pixels) and it gets built into the game.
"""

# The planned Area sub-page (pokedex_area_templates.py, docs/paperwhite2/design/pokedex-area.md)
AREA_README = """
Area (planned sixth sub-page, between Evo and Matchups)
=======================================================

The tab bar for six sub-pages
- tabs6_stats.png ... tabs6_matchups.png (one per selected tab, 256 x 24) and tabs6_sheet.png
  (all six stacked): your five tab bars rebuilt for six tabs, centred at x 48, 80, 112, 144,
  176 and 208 (32 apart, as now; the whole row moves 16 px left), Area 5th (x 176). They are cut
  from your five arts: each art's selected tab, and the unselected icons. The dashed magenta box
  is Area's icon to draw (about 16 x 11, as the others). Touching a tab is its 32 px column,
  y 0-17. Each sub-page's art (info_<page>.png) gets its own tab bar from these; Moves' sets bar
  under it has its gap under the Moves tab, which moves from x 96 to x 112.

The top screen
- area_top_map.png: the town map that the AREA page shows today, moved to the top screen 24 px
  down under the INFO head bar: the map's 168 rows fill y 24-191 exactly.
- area_top_box.png (to draw): the current Pokémon's box over the head bar's right end, x 144-255,
  y 0-31 (112 by 32), drawn as OBJs above the head bar; the party icon's 32 by 32 slot at x 148,
  y 0 (dashed), and the name at x 184, y 8 in font 0 (to x 252 at most), on the placeholder white.
- area_top_shapes.png: every place's highlight shape (the game's own, in its original red).
- area_top_frame1.png ... frame4.png: a sample (Unfezant) as its highlights cycle: each place
  glows in the colour of one of its own seasons, the next one about every second; a place it
  lives in all year glows white and doesn't change.

The bottom screen
- area_canvas.png: draw your Area art over this (256 x 192, at most 16 colours with the
  transparent one, as the other sub-pages). It holds the tab bar with Area selected and plain
  placeholder panels where the game prints.
- area_reference.png, area_reference_tiles.png: the screen as the game would show it, with the
  sample's text and the icons' places (yellow boxes, each 32 x 16 on the 8 x 8 grid):
  - Seasons (y 24-39): the season icons at x 48, 88, 128, 168, only those it lives in; "All
    year" at x 210 when it is all four. They double as the map's colour legend.
  - Methods (y 48-135): up to 4 rows 24 px apart (walking, dark grass, surf, fishing; the
    empty ones left out and the shown ones centred in the area, on the 8 x 8 grid): the row's
    icon at x 24 (walking's shows its terrain), shaking side to side where the Pokémon also, or
    only, appears by the row's special version (shaking grass, dust clouds and bridge shadows for
    walking, rippling water for surf and fishing); the icon is grey when only the special version
    applies (but on a bridge). Then
    the levels (x 76), the rarity (x 140) and the encounter rate, right-aligned at x 252.
  - Time (y 136-151) and Weather (y 152-167): 5 icon places each at x 48, 88, 128, 168, 208;
    the times and weathers it appears in, the preferred ones marked.
  The icons must sit on the 8 x 8 grid: they are tiles of the text layer with their own palette.

The icons
- area_icons_template.png: the icon sheet, 160 x 80, slots of 32 x 16 (the type icons' size):
  row 1 seasons (spring, summer, autumn, winter) and an unused slot (the special marks' until a
  shaking icon replaced them), row 2
  times (morning, day, evening, night, late night), row 3 weathers (clear, rain, thunderstorm,
  snow, sandstorm), row 4 terrains (grass, dark grass, cave floor, sand, bridge), row 5 (surf,
  puddle, fishing, walking: a walking row whose areas' terrains differ) and an unused slot.
  Every icon has a grey copy that the game makes. area_icons_guide.png names each slot.
- All icons share ONE palette of 16 colours (index 0 transparent, 15 that show). The template's
  palette is a starter (season pink, green, red, blue, sun yellow, rain blue, sand...): change it
  freely, but keep one palette for the whole sheet. Leave a slot's unused pixels transparent.
- area_glow_template.png: the map's glow colours, a row each (spring, summer, autumn, winter,
  all year), three shades (light, mid, dark), as the game's red has three. Change them to taste.
"""


def rgb(c):
    return tuple(v * 255 // 31 for v in c)


def colors(art_colors=(), icon_colors=(), sprite_colors=()):
    out = [rgb(c) for c in PANEL_COLORS] + EXTRA + list(art_colors)
    if icon_colors:
        out += [(0, 0, 0)] * (ICON_BASE - len(out)) + list(icon_colors) + [BUTTON_CHOSEN_COLOR]
        out += [rgb(c) for c in MATCHUP_COLORS]
    if sprite_colors:
        out += list(sprite_colors)
    return out


def defines(*paths):
    """The C files' integer #defines, with expressions of earlier ones."""
    values = {}
    for path in paths:
        for name, expr in re.findall(r"^#define (\w+) (.+)$", path.read_text(), re.M):
            expr = re.sub(r"//.*", "", expr).strip()
            try:
                values[name] = int(eval(re.sub(r"\b([A-Z_][A-Z0-9_]*)\b",
                                               lambda m: str(values[m.group(1)]), expr), {}))
            except (KeyError, SyntaxError, NameError, TypeError, ZeroDivisionError):
                pass
    return values


def messages():
    out = {}
    for line in TEXT.read_text().split("\n"):
        if " = " in line:
            key, text = line.split(" = ", 1)
            out[key.replace("PokedexData_Text_", "")] = text
    return out


class Font:
    """A game font (a Nitro font with each glyph's widths in its cell, as editor/src/modules/text/font.ts reads it)."""

    def __init__(self, data):
        u8, u16, u32 = (lambda o: data[o]), (lambda o: struct.unpack_from("<H", data, o)[0]), \
            (lambda o: struct.unpack_from("<I", data, o)[0])
        finf = u16(12)
        self.alter = u16(finf + 10)
        cglp, cmap = u32(finf + 16) - 8, u32(finf + 24) - 8
        self.width, self.height, self.size, self.bpp = u8(cglp + 8), u8(cglp + 9), u16(cglp + 10), u8(cglp + 14)
        self.data, self.cglp = data, cglp
        self.map = {}
        at = cmap
        while 0 < at < len(data):
            begin, end, kind, body = u16(at + 8), u16(at + 10), u16(at + 12), at + 20
            if kind == 0:
                for c in range(begin, end + 1):
                    self.map[c] = u16(body) + c - begin
            elif kind == 1:
                for c in range(begin, end + 1):
                    if u16(body + (c - begin) * 2) != 0xFFFF:
                        self.map[c] = u16(body + (c - begin) * 2)
            else:
                for i in range(u16(body)):
                    self.map[u16(body + 2 + i * 4)] = u16(body + 4 + i * 4)
            nxt = u32(at + 16)
            at = nxt - 8 if nxt else 0

    def glyph(self, char):
        cell = self.cglp + 16 + self.map.get(ord(char), self.alter) * self.size
        left, advance = struct.unpack_from("<b", self.data, cell)[0], self.data[cell + 2]
        pixels = []
        for p in range(self.width * self.height):
            bit = p * self.bpp
            byte = self.data[cell + 3 + (bit >> 3)]
            pixels.append((byte >> (8 - self.bpp - (bit & 7))) & ((1 << self.bpp) - 1))
        return left, advance, pixels

    def text_width(self, text):
        return sum(self.glyph(c)[1] for c in text)


class Canvas:
    def __init__(self):
        self.pixels = bytearray(WIDTH * HEIGHT)

    def fill(self, x, y, w, h, color):
        for yy in range(max(0, y), min(HEIGHT, y + h)):
            for xx in range(max(0, x), min(WIDTH, x + w)):
                self.pixels[yy * WIDTH + xx] = color

    def text(self, font, text, x, y, align="left", letter=TEXT_C, shadow=SHADOW):
        width = font.text_width(text)
        x -= {"left": 0, "right": width, "center": width // 2}[align]
        for char in text:
            left, advance, glyph = font.glyph(char)
            for i, value in enumerate(glyph):
                if value:
                    px, py = x + left + i % font.width, y + i // font.width
                    if 0 <= px < WIDTH and 0 <= py < HEIGHT and (value != 2 or shadow != CLEAR):
                        self.pixels[py * WIDTH + px] = letter if value != 2 else shadow
            x += advance

    def outline(self, x, y, w, h, color):
        self.fill(x, y, w, 1, color)
        self.fill(x, y + h - 1, w, 1, color)
        self.fill(x, y, 1, h, color)
        self.fill(x + w - 1, y, 1, h, color)

    def panel(self, x, y, w, h):
        # As PokedexInfoPanels_DrawPanel: a border without its corners round the panel's color
        self.fill(x + 1, y, w - 2, h, BORDER)
        self.fill(x, y + 1, w, h - 2, BORDER)
        self.fill(x + 1, y + 1, w - 2, h - 2, PANEL)

    def write(self, path, palette=None):
        path.write_bytes(write_indexed_png(WIDTH, HEIGHT, bytes(self.pixels), palette or colors()))


def stat_bar(canvas, d, x, y, value):
    # As PokedexInfoPanels_DrawStatBar
    w, h = d["STATS_BAR_WIDTH"], d["STATS_BAR_HEIGHT"]
    color = next((c for limit, c in BAR_COLORS if value < limit), BLUE)
    fill = min(value, d["STATS_BAR_MAX"]) * (w - 2) // d["STATS_BAR_MAX"]
    canvas.fill(x + 1, y, w - 2, h, BORDER)
    canvas.fill(x, y + 1, w, h - 2, BORDER)
    canvas.fill(x + 1, y + 1, w - 2, h - 2, PANEL)
    if fill:
        canvas.fill(x + 1, y + 1, fill, h - 3, color)
        canvas.fill(x + 1, y + h - 2, fill, 1, 7 if color == 8 else color + 1)


def stats_page(d, m, font, small):
    canvas = Canvas()
    canvas.fill(0, 0, WIDTH, d["BAR_WINDOW_HEIGHT"] * 8, BORDER)
    canvas.panel(d["STATS_PANEL_X"], d["STATS_PANEL_Y"], d["STATS_PANEL_WIDTH"], d["STATS_PANEL_HEIGHT"])
    return canvas


def stats_text(canvas, d, m, font):
    names = ["HP", "Attack", "Defense", "SpAttack", "SpDefense", "Speed"]
    for i, (name, value) in enumerate(zip(names, SAMPLE_STATS)):
        y = d["STATS_ROW_Y"] + i * d["STATS_ROW_PITCH"]
        canvas.text(font, m[name], d["STATS_NAME_X"], y)
        canvas.text(font, str(value), d["STATS_VALUE_RIGHT"], y, "right")
        stat_bar(canvas, d, d["STATS_BAR_X"], y + d["STATS_BAR_OFFSET_Y"], value)
    canvas.text(font, m["Total"], d["STATS_NAME_X"], d["STATS_TOTAL_Y"])
    canvas.text(font, str(sum(SAMPLE_STATS)), d["STATS_VALUE_RIGHT"], d["STATS_TOTAL_Y"], "right")


def lifts():
    """Each sub-page's lift of the art's BG, as paperwhite2_pokedex_info_panels.c's sSubpageLift has it: the buttons
    show that many pixels above their tiles. Each must be its art target's offset_y, which converts the art as many
    pixels lower, so that the art shows as drawn."""
    table = re.search(r"sSubpageLift\[[^]]*\] = \{([^}]*)\}", PANELS.read_text()).group(1)
    values = dict(zip(PAGES, (int(v) for v in table.replace(",", " ").split())))
    targets = {t["name"]: t.get("offset_y", 0) for t in json.loads(ART_TARGETS.read_text())["targets"]}
    for page, lift in values.items():
        if targets.get(f"pokedex_info_{page}", 0) != lift:
            raise SystemExit(f"sSubpageLift lifts {page} {lift} px, but its art target's offset_y is "
                             f"{targets.get(f'pokedex_info_{page}', 0)}")
    return values


def buttons(canvas, d, m, font, labels, lift):
    # The game's AppTaskMenuWin buttons, outlined, as paperwhite2_pokedex_info.c places them, lifted with their BG
    x, w, h = d["BUTTON_X"] * 8, d["BUTTON_WIDTH"] * 8, d["BUTTON_HEIGHT"] * 8
    for i, label in enumerate(labels):
        y = (d["BUTTON_Y"] + i * d["BUTTON_PITCH"]) * 8 - lift
        canvas.fill(x, y, w, h, BUTTON)
        canvas.outline(x, y, w, h, BUTTON_EDGE)
        canvas.text(font, m[label], x + w // 2, y + 4, "center", PANEL, CLEAR)


def data_text(canvas, d, m, font, small):
    # As PokedexInfoPanels_DrawData and _DrawEgg
    labels = ["GenderLabel", "CatchRateLabel", "GrowthLabel", "FlavorLabel", "EvYieldLabel", "BaseExpLabel",
              "FriendshipLabel"]
    rows = d["DATA_ROW_Y"], d["DATA_ROW_PITCH"]
    for i, label in enumerate(labels):
        canvas.text(small, m[label], d["DATA_LABEL_X"], rows[0] + i * rows[1] + d["DATA_LABEL_OFFSET_Y"],
                    letter=DIM, shadow=CLEAR)
    right = d["DATA_VALUE_RIGHT"]
    female, separator, male = SAMPLE_GENDER[2], SAMPLE_GENDER[1], SAMPLE_GENDER[0]
    canvas.text(font, female, right, rows[0], "right", PINK)
    right -= font.text_width(female)
    canvas.text(font, separator, right, rows[0], "right")
    right -= font.text_width(separator)
    canvas.text(font, male, right, rows[0], "right", BLUE)
    for i, value in enumerate(SAMPLE_DATA, 1):
        canvas.text(font, value, d["DATA_VALUE_RIGHT"], rows[0] + i * rows[1], "right")
    center = d["EGG_CENTER_X"]
    canvas.text(font, m["EggHeading"], center, d["EGG_HEADING_Y"], "center", 10, BORDER)
    canvas.text(small, m["Group"], center, d["EGG_GROUP_LABEL_Y"], "center", DIM, CLEAR)
    group, cycles, steps = SAMPLE_EGG
    canvas.text(small, group, center, d["EGG_GROUP_Y"], "center", PANEL, BORDER)
    canvas.text(small, m["Cycles"], center, d["EGG_CYCLES_LABEL_Y"], "center", DIM, CLEAR)
    canvas.text(font, cycles, center, d["EGG_CYCLES_Y"], "center", PANEL, BORDER)
    canvas.text(small, steps, center, d["EGG_STEPS_Y"], "center", DIM, CLEAR)


def load_art(page):
    """The user's art of a sub-page as its pixels and 16 colors, or None."""
    path = ART / f"info_{page}.png"
    if not path.exists():
        return None
    _, _, pixels, art_colors = read_indexed_png(path)
    return bytearray(pixels), list(art_colors)[:16]


def placeholder_canvas(d, stats_art, panels):
    """A sub-page's canvas in the art's palette: the Stats art's strip, and the panels the page draws until there is
    art."""
    pixels, art_colors = stats_art
    canvas = Canvas()
    strip = d["BAR_WINDOW_HEIGHT"] * 8 * WIDTH
    canvas.pixels[:strip] = pixels[:strip]
    for name in panels:
        x, y, w, h = (d[f"{name}_PANEL_{k}"] for k in ("X", "Y", "WIDTH", "HEIGHT"))
        canvas.fill(x + 1, y, w - 2, h, ART_BORDER)
        canvas.fill(x, y + 1, w, h - 2, ART_BORDER)
        canvas.fill(x + 1, y + 1, w - 2, h - 2, ART_PANEL)
    return canvas.pixels, art_colors


def moves_canvas(d, canvas):
    """Draws Moves' placeholders into a canvas in the art's palette, as PokedexInfoPanels_DrawMoves draws them without
    art: the sets' light bar, the rows and the scroll bar's track."""
    canvas.fill(0, d["MOVES_SET_BAR_Y"], WIDTH, d["MOVES_SET_BAR_HEIGHT"], ART_PANEL)
    moves_rows(d, canvas, ART_BORDER, ART_ROW, ART_PANEL)


def moves_rows(d, canvas, border, row_color, panel):
    """The rows' placeholders and the scroll bar's track, as PokedexInfoPanels_DrawMoveRow and _DrawMoves draw them
    over the art or without it, in the colors given."""
    height = d["MOVES_ROW_HEIGHT"]
    for row in range(d["POKEDEX_INFO_MOVE_ROWS"]):
        top = d["MOVES_ROW_Y"] + row * d["MOVES_ROW_PITCH"]
        for line in range(height):
            shift = line * d["MOVES_ROW_SLANT"] // (height - 1)
            left, end = d["MOVES_ROW_X"] + shift, d["MOVES_ROW_END_X"] + shift
            right = d["MOVES_ROW_X"] + d["MOVES_ROW_WIDTH"] - 1 + shift
            canvas.fill(left, top + line, right - left + 1, 1, border)
            if 0 < line < height - 1:
                canvas.fill(left + 1, top + line, end - left - 1, 1, row_color)
                canvas.fill(end, top + line, right - end, 1, panel)
    track = d["MOVES_TRACK_X"], d["MOVES_TRACK_TOP"], d["MOVES_TRACK_BOTTOM"] - d["MOVES_TRACK_TOP"]
    canvas.fill(track[0] - 1, track[1], 3, track[2], border)
    canvas.fill(track[0], track[1] + 1, 1, track[2] - 2, panel)


def sprite_cell(chars, cells, cell=0):
    """A cell of a sprite of res/graphics as {(x, y): color index} around its origin, its characters in its bank's
    mapping."""
    width, height, pixels, colors16 = read_indexed_png(chars)
    tiles = tiles_of(pixels, width, height)
    bank = CellBank(cells.read_bytes())
    unit = 1 << struct.unpack_from("<I", bank.tail)[0]
    out = {}
    for obj in bank.cells[cell].objs:
        w, h = OBJ_TILES[obj.attr0 >> 14][obj.attr1 >> 14]
        x, y = obj.attr1 & 0x1FF, obj.attr0 & 0xFF
        x, y = x - 512 if x > 255 else x, y - 256 if y > 127 else y
        hflip, vflip = obj.attr1 >> 12 & 1, obj.attr1 >> 13 & 1
        for t in range(w * h):
            tile = tiles[obj.tile * unit + t]
            for i, value in enumerate(tile):
                if value:
                    px, py = t % w * 8 + i % 8, t // w * 8 + i // 8
                    px, py = w * 8 - 1 - px if hflip else px, h * 8 - 1 - py if vflip else py
                    out[(x + px, y + py)] = value
    return out, colors16


def palette_row(path, row):
    """A row of a JASC palette of res/."""
    lines = path.read_text().split("\n")[3:]
    return [tuple(int(v) for v in line.split()) for line in lines[row * 16:row * 16 + 16]]


def put_sprite(canvas, sprite, x, y, base):
    for (sx, sy), value in sprite.items():
        if 0 <= x + sx < WIDTH and 0 <= y + sy < HEIGHT:
            canvas.pixels[(y + sy) * WIDTH + x + sx] = base + value


def put_icon(canvas, icon, x, y):
    """A 32 by 16 icon centered at x, y, as the type icons' cells center it."""
    for i, value in enumerate(icon):
        if value:
            canvas.pixels[(y - TYPE_ICON_HEIGHT // 2 + i // TYPE_ICON_WIDTH) * WIDTH + x - TYPE_ICON_WIDTH // 2
                          + i % TYPE_ICON_WIDTH] = ICON_BASE + value


def move_data(move):
    """A move's data (name, type, category, power, accuracy, PP, priority, description) from res/moves/."""
    return json.loads((ROOT / f"res/moves/{move}/data.json").read_text())


def type_index(name):
    order = ["NORMAL", "FIGHTING", "FLYING", "POISON", "GROUND", "ROCK", "BUG", "GHOST", "STEEL", "FIRE", "WATER",
             "GRASS", "ELECTRIC", "PSYCHIC", "ICE", "DRAGON", "DARK"]
    return order.index(name.replace("TYPE_", ""))


def move_sets_text(canvas, d, m, small):
    """The sets' names on their bar, as PokedexInfoPanels_DrawMoves prints them, Level Up shown."""
    set_x = [int(v) for v in re.search(r"sMoveSetX\[[^]]*\] = \{([^}]*)\}", PANELS.read_text()).group(1).split(",")]
    for i, name in enumerate(["LevelUp", "Machines", "Tutor", "EggMoves"]):
        canvas.text(small, m[name], set_x[i], d["MOVES_SET_TEXT_Y"], letter=TEXT_C if i == 0 else SHADOW,
                    shadow=SHADOW if i == 0 else CLEAR)


def moves_unknown_text(canvas, d, m, font, small):
    # As PokedexInfoPanels_DrawMoves until the species is caught: the sets' bar, no rows, track, cursor or knob, and
    # "Learnset Unknown" centred, white with the dark shadow, as a row's name
    move_sets_text(canvas, d, m, small)
    canvas.text(font, m["LearnsetUnknown"], d["MOVES_UNKNOWN_X"], d["MOVES_UNKNOWN_Y"], "center", letter=PANEL,
                shadow=BORDER)


def moves_text(canvas, d, m, font, small, icons):
    # As PokedexInfoPanels_DrawMoves and _UpdateMoveActors: the sample's level-up set, the cursor on the first row.
    # Over the user's art the page draws the rows' placeholders and the track in its panels' colors
    if load_art("moves"):
        moves_rows(d, canvas, BORDER, DIM, PANEL)
    move_sets_text(canvas, d, m, small)
    learnset = json.loads((ROOT / f"res/pokemon/{SAMPLE_SPECIES}/data.json").read_text())["learnset"]["by_level"]
    for row, (level, move) in enumerate(learnset[:d["POKEDEX_INFO_MOVE_ROWS"]]):
        top = d["MOVES_ROW_Y"] + row * d["MOVES_ROW_PITCH"]
        data = move_data(move.replace("MOVE_", "").lower())
        put_icon(canvas, icons[type_index(data["type"])], d["MOVES_ROW_ICON_X"], top + d["MOVES_ROW_ICON_OFFSET_Y"])
        y = top + d["MOVES_ROW_TEXT_OFFSET_Y"]
        name_font = font if font.text_width(data["name"]) <= d["MOVES_ROW_NAME_WIDTH"] else small
        canvas.text(name_font, data["name"], d["MOVES_ROW_NAME_X"],
                    y + (0 if name_font is font else d["MOVES_SMALL_TEXT_OFFSET_Y"]), letter=PANEL, shadow=BORDER)
        canvas.text(font, m["MoveLevel"].replace("{0200:0}", str(level)), d["MOVES_ROW_DETAIL_RIGHT"], y, "right")
    cursor, _ = sprite_cell(GRAPHICS / "pokedex_gra/137.png", GRAPHICS / "pokedex_gra/138.ncer")
    put_sprite(canvas, cursor, d["MOVES_CURSOR_X"], d["MOVES_ROW_Y"] + d["MOVES_CURSOR_OFFSET_Y"], CURSOR_BASE)
    knob, _ = sprite_cell(GRAPHICS / "pokedex_gra/057.png", GRAPHICS / "pokedex_gra/063.ncer", d["KNOB_SEQUENCE"])
    # The knob's cell names the list's palette row, 3, whose colors are KNOB_BASE's
    put_sprite(canvas, {k: v % 16 for k, v in knob.items()}, d["MOVES_TRACK_X"],
               d["MOVES_TRACK_TOP"] + d["MOVES_KNOB_HALF_HEIGHT"], KNOB_BASE)


def sprite_colors():
    """The cursor's palette (the relearner's 05.pal) and the knob's (the list's 053.pal, row 3)."""
    return (palette_row(GRAPHICS / "move_tutor/05.pal", 0) + palette_row(GRAPHICS / "pokedex_gra/053.pal", 3))


def paint_screen(canvas, chars, screen, rows, base):
    """Draws the first rows of a screen file's map entries onto a canvas, each tile from chars (a Canvas of the
    character sheet, 32 tiles wide) as flipped, its colors from base; color 0 is left clear."""
    data = screen.read_bytes()
    start = data.find(b"NRCS") + 20
    for row in range(rows):
        for column in range(WIDTH // 8):
            entry = struct.unpack_from("<H", data, start + (row * WIDTH // 8 + column) * 2)[0]
            tile = entry & 0x3ff
            for y in range(8):
                for x in range(8):
                    cx = 7 - x if entry & 0x400 else x
                    cy = 7 - y if entry & 0x800 else y
                    value = chars.pixels[(tile // 32 * 8 + cy) * WIDTH + tile % 32 * 8 + cx]
                    if value:
                        canvas.pixels[(row * 8 + y) * WIDTH + column * 8 + x] = base + value


def sheet(path):
    """A character PNG as a Canvas, 32 tiles wide."""
    width, height, pixels, _ = read_indexed_png(path)
    chars = Canvas()
    for y in range(height):
        chars.pixels[y * WIDTH:y * WIDTH + width] = pixels[y * width:(y + 1) * width]
    return chars


def head_bar_colors():
    """The head bar's 16 colors, INFO's row of its palette."""
    return read_palette(HEAD_BAR_PALETTE)[:16]


def head_bar(canvas, font, base=ART_BASE):
    """The head bar as PokedexDetailHeadbar_InitBG and _PrintTitle draw it, shown, in the colors from base: its
    characters with the title printed on them, placed by its screen's first rows."""
    chars = sheet(HEAD_BAR_CHARS)
    title = re.search(r"^BtlServerFlowTitle_Text_Info = (.*)$", HEAD_BAR_TITLE.read_text(), re.M).group(1)
    chars.text(font, title, HEAD_BAR_TITLE_X, HEAD_BAR_TITLE_Y, letter=15, shadow=14)
    paint_screen(canvas, chars, HEAD_BAR_SCREEN, HEAD_BAR_ROWS, base)


def paint_paletted(canvas, chars, screen, first_row, rows):
    """Draws rows of a screen file's map entries from first_row on, each tile from chars as flipped, in the palette row
    that its entry names (16 colors a row from 0); color 0 is left clear."""
    data = screen.read_bytes()
    start = data.find(b"NRCS") + 20
    for row in range(first_row, first_row + rows):
        for column in range(WIDTH // 8):
            entry = struct.unpack_from("<H", data, start + (row * WIDTH // 8 + column) * 2)[0]
            tile, base = entry & 0x3ff, (entry >> 12) * 16
            for y in range(8):
                for x in range(8):
                    cx = 7 - x if entry & 0x400 else x
                    cy = 7 - y if entry & 0x800 else y
                    value = chars.pixels[(tile // 32 * 8 + cy) * WIDTH + tile % 32 * 8 + cx]
                    if value:
                        canvas.pixels[(row * 8 + y) * WIDTH + column * 8 + x] = base + value


def ability_data(constant):
    """An ability's name and description from res/abilities/, by its ABILITY_* constant."""
    return json.loads((ROOT / f"res/abilities/{constant[len('ABILITY_'):].lower()}.json").read_text())


def item_name(constant):
    return json.loads((ROOT / f"res/items/{constant[len('ITEM_'):].lower()}/data.json").read_text())["name"]


def top_text(d, m, font, kind, species):
    """The lines that the info page prints in the entry's text window, as PokedexInfoPage_DrawAbility and
    _DrawHeldItems print them: (text, x, line, align, color) with x in the window, align "left", "right" (x its end)
    or "center", and color "white", "gold" or "light_grey" (the abilities' slots')."""
    data = json.loads((ROOT / f"res/pokemon/{species}/data.json").read_text())
    right = TEXT_WINDOW_WIDTH - d["TOP_TEXT_X"]
    if kind == "ability":
        ability = ability_data(data["abilities"][0])
        lines = [(ability["name"], d["TOP_TEXT_X"], 0, "left", "gold"), (m["AbilitySlot1"], right, 0, "right", "light_grey")]
        return lines + [(line, d["TOP_TEXT_X"], 1 + i, "left", "white")
                        for i, line in enumerate(ability["description"].split("\n"))]
    if kind == "hidden":
        return [(m["HiddenAbilityUndiscovered"], 0, 1, "center", "white")]
    held = data["held_items"]
    items = [held["common"], held["rare"], held["very_rare"]]
    rates = [50, 5, 1]
    formats = [m["ItemRate"]] * 2 + [m["ItemRateDarkGrass"]]
    if items[0] == items[1]:
        lines = [(items[0], d["HELD_ITEM_ALWAYS"], m["ItemRate"])] if items[0] != "ITEM_NONE" else []
    else:
        lines = [line for line in zip(items, rates, formats) if line[0] != "ITEM_NONE"]
    if not lines:
        return [(m["NoHeldItems"], 0, 1, "center", "white")]
    out = []
    for i, (item, rate, rate_format) in enumerate(lines):
        out.append((item_name(item), d["TOP_TEXT_X"], i, "left", "white"))
        out.append((rate_format.replace("{0200:0}", str(rate)), right, i, "right", "white"))
    return out


def top_screen(d, font, lines, tiles):
    """The top screen as the info page shows the entry with its own text: the entry's panels and grid, the head bar,
    and the text's lines in the font's colors, the gold for the ability's name (the entry's other text, its sprite,
    types and footprint left out); and the tiles' grid if tiles."""
    canvas = Canvas()
    chars = sheet(TOP_CHARS)
    paint_paletted(canvas, chars, TOP_SCREEN_BACK, 0, HEIGHT // 8)
    paint_paletted(canvas, chars, TOP_SCREEN_MID, HEAD_BAR_ROWS, HEIGHT // 8 - HEAD_BAR_ROWS)
    head_bar(canvas, font, TOP_HEAD_BAR_BASE)
    shadow = TOP_FONT_BASE + d["POKEDEX_INFO_TEXT_SHADOW"]
    letters = {color: TOP_FONT_BASE + d[f"POKEDEX_INFO_TEXT_{color.upper()}"]
               for color in ("white", "gold", "light_grey")}
    for text, x, line, align, color in lines:
        if align == "center":
            x = (TEXT_WINDOW_WIDTH - font.text_width(text)) // 2
            align = "left"
        # The slot's grey has the dark shadow (paperwhite2_pokedex_info.c's TOP_TEXT_GREY)
        canvas.text(font, text, TEXT_WINDOW_X + x, TEXT_WINDOW_Y + d["TOP_TEXT_Y"] + line * d["TOP_TEXT_LINE_PITCH"],
                    align, letters[color],
                    TOP_FONT_BASE + d["POKEDEX_INFO_TEXT_DARK_SHADOW"] if color == "light_grey" else shadow)
    if tiles:
        for y in range(HEIGHT):
            for x in range(WIDTH):
                if x % 8 == 0 or y % 8 == 0:
                    canvas.pixels[y * WIDTH + x] = TOP_TILE_LINE
    return canvas


def top_colors(extract):
    """The top references' palette: the entry's rows, the head bar's, the font's row with the page's colors
    (pokedex_info.c's sPageTextColors) in their places, and the tiles' grid's color."""
    out = (read_palette(TOP_PALETTE_FILE) + [(0, 0, 0)] * 48)[:TOP_PALETTE_ROWS * 16]
    out += [(0, 0, 0)] * (TOP_HEAD_BAR_BASE - len(out)) + head_bar_colors()
    font_row = list(palette_colors(read_narc((extract / FONTS).read_bytes())[FONT_PALETTE])[:16])
    table = re.search(r"sPageTextColors\[\] = \{(.*?)\};", ENTRY.read_text(), re.S).group(1)
    for i, color in enumerate(re.findall(r"GX_RGB\((\d+), (\d+), (\d+)\)", table)):
        font_row[defines(ENTRY_HEADER)["POKEDEX_INFO_TEXT_GOLD"] + i] = rgb([int(v) for v in color])
    return out + font_row + [EXTRA[6]]


def move_panel(d, m, font, icons, tiles):
    """The top screen's move panel as PokedexMovePanel_Open and _DrawMove draw it, over a dark checker (the dimmed
    screen) and the head bar: the art's converted tiles and screen in its palette (colors 0-15 of the template), with
    the sample move's text in the art's colors that the panel names, and its icons; and the tiles' grid if tiles."""
    art_colors = dict((name, int(value)) for name, value in re.findall(
        r"ART_COLOR_(\w+) = (\d+)", MOVE_PANEL.read_text()))
    name_c, name_shadow = art_colors["WHITE"], art_colors["NEAR_BLACK"]
    text_c, shadow = art_colors["NEAR_BLACK"], art_colors["LIGHT_GREY"]
    canvas = Canvas()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            canvas.pixels[y * WIDTH + x] = GRID_A if (x // 4 + y // 4) % 2 else GRID_B
    head_bar(canvas, font)
    paint_screen(canvas, sheet(MOVE_PANEL_CHARS), MOVE_PANEL_SCREEN, HEIGHT // 8, 0)
    data = move_data(SAMPLE_MOVE)
    canvas.text(font, data["name"], d["NAME_X"], d["NAME_Y"], letter=name_c, shadow=name_shadow)
    put_icon(canvas, icons[type_index(data["type"])], d["TYPE_ICON_X"], d["TYPE_ICON_Y"])
    put_icon(canvas, icons[len(type_chart()) + ["MOVE_CATEGORY_STATUS", "MOVE_CATEGORY_PHYSICAL",
                                                "MOVE_CATEGORY_SPECIAL"].index(data["category"])],
             d["CATEGORY_ICON_X"], d["CATEGORY_ICON_Y"])
    for label, y in (("Category", "CATEGORY_Y"), ("Power", "POWER_Y"), ("Accuracy", "ACCURACY_Y")):
        canvas.text(font, m[label], d["LABEL_X"], d[y], letter=text_c, shadow=shadow)
    for label, y in (("PP", "PP_Y"), ("Priority", "PRIORITY_Y")):
        canvas.text(font, m[label], d["RIGHT_LABEL_X"], d[y], letter=text_c, shadow=shadow)
    dash = m["NoValue"]
    values = [(str(data["power"]) if data["power"] > 1 else dash, "LEFT_VALUE_RIGHT", "POWER_Y"),
              (str(data["accuracy"]) if data["accuracy"] else dash, "LEFT_VALUE_RIGHT", "ACCURACY_Y"),
              (str(data["pp"]), "RIGHT_VALUE_RIGHT", "PP_Y"),
              (("+" if data["priority"] > 0 else "") + str(data["priority"]), "RIGHT_VALUE_RIGHT", "PRIORITY_Y")]
    for value, x, y in values:
        canvas.text(font, value, d[x], d[y], "right", text_c, shadow)
    for i, line in enumerate(data["description"].split("\n")[:d["DESCRIPTION_LINES"]]):
        canvas.text(font, line, d["DESCRIPTION_X"], d["DESCRIPTION_Y"] + i * d["DESCRIPTION_LINE_PITCH"],
                    letter=text_c, shadow=shadow)
    if tiles:
        for y in range(HEIGHT):
            for x in range(WIDTH):
                if x % 8 == 0 or y % 8 == 0:
                    canvas.pixels[y * WIDTH + x] = TILE_LINE
    return canvas, (read_palette(MOVE_PANEL_PALETTE) + [(0, 0, 0)] * 16)[:16]


def type_chart():
    """The type chart, attacking type first, from its C file."""
    values = [int(v) for v in re.findall(r"\d+", TYPE_CHART.read_text().split("= {", 1)[1].split("};")[0])]
    size = int(len(values) ** 0.5)
    return [values[i * size:(i + 1) * size] for i in range(size)]


def multiplier_text(value):
    """As PokedexInfoPanels_PrintMultiplier: the whole part and as many decimals as it has, after a small "\u00d7"."""
    whole, fraction = divmod(value, MULTIPLIER_ONE)
    digits = ""
    while fraction:
        fraction *= 10
        digits += str(fraction // MULTIPLIER_ONE)
        fraction %= MULTIPLIER_ONE
    return f"{whole}" + (f".{digits}" if digits else "")


def type_icons(extract):
    """Each type's icon as its 32 by 16 pixels in the icons' 48 colors, and those colors."""
    files = read_narc((extract / MENU_COMMON).read_bytes())
    icon_colors = palette_colors(files[TYPE_ICON_PALETTE])[:48]
    rows = [int(v) for v in re.search(r"sTypeIconPalettes\[\] = \{([^}]*)\}", APP_MENU_COMMON.read_text())
            .group(1).replace(",", " ").split()]
    category_rows = [int(v) for v in re.search(r"sIconPalettes\[\] = \{([^}]*)\}", APP_MENU_COMMON.read_text())
                     .group(1).replace(",", " ").split()]
    icons = []
    for t in range(len(type_chart())):
        _, _, pixels = character_pixels(files[TYPE_ICON_CHARS + t], TYPE_ICON_WIDTH, TYPE_ICON_HEIGHT)
        icons.append(bytes(v + rows[t] * 16 if v else 0 for v in pixels))
    # Then the three categories' (status, physical, special), after the types'
    for c in range(3):
        _, _, pixels = character_pixels(files[CATEGORY_ICON_CHARS + c], TYPE_ICON_WIDTH, TYPE_ICON_HEIGHT)
        icons.append(bytes(v + category_rows[c] * 16 if v else 0 for v in pixels))
    return icons, icon_colors


def matchups_text(canvas, d, m, font, small, icons, lift):
    # As PokedexInfoPanels_DrawMatchups, the icons as the page places them (their cells are centered), and the ability
    # buttons as PokedexInfoPage_CreateAbilityButtons, lifted with their BG
    chart = type_chart()
    type1, type2 = SAMPLE_TYPES
    for t, icon in enumerate(icons[:len(chart)]):
        x = d["MATCHUPS_ICON_X"] + t % d["MATCHUPS_COLUMNS"] * d["MATCHUPS_COLUMN_PITCH"]
        y = d["MATCHUPS_ICON_Y"] + t // d["MATCHUPS_COLUMNS"] * d["MATCHUPS_ROW_PITCH"]
        for i, value in enumerate(icon):
            if value:
                px, py = x - TYPE_ICON_WIDTH // 2 + i % TYPE_ICON_WIDTH, y - TYPE_ICON_HEIGHT // 2 + i // TYPE_ICON_WIDTH
                canvas.pixels[py * WIDTH + px] = ICON_BASE + value
        value = chart[t][type1] * (MULTIPLIER_ONE // 4)
        if type2 != type1:
            value = value * chart[t][type2] // 4
        letter, shadow = ((M_SUPER, SHADOW) if value > MULTIPLIER_ONE else (M_RESISTED, SHADOW)
                          if 0 < value < MULTIPLIER_ONE else (M_IMMUNE, SHADOW) if value == 0 else (TEXT_C, SHADOW))
        number, sign = multiplier_text(value), m["Multiplier"]
        left = x - (small.text_width(sign) + small.text_width(number)) // 2
        top = y + d["MATCHUPS_VALUE_OFFSET_Y"]
        canvas.text(small, sign, left, top + d["MULTIPLIER_SIGN_OFFSET_Y"], "left", letter, shadow)
        canvas.text(small, number, left + small.text_width(sign), top, "left", letter, shadow)
    count, w, h = len(SAMPLE_ABILITIES), d["ABILITY_BUTTON_WIDTH"], d["ABILITY_BUTTON_HEIGHT"]
    for i, ability in enumerate(SAMPLE_ABILITIES):
        x = (d["ABILITY_BUTTON_CENTER_X"] - count * w // 2 + i * w) * 8
        y = d["ABILITY_BUTTON_Y"] * 8 - lift
        name = m["DefaultAbility"] if ability is None else re.search(
            r'"name": "([^"]*)"', (ROOT / f"res/abilities/{ability}.json").read_text()).group(1)
        canvas.fill(x, y, w * 8, h * 8, BUTTON_CHOSEN if i == 0 else BUTTON)
        canvas.outline(x, y, w * 8, h * 8, BUTTON_EDGE)
        text_x = (w * 8 - font.text_width(name) - 2 * BUTTON_FRAME) // 2 + BUTTON_FRAME
        canvas.text(font, name, x + text_x, y + BUTTON_TEXT_Y, letter=PANEL, shadow=CLEAR)


def species_data(name):
    return json.loads((ROOT / f"res/pokemon/{name}/data.json").read_text())


def species_numbers():
    numbers = {}
    for i, line in enumerate(l for l in (ROOT / "generated/species.txt").read_text().split("\n")
                             if l.startswith("SPECIES_")):
        numbers[line.split(" = ")[0].strip()] = i
    return numbers


def evo_family(species):
    """As PokedexInfoEvo_LoadFamily: the family of a species from its root (the first species, in the species' order,
    whose evolutions name it, and so on up), each species followed by its evolutions in their data's order and theirs,
    as (species, depth, parent's row, [evolutions from the parent into it])."""
    numbers = species_numbers()
    names = {number: name[len("SPECIES_"):].lower() for name, number in numbers.items()}
    parents = {}
    for number in sorted(names):
        path = ROOT / f"res/pokemon/{names[number]}/data.json"
        if path.exists() and number <= numbers["SPECIES_GENESECT"]:
            for e in species_data(names[number]).get("evolutions") or []:
                parents.setdefault(e["species"][len("SPECIES_"):].lower(), names[number])
    root = species
    while root in parents:
        root = parents[root]
    rows = [(root, 0, None, [])]

    def add(row):
        name, depth = rows[row][0], rows[row][1]
        if depth + 1 >= 3:
            return
        for e in species_data(name).get("evolutions") or []:
            child = e["species"][len("SPECIES_"):].lower()
            known = [r for r in rows if r[2] == row and r[0] == child]
            if known:
                known[0][3].append(e)
                continue
            rows.append((child, depth + 1, row, [e]))
            add(len(rows) - 1)
    add(0)
    return rows


# By EVO_METHOD_*, as sEvoMethodTexts: the full and shortened messages and the parameter's kind
EVO_METHODS = {
    "LEVEL": ("EvoLevel", "EvoLevelShort", "number"), "FRIENDSHIP": ("EvoFriendship", "EvoFriendshipShort", "number"),
    "FRIENDSHIP_DAY": ("EvoFriendshipDay", "EvoFriendshipDayShort", "number"),
    "FRIENDSHIP_NIGHT": ("EvoFriendshipNight", "EvoFriendshipNightShort", "number"),
    "TRADE": ("EvoTrade", "EvoTrade", "number"), "TRADE_WITH_ITEM": ("EvoTradeItem", "EvoTradeItemShort", "item"),
    "TRADE_WITH_SPECIES": ("EvoTradeSpecies", "EvoTradeSpecies", "partner"),
    "ITEM": ("EvoItem", "EvoItemShort", "item"), "LEVEL_ATK_GT_DEF": ("EvoAttackHigher", "EvoAttackHigherShort", "number"),
    "LEVEL_ATK_EQ_DEF": ("EvoAttackEqual", "EvoAttackEqualShort", "number"),
    "LEVEL_ATK_LT_DEF": ("EvoAttackLower", "EvoAttackLowerShort", "number"),
    "LEVEL_PERSONALITY_LOW": ("EvoPersonality", "EvoPersonalityShort", "number"),
    "LEVEL_PERSONALITY_HIGH": ("EvoPersonality", "EvoPersonalityShort", "number"),
    "SHEDINJA": ("EvoLevel", "EvoLevelShort", "number"), "SHEDINJA_MADE": ("EvoShedinja", "EvoShedinjaShort", "parent"),
    "BEAUTY": ("EvoBeauty", "EvoBeautyShort", "number"), "ITEM_MALE": ("EvoItemMale", "EvoItemMaleShort", "item"),
    "ITEM_FEMALE": ("EvoItemFemale", "EvoItemFemaleShort", "item"),
    "HELD_ITEM_DAY": ("EvoHeldItemDay", "EvoHeldItemDayShort", "item"),
    "HELD_ITEM_NIGHT": ("EvoHeldItemNight", "EvoHeldItemNightShort", "item"),
    "KNOWS_MOVE": ("EvoKnowsMove", "EvoKnowsMoveShort", "move"),
    "SPECIES_IN_PARTY": ("EvoSpeciesInParty", "EvoSpeciesInPartyShort", "species"),
    "LEVEL_MALE": ("EvoLevelMale", "EvoLevelMaleShort", "number"),
    "LEVEL_FEMALE": ("EvoLevelFemale", "EvoLevelFemaleShort", "number"),
    "LEVEL_MAGNETIC_FIELD": ("EvoMagneticField", "EvoMagneticFieldShort", "number"),
    "LEVEL_MOSS_ROCK": ("EvoMossRock", "EvoMossRockShort", "number"),
    "LEVEL_ICE_ROCK": ("EvoIceRock", "EvoIceRockShort", "number"),
}


def evo_method_text(m, evolution, parent, shortened):
    """As PokedexInfoEvo_FormatMethod."""
    full, short, kind = EVO_METHODS[evolution["method"][len("EVO_METHOD_"):]]
    param = evolution["param"]
    text = m[short if shortened else full].replace("{0200:0}", str(param) if isinstance(param, int) else "0")
    name = ""
    if kind == "item":
        name = item_name(param)
    elif kind == "move":
        name = move_data(param[len("MOVE_"):].lower())["name"]
    elif kind == "species":
        name = species_data(param[len("SPECIES_"):].lower())["name"]
    elif kind == "parent":
        name = species_data(parent)["name"]
    elif kind == "partner":
        name = species_data("shelmet" if parent == "karrablast" else "karrablast")["name"]
    return text.replace("{0100:1}", name)


def evo_method(d, m, font, small, row, rows, left, small_layout):
    """As PokedexInfoEvo_DrawMethod: the text, its font and where it starts, the first wording and font that fit
    between left and EVO_METHOD_RIGHT; or the shortest in font 1 from left, and False."""
    _, _, parent, evolutions = rows[row]
    parent = rows[parent][0]
    wordings = ([(True, False), (True, True)] if len(evolutions) > 1 else []) + [(False, False), (False, True)]
    for both, shortened in wordings:
        text = evo_method_text(m, evolutions[0], parent, shortened)
        if both:
            text = m["EvoOr"].replace("{0100:0}", text).replace(
                "{0100:1}", evo_method_text(m, evolutions[1], parent, shortened))
        for f in ((small,) if small_layout else (font, small)):
            if left + f.text_width(text) <= d["EVO_METHOD_RIGHT"]:
                return text, f, d["EVO_METHOD_RIGHT"] - f.text_width(text), True
    return text, small, left, False


def evo_layout(d, rows):
    """Each row's ball center, the layout's font size (small) and the strip's icons' centers, as the C file's."""
    small_layout = len(rows) > d["EVO_ROWS_NORMAL"]
    y0, pitch = ((d["EVO_SMALL_ROW_Y"], d["EVO_SMALL_ROW_PITCH"]) if small_layout
                 else (d["EVO_ROW_Y"], d["EVO_ROW_PITCH"]))
    centers = [(d["EVO_ROW_X"] + depth * d["EVO_DEPTH_INDENT"], y0 + i * pitch) for i, (_, depth, _, _) in
               enumerate(rows)]
    icon_pitch = d["EVO_STRIP_WIDTH"] // len(rows) if len(rows) * d["EVO_STRIP_PITCH_MAX"] > d["EVO_STRIP_WIDTH"] \
        else d["EVO_STRIP_PITCH_MAX"]
    icons = [d["EVO_STRIP_CENTER_X"] - (len(rows) - 1) * icon_pitch // 2 + i * icon_pitch for i in range(len(rows))]
    return centers, small_layout, icons


def poke_icons(extract):
    """The party icons' 48 colors, and a function giving a species' icon (frame 0) as 32 by 32 color indices into them."""
    files = read_narc((extract / POKE_ICONS).read_bytes())
    numbers = species_numbers()
    rows = [int(v, 0) for v in re.findall(r"0x[0-9a-fA-F]+|\b\d+\b", re.search(
        r"sPokeIconPalettes\[\] = \{([^}]*)\}", POKE_ICON.read_text()).group(1))]

    def icon(name):
        number = numbers[f"SPECIES_{name.upper()}"]
        _, _, pixels = character_pixels(files[POKE_ICON_FIRST + number * 2], POKE_ICON_SIZE, POKE_ICON_SIZE * 2)
        row = rows[number] & 15
        return [v + row * 16 if v else 0 for v in pixels[:POKE_ICON_SIZE * POKE_ICON_SIZE]]
    return palette_colors(files[0])[:48], icon


def evo_text(canvas, d, m, font, small, icon_of, shown, states):
    """As PokedexInfoEvo_Show over the art (its colors from ART_BASE): the lines, each row's ball,
    name and method, and the strip's icons (their colors from ICON_BASE)."""
    rows = evo_family(shown)
    centers, small_layout, icons = evo_layout(d, rows)
    art = lambda name: ART_BASE + d[f"EVO_COLOR_{name}"]
    line = d["EVO_LINE_WIDTH"]
    for i, (_, _, parent, _) in enumerate(rows[1:], 1):
        (px, py), (x, y) = centers[parent], centers[i]
        canvas.fill(px - line // 2, py, line, y - py + 1, art("GOLD"))
        canvas.fill(px - line // 2, y - line // 2, x - px + line // 2, line, art("GOLD"))
    balls = {state: read_indexed_png(ART / f"evo_ball_{state}.png")[2] for state in ("caught", "seen", "unknown")}
    size = d["EVO_BALL_SIZE"]
    offset = d["EVO_SMALL_TEXT_OFFSET_Y"] if small_layout else d["EVO_TEXT_OFFSET_Y"]
    name_font = small if small_layout else font
    for i, (name, _, _, _) in enumerate(rows):
        x, y = centers[i]
        state = states.get(name, "unknown")
        for j, value in enumerate(balls[state]):
            if value:
                canvas.pixels[(y - size // 2 + j // size) * WIDTH + x - size // 2 + j % size] = ART_BASE + value
        text = species_data(name)["name"] if state != "unknown" else m["EvoUnknownName"]
        x += d["EVO_NAME_OFFSET_X"]
        canvas.text(name_font, text, x, y - offset, letter=art("GOLD" if name == shown else "WHITE"),
                    shadow=art("DARK"))
        if i:
            method, f, left, _ = evo_method(d, m, font, small, i, rows, x + name_font.text_width(text)
                                            + d["EVO_METHOD_GAP"], small_layout)
            canvas.text(f, method, left, y - (d["EVO_TEXT_OFFSET_Y"] if f is font else d["EVO_SMALL_TEXT_OFFSET_Y"]),
                        letter=art("WHITE"), shadow=art("DARK"))
        pixels = icon_of(name if state != "unknown" else BAD_EGG)
        for j, value in enumerate(pixels):
            if value:
                canvas.pixels[(d["EVO_STRIP_ICON_Y"] - POKE_ICON_SIZE // 2 + j // POKE_ICON_SIZE) * WIDTH + icons[i]
                              - POKE_ICON_SIZE // 2 + j % POKE_ICON_SIZE] = ICON_BASE + value


def banner_check(d, evo_art):
    """Evo's banner: the art's tile rows that the page moves onto the grid's BG, which scrolls (paperwhite2_pokedex_
    info_panels.c's BANNER_*), must repeat across with a period that divides 256, so that they wrap without a seam,
    and be opaque, as the backdrop, not the grid, would show through them."""
    pixels = evo_art[0]
    top, bottom = d["BANNER_TILE_Y"] * 8, (d["BANNER_TILE_Y"] + d["BANNER_TILES_DOWN"]) * 8
    rows = [pixels[y * WIDTH:(y + 1) * WIDTH] for y in range(top, bottom)]
    if any(0 in row for row in rows):
        return f"the banner (y {top}-{bottom - 1}) has transparent pixels, which would show the backdrop"
    for period in (p for p in range(1, WIDTH + 1) if WIDTH % p == 0):
        if all(row[x] == row[x % period] for row in rows for x in range(WIDTH)):
            return f"the banner (y {top}-{bottom - 1}) scrolls with the grid and repeats every {period} px"
    return f"the banner (y {top}-{bottom - 1}) doesn't repeat across: it would show a seam as it scrolls"


def evo_check(d, m, font, small):
    """Every family's rows whose method doesn't fit after its species' name (all seen) in any wording, printed."""
    numbers = species_numbers()
    misfits = []
    for name, number in numbers.items():
        species = name[len("SPECIES_"):].lower()
        if not 0 < number <= numbers["SPECIES_GENESECT"]:
            continue
        rows = evo_family(species)
        if rows[0][0] != species:
            continue
        _, small_layout, _ = evo_layout(d, rows)
        centers = evo_layout(d, rows)[0]
        name_font = small if small_layout else font
        for i in range(1, len(rows)):
            width = max(name_font.text_width(species_data(rows[i][0])["name"]), name_font.text_width(m["EvoUnknownName"]))
            left = centers[i][0] + d["EVO_NAME_OFFSET_X"] + width + d["EVO_METHOD_GAP"]
            text, _, _, fits = evo_method(d, m, font, small, i, rows, left, small_layout)
            if not fits or len(rows[i][3]) > 1:
                misfits.append(f"{rows[i][0]}: {text!r}" + ("" if fits else " (doesn't fit)"))
    return misfits


def reference(art, draw_text, tiles):
    """art is a placeholder Canvas, or the art's (pixels, colors), which go after the template's colors."""
    canvas = Canvas()
    pixels, base = (art.pixels, 0) if isinstance(art, Canvas) else (art[0], ART_BASE)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            value = pixels[y * WIDTH + x]
            canvas.pixels[y * WIDTH + x] = value + base if value else (GRID_A if (x // 4 + y // 4) % 2 else GRID_B)
    draw_text(canvas)
    canvas.fill(0, TOUCHBAR_Y, WIDTH, HEIGHT - TOUCHBAR_Y, TOUCH)
    canvas.outline(0, TOUCHBAR_Y, WIDTH, HEIGHT - TOUCHBAR_Y, TOUCH_EDGE)
    if tiles:
        for y in range(HEIGHT):
            for x in range(WIDTH):
                if x % 8 == 0 or y % 8 == 0:
                    canvas.pixels[y * WIDTH + x] = TILE_LINE
    return canvas


def top_palettes(extract, out):
    """The top screen's Info panels' palette rows, as palette files and a PNG of swatches, a row of 16 for each."""
    colors16 = palette_colors(read_narc((extract / POKEDEX_GRA).read_bytes())[TOP_PALETTE])
    rows = [colors16[row * 16:row * 16 + 16] for row in TOP_ROWS]
    for row, cs in zip(TOP_ROWS, rows):
        (out / f"top_panels_row{row}.pal").write_text(write_palette(cs))
        (out / f"top_panels_row{row}.gpl").write_text(
            f"GIMP Palette\nName: Pokedex Info top, row {row}\nColumns: 16\n#\n"
            + "".join(f"{r:3} {g:3} {b:3}\tIndex {i}\n" for i, (r, g, b) in enumerate(cs)))
    swatches = [c for cs in rows for c in cs]
    width, height = 16 * SWATCH, len(rows) * SWATCH
    pixels = bytes((y // SWATCH) * 16 + x // SWATCH for y in range(height) for x in range(width))
    (out / "top_panels_palette.png").write_bytes(write_indexed_png(width, height, pixels, swatches))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--extract", type=Path, default=ROOT / "extract/w2_us")
    parser.add_argument("out", type=Path, nargs="?", default=ROOT / "build/pokedex_templates")
    args = parser.parse_args()
    fonts = read_narc((args.extract / FONTS).read_bytes())
    font, small = Font(fonts[0]), Font(fonts[1])
    d, m = defines(HEADER, ENTRY_HEADER, PANELS, PAGE, MOVE_PANEL, EVO), messages()
    args.out.mkdir(parents=True, exist_ok=True)
    icons, icon_colors = type_icons(args.extract)
    lift = lifts()

    def write(page, art, draw, palette):
        for tiles, name in ((False, f"{page}_reference.png"), (True, f"{page}_reference_tiles.png")):
            reference(art, draw, tiles).write(args.out / name, palette)

    stats_art = load_art("stats")
    if stats_art:
        (args.out / "stats_canvas.png").write_bytes((ART / "info_stats.png").read_bytes())
        art, palette = stats_art, colors(stats_art[1])
    else:
        art, palette = stats_page(d, m, font, small), colors()
        art.write(args.out / "stats_canvas.png")

    def stats(canvas):
        stats_text(canvas, d, m, font)
        buttons(canvas, d, m, font, ["Cry", "Turn", "Form", "Shiny", "Language", "Abilities"], lift["stats"])
    write("stats", art, stats, palette)

    # The other sub-pages: the user's art once there is some, else a canvas in the Stats art's palette with its tab
    # strip and the placeholders that the page draws until there is art
    def sub_page(page, panels, extra=None):
        found = load_art(page)
        if found or not stats_art:
            return found
        pixels, art_colors = placeholder_canvas(d, stats_art, panels)
        if extra:
            canvas = Canvas()
            canvas.pixels = pixels
            extra(d, canvas)
        return pixels, art_colors

    def art16(found):
        return (list(found[1]) + [(0, 0, 0)] * 16)[:16]

    for page, panels, extra, draw, sprites in (
            ("data", ("DATA", "EGG"), None, lambda c: data_text(c, d, m, font, small), False),
            ("moves", (), moves_canvas, lambda c: moves_text(c, d, m, font, small, icons), True),
            ("matchups", ("MATCHUPS",), None,
             lambda c: matchups_text(c, d, m, font, small, icons, lift["matchups"]), False)):
        found = sub_page(page, panels, extra)
        if not found:
            continue
        (args.out / f"{page}_canvas.png").write_bytes(write_indexed_png(WIDTH, HEIGHT, bytes(found[0]), found[1]))
        write(page, found, draw, colors(art16(found), icon_colors, sprite_colors() if sprites else ()))
        if page == "moves":
            write("moves_unknown", found, lambda c: moves_unknown_text(c, d, m, font, small),
                  colors(art16(found), icon_colors))

    # Evo: the art as its canvas, and each sample family over it, the party icons' colors after the art's
    evo_art = load_art("evo")
    if evo_art:
        (args.out / "evo_canvas.png").write_bytes(write_indexed_png(WIDTH, HEIGHT, bytes(evo_art[0]), evo_art[1]))
        icon_colors16, icon_of = poke_icons(args.extract)
        for name, shown, states in SAMPLE_EVO:
            write(name, evo_art, lambda c: evo_text(c, d, m, font, small, icon_of, shown, states),
                  colors(art16(evo_art), icon_colors16))
        for line in evo_check(d, m, font, small):
            print("evo:", line)
        print("evo:", banner_check(d, evo_art))

    # The top screen's move panel, once it has the user's art: the canvas is the art, the reference has the sample move
    if MOVE_PANEL_ART.exists():
        (args.out / "move_panel_canvas.png").write_bytes(MOVE_PANEL_ART.read_bytes())
        for name, tiles in (("move_panel_reference.png", False), ("move_panel_reference_tiles.png", True)):
            canvas, panel_colors = move_panel(d, m, font, icons, tiles)
            # The dimmed screen's checker in dark greys, in the grid's places, and the head bar's colors in the art's
            palette = panel_colors + [(46, 46, 54), (32, 32, 38)] + EXTRA[2:]
            palette += head_bar_colors()
            palette += [(0, 0, 0)] * (ICON_BASE - len(palette)) + list(icon_colors)
            canvas.write(args.out / name, palette)
    # The top screen's text window with the info page's own text: an ability on Stats, the held items on Data
    samples = [("top_ability", "ability", SAMPLE_SPECIES), ("top_hidden_ability", "hidden", SAMPLE_SPECIES)]
    samples += [(f"top_items_{species}", "items", species) for species in SAMPLE_ITEMS_SPECIES]
    top_palette = top_colors(args.extract)
    for name, kind, species in samples:
        lines = top_text(d, m, font, kind, species)
        for suffix, tiles in (("", False), ("_tiles", True)):
            top_screen(d, font, lines, tiles).write(args.out / f"{name}_reference{suffix}.png", top_palette)
    (args.out / "README.txt").write_text(README + AREA_README)
    top_palettes(args.extract, args.out)
    # The planned Area sub-page's templates (docs/paperwhite2/design/pokedex-area.md)
    from tools.paperwhite2 import pokedex_area_templates
    pokedex_area_templates.write(args.out, font, small)
    print(f"wrote the templates to {args.out}")


if __name__ == "__main__":
    main()
