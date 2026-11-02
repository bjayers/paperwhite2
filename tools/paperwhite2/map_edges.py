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
    if after[1] == before[2] and db > 0 and da > 0:
        # An outward corner banded on both sides is chamfered, as the game's are: each line cuts across the corner
        # tile half as far in as the mitre would reach (the band's inside runs corner to corner of the tile), so the
        # band keeps its width
        return ((nb[0] * db + na[0] * da) / 2, (nb[1] * db + na[1] * da) / 2)
    return (nb[0] * db + na[0] * da, nb[1] * db + na[1] * da)


def _crossing(a, b, c, d):
    """Where segment a-b crosses segment c-d (points (x, z)), or None."""
    r = (b[0] - a[0], b[1] - a[1])
    q = (d[0] - c[0], d[1] - c[1])
    den = r[0] * q[1] - r[1] * q[0]
    if abs(den) < 1e-12:
        return None
    t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den
    u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
    if -EPS <= t <= 1 + EPS and -EPS <= u <= 1 + EPS:
        return (a[0] + r[0] * t, a[1] + r[1] * t)
    return None


def _side(corner, point, end):
    """Whether point lies on the side from corner to end (within it)."""
    return (abs((point[0] - corner[0]) * (end[1] - corner[1]) - (point[1] - corner[1]) * (end[0] - corner[0])) < 1e-6
            and min(corner[0], end[0]) - EPS <= point[0] <= max(corner[0], end[0]) + EPS
            and min(corner[1], end[1]) - EPS <= point[1] <= max(corner[1], end[1]) + EPS)


def _outside_of(poly, tile):
    """A simple polygon covering what lies outside poly near a tile: a box far round it, joined to poly by a bridge of
    no width from poly's vertex farthest from the tile (so the bridge never crosses the tile) and back."""
    xs, zs = [p[0] for p in poly] + [tile[0]], [p[1] for p in poly] + [tile[1]]
    x0, z0, x1, z1 = min(xs) - 4, min(zs) - 4, max(xs) + 5, max(zs) + 5
    cx, cz = tile[0] + 0.5, tile[1] + 0.5
    j = max(range(len(poly)), key=lambda k: (poly[k][0] - cx) ** 2 + (poly[k][1] - cz) ** 2)
    # The box's corner nearest that vertex starts it, and the hole runs the other way round from the box
    box = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    b = min(range(4), key=lambda k: (box[k][0] - poly[j][0]) ** 2 + (box[k][1] - poly[j][1]) ** 2)
    box = box[b:] + box[:b]
    ring = poly[j:] + poly[:j]
    if (_area(box) > 0) == (_area(ring) > 0):
        ring = [ring[0]] + ring[1:][::-1]
    return box + [box[0], ring[0]] + ring[1:] + [ring[0], box[0]]


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


# Corners as the game builds them (Route 20's paths and river banks, the atlas; design/map-reader.md, Corners):
# - convex (the region's corner, a path turning): each line turns at one point, CORNER_IN plus CORNER_SCALE of its
#   offset in along the diagonal from the border's corner (the border half a tile in, a line a tile in 1.25), straight
#   from the stations a tile either side; u mirrors there, so the texture's own shape rounds the corner;
# - reflex (the region round a corner of the outside, a T's corners): the border's corner stays square, and each other
#   line cuts straight across it, from its offset in on one side to the same on the other; a triangle fills the
#   corner, its texture fanning across it.
CORNER_IN = 0.5
CORNER_SCALE = 0.75


def band(region, edge, banded, points, square=lambda tile: False, drop=lambda e: 0.0, carvable=lambda tile: False):
    """A region's edge band, in tiles, a point (x, lift, z), as a dict:

    strips: (face, (start, end) on its first line, (start, end) on its second, (u at the start, u at the end), the
    tile outside the run), u along the border in tiles, one per straight run of the border and face;
    dents: (outside tile, [point]), the polygons between the border and a first line that has moved in;
    full: the tiles the terrain's own ground covers whole; pieces: (tile, [(x, z)]), the tiles the inside line
    crosses, clipped to its inside; band_tiles: the region's tiles the band covers; square says which tiles' corners
    aren't rounded;
    outer and inner: the points on the border and on the inside line that ground beside them must be split at;
    carved: (tile, [(x, z)]), outside tiles a corner reaches into, as what's left of them: none, as corners stay in their
    tiles (carvable is kept for callers)."""
    lines = edge["lines"]
    inner = edge.get("inner", len(lines) - 1)
    strips, dents, inner_polys, crossing = [], [], [], []
    carved = []
    holes = []
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
        outward = set()
        for i, e in enumerate(loop):
            before = loop[i - 1]
            nb, na = before[2], e[2]
            nsum = (nb[0] + na[0], nb[1] + na[1])
            base = lines[0]["offset"]
            if e[1] == nb and flags[i - 1] and flags[i] and not square(e[3]):
                # Convex: one point per line, pulled in along the diagonal
                offsets.append([(nsum[0] * (CORNER_IN + CORNER_SCALE * (ln["offset"] - base)) + nsum[0] * base,
                                 nsum[1] * (CORNER_IN + CORNER_SCALE * (ln["offset"] - base)) + nsum[1] * base) for ln in lines])
                outward.add(i)
            else:
                offsets.append([_mitre(before, e, ln["offset"] if flags[i - 1] else 0.0, ln["offset"] if flags[i] else 0.0)
                                for ln in lines])
            collapsed = not flags[i - 1] and not flags[i]
            # A line measured from the outside (a ledge's rim) rises with the drop to the higher side there
            rise = max([drop(x) for x, f in ((before, flags[i - 1]), (e, flags[i])) if f] or [0.0])
            lifts.append([lines[inner]["lift"] if collapsed else ln["lift"] + (rise if ln.get("from") == "outside" else 0.0)
                          for ln in lines])
        # Each station's point of each line (x, z), which rounding and bends then move
        pts = [[(e[0][0] + offsets[i][k][0], e[0][1] + offsets[i][k][1]) for k in range(len(lines))] for i, e in enumerate(loop)]
        moved = [i in outward for i in range(n)]  # (a convex corner turned: no bend beside it)
        # A convex corner's sides run straight to its points from two tiles back (the station a tile back moves onto
        # that line, which the corner's points, further in than its mitre, would otherwise fold back past), or, along
        # a side of three tiles or less to another convex corner (a path's end), straight between the two
        for i in sorted(outward):
            for way in (-1, 1):
                run = []
                j = i
                while len(run) < n:
                    edge_index = j if way > 0 else (j - 1) % n
                    if not flags[edge_index]:
                        break
                    j = (j + way) % n
                    run.append(j)
                    if j in outward or not straight(j):
                        break
                if not run:
                    continue
                end = run[-1]
                if end in outward and len(run) <= 3:
                    for d, j in enumerate(run[:-1], 1):
                        f = d / len(run)
                        pts[j] = [(pts[i][k][0] + (pts[end][k][0] - pts[i][k][0]) * f, pts[i][k][1] + (pts[end][k][1] - pts[i][k][1]) * f)
                                  for k in range(len(lines))]
                        moved[j] = True
                elif len(run) >= 2 and not moved[run[0]]:
                    j, far = run[0], run[1]
                    pts[j] = [((pts[i][k][0] + pts[far][k][0]) / 2, (pts[i][k][1] + pts[far][k][1]) / 2) for k in range(len(lines))]
                    moved[j] = True
        # Reflex corners: two stations on the border's corner, each with the other lines' points a side's offset in
        splits = {}
        for i, e in enumerate(loop):
            b = loop[i - 1]
            if e[1] != (-b[2][0], -b[2][1]) or square(e[3]) or not (flags[i - 1] and flags[i]) or moved[i]:
                continue
            nb, na = b[2], e[2]
            splits[i] = ([(e[0][0] + nb[0] * ln["offset"], e[0][1] + nb[1] * ln["offset"]) for ln in lines],
                         [(e[0][0] + na[0] * ln["offset"], e[0][1] + na[1] * ln["offset"]) for ln in lines])
            moved[i] = True
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
            if i in splits:
                before, after = splits[i]
                seq.append({"s": i - 0.01, "border": e[0], "pts": before, "lift": lifts[i], "edge": (i - 1) % n, "split": True})
                seq.append({"s": float(i), "border": e[0], "pts": after, "lift": lifts[i], "edge": i})
            else:
                seq.append({"s": float(i), "border": e[0], "pts": pts[i], "lift": lifts[i], "edge": i, "outward": i in outward})
            if i in mids:
                seq.append({"s": i + 0.5, "mid": True, "border": (e[0][0] + e[1][0] * 0.5, e[0][1] + e[1][1] * 0.5), "pts": mids[i],
                            "lift": [ln["lift"] + (drop(e) if ln.get("from") == "outside" else 0.0) for ln in lines], "edge": i})
        m = len(seq)
        # u by length along the border line (line 0), so a chamfered corner's diagonal isn't stretched (the game's
        # edge textures run at one repeat a tile round corners too)
        # (a bend's sides keep a repeat a tile, stretched along them, as the game's points do)
        # (and turning back at each inward corner: the texture mirrors there, as the game's does)
        run = [0.0]
        way = 1.0
        for j in range(1, m + 1):
            sa, sb = seq[j - 1], seq[j % m]
            if sa.get("outward"):
                way = -way
            step = (sb["s"] - sa["s"]) % n or n
            if sa.get("split"):
                run.append(run[-1] + way)  # (a rounded corner's fan: a repeat across it, as the game's)
            elif sa.get("mid") or sb.get("mid"):
                run.append(run[-1] + way * step)
            else:
                a, b = sa["pts"][0], sb["pts"][0]
                run.append(run[-1] + way * math.hypot(b[0] - a[0], b[1] - a[1]))
        for j, st in enumerate(seq):
            st["u"] = run[j]
        loop_length = run[m]

        def p3(st, k):
            return (st["pts"][k][0], st["lift"][k], st["pts"][k][1])
        inner_polys.append([st["pts"][inner] for st in seq])
        # A hole of the region (an island in a pond): its loop's own tiles lie outside its corners' polygon
        first = loop[0]
        holes.append(not _inside((first[3][0] + 0.5, first[3][1] + 0.5), [[e[0] for e in loop]]))
        # Strips: runs along which every line goes straight on, banded or not alike
        starts = [j for j in range(m) if flags[seq[j - 1]["edge"]] != flags[seq[j]["edge"]]
                  or not all(_collinear(p3(seq[j - 1], k), p3(seq[j], k), p3(seq[(j + 1) % m], k)) for k in range(len(lines)))]
        if not starts:
            starts = [0]
        for r, j in enumerate(starts):
            a, b = seq[j], seq[starts[(r + 1) % len(starts)]]
            end = starts[(r + 1) % len(starts)]
            ua, ub = a["u"], b["u"] if end > j else loop_length
            outer_points.add(p3(a, 0))
            inner_points.add(p3(a, inner))
            for face in edge["faces"]:
                k0, k1 = face["between"]
                # Not a face along a border that isn't banded which covers nothing from above (the end of a bank
                # against the game's own: its lines join a banded run's full profile to collapsed ones, a wedge
                # standing up)
                if not flags[a["edge"]] and abs(_area([a["pts"][k0], b["pts"][k0], b["pts"][k1], a["pts"][k1]])) < 1e-3:
                    continue
                strips.append((face, (p3(a, k0), p3(b, k0)), (p3(a, k1), p3(b, k1)), (ua, ub), loop[a["edge"]][4]))
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
        if t in beside and t not in touched:  # (an inward chamfer cuts its inside line into edge tiles)
            continue
        if t in touched:
            poly = inner_polys[touched[t]]
            # A hole's inside line: the tile's part outside it, clipped from a box round the hole joined to it
            piece = clip_to_tile(_outside_of(poly, t) if holes[touched[t]] else poly, t[0], t[1])
            area = abs(_area(piece)) if len(piece) >= 3 else 0.0
            if area > 1 - 1e-4:
                full.add(t)
            elif area > 1e-4:
                pieces.append((t, piece))
        elif _inside((t[0] + 0.5, t[1] + 0.5), inner_polys):
            full.add(t)
    covered = full | {t for t, _ in pieces}
    return {"strips": strips, "dents": dents, "full": full, "pieces": pieces, "band_tiles": region - covered,
            "outer": outer_points, "inner": inner_points, "carved": carved}


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
    takes every point of both, so the strip meets what lies beside it at each. Where both lines step together, each
    step's two triangles are written (a, b, c) then (a, c, d), facing up, which the model writer draws as one quad (the
    DS counts a quad as one polygon). Each is (corners, normal)."""
    out = []
    i = j = 0
    while i < len(side_a) - 1 or j < len(side_b) - 1:
        if i < len(side_a) - 1 and j < len(side_b) - 1 and abs(side_a[i + 1][2] - side_b[j + 1][2]) < 1e-6:
            a, b, c, d = side_a[i], side_a[i + 1], side_b[j + 1], side_b[j]
            quad = _quad(a, b, c, d)
            if quad:
                out += quad
                i += 1
                j += 1
                continue
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


def _quad(a, b, c, d):
    """Two triangles (a, b, c) and (a, c, d), turned so they face up, or None where either has no area."""
    first = triangle((a[0], a[1]), (b[0], b[1]), (c[0], c[1]))
    second = triangle((a[0], a[1]), (c[0], c[1]), (d[0], d[1]))
    if not first or not second:
        return None
    if first[0][1][0] != b[0]:
        # (it was turned: the other way round, so the shared diagonal still runs a-c)
        first = triangle((a[0], a[1]), (d[0], d[1]), (c[0], c[1]))
        second = triangle((a[0], a[1]), (c[0], c[1]), (b[0], b[1]))
        if not first or not second:
            return None
    return [first, second]