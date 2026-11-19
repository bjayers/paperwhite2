#!/usr/bin/env python3
"""Paper White 2's camera audit: which camera setups let the engine's oval cover the follower's feet, and what their
fix would cost the map's depth buffer (docs/paperwhite2/following-pokemon.md, "Camera-side fixes").

    camera_audit.py table [--markdown]                 # every setup: buffering, planes, distance, pitch, zones, G
    camera_audit.py layers SETUP [--near N ...]        # the setup's near-coplanar layers and their depth steps

The follower's quad is lowered by FOLLOWING_SPRITE_LIFT (L, 2 units) and its oval lies flat a unit over the ground.
The actors' pass adds k = objectProjectionMatrixOffset (0x1ee with projection type 1, 0x136 with type 0) to clip Z,
the effects' (the ovals) k / 2, which at distance d is worth G = k / 2 * d * (far + near) / (2 * far * near) units of
Z-buffer depth between the body and its oval (k scaled by the near plane where the fix scales it: k * near), and none
in a W-buffered camera, whose buffer compares W. At pitch p the oval wins over the body's rows up to
(1 + L - G sin p) / cos p units of the quad from its bottom, and only as far as the oval's near half reaches on the
screen; none once G sin p >= 1 + L = 3, which is the line: below it a setup is affected.

table reads res/field/cameras/defaults.json, the zone headers' camera and projection (res/field/zones/), their
weather and fog (the zone fog table, file 29 of a/0/8/0, read from extract/w2_us/ when it is there), and which zones
have camera areas or rails, whose camera moves: for those (and the fixed cameras) the distance and pitch to the
follower are the ones DeSmuME measured (MEASURED below), where the table's would mislead.

layers scans the map models of the setup's zones (res/field/maps/models/, with the props their chunks place, from
their area's bundle in res/field/props/) for faces whose planes are near parallel, 0.05 to 4 units apart, and overlap
when projected on that plane: the layers a Z-buffer may fail to tell apart. For each it gives the depth between them
along the view and, for each candidate near plane N, the Z-buffer steps between them (the DS keeps (z << 14) / w, 2^15
steps over the depth range) at the farthest the view shows them: the top of the screen at the player's level, or the
far plane when the camera sees the horizon. A pair under 3 steps may fight; the smallest N that keeps every pair at 3
or more is the setup's.
"""
import argparse
import json
import math
import struct
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/paperwhite2"))
sys.path.insert(0, str(ROOT / "tools/data"))
from glb_mesh import read_mesh  # noqa: E402
from map_model_data import read_glb  # noqa: E402

CAMERAS = ROOT / "res/field/cameras"
ZONES = ROOT / "res/field/zones"
FX = 4096
LIFT = 2.0
OVAL_HEIGHT = 1.0
# The oval's half depth along the ground (units): the shadow's quad at SHADOW_SCALE's 0.75 depth (fldeff_shadow.c)
OVAL_REACH = 5.0
OFFSETS = {0: 0x136 / FX, 1: 0x1ee / FX}
CANDIDATES = (16, 32, 64, 128)
MIN_STEPS = 3
GAP_MIN, GAP_MAX = 0.05, 4.0

# Cameras that move (rails, camera areas) or don't follow the player: the distance from the eye to the follower's
# quad and that ray's pitch (degrees), as DeSmuME showed them on 2026-11-19 (scratchpad shadow4/), and the camera's
# own pitch. A setup listed here uses these instead of the table's zoom and pitch
MEASURED = {
    1: [("skyarrow_bridge, the stairs", 234, 44.8, 36.8), ("skyarrow_bridge, the span", 202, 21.3, 18.8),
        ("skyarrow_bridge, the span's bend", 282, 48.6, 44.5)],
    2: [("castelia_city, outside the Pokémon Center", 288, 28.7, 23.0)],
    4: [("bridge_gate", 227, 9.6, 0.0)],
    7: [("castelia_city_2, the Central Plaza", 488, 42.5, 42.3)],
    24: [("white_forest", 452, 53.8, 53.1)],
}
FIXES = ROOT / "res/paperwhite2/follower_camera_fixes.json"


def fixes():
    """The camera fixes in res/paperwhite2/follower_camera_fixes.json, by setup"""
    return {fix["setup"]: fix for fix in json.loads(FIXES.read_text())["fixes"]}


def fix_text(fix):
    if fix is None:
        return "-"
    parts = []
    if fix["z_buffer"]:
        parts.append("Z-buffer")
    if fix["near"] is not None:
        parts.append(f"near {fix['near']}")
    if fix["scale_offset"]:
        parts.append("offset x near")
    return ", ".join(parts)


def zone_ids():
    names = [line.split()[0] for line in (ROOT / "generated/zones.txt").read_text().splitlines()
             if line.startswith("ZONE_")]
    return {name: number for number, name in enumerate(names)}


def fog_zones():
    """The zones with a fog of their own, by ID, or None without the extracted ROM"""
    path = ROOT / "extract/w2_us/files/a/0/8/0"
    if not path.exists():
        return None
    from narc import read_narc
    from nitro_2d import decompress
    data = read_narc(path.read_bytes())[29]
    if data[0] in (0x10, 0x11):
        data = decompress(data)
    return {zone: fog for zone, fog in struct.iter_unpack("<HH", data)}


def load_zones():
    ids = zone_ids()
    moving = set()
    for path in (CAMERAS / "areas").glob("*.json"):
        moving.update(z.removeprefix("ZONE_").lower() for z in json.loads(path.read_text()).get("zones", []))
    rails = {p.name for p in (ROOT / "res/field/rails").iterdir() if p.is_dir()}
    fogs = fog_zones()
    zones = defaultdict(list)
    for path in sorted(ZONES.glob("*.json")):
        if path.name.endswith(".schema.json"):
            continue
        data = json.loads(path.read_text())
        name = path.stem
        zid = ids.get("ZONE_" + name.upper())
        zones[data["camera"]].append({
            "name": name, "id": zid, "projection": data["projection"], "matrix": data["matrix"],
            "area": data["area"], "weather": data["weather"], "moving": name in moving or name in rails,
            "fog": None if fogs is None else fogs.get(zid)})
    return zones


def depth_g(k, d, near, far):
    """Units of Z-buffer depth that a clip Z offset k (units) buys at distance d"""
    return k * d * (far + near) / (2 * far * near)


def covered(g, pitch):
    """How far up the lowered quad (units from its bottom) the oval wins, at G g and pitch degrees"""
    p = math.radians(pitch)
    if p <= 0:
        return 0.0
    # The oval's points x along the ground toward the camera (negative) win where x < xmax
    xmax = min(OVAL_REACH, ((OVAL_HEIGHT + LIFT) * math.sin(p) - g) / math.cos(p))
    if xmax <= -OVAL_REACH:
        return 0.0
    top = OVAL_HEIGHT * math.cos(p) + xmax * math.sin(p)
    bottom = max(-LIFT * math.cos(p), OVAL_HEIGHT * math.cos(p) - OVAL_REACH * math.sin(p))
    return max(0.0, top - bottom)


def views(index, cam, zones):
    """(where, distance, ray pitch, camera pitch) for the setup: the measured ones, or the table's"""
    if index in MEASURED:
        return MEASURED[index], True
    pitch = cam["pitch"] * 360 / 65536
    return [("table", cam["zoom"], pitch, pitch)], False


def setup_rows():
    cams = json.loads((CAMERAS / "defaults.json").read_text())["cameras"]
    zones = load_zones()
    rows = []
    for index, cam in enumerate(cams):
        near, far = cam["near"] / FX, cam["far"] / FX
        wbuf = cam["swap_mode"] == 1
        zs = zones.get(index, [])
        types = sorted({z["projection"] for z in zs}) or [1]
        k = min(OFFSETS[t] for t in types)
        samples, measured = views(index, cam, zs)
        worst = None
        for where, d, ray, campitch in samples:
            g = 0.0 if wbuf else depth_g(k / 2, d, near, far)
            g_fixed = depth_g(k / 2 * max(near, 1), d, max(near, 1), far)
            entry = (g * math.sin(math.radians(ray)), g, ray, d, covered(g, ray),
                     g_fixed * math.sin(math.radians(ray)), covered(g_fixed, ray), where)
            if worst is None or entry[0] < worst[0]:
                worst = entry
        rows.append({"index": index, "cam": cam, "near": near, "far": far, "wbuf": wbuf, "zones": zs, "k": k,
                     "measured": measured, "gsin": worst[0], "g": worst[1], "ray": worst[2], "dist": worst[3],
                     "covered": worst[4], "gsin_scaled": worst[5], "covered_scaled": worst[6], "where": worst[7],
                     "affected": bool(zs) and worst[0] < OVAL_HEIGHT + LIFT})
    return rows


def table(markdown):
    rows = setup_rows()
    fixed = fixes()
    if markdown:
        print("| setup | buffer | near | far | distance | pitch | zones | G sin p | oval over the quad | "
              "near-scaled: G sin p, oval | fix |")
        print("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for r in rows:
        if not r["zones"]:
            continue
        names = ", ".join(z["name"] for z in r["zones"][:4]) + (
            f" and {len(r['zones']) - 4} more" if len(r["zones"]) > 4 else "")
        flags = []
        if any(z["moving"] for z in r["zones"]):
            flags.append("moving camera")
        if any(z["fog"] is not None for z in r["zones"]):
            flags.append("fog")
        if any(z["weather"] for z in r["zones"]):
            flags.append("weather")
        dist = f"{r['dist']:.0f}" + ("*" if r["measured"] else "")
        pitch = f"{r['ray']:.0f}" + ("*" if r["measured"] else "")
        scaled = (f"{r['gsin_scaled']:.1f}, {r['covered_scaled']:.1f}" if r["near"] > 1 or r["wbuf"] else "-")
        mark = "**" if r["affected"] else ""
        buf = "W" if r["wbuf"] else "Z"
        fix = fix_text(fixed.get(r["index"]))
        if markdown:
            print(f"| {mark}{r['index']}{mark} | {buf} | {r['near']:g} | {r['far']:g} | {dist} | {pitch} | {names}"
                  f"{' (' + ', '.join(flags) + ')' if flags else ''} | {r['gsin']:.1f} | {r['covered']:.1f} | "
                  f"{scaled} | {fix} |")
        else:
            print(f"{r['index']:3} {buf} near {r['near']:6g} far {r['far']:6g} d {dist:>5} p {pitch:>3} "
                  f"G {r['g']:5.2f} Gsin {r['gsin']:4.1f} oval {r['covered']:3.1f} "
                  f"scaled {scaled:>9} {'AFFECTED' if r['affected'] else '':8} fix: {fix}; {names} {' '.join(flags)}")


def _sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def _cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _overlap(t1, t2):
    """Whether two triangles in a plane's 2D coordinates overlap (by separating axes)"""
    for tri in (t1, t2):
        for i in range(3):
            a, b = tri[i], tri[(i + 1) % 3]
            ax = (b[1] - a[1], a[0] - b[0])
            p1 = [ax[0] * p[0] + ax[1] * p[1] for p in t1]
            p2 = [ax[0] * p[0] + ax[1] * p[1] for p in t2]
            if max(p1) <= min(p2) + 1e-3 or max(p2) <= min(p1) + 1e-3:
                return False
    return True


def _prop_models(area):
    """The prop models of an area's bundle by their resource ID"""
    data = json.loads(area_path(area).read_text())
    bundle = data.get("prop_bundle")
    out = {}
    if not bundle:
        return out
    for side in ("exterior", "interior"):
        prefix = f"FIELD_PROPS_{side.upper()}_"
        if bundle.startswith(prefix):
            folder = ROOT / "res/field/props" / side / "models" / bundle[len(prefix):].lower()
            for model in folder.glob("*/data.json") if folder.exists() else []:
                out[json.loads(model.read_text())["res_id"]] = model.parent / "model.glb"
    return out


def area_path(area):
    """An area's file: named after it, or numbered where the area has no name of its own"""
    path = ROOT / "res/field/areas" / f"{area.removeprefix('AREA_').lower()}.json"
    if path.exists():
        return path
    names = [line.split()[0] for line in (ROOT / "generated/areas.txt").read_text().splitlines()
             if line.startswith("AREA_")]
    return ROOT / "res/field/areas" / f"{names.index(area)}.json"


def _faces(path, place=None):
    """A GLB's faces as (material, translucent, points, normal, plane offset), moved by place (translation, Y
    rotation quaternion) when given"""
    tris, mats, _ = read_mesh(path)
    out = []
    for key, tri in tris:
        pts = [list(v.p) for v in tri]
        if place:
            (tx, ty, tz), q = place
            # A rotation about Y by the quaternion (0, y, 0, w)
            angle = 2 * math.atan2(q[1], q[3])
            c, s = math.cos(angle), math.sin(angle)
            pts = [[c * x + s * z + tx, y + ty, -s * x + c * z + tz] for x, y, z in pts]
        n = _cross(_sub(pts[1], pts[0]), _sub(pts[2], pts[0]))
        length = math.sqrt(_dot(n, n))
        if length < 1e-6:
            continue
        n = [c / length for c in n]
        material = mats[key]
        out.append((material.get("name", "?"), material.get("alphaMode") == "BLEND", pts, n, _dot(n, pts[0])))
    return out


def chunk_faces(model, props):
    """A map chunk's faces and its placed props'"""
    path = ROOT / "res/field/maps/models" / model / "model.glb"
    faces = _faces(path)
    doc, _ = read_glb(path)
    for node in doc["nodes"]:
        name = node.get("name", "")
        if name.startswith("bw2_prop_"):
            res_id = int(name.rsplit("_", 1)[1])
            if res_id in props:
                faces += _faces(props[res_id], (node.get("translation", [0, 0, 0]),
                                                node.get("rotation", [0, 0, 0, 1])))
    return faces


def layer_pairs(faces):
    """The near-parallel overlapping face pairs GAP_MIN to GAP_MAX apart: (gap, normal, a, b)"""
    buckets = defaultdict(list)
    for i, face in enumerate(faces):
        n = face[3]
        sign = 1 if (n[1], n[2], n[0]) >= (0, 0, 0) else -1
        buckets[tuple(round(c * sign * 20) for c in n)].append(i)
    pairs = []
    for idx in buckets.values():
        for i in range(len(idx)):
            fa = faces[idx[i]]
            for j in range(i + 1, len(idx)):
                fb = faces[idx[j]]
                cos = _dot(fa[3], fb[3])
                if abs(cos) < 0.996:
                    continue
                gap = abs((fb[4] if cos > 0 else -fb[4]) - fa[4])
                if gap < GAP_MIN or gap > GAP_MAX:
                    continue
                n = fa[3]
                u = _cross(n, [0, 1, 0] if abs(n[1]) < 0.9 else [1, 0, 0])
                ul = math.sqrt(_dot(u, u))
                u = [c / ul for c in u]
                v = _cross(n, u)
                if _overlap([(_dot(p, u), _dot(p, v)) for p in fa[2]], [(_dot(p, u), _dot(p, v)) for p in fb[2]]):
                    pairs.append((gap, n, fa, fb))
    return pairs


def steps(gap_depth, depth, near, far):
    """The Z-buffer steps between two depths gap_depth apart at depth"""
    def ndc(z):
        return (far + near) / (far - near) - 2 * far * near / ((far - near) * z)
    return (ndc(depth + gap_depth) - ndc(depth)) * 2 ** 14


def view_depth(campitch, ray, d, fov, far):
    """The farthest depth the view shows at the player's level: the screen's top ray, or the far plane"""
    a = fov * 360 / 65536
    height = d * math.sin(math.radians(ray))
    if campitch - a <= 0.5:
        return far
    return min(far, height * math.cos(math.radians(a)) / math.sin(math.radians(campitch - a)))


def layers(index, nears):
    rows = {r["index"]: r for r in setup_rows()}
    r = rows[index]
    cam = r["cam"]
    samples, _ = views(index, cam, r["zones"])
    far = r["far"]
    nears = sorted({max(r["near"], n) for n in (nears or CANDIDATES)} | ({r["near"]} if not r["wbuf"] else set()))
    worst_depth = max(view_depth(campitch, ray, d, cam["fov"], far) for _, d, ray, campitch in samples)
    near_view = min(d for _, d, _, _ in samples)
    seen = set()
    groups = defaultdict(lambda: [0, 9e9, 0.0, None])
    for zone in r["zones"]:
        matrix = json.loads((ROOT / "res/field/matrices" / f"{zone['matrix'].removeprefix('MAP_MATRIX_').lower()}.json")
                            .read_text())
        props = _prop_models(zone["area"])
        for row in matrix["maps"]:
            for cell in row:
                if not cell or cell in seen:
                    continue
                seen.add(cell)
                model = cell.removeprefix("MAP_MODEL_").lower()
                for gap, n, fa, fb in layer_pairs(chunk_faces(model, props)):
                    # The depth between the layers along the view, at the view's typical ray toward the layers: a
                    # floor's layers (n up) are gap / sin(ray) apart along it, a wall's facing the camera about gap
                    ray = math.radians(max(5.0, min(s[2] for s in samples)))
                    if abs(n[1]) > 0.7:
                        along = gap / max(math.sin(ray), 0.05)
                    else:
                        along = gap / max(abs(math.cos(ray) * math.hypot(n[0], n[2])), 0.2)
                    key = (model, *sorted((fa[0] + ("~" if fa[1] else ""), fb[0] + ("~" if fb[1] else ""))))
                    g = groups[key]
                    g[0] += 1
                    if gap < g[1]:
                        g[1], g[3] = gap, along
                    g[2] = max(g[2], gap)
    print(f"setup {index}: {'W' if r['wbuf'] else 'Z'}-buffered, near {r['near']:g}, far {far:g}; the follower "
          f"{near_view:.0f} units away at the nearest, the view's farthest at the player's level {worst_depth:.0f}")
    print(f"{len(groups)} layer groups (model, materials, ~ translucent: count, least gap, depth along the view)")
    header = "".join(f" N{n:<5g}" for n in nears)
    print(f"{'':78} steps at {worst_depth:.0f}:{header}")
    least = {n: 9e9 for n in nears}
    for key, (count, lo, hi, along) in sorted(groups.items(), key=lambda kv: kv[1][3]):
        cells = []
        for n in nears:
            s = steps(along, worst_depth, n, far)
            least[n] = min(least[n], s)
            cells.append(f" {s:6.1f}")
        print(f"  {' | '.join(key):60} {count:4} gap {lo:4.2f} along {along:5.2f}" + "".join(cells))
    print("least steps:" + "".join(f" N{n:g} {least[n]:.1f}" for n in nears))
    good = [n for n in nears if least[n] >= MIN_STEPS]
    print(f"smallest near with every pair at {MIN_STEPS} steps or more: {good[0] if good else 'none'}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    t = sub.add_parser("table")
    t.add_argument("--markdown", action="store_true")
    lay = sub.add_parser("layers")
    lay.add_argument("setup", type=int)
    lay.add_argument("--near", type=float, nargs="*")
    args = parser.parse_args()
    if args.command == "table":
        table(args.markdown)
    else:
        layers(args.setup, args.near)


if __name__ == "__main__":
    main()
