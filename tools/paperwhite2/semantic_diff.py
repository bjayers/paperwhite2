"""Diff two dump trees, ignoring Frost's uncompressed re-save of names.

Usage: semantic_diff.py BASE_DIR HACK_DIR [--show N]
Prints the files that differ after dropping "compress_name" keys and leading \\c markers.
"""

import difflib
import re
import sys
from pathlib import Path


def normalize(text):
    text = re.sub(r'\n\s*"compress_name": (true|false),', "", text)
    return re.sub(r"(= )\\c", r"\1", text)


def main():
    base_dir, hack_dir = Path(sys.argv[1]), Path(sys.argv[2])
    show = int(sys.argv[sys.argv.index("--show") + 1]) if "--show" in sys.argv else 0
    for hack in sorted(hack_dir.rglob("*")):
        if not hack.is_file():
            continue
        rel = hack.relative_to(hack_dir)
        base = base_dir / rel
        if not base.exists():
            print(f"new: {rel}")
            continue
        a, b = normalize(base.read_text()), normalize(hack.read_text())
        if a == b:
            continue
        lines = [l for l in difflib.unified_diff(a.splitlines(), b.splitlines(), lineterm="", n=0)
                 if not l.startswith(("---", "+++", "@@"))]
        print(f"changed: {rel} ({len(lines)} lines)")
        for line in lines[:show]:
            print("    " + line[:160])


main()
