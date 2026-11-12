#!/usr/bin/env python3
"""Paper White 2's Pokédex save, read and upgraded offline (docs/paperwhite2/design/save-expansion.md).

    pokedex_save.py inspect SAV             # both copies' footers and the Pokédex, from the area and the original block
    pokedex_save.py verify SAV              # every block's CRC, the CRC tables and the footers, in both copies
    pokedex_save.py upgrade SAV OUT         # what the game does on load and at the next save, written to OUT

SAV is a 512 KB White 2 save (melonDS's raw .sav, a flashcart's or nds-bootstrap's). The hack keeps its Pokédex in
the Pal Pad's block (0x1f), an area of 1504 species and 1024 forms a list whose layout is PokeDexSave
(include/save/pokedex_savedata.h); the original block (0x36, PokeDexVanillaSave) is the source of an old save's upgrade
and the area's mirror, which each save writes for species 1 to 649.

`upgrade` does what src/paperwhite2/main/paperwhite2_pokedex_save.c does: in a copy whose area has no magic, builds
the area from the original block (the same species bits and languages, the form bits remapped from the original
block's form list to the ROM's, POKEDEX_FORM_LIST from res/pokemon); in one whose area has another directory, remaps
its form bits; then writes the area back into the original block, as the game does before it saves. It rewrites the
two blocks' CRCs (their footers and the CRC table) and the footer's CRC in each copy, and leaves the counts as they
are. It never writes the file it reads. Standard library only.
"""
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
# pokemon_forms and pokemon_graphics import their siblings by name
sys.path.insert(1, str(ROOT / "tools" / "data"))

COPY_SIZE = 0x26000
COPIES = (("main", 0), ("backup", COPY_SIZE))
SAVE_MAGIC = 0x31053527
# The main save's blocks' sizes, in table order (src/system/save_table.c, measured with the save's CRCs)
BLOCK_SIZES = ([0x3e0] + [0xff0] * 24 + [
    0x9ec, 0x534, 0xb0, 0xa8, 0x1338, 0x7c4, 0xd54, 0x94, 0x658, 0xa94, 0x1ac, 0x3ec, 0x5c, 0x1e0, 0xa8, 0x460,
    0x1400, 0x2a4, 0xe0, 0x34c, 0x4e0, 0xf8, 0x2fc, 0x94, 0x35c, 0x1d4, 0x1e0, 0xf0, 0x1b4, 0x4dc, 0x34, 0x3c, 0x1ac,
    0xb90, 0xac, 0x850, 0x284, 0x10, 0xa8, 0x16c, 0x80, 0xfc, 0x16a8, 0x498, 0x60, 0xfc, 0x3e4, 0xf0])
BLOCK_PAL_PAD = 0x1f
BLOCK_POKEDEX = 0x36

KINDS = ("male", "female", "shiny male", "shiny female")
SPECIES_GENESECT = 649

# PokeDexVanillaSave
VANILLA_SIZE = 0x4dc
VANILLA_MAGIC = 0xbeefcafe
VANILLA_SPECIES_BYTES = 0x54
VANILLA_FORM_BYTES = 0xb
VANILLA_LANGUAGE_SPECIES_MAX = 493
VANILLA_LANGUAGE_BYTES = 0x1b0
# The original block's form list, with the Spiky-eared Pichu that the builds before the area appended
VANILLA_FORM_LIST = [(201, 28), (386, 4), (492, 2), (487, 2), (479, 6), (422, 2), (423, 2), (412, 3), (413, 3),
                     (351, 4), (421, 2), (585, 4), (586, 4), (648, 2), (555, 2), (550, 2), (646, 3), (647, 2),
                     (642, 2), (641, 2), (645, 2), (172, 2)]

# PokeDexSave, the area
AREA_SIZE = 0xd54
AREA_MAGIC = 0x44325750
AREA_VERSION = 1
SPECIES_BYTES = 0xbc
FORM_BYTES = 0x80
FORM_ENTRY_MAX = 128
LANGUAGE_COUNT = 7
LANGUAGE_BYTES = 0x238
LANGUAGE_SPECIES_MAX = 649
AREA_CAUGHT = 0x20
AREA_SEEN = AREA_CAUGHT + SPECIES_BYTES
AREA_SHOWN = AREA_SEEN + 4 * SPECIES_BYTES
AREA_SEEN_FORMS = AREA_SHOWN + 4 * SPECIES_BYTES
AREA_SHOWN_FORMS = AREA_SEEN_FORMS + 2 * FORM_BYTES
AREA_FORM_ENTRIES = AREA_SHOWN_FORMS + 2 * FORM_BYTES
AREA_LANGUAGES = AREA_FORM_ENTRIES + 2 * FORM_ENTRY_MAX
AREA_RESERVED = AREA_LANGUAGES + LANGUAGE_BYTES
assert (AREA_SEEN_FORMS, AREA_FORM_ENTRIES, AREA_LANGUAGES, AREA_RESERVED) == (0x6bc, 0x8bc, 0x9bc, 0xbf4)


def crc16(data: bytes) -> int:
    """CRC-16-CCITT, initial value 0xffff (MATHi_CRC16InitTable(…, 0x1021))."""
    crc = 0xffff
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = (crc << 1 ^ 0x1021 if crc & 0x8000 else crc << 1) & 0xffff
    return crc


def block_offsets() -> list[int]:
    """Each block's offset in a copy: its rounded size and 4-byte footer, then the next 0x100."""
    offsets = []
    offset = 0
    for size in BLOCK_SIZES:
        offsets.append(offset)
        offset = (offset + size + 4 + 0xff) & ~0xff
    return offsets


OFFSETS = block_offsets()
CRC_TABLE = OFFSETS[-1] + ((BLOCK_SIZES[-1] + 4 + 0xff) & ~0xff)
CRC_TABLE_SIZE = (len(BLOCK_SIZES) + (len(BLOCK_SIZES) & 1)) * 2
FOOTER = CRC_TABLE + CRC_TABLE_SIZE
SAVE_SIZE = FOOTER + 0x10
assert (OFFSETS[BLOCK_PAL_PAD], OFFSETS[BLOCK_POKEDEX], SAVE_SIZE) == (0x1b200, 0x21400, 0x25fa4)


def block(buf, base, index) -> bytes:
    return bytes(buf[base + OFFSETS[index]:base + OFFSETS[index] + BLOCK_SIZES[index]])


def footer(buf, base):
    count, size, magic, unk, crc = struct.unpack_from("<IIIHH", buf, base + FOOTER)
    return {"count": count, "size": size, "magic": magic, "unk": unk, "crc": crc}


def check_copy(buf, base) -> list[str]:
    """What is wrong with a copy: its footer, its CRC table's CRC, and every block's CRC and footer."""
    problems = []
    foot = footer(buf, base)
    if foot["magic"] != SAVE_MAGIC or foot["size"] != SAVE_SIZE:
        return [f"no save (footer magic 0x{foot['magic']:08x}, size 0x{foot['size']:x})"]
    table = bytes(buf[base + CRC_TABLE:base + CRC_TABLE + CRC_TABLE_SIZE])
    if crc16(table) != foot["crc"]:
        problems.append(f"the CRC table's CRC is 0x{crc16(table):04x}, the footer says 0x{foot['crc']:04x}")
    crcs = struct.unpack_from(f"<{len(BLOCK_SIZES)}H", table)
    for index, size in enumerate(BLOCK_SIZES):
        crc = crc16(block(buf, base, index))
        _, footer_crc = struct.unpack_from("<HH", buf, base + OFFSETS[index] + size)
        if not crc == crcs[index] == footer_crc:
            problems.append(f"block 0x{index:02x}: CRC 0x{crc:04x}, table 0x{crcs[index]:04x}, "
                            f"footer 0x{footer_crc:04x}")
    return problems


def set_block(buf, base, index, data: bytes):
    """Writes a block and its CRC into its footer and the CRC table, and the CRC table's into the save's footer."""
    assert len(data) == BLOCK_SIZES[index]
    offset = base + OFFSETS[index]
    buf[offset:offset + len(data)] = data
    crc = crc16(data)
    struct.pack_into("<H", buf, offset + len(data) + 2, crc)
    struct.pack_into("<H", buf, base + CRC_TABLE + 2 * index, crc)
    table = bytes(buf[base + CRC_TABLE:base + CRC_TABLE + CRC_TABLE_SIZE])
    struct.pack_into("<H", buf, base + FOOTER + 14, crc16(table))


def get_bit(data, index) -> bool:
    return bool(data[index >> 3] >> (index & 7) & 1)


def set_bit(data: bytearray, index):
    data[index >> 3] |= 1 << (index & 7)


def clear_bit(data: bytearray, index):
    data[index >> 3] &= ~(1 << (index & 7)) & 0xff


def encode_entries(entries) -> list[int]:
    return [species | (count - 1) << 11 for species, count in entries]


def decode_entries(values) -> list[tuple[int, int]]:
    return [(value & 0x7ff, (value >> 11) + 1) for value in values]


def rom_form_list() -> list[tuple[int, int]]:
    """The ROM's form directory, POKEDEX_FORM_LIST, from res/pokemon (tools/paperwhite2/pokemon_forms.py)."""
    from tools.paperwhite2.pokemon_forms import pokedex_form_list
    return [(number, count) for number, _, count in pokedex_form_list()]


class Pokedex:
    """Either layout's lists, as bytearrays: caught, seen[4], shown[4], forms[4] (seen, seen shiny, shown, shown
    shiny), languages, the form directory as (species, count), and the header's fields."""

    def __init__(self, species_bytes, form_bytes, language_bytes):
        self.species_bytes = species_bytes
        self.form_bytes = form_bytes
        self.caught = bytearray(species_bytes)
        self.seen = [bytearray(species_bytes) for _ in KINDS]
        self.shown = [bytearray(species_bytes) for _ in KINDS]
        self.forms = [bytearray(form_bytes) for _ in range(4)]
        self.languages = bytearray(language_bytes)
        self.directory = []
        self.header = {}

    @classmethod
    def vanilla(cls, data: bytes):
        dex = cls(VANILLA_SPECIES_BYTES, VANILLA_FORM_BYTES, VANILLA_LANGUAGE_BYTES)
        magic, flags = struct.unpack_from("<II", data, 0)
        dex.header = {"magic": magic, "national": flags & 1, "habitat": flags >> 1 & 1, "given": flags >> 2 & 0xff,
                      "mode": flags >> 10 & 3, "last_species": flags >> 12 & 0x3ff, "unused": flags >> 22,
                      "spinda": struct.unpack_from("<I", data, VANILLA_SIZE - 4)[0]}
        offset = 8
        dex.caught[:] = data[offset:offset + VANILLA_SPECIES_BYTES]
        offset += VANILLA_SPECIES_BYTES
        for lists in (dex.seen, dex.shown):
            for kind in range(4):
                lists[kind][:] = data[offset:offset + VANILLA_SPECIES_BYTES]
                offset += VANILLA_SPECIES_BYTES
        for index in range(4):
            dex.forms[index][:] = data[offset:offset + VANILLA_FORM_BYTES]
            offset += VANILLA_FORM_BYTES
        dex.languages[:] = data[offset:offset + VANILLA_LANGUAGE_BYTES]
        dex.directory = list(VANILLA_FORM_LIST)
        return dex

    def vanilla_bytes(self, original: bytes) -> bytes:
        data = bytearray(original)
        h = self.header
        flags = (h["national"] | h["habitat"] << 1 | h["given"] << 2 | h["mode"] << 10 | h["last_species"] << 12
                 | h["unused"] << 22)
        struct.pack_into("<II", data, 0, h["magic"], flags)
        offset = 8
        parts = [self.caught, *self.seen, *self.shown, *self.forms, self.languages]
        for part in parts:
            data[offset:offset + len(part)] = part
            offset += len(part)
        struct.pack_into("<I", data, offset, h["spinda"])
        assert offset + 4 == VANILLA_SIZE
        return bytes(data)

    @classmethod
    def area(cls, data: bytes):
        dex = cls(SPECIES_BYTES, FORM_BYTES, LANGUAGE_BYTES)
        magic, version, entry_count, flags, last_species = struct.unpack_from("<IHHIH", data, 0)
        dex.header = {"magic": magic, "version": version, "national": flags & 1, "habitat": flags >> 1 & 1,
                      "given": flags >> 2 & 0xff, "mode": flags >> 10 & 3, "last_species": last_species,
                      "spinda": struct.unpack_from("<I", data, 0x10)[0]}
        dex.caught[:] = data[AREA_CAUGHT:AREA_CAUGHT + SPECIES_BYTES]
        for kind in range(4):
            dex.seen[kind][:] = data[AREA_SEEN + kind * SPECIES_BYTES:AREA_SEEN + (kind + 1) * SPECIES_BYTES]
            dex.shown[kind][:] = data[AREA_SHOWN + kind * SPECIES_BYTES:AREA_SHOWN + (kind + 1) * SPECIES_BYTES]
        for index in range(4):
            start = AREA_SEEN_FORMS + index * FORM_BYTES
            dex.forms[index][:] = data[start:start + FORM_BYTES]
        dex.languages[:] = data[AREA_LANGUAGES:AREA_LANGUAGES + LANGUAGE_BYTES]
        values = struct.unpack_from(f"<{FORM_ENTRY_MAX}H", data, AREA_FORM_ENTRIES)
        dex.directory = decode_entries(values[:min(entry_count, FORM_ENTRY_MAX)])
        dex.header["entry_count"] = entry_count
        return dex

    def area_bytes(self) -> bytes:
        data = bytearray(AREA_SIZE)
        h = self.header
        flags = h["national"] | h["habitat"] << 1 | h["given"] << 2 | h["mode"] << 10
        struct.pack_into("<IHHIH", data, 0, AREA_MAGIC, h.get("version", AREA_VERSION), len(self.directory), flags,
                         h["last_species"])
        struct.pack_into("<I", data, 0x10, h["spinda"])
        data[AREA_CAUGHT:AREA_CAUGHT + SPECIES_BYTES] = self.caught
        for kind in range(4):
            data[AREA_SEEN + kind * SPECIES_BYTES:AREA_SEEN + (kind + 1) * SPECIES_BYTES] = self.seen[kind]
            data[AREA_SHOWN + kind * SPECIES_BYTES:AREA_SHOWN + (kind + 1) * SPECIES_BYTES] = self.shown[kind]
        for index in range(4):
            data[AREA_SEEN_FORMS + index * FORM_BYTES:AREA_SEEN_FORMS + (index + 1) * FORM_BYTES] = self.forms[index]
        struct.pack_into(f"<{len(self.directory)}H", data, AREA_FORM_ENTRIES, *encode_entries(self.directory))
        data[AREA_LANGUAGES:AREA_LANGUAGES + LANGUAGE_BYTES] = self.languages
        return bytes(data)

    # What the Pokédex records
    def seen_species(self) -> set[int]:
        return {bit + 1 for kind in self.seen for bit in range(len(kind) * 8) if get_bit(kind, bit)}

    def caught_species(self) -> set[int]:
        return {bit + 1 for bit in range(len(self.caught) * 8) if get_bit(self.caught, bit)}

    def species_bits(self, species) -> dict:
        return {"caught": get_bit(self.caught, species - 1),
                "seen": [get_bit(kind, species - 1) for kind in self.seen],
                "shown": [get_bit(kind, species - 1) for kind in self.shown]}

    def form_bits(self) -> dict:
        """{(species, form): (bit, [seen, seen shiny, shown, shown shiny])} of the forms with any bit set."""
        result = {}
        base = 0
        for species, count in self.directory:
            for form in range(count):
                bits = [get_bit(lst, base + form) for lst in self.forms]
                if any(bits):
                    result[(species, form)] = (base + form, bits)
            base += count
        return result

    def language_bits(self, species_max) -> dict:
        """{species: [language index]} of the species with any language bit."""
        result = {}
        for species in range(1, species_max + 1):
            languages = [lang for lang in range(LANGUAGE_COUNT)
                         if get_bit(self.languages, (species - 1) * LANGUAGE_COUNT + lang)]
            if languages:
                result[species] = languages
        return result


def is_area(data: bytes) -> bool:
    """PokedexSave_IsArea: the magic, a version, and a directory that fits the lists."""
    magic, version, entry_count = struct.unpack_from("<IHH", data, 0)
    if magic != AREA_MAGIC or version == 0 or entry_count > FORM_ENTRY_MAX:
        return False
    values = struct.unpack_from(f"<{entry_count}H", data, AREA_FORM_ENTRIES)
    return sum(count for _, count in decode_entries(values)) <= FORM_BYTES * 8


def remap_forms(src: Pokedex, dest: Pokedex, species_lists: Pokedex):
    """PokedexSave_RemapForms: dest's form bits from src's, by dest's directory, with species_lists' seen and shown."""
    for lst in dest.forms:
        lst[:] = bytes(len(lst))
    src_bases = {}
    base = 0
    for species, count in src.directory:
        src_bases.setdefault(species, (base, count))
        base += count

    def kind(lists, k, species):
        return get_bit(lists[k], species - 1)

    dest_base = 0
    for species, count in dest.directory:
        seen_normal = kind(species_lists.seen, 0, species) or kind(species_lists.seen, 1, species)
        seen_rare = kind(species_lists.seen, 2, species) or kind(species_lists.seen, 3, species)
        if species in src_bases:
            src_base, src_count = src_bases[species]
            for form in range(min(count, src_count)):
                for index in range(4):
                    if get_bit(src.forms[index], src_base + form):
                        set_bit(dest.forms[index], dest_base + form)
        else:
            if seen_normal:
                set_bit(dest.forms[0], dest_base)
            if seen_rare:
                set_bit(dest.forms[1], dest_base)
        if seen_normal or seen_rare:
            if not any(get_bit(dest.forms[2], dest_base + f) or get_bit(dest.forms[3], dest_base + f)
                       for f in range(count)):
                if kind(species_lists.shown, 2, species) or kind(species_lists.shown, 3, species):
                    set_bit(dest.forms[3], dest_base)
                else:
                    set_bit(dest.forms[2], dest_base)
        dest_base += count


def upgrade(vanilla: Pokedex, directory) -> Pokedex:
    """PokedexSave_Upgrade."""
    area = Pokedex(SPECIES_BYTES, FORM_BYTES, LANGUAGE_BYTES)
    area.header = {key: vanilla.header[key] for key in ("national", "habitat", "given", "mode", "last_species",
                                                         "spinda")}
    area.header["version"] = AREA_VERSION
    area.caught[:VANILLA_SPECIES_BYTES] = vanilla.caught
    for kind in range(4):
        area.seen[kind][:VANILLA_SPECIES_BYTES] = vanilla.seen[kind]
        area.shown[kind][:VANILLA_SPECIES_BYTES] = vanilla.shown[kind]
    area.languages[:VANILLA_LANGUAGE_BYTES] = vanilla.languages
    area.directory = list(directory)
    remap_forms(vanilla, area, area)
    return area


def remap_to_rom(area: Pokedex, directory):
    """PokedexSave_RemapToRom."""
    old = Pokedex(SPECIES_BYTES, FORM_BYTES, LANGUAGE_BYTES)
    old.forms = [bytearray(lst) for lst in area.forms]
    old.directory = area.directory
    area.directory = list(directory)
    remap_forms(old, area, area)


def mirror(area: Pokedex, vanilla: Pokedex) -> Pokedex:
    """PaperWhite2_PokedexSave_Mirror: a new original block from the area and the old one's unused bits."""
    out = Pokedex(VANILLA_SPECIES_BYTES, VANILLA_FORM_BYTES, VANILLA_LANGUAGE_BYTES)
    out.header = {key: area.header[key] for key in ("national", "habitat", "given", "mode", "spinda")}
    out.header["magic"] = VANILLA_MAGIC
    out.header["unused"] = vanilla.header["unused"]
    last = area.header["last_species"]
    out.header["last_species"] = last if last <= SPECIES_GENESECT else 0
    out.caught[:] = area.caught[:VANILLA_SPECIES_BYTES]
    for kind in range(4):
        out.seen[kind][:] = area.seen[kind][:VANILLA_SPECIES_BYTES]
        out.shown[kind][:] = area.shown[kind][:VANILLA_SPECIES_BYTES]
    for bit in range(SPECIES_GENESECT, VANILLA_SPECIES_BYTES * 8):
        for lst in (out.caught, *out.seen, *out.shown):
            clear_bit(lst, bit)
    out.languages[:] = area.languages[:VANILLA_LANGUAGE_BYTES]
    for bit in range(VANILLA_LANGUAGE_SPECIES_MAX * LANGUAGE_COUNT, VANILLA_LANGUAGE_BYTES * 8):
        clear_bit(out.languages, bit)
    out.directory = list(VANILLA_FORM_LIST)
    remap_forms(area, out, out)
    return out


def species_names() -> dict:
    from tools.data.pokemon_graphics import species_names as names
    return dict(enumerate(names()))


def describe(label, dex: Pokedex, names, species_max):
    seen = dex.seen_species()
    caught = dex.caught_species()
    h = dex.header
    print(f"  {label}: " + ", ".join(f"{key} {value:#x}" if key == "magic" else f"{key} {value}"
                                     for key, value in h.items()))
    print(f"    seen {len(seen)} (highest {max(seen, default=0)}), caught {len(caught)} "
          f"(highest {max(caught, default=0)})")
    print("    seen by kind " + ", ".join(f"{name} {sum(get_bit(lst, b) for b in range(len(lst) * 8))}"
                                         for name, lst in zip(KINDS, dex.seen)))
    print("    shown by kind " + ", ".join(f"{name} {sum(get_bit(lst, b) for b in range(len(lst) * 8))}"
                                          for name, lst in zip(KINDS, dex.shown)))
    # Each form with a bit: species, form, its bit, and s, S, h, H for seen, seen shiny, shown, shown shiny
    forms = dex.form_bits()
    print(f"    form bits ({len(dex.directory)} species in the directory, {sum(c for _, c in dex.directory)} forms): "
          + (", ".join(f"{names.get(s, s)} {f} (bit {bit}) "
                       + "".join("sShH"[i] if b else "-" for i, b in enumerate(bits))
                       for (s, f), (bit, bits) in sorted(forms.items())) or "none"))
    languages = dex.language_bits(species_max)
    print(f"    languages: {sum(len(v) for v in languages.values())} bits for {len(languages)} species")


def compare(area: Pokedex, vanilla: Pokedex) -> list[str]:
    """Where the original block isn't the area's mirror."""
    expected = mirror(area, vanilla)
    problems = []
    if expected.header != vanilla.header:
        problems.append(f"header {vanilla.header} != {expected.header}")
    for name, a, b in [("caught", expected.caught, vanilla.caught),
                       *[(f"seen {KINDS[k]}", expected.seen[k], vanilla.seen[k]) for k in range(4)],
                       *[(f"shown {KINDS[k]}", expected.shown[k], vanilla.shown[k]) for k in range(4)],
                       *[(f"forms {k}", expected.forms[k], vanilla.forms[k]) for k in range(4)],
                       ("languages", expected.languages, vanilla.languages)]:
        if a != b:
            problems.append(name)
    return problems


def cmd_inspect(path):
    buf = Path(path).read_bytes()
    names = species_names()
    for label, base in COPIES:
        foot = footer(buf, base)
        problems = check_copy(buf, base)
        print(f"{label}: footer count {foot['count']}, size {foot['size']:#x}, "
              + (f"{len(problems)} problems" if problems else "every CRC right"))
        pal_pad = block(buf, base, BLOCK_PAL_PAD)
        vanilla = Pokedex.vanilla(block(buf, base, BLOCK_POKEDEX))
        describe("original block 0x36", vanilla, names, VANILLA_LANGUAGE_SPECIES_MAX)
        if is_area(pal_pad):
            area = Pokedex.area(pal_pad)
            describe("area (Pal Pad block 0x1f)", area, names, LANGUAGE_SPECIES_MAX)
            directory = rom_form_list()
            print("    directory " + ("is the ROM's" if area.directory == directory else "differs from the ROM's"))
            mismatches = compare(area, vanilla)
            print("    original block " + ("is the area's mirror" if not mismatches
                                           else "differs from the area's mirror: " + ", ".join(mismatches)))
        else:
            print("  Pal Pad block 0x1f: no area (" + ("all zeros" if not any(pal_pad) else
                                                      f"{sum(1 for b in pal_pad if b)} non-zero bytes") + ")")


def cmd_verify(path):
    buf = Path(path).read_bytes()
    bad = False
    for label, base in COPIES:
        problems = check_copy(buf, base)
        print(f"{label}: " + ("ok" if not problems else "; ".join(problems)))
        bad |= bool(problems)
    sys.exit(1 if bad else 0)


def cmd_upgrade(path, out):
    if Path(out).resolve() == Path(path).resolve():
        sys.exit("pokedex_save.py: upgrade writes a new file, not the one it reads")
    buf = bytearray(Path(path).read_bytes())
    directory = rom_form_list()
    for label, base in COPIES:
        problems = check_copy(buf, base)
        if problems:
            sys.exit(f"pokedex_save.py: {path}: the {label} copy is not valid: {'; '.join(problems)}")
        pal_pad = block(buf, base, BLOCK_PAL_PAD)
        original = block(buf, base, BLOCK_POKEDEX)
        vanilla = Pokedex.vanilla(original)
        if not is_area(pal_pad):
            if vanilla.header["magic"] != VANILLA_MAGIC:
                sys.exit(f"pokedex_save.py: {path}: the {label} copy has no Pokédex")
            area = upgrade(vanilla, directory)
            print(f"{label}: area built from the original block")
        else:
            area = Pokedex.area(pal_pad)
            if area.directory != directory:
                remap_to_rom(area, directory)
                print(f"{label}: form bits remapped to the ROM's directory")
            else:
                print(f"{label}: area already current")
        set_block(buf, base, BLOCK_PAL_PAD, area.area_bytes())
        set_block(buf, base, BLOCK_POKEDEX, mirror(area, vanilla).vanilla_bytes(original))
        assert not check_copy(buf, base)
    Path(out).write_bytes(buf)


def main():
    args = sys.argv[1:]
    if args[:1] == ["inspect"] and len(args) == 2:
        cmd_inspect(args[1])
    elif args[:1] == ["verify"] and len(args) == 2:
        cmd_verify(args[1])
    elif args[:1] == ["upgrade"] and len(args) == 3:
        cmd_upgrade(args[1], args[2])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
