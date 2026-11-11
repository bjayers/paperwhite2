#!/usr/bin/env python3
"""Paper White 2: the Pokédex Info page's Flavour, the other games' Pokédex entries of each species, taken at build
time from the user's own ROMs (docs/paperwhite2/design/pokedex-flavour.md, docs/paperwhite2/plugins.md's Pokédex).

    dex_flavour.py build OUT [--roms DIR] [--font FONT]   # the build: the member that pokedex_evo.py adds
    dex_flavour.py report [--roms DIR] [--font FONT]      # the counts per game, the labels, and every entry in the
                                                          # small font or left out
    dex_flavour.py template [OUT_DIR] [--font FONT]       # the version tab's templates (write_templates)

pokedex_evo.py adds the member and the tab's (tab_member) to ARCID_POKEDEX_GRA; the build's step that runs this
depends on the ROMs present when configure.py ran, so run it again after adding one.

Nothing extracted is kept in res/ or git: the ROMs are read from orig/ (ignored), and the member is written into
build/. A ROM that isn't there is skipped, and with none the member has no entries. The games, in the order they came
out, which is the order the page shows them in and the order that an entry two of them share is kept for (the
first's), each with its ROM and, for the DS games, the message archive and the bank of its own entries (US/English
ROMs; the other banks there are the other version's entries, or the English ones that another language's game shows):

    Red         dex_red.gb          (Gen 1, dex_flavour_gb.py: Pokédex numbers 1-151)
    Blue        dex_blue.gb
    Yellow      dex_yellow.gb
    Gold        dex_gold.gbc        (Gen 2: 1-251)
    Silver      dex_silver.gbc
    Crystal     dex_crystal.gbc
    Ruby        dex_ruby.gba        (Gen 3: 1-386)
    Sapphire    dex_sapphire.gba
    FireRed     dex_firered.gba
    LeafGreen   dex_leafgreen.gba
    Emerald     dex_emerald.gba
    Diamond     dex_diamond.nds     msgdata/msg.narc     615 (the 494 species' entries, Gen 4's message format)
    Pearl       dex_pearl.nds       msgdata/msg.narc     616
    Platinum    dex_platinum.nds    msgdata/pl_msg.narc  700
    HeartGold   dex_heartgold.nds   a/0/2/7              803
    SoulSilver  dex_soulsilver.nds  a/0/2/7              804
    Black       dex_black.nds       a/0/0/2              236 (the 650 species' entries, Gen 5's message format)
    White       dex_white.nds       a/0/0/2              235
    Black 2     dex_black2.nds      a/0/0/2              442

Each DS bank is checked by its size and by Bulbasaur's entry (it mentions the seed on its back), so a ROM of another
language or revision is refused rather than read wrong; the Game Boy and Game Boy Advance games' entries are found from
Bulbasaur's (dex_flavour_gb.py). Black's and White's banks are told apart by their version mascots: each game's own
mascot has the entry that begins "This Pokémon appears in legends."

Gen 4's messages are encrypted per entry (a key from the bank's seed for the table of offsets and lengths, and one
from the entry's number for its characters) and use Gen 4's character table (GEN4_CHARS, 0xE000 a new line); they are
converted to White 2's encoding, which is UTF-16 with 0xFFFE for a new line. Typographic quotes and apostrophes become
the straight ones White 2's English entries use. The older games' narrow lines are joined (a word they broke over two
lines with a hyphen is joined again unless the entries write it with one, unbreak) and wrapped for White 2's window.

An entry is kept when it differs from White 2's own (res/pokemon/<species>/data.json's pokedex entry; same_entry: case,
punctuation, accents and line breaks set aside, words at least SAME_ENTRY alike), and when no game before it has the
same entry; the games sharing it are a bit mask, which the page's tab names. It must fit the Info page's text window as
PokedexInfo prints it (pokedex_info.c): LINE_COUNT lines of at most LINE_WIDTH pixels in font 0 (the font's own widths,
as GFL_FontGetLineWidth adds them), as it is or wrapped at its spaces; else SMALL_LINE_COUNT lines of the same width in
font 1, the small font, which the page draws a line every SMALL_LINE_STEP pixels from SMALL_TEXT_DY lower (the entry's
SMALL_FONT flag); one that fits neither is left out, and the report names it.

The member (FLAVOUR_FILE in paperwhite2_pokedex_info_flavour.c), read by range for one species:

    u32 version                      FORMAT_VERSION; the page shows no entries from a member of another
    u32 offsets[SPECIES_COUNT + 1]   for species 0 to the last, where its entries start, and the end after the last
    per entry: u16 games, low and high (bit i for GAMES[i]), u16 flags (SMALL_FONT), u16 characters (the text's, its
               0xFFFF terminator included), the text

A species' entries run from its offset to the next species'; species 0 and those without an entry have none.
"""
import argparse
import difflib
import json
import re
import struct
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.datajson import constants  # noqa: E402
from tools.data.narc import read_narc  # noqa: E402
from tools.data.nitro_2d import read_indexed_png  # noqa: E402
from tools.paperwhite2.dex_flavour_gb import BROKEN_WORD, GbError, read_entries  # noqa: E402
from tools.text.msgdata import CONTROL, LINE_END, NEWLINE, decompress, decrypt  # noqa: E402

ROMS = ROOT / "orig"
FONT = ROOT / "extract" / "w2_us" / "files" / "a" / "0" / "2" / "3"
SPECIES = ROOT / "res" / "pokemon"
# The text window of the entry (PokedexInfo_InitWindows: 28 tiles across from x 16, the text from its x 2, y 5, a line
# every 16 pixels, 7 tiles high): three lines of at most 222 pixels, the window's width less the text's left margin
LINE_COUNT = 3
LINE_WIDTH = 28 * 8 - 2
# The page's font for the entry (font 0, ARCID_FONT's member 0)
ENTRY_FONT = 0
# An entry too long for that is in font 1, the page's small font: drawn SMALL_TEXT_DY lower than font 0's text (the
# glyphs' tops level with font 0's), its glyphs and their shadow the top SMALL_GLYPH_ROWS of its 10, as many lines as
# end inside the box, the dark panel's rows of the window (BOX_ROWS, its last 2 rows the art's border). At the font's
# line feed (10) that is 4, which leaves out 151 of Ruby's and Sapphire's two-page entries; a line every SMALL_LINE_STEP
# of 9 (a blank row between the lines' shadows and the next glyphs) makes it 5, which none needs more than
# (paperwhite2_pokedex_info_flavour.c's SMALL_*)
SMALL_FONT_ID = 1
SMALL_TEXT_DY = 2
SMALL_LINE_STEP = 9
SMALL_GLYPH_ROWS = 8
BOX_ROWS = 7 * 8 - 2
TEXT_Y = 5
SMALL_LINE_COUNT = (BOX_ROWS - TEXT_Y - SMALL_TEXT_DY - SMALL_GLYPH_ROWS) // SMALL_LINE_STEP + 1
# The entry's flags
SMALL_FONT = 1
FORMAT_VERSION = 2
# The version tab on the top screen while another game's entry shows (paperwhite2_pokedex_info_flavour.c's TAB_*):
# the user's art, res/paperwhite2/pokedex_art/version_flavour.png, a whole top screen whose tab is drawn in the region
# of the TAB_OBJS OBJs of 32 by 32 from TAB_X, TAB_Y. Its label, the game's name or the games' short names a LABEL_GAP
# apart, is in font 1 on LABEL_OBJS OBJs of their own in front of those, from TAB_TEXT_X (TAB_TEXT_Y down the region),
# or further left to end by TAB_TEXT_RIGHT, but not left of TAB_TEXT_MIN_X; the art must be the plain tab there and for
# TAB_STRIPE_MARGIN pixels after (its stripes start further right)
TAB_ART = ROOT / "res" / "paperwhite2" / "pokedex_art" / "version_flavour.png"
TAB_X = 0
TAB_Y = 120
TAB_OBJS = 4
LABEL_OBJS = 3
TAB_WIDTH = TAB_OBJS * 32
LABEL_WIDTH = LABEL_OBJS * 32
TAB_HEIGHT = 32
TAB_TEXT_X = 11
TAB_TEXT_RIGHT = 89
TAB_STRIPE_MARGIN = 4
TAB_TEXT_Y = 8
TAB_TEXT_MIN_X = 2
LABEL_GAP = 2
LABEL_FONT = 1
SCREEN_WIDTH = 256
SCREEN_HEIGHT = 192
PAGE_TEXT = ROOT / "res" / "text" / "system" / "pokedex_data.txt"

# (name, ROM, archive, bank, generation, last species, the label's messages' name): the DS games'
# entries in their message archive's bank, the others' where dex_flavour_gb.py finds them
GAMES = [
    ("Red", "dex_red.gb", None, None, 1, 151, "Red"),
    ("Blue", "dex_blue.gb", None, None, 1, 151, "Blue"),
    ("Yellow", "dex_yellow.gb", None, None, 1, 151, "Yellow"),
    ("Gold", "dex_gold.gbc", None, None, 2, 251, "Gold"),
    ("Silver", "dex_silver.gbc", None, None, 2, 251, "Silver"),
    ("Crystal", "dex_crystal.gbc", None, None, 2, 251, "Crystal"),
    ("Ruby", "dex_ruby.gba", None, None, 3, 386, "Ruby"),
    ("Sapphire", "dex_sapphire.gba", None, None, 3, 386, "Sapphire"),
    ("FireRed", "dex_firered.gba", None, None, 3, 386, "FireRed"),
    ("LeafGreen", "dex_leafgreen.gba", None, None, 3, 386, "LeafGreen"),
    ("Emerald", "dex_emerald.gba", None, None, 3, 386, "Emerald"),
    ("Diamond", "dex_diamond.nds", "msgdata/msg.narc", 615, 4, 493, "Diamond"),
    ("Pearl", "dex_pearl.nds", "msgdata/msg.narc", 616, 4, 493, "Pearl"),
    ("Platinum", "dex_platinum.nds", "msgdata/pl_msg.narc", 700, 4, 493, "Platinum"),
    ("HeartGold", "dex_heartgold.nds", "a/0/2/7", 803, 4, 493, "HeartGold"),
    ("SoulSilver", "dex_soulsilver.nds", "a/0/2/7", 804, 4, 493, "SoulSilver"),
    ("Black", "dex_black.nds", "a/0/0/2", 236, 5, 649, "Black"),
    ("White", "dex_white.nds", "a/0/0/2", 235, 5, 649, "White"),
    ("Black 2", "dex_black2.nds", "a/0/0/2", 442, 5, 649, "Black2"),
]
LAST_SPECIES = 649

# Gen 4's characters, from 0x0121, as Unicode: digits, letters, the Latin-1 letters, then punctuation. The rest of the
# table (Japanese, symbols) doesn't appear in the English entries; one that does is an error
GEN4_FIRST = 0x0121
GEN4_CHARS = ("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
              "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿŒœŞşªº¹²³$¡¿!?,.…·/‘’“”„《》()♂♀+-*#=&~:;♠♣♥♦★◉●■▲◆@♪%☀☁☂☃☺♚♛☹↗↘☽")
GEN4_SPACE = 0x01DE
GEN4_NEWLINE = 0xE000
GEN4_END = 0xFFFF
# Gen 4's other line breaks (a scroll and a new box), which no entry should have, read as new lines
GEN4_BREAKS = (0x25BC, 0x25BD)
# White 2's English entries use straight quotes
QUOTES = {"‘": "'", "’": "'", "“": '"', "”": '"'}


class FlavourError(Exception):
    pass


def nitrofs(rom: bytes) -> dict[str, bytes]:
    """The ROM's NitroFS files by path."""
    fnt, _, fat, _ = struct.unpack_from("<IIII", rom, 0x40)
    files = {}

    def walk(directory, prefix):
        offset, file_id, _ = struct.unpack_from("<IHH", rom, fnt + (directory & 0xFFF) * 8)
        cursor = fnt + offset
        while rom[cursor]:
            kind = rom[cursor]
            name = rom[cursor + 1:cursor + 1 + (kind & 0x7F)].decode("latin-1")
            cursor += 1 + (kind & 0x7F)
            if kind & 0x80:
                walk(struct.unpack_from("<H", rom, cursor)[0], f"{prefix}{name}/")
                cursor += 2
            else:
                start, end = struct.unpack_from("<II", rom, fat + file_id * 8)
                files[prefix + name] = rom[start:end]
                file_id += 1

    walk(0xF000, "")
    return files


def gen5_bank(data: bytes) -> list[list[int]]:
    """A Gen 5 message file's messages (White 2's format, tools/text/msgdata.py), without their terminators."""
    count = struct.unpack_from("<H", data, 2)[0]
    section = struct.unpack_from("<I", data, 12)[0]
    out = []
    for i in range(count):
        offset, length, _ = struct.unpack_from("<IHH", data, section + 4 + 8 * i)
        chars = decompress(decrypt(struct.unpack_from(f"<{length}H", data, section + offset)))
        out.append(list(chars[:chars.index(LINE_END)] if LINE_END in chars else chars))
    return out


def gen4_bank(data: bytes) -> list[list[int]]:
    """A Gen 4 message file's messages, decrypted, without their terminators: the table's offsets and lengths are
    XORed with a key from the bank's seed and the message's number, the characters with one from the number alone,
    which steps by 0x493D a character."""
    count, seed = struct.unpack_from("<HH", data, 0)
    out = []
    for i in range(count):
        key = ((765 * (i + 1) * seed) & 0xFFFF) * 0x10001
        offset, length = (value ^ key for value in struct.unpack_from("<II", data, 4 + 8 * i))
        key = ((i + 1) * 0x91BD3) & 0xFFFF
        chars = []
        for value in struct.unpack_from(f"<{length}H", data, offset):
            chars.append(value ^ key)
            key = (key + 0x493D) & 0xFFFF
        out.append(chars[:chars.index(GEN4_END)] if GEN4_END in chars else chars)
    return out


def gen4_to_w2(chars: list[int], where: str) -> list[int]:
    out = []
    for c in chars:
        if c == GEN4_NEWLINE or c in GEN4_BREAKS:
            out.append(NEWLINE)
        elif c == GEN4_SPACE:
            out.append(ord(" "))
        elif GEN4_FIRST <= c < GEN4_FIRST + len(GEN4_CHARS):
            out.append(ord(GEN4_CHARS[c - GEN4_FIRST]))
        else:
            raise FlavourError(f"{where}: Gen 4 character {c:#06x} isn't in the table")
    return out


def to_text(chars: list[int]) -> str:
    return "".join("\n" if c == NEWLINE else chr(c) for c in chars)


def from_text(text: str) -> list[int]:
    return [NEWLINE if ch == "\n" else ord(ch) for ch in text]


def normalised(text: str) -> str:
    """The entry's words, for comparing: its line breaks and runs of spaces as one space, straight quotes."""
    for curly, straight in QUOTES.items():
        text = text.replace(curly, straight)
    return " ".join(text.split())


# How alike two entries' words must be to count as the same entry: with case, punctuation and accents set aside,
# a word-by-word likeness (difflib's ratio) of at least this, so that an added comma or a name in capitals (Gen 4's
# "SHELLDER") doesn't keep an entry that says nothing new; different words do (the user's choice, 2026-11-11)
SAME_ENTRY = 0.95


def loose_words(text: str) -> list[str]:
    """The entry's words for a loose comparison: lower case, accents and punctuation dropped."""
    text = unicodedata.normalize("NFKD", normalised(text).lower())
    return "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in text if not unicodedata.combining(ch)).split()


def same_entry(a: str, b: str) -> bool:
    """Whether two entries say the same, as SAME_ENTRY has it."""
    words_a, words_b = loose_words(a), loose_words(b)
    return words_a == words_b or difflib.SequenceMatcher(None, words_a, words_b).ratio() >= SAME_ENTRY


class Font:
    """A font of ARCID_FONT, for its characters' widths as GFL_FontGetCharWidth gives them (gf_font.c)."""

    def __init__(self, data: bytes):
        self.data = data
        info = 0x18
        self.default_width = data[info + 6]
        self.width_offset, self.map_offset = struct.unpack_from("<II", data, info + 12)

    def index(self, c: int) -> int | None:
        offset = self.map_offset
        while True:
            first, last, method, _, next_map = struct.unpack_from("<HHHHI", self.data, offset)
            table = offset + 12
            if first <= c <= last:
                if method == 0:
                    return struct.unpack_from("<H", self.data, table)[0] + c - first
                if method == 1:
                    index = struct.unpack_from("<H", self.data, table + 2 * (c - first))[0]
                    return None if index == 0xFFFF else index
                pairs = struct.unpack_from("<H", self.data, table)[0]
                for i in range(pairs):
                    char, index = struct.unpack_from("<HH", self.data, table + 2 + 4 * i)
                    if char == c:
                        return index
                return None
            if not next_map:
                return None
            offset = next_map

    def width(self, c: int) -> int:
        index = self.index(c)
        if index is None:
            raise FlavourError(f"the font has no {chr(c)!r} ({c:#06x})")
        widths = self.data[self.width_offset:]
        classes, hashes, buckets = struct.unpack_from("<III", widths, 4)
        bit = index * 2
        kind = (widths[classes + (bit >> 3)] >> (6 - (bit & 7))) & 3
        if kind < 3:
            return widths[kind]
        parity = ((index >> 12) ^ (index >> 11) ^ (index >> 10) ^ (index >> 9)) & 1
        width = struct.unpack_from("<b", widths, hashes + (((index & 0x1FF) ^ (parity << 3)) & 0x1FF))[0]
        if width >= 0:
            return width
        entry = buckets
        for _ in range(-width - 1):
            entry += widths[entry] * 3 + 1
        for i in range(widths[entry]):
            pos = entry + 1 + 3 * i
            if (widths[pos] << 8 | widths[pos + 1]) == index:
                return widths[pos + 2]
        return self.default_width

    def line_width(self, line: str) -> int:
        return sum(self.width(ord(ch)) for ch in line)


def wrap(text: str, font: Font, count: int) -> str | None:
    """The entry as its lines if they fit count lines of LINE_WIDTH in the font, else wrapped at its spaces, or None if
    it can't fit."""
    lines = text.split("\n")
    if len(lines) <= count and all(font.line_width(line) <= LINE_WIDTH for line in lines):
        return text
    lines = [""]
    for word in normalised(text).split(" "):
        candidate = f"{lines[-1]} {word}" if lines[-1] else word
        if font.line_width(candidate) <= LINE_WIDTH:
            lines[-1] = candidate
        else:
            lines.append(word)
    if len(lines) > count or any(font.line_width(line) > LINE_WIDTH for line in lines):
        return None
    return "\n".join(lines)


def fit(text: str, font: Font, small: Font) -> tuple[str, int] | None:
    """The entry's lines and flags for the window: in font 0 if it fits, else in the small font, else None."""
    fitted = wrap(text, font, LINE_COUNT)
    if fitted is not None:
        return fitted, 0
    fitted = wrap(text, small, SMALL_LINE_COUNT)
    return None if fitted is None else (fitted, SMALL_FONT)


def white2_entries() -> dict[int, str]:
    numbers = constants()
    out = {}
    for path in SPECIES.glob("*/data.json"):
        number = numbers.get(f"SPECIES_{path.parent.name.upper()}")
        if number is None or not 1 <= number <= LAST_SPECIES:
            continue
        entry = json.loads(path.read_text())["pokedex"]["entry"]
        out[number] = re.sub(r"\\x\{([0-9a-fA-F]{4})\}", lambda m: chr(int(m.group(1), 16)), entry)
    return out


def game_entries(rom_dir: Path, game: int) -> list[str] | None:
    """The game's entries by species number from its ROM, as White 2's text, or None without the ROM."""
    name, rom_name, archive, bank, generation, last, _ = GAMES[game]
    path = rom_dir / rom_name
    if not path.is_file():
        return None
    if generation <= 3:
        try:
            entries = read_entries(path, generation, name)
        except GbError as error:
            raise FlavourError(str(error)) from error
        if len(entries) != last + 1:
            raise FlavourError(f"{path}: {len(entries) - 1} entries, not {last}")
        return entries
    files = nitrofs(path.read_bytes())
    if archive not in files:
        raise FlavourError(f"{path}: no {archive}; is it a US {name}?")
    members = read_narc(files[archive])
    if bank >= len(members):
        raise FlavourError(f"{path}: {archive} has no member {bank}; is it a US {name}?")
    if generation == 5:
        messages = gen5_bank(members[bank])
        if any(c >= CONTROL and c != NEWLINE for m in messages[1:last + 1] for c in m):
            raise FlavourError(f"{path}: an entry has a control code")
    else:
        messages = [gen4_to_w2(m, f"{name}'s entry {i}") for i, m in enumerate(gen4_bank(members[bank]))]
    if len(messages) <= last or "seed" not in to_text(messages[1]):
        raise FlavourError(f"{path}: {archive}'s member {bank} isn't the English Pokédex entries; is it a US {name}?")
    return [to_text(m) for m in messages[:last + 1]]


def unbreak(text: str, words: set[str], report: list) -> str:
    """The older games' words broken over two lines with a hyphen (BROKEN_WORD) joined again ("sur-roundings" is
    "surroundings"), or kept with their hyphen where the entries write the word with one and never without, or where
    both halves are words and the whole isn't ("DNA-engineering")."""
    def join(match):
        first, second = match.group(1), match.group(2)
        whole = f"{first}{second}".lower()
        known = whole in words or re.sub(r"(e?s|ed)$", "", whole) in words
        hyphenated = not known and (f"{first}-{second}".lower() in words or
                                    (first.lower() in words and second.lower() in words))
        report.append(f"{first}-{second}" if hyphenated else f"{first}|{second}")
        return f"{first}-{second}" if hyphenated else f"{first}{second}"
    return re.sub(rf"(\w+){BROKEN_WORD}(\w+)", join, text)


def collect(rom_dir: Path, font_path: Path):
    """Each species' kept entries as (games mask, flags, text), with what the report says."""
    fonts = read_narc(font_path.read_bytes())
    font, small = Font(fonts[ENTRY_FONT]), Font(fonts[SMALL_FONT_ID])
    white2 = white2_entries()
    games = [game_entries(rom_dir, game) for game in range(len(GAMES))]
    # The words the entries write, for joining the older games' broken words: White 2's, and every game's but where
    # a word was broken
    words = {word.lower() for text in [*white2.values(), *(t for g in games if g for t in g)]
             for word in re.findall(r"[\w-]+", re.sub(rf"\w*{BROKEN_WORD}\w*", " ", text))}
    kept: dict[int, list[list]] = {}
    # White 2's own entries fit as they are, the widest line exactly LINE_WIDTH; the report names any that the measure
    # says don't, which would mean an edited entry too long for the window, or a wrong measure
    report = {"games": [], "small": [], "unfit": [], "unbroken": [],
              "white2": [species for species, text in sorted(white2.items()) if wrap(text, font, LINE_COUNT) != text]}
    for game, entries in enumerate(games):
        if entries is None:
            report["games"].append((GAMES[game][0], None))
            continue
        counts = {"read": 0, "differ": 0, "kept": 0, "shared": 0, "small font": 0, "left out": 0}
        for species in range(1, len(entries)):
            # Straight quotes, and no spaces at the lines' ends
            text = unbreak(entries[species], words, report["unbroken"])
            text = "\n".join(line.strip() for line in text.strip().split("\n"))
            text = "".join(QUOTES.get(ch, ch) for ch in text)
            if not text:
                continue
            counts["read"] += 1
            if same_entry(text, white2.get(species, "")):
                continue
            counts["differ"] += 1
            earlier = next((e for e in kept.get(species, []) if same_entry(e[2], text)), None)
            if earlier is not None:
                earlier[0] |= 1 << game
                counts["shared"] += 1
                continue
            fitted = fit(text, font, small)
            if fitted is None:
                counts["left out"] += 1
                report["unfit"].append((GAMES[game][0], species, text))
                continue
            if fitted[1] & SMALL_FONT:
                counts["small font"] += 1
                report["small"].append((GAMES[game][0], species, fitted[0]))
            kept.setdefault(species, []).append([1 << game, fitted[1], fitted[0]])
            counts["kept"] += 1
        report["games"].append((GAMES[game][0], counts))
    return kept, report


def page_messages() -> dict[str, str]:
    out = {}
    for line in PAGE_TEXT.read_text().splitlines():
        name, sep, text = line.partition(" = ")
        if sep:
            out[name] = text
    return out


def label(games: int, messages: dict[str, str]) -> list[tuple[str, int]]:
    """The tab's label, as the page makes it (PokedexInfoFlavour_MakeLabel), as its pieces and their games: one game's
    name, or the short names of the games sharing the entry, LABEL_GAP apart."""
    shown = [i for i in range(len(GAMES)) if games >> i & 1]
    if len(shown) == 1:
        return [(messages[f"PokedexData_Text_Game{GAMES[shown[0]][6]}"], shown[0])]
    return [(messages[f"PokedexData_Text_GameShort{GAMES[i][6]}"], i) for i in shown]


def label_width(pieces: list[tuple[str, int]], font) -> int:
    width = getattr(font, "line_width", None) or font.text_width
    return sum(width(text) for text, _ in pieces) + LABEL_GAP * (len(pieces) - 1)


def check_labels(kept: dict[int, list[list]], font_path: Path):
    font = Font(read_narc(font_path.read_bytes())[LABEL_FONT])
    messages = page_messages()
    for games in {games for entries in kept.values() for games, _, _ in entries}:
        pieces = label(games, messages)
        if label_width(pieces, font) > TAB_TEXT_RIGHT - TAB_TEXT_MIN_X:
            raise FlavourError(f"the tab's label {' '.join(p for p, _ in pieces)!r} is {label_width(pieces, font)} "
                               f"pixels, wider than its {TAB_TEXT_RIGHT - TAB_TEXT_MIN_X}; shorten the games' names in "
                               f"{PAGE_TEXT.name}")


# The label's palette, its OBJs' own row (LABEL_ROW in the C file): 0 clear, LABEL_SHADOW the shadow under every name,
# then the games' colours, each game's slot in LABEL_COLORS (sGameColors in the C file). Games of the same colour have
# names that tell them apart and are never next to each other in a label (the report says if they are)
LABEL_SHADOW = 1
LABEL_PALETTE = [
    (0, 0, 0),
    (40, 40, 48),     # 1 the shadow
    (232, 56, 48),    # 2 Red, FireRed
    (64, 144, 248),   # 3 Blue, Diamond
    (248, 216, 48),   # 4 Yellow, HeartGold
    (200, 144, 32),   # 5 Gold
    (152, 160, 176),  # 6 Silver
    (88, 216, 232),   # 7 Crystal
    (224, 48, 104),   # 8 Ruby
    (96, 96, 240),    # 9 Sapphire
    (64, 200, 80),    # 10 LeafGreen, Emerald
    (248, 136, 192),  # 11 Pearl
    (192, 176, 232),  # 12 Platinum
    (216, 220, 232),  # 13 SoulSilver
    (112, 112, 120),  # 14 Black, Black 2
    (248, 248, 248),  # 15 White
]
LABEL_COLORS = {"Red": 2, "Blue": 3, "Yellow": 4, "Gold": 5, "Silver": 6, "Crystal": 7, "Ruby": 8, "Sapphire": 9,
                "FireRed": 2, "LeafGreen": 10, "Emerald": 10, "Diamond": 3, "Pearl": 11, "Platinum": 12,
                "HeartGold": 4, "SoulSilver": 13, "Black": 14, "White": 15, "Black 2": 14}


def palette_bytes(colors: list) -> bytes:
    return b"".join(struct.pack("<H", round(r * 31 / 255) | round(g * 31 / 255) << 5 | round(b * 31 / 255) << 10)
                    for r, g, b in colors)


def read_art():
    try:
        width, height, pixels, colors = read_indexed_png(TAB_ART)
    except ValueError as error:
        raise FlavourError(str(error)) from error
    if (width, height) != (SCREEN_WIDTH, SCREEN_HEIGHT) or max(pixels) > 15:
        raise FlavourError(f"{TAB_ART.name}: must be {SCREEN_WIDTH} by {SCREEN_HEIGHT}, indexed in 16 colours")
    for i, value in enumerate(pixels):
        x, y = i % width, i // width
        if value and not (TAB_X <= x < TAB_X + TAB_WIDTH and TAB_Y <= y < TAB_Y + TAB_HEIGHT):
            raise FlavourError(f"{TAB_ART.name}: a pixel at x {x}, y {y}, outside the tab's x {TAB_X}-"
                               f"{TAB_X + TAB_WIDTH - 1}, y {TAB_Y}-{TAB_Y + TAB_HEIGHT - 1}")
    # The label's place must be the plain tab, its stripes at least TAB_STRIPE_MARGIN after it
    for y in range(TAB_Y + TAB_TEXT_Y, TAB_Y + TAB_TEXT_Y + SMALL_GLYPH_ROWS):
        row = pixels[y * width + TAB_TEXT_MIN_X:y * width + TAB_TEXT_RIGHT + TAB_STRIPE_MARGIN]
        if len(set(row)) != 1:
            raise FlavourError(f"{TAB_ART.name}: the label's place (x {TAB_TEXT_MIN_X}-{TAB_TEXT_RIGHT - 1} and "
                               f"{TAB_STRIPE_MARGIN} pixels after it, y {y}) isn't one colour; move TAB_TEXT_RIGHT")
    return width, pixels, colors


def tab_member() -> bytes:
    """The tab's 16 colours and the label's (BGR555), then the tab's region's tiles (4bpp) across and down, as the
    page's bitmap has them."""
    width, pixels, colors = read_art()
    out = bytearray(palette_bytes((list(colors) + [(0, 0, 0)] * 16)[:16]) + palette_bytes(LABEL_PALETTE))
    for tile_y in range(TAB_Y, TAB_Y + TAB_HEIGHT, 8):
        for tile_x in range(TAB_X, TAB_X + TAB_WIDTH, 8):
            for y in range(8):
                row = pixels[(tile_y + y) * width + tile_x:(tile_y + y) * width + tile_x + 8]
                out += bytes(row[i] | row[i + 1] << 4 for i in range(0, 8, 2))
    return bytes(out)


def member(kept: dict[int, list[list]]) -> bytes:
    blocks = []
    for species in range(LAST_SPECIES + 1):
        block = bytearray()
        for games, flags, text in kept.get(species, []):
            chars = from_text(text) + [LINE_END]
            block += struct.pack(f"<HHHH{len(chars)}H", games & 0xFFFF, games >> 16, flags, len(chars), *chars)
        blocks.append(bytes(block))
    offsets = []
    position = 4 * (len(blocks) + 2)
    for block in blocks:
        offsets.append(position)
        position += len(block)
    offsets.append(position)
    return struct.pack(f"<I{len(offsets)}I", FORMAT_VERSION, *offsets) + b"".join(blocks)


# The widest labels for the templates: one game's (SoulSilver) and the most games' sharing an entry in use with all the
# ROMs (dex_flavour.py report's "games sharing an entry")
TEMPLATE_SHARED = ("Diamond", "Pearl", "Platinum", "Black", "White")


def write_templates(out: Path, small):
    """The tab's templates, beside pokedex_templates.py's (which calls this with font 1, its Font): the art to draw
    over (version_flavour_canvas.png, the art itself), version_flavour_guide.png (the art with the OBJs' region
    outlined in red and the label's in green, from TAB_TEXT_MIN_X to TAB_TEXT_RIGHT on the text's rows), and
    version_flavour_reference_<label>.png, the tab as the page shows it with the widest labels: one game's (SoulSilver)
    and TEMPLATE_SHARED's."""
    from tools.paperwhite2.pokedex_templates import Canvas
    width, pixels, colors = read_art()
    (out / "version_flavour_canvas.png").write_bytes(TAB_ART.read_bytes())
    # The art's colours, the label's after them, then the guide's
    palette = (list(colors) + [(0, 0, 0)] * 16)[:16] + LABEL_PALETTE + [(255, 0, 0), (0, 200, 0)]
    red, green = 32, 33
    guide = Canvas()
    guide.pixels = bytearray(pixels)
    guide.outline(TAB_X, TAB_Y, TAB_WIDTH, TAB_HEIGHT, red)
    guide.outline(TAB_TEXT_MIN_X, TAB_Y + TAB_TEXT_Y, TAB_TEXT_RIGHT - TAB_TEXT_MIN_X, small.height, green)
    guide.write(out / "version_flavour_guide.png", palette)
    messages = page_messages()
    names = [game[0] for game in GAMES]
    for name, games in (("soulsilver", 1 << names.index("SoulSilver")),
                        ("shared", sum(1 << names.index(game) for game in TEMPLATE_SHARED))):
        pieces = label(games, messages)
        x = max(TAB_TEXT_MIN_X, min(TAB_TEXT_X, TAB_TEXT_RIGHT - label_width(pieces, small)))
        canvas = Canvas()
        canvas.pixels = bytearray(pixels)
        for piece, game in pieces:
            canvas.text(small, piece, x, TAB_Y + TAB_TEXT_Y, letter=16 + LABEL_COLORS[GAMES[game][0]],
                        shadow=16 + LABEL_SHADOW)
            x += small.text_width(piece) + LABEL_GAP
        canvas.write(out / f"version_flavour_reference_{name}.png", palette)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["build", "report", "template"])
    parser.add_argument("output", type=Path, nargs="?")
    parser.add_argument("--roms", type=Path, default=ROMS)
    parser.add_argument("--font", type=Path, default=FONT)
    args = parser.parse_args()
    if args.command == "template":
        from tools.paperwhite2.pokedex_templates import Font as TemplateFont
        out = args.output or ROOT / "build" / "pokedex_templates"
        out.mkdir(parents=True, exist_ok=True)
        write_templates(out, TemplateFont(read_narc(args.font.read_bytes())[LABEL_FONT]))
        return
    try:
        kept, report = collect(args.roms, args.font)
        check_labels(kept, args.font)
        tab_member()
    except FlavourError as e:
        sys.exit(f"dex_flavour.py: {e}")
    if args.command == "build":
        if args.output is None:
            parser.error("build needs OUT")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(member(kept))
        return
    for name, counts in report["games"]:
        print(f"{name:11}", "no ROM" if counts is None else
              ", ".join(f"{key} {value}" for key, value in counts.items()))
    combos = {}
    for entries in kept.values():
        for games, _, _ in entries:
            combos[games] = combos.get(games, 0) + 1
    print("species with entries:", len(kept), "; entries:", sum(len(e) for e in kept.values()),
          "; most for a species:", max((len(e) for e in kept.values()), default=0),
          "; bytes:", len(member(kept)))
    messages = page_messages()
    font = Font(read_narc(args.font.read_bytes())[LABEL_FONT])
    print("games sharing an entry (label, its width, entries):")
    for games, count in sorted(combos.items(), key=lambda item: -label_width(label(item[0], messages), font)):
        pieces = label(games, messages)
        same = [f"{a}+{b}" for (a, i), (b, j) in zip(pieces, pieces[1:])
                if LABEL_COLORS[GAMES[i][0]] == LABEL_COLORS[GAMES[j][0]]]
        print(f"  {' '.join(p for p, _ in pieces):24} {label_width(pieces, font):3} {count:4}",
              f"(same colour side by side: {', '.join(same)})" if same else "")
    print("broken words joined:", sorted(set(report["unbroken"])))
    for name, species, text in report["small"]:
        print(f"small font: {name} {species}: {text!r}")
    for name, species, text in report["unfit"]:
        print(f"left out (too long): {name} {species}: {text!r}")
    print("White 2's own entries that don't fit the window:", report["white2"] or "none")


if __name__ == "__main__":
    main()
