"""Paper White 2: the Pokédex entries of the Game Boy, Game Boy Color and Game Boy Advance games, for the Info page's
Flavour (dex_flavour.py, docs/paperwhite2/design/pokedex-flavour.md), read from the user's own US ROMs at build time.

Each game's entries are found from Bulbasaur's (its category "SEED", height and weight), not at fixed offsets, so a
revision of the game reads too; the formats are the community disassemblies' (pokered and pokeyellow, pokegold and
pokecrystal, pokeruby, pokeemerald and pokefirered):

- Gen 1 (Red, Blue, Yellow): PokedexEntryPointers, a pointer for each internal species (Rhydon first) to its record
  (the category up to "@", height and weight in 4 bytes, then a far text command, 0x17 and a 3-byte pointer, to the
  description), and PokedexOrder, each internal species' Pokédex number (0 for the MissingNo. slots). The description
  starts with 0x00, has lines (0x4E) on two pages (0x49) and ends with 0x5F, which prints a full stop.
- Gen 2 (Gold, Silver, Crystal): PokedexDataPointerTable, a pointer for each species by its Pokédex number, the bank
  that of the species' quarter of the Pokédex (from Bulbasaur's: 1-64, 65-128, 129-192, 193-251); the record is the
  category up to "@", height and weight in 4 bytes, then the two pages, each ending with "@".
- Gen 3 (Ruby, Sapphire, Emerald, FireRed, LeafGreen): gPokedexEntries, by national number from 0 (none) to 386, each
  the category in 12 bytes, height and weight, and pointers to the description: Ruby and Sapphire have two pages, the
  second's pointer after the first's; FireRed and LeafGreen keep a second pointer to an empty text; Emerald has one.
  Its text ends with 0xFF, its lines 0xFE.

The pages' lines are joined into one, for dex_flavour.py to wrap for White 2's window. "#" (Gen 1 and 2's POKé) and
"POKé" are written as White 2 writes them, Poké, "POKéMON" as Pokémon; species' names stay in the capitals the games
wrote them in, as HeartGold's and SoulSilver's do.
"""
import re
import struct


class GbError(Exception):
    pass


# Gen 1 and 2's characters (pokered's and pokecrystal's charmaps); the codes that differ between them are in their own
# tables
GB_CHARS = {0x7F: " ", 0x9A: "(", 0x9B: ")", 0x9C: ":", 0x9D: ";", 0x9E: "[", 0x9F: "]", 0xE0: "'", 0xE3: "-",
            0xE6: "?", 0xE7: "!", 0xE8: ".", 0xEF: "♂", 0xF1: "×", 0xF2: ".", 0xF3: "/", 0xF4: ",", 0xF5: "♀",
            0x54: "Poké", 0xE1: "Pk", 0xE2: "Mn"}
GB_CHARS.update({0x80 + i: chr(65 + i) for i in range(26)})
GB_CHARS.update({0xA0 + i: chr(97 + i) for i in range(26)})
GB_CHARS.update({0xF6 + i: chr(48 + i) for i in range(10)})
GEN1_CHARS = {**GB_CHARS, 0xBA: "é", 0xBB: "'d", 0xBC: "'l", 0xBD: "'s", 0xBE: "'t", 0xBF: "'v", 0xE4: "'r",
              0xE5: "'m"}
GEN2_CHARS = {**GB_CHARS, 0xD0: "'d", 0xD1: "'l", 0xD2: "'m", 0xD3: "'r", 0xD4: "'s", 0xD5: "'t", 0xD6: "'v",
              0xE9: "&", 0xEA: "é"}
GB_END = 0x50
GB_NEXT = (0x4E, 0x4F, 0x55)
GB_PAGE = (0x49, 0x51)
GEN1_TEXT = 0x00
GEN1_FAR = 0x17
GEN1_DEX_END = 0x5F

# Gen 3's characters (pokeemerald's charmap, the English and Latin ones)
GBA_CHARS = {0x00: " ", 0x01: "À", 0x02: "Á", 0x03: "Â", 0x04: "Ç", 0x05: "È", 0x06: "É", 0x07: "Ê", 0x08: "Ë",
             0x09: "Ì", 0x0B: "Î", 0x0C: "Ï", 0x0D: "Ò", 0x0E: "Ó", 0x0F: "Ô", 0x10: "Œ", 0x11: "Ù", 0x12: "Ú",
             0x13: "Û", 0x14: "Ñ", 0x15: "ß", 0x16: "à", 0x17: "á", 0x19: "ç", 0x1A: "è", 0x1B: "é", 0x1C: "ê",
             0x1D: "ë", 0x1E: "ì", 0x20: "î", 0x21: "ï", 0x22: "ò", 0x23: "ó", 0x24: "ô", 0x25: "œ", 0x26: "ù",
             0x27: "ú", 0x28: "û", 0x29: "ñ", 0x2D: "&", 0x2E: "+", 0x35: "=", 0x36: ";", 0x51: "¿", 0x52: "¡",
             0x5A: "Í", 0x5B: "%", 0x5C: "(", 0x5D: ")", 0x68: "â", 0x6F: "í", 0xAB: "!", 0xAC: "?", 0xAD: ".",
             0xAE: "-", 0xAF: "·", 0xB0: "…", 0xB1: "\"", 0xB2: "\"", 0xB3: "'", 0xB4: "'", 0xB5: "♂", 0xB6: "♀",
             0xB8: ",", 0xB9: "×", 0xBA: "/", 0xF0: ":", 0xF1: "Ä", 0xF2: "Ö", 0xF3: "Ü", 0xF4: "ä", 0xF5: "ö",
             0xF6: "ü"}
GBA_CHARS.update({0xA1 + i: chr(48 + i) for i in range(10)})
GBA_CHARS.update({0xBB + i: chr(65 + i) for i in range(26)})
GBA_CHARS.update({0xD5 + i: chr(97 + i) for i in range(26)})
GBA_NEWLINES = (0xFA, 0xFB, 0xFE)
GBA_END = 0xFF
GBA_ROM = 0x08000000

# Bulbasaur's record: its category, height and weight as each generation stores them
GEN1_BULBASAUR = bytes([0x92, 0x84, 0x84, 0x83, GB_END, 2, 4, 150, 0, GEN1_FAR])
GEN2_BULBASAUR = bytes([0x92, 0x84, 0x84, 0x83, GB_END]) + struct.pack("<HH", 204, 150)
GEN3_BULBASAUR = bytes([0xCD, 0xBF, 0xBF, 0xBE, GBA_END]) + bytes(7) + struct.pack("<HH", 7, 69)
# Gen 1's PokedexOrder from Rhydon: Rhydon, Kangaskhan, Nidoran♂, Clefairy, Spearow, Voltorb, Nidoking, Slowbro
GEN1_ORDER_START = bytes([112, 115, 32, 35, 21, 100, 34, 80, 2, 103])
GEN1_INTERNAL_COUNT = 190
GEN1_LAST = 151
GEN2_LAST = 251
GEN2_BANK_SPECIES = 64
GEN3_LAST = 386
BANK_SIZE = 0x4000
# The longest text that is read as one: an entry's page is at most 3 lines of 18 characters
TEXT_LIMIT = 200
# Where a word was broken over two lines with a hyphen, which dex_flavour.py takes away when the word is one
BROKEN_WORD = "\u00ad"


def bank_offset(bank: int, address: int) -> int:
    return bank * BANK_SIZE + address - BANK_SIZE if address >= BANK_SIZE else address


def gb_address(offset: int) -> int:
    return offset if offset < BANK_SIZE else BANK_SIZE + offset % BANK_SIZE


def gb_text(rom: bytes, offset: int, chars: dict, ends: tuple, where: str) -> tuple[list[str], int]:
    """A Gen 1 or 2 text's lines up to one of ends (and the end code), as Unicode."""
    lines = [""]
    start = offset
    while True:
        if offset >= len(rom) or offset - start > TEXT_LIMIT:
            raise GbError(f"{where}: the text has no end")
        c = rom[offset]
        offset += 1
        if c in ends:
            return lines, c
        if c in GB_NEXT or c in GB_PAGE:
            lines.append("")
        elif c in chars:
            lines[-1] += chars[c]
        else:
            raise GbError(f"{where}: character {c:#04x} isn't in the table")


def join_lines(lines: list[str]) -> str:
    """The lines as one: a space between them, none after a line's hyphen between letters, which becomes BROKEN_WORD
    (the old games broke long words over their narrow lines: "sur-" "roundings")."""
    out = ""
    for line in (line.strip() for line in lines):
        if not line:
            continue
        if re.search(r"[A-Za-z]-$", out) and line[0].isalpha():
            out = out[:-1] + BROKEN_WORD + line
        else:
            out += " " + line if out else line
    return out


def house_style(text: str) -> str:
    """The games' POKéMON and POKé as White 2 writes them."""
    text = re.sub(r"POKé(MON)?", lambda m: "Pokémon" if m.group(1) else "Poké", text)
    text = re.sub(r"Poké(MON|mon)", "Pokémon", text)
    return text.replace("Poké BALL", "Poké Ball")


def gen1_entries(rom: bytes, name: str) -> list[str]:
    order_at = rom.find(GEN1_ORDER_START)
    record = rom.find(GEN1_BULBASAUR)
    if order_at < 0 or record < 0:
        raise GbError(f"{name}: no Pokédex order or Bulbasaur's entry; is it a US {name}?")
    order = rom[order_at:order_at + GEN1_INTERNAL_COUNT]
    bulbasaur = order.index(1)
    bank = record // BANK_SIZE
    pointer = struct.pack("<H", gb_address(record))
    table = None
    for match in re.finditer(re.escape(pointer), rom[bank * BANK_SIZE:(bank + 1) * BANK_SIZE]):
        start = bank * BANK_SIZE + match.start() - 2 * bulbasaur
        pointers = struct.unpack_from(f"<{GEN1_INTERNAL_COUNT}H", rom, start)
        if all(BANK_SIZE <= p < 2 * BANK_SIZE for p in pointers):
            table = pointers
            break
    if table is None:
        raise GbError(f"{name}: no table of Pokédex entries")
    entries = [""] * (GEN1_LAST + 1)
    for internal, number in enumerate(order):
        if not 1 <= number <= GEN1_LAST:
            continue
        where = f"{name}'s entry {number}"
        offset = bank_offset(bank, table[internal])
        _, end = gb_text(rom, offset, GEN1_CHARS, (GB_END,), where)
        offset = rom.index(GB_END, offset) + 5
        if rom[offset] != GEN1_FAR:
            raise GbError(f"{where}: no description")
        address, text_bank = struct.unpack_from("<HB", rom, offset + 1)
        offset = bank_offset(text_bank, address)
        if rom[offset] != GEN1_TEXT:
            raise GbError(f"{where}: the description doesn't start as a text")
        lines, end = gb_text(rom, offset + 1, GEN1_CHARS, (GB_END, GEN1_DEX_END), where)
        text = join_lines(lines)
        entries[number] = text + "." if end == GEN1_DEX_END else text
    return entries


def gen2_entries(rom: bytes, name: str) -> list[str]:
    record = rom.find(GEN2_BULBASAUR)
    if record < 0:
        raise GbError(f"{name}: no Bulbasaur's entry; is it a US {name}?")
    bank = record // BANK_SIZE

    def read(offset, where):
        category, _ = gb_text(rom, offset, GEN2_CHARS, (GB_END,), where)
        if not re.fullmatch(r"[A-Z][A-Z .'é-]{0,10}", "".join(category)):
            raise GbError(f"{where}: no category")
        offset = rom.index(GB_END, offset) + 5
        page1, _ = gb_text(rom, offset, GEN2_CHARS, (GB_END,), where)
        offset = rom.index(GB_END, offset) + 1
        page2, _ = gb_text(rom, offset, GEN2_CHARS, (GB_END,), where)
        return join_lines(page1 + page2)

    def group(pointers, first, bank):
        """The quarter's entries from first if they all read in the bank, else None."""
        try:
            return [read(bank_offset(bank, pointers[species - 1]), f"{name}'s entry {species}")
                    for species in range(first, min(first + GEN2_BANK_SPECIES, GEN2_LAST + 1))]
        except (GbError, ValueError, IndexError):
            return None

    pointer = struct.pack("<H", gb_address(record))
    for match in re.finditer(re.escape(pointer), rom):
        pointers = struct.unpack_from(f"<{GEN2_LAST}H", rom, match.start())
        if not all(BANK_SIZE <= p < 2 * BANK_SIZE for p in pointers):
            continue
        # Each quarter's bank: Bulbasaur's for the first, the others the first bank where the whole quarter reads
        # (Gold's and Silver's follow it; Crystal's are elsewhere)
        entries = [""]
        for first in range(1, GEN2_LAST + 1, GEN2_BANK_SPECIES):
            banks = [bank] if first == 1 else [bank + first // GEN2_BANK_SPECIES, *range(len(rom) // BANK_SIZE)]
            found = next((g for g in (group(pointers, first, b) for b in banks) if g is not None), None)
            if found is None:
                break
            entries += found
        if len(entries) == GEN2_LAST + 1:
            return entries
    raise GbError(f"{name}: no table of Pokédex entries")


def gba_text(rom: bytes, pointer: int, where: str) -> str:
    offset = pointer - GBA_ROM
    if not 0 <= offset < len(rom):
        raise GbError(f"{where}: a pointer off the ROM")
    lines = [""]
    while rom[offset] != GBA_END:
        c = rom[offset]
        if c in GBA_NEWLINES:
            lines.append("")
        elif c in GBA_CHARS:
            lines[-1] += GBA_CHARS[c]
        else:
            raise GbError(f"{where}: character {c:#04x} isn't in the table")
        offset += 1
    return join_lines(lines)


def gen3_entries(rom: bytes, name: str) -> list[str]:
    first = rom.find(GEN3_BULBASAUR)
    if first < 0:
        raise GbError(f"{name}: no Bulbasaur's entry; is it a US {name}?")
    # The record's size, from Ivysaur's after it (also "SEED"): two pointers to the description or one
    size = rom.find(GEN3_BULBASAUR[:5], first + 1) - first
    if size not in (0x20, 0x24):
        raise GbError(f"{name}: Pokédex records of {size:#x} bytes")
    table = first - size
    entries = [""]
    for number in range(1, GEN3_LAST + 1):
        where = f"{name}'s entry {number}"
        record = table + number * size
        pages = struct.unpack_from("<II" if size == 0x24 else "<I", rom, record + 16)
        entries.append(join_lines([gba_text(rom, page, where) for page in pages]))
    return entries


def read_entries(path, generation: int, name: str) -> list[str]:
    """The game's entries by Pokédex number, from 0 (none), each on one line in White 2's style."""
    rom = path.read_bytes()
    read = {1: gen1_entries, 2: gen2_entries, 3: gen3_entries}[generation]
    entries = [house_style(text) for text in read(rom, name)]
    if not any(word in entries[1].lower() for word in ("seed", "bulb")):
        raise GbError(f"{path}: Bulbasaur's entry is {entries[1]!r}; is it a US {name}?")
    return entries
