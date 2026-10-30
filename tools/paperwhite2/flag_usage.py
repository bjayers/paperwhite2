#!/usr/bin/env python3
"""Lists which event flags the game and the hack reference, and which are unused.

The flag space comes from the code: include/save/event_work.h (EVENT_FLAG_SAVED_COUNT saved flags from 1, then
EVENT_FLAG_TEMP_COUNT temporary ones from EVENT_FLAG_TEMP_0), src/system/event_work.c (the daily clear range),
src/ov012/script_sys.c (the map-local clear range), src/ov012/trainer_script.c (trainer base) and
include/field/hidden_item.h (hidden item base), with the names of generated/flags.txt.

References are collected from:
  1. the field scripts (res/field/scripts/*.s), by every argument whose meaning in tools/script/field_commands.json
     is a flag or a trainer, with the field script VM's rule that a value from 0x4000 to 0xbfff is a variable
     (ScriptWork_GetWkAddr), so a script can't name a temporary flag directly. A flag taken from a variable is
     resolved, where it can be, from the same file's WorkSet/WorkSetConst/WorkGet/WorkAdd/WorkCmpConst lines and,
     for a global script's parameters, from the WorkSets before each RTCallGlobal of it;
  2. the zone events (res/field/events/*.json): every "flag" field;
  3. every EVENT_FLAG_ name in res/, generated/ (but flags.txt), src/, include/ and lib/;
  4. the C calls of EventWork_FlagGet/Set/Reset and of their wrappers (found automatically: a function that passes
     its own parameter on), with constant arguments, resolved through the files' and headers' #defines;
  5. the tables and computed ranges listed in C_TABLES and computed_ranges() (trainers, hidden items, Funfest
     missions, surveys, the Funfest mission and gate board data in the ROM's archives).

Statuses: used (a direct reference), range (inside a computed base + index range), indirect-candidate (where an
unresolved variable reference could reach), unused. A flag that only a clear range (daily, map-local) touches is
unused, with its region in the CSV.

Usage: python3 tools/paperwhite2/flag_usage.py [--csv OUT.csv] [--user-list LIST.csv] [--quiet]
"""

import argparse
import csv
import glob
import json
import os
import re
import struct
import sys
from collections import defaultdict

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
# The ROM's files the build packs unchanged, for the archives that hold flags
EXTRACT = os.path.join(ROOT, "extract", "w2_us", "files")
# How far past its base an unresolved base + variable reference is assumed to reach
UNKNOWN_WINDOW = 16
# A parameter variable of a global script whose value comes from its caller
PARAM_VARS = range(0x8000, 0x8010)


def path(*parts):
    return os.path.join(ROOT, *parts)


def rel(p):
    return os.path.relpath(p, ROOT)


def read(p):
    with open(p, encoding="utf-8", errors="replace") as f:
        return f.read()


def strip_c_comments(text):
    """Blanks C comments, keeping the line numbers."""

    def blank(m):
        return re.sub(r"[^\n]", " ", m.group(0))

    return re.sub(r"//[^\n]*|/\*.*?\*/", blank, text, flags=re.S)


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


# --- Constants ---------------------------------------------------------------------------------------------------


def load_constant_list(p):
    """Reads a generated/*.txt list: NAME [= value], numbered from the last value."""
    values = {}
    n = 0
    for line in read(p).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"(\w+)(?:\s*=\s*(\S+))?", line)
        if m.group(2):
            n = int(m.group(2), 0)
        values[m.group(1)] = n
        n += 1
    return values


def load_constants():
    consts = {}
    for p in sorted(glob.glob(path("generated", "*.txt"))):
        consts.update(load_constant_list(p))
    return consts


def eval_expr(expr, names):
    """Evaluates an integer expression of literals and known names, or returns None."""
    expr = expr.strip()
    if not expr:
        return None
    expr = re.sub(r"\(\s*(?:u8|u16|u32|s32|int|const)\s*\)", "", expr)
    tokens = re.findall(r"0[xX][0-9a-fA-F]+|\d+|\w+|<<|>>|[-+*/|&()~]|\S", expr)
    out = []
    for t in tokens:
        if re.fullmatch(r"0[xX][0-9a-fA-F]+|\d+", t):
            out.append(str(int(t, 0)))
        elif re.fullmatch(r"[A-Za-z_]\w*", t):
            if t not in names:
                return None
            out.append(str(names[t]))
        elif t in ("+", "-", "*", "/", "|", "&", "(", ")", "<<", ">>", "~"):
            out.append("//" if t == "/" else t)
        else:
            return None
    try:
        return int(eval(" ".join(out), {"__builtins__": {}}))
    except Exception:
        return None


# --- The flag space ----------------------------------------------------------------------------------------------


def flag_space(consts):
    header = read(path("include", "save", "event_work.h"))
    saved = int(re.search(r"#define EVENT_FLAG_SAVED_COUNT (\w+)", header).group(1), 0)
    temp = int(re.search(r"#define EVENT_FLAG_TEMP_COUNT (\w+)", header).group(1), 0)
    temp_base = consts["EVENT_FLAG_TEMP_0"]
    work = read(path("src", "system", "event_work.c"))
    m = re.search(r"ResetDailyFlags.*?EventWork_FlagResetRange\(\w+, (\w+), (\w+)\)", work, re.S)
    daily = (consts.get(m.group(1), None) or int(m.group(1), 0), consts.get(m.group(2), None) or int(m.group(2), 0))
    m = re.search(r"ResetMapLocalEvents.*?EventWork_FlagResetRange\(\w+, (\w+), (\w+)\)",
                  read(path("src", "ov012", "script_sys.c")), re.S)
    local = (int(m.group(1), 0), int(m.group(2), 0))
    trainer_base = int(re.search(r"FlagGet\(\w+, \(trainerId \+ (0x[0-9a-f]+)\)", read(path("src", "ov012", "trainer_script.c"))).group(1), 0)
    hidden_base = int(re.search(r"#define HIDDEN_ITEM_FLAG_START (\w+)", read(path("include", "field", "hidden_item.h"))).group(1), 0)
    trainers = load_constant_list(path("generated", "trainers.txt"))
    return {
        "saved": (1, saved - 1),
        "temp": (temp_base, temp_base + temp - 1),
        "daily": daily,
        "local": (max(local[0], 1), local[1]),
        "trainer": (trainer_base, trainer_base + len(trainers) - 1),
        "hidden": (hidden_base, hidden_base + int(re.search(r"#define HIDDEN_ITEM_COUNT (\w+)",
                                                             read(path("src", "ov012", "hidden_item.c"))).group(1), 0) - 1),
    }


def region_of(flag, space):
    names = []
    if space["local"][0] <= flag <= space["local"][1]:
        names.append("map-local (cleared on map change)")
    if space["trainer"][0] <= flag <= space["trainer"][1]:
        names.append("trainer")
    if space["daily"][0] <= flag <= space["daily"][1]:
        names.append("daily (cleared each day)")
    if space["hidden"][0] <= flag <= space["hidden"][1]:
        names.append("hidden item")
    if space["temp"][0] <= flag <= space["temp"][1]:
        names.append("temporary (not saved)")
    return "; ".join(names) or "saved"


# --- The collector -----------------------------------------------------------------------------------------------


class Refs:
    def __init__(self):
        self.used = defaultdict(list)  # flag -> [where]
        self.original_only = defaultdict(list)  # flag -> [where] in #ifndef PAPERWHITE2 code
        self.ranges = defaultdict(list)  # flag -> [range name]
        self.candidates = defaultdict(list)  # flag -> [where]
        self.range_list = []  # (name, first, last, how the length was found)
        self.unresolved = []  # (where, what)
        self.trainers_battled = defaultdict(list)  # trainer flag -> [scripted battles, which don't touch it]
        self.indirect_resolved = 0  # variable references the script reading resolved
        self.trainer_vars = 0  # trainer arguments from variables, inside the trainer range

    def use(self, flag, where, original_only=False):
        if flag <= 0:
            return
        (self.original_only if original_only else self.used)[flag].append(where)

    def add_range(self, name, flags, how):
        flags = sorted(set(f for f in flags if f > 0))
        if not flags:
            return
        self.range_list.append((name, flags[0], flags[-1], len(flags), how))
        for f in flags:
            self.ranges[f].append(name)


class PreprocessorState:
    """Tracks whether a line is in code that only the original game builds (#ifndef PAPERWHITE2 or its #else)."""

    def __init__(self):
        self.stack = []

    def feed(self, line):
        s = line.strip()
        m = re.match(r"#\s*(ifdef|ifndef|if|else|elif|endif)\b(.*)", s)
        if not m:
            return False
        kind, rest = m.group(1), m.group(2).strip()
        if kind in ("ifdef", "ifndef", "if"):
            if "PAPERWHITE2" in rest:
                hack = (kind == "ifdef") or (kind == "if" and "!" not in rest)
                self.stack.append("hack" if hack else "orig")
            else:
                self.stack.append("other")
        elif kind in ("else", "elif") and self.stack:
            self.stack[-1] = {"hack": "orig", "orig": "hack"}.get(self.stack[-1], "other")
        elif kind == "endif" and self.stack:
            self.stack.pop()
        return True

    @property
    def original_only(self):
        return "orig" in self.stack


# --- 1. Scripts --------------------------------------------------------------------------------------------------


def global_script_files():
    """Returns {file name: (first id, last id)} from the global script table of script_sys.c."""
    table = {}
    for m in re.finditer(r"\{ (\d+), (\d+), SCRIPTS_(GLOBAL_\d+)", read(path("src", "ov012", "script_sys.c"))):
        table[m.group(3).lower() + ".s"] = (int(m.group(1)), int(m.group(2)))
    return table


def parse_script(p, consts):
    """Returns the instructions of a script file: (line, macro, [args], original_only)."""
    pp = PreprocessorState()
    out = []
    for n, line in enumerate(read(p).splitlines(), 1):
        if pp.feed(line):
            continue
        line = line.split("//")[0].strip()
        if not line or line.endswith(":") or line.startswith("."):
            m = re.match(r"(\w+):$", line)
            if m:
                out.append((n, ":label", [m.group(1)], pp.original_only))
            continue
        m = re.match(r"(\w+)\s*(.*)", line)
        if not m:
            continue
        args = [a.strip() for a in m.group(2).split(",")] if m.group(2) else []
        out.append((n, m.group(1), args, pp.original_only))
    return out


def is_var(v):
    return v is not None and 0x4000 <= v < 0xC000


class Partial:
    """A value known only to be at least one of bases (a base plus an unknown index)."""

    def __init__(self, bases):
        self.bases = frozenset(bases)


ACTOR = "actor"  # an actor's spawn flag, which the zone events give
# The commands that only read their variable arguments
READERS = {"WorkCmpConst", "WorkCmpWork", "VMStackPush", "DebugPrint", "DebugStack", "VMStackPushFlag", "FlagSet",
           "FlagReset", "TrainerFlagSet", "TrainerFlagReset"}
MAX_VALUES = 4096


def find_loops(segment, consts):
    """Returns [(first, last, var, bounds)]: the loops of a segment, a label and a later jump back to it, with each
    variable the loop counts up by a constant and the bounds it is compared with inside the loop (a constant, or
    ("var", variable) for one compared through the stack)."""
    labels = {}
    for k, (_, macro, args, _) in enumerate(segment):
        if macro == ":label":
            labels[args[0]] = k
    loops = []
    for m, (_, macro, args, _) in enumerate(segment):
        if not args or macro == ":label" or args[-1] not in labels or labels[args[-1]] >= m:
            continue
        j = labels[args[-1]]
        body = segment[j:m + 1]
        stepped = set()
        bounds = defaultdict(list)
        for k, (_, mac, ar, _) in enumerate(body):
            a = [eval_expr(x, consts) for x in ar]
            if mac == "WorkAdd" and len(a) == 2 and a[1] is not None and not is_var(a[1]):
                stepped.add(a[0])
            elif mac == "WorkCmpConst" and len(a) == 2 and a[1] is not None:
                bounds[a[0]].append(a[1])
            elif mac == "VMStackPush" and k + 2 < len(body) and body[k + 1][1] == "VMStackPush" \
                    and body[k + 2][1] == "VMStackCmp":
                w = eval_expr(body[k + 1][2][0], consts)
                if is_var(w):
                    bounds[a[0]].append(("var", w))
                elif w is not None:
                    bounds[a[0]].append(w)
        for v in stepped:
            if bounds.get(v):
                loops.append((j, m, v, bounds[v]))
    return loops


def combine(op, left, right):
    if left is None or left == ACTOR or right == ACTOR:
        return None
    if isinstance(left, Partial):
        return left if op == "add" else None
    if right is None or isinstance(right, Partial):
        return Partial(left) if op == "add" else None
    fn = {"add": lambda x, y: x + y, "sub": lambda x, y: x - y, "mul": lambda x, y: x * y}[op]
    out = {fn(x, y) & 0xFFFF for x in left for y in right}
    return frozenset(out) if len(out) <= MAX_VALUES else None


def interpret(instrs, macros, consts):
    """Runs each script of a file in order, keeping the values each variable can hold, and returns the values of
    the variable at each indirect flag or trainer argument: {instruction index: [(var, meaning, values)]}."""
    out = defaultdict(list)
    segments, cur = [], []
    for k, ins in enumerate(instrs):
        if ins[1] == ":label" and re.fullmatch(r"Script_\d+", ins[2][0]) and cur:
            segments.append(cur)
            cur = []
        cur.append((k, ins))
    segments.append(cur)
    file_consts = defaultdict(set)
    for _, macro, args, _ in instrs:
        if macro in ("WorkSetConst", "WorkSet") and len(args) == 2:
            v, c = eval_expr(args[0], consts), eval_expr(args[1], consts)
            if is_var(v) and c and not is_var(c):
                file_consts[v].add(c)
    for seg in segments:
        loops = find_loops([ins for _, ins in seg], consts)
        env = {}

        def value(arg):
            v = eval_expr(arg, consts)
            if v is None:
                return None
            if not is_var(v):
                return frozenset([v])
            return env.get(v)

        def with_loop(pos, var, vals):
            for first, last, v, bounds in loops:
                if v == var and first <= pos <= last and isinstance(vals, frozenset) and vals:
                    limits = []
                    for b in bounds:
                        if isinstance(b, tuple):
                            known = env.get(b[1])
                            if not isinstance(known, frozenset) or not known:
                                return Partial(vals)
                            limits.append(max(known))
                        else:
                            limits.append(b)
                    return frozenset(range(min(vals), max(max(limits), max(vals)) + 1))
            return vals

        for pos, (k, (n, macro, args, orig)) in enumerate(seg):
            a = [eval_expr(x, consts) for x in args]
            _, meanings, types = macros.get(macro, (None, [], []))
            for idx, (arg, meaning) in enumerate(zip(a, meanings)):
                if meaning in ("flag", "trainer") and is_var(arg):
                    vals = with_loop(pos, arg, env.get(arg))
                    if (vals is None or vals == frozenset([0])) and file_consts.get(arg):
                        # Reached through a subroutine its callers set the variable for: every constant the
                        # file gives the variable
                        vals = frozenset(file_consts[arg])
                    out[k].append((arg, meaning, vals))
            if macro in ("WorkSetConst", "WorkSet", "WorkGet") and len(a) == 2:
                env[a[0]] = value(args[1])
            elif macro in ("WorkAdd", "WorkSub", "WorkMul") and len(a) == 2:
                op = {"WorkAdd": "add", "WorkSub": "sub", "WorkMul": "mul"}[macro]
                looped = with_loop(pos, a[0], env.get(a[0]))
                if macro == "WorkAdd" and looped is not env.get(a[0]) and a[1] is not None and not is_var(a[1]):
                    env[a[0]] = looped
                else:
                    env[a[0]] = combine(op, env.get(a[0]), value(args[1]))
            elif macro == "Random" and len(a) == 2 and a[1] is not None and not is_var(a[1]):
                env[a[0]] = frozenset(range(a[1]))
            elif macro == "RTCGetSeason" and a:
                env[a[0]] = frozenset(range(4))
            elif macro == "ActorGetSpawnFlag" and len(a) == 2:
                env[a[1]] = ACTOR
            elif macro not in READERS:
                for arg, t in zip(a, types):
                    if t == "var" and is_var(arg):
                        env[arg] = None
    return out


def script_macros():
    """Returns {macro: (command id, [meaning per argument], [type per argument])}."""
    commands = json.loads(read(path("tools", "script", "field_commands.json")))
    by_handler = {}
    for plugin in commands["plugins"].values():
        for cmd in plugin["commands"].values():
            by_handler[cmd["handler"]] = cmd
    macros = {}
    text = read(path("include", "asm", "field_script.inc"))
    for m in re.finditer(r"\.macro (\w+)[^\n]*\n\s*FieldCommand (\d+)", text):
        name, cid = m.group(1), int(m.group(2))
        cmd = commands["commands"].get(str(cid)) if cid < 1000 else by_handler.get("Scrcmd_" + name)
        if cmd is None and cid >= 1000:
            cmd = next((c for h, c in by_handler.items() if h.endswith("_" + name)), None)
        cmd = cmd or {}
        macros[name] = (cid, cmd.get("meanings", []), cmd.get("args", []))
    return macros


def scan_scripts(refs, consts, space):
    macros = script_macros()
    globals_ = global_script_files()
    files = sorted(glob.glob(path("res", "field", "scripts", "*.s")))
    parsed = {p: parse_script(p, consts) for p in files}
    calls = defaultdict(list)  # script id -> [(file, index)]
    trainer_base = space["trainer"][0]
    for p, instrs in parsed.items():
        for i, (n, macro, args, orig) in enumerate(instrs):
            if macro in ("RTCallGlobal", "RTCallGlobalAsync") and args:
                sid = eval_expr(args[0], consts)
                if sid is not None:
                    calls[sid].append((p, i))
            meanings = macros.get(macro, (None, [], []))[1]
            for arg, meaning in zip(args, meanings):
                if meaning not in ("flag", "trainer"):
                    continue
                v = eval_expr(arg, consts)
                where = f"{rel(p)}:{n} {macro}"
                if v is None:
                    refs.unresolved.append((where, f"argument {arg!r} doesn't evaluate"))
                elif is_var(v):
                    continue  # resolved below
                elif meaning == "flag":
                    refs.use(v, where, orig)
                elif macro in TRAINER_FLAG_COMMANDS:
                    refs.use(trainer_base + v, where + " (trainer)", orig)
                else:
                    refs.trainers_battled[trainer_base + v].append(where)
    for p, instrs in parsed.items():
        for k, uses in interpret(instrs, macros, consts).items():
            n, macro, _, orig = instrs[k]
            for var, meaning, vals in uses:
                where = f"{rel(p)}:{n} {macro} {var:#x}"
                tr = trainer_base if meaning == "trainer" else 0
                if vals == ACTOR:
                    refs.indirect_resolved += 1
                    continue
                if vals is None and var in PARAM_VARS and os.path.basename(p) in globals_:
                    first, last = globals_[os.path.basename(p)]
                    found = False
                    for sid in range(first, last + 1):
                        for cp, ci in calls.get(sid, []):
                            v = caller_param(parsed[cp], ci, var, consts)
                            if v:
                                found = True
                                refs.use(tr + v, f"{rel(cp)}:{parsed[cp][ci][0]} RTCallGlobal {sid} sets "
                                                 f"{var:#x} for {rel(p)}:{n}", orig)
                    if found:
                        refs.indirect_resolved += 1
                        continue
                if meaning == "trainer":
                    if isinstance(vals, frozenset):
                        for v in vals:
                            if macro in TRAINER_FLAG_COMMANDS:
                                refs.use(trainer_base + v, where + f" = trainer {v}", orig)
                            else:
                                refs.trainers_battled[trainer_base + v].append(where)
                        refs.indirect_resolved += 1
                    else:
                        refs.trainer_vars += 1  # inside the trainer range, whatever the trainer
                    continue
                if isinstance(vals, frozenset):
                    flags = sorted(v for v in vals if v)
                    refs.indirect_resolved += 1
                    if len(flags) == 1:
                        refs.use(flags[0], where + f" = {flags[0]:#x}", orig)
                    else:
                        refs.add_range(f"script computed {rel(p)}:{n}", flags,
                                       "the variable's values along the script")
                elif isinstance(vals, Partial):
                    for b in vals.bases:
                        for f in range(b, b + UNKNOWN_WINDOW):
                            refs.candidates[f].append(where)
                    refs.unresolved.append((where, "base " + ", ".join(f"{b:#x}" for b in sorted(vals.bases))
                                            + f" plus an unknown index: {UNKNOWN_WINDOW} flags marked candidates"))
                else:
                    refs.unresolved.append((where, "the variable's value is unknown"))


def caller_param(instrs, ci, var, consts):
    """The constant a caller's WorkSet gives a parameter before RTCallGlobal, looking back in its block."""
    for j in range(ci - 1, max(ci - 20, -1), -1):
        n, macro, args, _ = instrs[j]
        if macro == ":label" or macro in ("VMJump", "VMReturn", "VMEnd", "RTCallGlobal"):
            return None
        if macro in ("WorkSet", "WorkSetConst") and len(args) == 2 and eval_expr(args[0], consts) == var:
            v = eval_expr(args[1], consts)
            return v if v is not None and 0 < v < 0x4000 else None
    return None


# --- 2. Zone events and 3. names in data -------------------------------------------------------------------------


def scan_events(refs, consts):
    for p in sorted(glob.glob(path("res", "field", "events", "*.json"))):
        data = json.loads(read(p))

        def walk(o, where):
            if isinstance(o, dict):
                for k, v in o.items():
                    if "flag" in k.lower() and isinstance(v, (int, str)):
                        f = v if isinstance(v, int) else eval_expr(v, consts)
                        if f is None:
                            refs.unresolved.append((f"{rel(p)} {where}.{k}", f"flag {v!r} doesn't evaluate"))
                        elif f:
                            refs.use(f, f"{rel(p)} {where}.{k}")
                    else:
                        walk(v, f"{where}.{k}")
            elif isinstance(o, list):
                for idx, v in enumerate(o):
                    walk(v, f"{where}[{idx}]")

        walk(data, "")
        for npc in data.get("npcs", []) if isinstance(data, dict) else []:
            s = npc.get("script")
            if isinstance(s, int) and 3000 <= s < 8000:
                # A trainer NPC, whose trainer GetNPCTrainerIDFromSCRID gives: event_trainer_eye.c reads its flag
                # and the trainer scripts of global_3000.s set it
                trainer = s - 3000 if s < 5000 else s - 5000
                refs.use(0x5F0 + trainer, f"{rel(p)} trainer NPC script {s} (trainer {trainer})")


def scan_names(refs, consts):
    """Every EVENT_FLAG_ name outside generated/flags.txt and the scripts (which scan_scripts reads by command)."""
    roots = ["res", "generated", "src", "include", "lib"]
    exts = (".c", ".h", ".json", ".txt", ".s", ".inc", ".csv", ".yaml", ".toml")
    skip = {path("generated", "flags.txt")}
    for root in roots:
        for dirpath, _, files in os.walk(path(root)):
            if "/res/field/scripts" in dirpath or "/res/field/events" in dirpath:
                continue
            for name in files:
                p = os.path.join(dirpath, name)
                if not name.endswith(exts) or p in skip:
                    continue
                text = read(p)
                if "EVENT_FLAG_" not in text:
                    continue
                if name.endswith((".c", ".h")):
                    text = strip_c_comments(text)
                pp = PreprocessorState()
                for n, line in enumerate(text.splitlines(), 1):
                    if pp.feed(line):
                        continue
                    for m in re.finditer(r"\bEVENT_FLAG_\w+", line):
                        if m.group(0) in consts and m.group(0) not in ("EVENT_FLAG_TEMP_0",):
                            if re.search(r"#define\s+" + m.group(0) + r"\b", line):
                                continue
                            refs.use(consts[m.group(0)], f"{rel(p)}:{n} {m.group(0)}", pp.original_only)


# --- 4. C calls --------------------------------------------------------------------------------------------------

FLAG_FUNCS = {"EventWork_FlagGet": 1, "EventWork_FlagSet": 1, "EventWork_FlagReset": 1}
# The trainer flag functions of trainer_script.c, which add 0x5f0 to their trainer argument
TRAINER_FUNCS = {"TrainerFlagGet": 1, "setTrainerBattleFlag": 1, "clearTrainerBattleFlag": 1}
# The script commands that read or write a trainer's flag; the others that take a trainer (CallTrainerBattle and
# the messages) don't touch it
TRAINER_FLAG_COMMANDS = {"TrainerFlagSet", "TrainerFlagReset", "TrainerFlagGet"}


def split_args(text, start):
    """Splits the arguments of a call whose '(' is at start; returns ([args], end)."""
    depth, args, cur, i = 0, [], "", start
    while i < len(text):
        c = text[i]
        if c in "([{":
            depth += 1
            if depth > 1:
                cur += c
        elif c in ")]}":
            depth -= 1
            if depth == 0:
                args.append(cur.strip())
                return args, i
            cur += c
        elif c == "," and depth == 1:
            args.append(cur.strip())
            cur = ""
        else:
            cur += c
        i += 1
    return args, i


def c_files():
    for root in ("src", "include", "lib"):
        for dirpath, _, files in os.walk(path(root)):
            for name in files:
                if name.endswith((".c", ".h")):
                    yield os.path.join(dirpath, name)


def c_defines(text):
    defs = {}
    for m in re.finditer(r"^\s*#\s*define\s+(\w+)[ \t]+([^\n]+)", text, re.M):
        defs[m.group(1)] = m.group(2).strip()
    for m in re.finditer(r"\benum\s*\w*\s*\{([^}]*)\}", text):
        n = 0
        for item in m.group(1).split(","):
            item = item.strip()
            if not item:
                continue
            mm = re.match(r"(\w+)\s*(?:=\s*(.+))?$", item, re.S)
            if not mm:
                break
            if mm.group(2):
                v = eval_expr(mm.group(2), {})
                if v is None:
                    break
                n = v
            defs[mm.group(1)] = str(n)
            n += 1
    for m in re.finditer(r"\bconst\s+int\s+(\w+)\s*=\s*(\w+)\s*;", text):
        defs[m.group(1)] = m.group(2)
    return defs


def resolve_names(defs, consts):
    names = dict(consts)
    for _ in range(4):
        for k, v in defs.items():
            if k not in names:
                r = eval_expr(v, names)
                if r is not None:
                    names[k] = r
    return names


def enclosing_function(text, pos):
    best = None
    for m in re.finditer(r"^[A-Za-z_][\w \t\*]*?\b(\w+)\s*\(([^;{)]*)\)\s*\{", text[:pos], re.M):
        best = m
    if not best:
        return None, []
    params = [re.findall(r"\w+", p)[-1] if re.findall(r"\w+", p) else "" for p in best.group(2).split(",")]
    return best.group(1), params


def scan_c(refs, consts):
    texts = {p: strip_c_comments(read(p)) for p in c_files()}
    header_defs = {}
    for p, t in texts.items():
        if p.endswith(".h"):
            header_defs.update(c_defines(t))
    names_global = resolve_names(header_defs, consts)
    names_by_file = {p: resolve_names(c_defines(t), names_global) for p, t in texts.items()}
    funcs = dict(FLAG_FUNCS)
    funcs.update(TRAINER_FUNCS)
    seen_wrappers = set()
    computed = []  # (where, expression)
    data_driven = []
    for _ in range(3):  # wrappers of wrappers
        computed.clear()
        data_driven.clear()
        pattern = re.compile(r"\b(" + "|".join(map(re.escape, funcs)) + r")\s*\(")
        for p, text in texts.items():
            names = names_by_file[p]
            for m in pattern.finditer(text):
                before = text[max(0, m.start() - 40):m.start()]
                if re.search(r"(BOOL|void|u32|u16|static|int)\s+$", before):
                    continue  # the definition or a prototype
                args, _ = split_args(text, m.end() - 1)
                idx = funcs[m.group(1)]
                if idx >= len(args):
                    continue
                arg = args[idx]
                where = f"{rel(p)}:{line_of(text, m.start())} {m.group(1)}"
                v = eval_expr(arg, names)
                if v is not None:
                    if m.group(1) in TRAINER_FUNCS:
                        refs.use(0x5F0 + v, where + f" (trainer {v})")
                    else:
                        refs.use(v, where)
                    continue
                func, params = enclosing_function(text, m.start())
                if arg in params and func and func not in funcs:
                    funcs[func] = params.index(arg)
                    seen_wrappers.add((func, params.index(arg)))
                    continue
                if arg in params:
                    continue
                if re.search(r"[+-]", arg) and any(eval_expr(t, names) is not None
                                                   for t in re.split(r"[+-]", arg.replace("(", "").replace(")", ""))):
                    computed.append((where, arg))
                else:
                    data_driven.append((where, arg))
    return computed, data_driven, sorted(seen_wrappers)


# --- 5. Tables and computed ranges -------------------------------------------------------------------------------

# C tables that hold flags: (file, table name, column of the flag in each row, or None for a flat array, offset)
C_TABLES = [
    ("src/ov065/scrcmd_pokemon_center.c", "sMedalsByFlag", 1, 0),
    ("src/ov065/scrcmd_pokemon_center.c", "flags", None, 0),
    ("src/system/field_sound.c", "ZONE_WK_BGM_MAP", 0, 0),
    ("src/ov036/field_palace_sys.c", "ENTRALINK_WORLD_ZONES", 1, 0),
    ("src/system/zone_weather.c", "ENTRALINK_WEATHER_FLAG_ZONE_LOOKUP", 1, 0),
    ("src/ov298/pokedex_detail_map.c", "sPokedexDetailMapPlaceFlags", 0, 0),
    ("src/ov302/pokedex_common.c", "sPokedexHabitats", 0, 0),
    ("src/ov012/trainer_script.c", "sRebattleTrainers", None, 0x5F0),
    ("src/ov012/respawn_zone.c", "RESPAWN_ZONE_INFO", 0, 0),
]
# The C sites that C_TABLES or computed_ranges() account for, by file and argument
RESOLVED_SITES = {
    ("src/ov065/scrcmd_pokemon_center.c", "sMedalsByFlag[j].flag"),
    ("src/ov065/scrcmd_pokemon_center.c", "flags[i]"),
    ("src/system/field_sound.c", "ZONE_WK_BGM_MAP[i].flag"),
    ("src/ov036/field_palace_sys.c", "ENTRALINK_WORLD_ZONES[index].flag"),
    ("src/system/zone_weather.c", "ENTRALINK_WEATHER_FLAG_ZONE_LOOKUP[i].flag"),
    ("src/ov298/pokedex_detail_map.c", "flag"),
    ("src/ov302/pokedex_common.c", "entry->flag"),
    ("src/ov012/trainer_script.c", "sRebattleTrainers[i] + 0x5f0"),
    ("src/ov012/trainer_script.c", "(trainerId + 0x5f0)"),
    ("src/ov012/eventdata_system.c", "flag"),  # GetHiddenItemEventFlagNoBySCRID: the hidden items
    ("src/ov012/hidden_item.c", "item->index + HIDDEN_ITEM_FLAG_START"),
    ("src/ov086/dowsing.c", "hit->item->index + HIDDEN_ITEM_FLAG_START"),
    ("src/ov036/fes_gimmick.c", "flag"),
    ("src/ov012/survey.c", "question + FLAG_SURVEY_DONE_BASE"),
    ("src/ov091/gym_insect.c", "FLAG_OBJECT_0 + i"),
    ("src/ov309/fmission_log_accessor_fapp.c", "festival->missionHeader->unk02"),
    ("src/ov143/monolith_mission_select.c", "mfw->missions[index].params.unk10"),
    ("src/ov143/monolith_mission_select.c", "mfw->missions[index].params.unk12"),
    ("src/ov084/beacon_view_sub.c", "config->info.requiredFlag"),
    ("src/ov104/field_gimmick_gate.c", "work->boardEntries[i].flagId"),
    ("src/ov104/field_gimmick_gate.c", "list->flags[i]"),  # GimmickGate_AddMessage's flags, from the boards
    ("src/ov012/scrcmd_vm.c", "flag"),  # the script commands, which scan_scripts reads
    ("src/ov051/scrcmd_pleasure_boat.c", "ScriptReadAny(vm, env)"),  # a script command too
    ("src/ov012/respawn_zone.c", "info->discoveryFlagId"),
    ("src/ov012/field_actor.c", "npcs->spawnFlag"),  # the zone events' NPC flags
    ("src/ov104/field_gimmick_gate.c", "entry->flagId"),
    ("src/ov144/townmap.c", "flag"),  # the town map's arrival_flag and shown_by, by name
    ("src/ov303/pokedex_habitat_graphic.c", "flag"),  # the town map's shown_by
    ("src/system/event_work.c", "flag"),  # EventWork_FlagResetRange's loop
    ("src/ov012/scrcmd_game_state.c", "trainerId"),  # the TrainerFlag script commands
    ("src/ov036/event_trainer_eye.c", "GetNPCTrainerID(actor)"),  # the trainer NPCs
    ("src/ov094/gym_mistralton.c", "GetNPCTrainerID(actor)"),
    ("src/ov012/scrcmd_stadium.c", "trainers[i].trainerId"),  # the stadium trainers
}


def table_values(p, table, column, names):
    text = strip_c_comments(read(path(p)))
    values = []
    for m in re.finditer(r"\b" + re.escape(table) + r"\s*\[[^\]]*\]\s*=\s*\{", text):
        body, _ = split_args(text, m.end() - 1)
        for row in body:
            if column is None:
                items = [row]
            else:
                inner = row.strip()
                if not inner.startswith("{"):
                    continue
                items, _ = split_args(inner, 0)
                if column >= len(items):
                    continue
                items = [items[column]]
            for item in items:
                v = eval_expr(item, names)
                if v is not None:
                    values.append((v, line_of(text, m.start())))
    return values


def narc_files(p):
    """Returns the files of a NARC archive."""
    data = open(p, "rb").read()
    assert data[:4] == b"NARC"
    off = struct.unpack_from("<H", data, 12)[0]
    btaf_size, count = struct.unpack_from("<II", data, off + 4)
    entries = [struct.unpack_from("<II", data, off + 12 + 8 * i) for i in range(count)]
    btnf = off + btaf_size
    gmif = btnf + struct.unpack_from("<I", data, btnf + 4)[0]
    return [data[gmif + 8 + s:gmif + 8 + e] for s, e in entries]


def arc_path(arc_id):
    s = f"{arc_id:03d}"
    return os.path.join(EXTRACT, "a", s[0], s[1], s[2])


def computed_ranges(refs, consts):
    names_trainer = load_constant_list(path("generated", "trainers.txt"))
    count = len(names_trainer)
    refs.add_range("trainer defeated (0x5f0 + trainer ID)", range(0x5F0 + 1, 0x5F0 + count),
                   f"generated/trainers.txt: {count} trainers, ID 0 is TRAINER_NONE")
    hidden = read(path("src", "ov012", "hidden_item.c"))
    indices = [int(m.group(1), 0) for m in re.finditer(r"^\s*\{\s*(\d+),", hidden, re.M)]
    refs.add_range("hidden item (0xb04 + HIDDEN_ITEMS[].index)", [0xB04 + i for i in indices],
                   f"src/ov012/hidden_item.c: {len(indices)} entries")
    fes = read(path("src", "ov036", "fes_gimmick.c"))
    first = int(re.search(r"#define FIRST_MISSION_FLAG (\w+)", fes).group(1), 0)
    n = int(re.search(r"#define MISSION_FLAG_COUNT (\w+)", fes).group(1), 0)
    refs.add_range("Funfest mission flags cleared by ClearFesEventFlags", range(first, first + n),
                   "src/ov036/fes_gimmick.c: FIRST_MISSION_FLAG, MISSION_FLAG_COUNT")
    survey = read(path("src", "ov012", "survey.c"))
    base = int(re.search(r"#define FLAG_SURVEY_DONE_BASE (\w+)", survey).group(1), 0)
    table = survey[survey.index("data_ov012_0216dad0[] = {"):]
    questions = len(re.findall(r"^\s*\{\d", table[:table.index("};")], re.M))
    refs.add_range("survey done (FLAG_SURVEY_DONE_BASE + question)", range(base, base + questions),
                   f"src/ov012/survey.c: {questions} questions")
    gym = read(path("src", "ov091", "gym_insect.c"))
    base = int(re.search(r"#define FLAG_OBJECT_0 (\w+)", gym).group(1), 0)
    n = int(re.search(r"#define OBJECT_COUNT (\w+)", gym).group(1), 0)
    refs.add_range("Castelia Gym objects (FLAG_OBJECT_0 + i)", range(base, base + n),
                   "src/ov091/gym_insect.c: OBJECT_COUNT")
    # The Funfest missions, archive 0x121: file 0 the 4-byte headers (unk02 the flag a clear sets), file 1 the
    # 0x28-byte parameters (unk10 and unk12 the flags a mission needs)
    p = arc_path(0x121)
    if os.path.exists(p):
        files = narc_files(p)
        for i in range(len(files[0]) // 4):
            v = struct.unpack_from("<H", files[0], i * 4 + 2)[0]
            refs.use(v, f"{rel(p)} file 0 mission {i} header unk02 (set on clear)")
        for i in range(len(files[1]) // 0x28):
            for off, what in ((0x10, "unk10"), (0x12, "unk12 requiredFlag")):
                v = struct.unpack_from("<H", files[1], i * 0x28 + off)[0]
                refs.use(v, f"{rel(p)} file 1 mission {i} params {what}")
    else:
        refs.unresolved.append((rel(p), "missing: the Funfest missions' flags are not read"))
    # The stadium trainers, archive 0xce file 0: 8-byte entries, trainerId at 6 (StadiumTrainerEntry); their NPCs get
    # trainer scripts (SetZoneNPCSCRID) and StadiumResetTrainerFlags clears their flags
    p = arc_path(0xCE)
    if os.path.exists(p):
        data = narc_files(p)[0]
        for i in range(len(data) // 8):
            t = struct.unpack_from("<H", data, i * 8 + 6)[0]
            refs.use(0x5F0 + t, f"{rel(p)} stadium trainer {i} (trainer {t})")
    else:
        refs.unresolved.append((rel(p), "missing: the stadium trainers' flags are not read"))
    # The gate boards, archive 0xa4: 0x24 bytes each, flagId at 4
    p = arc_path(0xA4)
    if os.path.exists(p):
        for i, f in enumerate(narc_files(p)):
            if len(f) >= 8:
                refs.use(struct.unpack_from("<I", f, 4)[0], f"{rel(p)} file {i} gate board flagId")
    else:
        refs.unresolved.append((rel(p), "missing: the gate boards' flags are not read"))


def scan_c_tables(refs, consts):
    header_defs = {}
    for p in glob.glob(path("include", "**", "*.h"), recursive=True):
        header_defs.update(c_defines(strip_c_comments(read(p))))
    names = resolve_names(header_defs, consts)
    for p, table, column, offset in C_TABLES:
        local = resolve_names(c_defines(strip_c_comments(read(path(p)))), names)
        for v, line in table_values(p, table, column, local):
            refs.use(v + offset, f"{p}:{line} {table}")


# --- Output ------------------------------------------------------------------------------------------------------


def load_user_list(p):
    flags = {}
    with open(p, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            key = row.get("Flag ID (Hex)") or ""
            if key.strip():
                flags[int(key, 16)] = (row.get("Notes") or "").strip()
    return flags


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--csv", default=None, help="where to write the per-flag CSV (default: print the summary only)")
    ap.add_argument("--user-list", default=None, help="a CSV of flags believed unused, to cross-check")
    ap.add_argument("--quiet", action="store_true", help="don't list the unresolved references")
    args = ap.parse_args()

    consts = load_constants()
    space = flag_space(consts)
    refs = Refs()
    scan_scripts(refs, consts, space)
    scan_events(refs, consts)
    scan_names(refs, consts)
    computed, data_driven, wrappers = scan_c(refs, consts)
    scan_c_tables(refs, consts)
    computed_ranges(refs, consts)
    for where, arg in computed + data_driven:
        key = (where.split(":")[0], arg)
        if key not in RESOLVED_SITES:
            refs.unresolved.append((where, f"C argument {arg!r} not resolved"))

    names = {v: k for k, v in load_constant_list(path("generated", "flags.txt")).items()}
    all_flags = list(range(space["saved"][0], space["saved"][1] + 1)) + list(range(space["temp"][0], space["temp"][1] + 1))
    rows = []
    for f in all_flags:
        if refs.used.get(f):
            status, detail = "used", "; ".join(sorted(set(refs.used[f]))[:4])
            if len(set(refs.used[f])) > 4:
                detail += f"; +{len(set(refs.used[f])) - 4} more"
        elif refs.ranges.get(f):
            status, detail = "range", "; ".join(sorted(set(refs.ranges[f])))
            if space["trainer"][0] < f <= space["trainer"][1]:
                if refs.trainers_battled.get(f):
                    detail += " (no code reads or sets it; only battled by " + \
                              "; ".join(sorted(set(refs.trainers_battled[f]))[:2]) + ", which doesn't touch it)"
                else:
                    detail += " (no code reads or sets it, and no script battles the trainer)"
        elif refs.candidates.get(f):
            status, detail = "indirect-candidate", "; ".join(sorted(set(refs.candidates[f]))[:3])
        else:
            status, detail = "unused", ""
        if refs.original_only.get(f) and status in ("unused", "indirect-candidate"):
            detail = ("only in original-game code (#ifndef PAPERWHITE2): " +
                      "; ".join(sorted(set(refs.original_only[f]))[:2]) + (" | " + detail if detail else ""))
        rows.append((f, names.get(f, ""), region_of(f, space), status, detail))

    if args.csv:
        with open(args.csv, "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["flag_hex", "flag", "name", "region", "status", "where"])
            for f, name, region, status, detail in rows:
                w.writerow([f"{f:#05x}", f, name, region, status, detail])

    counts = defaultdict(int)
    for r in rows:
        counts[r[3]] += 1
    print("Flag space: saved {:#x}-{:#x} ({} flags, 0 is no flag), temporary {:#x}-{:#x} ({})".format(
        *space["saved"], space["saved"][1], *space["temp"], space["temp"][1] - space["temp"][0] + 1))
    print("  map-local {:#x}-{:#x}, trainer {:#x}-{:#x}, daily {:#x}-{:#x}, hidden item {:#x}-{:#x}".format(
        *space["local"], *space["trainer"], *space["daily"], *space["hidden"]))
    print("Statuses: " + ", ".join(f"{k} {counts[k]}" for k in ("used", "range", "indirect-candidate", "unused")))
    print("Computed ranges:")
    seen = set()
    for name, first, last, n, how in refs.range_list:
        if (name, first, last) in seen:
            continue
        seen.add((name, first, last))
        print(f"  {first:#05x}-{last:#05x} ({n}) {name} [{how}]")
    print("Wrappers found: " + ", ".join(f"{f} (argument {i})" for f, i in wrappers))
    unused = [r[0] for r in rows if r[3] == "unused"]
    print(f"Unused ({len(unused)}): " + compress(unused))
    no_trainer = [r[0] for r in rows if "no code reads or sets it" in r[4]]
    print(f"Trainer flags no code reads or sets ({len(no_trainer)}): " + compress(no_trainer))
    battled = [r[0] for r in rows if "only battled by" in r[4]]
    print(f"  of which the trainer is battled by a script's CallTrainerBattle ({len(battled)}): " + compress(battled))
    print(f"Script variable references: {refs.indirect_resolved} resolved, {refs.trainer_vars} trainer arguments "
          f"from variables left inside the trainer range")
    orig = [r[0] for r in rows if r[4].startswith("only in original")]
    if orig:
        print(f"Referenced only by original-game code ({len(orig)}): " + compress(orig))
    if not args.quiet:
        print(f"Unresolved ({len(refs.unresolved)}):")
        for where, what in refs.unresolved:
            print(f"  {where}: {what}")
    if args.user_list:
        user = load_user_list(args.user_list)
        status = {r[0]: r for r in rows}
        wrong = [f for f in sorted(user) if status.get(f) and status[f][3] != "unused"]
        missing = [f for f in unused if f not in user]
        print(f"User list: {len(user)} flags; not unused per this tool ({len(wrong)}):")
        for f in wrong:
            print(f"  {f:#05x} {status[f][3]}: {status[f][4][:150]}")
        print(f"Unused flags not on the user list ({len(missing)}): " + compress(missing))
    return 0


def compress(flags):
    """Writes a sorted list of flags as hex ranges."""
    out, start, prev = [], None, None
    for f in flags:
        if start is None:
            start = prev = f
        elif f == prev + 1:
            prev = f
        else:
            out.append(f"{start:#x}" if start == prev else f"{start:#x}-{prev:#x}")
            start = prev = f
    if start is not None:
        out.append(f"{start:#x}" if start == prev else f"{start:#x}-{prev:#x}")
    return ", ".join(out)


if __name__ == "__main__":
    sys.exit(main())
