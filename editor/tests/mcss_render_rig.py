"""For tests/rig-v2.test.ts: frames of a flat rig given on stdin (its JSON text) drawn by the build's renderer, through
the five files the build makes from it (mcss_rig.files_from_rig, then mcss.py's reading and render), to compare with
the editor's port pixel for pixel. Arguments: SHEET SIDE SEQUENCE:TIME[,TIME...]... (the sheet's path from the
repository's root). Prints one JSON line: a frame per time, each {"sequence", "time", "width", "height", "origin":
[x, y], "pixels": hex}."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.paperwhite2 import mcss, mcss_rig  # noqa: E402


def main():
    sheet_path, side, *requests = sys.argv[1:]
    rig = mcss.rig_of_files(mcss_rig.files_from_rig(mcss_rig.loads(sys.stdin.read()), compress=False), side)
    sheet = mcss.sheet_pixels(ROOT / sheet_path)
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
