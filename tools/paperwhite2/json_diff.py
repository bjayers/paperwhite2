"""Field-level diff of two JSON dump trees, ignoring Frost's re-save noise.

Usage: json_diff.py BASE_DIR HACK_DIR [--show N]
Drops "compress_name", strips leading \\c from strings, and treats lists of message objects as unordered.
"""

import json
import sys
from pathlib import Path


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if k != "compress_name"}
    if isinstance(value, list):
        items = [clean(v) for v in value]
        if items and all(isinstance(v, dict) and "text" in v for v in items):
            items.sort(key=lambda v: json.dumps(v, sort_keys=True))
        return items
    if isinstance(value, str) and value.startswith("\\c"):
        return value[2:]
    return value


def walk(a, b, path, out):
    if type(a) is not type(b):
        out.append(f"{path}: {json.dumps(a)[:70]} -> {json.dumps(b)[:70]}")
    elif isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a:
                out.append(f"{path}.{k}: added {json.dumps(b[k])[:90]}")
            elif k not in b:
                out.append(f"{path}.{k}: removed")
            else:
                walk(a[k], b[k], f"{path}.{k}", out)
    elif isinstance(a, list):
        for i in range(max(len(a), len(b))):
            if i >= len(a):
                out.append(f"{path}[{i}]: added {json.dumps(b[i])[:90]}")
            elif i >= len(b):
                out.append(f"{path}[{i}]: removed")
            else:
                walk(a[i], b[i], f"{path}[{i}]", out)
    elif a != b:
        out.append(f"{path}: {json.dumps(a)[:70]} -> {json.dumps(b)[:70]}")


def main():
    base_dir, hack_dir = Path(sys.argv[1]), Path(sys.argv[2])
    show = int(sys.argv[sys.argv.index("--show") + 1]) if "--show" in sys.argv else 0
    for hack in sorted(hack_dir.rglob("*.json")):
        rel = hack.relative_to(hack_dir)
        base = base_dir / rel
        if not base.exists():
            print(f"new: {rel}")
            continue
        out = []
        walk(clean(json.loads(base.read_text())), clean(json.loads(hack.read_text())), "", out)
        if out:
            print(f"changed: {rel} ({len(out)} fields)")
            for line in out[:show]:
                print("    " + line)


main()
