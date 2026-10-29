#!/usr/bin/env python3
"""Paper White 2's Season app preview: the map spot and camera that the app's top screen shows.

    season_preview.py INPUT_JSON OUTPUT_HEADER

res/paperwhite2/season_preview.json is the source to edit (docs/paperwhite2/plugins.md, Season app):

- `area`: the area whose textures, animations and lights the preview takes, by its AREA_ name (generated/areas.txt),
  as a zone's header names it. The app reads the area's record of the season it shows, as the field does
  (AreaData_Create with the season as the variant), so a season changes the textures and lights.
- `chunks`: one to four map chunks, each a map model by its MAP_MODEL_ name (generated/map_models.txt) and the cell of
  the map matrix it is drawn at, `x` and `z`, as res/field/matrices/ has them: the chunk's center is at
  (x * 512 + 256, 0, z * 512 + 256) in world units, 16 a tile, as the field places it. The app swaps a model for its
  season's as the field does, by the game's map replacements (archive 10), which only change the props of Route 1's.
- `props`: whether to draw the props that the chunks place (signs, and Route 1's falling petals or leaves), from the
  area's prop bundle.
- `camera`: the field camera's parameters (src/ov036/field_camera.c): the world position it looks at, `target`; its
  `distance` from it; `yaw`, the degrees it is turned about the target from the south, to the right (east) for a
  positive yaw; `pitch`, the degrees it looks down at the target from the horizontal; `fov`, half the vertical field of
  view in degrees; `near` and `far`, the clipping planes in world units. The field's own camera of Route 1 (camera 0
  of archive 59) is distance 237, yaw 0, pitch 53.2, fov 20, near 1, far 1024.
- `light_hour`: null for the lights of the time of day, as the field has them, or an hour from 0 to 23 for that hour's.

The header has the preview's setup as constants, with the eye and the chunks' centers in x and z from the target, which
is the origin of what the app draws, so the numbers stay small. src/paperwhite2/ov312/paperwhite2_season_preview.c includes
it from build/include/generated/paperwhite2/. Only the hack's build runs this (configure.py --hack).
"""
import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.gen_constants import load as load_list  # noqa: E402

CHUNK_SPAN = 512
CHUNK_MAX = 4
GUARD = "POKEBW2_PAPERWHITE2_SEASON_PREVIEW_CONFIG_H"


def fail(path: Path, message: str):
    sys.exit(f"{path}: {message}")


def number(path: Path, value, name: str, low: float, high: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
        fail(path, f"{name} must be a number from {low} to {high}")
    return float(value)


def angle(degrees: float) -> int:
    """The angle in the 65536ths of a turn that FX_SinIdx takes."""
    return round(degrees * 65536 / 360) & 0xFFFF


def fx32(value: float) -> str:
    return f"FX32_CONST({value:.4f})"


def generate(path: Path) -> str:
    data = json.loads(path.read_text())
    areas = load_list("areas")
    models = load_list("map_models")
    if data.get("area") not in areas:
        fail(path, f"area {data.get('area')!r} is not in generated/areas.txt")
    chunks = data.get("chunks")
    if not isinstance(chunks, list) or not 1 <= len(chunks) <= CHUNK_MAX:
        fail(path, f"chunks must list 1 to {CHUNK_MAX} chunks")
    for chunk in chunks:
        if chunk.get("model") not in models:
            fail(path, f"model {chunk.get('model')!r} is not in generated/map_models.txt")
        for axis in ("x", "z"):
            if not isinstance(chunk.get(axis), int) or not 0 <= chunk[axis] < 64:
                fail(path, f"a chunk's {axis} must be a matrix cell from 0 to 63")
    if not isinstance(data.get("props"), bool):
        fail(path, "props must be true or false")
    camera = data.get("camera", {})
    target = camera.get("target", {})
    tx = number(path, target.get("x"), "camera.target.x", 0, 32767)
    ty = number(path, target.get("y"), "camera.target.y", -1024, 1024)
    tz = number(path, target.get("z"), "camera.target.z", 0, 32767)
    distance = number(path, camera.get("distance"), "camera.distance", 16, 1024)
    yaw = number(path, camera.get("yaw"), "camera.yaw", -360, 360)
    pitch = number(path, camera.get("pitch"), "camera.pitch", 1, 89)
    fov = number(path, camera.get("fov"), "camera.fov", 5, 60)
    near = number(path, camera.get("near"), "camera.near", 0.25, 64)
    far = number(path, camera.get("far"), "camera.far", 128, 2048)
    hour = data.get("light_hour")
    if hour is not None and (isinstance(hour, bool) or not isinstance(hour, int) or not 0 <= hour <= 23):
        fail(path, "light_hour must be null or an hour from 0 to 23")

    # The eye from the target, as FieldCameraApply_TransRot puts it
    yaw_radians = math.radians(yaw)
    pitch_radians = math.radians(pitch)
    eye = (distance * math.sin(yaw_radians) * math.cos(pitch_radians), ty + distance * math.sin(pitch_radians),
           distance * math.cos(yaw_radians) * math.cos(pitch_radians))
    rows = [f"    {{ {chunk['model']}, {fx32(chunk['x'] * CHUNK_SPAN + CHUNK_SPAN / 2 - tx)}, "
            f"{fx32(chunk['z'] * CHUNK_SPAN + CHUNK_SPAN / 2 - tz)} }}," for chunk in chunks]
    relative = path.resolve().relative_to(ROOT).as_posix()
    lines = [
        f"#ifndef {GUARD}",
        f"#define {GUARD}",
        "",
        f"// Generated by tools/paperwhite2/season_preview.py from {relative}, edit that instead",
        "",
        '#include "constants/areas.h"',
        '#include "constants/map_models.h"',
        '#include "nitro/fx.h"',
        "",
        f"#define SEASON_PREVIEW_AREA {data['area']}",
        f"#define SEASON_PREVIEW_CHUNK_COUNT {len(chunks)}",
        "// Each chunk's map model, and its center's x and z from the camera's target",
        "#define SEASON_PREVIEW_CHUNKS \\",
        *(row + " \\" for row in rows[:-1]),
        rows[-1],
        f"#define SEASON_PREVIEW_PROPS {'TRUE' if data['props'] else 'FALSE'}",
        "// The camera: the target's height, and the eye, in x and z from the target",
        f"#define SEASON_PREVIEW_TARGET_Y {fx32(ty)}",
        f"#define SEASON_PREVIEW_EYE_X {fx32(eye[0])}",
        f"#define SEASON_PREVIEW_EYE_Y {fx32(eye[1])}",
        f"#define SEASON_PREVIEW_EYE_Z {fx32(eye[2])}",
        "// Half the vertical field of view, in 65536ths of a turn, and the clipping planes",
        f"#define SEASON_PREVIEW_FOV {angle(fov):#06x}",
        f"#define SEASON_PREVIEW_NEAR {fx32(near)}",
        f"#define SEASON_PREVIEW_FAR {fx32(far)}",
        "// The hour whose lights the preview has, or -1 for the time of day's",
        f"#define SEASON_PREVIEW_LIGHT_HOUR {-1 if hour is None else hour}",
        "",
        f"#endif // {GUARD}",
        "",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    text = generate(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if not args.output.exists() or args.output.read_text() != text:
        args.output.write_text(text)


if __name__ == "__main__":
    main()
