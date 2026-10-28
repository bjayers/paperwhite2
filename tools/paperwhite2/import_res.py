"""Copy the hack's changed dump files into res/ where the base dump of the same file equals res/'s.

Usage: import_res.py [--apply] SUBDIR...   (SUBDIR such as text/script, relative to res/ and the dump trees)
Without --apply it only reports. Files whose base dump differs from res/ are listed for handling by hand.
"""

import filecmp
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE, HACK, RES = ROOT / "extract/base_dump", ROOT / "extract/pw2_dump", ROOT / "res"


def main():
    apply = "--apply" in sys.argv
    for sub in [a for a in sys.argv[1:] if a != "--apply"]:
        copied, by_hand, new = [], [], []
        for hack in sorted((HACK / sub).rglob("*")):
            if not hack.is_file():
                continue
            rel = hack.relative_to(HACK / sub)
            base, res = BASE / sub / rel, RES / sub / rel
            if base.exists() and filecmp.cmp(base, hack, shallow=False):
                continue
            if not base.exists():
                new.append(str(rel))
            elif res.exists() and filecmp.cmp(base, res, shallow=False):
                copied.append(str(rel))
                if apply:
                    shutil.copyfile(hack, res)
            else:
                by_hand.append(str(rel))
        print(f"{sub}: {len(copied)} {'copied' if apply else 'clean'}; by hand: {by_hand}; new: {new}")


main()
