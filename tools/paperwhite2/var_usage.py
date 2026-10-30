#!/usr/bin/env python3
"""Lists which saved event variables (0x4000-0x41ae) the game and the hack reference, and which are unused: the
variables' sibling of flag_usage.py, whose script and C readers it reuses.

The variable space comes from include/save/event_work.h (EVENT_WORK_COUNT saved variables from 0x4000), with the
names of generated/vars.txt. A script's temporaries, 0x8000 and on, belong to the running script and aren't surveyed.

References are collected from:
  1. the field scripts (res/field/scripts/*.s): every argument of every command that evaluates to a saved variable,
     a value as well as a variable, since the field script VM reads any value from 0x4000 to 0xbfff as a variable
     (ScriptWork_GetWkAddr) and a WorkSetConst of a variable's ID can be a base that another command reads through;
  2. the zone events (res/field/events/*.json): every "var" field (the triggers' and the conditional NPCs');
  3. every EVENT_WORK_ name in res/, generated/ (but vars.txt), src/, include/ and lib/;
  4. the C: every argument of EventWork_GetWkPtr and EventWork_WorkResetRange that resolves through the files' and
     headers' #defines, and every hex literal from 0x4000 to 0x41ae in a C file (tables of variable IDs such as the
     Pokémon Center's works[] and the gates' sGateWorks), which is conservative: a size that happens to fall in the
     range counts too;
  5. the ranges that C reads by a base and an index, in COMPUTED_RANGES.

Statuses: used, range (inside a computed range), map-local (0x4000-0x401f, which FieldScript_ResetMapLocalEvents
clears on every map change, so it can't hold a saved value) and unused.

Usage: python3 tools/paperwhite2/var_usage.py [--csv OUT.csv] [--check VAR...]
  --check exits 1 if a listed variable (by name or number) isn't unused.
"""

import argparse
import csv
import glob
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from flag_usage import (PreprocessorState, c_defines, c_files, compress, eval_expr, load_constant_list,  # noqa: E402
                        load_constants, parse_script, path, read, rel, resolve_names, split_args, strip_c_comments)

FIRST = 0x4000
# FieldScript_ResetMapLocalEvents (src/ov012/script_sys.c) clears these on every map change
MAP_LOCAL = (0x4000, 0x401F)
# The variables C reads by a base and an index: (first, last, what)
COMPUTED_RANGES = [
    (0x4020, 0x402F, "the actors' object codes, OBJ_CODE_WORK_00 + n (src/ov012/field_actor.c, WORK_OBJCODE_FIRST)"),
    (0x4000, 0x4001, "the multiboot parent's high score and transfer count, VARS_START + n (src/ov181/mb_parent_sys.c)"),
]
WORK_FUNCS = {"EventWork_GetWkPtr": 1, "EventWork_WorkResetRange": 1}


def var_count():
    m = re.search(r"#define EVENT_WORK_COUNT (\d+)", read(path("include", "save", "event_work.h")))
    return int(m.group(1))


class Refs:
    def __init__(self):
        self.used = defaultdict(list)
        self.ranges = defaultdict(list)
        self.unresolved = []

    def use(self, var, where):
        self.used[var].append(where)


def in_space(v, last):
    return v is not None and FIRST <= v <= last


def scan_scripts(refs, consts, last):
    for p in sorted(glob.glob(path("res", "field", "scripts", "*.s"))):
        for n, macro, args, _ in parse_script(p, consts):
            if macro.startswith(":"):
                continue
            for arg in args:
                v = eval_expr(arg, consts)
                if in_space(v, last):
                    refs.use(v, f"{rel(p)}:{n} {macro}")


def scan_events(refs, consts, last):
    def walk(node, p):
        if isinstance(node, dict):
            for k, v in node.items():
                if k == "var":
                    value = v if isinstance(v, int) else eval_expr(str(v), consts)
                    if in_space(value, last):
                        refs.use(value, f"{rel(p)} var")
                else:
                    walk(v, p)
        elif isinstance(node, list):
            for v in node:
                walk(v, p)

    for p in sorted(glob.glob(path("res", "field", "events", "*.json"))):
        walk(json.loads(read(p)), p)


def scan_names(refs, consts):
    skip = {path("generated", "vars.txt")}
    exts = (".c", ".h", ".json", ".txt", ".s", ".inc", ".csv", ".yaml", ".toml")
    for root in ("res", "generated", "src", "include", "lib"):
        for dirpath, _, files in os.walk(path(root)):
            if "/res/field/scripts" in dirpath:
                continue
            for name in files:
                p = os.path.join(dirpath, name)
                if not name.endswith(exts) or p in skip:
                    continue
                text = read(p)
                if "EVENT_WORK_" not in text:
                    continue
                if name.endswith((".c", ".h")):
                    text = strip_c_comments(text)
                for n, line in enumerate(text.splitlines(), 1):
                    for m in re.finditer(r"\bEVENT_WORK_\w+", line):
                        if m.group(0) in consts and not re.search(r"#define\s+" + m.group(0) + r"\b", line):
                            refs.use(consts[m.group(0)], f"{rel(p)}:{n} {m.group(0)}")


def scan_c(refs, consts, last):
    header_defs = {}
    for p in glob.glob(path("include", "**", "*.h"), recursive=True):
        header_defs.update(c_defines(strip_c_comments(read(p))))
    for p in c_files():
        text = strip_c_comments(read(p))
        names = resolve_names({**header_defs, **c_defines(text)}, consts)
        for m in re.finditer(r"\b0x(4[01][0-9a-fA-F]{2})\b", text):
            v = int(m.group(1), 16)
            if in_space(v, last):
                refs.use(v, f"{rel(p)}:{text.count(chr(10), 0, m.start()) + 1} literal")
        for func, index in WORK_FUNCS.items():
            for m in re.finditer(r"\b" + func + r"\s*\(", text):
                args, _ = split_args(text, m.end() - 1)
                if len(args) <= index:
                    continue
                where = f"{rel(p)}:{text.count(chr(10), 0, m.start()) + 1} {func}"
                values = [eval_expr(a, names) for a in args[index:index + (2 if func.endswith("Range") else 1)]]
                if func.endswith("Range") and None not in values:
                    for v in range(values[0], values[1] + 1):
                        refs.use(v, where)
                elif values[0] is not None:
                    if in_space(values[0], last):
                        refs.use(values[0], where)
                else:
                    refs.unresolved.append((where, args[index]))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--csv", default=None, help="where to write the per-variable CSV")
    ap.add_argument("--check", nargs="*", default=None, help="variables that must be unused, by name or number")
    ap.add_argument("--quiet", action="store_true", help="don't list the unresolved references")
    args = ap.parse_args()

    consts = load_constants()
    last = FIRST + var_count() - 1
    refs = Refs()
    scan_scripts(refs, consts, last)
    scan_events(refs, consts, last)
    scan_names(refs, consts)
    scan_c(refs, consts, last)
    for first, end, what in COMPUTED_RANGES:
        for v in range(first, end + 1):
            refs.ranges[v].append(what)

    names = {v: k for k, v in load_constant_list(path("generated", "vars.txt")).items()}
    rows = []
    for v in range(FIRST, last + 1):
        if refs.used.get(v):
            where = sorted(set(refs.used[v]))
            status, detail = "used", "; ".join(where[:4]) + (f"; +{len(where) - 4} more" if len(where) > 4 else "")
        elif refs.ranges.get(v):
            status, detail = "range", "; ".join(refs.ranges[v])
        elif MAP_LOCAL[0] <= v <= MAP_LOCAL[1]:
            status, detail = "map-local", "cleared on every map change"
        else:
            status, detail = "unused", ""
        rows.append((v, names.get(v, ""), status, detail))

    if args.csv:
        with open(args.csv, "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["var_hex", "name", "status", "where"])
            for v, name, status, detail in rows:
                w.writerow([f"{v:#06x}", name, status, detail])

    counts = defaultdict(int)
    for r in rows:
        counts[r[2]] += 1
    print(f"Variable space: saved {FIRST:#x}-{last:#x} ({last - FIRST + 1}), map-local {MAP_LOCAL[0]:#x}-"
          f"{MAP_LOCAL[1]:#x}")
    print("Statuses: " + ", ".join(f"{k} {counts[k]}" for k in ("used", "range", "map-local", "unused")))
    unused = [r[0] for r in rows if r[2] == "unused"]
    print(f"Unused ({len(unused)}): " + compress(unused))
    if not args.quiet:
        print(f"Unresolved C arguments ({len(refs.unresolved)}):")
        for where, arg in refs.unresolved:
            print(f"  {where}: {arg}")
    if args.check is not None:
        status = {r[0]: r for r in rows}
        bad = []
        for item in args.check:
            v = consts.get(item, None) if not re.fullmatch(r"0[xX][0-9a-fA-F]+|\d+", item) else int(item, 0)
            if v is None or v not in status:
                bad.append(f"{item}: not a saved variable")
            elif status[v][2] != "unused":
                bad.append(f"{item} ({v:#06x}) is {status[v][2]}: {status[v][3][:150]}")
        for line in bad:
            print("Conflict: " + line)
        return 1 if bad else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
