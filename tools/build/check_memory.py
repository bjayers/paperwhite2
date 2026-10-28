#!/usr/bin/env python3
"""Paper White 2: check that the linked program still fits in memory, and say how much room is left.

    check_memory.py build/w2_us/arm9_paperwhite2.lcf build/w2_us/arm9.o.xMAP build/w2_us/memory.txt [OV036 ...]

On a DS the main arena, where the game makes its heaps, begins at the end of the highest overlay in main memory
(SDK_MAIN_ARENA_LO, which tools/build/plugin_lcf.py defines) and ends at 0x023e0000 (NitroSDK's OS_GetInitArenaHi). The
game takes heaps of a fixed size from it at boot (HEAP_SETUP_NTR in src/system/gfl_use.c) and a few tables, and the rest
is unused, so code and data can grow by that much in all before the heaps run past the arena's end. On a DSi the
arena begins after the LTD module, whose place is fixed (0x02700000), so the overlays must end below that module.

For each module named, it also gives how much the module can grow before the end of the highest overlay placed after
it rises, which costs the DS arena from then on: ARM9 main's growth always does, an overlay's only once it and the
overlays after it reach the top. It writes the report to the output and fails when the program doesn't fit.
"""
import argparse
import re
import sys
from pathlib import Path

DS_ARENA_HI = 0x023E0000
LTD_MODULE_START = "LTD_AUTOLOAD_0_TEXT_START"
# What the game allocates from the DS arena at boot: its two root heaps (gfl_use.c's HEAP_SETUP_NTR), and about 8 KB
# for the OS allocator's header, the file system's tables (FS_TryLoadTable: 0x19a0 bytes for the original's files)
# and the heap manager's tables (GFL_HeapMgrInit)
DS_HEAPS = 0x6000 + 0x1A3E00
DS_TABLES = 0x2000
MEMORY_LINE = re.compile(r"^\s+([0-9A-F]{8}) [0-9A-F]{8} ([0-9A-F]{8}) (\S+)$", re.M)
LCF_SYMBOL = re.compile(r"^#>([0-9A-F]{8})\s+(\w+) \(linker command file\)$", re.M)
MEMORY_AFTER = re.compile(r"^\s+(\w+) : ORIGIN = AFTER\(([^)]*)\)", re.M)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("lcf", type=Path, help="the linker script of the link")
    parser.add_argument("map", type=Path, help="mwldarm's map of the link (arm9.o.xMAP)")
    parser.add_argument("output", type=Path)
    parser.add_argument("modules", nargs="*", help="modules to report the growth of, by region name (OV036)")
    args = parser.parse_args()

    text = args.map.read_text(errors="replace")
    memory_map = text[text.rindex("# Memory map:"):]
    regions = {name: (int(addr, 16), int(size, 16)) for addr, size, name in MEMORY_LINE.findall(memory_map)}
    symbols = {name: int(addr, 16) for addr, name in LCF_SYMBOL.findall(text)}
    if "SDK_MAIN_ARENA_LO" not in symbols:
        sys.exit(f"{args.map}: no SDK_MAIN_ARENA_LO, see tools/build/plugin_lcf.py")
    arena_lo = symbols["SDK_MAIN_ARENA_LO"]
    ltd_start = symbols[LTD_MODULE_START]

    children: dict[str, list[str]] = {}
    for name, parents in MEMORY_AFTER.findall(args.lcf.read_text()):
        for parent in parents.split(","):
            children.setdefault(parent.strip(), []).append(name)

    def highest_after(module: str) -> int:
        seen, pending = {module}, [module]
        while pending:
            for child in children.get(pending.pop(), []):
                if child not in seen and child not in ("SPACE", "MAIN_ARENA"):
                    seen.add(child)
                    pending.append(child)
        return max(regions[m][0] + regions[m][1] for m in seen if m in regions)

    ds_free = DS_ARENA_HI - (arena_lo + DS_HEAPS + DS_TABLES)
    dsi_free = ltd_start - arena_lo
    main_end = regions["ARM9"][0] + regions["ARM9"][1]
    report = [
        f"ARM9 main: {regions['ARM9'][0]:#010x}-{main_end:#010x}, {regions['ARM9'][1]:#x} bytes with its .bss",
        f"Main arena on a DS: begins at {arena_lo:#010x} (SDK_MAIN_ARENA_LO), heaps and tables end about "
        f"{arena_lo + DS_HEAPS + DS_TABLES:#010x}, {ds_free:#x} ({ds_free // 1024} KB) left before {DS_ARENA_HI:#010x}",
        f"Overlays on a DSi: end at {arena_lo:#010x}, {dsi_free:#x} ({dsi_free // 1024} KB) left before the LTD module "
        f"at {ltd_start:#010x}",
    ]
    for module in ["ARM9", *args.modules]:
        if module not in regions:
            sys.exit(f"no module {module} in {args.map}")
        free = arena_lo - highest_after(module)
        start, size = regions[module]
        report.append(f"{module}: {start:#010x}-{start + size:#010x}, {size:#x} bytes; grows {free:#x} bytes before "
                      "the arena moves")
    args.output.write_text("\n".join(report) + "\n")

    errors = []
    if ds_free < 0:
        errors.append(f"the DS heaps end {-ds_free:#x} bytes past the main arena's end")
    if dsi_free < 0:
        errors.append(f"the overlays end {-dsi_free:#x} bytes into the DSi's LTD module")
    if errors:
        sys.exit("\n".join(report + ["The program doesn't fit in memory: " + "; ".join(errors)]))
    print(report[1])


if __name__ == "__main__":
    main()
