#!/usr/bin/env python3
"""The Pokédex Info page's planned Area sub-page (docs/paperwhite2/design/pokedex-area.md): art templates, written by
pokedex_templates.py beside the other sub-pages' into the same ignored folder, as they hold the ROM's map and fonts.

- area_top_map.png: the top screen as Area would show it, the town map (a/0/8/4's BG characters 5 and 7, screens 17
  and 16, ext palette 0, as pokedex_detail_map.c loads them) moved 24 px down under the head bar, without highlights;
- area_top_shapes.png: every place's highlight (the area OBJs, ARCID_POKEDEX_GRA 15/29/46, each place's animation and
  position from res/town_map/) in the original red, to see their shapes;
- area_top_box.png: the current Pokémon's box over the head bar's right end (BOX_* below, as the C file's: the area
  its four OBJs cover), on the map, with the party icon's 32 by 32 slot and the name's place marked, to draw the
  box's art over (the user's is res/paperwhite2/pokedex_art/area_top_box.png);
- area_top_frame<N>.png (N 1-4): a sample species' (SAMPLE) highlights as the four steps of the season cycle: each
  place in the colour of the season that step shows of the place's own seasons, white where it is all year;
- tabs6_<page>.png (one per selected tab) and tabs6_sheet.png (all six stacked): the tab bar for six sub-pages, cut
  from the user's five arts (each one's selected tab and the others' unselected icons) and put at the six centres,
  with an empty dashed slot for Area's icon; indexed in the arts' colours, to draw over;
- area_canvas.png: the Area bottom screen to draw over (indexed), the tab bar with Area selected and the regions'
  placeholders (the first draft's; the user's art is res/paperwhite2/pokedex_art/info_area.png);
- area_reference.png / area_reference_tiles.png (with the 8 by 8 tiles' grid): the user's art with every icon slot,
  and text at the pixels where the page puts them (read from paperwhite2_pokedex_info_area.c), four method
  rows; area_reference_rows<N>.png / _rows<N>_tiles.png (N 1-4): the same with N rows, as the page centres them;
- area_icons_template.png: the icon sheet, 32 by 16 slots in a 16-colour starter palette; area_icons_guide.png: the
  same at 3x with each slot's name; area_glow_template.png: the highlight colours, three shades a row.

And the Pokédex Habitat List's filter bar (the art target pokedex_habitat_bar, paperwhite2_habitat_dex.c's BAR_* and
the places below), from the user's art (res/paperwhite2/pokedex_art/habitat_bar.png) and the Area icons:

- habitat_bar_canvas.png: the bar (256 by 48, indexed) to draw over, with every place marked in dashes: the top row's
  icons for 5 methods, the filters', the page arrows' (16 by 16) and the page's, and the stamp's; and the filters'
  dots under their icons (one for each value, the first yellow), which the art leaves room for;
- habitat_bar_layouts.png: the bar as the screen shows it with 1 to 5 methods (a bar each, stacked): the methods
  spread evenly over the top row's width, the first chosen in colour and the others grey, the filters on spring, day
  and "any" with their dots, and the arrows' and the page's places;
- habitat_bar_guide.png: the bar at 3x with each count's icon places outlined (a colour each, labelled), the touch
  areas' edges, the filters' and their dots', the arrows', the page's and the stamp's.

    pokedex_area_templates.py OUT_DIR  (or through pokedex_templates.py, which calls write())
"""
import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.nitro_2d import read_indexed_png, write_indexed_png, write_rgba_png  # noqa: E402
from tools.paperwhite2 import pokedex_templates as pt  # noqa: E402
from tools.paperwhite2.nitro_cells import Animations  # noqa: E402

W, H = 256, 192
TOWNMAP_GRA = ROOT / "res/graphics/townmap_gra"
POKEDEX_GRA = ROOT / "res/graphics/pokedex_gra"
TOWN_MAP = ROOT / "res/town_map"
# The map's BGs (PokedexDetailMap_LoadMapBG): BG 3 (characters 7, screen 16) under BG 2 (characters 5, screen 17)
MAP_LAYERS = (("07.png", "16.nscr"), ("05.png", "17.nscr"))
# The head bar's rows: the map moves this far down on the top screen, so its 168 rows fill the rest
MAP_SHIFT = 24
# The area OBJs: characters, cells, animations and palette (PokedexDetailMap_CreateActors), and the red's indices
AREA_CHARS, AREA_CELLS, AREA_ANIMS, AREA_PALETTE = "015.png", "029.ncer", "046.nanr", "005.pal"
AREA_SHADES = (6, 7, 8)
# Proposed glow colours, three shades each (light, mid, dark as the original's 6-8): spring, summer, autumn, winter,
# then all year
SEASON_NAMES = ("Spring", "Summer", "Autumn", "Winter")
GLOW = [
    [(255, 150, 200), (230, 100, 160), (170, 60, 115)],
    [(120, 230, 100), (70, 190, 60), (40, 130, 40)],
    [(255, 90, 60), (215, 55, 40), (150, 35, 30)],
    [(110, 170, 255), (60, 120, 230), (35, 75, 170)],
    [(255, 255, 255), (220, 220, 230), (170, 170, 185)],
]
SAMPLE = "unfezant"
# The six-tab bar: centres from x 48, 32 apart; the five arts' tabs are at 64 + 32 i today
TAB_X, TAB_PITCH, OLD_TAB_X = 48, 32, 64
PAGES6 = ("stats", "data", "moves", "evo", "area", "matchups")
# What a tab's cut takes: the selected tab hangs to y 18 and is 42 px wide; an unselected icon is above the line (y 14)
SELECTED_HALF, SELECTED_ROWS = 22, 20
ICON_HALF, ICON_ROWS = 12, 14
STRIP_ROWS = 24
# The first draft's regions on area_canvas.png
ICON_W, ICON_H = 32, 16
SEASONS_Y = 24
METHOD_Y, METHOD_HEIGHT = 48, 88
TIMES_Y = 136
# The page's places (the bottom screen's pixels) are the C file's
AREA_C = ROOT / "src/paperwhite2/ov298/paperwhite2_pokedex_info_area.c"
AREA_ART = ROOT / "res/paperwhite2/pokedex_art/info_area.png"
# The references' sample rows: icon, levels and rarity
REFERENCE_ROWS = (("grass", "Lv. 36-66", "Common - Exotic"), ("dark grass", "Lv. 36-66", "Common - Exotic"),
                  ("surf", "Lv. 36-66", "Common - Uncommon"), ("fishing", "Lv. 36-66", "Uncommon"))
TOUCHBAR_Y = 168
# The top screen's box of the current Pokémon (paperwhite2_pokedex_info_area.c's BOX_*): the box's OBJs, the party
# icon's 32 by 32 slot, and the name's left and top in font 0 (font 1 for a name that would pass BOX_NAME_RIGHT)
BOX_X, BOX_Y, BOX_W, BOX_H = 128, 0, 128, 32
BOX_ICON_X, BOX_ICON_Y = 156, 0
BOX_NAME_X, BOX_NAME_Y, BOX_NAME_RIGHT = 190, 8, 252
# The icons: (group, names), a row of the sheet each, 32 by 16 slots. Row 1's fifth slot (the special marks' until
# 2026-11-09: a row whose special version applies now shakes its icon) is unused; row 5's fifth is "any", the Habitat
# List's season, time or weather filter when it is off. The terrain icons show a walking row's terrain, "walking" when
# its areas' terrains differ.
ICONS = [
    ("season", ["spring", "summer", "autumn", "winter", None]),
    ("time", ["morning", "day", "evening", "night", "late_night"]),
    ("weather", ["clear", "rain", "thunderstorm", "snow", "sandstorm"]),
    ("terrain", ["grass", "dark_grass", "cave_floor", "sand", "bridge"]),
    ("method", ["surf", "puddle", "fishing", "walking", "any"]),
]
# The icons' starter palette (index 0 transparent)
ICON_COLORS = [(0, 0, 0), (24, 24, 32), (255, 255, 255), (170, 170, 185), (100, 100, 115), (255, 150, 200),
               (70, 190, 60), (215, 55, 40), (60, 120, 230), (255, 220, 60), (120, 210, 255), (190, 150, 90),
               (130, 90, 200), (40, 130, 40), (255, 140, 40), (90, 60, 40)]
# Placeholder colours of the bottom canvas and references (RGB)
CHECK_A, CHECK_B = (60, 60, 70), (45, 45, 52)
TOUCH, TOUCH_EDGE = (90, 140, 200), (40, 60, 100)
PANEL, PANEL_EDGE = (238, 238, 238), (24, 24, 24)
SLOT, SLOT_EDGE, GREY_SLOT = (255, 230, 120), (200, 140, 0), (200, 200, 200)
TEXT, SHADOW = (32, 32, 41), (180, 180, 189)
GOLD = (255, 238, 24)
TILE_LINE = (255, 0, 255)


class Rgb:
    """An RGB picture with a transparent colour (None)."""

    def __init__(self, w=W, h=H, fill=None):
        self.w, self.h = w, h
        self.px = [fill] * (w * h)

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y * self.w + x] = c

    def fill(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, c)

    def outline(self, x, y, w, h, c, dashed=False):
        for i in range(w):
            if not dashed or i % 4 < 2:
                self.put(x + i, y, c)
                self.put(x + i, y + h - 1, c)
        for i in range(h):
            if not dashed or i % 4 < 2:
                self.put(x, y + i, c)
                self.put(x + w - 1, y + i, c)

    def text(self, font, text, x, y, align="left", color=TEXT, shadow=SHADOW):
        width = font.text_width(text)
        x -= {"left": 0, "right": width, "center": width // 2}[align]
        for char in text:
            left, advance, glyph = font.glyph(char)
            for i, value in enumerate(glyph):
                if value == 1 or (value == 2 and shadow):
                    self.put(x + left + i % font.width, y + i // font.width, color if value == 1 else shadow)
            x += advance

    def blit(self, other, x, y):
        for yy in range(other.h):
            for xx in range(other.w):
                c = other.px[yy * other.w + xx]
                if c is not None:
                    self.put(x + xx, y + yy, c)

    def crop(self, x, y, w, h):
        out = Rgb(w, h)
        for yy in range(h):
            for xx in range(w):
                if 0 <= x + xx < self.w and 0 <= y + yy < self.h:
                    out.px[yy * w + xx] = self.px[(y + yy) * self.w + x + xx]
        return out

    def rgba(self, path, back=(0, 0, 0)):
        path.write_bytes(write_rgba_png(self.w, self.h, b"".join(bytes((*(c or back), 255)) for c in self.px)))

    def indexed(self, path, first=()):
        """As an indexed PNG, transparent as index 0, the colours in first order, then as found."""
        colors = [(0, 0, 0)] + [c for c in first]
        for c in self.px:
            if c is not None and c not in colors[1:]:
                colors.append(c)
        lookup = {c: i for i, c in reversed(list(enumerate(colors))) if i}
        pixels = bytes(0 if c is None else lookup[c] for c in self.px)
        path.write_bytes(write_indexed_png(self.w, self.h, pixels, colors))
        return len(colors)

    def scaled(self, k):
        out = Rgb(self.w * k, self.h * k)
        out.px = [self.px[(y // k) * self.w + x // k] for y in range(self.h * k) for x in range(self.w * k)]
        return out


def jasc(path):
    lines = path.read_text().split("\n")[3:]
    return [tuple(int(v) for v in line.split()) for line in lines if line.strip()]


def tiles8(path):
    w, h, px, _ = read_indexed_png(path)
    return [[px[(ty * 8 + y) * w + tx * 8 + x] for y in range(8) for x in range(8)]
            for ty in range(h // 8) for tx in range(w // 8)]


def town_map():
    """The map's two BGs as the original page shows them on its screen (168 rows above the touch bar)."""
    palette = jasc(TOWNMAP_GRA / "00.pal")
    out = Rgb(fill=(0, 0, 0))
    for chars, screen in MAP_LAYERS:
        tiles = tiles8(TOWNMAP_GRA / chars)
        data = (TOWNMAP_GRA / screen).read_bytes()
        entries = struct.unpack_from("<1024H", data, len(data) - 0x800)
        for ty in range(24):
            for tx in range(32):
                e = entries[ty * 32 + tx]
                tile = tiles[e & 0x3ff] if (e & 0x3ff) < len(tiles) else [0] * 64
                for i, v in enumerate(tile):
                    if v:
                        x, y = i % 8, i // 8
                        x, y = 7 - x if e & 0x400 else x, 7 - y if e & 0x800 else y
                        out.put(tx * 8 + x, ty * 8 + y, palette[(e >> 12) * 256 + v])
    return out


def places():
    """Each place in the table's order: its zone, and its highlight's animation and position."""
    out = []
    for zone in json.loads((TOWN_MAP / "order.json").read_text()):
        place = json.loads((TOWN_MAP / f"{zone.removeprefix('ZONE_').lower()}.json").read_text())
        out.append((zone, place["area"]["animation"], place["area"]["x"], place["area"]["y"]))
    return out


def area_shapes():
    """Each animation's first cell as {(x, y): colour index}."""
    anims = Animations((POKEDEX_GRA / AREA_ANIMS).read_bytes())
    return {i: pt.sprite_cell(POKEDEX_GRA / AREA_CHARS, POKEDEX_GRA / AREA_CELLS, seq.frames[0].cell)[0]
            for i, seq in enumerate(anims.sequences) if seq.frames}


def place_seasons(species):
    """A species' season bits (spring 1 ... winter 8) at each town map place, from the encounter data: a place's
    areas are its zone's and those of the zones whose parent it is, as the Habitat List's."""
    from tools.paperwhite2 import encounters as enc
    data = enc.Data()
    zones = {p.stem: json.loads(p.read_text()) for p in enc.ZONES.glob("*.json") if not p.name.endswith(".schema.json")}
    by_area = enc.candidates(data)
    number = data.species_number(species)
    out = {}
    for zone, *_ in places():
        areas = {z["encounters"].removeprefix("ENCOUNTERS_").lower() for name, z in zones.items()
                 if isinstance(z.get("encounters"), str) and z["encounters"].startswith("ENCOUNTERS_")
                 and (f"ZONE_{name.upper()}" == zone or z.get("parent") == zone)} & set(data.areas)
        bits = 0
        for area in areas:
            for fields, _ in by_area[area]:
                if fields[0] == number:
                    bits |= fields[6]
        if bits:
            out[zone] = bits
    return out, data, by_area, number, zones


def head_bar_rgb(font):
    canvas = pt.Canvas()
    pt.head_bar(canvas, font, 0)
    colors = pt.head_bar_colors()
    out = Rgb()
    for i, v in enumerate(canvas.pixels[:MAP_SHIFT * W]):
        if v:
            out.px[i] = colors[v]
    return out


def top_screens(out, font):
    base = town_map()
    bar = head_bar_rgb(font)
    shapes = area_shapes()
    red = jasc(POKEDEX_GRA / AREA_PALETTE)[:16]

    def screen(highlights):
        s = Rgb(fill=(0, 0, 0))
        s.blit(base.crop(0, 0, W, H - MAP_SHIFT), 0, MAP_SHIFT)
        for anim, x, y, shades in highlights:
            for (sx, sy), v in shapes.get(anim, {}).items():
                c = shades[AREA_SHADES.index(v)] if v in AREA_SHADES else red[v]
                # The glow at its brightest (EV 15 of 16): the OBJ's colour
                s.put(x + sx, y + sy + MAP_SHIFT, c)
        s.blit(bar, 0, 0)
        return s

    screen([]).rgba(out / "area_top_map.png")
    box = screen([])
    box.fill(BOX_X, BOX_Y, BOX_W, BOX_H, PANEL)
    box.outline(BOX_X, BOX_Y, BOX_W, BOX_H, PANEL_EDGE)
    box.outline(BOX_ICON_X, BOX_ICON_Y, 32, 32, SLOT_EDGE, dashed=True)
    box.text(font, "Pokémon", BOX_NAME_X, BOX_NAME_Y)
    box.outline(BOX_NAME_X, BOX_NAME_Y, BOX_NAME_RIGHT - BOX_NAME_X, 16, SLOT_EDGE, dashed=True)
    box.rgba(out / "area_top_box.png")
    original = [red[i] for i in AREA_SHADES]
    screen([(a, x, y, original) for _, a, x, y in places()]).rgba(out / "area_top_shapes.png")
    seasons, *_ = place_seasons(SAMPLE)
    for step in range(4):
        lit = []
        for zone, anim, x, y in places():
            bits = seasons.get(zone, 0)
            if not bits:
                continue
            own = [s for s in range(4) if bits >> s & 1]
            lit.append((anim, x, y, GLOW[4] if len(own) == 4 else GLOW[own[step % len(own)]]))
        screen(lit).rgba(out / f"area_top_frame{step + 1}.png")


def tab_bar(selected):
    """The six-tab bar with one selected, from the five arts: the art whose tab is selected gives its tab, the Stats
    and Data arts the unselected icons (Stats' from Data's art, the others' from Stats')."""
    arts = {}
    for page in pt.PAGES:
        found = pt.load_art(page)
        if found:
            pixels, colors = found
            img = Rgb()
            img.px = [colors[v] if v else None for v in pixels]
            arts[page] = img
    if "stats" not in arts or "data" not in arts:
        return None
    strip = Rgb(W, STRIP_ROWS)
    column = arts["stats"].crop(W - 6, 0, 1, 16)
    for x in range(W):
        strip.blit(column, x, 0)
    for i, page in enumerate(PAGES6):
        cx = TAB_X + i * TAB_PITCH
        if page == selected:
            continue
        if page == "area":
            strip.outline(cx - 8, 2, 16, 11, (255, 0, 255), dashed=True)
            continue
        old = OLD_TAB_X + pt.PAGES.index(page) * TAB_PITCH
        source = arts["data" if page == "stats" else "stats"]
        strip.blit(source.crop(old - ICON_HALF, 0, ICON_HALF * 2, ICON_ROWS), cx - ICON_HALF, 0)
    cx = TAB_X + PAGES6.index(selected) * TAB_PITCH
    if selected == "area":
        # No art yet: the Stats tab's shape with its icon cleared, as the slot to draw in
        tab = arts["stats"].crop(OLD_TAB_X - SELECTED_HALF, 0, SELECTED_HALF * 2, SELECTED_ROWS)
        inner = arts["stats"].px[2 * W + OLD_TAB_X]
        tab.fill(SELECTED_HALF - 8, 2, 16, 11, inner)
        tab.outline(SELECTED_HALF - 8, 2, 16, 11, (255, 0, 255), dashed=True)
    elif selected in arts:
        old = OLD_TAB_X + pt.PAGES.index(selected) * TAB_PITCH
        tab = arts[selected].crop(old - SELECTED_HALF, 0, SELECTED_HALF * 2, SELECTED_ROWS)
    else:
        return strip
    strip.blit(tab, cx - SELECTED_HALF, 0)
    return strip


def tabs(out):
    sheet = Rgb(W, STRIP_ROWS * len(PAGES6))
    first = None
    for i, page in enumerate(PAGES6):
        strip = tab_bar(page)
        if strip is None:
            return None
        n = strip.indexed(out / f"tabs6_{page}.png")
        first = first or n
        sheet.blit(strip, 0, i * STRIP_ROWS)
    sheet.indexed(out / "tabs6_sheet.png")
    return tab_bar("area")


def sample_rows(font, small):
    """The sample's rows as the page would print them (encounters.py's area_shown_rows): per row its icon's name,
    whether it shakes (its special version applies) and whether it is grey, its levels, rarity and share range, and its times and
    seasons."""
    from tools.paperwhite2 import encounters as enc
    seasons, data, _, number, _ = place_seasons(SAMPLE)
    names = [t["name"] for t in data.settings["tiers"]]
    entry = enc.area_rows(data)[number]
    levels = data.species[SAMPLE]["levels"]
    result = []
    times = 0
    for row in enc.area_shown_rows(entry):
        key = row["terrain"] if enc.AREA_ROWS[row["row"]] == "walking" else enc.AREA_ROWS[row["row"]]
        special = bool(row["flags"] & enc.AREA_FLAG_SPECIAL)
        grey = bool(row["flags"] & enc.AREA_FLAG_SPECIAL_ONLY) and key != "bridge"
        tiers = sorted(row["tiers"])
        tier = "Special" if tiers[0] == enc.AREA_TIER_NONE else names[tiers[0]] if len(tiers) == 1 else \
            f"{names[tiers[0]]} - {names[min(tiers[-1], len(names) - 1)]}"
        shares = [c[4] for c in row["contexts"]]
        low, high = min(shares), max(shares)
        rate = f"{low:.0f}%" if round(low) == round(high) else f"{low:.0f}-{high:.0f}%"
        for c in row["all"]:
            times |= 1 << c[2]
        result.append((key, special, grey, f"Lv. {levels['min']}-{levels['max']}", tier, rate))
    bits = 0
    for b in seasons.values():
        bits |= b
    return result, bits, times


def slot(c, x, y, label, font, grey=False):
    c.fill(x, y, ICON_W, ICON_H, GREY_SLOT if grey else SLOT)
    c.outline(x, y, ICON_W, ICON_H, SLOT_EDGE)
    c.text(font, label[:6], x + ICON_W // 2, y + 2, "center", (90, 60, 0), None)


def bottom(out, font, small, bar):
    canvas = Rgb()
    if bar is not None:
        canvas.blit(bar, 0, 0)
    canvas.fill(4, SEASONS_Y - 2, W - 8, 20, PANEL)
    canvas.outline(4, SEASONS_Y - 2, W - 8, 20, PANEL_EDGE)
    canvas.fill(4, METHOD_Y - 4, W - 8, METHOD_HEIGHT + 4, PANEL)
    canvas.outline(4, METHOD_Y - 4, W - 8, METHOD_HEIGHT + 4, PANEL_EDGE)
    canvas.fill(4, TIMES_Y, W - 8, 32, PANEL)
    canvas.outline(4, TIMES_Y, W - 8, 32, PANEL_EDGE)
    canvas.indexed(out / "area_canvas.png")
    rows, _, _ = sample_rows(font, small)
    for count in range(1, len(REFERENCE_ROWS) + 1):
        for tiles in (False, True):
            name = f"area_reference_rows{count}" + ("_tiles" if tiles else "")
            image = reference(font, small, count, tiles)
            image.rgba(out / f"{name}.png")
            if count == len(REFERENCE_ROWS):
                image.rgba(out / ("area_reference_tiles.png" if tiles else "area_reference.png"))
    return rows


def area_places():
    """The page's places from the C file: its #defines and its icons' x arrays."""
    d = pt.defines(AREA_C)
    text = AREA_C.read_text()
    for name in ("sSeasonIconX", "sConditionIconX"):
        body = re.search(name + r"\[\w+\] = \{([^}]*)\}", text).group(1)
        d[name] = [int(v) for v in body.split(",")]
    return d


def reference(font, small, count, tiles):
    """The user's art (transparent checkered) with the icon slots and text where the page puts them, count
    method rows, as PokedexInfoArea_Draw and _DrawRow place them."""
    d = area_places()
    m = pt.messages()
    w, h, pixels, colors = read_indexed_png(AREA_ART)
    r = Rgb(fill=None)
    for y in range(H):
        for x in range(W):
            i = pixels[y * w + x]
            r.px[y * W + x] = tuple(colors[i][:3]) if i else (CHECK_A if (x // 4 + y // 4) % 2 else CHECK_B)
    for i, name in enumerate(SEASON_NAMES):
        slot(r, d["sSeasonIconX"][i], d["SEASONS_Y"], name, small)
    top = d["METHODS_Y"] + (d["METHODS_HEIGHT"] - (count - 1) * d["ROW_PITCH"] - ICON_H) // 2
    for i, (key, levels, tier) in enumerate(REFERENCE_ROWS[:count]):
        y = top + i * d["ROW_PITCH"]
        slot(r, d["ROW_ICON_X"], y, key, small)
        r.text(font, levels, d["ROW_LEVELS_X"], y)
        r.text(small, tier, d["ROW_TIER_X"], y + d["ROW_TIER_OFFSET_Y"])
    r.text(small, m["AreaTime"], d["LABEL_X"], d["TIMES_LABEL_Y"])
    r.text(small, m["AreaWeather"], d["LABEL_X"], d["WEATHERS_LABEL_Y"])
    for i, name in enumerate(ICONS[1][1]):
        slot(r, d["sConditionIconX"][i], d["TIMES_Y"], name.replace("_", " "), small)
    for i, name in enumerate(ICONS[2][1]):
        slot(r, d["sConditionIconX"][i], d["WEATHERS_Y"], name, small)
    if tiles:
        for y in range(H):
            for x in range(W):
                if x % 8 == 0 or y % 8 == 0:
                    r.put(x, y, TILE_LINE)
    return r


def icons(out, small):
    sheet = Rgb(ICON_W * 5, ICON_H * len(ICONS))
    for row, (_, names) in enumerate(ICONS):
        for col, name in enumerate(names):
            if name is None:
                continue
            # The slot's edge in the starter palette's mid grey, dashed, to be drawn over
            sheet.outline(col * ICON_W, row * ICON_H, ICON_W, ICON_H, ICON_COLORS[4], dashed=True)
    sheet.indexed(out / "area_icons_template.png", ICON_COLORS[1:])
    guide = sheet.scaled(3)
    big = Rgb(guide.w, guide.h, (40, 40, 48))
    big.blit(guide, 0, 0)
    for row, (group, names) in enumerate(ICONS):
        for col, name in enumerate(names):
            x, y = col * ICON_W * 3, row * ICON_H * 3
            if name is None:
                big.text(small, "unused", x + 4, y + 4, color=(120, 120, 130), shadow=None)
            else:
                big.text(small, name.replace("_", " "), x + 4, y + 4, color=(255, 255, 255), shadow=None)
                big.text(small, group, x + 4, y + 30, color=(160, 160, 170), shadow=None)
    big.rgba(out / "area_icons_guide.png")
    glow = Rgb(3 * 16, 5 * 16)
    for row, shades in enumerate(GLOW):
        for col, c in enumerate(shades):
            glow.fill(col * 16, row * 16, 16, 16, c)
    glow.indexed(out / "area_glow_template.png")


# The Habitat List's filter bar (paperwhite2_habitat_dex.c): its art, its places, and the page arrows, centred
# ARROW_OFFSET either side of the page (pokedex_habitat_graphic.c's POKEDEX_HABITAT_OBJ_SEASON_LEFT and _RIGHT)
HABITAT_C = ROOT / "src/paperwhite2/ov303/paperwhite2_habitat_dex.c"
HABITAT_BAR = ROOT / "res/paperwhite2/pokedex_art/habitat_bar.png"
ARROW_OFFSET, ARROW_SIZE = 24, 16
# The arrows' centre's y (pokedex_habitat_graphic.c)
ARROW_Y = 30
STAMP_X, STAMP_Y, STAMP_SIZE = 224, 20, 64
# Each method count's outline colour in the guide, 1 to 5
COUNT_COLORS = [(230, 60, 60), (240, 150, 30), (60, 170, 60), (40, 120, 230), (170, 70, 210)]
# The sample filters of the layouts: spring, day and "any" (sheet slots)
SAMPLE_FILTERS = (0, 6, 24)
# The methods' sheet slots: walking (all), grass, dark grass, surf, fishing
METHOD_ICONS = (23, 15, 16, 20, 22)
# The filters' values, any first (the C file's sFilterCounts), the layouts' samples' (spring, day, any), and the dots'
# colours (the font's palette row, 7 and 2)
FILTER_COUNTS = (5, 6, 6)
SAMPLE_VALUES = (1, 2, 0)
DOT_CHOSEN, DOT_OTHER = (197, 0, 0), (164, 164, 172)


def habitat_dots(bar, filters, chosen=(0, 0, 0)):
    """Draws the filters' dots into bar, as paperwhite2_habitat_dex.c's HabitatDex_DrawDots: each filter's values'
    dots in a column right of its icon, centred on DOT_CENTER_Y, the chosen one's yellow; returns each column's
    (left, top, width, height)."""
    d = pt.defines(HABITAT_C)
    width, height, pitch, offset, centre = (d["DOT_WIDTH"], d["DOT_HEIGHT"], d["DOT_PITCH"], d["DOT_OFFSET_X"],
                                             d["DOT_CENTER_Y"])
    rows = []
    for x, count, value in zip(filters, FILTER_COUNTS, chosen):
        top = centre - ((count - 1) * pitch + height) // 2
        for i in range(count):
            bar.fill(x + offset, top + i * pitch, width, height, DOT_CHOSEN if i == value else DOT_OTHER)
        rows.append((x + offset, top, width, (count - 1) * pitch + height))
    return rows


def habitat_places():
    """The bar's places from the C file: (top-row icon lefts for 1 to 5 methods, the top row's icon y, the filters'
    icon y and the page's y, filter lefts, page centre, row height, top row's left and width)."""
    d = pt.defines(HABITAT_C)
    left, width, row, inset = d["TOP_LEFT"], d["TOP_WIDTH"], d["ROW_HEIGHT"], d["ICON_INSET_Y"]
    tops = {n: [left + width * (2 * i + 1) // (2 * n) - ICON_W // 2 for i in range(n)] for n in range(1, 6)}
    filters = [d["FILTER_X"] + d["FILTER_PITCH"] * i for i in range(3)]
    return tops, (inset, d["FILTER_Y"], d["PAGE_Y"]), filters, d["PAGE_X"], row, (left, width)


def habitat_art():
    """The user's bar art as RGB, transparent as None."""
    from tools.paperwhite2.screen_art import read_png
    w, h, px = read_png(HABITAT_BAR)
    art = Rgb(w, h)
    art.px = list(px)
    return art


def sheet_icons():
    from tools.paperwhite2.pokedex_area import read_icons
    icons, greys = read_icons()

    def rgb(icon):
        out = Rgb(ICON_W, ICON_H)
        out.px = [None if c is None else tuple(v * 255 // 31 for v in c) for c in icon]
        return out
    return [rgb(i) for i in icons], [rgb(i) for i in greys]


def habitat_bar(out, font):
    tops, (top_y, bottom_y, page_y), filters, page_x, row, (left, width) = habitat_places()
    art = habitat_art()
    icons_rgb, greys_rgb = sheet_icons()
    mark = (255, 0, 255)

    # The canvas: every place dashed, 5 methods' icons
    canvas = Rgb(art.w, art.h)
    canvas.blit(art, 0, 0)
    for x in tops[5]:
        canvas.outline(x, top_y, ICON_W, ICON_H, mark, dashed=True)
    for x in filters:
        canvas.outline(x, bottom_y, ICON_W, ICON_H, mark, dashed=True)
    for x in (page_x - ARROW_OFFSET, page_x + ARROW_OFFSET):
        canvas.outline(x - ARROW_SIZE // 2, ARROW_Y - ARROW_SIZE // 2, ARROW_SIZE, ARROW_SIZE, mark, dashed=True)
    canvas.outline(page_x - 16, page_y, 32, 16, mark, dashed=True)
    canvas.outline(STAMP_X - STAMP_SIZE // 2, 0, STAMP_SIZE, art.h, mark, dashed=True)
    habitat_dots(canvas, filters)
    canvas.indexed(out / "habitat_bar_canvas.png")

    # The layouts, 1 to 5 methods
    layouts = Rgb(art.w, art.h * 5 + 4 * 4, (255, 0, 0))
    for n in range(1, 6):
        bar = Rgb(art.w, art.h, (0, 0, 0))
        bar.blit(art, 0, 0)
        for i, x in enumerate(tops[n]):
            bar.blit((icons_rgb if i == 0 else greys_rgb)[METHOD_ICONS[i]], x, top_y)
        for x, icon in zip(filters, SAMPLE_FILTERS):
            bar.blit(icons_rgb[icon], x, bottom_y)
        habitat_dots(bar, filters, SAMPLE_VALUES)
        for x in (page_x - ARROW_OFFSET, page_x + ARROW_OFFSET):
            bar.outline(x - ARROW_SIZE // 2, ARROW_Y - ARROW_SIZE // 2, ARROW_SIZE, ARROW_SIZE, mark)
        bar.text(font, "1/3", page_x, page_y, align="center")
        layouts.blit(bar, 0, (n - 1) * (art.h + 4))
    layouts.rgba(out / "habitat_bar_layouts.png")

    # The guide at 3x: each count's places, the touch areas' edges, the rest
    k = 3
    guide = Rgb(art.w * k, art.h * k + 60, (40, 40, 48))
    base = Rgb(art.w, art.h, (0, 0, 0))
    base.blit(art, 0, 0)
    dots = habitat_dots(base, filters)
    guide.blit(base.scaled(k), 0, 0)
    for x, y, w, h in dots:
        guide.outline(x * k - 1, y * k - 1, w * k + 2, h * k + 2, (255, 255, 255), dashed=True)
    for n in range(1, 6):
        c = COUNT_COLORS[n - 1]
        for i, x in enumerate(tops[n]):
            guide.outline(x * k + n - 1, (top_y - 1) * k + n - 1, ICON_W * k - 2 * (n - 1), ICON_H * k + 6 - 2 * (n - 1),
                          c)
        for i in range(n + 1):
            edge = (left + width * i // n) * k
            for y in range(0, row * k, 2):
                guide.put(edge, y + (n - 1) * 3 % 6, c)
        guide.text(font, f"{n}", 4 + (n - 1) * 60, art.h * k + 6, color=c, shadow=None)
        guide.text(font, "method" + ("" if n == 1 else "s"), 14 + (n - 1) * 60, art.h * k + 6, color=c, shadow=None)
    for x in filters:
        guide.outline(x * k, bottom_y * k, ICON_W * k, ICON_H * k, (255, 255, 255))
    for x in (page_x - ARROW_OFFSET, page_x + ARROW_OFFSET):
        guide.outline((x - ARROW_SIZE // 2) * k, (ARROW_Y - ARROW_SIZE // 2) * k, ARROW_SIZE * k,
                      ARROW_SIZE * k, (255, 255, 255))
    guide.outline((page_x - 16) * k, bottom_y * k, 32 * k, 16 * k, (255, 220, 60))
    guide.outline((STAMP_X - STAMP_SIZE // 2) * k, 0, STAMP_SIZE * k, art.h * k, (255, 220, 60), dashed=True)
    guide.text(font, "filters and their dots (white); arrows (white); page and stamp (gold); top row: dashes are",
               4, art.h * k + 26, color=(220, 220, 230), shadow=None)
    guide.text(font, f"the touch areas' edges for each count, (x - {left}) * n / {width}", 4, art.h * k + 42,
               color=(220, 220, 230), shadow=None)
    guide.rgba(out / "habitat_bar_guide.png")


def write(out, font, small):
    """Writes the Area templates, and the Habitat List bar's, into out (pokedex_templates.py's folder)."""
    top_screens(out, font)
    bar = tabs(out)
    rows = bottom(out, font, small, bar)
    icons(out, small)
    habitat_bar(out, font)
    for key, special, grey, levels, tier, rate in rows:
        shake = (" (shakes, grey)" if grey else " (shakes)") if special else ""
        print(f"area: {SAMPLE} {key}{shake}: {levels}, {tier}, {rate}")


def main():
    from tools.data.narc import read_narc
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "build/pokedex_templates"
    out.mkdir(parents=True, exist_ok=True)
    fonts = read_narc((ROOT / "extract/w2_us" / pt.FONTS).read_bytes())
    write(out, pt.Font(fonts[0]), pt.Font(fonts[1]))


if __name__ == "__main__":
    main()
