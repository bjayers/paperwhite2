"""Compare two extracted ROM file trees NARC by NARC, member by member.

Usage: narc_diff.py BASE_FILES HACK_FILES ARCHIVE...
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.narc import read_narc


def main():
    base_root, hack_root = Path(sys.argv[1]), Path(sys.argv[2])
    for arc in sys.argv[3:]:
        base = read_narc((base_root / arc).read_bytes())
        hack = read_narc((hack_root / arc).read_bytes())
        changed = [i for i in range(min(len(base), len(hack))) if base[i] != hack[i]]
        added = len(hack) - len(base)
        shown = ",".join(str(i) for i in changed[:25]) + (" ..." if len(changed) > 25 else "")
        print(f"{arc}: {len(base)} -> {len(hack)} members, {len(changed)} changed"
              + (f", {added:+d} count" if added else "") + (f" [{shown}]" if changed else ""))


main()
