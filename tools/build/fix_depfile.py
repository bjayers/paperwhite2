#!/usr/bin/env python3
"""Convert a dependency file that mwccarm wrote under wibo to Unix paths, for ninja.

mwccarm's `-gccdep -MD` writes paths like `Z:\\home\\...\\include\\types.h`. This rewrites the file in place with the
drive letter removed and forward slashes, and paths inside the checkout relative to it (ninja runs from its root),
keeping the backslashes that continue lines.

    fix_depfile.py build/b2_us/src/gfl/vm.d
"""
import os
import re
import sys
from pathlib import Path


def unix_path(path: str) -> str:
    path = re.sub(r"^[A-Za-z]:", "", path).replace("\\", "/")
    # A path inside the checkout is made relative to it, as ninja names the files it generates: an absolute
    # build/include/generated/... header is another node to ninja, so a change to it would only be seen a build later
    root = os.getcwd() + "/"
    return path[len(root):] if path.startswith(root) else path


def main():
    path = Path(sys.argv[1])
    lines = []
    for line in path.read_text().splitlines():
        continued = line.endswith(" \\")
        body = line[:-2] if continued else line
        target, sep, rest = body.partition(": ")
        if sep and not body.startswith((" ", "\t")):
            body = unix_path(target) + ": " + " ".join(unix_path(p) for p in rest.split())
        else:
            body = "\t" + " ".join(unix_path(p) for p in body.split())
        lines.append(body + (" \\" if continued else ""))
    path.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
