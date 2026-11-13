"""The Rig Editor's check of a battle sprite's rig, as the build makes it: reads the rig's JSON text on stdin and writes
one JSON line, {"errors": [...], "warnings": [...], "sizes": {...}}: mcss_rig.check's errors and warnings (the game's
limits, docs/paperwhite2/design/battle-sprites.md section 15.5), and the five files' sizes as mcss_rig.files_from_rig
writes them (what stays resident while the sprite is shown, and the NANR compressed as the archive holds it), or the
writer's refusal as an error."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from tools.paperwhite2 import mcss_rig  # noqa: E402


def main():
    out = {"errors": [], "warnings": [], "sizes": None}
    try:
        rig = mcss_rig.loads(sys.stdin.read())
        for level, message in mcss_rig.check(rig):
            out["errors" if level == "error" else "warnings"].append(message)
        if not out["errors"]:
            files = mcss_rig.files_from_rig(rig, compress=False)
            sizes = {kind: len(blob) for kind, blob in files.items()}
            sizes["resident"] = sum(sizes.values())
            sizes["animations_compressed"] = len(mcss_rig.compress_lz11(files["animations"]))
            out["sizes"] = sizes
    except (mcss_rig.RigError, KeyError, TypeError, ValueError, OverflowError) as error:
        out["errors"].append(f"The writer refuses the rig: {type(error).__name__}: {error}")
    print(json.dumps(out), flush=True)


if __name__ == "__main__":
    main()
