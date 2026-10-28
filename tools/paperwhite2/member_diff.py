"""Show how each changed member of one archive differs: sizes and differing byte count.

Usage: member_diff.py BASE_FILES HACK_FILES ARCHIVE [LIMIT]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.narc import read_narc


def main():
    base = read_narc((Path(sys.argv[1]) / sys.argv[3]).read_bytes())
    hack = read_narc((Path(sys.argv[2]) / sys.argv[3]).read_bytes())
    limit = int(sys.argv[4]) if len(sys.argv) > 4 else 10
    shown = 0
    for i in range(min(len(base), len(hack))):
        b, h = base[i], hack[i]
        if b == h:
            continue
        n = min(len(b), len(h))
        diffs = [j for j in range(n) if b[j] != h[j]]
        prefix = b[:n] == h[:n]
        print(f"  {i}: {len(b)} -> {len(h)} bytes, {len(diffs)} differ"
              + (" (one is a prefix of the other)" if prefix else f", first at 0x{diffs[0]:x}" if diffs else "")
              + f" magic {b[:4]!r}")
        shown += 1
        if shown >= limit:
            break


main()
