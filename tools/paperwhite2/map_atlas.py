#!/usr/bin/env python3
"""Paper White 2's map atlas: every map chunk of the original game read once (map_reader.py) into one SQLite database
(docs/paperwhite2/design/map-reader.md, The atlas).

    map_atlas.py build [--jobs N] [--only GLOB]   # read every chunk at w2-original into build/map_atlas.db, twice
    map_atlas.py roles                            # each texture's role across the game, by texture set
    map_atlas.py cases [--terrain T] [--limit N]  # the commonest neighbourhoods, with a tile of each to look at
    map_atlas.py record MODEL X Z                 # one tile's whole record
    map_atlas.py sql "SELECT ..."                 # any query

The chunks are read as the tag w2-original has them, never the working tree, so the hack's edits never enter it. It
is derived data, out of git (build/), and rebuilt in minutes whenever the reader changes: its schema_version says
which reader made it.

Tables:
- chunks: model, kind (overworld: drawn beside its neighbours; else a cave's, a building's), texture_set, triangles,
  tiles with nothing drawn, unsure tiles (of those with something drawn), and the reader's error if it failed.
- textures: per chunk, each texture's learned role, alpha, tiles, pieces and inside (an edge's ground).
- tiles: per chunk tile, its reading (terrain, edge texture and outside, bend, slope and downhill, deck and what's
  under, decorations, confidence, empty), ground (texture, height), first collision layer (tile type, height), its
  open sides, its neighbourhood signature, and its whole record as JSON compressed with zlib (none for a tile with
  nothing drawn; map_atlas.py record MODEL X Z prints one).
- texture_roles (a view): each (texture set, texture), the roles the chunks gave it and how often.
"""
import argparse
import fnmatch
import glob
import json
import os
import sqlite3
import subprocess
import sys
import time
import zlib
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/paperwhite2"))
import map_reader  # noqa: E402

DB = ROOT / "build/map_atlas.db"
REV = "w2-original"
SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE chunks (model TEXT PRIMARY KEY, kind TEXT, texture_set TEXT, triangles INTEGER, empty INTEGER,
                     unsure INTEGER, error TEXT);
CREATE TABLE textures (model TEXT, texture TEXT, texture_set TEXT, role TEXT, alpha TEXT, tiles INTEGER,
                       pieces INTEGER, inside TEXT, PRIMARY KEY (model, texture));
CREATE TABLE tiles (model TEXT, x INTEGER, z INTEGER, terrain TEXT, edge TEXT, outside TEXT, bend TEXT, bend_from TEXT,
                    slope TEXT, downhill TEXT, deck TEXT, under TEXT, decoration INTEGER, confidence TEXT,
                    empty INTEGER, ground TEXT, ground_y REAL, tile_type INTEGER, height REAL, open_sides TEXT,
                    neighbourhood TEXT, record BLOB, PRIMARY KEY (model, x, z));
CREATE INDEX tiles_terrain ON tiles (terrain);
CREATE INDEX tiles_neighbourhood ON tiles (neighbourhood);
CREATE INDEX textures_texture ON textures (texture_set, texture);
CREATE VIEW texture_roles AS
    SELECT texture_set, texture, role, COUNT(*) AS chunks, SUM(tiles) AS tiles FROM textures
    GROUP BY texture_set, texture, role;
"""


def models():
    """Every map chunk of the original game, and which are the overworld's."""
    listed = subprocess.run(["git", "ls-tree", "--name-only", REV, "res/field/maps/models/"], cwd=ROOT,
                            capture_output=True, text=True, check=True).stdout.split()
    names = sorted(Path(p).name for p in listed if not p.endswith(".json"))
    overworld = set()
    for path in glob.glob(str(ROOT / "res/field/matrices/overworld*.json")):
        matrix = json.loads(Path(path).read_text())
        overworld |= {m.replace("MAP_MODEL_", "").lower() for row in matrix["maps"] for m in row if m}
    return names, overworld


def texture_set(model):
    shown = subprocess.run(["git", "show", f"{REV}:res/field/maps/models/{model}/data.json"], cwd=ROOT,
                           capture_output=True, text=True)
    if shown.returncode:
        return None
    data = json.loads(shown.stdout)
    return data.get("texture_set") or data.get("texture_preview")


def read_one(model):
    """One chunk's rows, or its error."""
    try:
        chunk = map_reader.load_chunk(model, REV, None)
    except Exception as error:  # noqa: BLE001 (a chunk the reader can't read is recorded, not fatal)
        return model, None, f"{type(error).__name__}: {error}"
    tset = texture_set(model)
    textures = [(model, t, tset, r["role"], r["alpha"], r["tiles"], r["pieces"], r.get("inside"))
                for t, r in chunk.facts["textures"].items() if t]
    tiles = []
    for (x, z), tile in chunk.tiles.items():
        f = tile.facts
        r = f["reading"]
        g = f["ground"] or {}
        first = next((c for c in f["collision"] if c["layer"] == 0), {})
        tiles.append((model, x, z, r["terrain"], (r["edge"] or {}).get("texture"), (r["edge"] or {}).get("outside"),
                      (r["bend"] or {}).get("texture"), (r["bend"] or {}).get("from"), (r["slope"] or {}).get("texture"),
                      (r["slope"] or {}).get("down"), r.get("deck"), r.get("under"), int(bool(r["decoration"])),
                      r["confidence"], int(bool(r.get("empty"))), g.get("texture"), g.get("y"), first.get("tile_type"),
                      first.get("height"), ",".join(f["open_sides"]), "|".join(f["neighbourhood"]),
                      None if r.get("empty") else zlib.compress(json.dumps({"x": x, "z": z, **f}, separators=(",", ":")).encode(), 6)))
    summary = (len(chunk.triangles), sum(t[14] for t in tiles), sum(t[13] == "low" and not t[14] for t in tiles), tset)
    return model, (summary, textures, tiles), None


def consensus(db):
    """The roles the game agrees on: each texture to the role at least three quarters of five or more chunks gave it,
    and an edge texture's inside, the ground most chunks found inside it."""
    roles = {}
    for texture, rows in _grouped(db.execute("SELECT texture, role, COUNT(*) FROM textures GROUP BY texture, role")):
        total = sum(n for _, n in rows)
        role, n = max(rows, key=lambda r: r[1])
        if total >= 5 and n >= 0.75 * total:
            roles[texture] = {"role": role, "share": round(n / total, 3), "chunks": total}
    for texture, inside, n in db.execute("""SELECT texture, inside, COUNT(*) AS n FROM textures WHERE inside IS NOT NULL
                                            GROUP BY texture, inside ORDER BY n"""):
        if texture in roles:
            roles[texture]["inside"] = inside
    return roles


def _grouped(rows):
    out = {}
    for texture, role, n in rows:
        out.setdefault(texture, []).append((role, n))
    return out.items()


def build(jobs, only):
    """Reads every chunk twice: alone, then with the roles the first pass found the game agreeing on (which the
    reader takes from build/map_atlas_roles.json)."""
    roles = Path(map_reader.ATLAS_ROLES)
    roles.unlink(missing_ok=True)
    os.environ["MAP_READER_NO_ATLAS"] = "1"
    read_all(jobs, only)
    agreed = consensus(sqlite3.connect(DB))
    roles.write_text(json.dumps(agreed, indent=1, sort_keys=True) + "\n")
    print(f"{roles.relative_to(ROOT)}: {len(agreed)} textures the game agrees on; reading again with them")
    del os.environ["MAP_READER_NO_ATLAS"]
    read_all(jobs, only)


def read_all(jobs, only):
    names, overworld = models()
    if only:
        names = [n for n in names if fnmatch.fnmatch(n, only)]
    DB.parent.mkdir(exist_ok=True)
    temp = DB.with_suffix(".db.new")
    temp.unlink(missing_ok=True)
    db = sqlite3.connect(temp)
    db.executescript(SCHEMA)
    db.execute("INSERT INTO meta VALUES ('schema_version', ?), ('rev', ?), ('built', ?)",
               (str(SCHEMA_VERSION), REV, time.strftime("%Y-%m-%d %H:%M:%S")))
    started = time.time()
    done = failed = 0
    # Fresh processes, so each reads the roles file as it is now
    import multiprocessing
    with ProcessPoolExecutor(max_workers=jobs, mp_context=multiprocessing.get_context("spawn")) as pool:
        futures = [pool.submit(read_one, n) for n in names]
        for future in as_completed(futures):
            model, rows, error = future.result()
            kind = "overworld" if model in overworld else "other"
            if error:
                failed += 1
                db.execute("INSERT INTO chunks VALUES (?, ?, NULL, NULL, NULL, NULL, ?)", (model, kind, error))
            else:
                (triangles, empty, unsure, tset), textures, tiles = rows
                db.execute("INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?, NULL)", (model, kind, tset, triangles, empty, unsure))
                db.executemany("INSERT INTO textures VALUES (?, ?, ?, ?, ?, ?, ?, ?)", textures)
                db.executemany("INSERT INTO tiles VALUES (" + ", ".join("?" * 22) + ")", tiles)
            done += 1
            if done % 50 == 0 or done == len(names):
                print(f"{done}/{len(names)} chunks, {failed} failed, {time.time() - started:.0f}s", flush=True)
    db.commit()
    db.close()
    temp.replace(DB)
    print(f"{DB.relative_to(ROOT)}: {done} chunks ({failed} failed)")


def connect():
    if not DB.exists():
        sys.exit(f"no atlas: run {Path(__file__).name} build")
    return sqlite3.connect(DB)


def show(rows, headers):
    rows = list(rows)
    widths = [max(len(str(h)), *(len(str(r[i])) for r in rows)) if rows else len(str(h)) for i, h in enumerate(headers)]
    print("  ".join(str(h).ljust(w) for h, w in zip(headers, widths)))
    for r in rows:
        print("  ".join(str(v).ljust(w) for v, w in zip(r, widths)))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    b = commands.add_parser("build")
    b.add_argument("--jobs", type=int, default=8)
    b.add_argument("--only")
    commands.add_parser("roles")
    c = commands.add_parser("cases")
    c.add_argument("--terrain")
    c.add_argument("--limit", type=int, default=30)
    rec = commands.add_parser("record")
    rec.add_argument("model")
    rec.add_argument("x", type=int)
    rec.add_argument("z", type=int)
    q = commands.add_parser("sql")
    q.add_argument("query")
    args = parser.parse_args()
    if args.command == "build":
        build(args.jobs, args.only)
    elif args.command == "roles":
        db = connect()
        show(db.execute("""SELECT texture, GROUP_CONCAT(role || ' ' || chunks, ', ') AS roles, SUM(chunks) AS chunks
                           FROM texture_roles GROUP BY texture ORDER BY chunks DESC LIMIT 200"""), ["texture", "roles", "chunks"])
    elif args.command == "cases":
        db = connect()
        where, params = ("WHERE terrain = ?", [args.terrain]) if args.terrain else ("", [])
        show(db.execute(f"""SELECT neighbourhood, COUNT(*) AS n, MIN(model || ' ' || x || ',' || z) AS example FROM tiles
                            {where} GROUP BY neighbourhood ORDER BY n DESC LIMIT ?""", [*params, args.limit]),
             ["neighbourhood", "tiles", "example"])
    elif args.command == "record":
        row = connect().execute("SELECT record FROM tiles WHERE model = ? AND x = ? AND z = ?", (args.model, args.x, args.z)).fetchone()
        print(json.dumps(json.loads(zlib.decompress(row[0])), indent=1) if row and row[0] else "no record (nothing drawn, or no such tile)")
    else:
        db = connect()
        cursor = db.execute(args.query)
        show(cursor.fetchall(), [d[0] for d in cursor.description or []])


if __name__ == "__main__":
    main()
