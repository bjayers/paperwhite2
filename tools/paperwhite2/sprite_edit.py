#!/usr/bin/env python3
"""Paper White 2: the sprites drawn on the battle palettes, as files, and the editor's Sprite Editor saves
(docs/paperwhite2/design/shiny-icons.md section 15).

**Battle-palette icons.** A party/box icon re-indexed onto its battle palettes lives next to the vanilla art. The hack
build packs it (tools/paperwhite2/poke_icons.py, docs/paperwhite2/design/icon-screens.md): converted screens draw it on
its own colours, the others in its vanilla bank:

    res/pokemon/<species>[/form_<n>]/icon_battle.png        (icon_female_battle.png for an icon_female.png)
    res/pokemon/<species>[/form_<n>]/icon_battle.json

The PNG is 32x64, indexed, two 32x32 frames (frame 0 above), as icon.png. Its 16 colours:

    index 0       transparent (the battle palette's colour 0 in the PNG)
    indices 1-13  the battle indices in the JSON's "slots", in order: their normal.pal colours in the PNG; the shiny is
                  the same pixels through shiny.pal. Unused indices are magenta.
    indices 14-15 the vanilla outline greys #62625a and #414141, the same for normal and shiny

The JSON: {"slots": [battle indices 1-15, at most 13, no repeats], "greys": ["#62625a", "#414141"]}, written as the data
tools write JSON. The group is the folder's (its normal.pal and shiny.pal); a palette-only form (Arceus') has its own
folder's files, the base icon's pixels on the form's palettes.

**Walking and follower sheets** (res/field/actors/{pokemon,followers}/<name>/sprite.png) keep their layout
(docs/paperwhite2/design/follower-palette-remap.md section 9): indices of the battle group's palette, with normal.pal's
colours in the PNG, or for an opted-out sheet its own sprite.pal's.

    sprite_edit.py save-icon KEY DATA.json [--res DIR]
        writes the icon of KEY (fakemon, fakemon_female, fakemon_form_1) from {"pixels": hex, "slots": [...]}
    sprite_edit.py save-sheet FOLDER DATA.json [--res DIR]
        writes FOLDER/sprite.png (a folder under res/field/actors) from {"pixels": hex}, its size unchanged

    sprite_edit.py mark KIND KEY MARK on|off [--res DIR]
        sets or clears a review mark (KIND icons or followers, MARK hand_edited or checked)

**The review marks** (res/paperwhite2/sprite_review.json, written as the data tools write JSON), kept apart for the
icons (by icon key) and the walking/follower sheets (by their folder under res/field/actors, such as followers/fakemon):

    {"icons": {"hand_edited": [keys], "checked": [keys]}, "followers": {"hand_edited": [...], "checked": [...]}}

"hand_edited": drawn by hand, no longer as icon_remap.py apply generated it (apply keeps these unless --force); a save
that changes a sprite's pixels, or an icon's slots, adds it. "checked": the user's pass over every sprite, set in the
Sprite Editor.

Each prints one JSON line: {"ok": true, "written": [paths], "hand_edited": changed} (mark: {"ok": true, "review": {...}})
or {"ok": false, "error": "..."}. Standard library only.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.datajson import dumps  # noqa: E402
from tools.data.nitro_2d import read_indexed_png, read_palette, write_indexed_png  # noqa: E402

GREYS = [(0x62, 0x62, 0x5a), (0x41, 0x41, 0x41)]   # icon indices 14 and 15
SLOTS = 13                                        # icon indices 1-13
UNUSED = (255, 0, 255)
ICON_SIZE = (32, 64)
ACTORS = Path("field") / "actors"                 # under res/
REVIEW_FILE = Path("paperwhite2") / "sprite_review.json"   # under res/: the review marks
REVIEW_KINDS = ("icons", "followers")
REVIEW_MARKS = ("hand_edited", "checked")


class SpriteError(Exception):
    pass


def hex_colour(c) -> str:
    return "#%02x%02x%02x" % tuple(c[:3])


def icon_folder(pokemon: Path, key: str) -> tuple[Path, bool]:
    """The group folder of an icon key and whether it is the female icon: fakemon, fakemon_female, fakemon_form_1."""
    female = key.endswith("_female")
    name = key[:-len("_female")] if female else key
    form = None
    if "_form_" in name:
        name, _, n = name.rpartition("_form_")
        if not n.isdigit():
            raise SpriteError(f"{key}: not an icon key")
        form = int(n)
    if not name or not all(ch.isalnum() or ch == "_" for ch in name):
        raise SpriteError(f"{key}: not an icon key")
    folder = pokemon / name / f"form_{form}" if form is not None else pokemon / name
    return folder, female


def icon_paths(pokemon: Path, key: str) -> tuple[Path, Path]:
    folder, female = icon_folder(pokemon, key)
    stem = "icon_female_battle" if female else "icon_battle"
    return folder / f"{stem}.png", folder / f"{stem}.json"


def icon_colours(slots, normal) -> list:
    """The icon PNG's 16 colours: 0 the battle palette's colour 0, 1-13 the slots' normal colours, 14-15 the greys."""
    return ([tuple(normal[0])] + [tuple(normal[v]) for v in slots] + [UNUSED] * (SLOTS - len(slots)) + GREYS)


def check_icon(pixels: bytes, slots) -> None:
    w, h = ICON_SIZE
    if len(pixels) != w * h:
        raise SpriteError(f"an icon is {w}x{h} pixels, not {len(pixels)}")
    if not isinstance(slots, list) or not all(isinstance(v, int) and not isinstance(v, bool) for v in slots):
        raise SpriteError("slots must be a list of battle indices")
    if len(slots) > SLOTS:
        raise SpriteError(f"{len(slots)} battle colours: an icon has room for {SLOTS} (and the two outline greys)")
    if any(not 1 <= v <= 15 for v in slots):
        raise SpriteError("a slot must be a battle index from 1 to 15 (0 is transparent)")
    if len(set(slots)) != len(slots):
        raise SpriteError("a battle index is in the slots twice")
    for v in set(pixels):
        if v > 15:
            raise SpriteError(f"index {v} is past the icon's 16 colours")
        if len(slots) < v <= SLOTS:
            raise SpriteError(f"pixels use index {v}, but only {len(slots)} slots are set")


def canonical(pixels: bytes, slots) -> tuple[bytes, list]:
    """The same icon with each battle index in one slot and no unused slots: a slot repeating an earlier one's battle
    index (the remap methods give one per vanilla colour, so two may land on one) merges into it, which changes no
    colour, normal or shiny; slots keep their order."""
    first = {}
    new_of = {0: 0, 14: 14, 15: 15}
    used = set(pixels)
    out_slots = []
    for i, battle in enumerate(slots, 1):
        if i not in used:
            continue
        if battle not in first:
            out_slots.append(battle)
            first[battle] = len(out_slots)
        new_of[i] = first[battle]
    return bytes(new_of.get(v, v) for v in pixels), out_slots


def icon_files(pokemon: Path, key: str, pixels: bytes, slots) -> dict:
    """The icon's PNG and JSON bytes, by path, checked."""
    check_icon(pixels, slots)
    folder, _ = icon_folder(pokemon, key)
    if not (folder / "normal.pal").is_file():
        raise SpriteError(f"{folder}: no normal.pal, so not a battle group")
    normal = read_palette(folder / "normal.pal")
    png, data = icon_paths(pokemon, key)
    w, h = ICON_SIZE
    return {png: write_indexed_png(w, h, bytes(pixels), icon_colours(slots, normal)),
            data: (dumps({"slots": list(slots), "greys": [hex_colour(c) for c in GREYS]}) + "\n").encode()}


def read_icon(pokemon: Path, key: str) -> tuple[bytes, list]:
    png, data = icon_paths(pokemon, key)
    _, _, pixels, _ = read_indexed_png(png)
    return pixels, json.loads(data.read_text())["slots"]


def write_files(files: dict) -> list:
    for path, data in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_name(path.name + ".tmp")
        temp.write_bytes(data)
        temp.replace(path)
    return [str(p) for p in files]


def sheet_file(res: Path, folder: str, pixels: bytes) -> dict:
    """A walking or follower sheet's PNG, by path: its size and its colours' source unchanged."""
    path = (res / folder).resolve()
    actors = (res / ACTORS).resolve()
    if actors not in path.parents or not (path / "sprite.png").is_file():
        raise SpriteError(f"{folder}: not a sheet under res/field/actors")
    w, h, _, colours = read_indexed_png(path / "sprite.png")
    if len(pixels) != w * h:
        raise SpriteError(f"the sheet is {w}x{h}: {len(pixels)} pixels given")
    if any(v > 15 for v in set(pixels)):
        raise SpriteError("a sheet has 16 colours: an index is past 15")
    data = json.loads((path / "data.json").read_text())
    palette = data.get("palette") or {}
    if palette.get("pokemon") and not palette.get("map"):
        colours = read_palette(res / "pokemon" / palette["pokemon"] / "normal.pal")
    elif (path / "sprite.pal").is_file():
        colours = read_palette(path / "sprite.pal")
    return {path / "sprite.png": write_indexed_png(w, h, bytes(pixels), colours[:16])}


def read_review(res: Path) -> dict:
    """The review marks, every kind and mark present (empty while the file is missing), each a sorted list of keys."""
    path = res / REVIEW_FILE
    data = json.loads(path.read_text()) if path.is_file() else {}
    if not isinstance(data, dict):
        raise SpriteError(f"{path}: not an object")
    out = {}
    for kind in REVIEW_KINDS:
        marks = data.get(kind) or {}
        out[kind] = {mark: sorted({k for k in marks.get(mark) or [] if isinstance(k, str)}) for mark in REVIEW_MARKS}
    return out


def review_file(res: Path, review: dict) -> dict:
    """The review file's bytes, by path, its lists sorted."""
    data = {kind: {mark: sorted(set(review[kind][mark])) for mark in REVIEW_MARKS} for kind in REVIEW_KINDS}
    return {res / REVIEW_FILE: (dumps(data) + "\n").encode()}


def set_mark(review: dict, kind: str, key: str, mark: str, on: bool) -> bool:
    """Sets or clears a mark; whether that changed anything."""
    if kind not in REVIEW_KINDS or mark not in REVIEW_MARKS:
        raise SpriteError(f"no review mark {kind}/{mark}")
    keys = set(review[kind][mark])
    if (key in keys) == on:
        return False
    review[kind][mark] = sorted(keys | {key} if on else keys - {key})
    return True


def sheet_key(res: Path, folder: str) -> str:
    """A sheet's review key: its folder under res/field/actors (followers/fakemon)."""
    return (res / folder).resolve().relative_to((res / ACTORS).resolve()).as_posix()


def changes_sprite(res: Path, kind: str, key: str, pixels: bytes, slots=None) -> bool:
    """Whether a save changes the sprite on disk: an icon's pixels or slots, a sheet's pixels (not its colours, which
    come from the palette files). A sprite with no file yet counts as changed."""
    if kind == "icons":
        png, data = icon_paths(res / "pokemon", key)
        if not png.is_file() or not data.is_file():
            return True
        return read_icon(res / "pokemon", key) != (bytes(pixels), list(slots))
    return read_indexed_png(res / ACTORS / key / "sprite.png")[2] != bytes(pixels)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    for name, target in (("save-icon", "key"), ("save-sheet", "folder")):
        p = sub.add_parser(name)
        p.add_argument(target)
        p.add_argument("data", type=Path)
        p.add_argument("--res", type=Path, default=ROOT / "res")
    m = sub.add_parser("mark")
    m.add_argument("kind", choices=REVIEW_KINDS)
    m.add_argument("key")
    m.add_argument("mark", choices=REVIEW_MARKS)
    m.add_argument("state", choices=("on", "off"))
    m.add_argument("--res", type=Path, default=ROOT / "res")
    args = parser.parse_args(argv)
    try:
        review = read_review(args.res)
        if args.command == "mark":
            if not args.key or not all(ch.isalnum() or ch in "_/" for ch in args.key):
                raise SpriteError(f"{args.key}: not a sprite's key")
            if set_mark(review, args.kind, args.key, args.mark, args.state == "on"):
                write_files(review_file(args.res, review))
            print(json.dumps({"ok": True, "review": review}))
            return 0
        data = json.loads(args.data.read_text())
        pixels = bytes.fromhex(data["pixels"])
        if args.command == "save-icon":
            files = icon_files(args.res / "pokemon", args.key, pixels, data.get("slots"))
            kind, key = "icons", args.key
        else:
            files = sheet_file(args.res, args.folder, pixels)
            kind, key = "followers", sheet_key(args.res, args.folder)
        changed = changes_sprite(args.res, kind, key, pixels, data.get("slots"))
        written = write_files(files)
        # A change by hand marks the sprite hand-edited (a palette colour edit never comes here)
        if changed and set_mark(review, kind, key, "hand_edited", True):
            write_files(review_file(args.res, review))
    except (SpriteError, OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return 1
    print(json.dumps({"ok": True, "written": [str(Path(p).resolve().relative_to(args.res.resolve().parent))
                                              for p in written], "hand_edited": changed}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
