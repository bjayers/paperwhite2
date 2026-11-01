"""Paper White 2's map maker: the edges between terrains (docs/paperwhite2/design/map-editor.md, Painting maps).

A style's edge (map_style.schema.json, "edges") is a profile laid along the border of a terrain's tiles, inside them,
as the game lays its own: its paths are three tiles wide, the outer two drawn with michi01a from grass at the border to
path a tile in, and its rivers' banks are their outer tiles, a ridge of dirt down to the water's edge and the bed
sloping away under it. The profile's lines are each an offset in from the border (in tiles) at a lift (in tiles); its
faces lie between two lines, textured along the border (u, the border's length over the repeat; v from one line's to
the other's) or from above (planar, like the ground). The ground inside the last line is the terrain's own.

The border is followed round each region of the terrain (its tiles at one height) as loops of tile edges. An edge
whose other side is one of the edge's "from" terrains (any other terrain, when it names none) is banded; an edge to
the same terrain at another height, past the chunk or to a terrain it doesn't name has no band: its lines all lie on
the border, and the inside ground runs to it. Where two edges turn, each line's point is where the two offset edges
cross (a mitre). With points, a straight border bends half a tile inward at every third tile, alternating sides, as
the game's paths do.
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
        start = next(iter(edges))
        loop = []
        at = start
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


def _corner_offset(before, after, db, da):
    """Where a line at offsets db (the edge before the corner) and da (the edge after) lies at the corner between."""
    (nb, na) = before[2], after[2]
    if nb == na:  # straight on: the larger offset, so the inside ground keeps to tiles
        d = max(db, da)
        return (nb[0] * d, nb[1] * d)
    if nb == (-na[0], -na[1]):  # back on itself (a one-tile spike)
        return (nb[0] * db, nb[1] * db)
    return (nb[0] * db + na[0] * da, nb[1] * db + na[1] * da)


def _inside(point, polylines):
    """Whether a point is inside polygons (even-odd), given as lists of (x, z)."""
    x, z = point
    inside = False
    for poly in polylines:
        for i, (ax, az) in enumerate(poly):
            bx, bz = poly[(i + 1) % len(poly)]
            if (az > z) != (bz > z) and x < ax + (z - az) * (bx - ax) / (bz - az):
                inside = not inside
    return inside


def _triangle(a, b, c):
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


def band(region, edge, banded, bumps_on):
    """A region's edge band: (strips, dents, interior, band tiles, bump tiles, outer points, inner points), all in
    tiles, a point (x, lift, z).

    strips: (face, (start, end) on its first line, (start, end) on its second, (u at the start, u at the end)), u along
    the border in tiles, one per straight run of the border and face; dents: (face, [(point, u)] * 3), the triangle
    between the border and a bend, at the face's first v; interior: the tiles the terrain's own ground covers; bump_tiles: interior tiles a bend pokes into, each with its tip, which the ground draws round; outer
    and inner: the points on the border and on the inside line, which the ground's edges there are split at."""
    lines = edge["lines"]
    inner = edge.get("inner", len(lines) - 1)
    all_loops = loops(region)
    faces = []
    outer_points, inner_points = set(), set()
    inner_polys = []
    bands_drawn = []
    for loop in all_loops:
        flags = [banded(e) for e in loop]
        n = len(loop)
        # Each loop vertex: its corner and, per line, its offset (the vertex before edge i)
        vertices = []
        for i, e in enumerate(loop):
            before = loop[i - 1]
            offsets = []
            for line in lines:
                db = line["offset"] if flags[i - 1] else 0.0
                da = line["offset"] if flags[i] else 0.0
                offsets.append(_corner_offset(before, e, db, da))
            vertices.append((e[0], offsets))
        inner_polys.append([(c[0] + o[inner][0], c[1] + o[inner][1]) for c, o in vertices])
        bands_drawn.append((loop, flags, vertices))
    interior = {t for t in region if _inside((t[0] + 0.5, t[1] + 0.5), inner_polys)}
    # Never across a banded edge: a region too narrow for its band has none inside
    for loop, flags, _ in bands_drawn:
        for e, f in zip(loop, flags):
            if f:
                interior.discard(e[3])
    bump_tiles = {}
    strips, dents = [], []
    for loop, flags, vertices in bands_drawn:
        n = len(loop)
        point = lambda i, k: (vertices[i % n][0][0] + vertices[i % n][1][k][0], lines[k]["lift"],  # noqa: E731
                              vertices[i % n][0][1] + vertices[i % n][1][k][1])
        # Bends first: halfway along a straight banded edge, every third tile, alternating sides
        bumps = {}
        for i, e in enumerate(loop):
            nx, nz = e[2]
            if bumps_on and flags[i] and flags[i - 1] and flags[(i + 1) % n] and loop[i - 1][1] == e[1] == loop[(i + 1) % n][1]:
                along = e[3][0] if e[1][0] else e[3][1]
                behind = (e[3][0] + nx, e[3][1] + nz)
                if (along + (0 if nx + nz > 0 else 3)) % 6 == 1 and behind in interior and behind not in bump_tiles:
                    mx, mz = e[0][0] + e[1][0] * 0.5, e[0][1] + e[1][1] * 0.5
                    bumps[i] = [(mx + nx * (line["offset"] + 0.5), line["lift"], mz + nz * (line["offset"] + 0.5)) for line in lines]
                    bump_tiles[behind] = (bumps[i][inner], (nx, nz))
        # Runs of edges that go straight on, banded or not alike, with no bend: one strip per face each
        starts = [i for i in range(n) if i in bumps or (i - 1) % n in bumps or loop[i - 1][1] != loop[i][1] or flags[i - 1] != flags[i]]
        if not starts:
            starts = [0]
        u = [0.0] * (n + 1)
        for i in range(n):
            u[i + 1] = u[i] + 1.0
        for r, i in enumerate(starts):
            j = starts[(r + 1) % len(starts)]
            if j <= i:
                j += n
            outer_points.add(point(i, 0))
            inner_points.add(point(i, inner))
            if i in bumps:
                mid = bumps[i]
                halves = [(lambda k, i=i: point(i, k), u[i], lambda k, mid=mid: mid[k], u[i] + 0.5),
                          (lambda k, mid=mid: mid[k], u[i] + 0.5, lambda k, i=i: point(i + 1, k), u[i] + 1.0)]
                dents.append((edge["faces"][0], [(point(i, 0), u[i]), (point(i + 1, 0), u[i] + 1.0), (mid[0], u[i] + 0.5)]))
            else:
                end_u = u[i] + (j - i)
                halves = [(lambda k, i=i: point(i, k), u[i], lambda k, j=j: point(j, k), end_u)]
            for a, ua, b, ub in halves:
                for face in edge["faces"]:
                    k0, k1 = face["between"]
                    strips.append((face, (a(k0), b(k0)), (a(k1), b(k1)), (ua, ub)))
    return strips, dents, interior, region - interior, bump_tiles, outer_points, inner_points


def strip_triangles(side_a, side_b):
    """The triangles between two lines, each a list of (point, uv, t) in order along them (t from 0 to 1): a zigzag that
    takes every point of both, so the strip meets what lies beside it at each. Each is (corners, normal), as
    _triangle gives."""
    out = []
    i = j = 0
    while i < len(side_a) - 1 or j < len(side_b) - 1:
        if j == len(side_b) - 1 or (i < len(side_a) - 1 and side_a[i + 1][2] <= side_b[j + 1][2]):
            tri = (side_a[i], side_a[i + 1], side_b[j])
            i += 1
        else:
            tri = (side_a[i], side_b[j + 1], side_b[j])
            j += 1
        made = _triangle(*[(p, uv) for p, uv, _ in tri])
        if made:
            out.append(made)
    return out


def dent_triangle(corners):
    """A bend's dent, (point, uv) three times, as (corners, normal), or None."""
    return _triangle(*corners)
