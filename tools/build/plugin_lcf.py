#!/usr/bin/env python3
"""Paper White 2: link the hack's own objects, from src/paperwhite2/, into their modules.

    plugin_lcf.py build/w2_us/arm9.lcf build/w2_us/objects.txt \\
        build/w2_us/arm9_paperwhite2.lcf build/w2_us/objects_paperwhite2.txt \\
        --object OV036=build/w2_us/src/paperwhite2/ov036/paperwhite2_field.o

dsd's linker script names every object of every section of every module. This places each new object's sections after
the module's original objects in the same section (.text, .rodata, .data, .bss), so that the module's original code and
data keep their offsets in it and only what is placed after the module moves, which every pointer to it reaches by a
relocation, as with configure.py --shift. The object goes at the end of its module's objects in dsd's object list too,
in the overlay's -overlay group for an overlay, so that mwldarm gives it the module's long-branch veneers.

It also defines SDK_MAIN_ARENA_LO, the SDK's symbol for where the main arena begins on a DS: the end of the highest
overlay in main memory. dsd's script has no such symbol, and NitroSDK's OS_GetInitArenaLo reads OV290_BSS_END, the end
of the overlay that is highest in the original (lib/nitro/include/nitro/os.h). Once an overlay that is placed after
another one grows, it can end above overlay 290, in the heaps, so the hack's build reads this symbol instead. It is set
in an empty section of a memory region that comes after every overlay placed after ARM9 main, as dsd's SPACE comes
after every module.
"""
import argparse
import re
import struct
import sys
from pathlib import Path

# The sections that a game source compiled by MWCC has, in the order that dsd's script places them in a module
SECTIONS = {".text": "TEXT", ".rodata": "RODATA", ".data": "DATA", ".bss": "BSS"}
SHF_ALLOC = 2
MEMORY_AFTER = re.compile(r"^\s+(\w+) : ORIGIN = AFTER\(([^)]*)\)", re.M)
ARENA_REGION = "MAIN_ARENA"


def allocated_sections(path: Path) -> list[str]:
    """Returns the names of an ELF object's sections that take memory, in their order in the file."""
    data = path.read_bytes()
    if data[:4] != b"\x7fELF" or data[4] != 1 or data[5] != 1:
        sys.exit(f"{path}: not a little-endian 32-bit ELF object")
    shoff, = struct.unpack_from("<I", data, 0x20)
    shentsize, shnum, shstrndx = struct.unpack_from("<HHH", data, 0x2e)
    headers = [struct.unpack_from("<IIIIII", data, shoff + i * shentsize) for i in range(shnum)]
    strings = headers[shstrndx][4]
    names = []
    for name, _type, flags, _addr, _offset, _size in headers:
        if flags & SHF_ALLOC:
            end = data.index(b"\0", strings + name)
            names.append(data[strings + name:end].decode())
    return names


def place_objects(lines: list[str], objects: list[tuple[str, Path]]) -> list[str]:
    """Adds each object's sections at the end of the same sections of its module."""
    placed = set(re.findall(r"^\s*(\S+\.o)\(", "\n".join(lines), re.M))
    additions: dict[tuple[str, str], list[str]] = {}
    for module, path in objects:
        if path.name in placed:
            sys.exit(f"{path}: the linker script names objects by their file name alone, and {path.name} is taken; "
                     "give the source file another name")
        placed.add(path.name)
        names = allocated_sections(path)
        unplaced = sorted(set(names) - set(SECTIONS))
        if unplaced:
            sys.exit(f"{path}: has sections {', '.join(unplaced)}, which only {', '.join(SECTIONS)} are placed of")
        for section, kind in SECTIONS.items():
            if section in names:
                additions.setdefault((module, kind), []).append(f"{path.name}({section})")

    out = []
    found = set()
    for line in lines:
        # A module without a .data section, such as overlay 303, gets one after its constructors, where dsd places it in
        # the modules that have one, when an added object has data
        ctor = re.fullmatch(r"(\s*)(\w+?)_CTOR_END = \.;", line)
        if ctor and (ctor.group(2), "DATA") in additions and not any(
                re.fullmatch(rf"\s*{ctor.group(2)}_DATA_END = \.;", other) for other in lines):
            indent, module = ctor.group(1), ctor.group(2)
            found.add((module, "DATA"))
            out.append(line)
            out += [f"{indent}. = ALIGN(4);", f"{indent}{module}_DATA_START = .;",
                    *[f"{indent}{entry}" for entry in additions[(module, "DATA")]],
                    f"{indent}. = ALIGN(4);", f"{indent}{module}_DATA_END = .;"]
            continue
        match = re.fullmatch(r"\s*(\w+?)_(TEXT|RODATA|DATA|BSS)_END = \.;", line)
        if match and (match.group(1), match.group(2)) in additions:
            key = (match.group(1), match.group(2))
            found.add(key)
            indent = line[: len(line) - len(line.lstrip())]
            # Before the alignment that ends the section
            at = len(out) - 1 if out and out[-1].strip().startswith(". = ALIGN(") else len(out)
            out[at:at] = [f"{indent}{entry}" for entry in additions[key]]
        out.append(line)
    missing = sorted(set(additions) - found)
    if missing:
        sys.exit("no such section in the linker script: " + ", ".join(f"{module}_{kind}" for module, kind in missing))
    return out


def add_arena_symbol(lines: list[str]) -> list[str]:
    """Adds the empty region after every overlay in main memory, and SDK_MAIN_ARENA_LO at its origin."""
    text = "\n".join(lines)
    children: dict[str, list[str]] = {}
    for name, parents in MEMORY_AFTER.findall(text):
        for parent in parents.split(","):
            children.setdefault(parent.strip(), []).append(name)
    after_main, pending = [], ["ARM9"]
    while pending:
        for child in children.get(pending.pop(), []):
            if child not in after_main and child != "SPACE":
                after_main.append(child)
                pending.append(child)
    if not after_main:
        sys.exit("no overlay is placed after ARM9 main in the linker script")
    out = []
    for line in lines:
        if re.match(r"\s+SPACE : ORIGIN = ", line):
            indent = line[: len(line) - len(line.lstrip())]
            out.append(f"{indent}{ARENA_REGION} : ORIGIN = AFTER({', '.join(after_main)})")
        elif re.match(r"\s+SDK_AUTOLOAD_START = ", line):
            # The symbol is set in a section of the region: ADDR() of a region, as dsd's __CODE_HI = ADDR(SPACE) does,
            # gives an address from before the overlays are placed in the end
            indent = line[: len(line) - len(line.lstrip())]
            out += [f"{indent}.{ARENA_REGION.lower()} : {{", f"{indent}    SDK_MAIN_ARENA_LO = .;",
                    f"{indent}}} > {ARENA_REGION}", ""]
        out.append(line)
    if sum(line.strip() == f"}} > {ARENA_REGION}" or line.strip().startswith(f"{ARENA_REGION} : ")
           for line in out) != 2:
        sys.exit("the linker script has no SPACE region or SDK_AUTOLOAD_START symbol to add SDK_MAIN_ARENA_LO beside")
    return out


def add_objects(lines: list[str], objects: list[tuple[str, Path]]) -> list[str]:
    """Adds each object at the end of its module's objects in dsd's object list."""
    out = list(lines)
    for module, path in objects:
        entry = f'"{path.as_posix()}"'
        if module == "ARM9":
            at = next((i for i, line in enumerate(out) if line.startswith("-overlaygroup ")), len(out))
        else:
            start = next((i for i, line in enumerate(out) if line == f"-overlay {module}"), None)
            if start is None:
                sys.exit(f"{path}: no overlay {module} in the object list")
            at = start + 1
            while at < len(out) and not out[at].startswith("-"):
                at += 1
        out.insert(at, entry)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("lcf", type=Path, help="dsd's linker script")
    parser.add_argument("objects", type=Path, help="dsd's objects.txt")
    parser.add_argument("lcf_output", type=Path)
    parser.add_argument("objects_output", type=Path)
    parser.add_argument("--object", action="append", default=[], metavar="MODULE=PATH",
                        help="an object and its module's name in the linker script (ARM9, OV036)")
    args = parser.parse_args()

    objects = []
    for spec in args.object:
        module, _, path = spec.partition("=")
        if not re.fullmatch(r"ARM9|OV\d{3}", module) or not path:
            parser.error(f"--object {spec}: expected ARM9=PATH or OVNNN=PATH")
        objects.append((module, Path(path)))

    lcf = add_arena_symbol(place_objects(args.lcf.read_text().splitlines(), objects))
    args.lcf_output.write_text("\n".join(lcf) + "\n")
    object_lines = [line for line in args.objects.read_text().splitlines() if line]
    args.objects_output.write_text("\n".join(add_objects(object_lines, objects)) + "\n")


if __name__ == "__main__":
    main()
