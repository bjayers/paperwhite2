"""Paper White 2: method F, which re-indexes an overworld Pokémon sheet onto its species' battle palette, so that the
battle normal.pal and shiny.pal colour it (docs/paperwhite2/design/follower-palette-remap.md, sections 2, 8 and 9).

remap(sheet, battle) returns the sheet's pixels as battle palette indices. It is deterministic: the same sheet and
battle art give the same pixels on every run. In two passes:

- **E**, a map from each sheet colour to a battle index: identical colours merged into units, merged further while
  there are more units than battle colours, then a Hungarian assignment in OKLab (x100, 1% black flare, lightness
  weighted x1.5) under four rules (neutrals stay neutral, coloured shades stay coloured, accents keep their hue,
  part-sheet colours and small battle accents reserved by hue), and a local search on one score (contrast collapse,
  lightness flips, outlines getting lighter, extra merges).
- **F**, per pixel: where E's target has look-alikes (battle indices whose normal colours lie within 6 dE, 8 when both
  are dark, but whose shinies differ), the look-alike whose neighbourhood in the battle art best matches the pixel's.

report(sheet, battle, pixels) gives the needs-a-look flag and its reasons (section 3 of the design doc).

The battle art: BattleArt.load(directory, art_directory, sexes) reads normal.pal and shiny.pal from the group's
directory (res/pokemon/<species> or its form_<n>) and the frames from art_directory (the group's own, or the
species' for a palette-only form such as Arceus'): the assembled frames (front_single.png, back_single.png, with
_female for the female art) give the outlines and the adjacency, the part sheets (front.png, back.png) also the
colours that only animation parts use. Standard library only (the build's python3).
"""
import collections
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.nitro_2d import read_indexed_png, read_palette  # noqa: E402

# ---------------------------------------------------------------- colour

FLARE = 0.01  # the screen's black level: (0,0,0) and (8,8,8) are nearly the same on a DS
LIGHTNESS_WEIGHT = 1.5


def _linear(channel: float) -> float:
    channel /= 255.0
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def oklab(rgb) -> tuple[float, float, float]:
    """OKLab x100, with the black flare."""
    r, g, b = (_linear(x) + FLARE for x in rgb)
    l_ = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m_ = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s_ = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (100 * (0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_),
            100 * (1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_),
            100 * (0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_))


def delta(p, q) -> float:
    return math.dist(p, q)


def weighted(p, q) -> float:
    """The lightness-weighted OKLab distance."""
    return math.sqrt((LIGHTNESS_WEIGHT * (p[0] - q[0])) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2)


def chroma(p) -> float:
    return math.hypot(p[1], p[2])


def hue(p) -> float:
    return math.degrees(math.atan2(p[2], p[1])) % 360


def hue_difference(a, b) -> float:
    d = abs(hue(a) - hue(b)) % 360
    return min(d, 360 - d)


# ---------------------------------------------------------------- images

def rows_of(width: int, height: int, pixels: bytes) -> list[list[int]]:
    return [list(pixels[y * width:(y + 1) * width]) for y in range(height)]


class Sprite:
    """Index statistics of indexed images sharing a palette: pixel counts, pixels touching transparency or a frame's
    edge (bound), and how often two colours touch (adj). The outline is the dark colours with many boundary pixels."""

    def __init__(self, images: list[tuple[list[list[int]], int | None]], palette: list):
        self.pal = palette
        self.count = collections.Counter()
        self.bound = collections.Counter()
        self.adj = collections.Counter()
        for rows, frame_width in images:
            height = len(rows)
            width = len(rows[0]) if rows else 0
            frame_width = frame_width or width
            for y in range(height):
                row = rows[y]
                for x in range(width):
                    v = row[x]
                    if v == 0:
                        continue
                    self.count[v] += 1
                    fx = x % frame_width
                    edge = False
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if (ny < 0 or ny >= height or nx < 0 or nx >= width or fx + dx < 0
                                or fx + dx >= frame_width):
                            edge = True
                            continue
                        u = rows[ny][nx]
                        if u == 0:
                            edge = True
                        elif u != v and (dx == 1 or dy == 1):
                            self.adj[(min(u, v), max(u, v))] += 1
                    if edge:
                        self.bound[v] += 1
        self.cols = sorted(self.count)
        self.lab = {i: oklab(palette[i]) for i in range(len(palette))}
        self.outline = self._outline()

    def _outline(self) -> set[int]:
        total = sum(self.bound.values()) or 1
        lightness = sorted(self.lab[i][0] for i in self.cols)
        median = lightness[len(lightness) // 2] if lightness else 0
        outline = set()
        for i in self.cols:
            if self.bound[i] / total >= 0.08 and self.bound[i] / self.count[i] >= 0.3 and self.lab[i][0] <= median:
                outline.add(i)
        if not outline and self.cols:
            i = max(self.cols, key=lambda k: self.bound[k])
            if self.lab[i][0] <= median:
                outline.add(i)
        return outline


class Sheet:
    """An overworld sheet: frames side by side, each square (frame width = height), and its 16 colours."""

    def __init__(self, width: int, height: int, pixels: bytes, palette: list):
        self.width, self.height, self.pixels, self.palette = width, height, pixels, list(palette)
        self.rows = rows_of(width, height, pixels)
        self.sprite = Sprite([(self.rows, height)], self.palette)

    @classmethod
    def load(cls, image: Path, palette: Path) -> "Sheet":
        width, height, pixels, _ = read_indexed_png(image)
        return cls(width, height, pixels, read_palette(palette))


# The look-alike threshold of F (dE), and its extra for two dark colours (lightness under 40)
LOOKALIKE = 6.0
LOOKALIKE_DARK_EXTRA = 2.0
EDGE_WEIGHT = 8.0
PRIOR_WEIGHT = 3.0
TRANSPARENT = "T"
NEIGHBOURS = ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1))


def _neighbours(rows, x, y, frame_width, width, height):
    fx = x % frame_width
    for dx, dy in NEIGHBOURS:
        nx, ny = x + dx, y + dy
        if ny < 0 or ny >= height or nx < 0 or nx >= width or fx + dx < 0 or fx + dx >= frame_width:
            yield 0
        else:
            yield rows[ny][nx]


class BattleArt:
    """A battle group's palettes and art: the assembled frames' statistics (sprite), the colours the part sheets
    use (parts_used), and each index's neighbourhood role for F."""

    def __init__(self, normal: list, shiny: list, singles: list, parts: list):
        self.normal = list(normal)
        self.shiny = list(shiny)
        self.sprite = Sprite([(rows, None) for rows in singles or parts], self.normal)
        self.used = collections.Counter(self.sprite.count)
        if not singles:
            for rows in parts:
                for row in rows:
                    self.used.update(row)
        self.used.pop(0, None)
        self.parts_used = collections.Counter()
        for rows in parts:
            for row in rows:
                self.parts_used.update(row)
        self.parts_used.pop(0, None)
        self.normal_lab = [oklab(c) for c in self.normal]
        self.shiny_lab = [oklab(c) for c in self.shiny]
        self._roles(singles, parts)

    @classmethod
    def load(cls, group: Path, art: Path | None = None, sexes: str = "m") -> "BattleArt":
        """sexes: "m" for the male (or only) art, "f" for the female, "fm" for both."""
        art = art or group
        singles, parts = [], []
        names = (("front", "back") if "m" in sexes else ()) + (("front_female", "back_female") if "f" in sexes else ())
        for name in names:
            part = art / f"{name}.png"
            if part.is_file():
                parts.append(rows_of(*read_indexed_png(part)[:3]))
            single = art / (name.replace("front", "front_single").replace("back", "back_single") + ".png")
            if single.is_file():
                singles.append(rows_of(*read_indexed_png(single)[:3]))
        return cls(read_palette(group / "normal.pal"), read_palette(group / "shiny.pal"), singles, parts)

    def _roles(self, singles, parts):
        used = collections.Counter()
        for rows in parts + singles:
            for row in rows:
                used.update(row)
        used.pop(0, None)
        self.role_used = sorted(used)
        group = {i: i for i in self.role_used}

        def find(i):
            while group[i] != i:
                i = group[i]
            return i

        # Context classes: near-duplicates only
        for a in self.role_used:
            for b in self.role_used:
                if a < b and delta(self.normal_lab[a], self.normal_lab[b]) <= 3.0:
                    group[find(b)] = find(a)
        self.group = {i: find(i) for i in self.role_used}
        self.classes = len(set(self.group.values()))
        # Neighbour histograms: other colours from all the art, transparency from the assembled frames only
        self.hist = {i: collections.Counter() for i in self.role_used}
        for k, rows in enumerate(singles + parts):
            transparency = k < len(singles) or not singles
            height = len(rows)
            width = len(rows[0]) if rows else 0
            for y in range(height):
                for x in range(width):
                    v = rows[y][x]
                    if v == 0:
                        continue
                    histogram = self.hist[v]
                    for u in _neighbours(rows, x, y, width, width, height):
                        if u == 0:
                            if transparency:
                                histogram[TRANSPARENT] += 1
                        else:
                            histogram[self.group.get(u, u)] += 1
        self.size = {i: sum(self.hist[i].values()) for i in self.role_used}
        self.edge = {}
        for i in self.role_used:
            total = (sum(self.hist[i].values()) - self.hist[i][self.group[i]]) or 1
            self.edge[i] = self.hist[i][TRANSPARENT] / total
        self._alike = {}

    def alike(self, t: int) -> list[int]:
        """The look-alikes of battle index t: used indices whose normal colour lies within the threshold of t's."""
        if t not in self.group:
            return [t]
        if t not in self._alike:
            found = []
            for u in self.role_used:
                dark = max(self.normal_lab[u][0], self.normal_lab[t][0]) < 40
                if delta(self.normal_lab[u], self.normal_lab[t]) <= LOOKALIKE + (LOOKALIKE_DARK_EXTRA if dark else 0):
                    found.append(u)
            self._alike[t] = found
        return self._alike[t]

    def choose(self, t: int, context: list) -> int:
        candidates = self.alike(t)
        if len(candidates) == 1:
            return t
        best = None
        sizes = sum(self.size[c] for c in candidates) + 1.0
        for u in candidates:
            histogram = self.hist[u]
            total = sum(histogram.values()) + 1.0 * (self.classes + 1)
            score = 0.0
            for g in context:
                score += math.log((histogram.get(g, 0) + 1.0) / total)
            score += PRIOR_WEIGHT * math.log((self.size[u] + 1.0) / sizes)
            if TRANSPARENT in context:
                score += EDGE_WEIGHT * math.log(self.edge[u] + 0.01)
            if best is None or score > best[0]:
                best = (score, u)
        return best[1]


# ---------------------------------------------------------------- assignment

def hungarian(cost: list[list[float]]) -> list[int]:
    """The min-cost assignment of n rows to m >= n columns: the column of each row."""
    n = len(cost)
    m = len(cost[0])
    infinity = 1e18
    u = [0.0] * (n + 1)
    v = [0.0] * (m + 1)
    p = [0] * (m + 1)
    way = [0] * (m + 1)
    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv = [infinity] * (m + 1)
        used = [False] * (m + 1)
        while True:
            used[j0] = True
            i0 = p[j0]
            best = infinity
            j1 = 0
            for j in range(1, m + 1):
                if not used[j]:
                    current = cost[i0 - 1][j - 1] - u[i0] - v[j]
                    if current < minv[j]:
                        minv[j] = current
                        way[j] = j0
                    if minv[j] < best:
                        best = minv[j]
                        j1 = j
            for j in range(m + 1):
                if used[j]:
                    u[p[j]] += best
                    v[j] -= best
                else:
                    minv[j] -= best
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break
    result = [0] * n
    for j in range(1, m + 1):
        if p[j]:
            result[p[j] - 1] = j - 1
    return result


def assign(rows, columns, cost, duplicate_penalty=1000.0) -> dict:
    """One to one where possible; with more rows than columns, columns are repeated at a price per copy."""
    copies = max(1, -(-len(rows) // len(columns)))
    slots = [(c, r) for r in range(copies) for c in columns]
    table = [[cost(a, c) + r * duplicate_penalty for c, r in slots] for a in rows]
    result = hungarian(table)
    return {a: slots[result[i]][0] for i, a in enumerate(rows)}


def base_units(sprite: Sprite, same: float = 2.0) -> list[dict]:
    """The sheet's colours as units: identical colours (dE under 2) are one unit."""
    units = []
    for i in sorted(sprite.cols, key=lambda i: -sprite.count[i]):
        outline = i in sprite.outline
        for unit in units:
            if delta(unit["lab"], sprite.lab[i]) < same:
                unit["mem"].append(i)
                unit["n"] += sprite.count[i]
                unit["out"] = unit["out"] or outline
                break
        else:
            units.append({"lab": sprite.lab[i], "mem": [i], "out": outline, "n": sprite.count[i]})
    return units


def merge_down(sprite: Sprite, units: list[dict], target: int, adjacency_weight: float = 4.0) -> list[dict]:
    """Units merged until there are target of them: the pair most alike and least adjacent, never an outline unit
    with an interior one."""
    units = [dict(unit) for unit in units]

    def adjacent(a, b):
        s = 0
        for x in a["mem"]:
            for y in b["mem"]:
                s += sprite.adj.get((min(x, y), max(x, y)), 0)
        return s / max(1, min(a["n"], b["n"]))

    while len(units) > target:
        best = None
        for p in range(len(units)):
            for q in range(p + 1, len(units)):
                a, b = units[p], units[q]
                penalty = 0 if a["out"] == b["out"] else 1000
                score = delta(a["lab"], b["lab"]) * (1 + adjacency_weight * adjacent(a, b)) + penalty
                if best is None or score < best[0]:
                    best = (score, p, q)
        _, p, q = best
        a, b = units[p], units[q]
        keep = a if a["n"] >= b["n"] else b
        units[p] = {"lab": keep["lab"], "mem": a["mem"] + b["mem"], "out": a["out"] or b["out"], "n": a["n"] + b["n"]}
        del units[q]
    return units


def unit_adjacency(sprite: Sprite, units: list[dict]) -> dict:
    adjacency = {}
    for a in range(len(units)):
        for b in range(a + 1, len(units)):
            s = 0
            for x in units[a]["mem"]:
                for y in units[b]["mem"]:
                    s += sprite.adj.get((min(x, y), max(x, y)), 0)
            if s >= 3:
                adjacency[(a, b)] = min(1.0, s / 10.0)
    return adjacency


# E's settings (the design doc's section 2)
E = {"neutral_c": 4.0, "neutral_target_c": 7.0, "neutral_reach": 12.0, "lam_neutral": 2.5, "lam_neutral_ab": 2.0,
     "lam_hue": 0.15, "accent_c": 10.0, "accent_share": 0.08, "accent_hue": 35.0, "guard": 8.0, "lam_inv": 1.0,
     "lam_con": 1.0, "out_dark": 2.0, "lam_merge": 10.0, "accent_merge": 200.0, "chroma_min": 6.0, "res_ratio": 0.6,
     "lam_dechroma": 1.0, "lock_c": 15.0, "battle_accent_share": 0.03}


def candidates(battle: BattleArt) -> list[int]:
    """The battle indices the assembled frames (or the parts, without them) use; all 15 when none."""
    return [i for i in range(1, 16) if battle.used.get(i, 0) > 0] or list(range(1, 16))


def colour_map(sprite: Sprite, battle: BattleArt) -> dict[int, int]:
    """E: the battle index of each of the sheet's colours."""
    v = E
    bs = battle.sprite
    single = candidates(battle)
    parts_only = [t for t in range(1, 16) if battle.parts_used.get(t, 0) > 0 and t not in single]
    cand = sorted(set(single) | set(parts_only))
    battle_total = sum(bs.count.values()) or 1
    reserved = set(parts_only) | {t for t in single if chroma(bs.lab[t]) >= v["accent_c"]
                                  and bs.count.get(t, 0) / battle_total <= v["battle_accent_share"]}
    units = base_units(sprite)
    if len(units) > len(cand):
        units = merge_down(sprite, units, len(cand))
    keys = list(range(len(units)))
    total = sum(u["n"] for u in units)
    lab = {k: u["lab"] for k, u in enumerate(units)}
    c = {k: chroma(lab[k]) for k in keys}
    family_share = {k: sum(units[j]["n"] for j in keys
                           if c[j] >= v["chroma_min"] and hue_difference(lab[k], lab[j]) <= v["accent_hue"]) / total
                    for k in keys}
    accent = {k: c[k] >= v["accent_c"] and not units[k]["out"] and family_share[k] <= v["accent_share"] for k in keys}
    hue_locked = {k: accent[k] or (c[k] >= v["lock_c"] and not units[k]["out"]) for k in keys}
    allowed = {}
    for k in keys:
        if hue_locked[k]:
            family = [t for t in cand if chroma(bs.lab[t]) >= v["chroma_min"]
                      and hue_difference(lab[k], bs.lab[t]) <= v["accent_hue"]]
            allowed[k] = set(family) if family else None
    neutral_allowed = {}
    for k in keys:
        neutral_allowed[k] = None
        if c[k] < v["neutral_c"]:
            nearest = min(delta(lab[k], bs.lab[t]) for t in single)
            family = [t for t in single if chroma(bs.lab[t]) < v["neutral_target_c"]
                      and delta(lab[k], bs.lab[t]) <= nearest + v["neutral_reach"]]
            neutral_allowed[k] = set(family) if family else None

    def hard(k, t):
        if hue_locked[k] and allowed.get(k) and t not in allowed[k]:
            return True
        if neutral_allowed[k] and t not in neutral_allowed[k]:
            return True
        if t in reserved:
            ct = chroma(bs.lab[t])
            if (c[k] < v["chroma_min"] or units[k]["out"] or c[k] < v["res_ratio"] * ct
                    or hue_difference(lab[k], bs.lab[t]) > v["accent_hue"]):
                return True
        return False

    def soft(k, t):
        cost = weighted(lab[k], bs.lab[t])
        ct = chroma(bs.lab[t])
        if c[k] < v["neutral_c"]:
            cost += v["lam_neutral"] * max(0.0, ct - v["neutral_c"])
            cost += v["lam_neutral_ab"] * math.hypot(lab[k][1] - bs.lab[t][1], lab[k][2] - bs.lab[t][2])
        elif ct >= v["neutral_c"]:
            cost += v["lam_hue"] * hue_difference(lab[k], bs.lab[t]) * min(c[k], ct) / 10.0
        if c[k] >= v["chroma_min"]:
            cost += v["lam_dechroma"] * max(0.0, c[k] - ct - 4)
        return cost

    near = {}
    for k in keys:
        ok = [t for t in cand if not hard(k, t)] or cand
        near[k] = min(delta(lab[k], bs.lab[t]) for t in ok)

    def unit_cost(k, t):
        cost = soft(k, t)
        if hard(k, t):
            cost += 1000
        if delta(lab[k], bs.lab[t]) > near[k] + v["guard"]:
            cost += 1000
        return cost

    costs = {(k, t): unit_cost(k, t) for k in keys for t in cand}
    um = assign(keys, cand, lambda k, t: costs[(k, t)], duplicate_penalty=v["lam_merge"])
    adjacency = unit_adjacency(sprite, units)
    w = {k: 0.5 + len(units) * units[k]["n"] / total * 0.5 for k in keys}
    need = max(0, len(units) - len(cand))

    def objective():
        e = 0.0
        for k in keys:
            e += w[k] * costs[(k, um[k])]
            if units[k]["out"] and bs.lab[um[k]][0] > lab[k][0] + 10:
                e += v["out_dark"] * (bs.lab[um[k]][0] - lab[k][0] - 10)
        for (a, b), f in adjacency.items():
            la, lb = lab[a], lab[b]
            ta, tb = bs.lab[um[a]], bs.lab[um[b]]
            d0 = la[0] - lb[0]
            d1 = ta[0] - tb[0]
            if abs(d0) > 3 and d0 * d1 < 0:
                e += v["lam_inv"] * f * abs(d1)
            c0 = delta(la, lb)
            c1 = delta(ta, tb)
            if c1 < 0.5 * c0:
                e += v["lam_con"] * f * (0.5 * c0 - c1)
        by_target = collections.defaultdict(list)
        for k in keys:
            by_target[um[k]].append(k)
        merges = 0
        for ks in by_target.values():
            merges += len(ks) - 1
            if len(ks) > 1 and any(accent[k] for k in ks) and not all(accent[k] for k in ks):
                e += v["accent_merge"]
        return e + v["lam_merge"] * max(0, merges - need)

    best = objective()
    improved = True
    rounds = 0
    while improved and rounds < 50:
        improved = False
        rounds += 1
        for k in keys:
            for t in cand:
                if t == um[k]:
                    continue
                old = um[k]
                um[k] = t
                e = objective()
                if e < best - 1e-9:
                    best = e
                    improved = True
                else:
                    um[k] = old
        for a in keys:
            for b in keys:
                if b <= a or um[a] == um[b]:
                    continue
                um[a], um[b] = um[b], um[a]
                e = objective()
                if e < best - 1e-9:
                    best = e
                    improved = True
                else:
                    um[a], um[b] = um[b], um[a]
    result = {}
    for k, unit in enumerate(units):
        for i in unit["mem"]:
            result[i] = um[k]
    return result


def remap_pixels(sheet: Sheet, battle: BattleArt, mapping: dict[int, int] | None = None) -> bytes:
    """F: the sheet's pixels as battle indices (E's map, then the look-alike choice per pixel)."""
    mapping = mapping if mapping is not None else colour_map(sheet.sprite, battle)
    height, width, frame = sheet.height, sheet.width, sheet.height
    base = [[mapping.get(v, 0) if v else 0 for v in row] for row in sheet.rows]
    out = [row[:] for row in base]
    for y in range(height):
        for x in range(width):
            t = base[y][x]
            if not t or len(battle.alike(t)) == 1:
                continue
            context = []
            for u in _neighbours(base, x, y, frame, width, height):
                if u == 0:
                    context.append(TRANSPARENT)
                elif u != t:
                    context.append(battle.group.get(u, u))
            out[y][x] = battle.choose(t, context)
    return bytes(v for row in out for v in row)


def remap(sheet: Sheet, battle: BattleArt) -> tuple[bytes, dict[int, int]]:
    """The sheet's pixels as battle indices (F), with E's colour map."""
    mapping = colour_map(sheet.sprite, battle)
    return remap_pixels(sheet, battle, mapping), mapping


# ---------------------------------------------------------------- the flag

def report(sheet: Sheet, battle: BattleArt, mapping: dict[int, int]) -> list[str]:
    """The reasons a remapped sheet needs a look (the design doc's section 3), none when it looks right."""
    sprite = sheet.sprite
    bs = battle.sprite
    total = sum(sprite.count.values()) or 1
    weighted_shift = 0.0
    largest = 0.0
    for i in sprite.cols:
        e = delta(sprite.lab[i], bs.lab[mapping[i]])
        weighted_shift += e * sprite.count[i]
        if sprite.count[i] >= 0.03 * total:
            largest = max(largest, e)
    reasons = []
    if weighted_shift / total > 8.0:
        reasons.append(f"mean shift {weighted_shift / total:.1f} dE")
    if largest > 20.0:
        reasons.append(f"a colour shifts {largest:.1f} dE")
    if any(bs.lab[mapping[i]][0] > sprite.lab[i][0] + 15 for i in sprite.outline):
        reasons.append("an outline colour got lighter")
    lost = flips = 0
    for (a, b), n in sprite.adj.items():
        if n < 8:
            continue
        c0 = delta(sprite.lab[a], sprite.lab[b])
        c1 = delta(bs.lab[mapping[a]], bs.lab[mapping[b]])
        if c0 >= 12 and c1 < 0.4 * c0:
            lost += 1
        l0 = sprite.lab[a][0] - sprite.lab[b][0]
        l1 = bs.lab[mapping[a]][0] - bs.lab[mapping[b]][0]
        if abs(l0) >= 6 and abs(l1) >= 6 and l0 * l1 < 0:
            flips += 1
    if lost:
        reasons.append(f"{lost} contrast collapse(s)")
    if flips:
        reasons.append(f"{flips} lightness flip(s)")
    used = [t for t in range(1, 16) if battle.parts_used.get(t, 0) or battle.used.get(t, 0)]
    tint = accent = 0
    for i in sprite.cols:
        a = sprite.lab[i]
        t = bs.lab[mapping[i]]
        if chroma(a) < 4 and sprite.count[i] >= 0.02 * total and chroma(t) >= 7:
            tint += 1
        family = sum(sprite.count[j] for j in sprite.cols
                     if chroma(sprite.lab[j]) >= 6 and hue_difference(a, sprite.lab[j]) <= 35) / total
        if (chroma(a) >= 10 and i not in sprite.outline and family <= 0.08
                and (chroma(t) < 6 or hue_difference(a, t) > 45)
                and any(chroma(bs.lab[u]) >= 6 and hue_difference(a, bs.lab[u]) <= 35 for u in used)):
            accent += 1
    if tint:
        reasons.append(f"{tint} neutral(s) tinted")
    if accent:
        reasons.append(f"{accent} accent(s) lost their hue")
    return reasons
