#!/usr/bin/env python3
"""The Pokédex Info page's planned Area sub-page (docs/paperwhite2/design/pokedex-area.md): art templates, written by
pokedex_templates.py beside the other sub-pages' into the same ignored folder, as they hold the ROM's map and fonts.

- area_top_map.png: the top screen as Area would show it, the town map (a/0/8/4's BG characters 5 and 7, screens 17
  and 16, ext palette 0, as pokedex_detail_map.c loads them) moved 24 px down under the head bar, without highlights;
- area_top_shapes.png: every place's highlight (the area OBJs, ARCID_POKEDEX_GRA 15/29/46, each place's animation and
  position from res/town_map/) in the original red, to see their shapes;
- area_top_frame<N>.png (N 1-4): a sample species' (SAMPLE) highlights as the four steps of the season cycle: each
  place in the colour of the season that step shows of the place's own seasons, white where it is all year;
- tabs6_<page>.png (one per selected tab) and tabs6_sheet.png (all six stacked): the tab bar for six sub-pages, cut
  from the user's five arts (each one's selected tab and the others' unselected icons) and put at the six centres,
  with an empty dashed slot for Area's icon; indexed in the arts' colours, to draw over;
- area_canvas.png: the Area bottom screen to draw over (indexed), the tab bar with Area selected and the regions'
  placeholders; area_reference.png / area_reference_tiles.png: the same with the sample's text and icon slots marked;
- area_icons_template.png: the icon sheet, 32 by 16 slots in a 16-colour starter palette; area_icons_guide.png: the
  same at 3x with each slot's name; area_glow_template.png: the highlight colours, three shades a row.

    pokedex_area_templates.py OUT_DIR  (or through pokedex_templates.py, which calls write())
"""
import json
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
# The bottom screen's regions (tile-aligned so that the icons, 4 by 2 tiles in the panels' window, take their own
# palette row through their map entries)
ICON_W, ICON_H = 32, 16
LABEL_X = 8
SLOT_X = (48, 88, 128, 168, 208)
SEASONS_Y = 24
METHOD_Y, METHOD_PITCH, METHOD_ROWS = 48, 24, 4
TIMES_Y, WEATHER_Y = 136, 152
TOUCHBAR_Y = 168
# The icons: (group, names), a row of the sheet each, 32 by 16 slots
ICONS = [
    ("season", ["spring", "summer", "autumn", "winter"]),
    ("time", ["morning", "day", "evening", "night", "late_night"]),
    ("weather", ["clear", "rain", "thunderstorm", "snow", "sandstorm"]),
    ("method", ["grass", "dark_grass", "shaking_grass", "dust_cloud", "bridge_shadow"]),
    ("method", ["surf", "rippling_surf", "fishing", "rippling_fishing", "outbreak"]),
]
# The icons' starter palette (index 0 transparent)
ICON_COLORS = [(0, 0, 0), (24, 24, 32), (255, 255, 255), (170, 170, 185), (100, 100, 115), (255, 150, 200),
               (70, 190, 60), (215, 55, 40), (60, 120, 230), (255, 220, 60), (120, 210, 255), (190, 150, 90),
               (130, 90, 200), (40, 130, 40), (255, 140, 40), (90, 60, 40)]
# Placeholder colours of the bottom canvas and references (RGB)
CHECK_A, CHECK_B = (60, 60, 70), (45, 45, 52)
TOUCH, TOUCH_EDGE = (90, 140, 200), (40, 60, 100)
PANEL, PANEL_EDGE = (238, 238, 238), (24, 24, 24)
SLOT, SLOT_EDGE = (255, 230, 120), (200, 140, 0)
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
    """The sample's rows as the page would print them: per method its icon's name, levels, rarity and the
    approximate share range (own candidates, tiers' shares split among their Pokémon; the build's index computes it
    exactly), and its times and seasons."""
    seasons, data, by_area, number, zones = place_seasons(SAMPLE)
    from tools.paperwhite2 import encounters as enc
    shares = [t["share"] for t in data.settings["tiers"]]
    names = [t["name"] for t in data.settings["tiers"]]
    rows = {}
    times = 0
    for area, cands in by_area.items():
        for fields, _ in cands:
            if fields[0] != number:
                continue
            for m, method in enumerate(enc.METHODS):
                if not fields[5] >> m & 1:
                    continue
                key = method if method != "rustling" else \
                    {"grass": "shaking_grass", "dust": "dust_cloud", "shadow": "bridge_shadow"}[data.areas[area]["spots"]]
                times |= fields[7]
                low, high, tiers = rows.get(key, (100.0, 0.0, set()))
                for s in range(4):
                    for t in range(5):
                        if not (fields[6] >> s & 1 and fields[7] >> t & 1):
                            continue
                        here = [c for c, _ in cands if c[5] >> m & 1 and c[6] >> s & 1 and c[7] >> t & 1]
                        counts = {}
                        for c in here:
                            counts[c[4]] = counts.get(c[4], 0) + 1
                        total = sum(shares[k] for k in counts)
                        share = 100 * shares[fields[4]] / counts[fields[4]] / total
                        low, high = min(low, share), max(high, share)
                tiers.add(fields[4])
                rows[key] = (low, high, tiers)
    levels = data.species[SAMPLE]["levels"]
    order = [n for _, group in ICONS[3:] for n in group]
    result = []
    for key in sorted(rows, key=order.index):
        low, high, tiers = rows[key]
        tier = names[min(tiers)] if len(tiers) == 1 else f"{names[min(tiers)]}-{names[max(tiers)]}"
        rate = f"{low:.0f}%" if round(low) == round(high) else f"{low:.0f}-{high:.0f}%"
        result.append((key, f"Lv. {levels['min']}-{levels['max']}", tier, rate))
    bits = 0
    for b in seasons.values():
        bits |= b
    return result, bits, times


def slot(c, x, y, label, font):
    c.fill(x, y, ICON_W, ICON_H, SLOT)
    c.outline(x, y, ICON_W, ICON_H, SLOT_EDGE)
    c.text(font, label[:6], x + ICON_W // 2, y + 2, "center", (90, 60, 0), None)


def bottom(out, font, small, bar):
    canvas = Rgb()
    if bar is not None:
        canvas.blit(bar, 0, 0)
    canvas.fill(4, SEASONS_Y - 2, W - 8, 20, PANEL)
    canvas.outline(4, SEASONS_Y - 2, W - 8, 20, PANEL_EDGE)
    canvas.fill(4, METHOD_Y - 4, W - 8, METHOD_PITCH * METHOD_ROWS + 4, PANEL)
    canvas.outline(4, METHOD_Y - 4, W - 8, METHOD_PITCH * METHOD_ROWS + 4, PANEL_EDGE)
    canvas.fill(4, TIMES_Y, W - 8, 32, PANEL)
    canvas.outline(4, TIMES_Y, W - 8, 32, PANEL_EDGE)
    canvas.indexed(out / "area_canvas.png")
    rows, seasons, times = sample_rows(font, small)

    def reference(tiles):
        r = Rgb(fill=None)
        for y in range(H):
            for x in range(W):
                r.px[y * W + x] = CHECK_A if (x // 4 + y // 4) % 2 else CHECK_B
        r.blit(canvas, 0, 0)
        r.text(small, "Seasons", LABEL_X, SEASONS_Y + 3)
        for i, name in enumerate(SEASON_NAMES):
            if seasons >> i & 1:
                slot(r, SLOT_X[i], SEASONS_Y, name, small)
        if seasons == 15:
            r.text(small, "All year", SLOT_X[4] + 2, SEASONS_Y + 3, color=GOLD, shadow=TEXT)
        for i, (key, levels, tier, rate) in enumerate(rows[:METHOD_ROWS]):
            y = METHOD_Y + i * METHOD_PITCH
            slot(r, 16, y, key.replace("_", " "), small)
            r.text(font, levels, 56, y)
            r.text(small, tier, 136, y + 2)
            r.text(font, rate, 244, y, "right")
        if len(rows) > METHOD_ROWS:
            r.text(small, f"+{len(rows) - METHOD_ROWS} more", 244, METHOD_Y + METHOD_PITCH * METHOD_ROWS - 10, "right")
        r.text(small, "Time", LABEL_X, TIMES_Y + 3)
        for i, name in enumerate(ICONS[1][1]):
            if times >> i & 1:
                slot(r, SLOT_X[i], TIMES_Y, name, small)
        r.text(small, "Weather", LABEL_X, WEATHER_Y + 3)
        for i, name in enumerate(ICONS[2][1]):
            slot(r, SLOT_X[i], WEATHER_Y, name, small)
        r.fill(0, TOUCHBAR_Y, W, H - TOUCHBAR_Y, TOUCH)
        r.outline(0, TOUCHBAR_Y, W, H - TOUCHBAR_Y, TOUCH_EDGE)
        if tiles:
            for y in range(H):
                for x in range(W):
                    if x % 8 == 0 or y % 8 == 0:
                        r.put(x, y, TILE_LINE)
        return r

    reference(False).rgba(out / "area_reference.png")
    reference(True).rgba(out / "area_reference_tiles.png")
    return rows


def icons(out, small):
    sheet = Rgb(ICON_W * 5, ICON_H * len(ICONS))
    for row, (_, names) in enumerate(ICONS):
        for col, _ in enumerate(names):
            # The slot's edge in the starter palette's mid grey, dashed, to be drawn over
            sheet.outline(col * ICON_W, row * ICON_H, ICON_W, ICON_H, ICON_COLORS[4], dashed=True)
    sheet.indexed(out / "area_icons_template.png", ICON_COLORS[1:])
    guide = sheet.scaled(3)
    big = Rgb(guide.w, guide.h, (40, 40, 48))
    big.blit(guide, 0, 0)
    for row, (group, names) in enumerate(ICONS):
        for col, name in enumerate(names):
            big.text(small, name.replace("_", " "), col * ICON_W * 3 + 4, row * ICON_H * 3 + 4, color=(255, 255, 255),
                     shadow=None)
            big.text(small, group, col * ICON_W * 3 + 4, row * ICON_H * 3 + 30, color=(160, 160, 170), shadow=None)
    big.rgba(out / "area_icons_guide.png")
    glow = Rgb(3 * 16, 5 * 16)
    for row, shades in enumerate(GLOW):
        for col, c in enumerate(shades):
            glow.fill(col * 16, row * 16, 16, 16, c)
    glow.indexed(out / "area_glow_template.png")


def write(out, font, small):
    """Writes the Area templates into out (pokedex_templates.py's folder)."""
    top_screens(out, font)
    bar = tabs(out)
    rows = bottom(out, font, small, bar)
    icons(out, small)
    for key, levels, tier, rate in rows:
        print(f"area: {SAMPLE} {key}: {levels}, {tier}, {rate}")


def main():
    from tools.data.narc import read_narc
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "build/pokedex_templates"
    out.mkdir(parents=True, exist_ok=True)
    fonts = read_narc((ROOT / "extract/w2_us" / pt.FONTS).read_bytes())
    write(out, pt.Font(fonts[0]), pt.Font(fonts[1]))


if __name__ == "__main__":
    main()
