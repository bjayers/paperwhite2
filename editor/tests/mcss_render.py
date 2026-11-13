"""For tests/rig-render.test.ts: frames of battle sprites drawn by the build's renderer (tools/paperwhite2/mcss.py's
render), to compare with the editor's port pixel for pixel. Arguments: FOLDER SIDE SHEET SEQUENCE:TIME[,TIME...]...
(a folder under res/pokemon, front or back, the sheet's file name). Prints one JSON line: a frame per time, each
{"sequence", "time", "width", "height", "origin": [x, y], "pixels": hex}."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.paperwhite2 import mcss  # noqa: E402


def main():
    folder, side, sheet_name, *requests = sys.argv[1:]
    path = ROOT / "res/pokemon" / folder
    rig = mcss.read_rig(path, side)
    sheet = mcss.sheet_pixels(path / sheet_name)
    frames = []
    for request in requests:
        sequence, _, times = request.partition(":")
        for time in times.split(","):
            width, height, origin_x, origin_y, pixels = mcss.render(rig, sheet, int(sequence), int(time))
            frames.append({"sequence": int(sequence), "time": int(time), "width": width, "height": height,
                           "origin": [origin_x, origin_y], "pixels": pixels.hex()})
    print(json.dumps(frames))


if __name__ == "__main__":
    main()
