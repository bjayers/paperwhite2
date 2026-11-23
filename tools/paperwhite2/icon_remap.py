#!/usr/bin/env python3
"""Paper White 2: the party/box icons re-indexed onto their battle palettes, by two methods, for the editor's Icon
review page (docs/paperwhite2/design/shiny-icons.md, sections 7-13; the page was removed once the review was applied,
and this tool and res/paperwhite2/icon_remap_choices.json stay as its record).

One icon per species-form: its pixels become indices of the group's battle palette (normal.pal; a shiny is the same
pixels through shiny.pal) plus the two vanilla outline greys. The icon's own 16-colour palette is

    slot 0        transparent
    slots 1-13    the battle indices the icon uses (its "slots"), coloured from normal.pal or shiny.pal
    slots 14-15   the vanilla outline greys #62625a and #414141, the same for normal and shiny

Two candidates per icon, built in stages (each section's script of the experiments, ported here unchanged):

- **F** (section 7): palette_remap.remap() on both frames side by side.
- **H** (sections 8-9): the battle front sprite registered onto the icon; the icon cut into parts of one vanilla
  colour family that vote for a battle hue ramp; a part leaves F's ramp when the registration and the battle art's
  ramp shares agree; one shading map per (family, ramp).
- **IH** (section 10): each vanilla colour takes the ramp H gave most of its pixels, then I's rules: one new index
  per vanilla index, the outline greys' groups touching transparency kept, shading per ramp in vanilla lightness
  order.
- **IHM** (sections 11-12): IH with each "wrong twin" swapped: a slot whose battle index has a look-alike (same normal
  colour, a different shiny) that the battle art uses more takes that look-alike.
- **J** (section 12): IH's start, ramps split where shiny.pal splits them, and a shiny-change term that may move a
  family between plausible ramps; then the same twin swap.

And the suspects list of section 12 (parts whose shiny behaviour disagrees with the battle sprite's), on IHM.

The icons the user flagged to fix by hand (fix_by_hand in res/paperwhite2/icon_remap_choices.json), and those whose
choice is already one of the four below, also get four more candidates for the review page's Flagged mode (section 14):

- **G2** (section 8): F kept unless the registered battle sprite clearly disagrees, the vanilla outline greys kept.
- **H** and **IH** as above (H's own pixels; IH before the twin swap).
- **K** (section 14): the user's pick of IHM and J (k_base in the choices file once recorded, so K stays the same
  after the choice moves to another method) corrected for the error classes measured on the flagged icons
  (grey where the art has a pale tint, a missing battle colour family, collapsed shades, too dark), then the twin
  swap.

    icon_remap.py generate [--res DIR] [--out DIR] [-j N] [KEY ...]
        writes OUT (default build/icon_review/): index.json (every icon, whether IHM and J differ, its suspects,
        the extra candidates of those icons), differ.txt, and per icon icons/<key>/: icon.json (pixels, slots,
        palettes, battle front, and for those icons their "candidates" g2, h, ih and k), vanilla.png, ihm.png and
        j.png (index images with the normal colours through their slots). Regenerable; nothing in res/ changes.
        KEYs limit it to some icons (with their palette-only forms).
    icon_remap.py apply [--res DIR] [--review DIR] [--force] [--dry-run]
        writes each icon's chosen candidate (IHM without a choice) from generate's output into res/pokemon as
        icon_battle.png and icon_battle.json (icon_female_battle.* for a female icon; sprite_edit.py has the format),
        next to the vanilla icon.png the game still builds from. Icons marked hand-edited in
        res/paperwhite2/sprite_review.json (sprite_edit.py has the marks), and any that differ from their candidate,
        are kept unless --force; a kept icon not yet marked is marked, a forced one unmarked (section 15).

Standard library only (the build's python3).
"""
import argparse
import collections
import json
import math
import os
import shutil
import sys
import time
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.nitro_2d import read_indexed_png, read_palette, write_indexed_png  # noqa: E402
from tools.paperwhite2 import palette_remap as pr  # noqa: E402
from tools.paperwhite2.palette_remap import chroma, hue_difference, oklab  # noqa: E402

OUTLINE_GREYS = [(0x62, 0x62, 0x5a), (0x41, 0x41, 0x41)]  # fixed slots 14 and 15
BATTLE_SLOTS = 13
NEUTRAL_C = 4.0
DETAIL_PX = 8          # parts smaller than this (both frames) keep F's colours
SHINY_DIFF = 10.0      # dE between two look-alikes' shiny colours for a twin to matter
CHANGE_DE = 15.0       # a battle index "changes when shiny" above this normal-to-shiny dE
SHINY_HUE = 30.0       # J: ramp members whose shiny colours differ more in hue (or chromatic vs grey) are split
TIE = 0.15             # J: a family may move to a ramp whose per-area cost is at most this much higher
MIN_GAIN = 0.02
GAP = 99.0             # J: the "J+gap" variant's 0.6 is off
DARK_L = 30            # ramp shades darker than this (or the battle outline colours) are kept off vanilla colours >= 45
DARK_FOR = 45
W = dict(hue=0.6, to_neutral=1.0, near_hue=0.5, near_deg=36, ab=1.0, to_colour=0.35, to_colour_white=1.0, light=2.0,
         f_prior=0.25, tvd=1.0, hue_limit=75)


# ---------------------------------------------------------------- the icons

def species_order(root: Path) -> list[str]:
    names = []
    for line in (root / "generated" / "species.txt").read_text().splitlines():
        if line.startswith("SPECIES_"):
            names.append(line.split()[0][8:].lower())
    return names  # index = species number


def jobs(pokemon: Path, names: list[str]) -> list[dict]:
    """Every icon in dex order, forms and the female icon after their base. kind: base, female, form (an icon of its
    own) or palette_form (the base icon on the form's palettes, as Arceus' forms)."""
    out = []
    for num, name in enumerate(names):
        d = pokemon / name
        if num == 0 or not (d / "icon.png").is_file():
            continue
        female_icon = (d / "icon_female.png").is_file()
        out.append(dict(key=name, num=num, label=str(num), icon=str(d / "icon.png"), group=str(d), art=str(d),
                        sexes="m" if female_icon or not (d / "front_female.png").is_file() else "fm", kind="base"))
        if female_icon:
            out.append(dict(key=name + "_female", num=num, label=f"{num}F", icon=str(d / "icon_female.png"),
                            group=str(d), art=str(d), sexes="f" if (d / "front_female.png").is_file() else "m",
                            kind="female"))
        forms = sorted((p for p in d.glob("form_*") if p.is_dir() and p.name[5:].isdigit()), key=lambda p: int(p.name[5:]))
        for f in forms:
            n = int(f.name[5:])
            own_icon = (f / "icon.png").is_file()
            out.append(dict(key=f"{name}_form_{n}", num=num, label=f"{num}-{n}",
                            icon=str((f if own_icon else d) / "icon.png"), group=str(f),
                            art=str(f if (f / "front.png").is_file() else d), sexes="m",
                            kind="form" if own_icon else "palette_form"))
    return out


def load_icon(path: Path):
    _, _, px, ipal = read_indexed_png(path)
    return px, list(ipal) + [(0, 0, 0)] * (16 - len(ipal))


def battle_front(job) -> Path | None:
    art = Path(job["art"])
    f = art / ("front_single_female.png" if job["kind"] == "female" and (art / "front_single_female.png").is_file()
               else "front_single.png")
    return f if f.is_file() else None


def singles(job) -> list[Path]:
    """The front and back frames the ramp shares are counted over (the female ones for a female icon)."""
    art = Path(job["art"])
    out = []
    for name in ("front_single", "back_single"):
        fem = art / f"{name}_female.png"
        path = fem if job["kind"] == "female" and fem.is_file() else art / f"{name}.png"
        if path.is_file():
            out.append(path)
    return out


# ---------------------------------------------------------------- F (section 7)

def to_sheet(pixels):
    # 32x64 (frame 0 above frame 1) -> 64x32 (side by side)
    rows = [list(pixels[y * 32:(y + 1) * 32]) for y in range(64)]
    side = [rows[y] + rows[32 + y] for y in range(32)]
    return bytes(v for r in side for v in r)


def from_sheet(pixels):
    rows = [list(pixels[y * 64:(y + 1) * 64]) for y in range(32)]
    out = [r[:32] for r in rows] + [r[32:] for r in rows]
    return bytes(v for r in out for v in r)


def method_f(px, ipal, battle) -> bytes:
    sheet = pr.Sheet(64, 32, to_sheet(px), ipal[:16])
    new_side, _ = pr.remap(sheet, battle)
    return from_sheet(new_side)


# ---------------------------------------------------------------- battle ramps (G, with H's pale-is-white rule)

def build_ramps(battle, pale=True):
    """The used battle indices grouped into hue ramps. pale: H's rule that pale colours (L 85+, chroma under 5.5)
    read as white and join the neutral ramp (G, section 8, ran without it)."""
    lab = battle.normal_lab
    used = pr.candidates(battle)
    adj = battle.sprite.adj
    adj_total = collections.Counter()
    for (a, b), c in adj.items():
        adj_total[a] += c
        adj_total[b] += c

    def share(a, b):
        c = adj.get((min(a, b), max(a, b)), 0)
        return c / (min(adj_total[a], adj_total[b]) or 1)

    # Pale colours (L 85+, chroma under 5.5) read as white and join the neutral ramp
    neutral = [i for i in used if chroma(lab[i]) < NEUTRAL_C or (pale and lab[i][0] >= 85 and chroma(lab[i]) < 5.5)]
    weak = [i for i in used if i not in neutral and (chroma(lab[i]) < 8 or (lab[i][0] < 35 and chroma(lab[i]) < 12))]
    strong = [i for i in used if i not in neutral and i not in weak]
    # Complete linkage on hue: every pair within 20 degrees, or 28 when the art puts the two clusters side by side
    clusters = [[i] for i in strong]
    while True:
        best = None
        for a in range(len(clusters)):
            for b in range(a + 1, len(clusters)):
                h = max(hue_difference(lab[x], lab[y]) for x in clusters[a] for y in clusters[b])
                s = max(share(x, y) for x in clusters[a] for y in clusters[b])
                if h <= 20 or (h <= 28 and s >= 0.12):
                    if best is None or h < best[0]:
                        best = (h, a, b)
        if best is None:
            break
        _, a, b = best
        clusters[a] += clusters.pop(b)
    if neutral:
        clusters.append(neutral)
    for w in weak:
        best = None
        for k, cl in enumerate(clusters):
            if cl is neutral:
                continue
            h = min(hue_difference(lab[w], lab[x]) for x in cl)
            s = max(share(w, x) for x in cl)
            score = h - 30 * s
            if h <= 40 and (best is None or score < best[0]):
                best = (score, k)
        if best is not None:
            clusters[best[1]].append(w)
        elif neutral and chroma(lab[w]) < 6:
            neutral.append(w)
        else:
            clusters.append([w])
    ramp_of = {}
    out = []
    for k, members in enumerate(sorted(clusters, key=lambda m: min(m))):
        members.sort(key=lambda i: lab[i][0])
        for i in members:
            ramp_of[i] = k
        out.append(members)
    return out, ramp_of


# ---------------------------------------------------------------- registration (G)

def mask_bbox(rows):
    pts = [(x, y) for y, r in enumerate(rows) for x, v in enumerate(r) if v]
    if not pts:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def battle_edges(brows, ramp_of):
    h, w = len(brows), len(brows[0])
    edge = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            v = brows[y][x]
            if not v:
                continue
            for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    u = brows[ny][nx]
                    if u and ramp_of.get(u, -1) != ramp_of.get(v, -1):
                        edge[y][x] = True
    # dilate by 1
    out = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if edge[y][x]:
                for yy in range(max(0, y - 1), min(h, y + 2)):
                    for xx in range(max(0, x - 1), min(w, x + 2)):
                        out[yy][xx] = True
    return out


def register(irows, iedge, brows, bedge):
    """The transform (sx, sy, ox, oy, flip) mapping icon pixel centres to battle pixels, with its score and IoU."""
    ib = mask_bbox(irows)
    bb = mask_bbox(brows)
    if not ib or not bb:
        return None
    iw, ih = ib[2] - ib[0], ib[3] - ib[1]
    bw, bh = bb[2] - bb[0], bb[3] - bb[1]
    icx, icy = (ib[0] + ib[2]) / 2, (ib[1] + ib[3]) / 2
    bcx, bcy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
    H, W_ = len(brows), len(brows[0])
    region = [(x, y) for y in range(max(0, ib[1] - 3), min(32, ib[3] + 3))
              for x in range(max(0, ib[0] - 3), min(32, ib[2] + 3))]
    inside = [bool(irows[y][x]) for x, y in region]
    edges = [(x, y) for x, y in region if iedge[y][x]]
    n_in = sum(inside)

    def score(sx, sy, ox, oy, flip):
        inter = union = 0
        f = -1 if flip else 1
        for (x, y), a in zip(region, inside):
            bx = int(bcx + f * (x + 0.5 - icx - ox) * sx)
            by = int(bcy + (y + 0.5 - icy - oy) * sy)
            b = 0 <= bx < W_ and 0 <= by < H and brows[by][bx] != 0
            if a and b:
                inter += 1
            if a or b:
                union += 1
        iou = inter / (union or 1)
        hit = 0
        for x, y in edges:
            bx = int(bcx + f * (x + 0.5 - icx - ox) * sx)
            by = int(bcy + (y + 0.5 - icy - oy) * sy)
            if 0 <= bx < W_ and 0 <= by < H and bedge[by][bx]:
                hit += 1
        er = hit / len(edges) if edges else 0
        return iou + 0.3 * er, iou, er

    sx0, sy0 = bw / iw, bh / ih
    best = None
    for flip in (False, True):
        for ms in (0.8, 0.9, 1.0, 1.1, 1.2):
            for mt in (0.8, 0.9, 1.0, 1.1, 1.2):
                for ox in (-2, -1, 0, 1, 2):
                    for oy in (-2, -1, 0, 1, 2):
                        s = score(sx0 * ms, sy0 * mt, ox, oy, flip)
                        if best is None or s[0] > best[0][0]:
                            best = (s, (sx0 * ms, sy0 * mt, ox, oy, flip))
    (s, (sx, sy, ox, oy, flip)) = best
    for _ in range(2):  # refine
        for dms in (0.95, 1.0, 1.05):
            for dmt in (0.95, 1.0, 1.05):
                for dox in (-0.5, 0, 0.5):
                    for doy in (-0.5, 0, 0.5):
                        t = (sx * dms, sy * dmt, ox + dox, oy + doy, flip)
                        sc = score(*t)
                        if sc[0] > best[0][0]:
                            best = (sc, t)
        (s, (sx, sy, ox, oy, flip)) = best
    return dict(t=best[1], score=round(best[0][0], 3), iou=round(best[0][1], 3), edge=round(best[0][2], 3),
                icx=icx, icy=icy, bcx=bcx, bcy=bcy, n_in=n_in)


def footprint(reg, x, y, H, W_):
    sx, sy, ox, oy, flip = reg["t"]
    f = -1 if flip else 1
    xa = reg["bcx"] + f * (x - reg["icx"] - ox) * sx
    xb = reg["bcx"] + f * (x + 1 - reg["icx"] - ox) * sx
    ya = reg["bcy"] + (y - reg["icy"] - oy) * sy
    yb = reg["bcy"] + (y + 1 - reg["icy"] - oy) * sy
    x0, x1 = sorted((xa, xb))
    y0, y1 = ya, yb
    xs = range(max(0, int(math.floor(x0))), min(W_, max(int(math.floor(x0)) + 1, int(math.ceil(x1)))))
    ys = range(max(0, int(math.floor(y0))), min(H, max(int(math.floor(y0)) + 1, int(math.ceil(y1)))))
    return [(bx, by) for by in ys for bx in xs]


# ---------------------------------------------------------------- the vanilla icon (G)

def vanilla_families(pal, used):
    lab = {i: oklab(pal[i]) for i in used}
    fam = {}
    parent = {}

    def find(i):
        while parent[i] != i:
            i = parent[i]
        return i
    chrom = [i for i in used if chroma(lab[i]) >= NEUTRAL_C]
    for i in chrom:
        parent[i] = i
    clusters = [[i] for i in chrom]
    while True:  # complete linkage, 25 degrees
        best = None
        for a in range(len(clusters)):
            for b in range(a + 1, len(clusters)):
                h = max(hue_difference(lab[x], lab[y]) for x in clusters[a] for y in clusters[b])
                if h <= 25 and (best is None or h < best[0]):
                    best = (h, a, b)
        if best is None:
            break
        clusters[best[1]] += clusters.pop(best[2])
    for cl in clusters:
        for i in cl:
            parent[i] = cl[0]
    for i in used:
        if i in parent:
            fam[i] = "c%d" % find(i)
        else:
            fam[i] = "nl" if lab[i][0] >= 70 else "nd"
    return fam, lab


def outline_pixels(rows, pal):
    """Outline pixels of each 32x32 frame: an exact bank outline grey touching transparency or the frame's edge, or
    in a thin line (at most 5 outline greys in its 3x3)."""
    greys = {i for i in range(len(pal)) if tuple(pal[i]) in OUTLINE_GREYS}
    out = set()
    for y in range(64):
        fy0 = 32 * (y // 32)
        for x in range(32):
            v = rows[y][x]
            if v not in greys:
                continue
            edge = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < 32 and fy0 <= ny < fy0 + 32) or rows[ny][nx] == 0:
                    edge = True
            if edge:
                out.add((x, y, "edge"))
                continue
            n = sum(1 for yy in range(y - 1, y + 2) for xx in range(x - 1, x + 2)
                    if 0 <= xx < 32 and fy0 <= yy < fy0 + 32 and rows[yy][xx] in greys)
            if n <= 5:
                out.add((x, y, "line"))
    return out


def segment(rows, fam, outline):
    """Connected parts (4-connected, same family, outline excluded), per frame; returns part id per pixel."""
    opx = {(x, y) for x, y, _ in outline}
    part = {}
    parts = []
    for y in range(64):
        for x in range(32):
            v = rows[y][x]
            if not v or (x, y) in opx or (x, y) in part:
                continue
            f = fam[v]
            pid = len(parts)
            stack = [(x, y)]
            part[(x, y)] = pid
            pix = []
            fy0 = 32 * (y // 32)
            while stack:
                cx, cy = stack.pop()
                pix.append((cx, cy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < 32 and fy0 <= ny < fy0 + 32 and (nx, ny) not in part and (nx, ny) not in opx:
                        u = rows[ny][nx]
                        if u and fam[u] == f:
                            part[(nx, ny)] = pid
                            stack.append((nx, ny))
            parts.append(dict(fam=f, pix=pix, frame=y // 32))
    return part, parts


def link_frames(rows, parts):
    """Join each frame-1 part to the frame-0 part it overlaps most under the best frame shift (same family)."""
    best = None
    m0 = {(x, y) for y in range(32) for x in range(32) if rows[y][x]}
    m1 = {(x, y - 32) for y in range(32, 64) for x in range(32) if rows[y][x]}
    for dx in range(-4, 5):
        for dy in range(-4, 5):
            s = sum(1 for (x, y) in m1 if (x - dx, y - dy) in m0 and rows[y - dy][x - dx] == rows[y + 32][x])
            if best is None or s > best[0]:
                best = (s, dx, dy)
    _, dx, dy = best
    pid_at = {}
    for pid, p in enumerate(parts):
        if p["frame"] == 0:
            for x, y in p["pix"]:
                pid_at[(x, y)] = pid
    group = list(range(len(parts)))
    for pid, p in enumerate(parts):
        if p["frame"] != 1:
            continue
        c = collections.Counter()
        for x, y in p["pix"]:
            q = pid_at.get((x - dx, y - 32 - dy))
            if q is not None and parts[q]["fam"] == p["fam"]:
                c[q] += 1
        if c:
            q, n = c.most_common(1)[0]
            if n >= 0.5 * len(p["pix"]):
                group[pid] = q
    return group


def shade_dp(levels, shades, lab_of):
    """levels: [(L, count)] sorted dark->light; shades: battle indices sorted dark->light. A monotone map from levels
    to shades minimising count-weighted (L - shift - L_shade)^2, a small cost on the shift, and merges."""
    best = None
    total = sum(c for _, c in levels) or 1
    for shift in range(-24, 25, 4):
        n, m = len(levels), len(shades)
        INF = float("inf")
        dp = [[INF] * m for _ in range(n)]
        back = [[0] * m for _ in range(n)]
        for s in range(m):
            L, c = levels[0]
            dp[0][s] = c * (L - shift - lab_of[shades[s]][0]) ** 2
        for j in range(1, n):
            L, c = levels[j]
            for s in range(m):
                cost = c * (L - shift - lab_of[shades[s]][0]) ** 2
                merged = dp[j - 1][s] + cost + (40 * min(c, levels[j - 1][1]) if m >= n else 0)
                strict = (INF, 0)
                if s > 0:
                    # best of dp[j-1][0..s-1]
                    strict = min((dp[j - 1][t], t) for t in range(s))
                    strict = (strict[0] + cost, strict[1])
                if merged <= strict[0]:
                    dp[j][s], back[j][s] = merged, s
                else:
                    dp[j][s], back[j][s] = strict
        s = min(range(m), key=lambda k: dp[n - 1][k])
        cost = dp[n - 1][s] + total * 0.25 * shift * shift
        if best is None or cost < best[0]:
            path = [s]
            for j in range(n - 1, 0, -1):
                s = back[j][s]
                path.append(s)
            path.reverse()
            best = (cost, [shades[k] for k in path], shift)
    return best[1], best[2]


def merge_slots(grid, counts, live, lab, ramp_of, flat):
    """Merges the closest same-ramp pair while more than BATTLE_SLOTS battle indices are used (no icon needs it)."""
    while len(live) > BATTLE_SLOTS:
        a, b = min(((a, b) for a in live for b in live if a != b),
                   key=lambda t: counts[t[0]] * pr.delta(lab[t[0]], lab[t[1]])
                   + (0 if ramp_of.get(t[0]) == ramp_of.get(t[1]) else 1000))
        grid = [b if v == a else v for v in grid] if flat else [[b if v == a else v for v in r_] for r_ in grid]
        counts[b] += counts.pop(a)
        live.remove(a)
    return grid


# ---------------------------------------------------------------- G2 (section 8)

FIT_GATE = 0.50        # G: overrides need the icon's registration IoU (worse frame) at least this


def method_g2(job, px, ipal, fpx, battle):
    """G2's pixels and slots (section 8, the conservative version the user reviewed in round 2): F kept unless the
    battle sprite under a part clearly disagrees, overridden parts shaded by vanilla lightness rank on the ramp's
    colours under them, the vanilla outline greys in slots 14-15. Ramps without H's pale-is-white rule."""
    ramps, ramp_of = build_ramps(battle, pale=False)
    st = registered_units(job, px, ipal, fpx, battle, ramps, ramp_of)
    rows, frows, lab, opx, parts = st["rows"], st["frows"], st["lab"], st["opx"], st["parts"]
    vlab, pvote, ivote, pcover, rhc = st["vlab"], st["pvote"], st["ivote"], st["pcover"], st["rhc"]
    units, regs = st["units"], st["regs"]
    neutral_ramp = next((k for k, m in enumerate(ramps) if all(chroma(lab[i]) < NEUTRAL_C for i in m)), None)

    # Family votes: small parts of one vanilla colour family (with the same F ramp) decide together
    fam_votes = collections.defaultdict(collections.Counter)
    fam_n = collections.Counter()
    for u in units:
        if not u["pix"]:
            continue
        fm = collections.Counter(ramp_of.get(frows[y][x], -1) for x, y in u["pix"]).most_common(1)[0][0]
        key = (parts[u["g"]]["fam"], fm)
        fam_n[key] += len(u["pix"])
        for q in u["pix"]:
            fam_votes[key].update(pvote[q])
    fam_top = {k: v.most_common(1)[0][0] for k, v in fam_votes.items() if v and fam_n[k] >= 24}
    icon_fit = min(r_["iou"] for r_ in regs if r_) if any(regs) else 0

    for u in units:
        pix = u["pix"]
        if not pix:
            continue
        ivotes = collections.Counter()
        for q in pix:
            ivotes.update(ivote[q])
        u["ivotes"] = ivotes
        votes = collections.Counter()
        for q in pix:
            votes.update(pvote[q])
        tot = sum(votes.values())
        cov = sum(pcover[q] for q in pix) / len(pix)
        fmaj = collections.Counter(ramp_of.get(frows[y][x], -1) for x, y in pix).most_common(1)[0][0]
        top, topv = votes.most_common(1)[0] if votes else (None, 0)
        purity = topv / tot if tot else 0
        f_chroma = sum(chroma(lab[frows[y][x]]) for x, y in pix) / len(pix)
        ub_chroma = sum(chroma(lab[i]) * c for i, c in ivotes.items()) / (sum(ivotes.values()) or 1)
        if len(pix) < DETAIL_PX:
            how = "detail"
        elif top is None or cov < 0.6:
            how = "keep-weak"
        elif top == fmaj:
            how = "agree"
        else:
            how = "keep-disagree"
            ratio = topv / (votes.get(fmaj, 0) or 1e-9)
            if icon_fit >= FIT_GATE and purity >= 0.6 and ratio >= 2.0:
                if top != neutral_ramp and f_chroma < 5 and ub_chroma >= max(5.5, f_chroma + 3):
                    how = "override"
                elif top != neutral_ramp and f_chroma < 8 and ub_chroma >= f_chroma + 5:
                    how = "override"
                elif (ratio >= 2.5 and (len(pix) >= 24 or fam_top.get((parts[u["g"]]["fam"], fmaj)) == top)
                      and top != neutral_ramp and fmaj >= 0 and fmaj != neutral_ramp
                      and math.fabs(((rhc[top][0] - rhc[fmaj][0] + 180) % 360) - 180) >= 30):
                    how = "override"
                elif top == neutral_ramp and len(pix) >= 24 and purity >= 0.85 and f_chroma >= 12:
                    how = "override"
        u.update(how=how, ramp=top if how == "override" else fmaj, votes=votes, fmaj=fmaj, fam=parts[u["g"]]["fam"])

    # Consensus: when most of a family's pixels (with the same F ramp) switch to one ramp, the rest follows where the
    # battle art under it doesn't prefer F's ramp
    fam_groups = collections.defaultdict(list)
    for u in units:
        if u["pix"] and "fmaj" in u and len(u["pix"]) >= DETAIL_PX:
            fam_groups[(u["fam"], u["fmaj"])].append(u)
    for us in fam_groups.values():
        total = sum(len(u["pix"]) for u in us)
        over = collections.Counter()
        for u in us:
            if u["how"] == "override":
                over[u["ramp"]] += len(u["pix"])
        if not over:
            continue
        R, n = over.most_common(1)[0]
        if n < 0.5 * total:
            continue
        for u in us:
            if u["how"] not in ("override", "detail") and u["votes"].get(R, 0) >= u["votes"].get(u["fmaj"], 0):
                u.update(how="override", ramp=R)

    # F's shading kept unless it inverts the vanilla lightness order or moves it by more than 18 L
    for u in units:
        pix = u["pix"]
        if not pix or "fmaj" not in u:
            continue
        counts = collections.Counter(rows[y][x] for x, y in pix)
        fl = collections.defaultdict(list)
        for x, y in pix:
            fl[rows[y][x]].append(lab[frows[y][x]][0])
        levels = sorted(counts, key=lambda v: vlab[v][0])
        fmean = [sum(fl[v]) / len(fl[v]) for v in levels]
        inverted = any(fmean[i + 1] < fmean[i] - 5 for i in range(len(levels) - 1))
        dev = sum(abs(sum(fl[v]) / len(fl[v]) - vlab[v][0]) * counts[v] for v in levels) / len(pix)
        u["reshade"] = (u["how"] in ("agree", "keep-disagree", "keep-weak") and u["fmaj"] >= 0
                        and len(pix) >= DETAIL_PX and (inverted or dev > 18))

    def shade_part(u):
        pix, ramp = u["pix"], u["ramp"]
        counts = collections.Counter(rows[y][x] for x, y in pix)
        levels = sorted(counts, key=lambda v: vlab[v][0])
        if ramp is None or ramp < 0:
            return None
        iv = u["ivotes"]
        tot = sum(iv.values()) or 1
        shades = []
        for i, c in iv.items():
            if ramp_of.get(i) == ramp and c / tot >= 0.08:
                shades.append(i)
            elif (c / tot >= 0.15 and ramp_of.get(i) != neutral_ramp and ramp != neutral_ramp
                  and math.fabs(((math.degrees(math.atan2(lab[i][2], lab[i][1])) - rhc[ramp][0] + 180) % 360) - 180) <= 40):
                shades.append(i)
        if len(shades) < min(2, len(levels)):
            shades = list(ramps[ramp])
        shades.sort(key=lambda i: lab[i][0])
        mapped, _ = shade_dp([(vlab[v][0], counts[v]) for v in levels], shades, lab)
        return dict(zip(levels, mapped))

    grid = [[0] * 32 for _ in range(64)]
    for u in units:
        pix = u["pix"]
        m = shade_part(u) if pix and (u["how"] == "override" or u["reshade"]) else None
        for x, y in pix:
            grid[y][x] = m[rows[y][x]] if m else frows[y][x]
    for (x, y) in opx:
        grid[y][x] = 0x100 + OUTLINE_GREYS.index(tuple(ipal[rows[y][x]]))
    # Slots 1-13: the battle indices used (the closest same-ramp pair merged while there are too many)
    counts = collections.Counter(v for r_ in grid for v in r_ if 0 < v < 0x100)
    remap = {v: v for v in counts}
    live = dict(counts)
    while len(live) > BATTLE_SLOTS:
        bestm = None
        for a in live:
            for b in live:
                if a != b:
                    cost = live[a] * pr.delta(lab[a], lab[b]) + (0 if ramp_of.get(a) == ramp_of.get(b) else 1000)
                    if bestm is None or cost < bestm[0]:
                        bestm = (cost, a, b)
        _, a, b = bestm
        live[b] += live.pop(a)
        for k, v in remap.items():
            if v == a:
                remap[k] = b
    slots = sorted(live)
    slot_of = {v: 1 + n for n, v in enumerate(slots)}
    out = bytes((14 + v - 0x100 if v >= 0x100 else slot_of[remap[v]]) if v else 0 for r_ in grid for v in r_)
    return out, slots


# ---------------------------------------------------------------- H (sections 8-9)

def registered_units(job, px, ipal, fpx, battle, ramps, ramp_of) -> dict:
    """G and H's first stage (sections 8-9): the battle front registered onto each icon frame, the icon cut into
    parts of one vanilla colour family (linked across the frames), each pixel's votes from the battle pixels under
    it, and the units (parts, split where the art under them clearly shows another ramp). Its local names."""
    rows = [list(px[y * 32:(y + 1) * 32]) for y in range(64)]
    frows = [list(fpx[y * 32:(y + 1) * 32]) for y in range(64)]
    lab = battle.normal_lab
    art = Path(job["art"])
    front = art / ("front_single_female.png" if job["kind"] == "female" and (art / "front_single_female.png").is_file()
                   else "front_single.png")
    bw, bh, bpx, _ = read_indexed_png(front)
    brows = [list(bpx[y * bw:(y + 1) * bw]) for y in range(bh)]
    bedge = battle_edges(brows, ramp_of)
    boutline = battle.sprite.outline

    used = sorted(set(px) - {0})
    fam, vlab = vanilla_families(ipal, used)
    outline = outline_pixels(rows, ipal)
    opx = {(x, y): kind for x, y, kind in outline}
    _, parts = segment(rows, fam, outline)
    group_of = link_frames(rows, parts)

    # Registration per frame, on the icon's internal edges (family changes and internal outline lines)
    regs = []
    for f in range(2):
        fr = rows[32 * f:32 * f + 32]
        iedge = [[False] * 32 for _ in range(32)]
        for y in range(32):
            for x in range(32):
                v = fr[y][x]
                if not v:
                    continue
                if opx.get((x, y + 32 * f)) == "line":
                    iedge[y][x] = True
                    continue
                for dx, dy in ((1, 0), (0, 1)):
                    nx, ny = x + dx, y + dy
                    if nx < 32 and ny < 32 and fr[ny][nx] and fam[fr[ny][nx]] != fam[v]:
                        iedge[y][x] = True
        regs.append(register(fr, iedge, brows, bedge))

    # Votes per pixel: the ramps of the battle pixels under it (battle outline colours left out)
    pvote = {}
    ivote = collections.defaultdict(collections.Counter)
    pcover = {}
    for p in parts:
        reg = regs[p["frame"]]
        for x, y in p["pix"]:
            fp = footprint(reg, x, y - 32 * p["frame"], bh, bw) if reg else []
            opaque = [brows[by][bx] for bx, by in fp if brows[by][bx]]
            pcover[(x, y)] = len(opaque) / (len(fp) or 1)
            useful = [v for v in opaque if v not in boutline] or opaque
            c = collections.Counter()
            for v in useful:
                if v in ramp_of:
                    c[ramp_of[v]] += 1.0 / len(useful)
                    ivote[(x, y)][v] += 1.0 / len(useful)
            pvote[(x, y)] = c
    groups = sorted(set(group_of))
    members = collections.defaultdict(list)
    for pid, g in enumerate(group_of):
        members[g].extend((x, y) for x, y in parts[pid]["pix"])

    def ramp_hue_chroma(k):
        a = b = n = 0.0
        for i in ramps[k]:
            w = battle.used.get(i, 1)
            a += lab[i][1] * w
            b += lab[i][2] * w
            n += w
        return math.degrees(math.atan2(b, a)) % 360, math.hypot(a / n, b / n)

    rhc = [ramp_hue_chroma(k) for k in range(len(ramps))]

    # Units: each linked part, with sub-parts where the battle art under it clearly shows another ramp
    units = []
    for g in groups:
        pix = members[g]
        if len(pix) >= 16:
            agg = collections.Counter()
            for q in pix:
                agg.update(pvote[q])
            major = agg.most_common(1)[0][0] if agg else None
            label = {}
            for q in pix:
                c = pvote[q]
                t = sum(c.values())
                if t and pcover[q] >= 0.5:
                    k, v = c.most_common(1)[0]
                    if v / t >= 0.6:
                        label[q] = k
            pset = set(pix)
            smooth = {}
            for (x, y) in pix:
                c = collections.Counter(label.get((x + dx, y + dy)) for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                                        if (x + dx, y + dy) in pset)
                c.pop(None, None)
                if c:
                    k, v = c.most_common(1)[0]
                    if v >= 4:
                        smooth[(x, y)] = k
            seen = set()
            rest = set(pix)
            for q in pix:
                k = smooth.get(q)
                if k is None or k == major or q in seen:
                    continue
                comp, stack = [], [q]
                seen.add(q)
                while stack:
                    cx, cy = stack.pop()
                    comp.append((cx, cy))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nq = (cx + dx, cy + dy)
                        if nq in pset and nq not in seen and smooth.get(nq) == k and (nq[1] // 32) == (cy // 32):
                            seen.add(nq)
                            stack.append(nq)
                if len(comp) >= 6:
                    units.append(dict(g=g, pix=comp, sub=True))
                    rest -= set(comp)
            units.append(dict(g=g, pix=[q for q in pix if q in rest], sub=False))
        else:
            units.append(dict(g=g, pix=pix, sub=False))

    return dict(locals())


def method_h(job, px, ipal, fpx, battle):
    """H's pixels (slots 1-13 battle indices, 14-15 the greys) and slots."""
    ramps, ramp_of = build_ramps(battle)
    st = registered_units(job, px, ipal, fpx, battle, ramps, ramp_of)
    rows, frows, lab, art, boutline = st["rows"], st["frows"], st["lab"], st["art"], st["boutline"]
    used, fam, vlab, opx, parts = st["used"], st["fam"], st["vlab"], st["opx"], st["parts"]
    pvote, ivote, pcover, rhc, units = st["pvote"], st["ivote"], st["pcover"], st["rhc"], st["units"]

    # Each unit's registration evidence: its battle-index votes, F's ramp, the vote's top ramp, cover and purity
    for u in units:
        pix = u["pix"]
        if not pix:
            continue
        ivotes = collections.Counter()
        for q in pix:
            ivotes.update(ivote[q])
        votes = collections.Counter()
        for q in pix:
            votes.update(pvote[q])
        tot = sum(votes.values())
        cov = sum(pcover[q] for q in pix) / len(pix)
        fmaj = collections.Counter(ramp_of.get(frows[y][x], -1) for x, y in pix).most_common(1)[0][0]
        top, topv = votes.most_common(1)[0] if votes else (None, 0)
        purity = topv / tot if tot else 0
        u.update(ivotes=ivotes, fmaj=fmaj, top=top, cov=cov, purity=purity)

    # Battle ramp shares over the front and back frames (battle outline colours left out): a pose-free witness
    share_px = collections.Counter()
    for path in singles(job):
        for v in read_indexed_png(path)[2]:
            if v and v not in boutline and v in ramp_of:
                share_px[ramp_of[v]] += 1
    st = sum(share_px.values()) or 1
    bshare = [share_px[k] / st for k in range(len(ramps))]
    rlo = [min(lab[i][0] for i in m) for m in ramps]
    rhi = [max(lab[i][0] for i in m) for m in ramps]

    # Vanilla colour families: area, lightness, mean colour
    fam_area = collections.Counter()
    fam_sum = collections.defaultdict(lambda: [0.0, 0.0, 0.0])
    for u in units:
        if not u["pix"]:
            continue
        f = parts[u["g"]]["fam"]
        for x, y in u["pix"]:
            c = vlab[rows[y][x]]
            fam_area[f] += 1
            s_ = fam_sum[f]
            s_[0] += c[0]
            s_[1] += c[1]
            s_[2] += c[2]
    total_area = sum(fam_area.values()) or 1
    fams = sorted(fam_area)
    fdesc = {}
    for f in fams:
        n = fam_area[f]
        L, a, b = (v / n for v in fam_sum[f])
        fdesc[f] = (n / total_area, L, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360)

    def fcost(f, r):
        area, L, C, Hh = fdesc[f]
        dist = max(0.0, rlo[r] - L, L - rhi[r]) / 100
        wf, wr = min(1.0, C / 10), min(1.0, rhc[r][1] / 8)
        hd_ = math.fabs(((Hh - rhc[r][0] + 180) % 360) - 180) / 180
        return area * (hd_ * wf * wr + 0.3 * max(0.0, wf - wr) + 0.1 * max(0.0, wr - wf) + dist)

    def objective(assign):
        cost = sum(fcost(f, r) for f, r in assign.items())
        ishare = collections.Counter()
        for f, r in assign.items():
            ishare[r] += fdesc[f][0]
        tvd = 0.5 * sum(abs(ishare[k] - bshare[k]) for k in range(len(ramps)))
        return cost + tvd

    def descend(assign):
        best = objective(assign)
        improved = True
        while improved:
            improved = False
            for f in fams:
                for r in range(len(ramps)):
                    if r == assign[f]:
                        continue
                    trial = dict(assign)
                    trial[f] = r
                    o = objective(trial)
                    if o < best - 1e-9:
                        assign, best, improved = trial, o, True
        return assign, best

    def fam_major(key):
        c = collections.defaultdict(collections.Counter)
        for u in units:
            if u["pix"] and u.get(key) is not None and u.get(key, -1) >= 0:
                c[parts[u["g"]]["fam"]][u[key]] += len(u["pix"])
        return c

    share_assign = None
    margin = {}
    if ramps and fams:
        fm, tm = fam_major("fmaj"), fam_major("top")
        starts = [{f: (fm[f].most_common(1)[0][0] if fm[f] else min(range(len(ramps)), key=lambda r: fcost(f, r)))
                   for f in fams},
                  {f: (tm[f].most_common(1)[0][0] if tm[f] else min(range(len(ramps)), key=lambda r: fcost(f, r)))
                   for f in fams},
                  {f: min(range(len(ramps)), key=lambda r: fcost(f, r)) for f in fams}]
        results = [descend(s_) for s_ in starts]
        share_assign, share_obj = min(results, key=lambda t: t[1])
        for f in fams:
            others = []
            for r in range(len(ramps)):
                if r != share_assign[f]:
                    trial = dict(share_assign)
                    trial[f] = r
                    others.append(objective(trial))
            margin[f] = (min(others) - share_obj) if others else 1.0
    # F's icon share per ramp (for the missing-ramp test)
    f_share_ramp = collections.Counter()
    for u in units:
        for x, y in u["pix"]:
            f_share_ramp[ramp_of.get(frows[y][x], -1)] += 1 / total_area

    # Decisions: two witnesses (registration, shares) must agree to leave F; a battle ramp F leaves out entirely
    # (with 8%+ of the battle art) may be taken from the shares alone when they are sure.
    hdec = {}
    for u in units:
        if not u["pix"] or "fmaj" not in u:
            continue
        f = parts[u["g"]]["fam"]
        F_ = u["fmaj"]
        S = share_assign.get(f) if share_assign else None
        Rg = u["top"] if (u["cov"] >= 0.6 and u["purity"] >= 0.5) else None
        n = len(u["pix"])
        if n < DETAIL_PX:
            how, ramp = "detail", F_
        elif S is None or S == F_:
            how, ramp = "keep-share-agrees", F_
        elif Rg == S:
            how, ramp = "reg+share", S
        elif (Rg is None and bshare[S] >= 0.08 and f_share_ramp[S] < 0.02 and margin.get(f, 0) >= 0.03):
            how, ramp = "missing-ramp", S
        elif Rg is not None and Rg != F_:
            how, ramp = "keep-conflict", F_
        else:
            how, ramp = "keep", F_
        hdec[id(u)] = [how, ramp, S, Rg]
    # A family follows its larger parts: small parts of a family whose parts mostly moved take the same ramp
    moved = collections.defaultdict(collections.Counter)
    famn = collections.Counter()
    for u in units:
        d = hdec.get(id(u))
        if d:
            f = parts[u["g"]]["fam"]
            famn[f] += len(u["pix"])
            if d[0] in ("reg+share", "missing-ramp"):
                moved[f][d[1]] += len(u["pix"])
    for u in units:
        d = hdec.get(id(u))
        if not d or d[0] in ("reg+share", "missing-ramp"):
            continue
        f = parts[u["g"]]["fam"]
        if moved[f]:
            r, n = moved[f].most_common(1)[0]
            if n >= 0.5 * famn[f] and d[2] == r:
                d[0], d[1] = "family", r
    # One ramp per family: a family's ramp is the area-weighted choice of its decided parts (>= DETAIL_PX)
    fam_ramp_c = collections.defaultdict(collections.Counter)
    for u in units:
        d = hdec.get(id(u))
        if d and d[0] != "detail" and d[1] is not None and d[1] >= 0:
            fam_ramp_c[parts[u["g"]]["fam"]][d[1]] += len(u["pix"])
    fam_ramp = {f: c.most_common(1)[0][0] for f, c in fam_ramp_c.items()}
    chromatic_fam = {f for f in fams if fdesc[f][2] >= NEUTRAL_C}
    # Details of a coloured family follow the family when F's ramp for them has no battle support under them
    for u in units:
        d = hdec.get(id(u))
        if not d or d[0] != "detail":
            continue
        f = parts[u["g"]]["fam"]
        T = fam_ramp.get(f, share_assign.get(f) if share_assign else None)
        if f not in chromatic_fam or T is None or T == d[1]:
            continue
        votes = collections.Counter()
        for q in u["pix"]:
            votes.update(pvote[q])
        tv = sum(votes.values())
        if (votes.get(d[1], 0) / tv if tv else 0) < 0.2:
            d[0], d[1] = "detail-family", T

    # Shading: one map per (family, ramp) over every part of the family on that ramp, the vanilla lightness order
    # onto the battle colours under them
    MOVED = ("reg+share", "missing-ramp", "family", "detail-family")
    groups_h = collections.defaultdict(list)
    for u in units:
        d = hdec.get(id(u))
        if d and d[1] is not None and d[1] >= 0:
            groups_h[(parts[u["g"]]["fam"], d[1])].append(u)
    hmap = {}

    def family_map(f, r):
        if (f, r) in hmap:
            return hmap[(f, r)]
        counts = collections.Counter()
        iv = collections.Counter()
        for u in groups_h.get((f, r), []):
            for x, y in u["pix"]:
                counts[rows[y][x]] += 1
            iv.update(u["ivotes"])
        levels = sorted(counts, key=lambda v: vlab[v][0])
        tot = sum(iv.values()) or 1
        shades = [i for i, c in iv.items() if ramp_of.get(i) == r and c / tot >= 0.08]
        if len(shades) < min(2, len(levels)):
            shades = list(ramps[r])
        shades.sort(key=lambda i: lab[i][0])
        mapped, _ = shade_dp([(vlab[v][0], counts[v]) for v in levels], shades, lab)
        hmap[(f, r)] = dict(zip(levels, mapped))
        return hmap[(f, r)]

    # Pixels F sent off their part's ramp (a highlight with no shade that light in the ramp, a look-alike speck)
    # come back into it, unless the battle pixels under them support F's ramp; and pixels F put on the right ramp at
    # the wrong lightness (more than 15 L from the vanilla colour when the family's map has one 10 L closer) take
    # the family map's shade
    off = {}
    for u in units:
        d = hdec.get(id(u))
        if not d or d[0] not in ("keep-share-agrees", "keep", "keep-conflict", "detail") or d[1] is None or d[1] < 0:
            continue
        f = parts[u["g"]]["fam"]
        m = family_map(f, d[1])
        for x, y in u["pix"]:
            fr = ramp_of.get(frows[y][x], -1)
            vL = vlab[rows[y][x]][0]
            if fr != d[1]:
                if f not in chromatic_fam:
                    continue
                v = pvote[(x, y)]
                tv = sum(v.values())
                if (v.get(fr, 0) / tv if tv else 0) < 0.3:
                    off[(x, y)] = d[1]
            else:
                dF = abs(lab[frows[y][x]][0] - vL)
                t = m.get(rows[y][x])
                if t is not None and dF > 15 and abs(lab[t][0] - vL) < dF - 10:
                    off[(x, y)] = d[1]

    hgrid = [[0] * 32 for _ in range(64)]
    for u in units:
        d = hdec.get(id(u))
        f = parts[u["g"]]["fam"]
        m = family_map(f, d[1]) if d and d[0] in MOVED else None
        for x, y in u["pix"]:
            if m:
                hgrid[y][x] = m[rows[y][x]]
            elif (x, y) in off:
                hgrid[y][x] = family_map(f, off[(x, y)]).get(rows[y][x], frows[y][x])
            else:
                hgrid[y][x] = frows[y][x]
    for (x, y), kind in opx.items():
        hgrid[y][x] = 0x100 + OUTLINE_GREYS.index(tuple(ipal[rows[y][x]]))
    hcounts = collections.Counter(v for r_ in hgrid for v in r_ if 0 < v < 0x100)
    hlive = sorted(hcounts)
    hgrid = merge_slots(hgrid, hcounts, hlive, lab, ramp_of, flat=False)
    hslot = {v: 1 + n for n, v in enumerate(hlive)}
    hpx = bytes((14 + v - 0x100 if v >= 0x100 else hslot[v]) if v else 0 for r_ in hgrid for v in r_)
    return hpx, hlive


# ---------------------------------------------------------------- I, IH and J (sections 10 and 12)

def hue_of(a, b):
    return math.degrees(math.atan2(b, a)) % 360


def hd(h1, h2):
    return math.fabs(((h1 - h2 + 180) % 360) - 180) / 180


def components(px, wanted):
    """4-connected groups, per 32x32 frame, of pixels whose value is in wanted, each with the value it has."""
    seen = set()
    out = []
    for s in range(2048):
        if px[s] not in wanted or s in seen:
            continue
        v = px[s]
        comp, stack = [], [s]
        seen.add(s)
        while stack:
            i = stack.pop()
            comp.append(i)
            x, y = i % 32, i // 32
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < 32 and 0 <= ny < 64 and ny // 32 == y // 32:
                    j = ny * 32 + nx
                    if j not in seen and px[j] == v:
                        seen.add(j)
                        stack.append(j)
        out.append((v, comp))
    return out


def touches_outside(px, comp):
    for i in comp:
        x, y = i % 32, i // 32
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < 32 and 0 <= ny < 64 and ny // 32 == y // 32) or px[ny * 32 + nx] == 0:
                return True
    return False


def shade(levels, shades, lab, dark, ab):
    """levels: [(vanilla L, count, family)] light order; shades: battle indices sorted by L. Monotone map; two
    colours of one family never share a shade while the ramp has enough shades for the family (two families may);
    dark shades cost a lot for levels >= DARK_FOR."""
    n, m = len(levels), len(shades)
    fam_n = collections.Counter(f for _, _, f in levels)
    strict = m >= max(fam_n.values())
    total = sum(c for _, c, _ in levels) or 1
    best = None
    for shift in range(-24, 25, 4):
        INF = float("inf")
        dp = [[INF] * m for _ in range(n)]
        back = [[0] * m for _ in range(n)]

        def cost(j, s):
            L, c, _ = levels[j]
            pen = 1e5 if (shades[s] in dark and L >= DARK_FOR) else 0
            t = ab[j]
            if t is not None:
                pen += W["ab"] * c * ((t[0] - lab[shades[s]][1]) ** 2 + (t[1] - lab[shades[s]][2]) ** 2)
            return c * (L - shift - lab[shades[s]][0]) ** 2 + pen

        for s in range(m):
            dp[0][s] = cost(0, s)
        for j in range(1, n):
            run = (INF, 0)
            for s in range(m):
                if s > 0 and dp[j - 1][s - 1] < run[0]:
                    run = (dp[j - 1][s - 1], s - 1)
                c = cost(j, s)
                same = levels[j][2] == levels[j - 1][2]
                merged = dp[j - 1][s] + c + ((1e7 if strict else 2000 * min(levels[j][1], levels[j - 1][1])) if same
                                             else 50 * min(levels[j][1], levels[j - 1][1]))
                prev = run[0] + c
                if prev <= merged:
                    dp[j][s], back[j][s] = prev, run[1]
                else:
                    dp[j][s], back[j][s] = merged, s
        s = min(range(m), key=lambda k: dp[n - 1][k])
        tot = dp[n - 1][s] + total * 0.25 * shift * shift
        if best is None or tot < best[0]:
            path = [s]
            for j in range(n - 1, 0, -1):
                s = back[j][s]
                path.append(s)
            path.reverse()
            best = (tot, [shades[k] for k in path], shift)
    return best[1], best[2]


def split_by_shiny(ramps, lab, slab):
    """J (a): a ramp whose members split apart in shiny.pal becomes several ramps."""
    split = []
    for m in ramps:
        cl = []
        for i in sorted(m, key=lambda i: lab[i][0]):
            placed = False
            for c in cl:
                ok = True
                for j in c:
                    ci, cj = chroma(slab[i]), chroma(slab[j])
                    if (ci < 6) != (cj < 6) or (ci >= 6 and hd(hue_of(slab[i][1], slab[i][2]),
                                                              hue_of(slab[j][1], slab[j][2])) * 180 > SHINY_HUE):
                        ok = False
                        break
                if ok:
                    c.append(i)
                    placed = True
                    break
            if not placed:
                cl.append([i])
        split.extend(cl)
    return split


def method_i(job, px, ipal, fpx, hpx, hslots, battle, shiny_aware):
    """IH (shiny_aware False) or J (True): the pixels, slots, ramps and J's family moves."""
    lab = battle.normal_lab
    ramps, ramp_of = build_ramps(battle)
    slab = battle.shiny_lab
    if shiny_aware:
        ramps = split_by_shiny(ramps, lab, slab)
        ramp_of = {i: k for k, m in enumerate(ramps) for i in m}
    boutline = battle.sprite.outline
    single_paths = singles(job)
    single_px = [read_indexed_png(path)[2] for path in single_paths]

    # Outline groups: connected groups of the bank outline greys that touch transparency or the frame's edge
    greys = {i for i in range(16) if tuple(ipal[i]) in OUTLINE_GREYS}
    outline = set()
    for v, comp in components(px, greys):
        if touches_outside(px, comp):
            outline.update(comp)
    inner = [i for i in range(2048) if px[i] and i not in outline]
    used = sorted({px[i] for i in inner})
    fam, vlab = vanilla_families(ipal, used)

    # Battle ramp shares over the front and back frames (battle outline colours left out)
    share_px = collections.Counter()
    for spx in single_px:
        for v in spx:
            if v and v not in boutline and v in ramp_of:
                share_px[ramp_of[v]] += 1
    st = sum(share_px.values()) or 1
    bshare = [share_px[k] / st for k in range(len(ramps))]
    rlo = [min(lab[i][0] for i in m) for m in ramps]
    rhi = [max(lab[i][0] for i in m) for m in ramps]
    rhc = []
    for m in ramps:
        a = b = n = 0.0
        for i in m:
            w = battle.used.get(i, 1)
            a += lab[i][1] * w
            b += lab[i][2] * w
            n += w
        rhc.append((hue_of(a, b), math.hypot(a / n, b / n)))

    # Vanilla families: area, mean colour, F's ramp
    area = collections.Counter()
    sums = collections.defaultdict(lambda: [0.0, 0.0, 0.0])
    fr = collections.defaultdict(collections.Counter)
    for i in inner:
        f = fam[px[i]]
        area[f] += 1
        c = vlab[px[i]]
        for k in range(3):
            sums[f][k] += c[k]
        r = ramp_of.get(fpx[i], -1)
        if r >= 0:
            fr[f][r] += 1
    total = sum(area.values()) or 1
    fams = sorted(area)
    desc = {}
    for f in fams:
        L, a, b = (s / area[f] for s in sums[f])
        desc[f] = (area[f] / total, L, math.hypot(a, b), hue_of(a, b))
    fmaj = {f: (fr[f].most_common(1)[0][0] if fr[f] else None) for f in fams}
    outside = collections.Counter(fam[px[i]] for i in inner if ramp_of.get(fpx[i], -1) < 0)
    keep_f = {f for f in fams if outside[f] >= 0.5 * area[f]}
    fm_c = collections.defaultdict(collections.Counter)
    for i in inner:
        if fpx[i]:
            fm_c[px[i]][fpx[i]] += 1
    fmode = {v: c.most_common(1)[0][0] for v, c in fm_c.items()}

    def fcost(f, r, prior=True):
        ar, L, C, Hh = desc[f]
        wf, wr = min(1.0, C / 10), min(1.0, rhc[r][1] / 8)
        dist = max(0.0, rlo[r] - L, L - rhi[r]) / 100
        h_ = hd(Hh, rhc[r][0])
        c = (W["hue"] * h_ * wf * wr + (5.0 if h_ * 180 > W["hue_limit"] and wf >= 0.5 and wr >= 0.5 else 0.0)
             + W["to_neutral"] * max(0.0, wf - wr)
             + (W["to_colour_white"] if L >= 85 else W["to_colour"]) * max(0.0, wr - wf) + W["light"] * dist
             + (W["f_prior"] + (W["near_hue"] if wf >= 0.5 and rhc[fmaj[f]][1] >= 5 and rhc[r][1] >= 5
                                 and hd(rhc[fmaj[f]][0], rhc[r][0]) * 180 <= W["near_deg"] else 0.0)
                if prior and fmaj[f] is not None and r != fmaj[f] else 0.0))
        return ar * c

    def objective(assign):
        share = collections.Counter()
        cost = 0.0
        for f, r in assign.items():
            cost += fcost(f, r)
            share[r] += desc[f][0]
        return cost + W["tvd"] * 0.5 * sum(abs(share[k] - bshare[k]) for k in range(len(ramps)))

    def descend(assign):
        best = objective(assign)
        improved = True
        while improved:
            improved = False
            for f in fams:
                for r in range(len(ramps)):
                    if r != assign[f]:
                        t = dict(assign)
                        t[f] = r
                        o = objective(t)
                        if o < best - 1e-9:
                            assign, best, improved = t, o, True
        return assign, best

    greedy = {f: min(range(len(ramps)), key=lambda r: fcost(f, r)) for f in fams}
    fstart = {f: (fmaj[f] if fmaj[f] is not None else greedy[f]) for f in fams}
    assign, _ = min((descend(fstart), descend(greedy)), key=lambda t: t[1])

    # IH: each vanilla colour takes the ramp H gave most of its pixels
    hs = [None] + list(hslots)
    hc = collections.defaultdict(collections.Counter)
    for i in inner:
        b = hpx[i]
        if 0 < b < len(hs) and ramp_of.get(hs[b], -1) >= 0:
            hc[px[i]][ramp_of[hs[b]]] += 1
    vramp = {v: (hc[v].most_common(1)[0][0] if hc[v] else assign[fam[v]]) for v in used}

    moves = []
    if shiny_aware:
        # J (b): the shiny-change share as a tie-breaker between plausible ramps
        changed = {i: pr.delta(lab[i], slab[i]) > CHANGE_DE for i in range(len(lab))}
        bt = bc = 0
        for spx in single_px:
            for v in spx:
                if v and v not in boutline:
                    bt += 1
                    bc += changed[v]
        battle_change = bc / (bt or 1)
        rc = []
        for m in ramps:
            w = sum(battle.used.get(i, 0) for i in m) or 1
            rc.append(sum(battle.used.get(i, 0) * changed[i] for i in m) / w)
        fam_v = collections.defaultdict(collections.Counter)
        for i in inner:
            fam_v[fam[px[i]]][vramp[px[i]]] += 1
        R0 = {f: fam_v[f].most_common(1)[0][0] for f in fams if fam_v[f]}

        def change_term(A):
            return abs(sum(desc[f][0] * rc[r] for f, r in A.items()) - battle_change)

        A = dict(R0)
        while True:
            cur = change_term(A)
            best = None
            for f in A:
                base_c = fcost(f, R0[f], False) / (desc[f][0] or 1)
                for r in range(len(ramps)):
                    if r == A[f] or fcost(f, r, False) / (desc[f][0] or 1) - base_c > TIE:
                        continue
                    t = dict(A)
                    t[f] = r
                    g = cur - change_term(t)
                    if g >= MIN_GAIN and (best is None or g > best[0]):
                        best = (g, f, r)
            if best is None:
                break
            A[best[1]] = best[2]
            moves.append([best[1], R0[best[1]], best[2], round(best[0], 3)])
        for f in list(A):
            if A[f] != R0[f]:
                continue
            per = [fcost(f, r, False) / (desc[f][0] or 1) for r in range(len(ramps))]
            b = min(range(len(ramps)), key=lambda r: per[r])
            if per[R0[f]] - per[b] > GAP and abs(rc[R0[f]] - rc[b]) < 0.3:
                A[f] = b
                moves.append([f, R0[f], b, "gap %.2f" % (per[R0[f]] - per[b])])
        moved = {f for f in A if A[f] != R0[f]}
        for v in used:
            if fam[v] in moved:
                vramp[v] = A[fam[v]]

    # Shading: per ramp, every vanilla colour on it in lightness order
    dark = {i for i in battle.used if lab[i][0] < DARK_L} | set(boutline)
    vmap = {}
    per_ramp = collections.defaultdict(collections.Counter)
    for i in inner:
        if fam[px[i]] not in keep_f:
            per_ramp[vramp[px[i]]][px[i]] += 1
    for r, counts in per_ramp.items():
        levels = sorted(counts, key=lambda v: vlab[v][0])
        shades_ = sorted(ramps[r], key=lambda i: lab[i][0])
        ab = [((lab[fmode[v]][1], lab[fmode[v]][2]) if v in fmode and ramp_of.get(fmode[v]) == r else None)
              for v in levels]
        mapped, _ = shade([(vlab[v][0], counts[v], fam[v]) for v in levels], shades_, lab, dark, ab)
        vmap.update(zip(levels, mapped))

    grid = [0] * 2048
    for i in range(2048):
        if not px[i]:
            continue
        if i in outline:
            grid[i] = 0x100 + OUTLINE_GREYS.index(tuple(ipal[px[i]]))
        elif fam[px[i]] in keep_f:
            grid[i] = fmode[px[i]]
        else:
            grid[i] = vmap[px[i]]
    counts = collections.Counter(v for v in grid if 0 < v < 0x100)
    live = sorted(counts)
    grid = merge_slots(grid, counts, live, lab, ramp_of, flat=True)
    slot = {v: 1 + n for n, v in enumerate(live)}
    out = bytes((14 + v - 0x100 if v >= 0x100 else slot[v]) if v else 0 for v in grid)
    assert all(o for v, o in zip(px, out) if v), "a coloured pixel became transparent"
    return dict(pixels=out, slots=live, ramps=ramps, moves=moves)


def swap_most_used(battle, slots):
    """Each wrong twin replaced by the look-alike the battle art uses most (sections 11-12): the new slots and the
    swaps [from, to]."""
    slots = list(slots)
    swaps = []
    for n, t in enumerate(slots):
        alts = [u for u in battle.alike(t) if u != t and battle.used.get(u, 0) > 0
                and pr.delta(battle.shiny_lab[u], battle.shiny_lab[t]) > SHINY_DIFF]
        if alts:
            u = max([t] + alts, key=lambda k: battle.used.get(k, 0))
            if u != t:
                slots[n] = u
                swaps.append([t, u])
    return slots, swaps


def suspects(job, pixels, slots, ramps, battle) -> list[dict]:
    """Section 12's suspects of one icon: A, a battle index that stays the same when shiny (dE <= 15) while its colour
    family (ramp, by battle pixels) mostly changes (>= 60%), or changes while the family mostly does not (<= 40%);
    B, the icon's share of pixels that change when shiny is >= 25 points off the battle sprite's (front + back,
    outline colours left out), its largest parts on the short side."""
    ramp_of = {i: n for n, m in enumerate(ramps) for i in m}
    changed = {i: pr.delta(battle.normal_lab[i], battle.shiny_lab[i]) > CHANGE_DE for i in range(16)}
    counts = collections.Counter(v for v in pixels if 0 < v <= len(slots))
    tot = sum(counts.values()) or 1
    art = Path(job["art"])
    bt = bc = 0
    for name in ("front_single", "back_single"):
        p = art / f"{name}.png"
        if p.is_file():
            for v in read_indexed_png(p)[2]:
                if v and v not in battle.sprite.outline:
                    bt += 1
                    bc += changed[v]
    bchange = bc / (bt or 1)
    ichange = sum(c for s, c in counts.items() if changed[slots[s - 1]]) / tot
    found = []
    for s, n in counts.items():
        t = slots[s - 1]
        m = ramps[ramp_of[t]] if t in ramp_of else [t]
        w = sum(battle.used.get(i, 0) for i in m) or 1
        fc = sum(battle.used.get(i, 0) * changed[i] for i in m) / w
        if not changed[t] and fc >= 0.6:
            found.append(dict(kind="A", px=n, index=t, why=f"index {t} stays while {100 * fc:.0f}% of its family changes"))
        elif changed[t] and fc <= 0.4:
            found.append(dict(kind="A", px=n, index=t, why=f"index {t} changes while only {100 * fc:.0f}% of its family does"))
    if abs(ichange - bchange) >= 0.25:
        short = ichange < bchange
        side = [(n, s) for s, n in counts.items() if changed[slots[s - 1]] != short]
        for n, s in sorted(side, reverse=True)[:3]:
            t = slots[s - 1]
            found.append(dict(kind="B", px=n, index=t, why=f"index {t} {'stays' if short else 'changes'}: icon changes "
                                                             f"{100 * ichange:.0f}%, battle {100 * bchange:.0f}%"))
    return found


# ---------------------------------------------------------------- K (section 14), for the icons flagged to fix by hand

K_TINT_L = 8.0         # a pale tinted battle colour within this lightness of a grey one may take its place
K_MISSING = 0.10       # a battle colour family with this share of the art...
K_ABSENT = 0.02        # ...and under this share of the icon is missing
K_HUE = 60.0           # a family may only move to a missing ramp within this hue (both coloured)
K_DARK = 15.0          # a colour this much darker than its vanilla colour...
K_CLOSER = 8.0         # ...takes a lighter shade of its ramp that is this much closer


def method_k(job, px, ipal, battle, base_px, base_slots):
    """K: the user's pick (IHM or J) of a flagged icon, corrected for the four error classes measured on the flagged
    icons (section 14), each a change of one vanilla colour's battle index, so a connected group of one vanilla index
    stays one colour:

    1. grey for tint: a vanilla colour on a grey/white battle index (chroma < 4) takes the pale tinted colour (chroma
       4-12, within 8 L) the battle art uses at least twice as much;
    2. missing family: a battle colour family with 10% or more of the art (front + back) and under 2% of the icon
       takes the vanilla colour family closest to it in hue (within 60 degrees, or a grey family for a weakly coloured
       ramp) and area, when its old family stays represented; its colours shaded in vanilla lightness order;
    3. collapsed shades: colours of one vanilla family that share one battle index are spread over their ramp again;
    4. too dark: a colour 15 L or more darker than its vanilla colour takes a lighter shade of its ramp 8 L closer,
       keeping the lightness order of the ramp's other colours;

    then the most-used twin swap. Returns the pixels, the slots, the swaps and the changes made."""
    lab = battle.normal_lab
    ramps, ramp_of = build_ramps(battle)
    vlab = {v: oklab(ipal[v]) for v in range(16)}
    used = sorted(set(px) - {0})
    fam, _ = vanilla_families(ipal, used)
    pairs = collections.Counter((px[i], base_slots[base_px[i] - 1]) for i in range(len(px))
                                if 0 < base_px[i] <= len(base_slots))
    total = sum(pairs.values()) or 1
    vmap = {}
    changes = []

    def target(pair):
        return vmap.get(pair, pair[1])

    # 1. grey for tint
    for (v, t), n in sorted(pairs.items()):
        if chroma(lab[t]) >= NEUTRAL_C or n < 6:
            continue
        cands = [u for u in battle.used if 4 <= chroma(lab[u]) <= 12 and abs(lab[u][0] - lab[t][0]) <= K_TINT_L
                 and battle.used[u] >= 2 * battle.used.get(t, 0)]
        if cands:
            u = max(cands, key=lambda k: (battle.used[k], -k))
            vmap[(v, t)] = u
            changes.append(f"grey for tint: vanilla {v} {t}->{u}")

    # 2. missing family
    bcount = collections.Counter()
    for path in singles(job):
        for v in read_indexed_png(path)[2]:
            if v and v not in battle.sprite.outline and v in ramp_of:
                bcount[ramp_of[v]] += 1
    bt = sum(bcount.values()) or 1
    bshare = {r: c / bt for r, c in bcount.items()}

    def ishares():
        out = collections.Counter()
        for pair, n in pairs.items():
            out[ramp_of.get(target(pair), -1)] += n / total
        return out

    def ramp_hue(r):
        a = b = w = 0.0
        for i in ramps[r]:
            k = battle.used.get(i, 1)
            a += lab[i][1] * k
            b += lab[i][2] * k
            w += k
        return hue_of(a, b), math.hypot(a / w, b / w)

    dark = {i for i in battle.used if lab[i][0] < DARK_L} | set(battle.sprite.outline)
    for r in sorted(bshare, key=lambda r: -bshare[r]):
        cur = ishares()
        if bshare[r] < K_MISSING or cur[r] >= K_ABSENT:
            continue
        rh, rc = ramp_hue(r)
        best = None
        fams = collections.defaultdict(list)
        for pair in pairs:
            fams[fam[pair[0]]].append(pair)
        for f, ps in fams.items():
            area = sum(pairs[q] for q in ps) / total
            olds = collections.Counter()
            for q in ps:
                olds[ramp_of.get(target(q), -1)] += pairs[q] / total
            r0 = olds.most_common(1)[0][0]
            if r0 == r or (r0 in bshare and bshare[r0] >= K_MISSING and cur[r0] - area < 0.5 * bshare[r0]):
                continue
            a = sum(vlab[q[0]][1] * pairs[q] for q in ps)
            b = sum(vlab[q[0]][2] * pairs[q] for q in ps)
            fc = math.hypot(a, b) / (sum(pairs[q] for q in ps) or 1)
            if fc >= NEUTRAL_C and rc >= NEUTRAL_C:
                h = hd(hue_of(a, b), rh) * 180
                if h > K_HUE:
                    continue
                cost = h / 180 + abs(area - bshare[r])
            elif fc < NEUTRAL_C and rc < 10:
                cost = 0.3 + abs(area - bshare[r])
            else:
                continue
            if best is None or cost < best[0]:
                best = (cost, f, ps)
        if best is None:
            continue
        _, f, ps = best
        counts = collections.Counter()
        for q in ps:
            counts[q[0]] += pairs[q]
        levels = sorted(counts, key=lambda v: vlab[v][0])
        shades_ = sorted(ramps[r], key=lambda i: lab[i][0])
        mapped, _ = shade([(vlab[v][0], counts[v], f) for v in levels], shades_, lab, dark, [None] * len(levels))
        m = dict(zip(levels, mapped))
        for q in ps:
            vmap[q] = m[q[0]]
        changes.append(f"missing family: vanilla family {f} onto ramp {ramps[r]} ({100 * bshare[r]:.0f}% of the art)")

    # 3. collapsed shades within one family
    groups = collections.defaultdict(set)
    for pair in pairs:
        groups[(fam[pair[0]], target(pair))].add(pair[0])
    for (f, t), vs in sorted(groups.items(), key=lambda kv: str(kv[0])):
        vs = sorted(vs, key=lambda v: vlab[v][0])
        if len(vs) < 2 or vlab[vs[-1]][0] - vlab[vs[0]][0] < 6 or t not in ramp_of:
            continue
        r = ramp_of[t]
        if len(ramps[r]) < len(vs):
            continue
        counts = collections.Counter()
        for pair, n in pairs.items():
            if fam[pair[0]] == f and target(pair) == t:
                counts[pair[0]] += n
        shades_ = sorted(ramps[r], key=lambda i: lab[i][0])
        mapped, _ = shade([(vlab[v][0], counts[v], f) for v in vs], shades_, lab, dark, [None] * len(vs))
        if len(set(mapped)) <= 1:
            continue
        m = dict(zip(vs, mapped))
        for pair in pairs:
            if fam[pair[0]] == f and target(pair) == t:
                vmap[pair] = m[pair[0]]
        changes.append(f"collapsed shades: vanilla {vs} {t}->{[m[v] for v in vs]}")

    # 4. too dark
    for pair in sorted(pairs, key=lambda q: -pairs[q]):
        t = target(pair)
        v = pair[0]
        if t not in ramp_of:
            continue
        gap = vlab[v][0] - lab[t][0]
        if gap < K_DARK:
            continue
        r = ramp_of[t]
        others = [(vlab[q[0]][0], lab[target(q)][0]) for q in pairs if q != pair and ramp_of.get(target(q)) == r]
        best = None
        for u in ramps[r]:
            if lab[u][0] <= lab[t][0] or (u in dark and vlab[v][0] >= DARK_FOR):
                continue
            d = abs(lab[u][0] - vlab[v][0])
            if d > gap - K_CLOSER:
                continue
            if any((Lv > vlab[v][0] and Lt < lab[u][0]) or (Lv < vlab[v][0] and Lt > lab[u][0]) for Lv, Lt in others):
                continue
            if best is None or d < best[0]:
                best = (d, u)
        if best:
            vmap[pair] = best[1]
            changes.append(f"too dark: vanilla {v} {t}->{best[1]}")

    grid = list(base_px)
    for i in range(len(px)):
        b = base_px[i]
        if 0 < b <= len(base_slots):
            grid[i] = 0x100 + target((px[i], base_slots[b - 1]))
    counts = collections.Counter(v - 0x100 for v in grid if v >= 0x100)
    live = sorted(counts)
    while len(live) > BATTLE_SLOTS:  # merge the closest pair on one ramp (not reached so far)
        a, b = min(((a, b) for a in live for b in live if a != b),
                   key=lambda q: counts[q[0]] * pr.delta(lab[q[0]], lab[q[1]]) + (0 if ramp_of.get(q[0]) == ramp_of.get(q[1]) else 1000))
        grid = [0x100 + b if v == 0x100 + a else v for v in grid]
        counts[b] += counts.pop(a)
        live.remove(a)
    slot_of = {v: 1 + n for n, v in enumerate(live)}
    out = bytes(slot_of[v - 0x100] if v >= 0x100 else v for v in grid)
    assert all(o for v, o in zip(px, out) if v), "a coloured pixel became transparent"
    slots, swaps = swap_most_used(battle, live)
    return out, slots, swaps, changes


# ---------------------------------------------------------------- one icon

def run_base(job) -> dict:
    """F, H, IH and J of an icon with its own pixels (every kind but palette_form)."""
    group = Path(job["group"])
    if not (group / "normal.pal").is_file() or not (group / "shiny.pal").is_file():
        return dict(job, error="no normal.pal and shiny.pal")
    if battle_front(job) is None:
        return dict(job, error="no front_single.png")
    px, ipal = load_icon(Path(job["icon"]))
    battle = pr.BattleArt.load(group, Path(job["art"]), job["sexes"])
    fpx = method_f(px, ipal, battle)
    hpx, hslots = method_h(job, px, ipal, fpx, battle)
    ih = method_i(job, px, ipal, fpx, hpx, hslots, battle, False)
    j = method_i(job, px, ipal, fpx, hpx, hslots, battle, True)
    out = dict(job, ih=dict(pixels=ih["pixels"].hex(), slots=ih["slots"], ramps=ih["ramps"]),
               jr=dict(pixels=j["pixels"].hex(), slots=j["slots"], moves=j["moves"]))
    if job.get("extended"):
        g2, g2slots = method_g2(job, px, ipal, fpx, battle)
        out["extra"] = dict(g2=dict(pixels=g2.hex(), slots=g2slots), h=dict(pixels=hpx.hex(), slots=hslots),
                            ih=dict(pixels=ih["pixels"].hex(), slots=ih["slots"]))
    return out


def finish(result) -> dict:
    """The most-used twin swap on IH (IHM) and on J, and the suspects on IHM, with the battle art of the result's
    group (a palette-only form's own palettes on its base's art)."""
    battle = pr.BattleArt.load(Path(result["group"]), Path(result["art"]), result["sexes"])
    ihm_slots, ihm_swaps = swap_most_used(battle, result["ih"]["slots"])
    j_slots, j_swaps = swap_most_used(battle, result["jr"]["slots"])
    ihm_px = bytes.fromhex(result["ih"]["pixels"])
    out = {k: v for k, v in result.items() if k not in ("ih", "jr")}
    out["ihm"] = dict(pixels=result["ih"]["pixels"], slots=ihm_slots, swaps=ihm_swaps)
    out["j"] = dict(pixels=result["jr"]["pixels"], slots=j_slots, swaps=j_swaps, moves=result["jr"]["moves"])
    out["suspects"] = suspects(result, ihm_px, ihm_slots, result["ih"]["ramps"], battle)
    if result.get("extended") and "extra" in result:
        # K starts from the user's pick of IHM and J (k_base_of)
        base = result["k_base"]
        px, ipal = load_icon(Path(result["icon"]))
        kpx, kslots, kswaps, kchanges = method_k(result, px, ipal, battle, bytes.fromhex(out[base]["pixels"]),
                                                 out[base]["slots"])
        out["candidates"] = dict(result["extra"], k=dict(pixels=kpx.hex(), slots=kslots, swaps=kswaps,
                                                         changes=kchanges, base=base))
        out.pop("extra", None)
    return out


def colours(pixels: bytes, slots, palette) -> list:
    """Each pixel's colour through the slots (None for transparency)."""
    pal = [None] + [tuple(palette[v]) for v in slots] + [None] * (13 - len(slots)) + OUTLINE_GREYS
    return [pal[v] if v else None for v in pixels]


def difference(r) -> dict:
    """How much IHM and J differ: the pixels whose normal or shiny colour differs, over the non-outline-grey pixels."""
    vpx, vpal = load_icon(Path(r["icon"]))
    inner = [i for i, v in enumerate(vpx) if v and tuple(vpal[v]) not in OUTLINE_GREYS]
    normal = read_palette(Path(r["group"]) / "normal.pal")
    shiny = read_palette(Path(r["group"]) / "shiny.pal")
    a, b = bytes.fromhex(r["ihm"]["pixels"]), bytes.fromhex(r["j"]["pixels"])
    out = {}
    for name, pal in (("normal", normal), ("shiny", shiny)):
        ca, cb = colours(a, r["ihm"]["slots"], pal), colours(b, r["j"]["slots"], pal)
        out[name] = sum(1 for i in range(len(ca)) if ca[i] != cb[i])
        out[name + "_inner"] = sum(1 for i in inner if ca[i] != cb[i])
    out["differ"] = out["normal"] > 0 or out["shiny"] > 0
    out["frac"] = round(max(out["normal_inner"], out["shiny_inner"]) / (len(inner) or 1), 3)
    return out


def generate(res: Path, names: list[str], out: Path, workers: int = 8, only: set[str] | None = None) -> dict:
    """Runs every icon (or the keys in only, with their palette-only forms) and writes out/."""
    all_jobs = jobs(res / "pokemon", names)
    review = read_choices(res / CHOICES_FILE)
    flagged = set(review["fix_by_hand"])
    extended = extended_keys(review)
    extended_bases = extended | {k.split("_form_")[0] for k in extended}
    for j in all_jobs:
        j["extended"] = j["key"] in extended_bases
    base_jobs = [j for j in all_jobs if j["kind"] != "palette_form" and (not only or j["key"] in only)]
    if workers > 1 and len(base_jobs) > 1:
        with Pool(workers) as pool:
            base = pool.map(run_base, base_jobs, chunksize=2)
    else:
        base = [run_base(j) for j in base_jobs]
    by = {r["key"]: r for r in base}
    results = []
    errors = []
    for j in all_jobs:
        if j["kind"] == "palette_form":
            b = by.get(j["key"].split("_form_")[0])
            if not b or "error" in b:
                continue
            # The base icon's pixels and slots on the form's palettes (its base's art and sexes)
            r = dict(b, **{k: j[k] for k in ("key", "label", "group", "kind")})
        else:
            r = by.get(j["key"])
            if r is None:
                continue
        if "error" in r:
            errors.append(dict(key=r["key"], error=r["error"]))
            continue
        r = dict(r, flagged=r["key"] in flagged, extended=r["key"] in extended)
        if r["extended"]:
            r["k_base"] = k_base_of(review, r["key"], out)
        else:
            r.pop("extra", None)
        results.append(r)
    if workers > 1 and len(results) > 1:
        with Pool(workers) as pool:
            results = pool.map(finish, results, chunksize=4)
    else:
        results = [finish(r) for r in results]

    if out.exists():
        shutil.rmtree(out)
    (out / "icons").mkdir(parents=True)
    index = []
    differ_lines = []
    for r in results:
        d = difference(r)
        write_icon(res, r, out / "icons" / r["key"])
        index.append(dict(key=r["key"], label=r["label"], num=r["num"], kind=r["kind"], differ=d["differ"],
                          differ_frac=d["frac"], differ_px=dict(normal=d["normal"], shiny=d["shiny"]),
                          suspects=[dict(kind=s["kind"], px=s["px"], why=s["why"]) for s in r["suspects"]],
                          suspect_px=sum({s["index"]: s["px"] for s in r["suspects"]}.values()),
                          candidates=sorted(r.get("candidates", {}))))
        if d["differ"]:
            differ_lines.append(f"{r['label']:<7} {r['key']:<24} {100 * d['frac']:5.1f}% of the inner pixels "
                                f"(normal {d['normal']}, shiny {d['shiny']} px)")
    summary = dict(generated=time.strftime("%Y-%m-%d %H:%M:%S"), res=str(res), icons=len(index),
                   differ=sum(1 for e in index if e["differ"]),
                   suspects=sum(1 for e in index if e["suspects"]), errors=errors, entries=index)
    (out / "index.json").write_text(json.dumps(summary, indent=1) + "\n")
    (out / "differ.txt").write_text(f"IHM and J differ on {summary['differ']} of {len(index)} icons "
                                    "(any pixel's normal or shiny colour), in dex order.\n\n"
                                    + "\n".join(differ_lines) + "\n")
    return summary


CHOICES_FILE = Path("paperwhite2") / "icon_remap_choices.json"   # under res/
METHODS = ("ihm", "j", "g2", "h", "ih", "k")


EXTRA_METHODS = ("g2", "h", "ih", "k")


def read_choices(path: Path) -> dict:
    """The user's review: {"choices": {key: method}, "fix_by_hand": [keys], "k_base": {key: "ihm" | "j"}} (empty while
    the file is missing; k_base is optional: the pick K was built from, which the editor records when the user keeps
    one of an icon's extra candidates)."""
    out = {"choices": {}, "fix_by_hand": [], "k_base": {}}
    if path.is_file():
        data = json.loads(path.read_text())
        out["choices"] = {k: v for k, v in (data.get("choices") or {}).items() if v in METHODS}
        out["fix_by_hand"] = [k for k in data.get("fix_by_hand") or [] if isinstance(k, str)]
        out["k_base"] = {k: v for k, v in (data.get("k_base") or {}).items() if v in ("ihm", "j")}
    return out


def extended_keys(review) -> set[str]:
    """The icons that get the extra candidates: those flagged to fix by hand, and those whose choice is one of them
    (so unflagging an icon kept on G2, H, IH or K leaves its candidates)."""
    return set(review["fix_by_hand"]) | {k for k, v in review["choices"].items() if v in EXTRA_METHODS}


def k_base_of(review, key: str, out: Path) -> str:
    """The pick K starts from, so the same review gives the same K: the recorded k_base; else the choice when it is IHM
    or J; else (a choice of G2, H, IH or K from before k_base was recorded) the base of the K the last run wrote to out;
    else IHM."""
    if key in review["k_base"]:
        return review["k_base"][key]
    pick = review["choices"].get(key, "ihm")
    if pick in ("ihm", "j"):
        return pick
    try:
        base = json.loads((out / "icons" / key / "icon.json").read_text())["candidates"]["k"]["base"]
    except (OSError, ValueError, KeyError, TypeError):
        return "ihm"
    return base if base in ("ihm", "j") else "ihm"


def rel(res: Path, path) -> str:
    try:
        return str(Path(path).resolve().relative_to(res.resolve().parent))
    except ValueError:
        return str(path)


def write_icon(res: Path, r, folder: Path):
    folder.mkdir(parents=True)
    vpx, vpal = load_icon(Path(r["icon"]))
    normal = read_palette(Path(r["group"]) / "normal.pal")
    shiny = read_palette(Path(r["group"]) / "shiny.pal")
    hexes = lambda pal: ["#%02x%02x%02x" % tuple(c[:3]) for c in pal]  # noqa: E731
    front = battle_front(r)
    detail = dict(key=r["key"], label=r["label"], num=r["num"], kind=r["kind"], icon=rel(res, r["icon"]),
                  group=rel(res, r["group"]), art=rel(res, r["art"]),
                  vanilla=dict(pixels=vpx.hex(), palette=hexes(vpal[:16])),
                  normal=hexes(normal[:16]), shiny=hexes(shiny[:16]), greys=hexes(OUTLINE_GREYS),
                  ihm=r["ihm"], j=r["j"], suspects=r["suspects"])
    if r.get("candidates"):
        detail["candidates"] = r["candidates"]
    if front:
        w, h, bpx, _ = read_indexed_png(front)
        detail["front"] = dict(width=w, height=h, pixels=bpx.hex(), path=rel(res, front))
    (folder / "icon.json").write_text(json.dumps(detail) + "\n")
    (folder / "vanilla.png").write_bytes(write_indexed_png(32, 64, vpx, vpal[:16]))
    for name in ("ihm", "j"):
        slots = r[name]["slots"]
        pal = [(0, 0, 0)] + [tuple(normal[v]) for v in slots] + [(255, 0, 255)] * (13 - len(slots)) + OUTLINE_GREYS
        (folder / f"{name}.png").write_bytes(write_indexed_png(32, 64, bytes.fromhex(r[name]["pixels"]), pal))


def apply(res: Path, review_dir: Path, force: bool = False, dry_run: bool = False) -> dict:
    """Writes each reviewed icon's chosen candidate (its choice, IHM without one) next to its vanilla art as
    icon_battle.png and icon_battle.json (sprite_edit.py has the format), from the candidates in review_dir; the game
    still builds from icon.png. An icon whose files are already there and differ (fixed by hand since) is left alone
    unless force, whether or not the review marks (res/paperwhite2/sprite_review.json) call it hand-edited: apply
    marks those it keeps ("marked"), and with force unmarks those it overwrites ("unmarked")."""
    from tools.paperwhite2 import sprite_edit
    index_path = review_dir / "index.json"
    if not index_path.is_file():
        raise SystemExit(f"{index_path}: missing; run icon_remap.py generate first")
    index = json.loads(index_path.read_text())
    review = read_choices(res / CHOICES_FILE)
    known = {e["key"] for e in index["entries"]}
    stray = sorted(set(review["choices"]) - known)
    if stray:
        raise SystemExit(f"choices for icons the review doesn't have: {', '.join(stray)}")
    marks = sprite_edit.read_review(res)
    hand = set(marks["icons"]["hand_edited"])
    out = dict(written=[], same=[], kept=[], marked=[], unmarked=[], merged=0, methods=collections.Counter())
    pokemon = res / "pokemon"
    writes = {}
    for entry in index["entries"]:
        key = entry["key"]
        method = review["choices"].get(key, "ihm")
        detail = json.loads((review_dir / "icons" / key / "icon.json").read_text())
        candidate = detail[method] if method in ("ihm", "j") else (detail.get("candidates") or {}).get(method)
        if candidate is None:
            raise SystemExit(f"{key}: chose {method.upper()}, which the review in {review_dir} doesn't have; "
                             "generate again with the same choices file")
        pixels, slots = sprite_edit.canonical(bytes.fromhex(candidate["pixels"]), candidate["slots"])
        out["merged"] += len(slots) != len(candidate["slots"])
        files = sprite_edit.icon_files(pokemon, key, pixels, slots)
        out["methods"][method] += 1
        existing = {p: p.read_bytes() for p in files if p.is_file()}
        if existing and existing == files:
            out["same"].append(key)
        elif existing and not force:
            out["kept"].append(key)
            if key not in hand:
                out["marked"].append(key)
        else:
            out["written"].append(key)
            writes.update(files)
            if key in hand:
                out["unmarked"].append(key)
    # Every icon checked before any is written
    if out["marked"] or out["unmarked"]:
        marks["icons"]["hand_edited"] = sorted((hand | set(out["marked"])) - set(out["unmarked"]))
        writes.update(sprite_edit.review_file(res, marks))
    if not dry_run:
        sprite_edit.write_files(writes)
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    g = sub.add_parser("generate", help="write the review candidates")
    g.add_argument("--res", type=Path, default=ROOT / "res", help="the res/ folder to read (default: this checkout's)")
    g.add_argument("--species", type=Path, default=None, help="species.txt (default: generated/ next to --res)")
    g.add_argument("--out", type=Path, default=ROOT / "build" / "icon_review")
    g.add_argument("-j", "--jobs", type=int, default=max(1, min(8, (os.cpu_count() or 2) - 1)))
    g.add_argument("keys", nargs="*")
    a = sub.add_parser("apply", help="write the chosen icons into res/pokemon as icon_battle.png and .json")
    a.add_argument("--res", type=Path, default=ROOT / "res")
    a.add_argument("--review", type=Path, default=ROOT / "build" / "icon_review", help="generate's output")
    a.add_argument("--force", action="store_true", help="also overwrite icons that differ (fixed by hand)")
    a.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    if args.command == "apply":
        r = apply(args.res, args.review, args.force, args.dry_run)
        methods = ", ".join(f"{m.upper()} {n}" for m, n in sorted(r["methods"].items(), key=lambda x: -x[1]))
        print(f"{'would write' if args.dry_run else 'wrote'} {len(r['written'])} icons, {len(r['same'])} unchanged, "
              f"{len(r['kept'])} kept as they are (they differ: fixed by hand? --force overwrites)"
              f"{': ' + ', '.join(r['kept']) if r['kept'] else ''}; methods {methods}; "
              f"{r['merged']} with a battle index in two slots merged into one"
              + (f"; {len(r['marked'])} newly marked hand-edited" if r["marked"] else "")
              + (f"; {len(r['unmarked'])} no longer hand-edited" if r["unmarked"] else ""))
        return
    species = args.species or args.res.resolve().parent / "generated" / "species.txt"
    names = species_order(species.parent.parent)
    summary = generate(args.res, names, args.out, args.jobs, set(args.keys) or None)
    print(f"{summary['icons']} icons in {args.out}; IHM and J differ on {summary['differ']}; "
          f"{summary['suspects']} with suspects; {len(summary['errors'])} skipped")


if __name__ == "__main__":
    main()
