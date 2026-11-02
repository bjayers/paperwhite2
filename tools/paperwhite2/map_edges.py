"""Paper White 2's map maker: the edges between terrains (docs/paperwhite2/design/map-editor.md, Painting maps).

A style's edge (map_style.schema.json, "edges") is a profile laid along the border of a terrain's tiles, inside them,
as the game lays its own: its paths are three tiles wide, the outer two drawn with michi01a from grass at the border to
path a tile in, and its rivers' banks are their outer tiles, a ridge of dirt down to the water's edge and the bed
sloping away under it. The profile's lines are each an offset in from the border (in tiles) at a lift (in tiles); its
faces lie between two lines, textured along the border (u, the border's length over the repeat; v from one line's to
the other's) or from above (planar, like the ground). The ground inside the last line is the terrain's own.

A step edge (a ledge, a cliff) is painted on the lower tiles along higher ground: its lines marked "from": "outside"
are measured from the higher side's height (drop gives it, in tiles, per border edge), so one profile fits any drop.

The border is followed round each region of the terrain (its tiles and its edge tiles at one height) as loops of tile
edges, with a station at each tile corner. The map maker says which edges are banded: those of an edge tile whose
other side is one of the edge's "from" terrains (any other terrain, when it names none). An edge of a plain tile, to
the same terrain at another height, past the chunk or to a terrain it doesn't name has no band: its lines all lie on the border, at the inside line's lift, and the inside ground runs to it. Where two
edges turn, each line's point is where the two offset edges cross (a mitre). Two things move the lines further in, as
the game's own do:

- round: a convex corner of banded edges is cut round over two tiles each way, each line's points near it moved that
  share of the way to the straight cut across the corner (0.5: the border's corner half a tile in along the
  diagonal, as the game's);
- points: a straight banded border bends half a tile in over three tiles, centred on a tile, every third tile on
  alternating sides, and always across from where another stretch of the terrain meets it (a path's T-junction).

Where the first line leaves the border, the gap between them (a dent) is the ground of the terrain outside, so its
texture runs on unstretched; where the inside line moves in, the tiles it crosses are clipped along it.
"""
import math

EPS = 1e-6


def loops(region):
    """The borders of a set of tiles, as loops of unit tile edges: (start corner, direction, inward normal, the tile
    inside, the tile outside). The inward normal is the direction turned a quarter, so every loop runs the same way."""
    edges = {}
    for (x, z) in region:
        for (ox, oz), start, d in (((x, z - 1), (x, z), (1, 0)), ((x + 1, z), (x + 1, z), (0, 1)),
                                   ((x, z + 1), (x + 1, z + 1), (-1, 0)), ((x - 1, z), (x, z + 1), (0, -1))):
            if (ox, oz) not in region:
                edges.setdefault(start, []).append((start, d, (-d[1], d[0]), (x, z), (ox, oz)))
    out = []
    while edges:
        at = next(iter(edges))
        loop = []
        previous = None
        while at in edges:
            choices = edges[at]
            # Where two loops touch at a corner, turn toward the inside, so each tile's corner stays in one loop
            if previous is not None and len(choices) > 1:
                choices.sort(key=lambda e: 0 if e[1] == previous[2] else 1)
            edge = choices.pop(0)
            if not choices:
                del edges[at]
            loop.append(edge)
            previous = edge
            at = (at[0] + edge[1][0], at[1] + edge[1][1])
        out.append(loop)
    return out


def _mitre(before, after, db, da):
    """Where a line at offsets db (the edge before a corner) and da (the edge after) lies at the corner, from it."""
    nb, na = before[2], after[2]
    if nb == na:  # straight on: the larger offset, so the inside ground keeps to tiles
        d = max(db, da)
        return (nb[0] * d, nb[1] * d)
    if nb == (-na[0], -na[1]):  # back on itself (a one-tile spike)
        return (nb[0] * db, nb[1] * db)
    if after[1] == before[2]:
        # An outward corner is chamfered, as the game's are: each line cuts across the corner tile half as far in as
        # the mitre would reach (the band's inside runs corner to corner of the tile), so the band keeps its width
        return ((nb[0] * db + na[0] * da) / 2, (nb[1] * db + na[1] * da) / 2)
    return (nb[0] * db + na[0] * da, nb[1] * db + na[1] * da)


def _inward(a, b):
    """The inward normal of a border segment from a to b (the direction turned a quarter, as loops run)."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dz) or 1.0
    return (-dz / length, dx / length)


def _inside(point, polygons):
    """Whether a point is inside polygons (even-odd), lists of (x, z)."""
    x, z = point
    inside = False
    for poly in polygons:
        for i, (ax, az) in enumerate(poly):
            bx, bz = poly[(i + 1) % len(poly)]
            if (az > z) != (bz > z) and x < ax + (z - az) * (bx - ax) / (bz - az):
                inside = not inside
    return inside


def _area(poly):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1])) / 2


def _clean(poly):
    """A polygon without repeated points, or points on a straight line between their neighbours."""
    out = []
    for p in poly:
        if not out or abs(p[0] - out[-1][0]) > EPS or abs(p[1] - out[-1][1]) > EPS:
            out.append(p)
    while len(out) > 1 and abs(out[0][0] - out[-1][0]) < EPS and abs(out[0][1] - out[-1][1]) < EPS:
        out.pop()
    changed = True
    while changed and len(out) > 3:
        changed = False
        for i in range(len(out)):
            a, b, c = out[i - 1], out[i], out[(i + 1) % len(out)]
            if abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < EPS:
                out.pop(i)
                changed = True
                break
    return out


def clip_to_tile(poly, tx, tz):
    """A polygon (x, z) clipped to a tile's square (Sutherland-Hodgman, the square being convex)."""
    out = list(poly)
    for axis, limit, keep_below in ((0, tx, False), (0, tx + 1, True), (1, tz, False), (1, tz + 1, True)):
        if not out:
            break
        src, out = out, []
        for i, cur in enumerate(src):
            prev = src[i - 1]
            inside_cur = cur[axis] <= limit + EPS if keep_below else cur[axis] >= limit - EPS
            inside_prev = prev[axis] <= limit + EPS if keep_below else prev[axis] >= limit - EPS
            if inside_cur != inside_prev:
                t = (limit - prev[axis]) / (cur[axis] - prev[axis])
                p = [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]
                p[axis] = limit
                out.append(tuple(p))
            if inside_cur:
                out.append(cur)
    return _clean(out)


def ear_clip(poly):
    """A simple polygon's (x, z) triangles, as index triples (ear clipping)."""
    n = len(poly)
    if n < 3:
        return []
    order = list(range(n)) if _area(poly) > 0 else list(range(n))[::-1]

    def cross(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    out = []
    while len(order) > 3:
        for k in range(len(order)):
            i, j, l = order[k - 1], order[k], order[(k + 1) % len(order)]
            a, b, c = poly[i], poly[j], poly[l]
            if cross(a, b, c) <= EPS:
                continue
            if any(m not in (i, j, l) and cross(a, b, poly[m]) > -EPS and cross(b, c, poly[m]) > -EPS
                   and cross(c, a, poly[m]) > -EPS for m in order):
                continue
            out.append((i, j, l))
            order.pop(k)
            break
        else:
            break  # no ear: a polygon that crosses itself; what is left goes undrawn
    if len(order) == 3:
        out.append(tuple(order))
    return out


def _collinear(a, b, c):
    return all(abs((b[q] - a[q]) * (c[r] - a[r]) - (b[r] - a[r]) * (c[q] - a[q])) < EPS for q, r in ((0, 1), (0, 2), (1, 2)))


def band(region, edge, banded, points, square=lambda tile: False, drop=lambda e: 0.0):
    """A region's edge band, in tiles, a point (x, lift, z), as a dict:

    strips: (face, (start, end) on its first line, (start, end) on its second, (u at the start, u at the end)), u
    along the border in tiles, one per straight run of the border and face;
    dents: (outside tile, [point]), the polygons between the border and a first line that has moved in;
    full: the tiles the terrain's own ground covers whole; pieces: (tile, [(x, z)]), the tiles the inside line
    crosses, clipped to its inside; band_tiles: the region's tiles the band covers; square says which tiles' corners
    aren't rounded;
    outer and inner: the points on the border and on the inside line that ground beside them must be split at."""
    lines = edge["lines"]
    inner = edge.get("inner", len(lines) - 1)
    round_by = edge.get("round", 0.0)
    strips, dents, inner_polys, crossing = [], [], [], []
    outer_points, inner_points = set(), set()
    beside = set()
    for loop in loops(region):
        n = len(loop)
        flags = [banded(e) for e in loop]
        for e, f in zip(loop, flags):
            if f:
                beside.add(e[3])
        straight = lambda i: loop[(i - 1) % n][1] == loop[i % n][1]  # noqa: E731
        # Stations at the loop's corners: each line's offset from the border point there, and its lift
        offsets, lifts = [], []
        for i, e in enumerate(loop):
            before = loop[i - 1]
            offsets.append([_mitre(before, e, ln["offset"] if flags[i - 1] else 0.0, ln["offset"] if flags[i] else 0.0)
                            for ln in lines])
            collapsed = not flags[i - 1] and not flags[i]
            # A line measured from the outside (a ledge's rim) rises with the drop to the higher side there
            rise = max([drop(x) for x, f in ((before, flags[i - 1]), (e, flags[i])) if f] or [0.0])
            lifts.append([lines[inner]["lift"] if collapsed else ln["lift"] + (rise if ln.get("from") == "outside" else 0.0)
                          for ln in lines])
        # Each station's point of each line (x, z), which rounding and bends then move
        pts = [[(e[0][0] + offsets[i][k][0], e[0][1] + offsets[i][k][1]) for k in range(len(lines))] for i, e in enumerate(loop)]
        moved = [False] * n
        # Round convex corners of banded edges with two straight banded tiles either side: each line's points a tile
        # either side of the corner and at it go round_by of the way to the straight cut between its points two tiles
        # either side (a line further in has its corner and the points beside it all at its mitre, so moving each
        # along its own edge would fold it)
        if round_by:
            for i, e in enumerate(loop):
                b = loop[i - 1]
                if e[1] != b[2] or square(e[3]) or not all(flags[(i + k) % n] for k in (-2, -1, 0, 1)):
                    continue
                if not (straight(i - 1) and straight(i + 1)) or any(moved[(i + k) % n] for k in (-2, -1, 0, 1, 2)):
                    continue
                # The border is cut round (round_by of the way to the straight cut between its points two tiles either
                # side); every other line follows it at its own offset, a constant width from it, so the band is as
                # wide across the corner as along its sides and its texture isn't stretched (a chamfer, the game's)
                border = [pts[(i + j) % n][0] for j in range(-2, 3)]
                a0, a1 = border[0], border[4]
                for j in (1, 2, 3):
                    f = j / 4
                    cut = (a0[0] + (a1[0] - a0[0]) * f, a0[1] + (a1[1] - a0[1]) * f)
                    old = border[j]
                    border[j] = (old[0] + (cut[0] - old[0]) * round_by, old[1] + (cut[1] - old[1]) * round_by)
                base = lines[0]["offset"]
                for j in (1, 2, 3):
                    prev, at, nxt = border[j - 1], border[j], border[j + 1]
                    n1, n2 = _inward(prev, at), _inward(at, nxt)
                    scale = 1 + n1[0] * n2[0] + n1[1] * n2[1]
                    miter = ((n1[0] + n2[0]) / scale, (n1[1] + n2[1]) / scale) if scale > EPS else n1
                    station = (i + j - 2) % n
                    for k, ln in enumerate(lines):
                        d = ln["offset"] - base
                        pts[station][k] = (at[0] + miter[0] * d, at[1] + miter[1] * d)
                    moved[station] = True
        # Bends: across from another stretch of the region first (a T), then every third tile on alternating sides
        mids = {}

        def can_bend(i, gap):
            if not all(flags[(i + k) % n] for k in (-1, 0, 1)) or not (straight(i) and straight(i + 1)):
                return False
            if any(moved[(i + k) % n] for k in range(-gap, gap + 2)) or any((i + k) % n in mids for k in range(-gap - 2, gap + 3)):
                return False
            # Over three tiles of the region, two tiles deep at least
            for k in (-1, 0, 1):
                t, nn = loop[(i + k) % n][3], loop[(i + k) % n][2]
                if (t[0] + nn[0], t[1] + nn[1]) not in region or (t[0] + 2 * nn[0], t[1] + 2 * nn[1]) not in region:
                    return False
            return True

        def bend(i):
            e = loop[i % n]
            mx, mz = e[0][0] + e[1][0] * 0.5, e[0][1] + e[1][1] * 0.5
            mids[i % n] = [(mx + e[2][0] * (ln["offset"] + 0.5), mz + e[2][1] * (ln["offset"] + 0.5)) for ln in lines]
            # Straight from the ends to the tip: a tile from an end, two thirds of the way in
            for j in (i % n, (i + 1) % n):
                pts[j] = [(p[0] + e[2][0] / 3, p[1] + e[2][1] / 3) for p in pts[j]]
                moved[j] = True
        if points:
            across = [flags[i] and all((e[3][0] + k * e[2][0], e[3][1] + k * e[2][1]) in region for k in (1, 2, 3))
                      for i, e in enumerate(loop)]
            for i in range(n):
                if across[i] and not (across[i - 1] and loop[i - 1][1] == loop[i][1]):
                    j = i
                    while across[(j + 1) % n] and loop[(j + 1) % n][1] == loop[i][1] and j - i < n:
                        j += 1
                    if (j - i) % 2 == 0 and can_bend((i + j) // 2, 0):
                        bend((i + j) // 2)
            for i, e in enumerate(loop):
                along = e[3][0] if e[1][0] else e[3][1]
                if (along + (0 if e[2][0] + e[2][1] > 0 else 3)) % 6 == 1 and can_bend(i, 2):
                    bend(i)
        # The stations in order, bends' middles among them, with each line's point (x, z) and lift
        seq = []
        for i, e in enumerate(loop):
            seq.append({"s": float(i), "border": e[0], "pts": pts[i], "lift": lifts[i], "edge": i})
            if i in mids:
                seq.append({"s": i + 0.5, "mid": True, "border": (e[0][0] + e[1][0] * 0.5, e[0][1] + e[1][1] * 0.5), "pts": mids[i],
                            "lift": [ln["lift"] + (drop(e) if ln.get("from") == "outside" else 0.0) for ln in lines], "edge": i})
        m = len(seq)
        # u by length along the border line (line 0), so a chamfered corner's diagonal isn't stretched (the game's
        # edge textures run at one repeat a tile round corners too)
        # (a bend's sides keep a repeat a tile, stretched along them, as the game's points do)
        run = [0.0]
        for j in range(1, m + 1):
            sa, sb = seq[j - 1], seq[j % m]
            step = (sb["s"] - sa["s"]) % n or n
            if sa.get("mid") or sb.get("mid"):
                run.append(run[-1] + step)
            else:
                a, b = sa["pts"][0], sb["pts"][0]
                run.append(run[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        for j, st in enumerate(seq):
            st["u"] = run[j]
        loop_length = run[m]

        def p3(st, k):
            return (st["pts"][k][0], st["lift"][k], st["pts"][k][1])
        inner_polys.append([st["pts"][inner] for st in seq])
        # Strips: runs along which every line goes straight on, banded or not alike
        starts = [j for j in range(m) if flags[seq[j - 1]["edge"]] != flags[seq[j]["edge"]]
                  or not all(_collinear(p3(seq[j - 1], k), p3(seq[j], k), p3(seq[(j + 1) % m], k)) for k in range(len(lines)))]
        if not starts:
            starts = [0]
        for r, j in enumerate(starts):
            a, b = seq[j], seq[starts[(r + 1) % len(starts)]]
            end = starts[(r + 1) % len(starts)]
            ua, ub = a["u"], b["u"] if end > j else b["u"] + loop_length
            outer_points.add(p3(a, 0))
            inner_points.add(p3(a, inner))
            for face in edge["faces"]:
                k0, k1 = face["between"]
                strips.append((face, (p3(a, k0), p3(b, k0)), (p3(a, k1), p3(b, k1)), (ua, ub)))
        # Dents: where the first line has moved off the border, the outside's ground fills the gap
        off = [abs(st["pts"][0][0] - st["border"][0]) > EPS or abs(st["pts"][0][1] - st["border"][1]) > EPS for st in seq]
        for j in range(m):
            if not off[j] or off[j - 1]:
                continue
            span = [seq[j - 1]]
            k = j
            while off[k % m] and len(span) <= m:
                span.append(seq[k % m])
                k += 1
            span.append(seq[k % m])
            lift0 = max(st["lift"][0] for st in span)
            poly = [(st["border"][0], lift0, st["border"][1]) for st in span]
            poly += [(st["pts"][0][0], lift0, st["pts"][0][1]) for st in reversed(span[1:-1])]
            outer_points.update(poly)
            dents.append((loop[span[1]["edge"]][4], poly))
        # The inside line's segments off the tile grid (bends, rounded corners): their tiles are clipped
        for j in range(m):
            a, b = seq[j]["pts"][inner], seq[(j + 1) % m]["pts"][inner]
            on_grid = ((abs(a[0] - b[0]) < EPS and abs(a[0] - round(a[0])) < EPS)
                       or (abs(a[1] - b[1]) < EPS and abs(a[1] - round(a[1])) < EPS))
            if not on_grid:
                crossing.append((a, b, len(inner_polys) - 1))
    # The tiles inside: whole where their middle is inside the inside line and no off-grid segment touches them, else
    # clipped to it; never one beside a banded edge
    touched = {}
    for a, b, poly_index in crossing:
        for tx in range(math.floor(min(a[0], b[0]) + EPS), math.ceil(max(a[0], b[0]) - EPS)):
            for tz in range(math.floor(min(a[1], b[1]) + EPS), math.ceil(max(a[1], b[1]) - EPS)):
                touched.setdefault((tx, tz), poly_index)
    full, pieces = set(), []
    for t in region:
        if t in beside:
            continue
        if t in touched:
            piece = clip_to_tile(inner_polys[touched[t]], t[0], t[1])
            area = abs(_area(piece)) if len(piece) >= 3 else 0.0
            if area > 1 - 1e-4:
                full.add(t)
            elif area > 1e-4:
                pieces.append((t, piece))
        elif _inside((t[0] + 0.5, t[1] + 0.5), inner_polys):
            full.add(t)
    covered = full | {t for t, _ in pieces}
    return {"strips": strips, "dents": dents, "full": full, "pieces": pieces, "band_tiles": region - covered,
            "outer": outer_points, "inner": inner_points}


def triangle(a, b, c):
    """A triangle of (point, uv) as (corners, normal), its normal up, or None where it has no area."""
    e1 = [b[0][k] - a[0][k] for k in range(3)]
    e2 = [c[0][k] - a[0][k] for k in range(3)]
    n = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
    length = math.sqrt(sum(v * v for v in n))
    if length < EPS:
        return None
    if n[1] < 0:
        b, c = c, b
        n = tuple(-v for v in n)
    return [a, b, c], tuple(v / length for v in n)


def strip_triangles(side_a, side_b):
    """The triangles between two lines, each a list of (point, uv, t) in order along them (t from 0 to 1): a zigzag that
    takes every point of both, so the strip meets what lies beside it at each. Each is (corners, normal)."""
    out = []
    i = j = 0
    while i < len(side_a) - 1 or j < len(side_b) - 1:
        if j == len(side_b) - 1 or (i < len(side_a) - 1 and side_a[i + 1][2] <= side_b[j + 1][2]):
            tri = (side_a[i], side_a[i + 1], side_b[j])
            i += 1
        else:
            tri = (side_a[i], side_b[j + 1], side_b[j])
            j += 1
        made = triangle(*[(p, uv) for p, uv, _ in tri])
        if made:
            out.append(made)
    return out
