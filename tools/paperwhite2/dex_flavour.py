#!/usr/bin/env python3
"""Paper White 2: the Pokédex Info page's Flavour, the other games' Pokédex entries of each species, taken at build
time from the user's own ROMs (docs/paperwhite2/design/pokedex-flavour.md, docs/paperwhite2/plugins.md's Pokédex).

    dex_flavour.py build OUT [--roms DIR] [--font FONT]   # the build: the member that pokedex_evo.py adds
    dex_flavour.py report [--roms DIR] [--font FONT]      # the counts per game and every entry re-wrapped or left out
    dex_flavour.py template [OUT_DIR] [--font FONT]       # the version tab's templates (write_templates)

pokedex_evo.py adds the member and the tab's (tab_member) to ARCID_POKEDEX_GRA; the build's step that runs this
depends on the ROMs present when configure.py ran, so run it again after adding one.

Nothing extracted is kept in res/ or git: the ROMs are read from orig/ (ignored), and the member is written into
build/. A ROM that isn't there is skipped, and with none the member has no entries. The games, in the order that an
entry two of them share is kept for (the first's), each with its ROM, the message archive and the bank of its own
entries (US/English ROMs; the other banks there are the other version's entries, or the English ones that another
language's game shows):

    Black       dex_black.nds       a/0/0/2              236 (the 650 species' entries, Gen 5's message format)
    White       dex_white.nds       a/0/0/2              235
    Black 2     dex_black2.nds      a/0/0/2              442
    Diamond     dex_diamond.nds     msgdata/msg.narc     615 (the 494 species' entries, Gen 4's format)
    Pearl       dex_pearl.nds       msgdata/msg.narc     616
    Platinum    dex_platinum.nds    msgdata/pl_msg.narc  700
    HeartGold   dex_heartgold.nds   a/0/2/7              803
    SoulSilver  dex_soulsilver.nds  a/0/2/7              804

Each bank is checked by its size and by Bulbasaur's entry (it mentions the seed on its back), so a ROM of another
language or revision is refused rather than read wrong. Black's and White's banks are told apart by their version
mascots: each game's own mascot has the entry that begins "This Pokémon appears in legends."

Gen 4's messages are encrypted per entry (a key from the bank's seed for the table of offsets and lengths, and one
from the entry's number for its characters) and use Gen 4's character table (GEN4_CHARS, 0xE000 a new line); they are
converted to White 2's encoding, which is UTF-16 with 0xFFFE for a new line. Typographic quotes and apostrophes become
the straight ones White 2's English entries use.

An entry is kept when it differs from White 2's own (res/pokemon/<species>/data.json's pokedex entry; same_entry: case,
punctuation, accents and line breaks set aside, words at least SAME_ENTRY alike), and when no game before it has the
same entry; the games sharing it
are a bit mask, which the page's tab names. It must fit the Info page's text window as PokedexInfo prints it
(pokedex_info.c): LINE_COUNT lines of at most LINE_WIDTH pixels in font 0 (the font's own widths, as
GFL_FontGetLineWidth adds them). An entry whose lines are too wide is re-wrapped at its spaces; one that still needs
more lines is left out, and the report names it.

The member (FLAVOUR_FILE in paperwhite2_pokedex_info.c), read by range for one species:

    u32 offsets[SPECIES_COUNT + 1]   for species 0 to the last, where its entries start, and the end after the last
    per entry: u16 games (bit i for GAMES[i]), u16 characters (the text's, its 0xFFFF terminator included), the text

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
# The version tab on the top screen while another game's entry shows (paperwhite2_pokedex_info_flavour.c's TAB_*):
# the user's art, res/paperwhite2/pokedex_art/version_flavour.png, a whole top screen whose tab is drawn in the region
# of the TAB_OBJS OBJs of 32 by 32 from TAB_X, TAB_Y. Its label, the game's name or the games' short names with the
# separator between, is in font 1 from TAB_TEXT_X (TAB_TEXT_Y down the region), or further left to end by
# TAB_TEXT_RIGHT, but not left of TAB_TEXT_MIN_X
TAB_ART = ROOT / "res" / "paperwhite2" / "pokedex_art" / "version_flavour.png"
TAB_X = 0
TAB_Y = 120
TAB_OBJS = 3
TAB_WIDTH = TAB_OBJS * 32
TAB_HEIGHT = 32
TAB_TEXT_X = 11
TAB_TEXT_RIGHT = 64
TAB_TEXT_Y = 8
TAB_TEXT_MIN_X = 2
LABEL_FONT = 1
SCREEN_WIDTH = 256
SCREEN_HEIGHT = 192
PAGE_TEXT = ROOT / "res" / "text" / "system" / "pokedex_data.txt"
# The label's messages there, in GAMES' order
GAME_NAMES = ["Black", "White", "Black2", "Diamond", "Pearl", "Platinum", "HeartGold", "SoulSilver"]

# (name, ROM, archive, bank, generation, last species)
GAMES = [
    ("Black", "dex_black.nds", "a/0/0/2", 236, 5, 649),
    ("White", "dex_white.nds", "a/0/0/2", 235, 5, 649),
    ("Black 2", "dex_black2.nds", "a/0/0/2", 442, 5, 649),
    ("Diamond", "dex_diamond.nds", "msgdata/msg.narc", 615, 4, 493),
    ("Pearl", "dex_pearl.nds", "msgdata/msg.narc", 616, 4, 493),
    ("Platinum", "dex_platinum.nds", "msgdata/pl_msg.narc", 700, 4, 493),
    ("HeartGold", "dex_heartgold.nds", "a/0/2/7", 803, 4, 493),
    ("SoulSilver", "dex_soulsilver.nds", "a/0/2/7", 804, 4, 493),
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


def fit(text: str, font: Font) -> str | None:
    """The entry as its lines if they fit the window, else re-wrapped at its spaces, or None if it can't fit."""
    lines = text.split("\n")
    if len(lines) <= LINE_COUNT and all(font.line_width(line) <= LINE_WIDTH for line in lines):
        return text
    lines = [""]
    for word in normalised(text).split(" "):
        candidate = f"{lines[-1]} {word}" if lines[-1] else word
        if font.line_width(candidate) <= LINE_WIDTH:
            lines[-1] = candidate
        else:
            lines.append(word)
    if len(lines) > LINE_COUNT or any(font.line_width(line) > LINE_WIDTH for line in lines):
        return None
    return "\n".join(lines)


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
    name, rom_name, archive, bank, generation, last = GAMES[game]
    path = rom_dir / rom_name
    if not path.is_file():
        return None
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


def collect(rom_dir: Path, font_path: Path):
    """Each species' kept entries as (games mask, text), with what the report says."""
    font = Font(read_narc(font_path.read_bytes())[ENTRY_FONT])
    white2 = white2_entries()
    kept: dict[int, list[list]] = {}
    # White 2's own entries fit as they are, the widest line exactly LINE_WIDTH; the report names any that the measure
    # says don't, which would mean an edited entry too long for the window, or a wrong measure
    report = {"games": [], "rewrapped": [], "unfit": [],
              "white2": [species for species, text in sorted(white2.items()) if fit(text, font) != text]}
    for game in range(len(GAMES)):
        entries = game_entries(rom_dir, game)
        if entries is None:
            report["games"].append((GAMES[game][0], None))
            continue
        counts = {"read": 0, "differ": 0, "kept": 0, "shared": 0, "unfit": 0}
        for species in range(1, len(entries)):
            # Straight quotes, and no spaces at the lines' ends
            text = "\n".join(line.strip() for line in entries[species].strip().split("\n"))
            text = "".join(QUOTES.get(ch, ch) for ch in text)
            if not text:
                continue
            counts["read"] += 1
            if same_entry(text, white2.get(species, "")):
                continue
            counts["differ"] += 1
            earlier = next((e for e in kept.get(species, []) if same_entry(e[1], text)), None)
            if earlier is not None:
                earlier[0] |= 1 << game
                counts["shared"] += 1
                continue
            fitted = fit(text, font)
            if fitted is None:
                counts["unfit"] += 1
                report["unfit"].append((GAMES[game][0], species, text))
                continue
            if fitted != text:
                report["rewrapped"].append((GAMES[game][0], species, fitted))
            kept.setdefault(species, []).append([1 << game, fitted])
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


def label(games: int, messages: dict[str, str]) -> str:
    """The tab's label, as the page makes it (PokedexInfoFlavour_MakeLabel): one game's name, or the short names of
    the games sharing the entry with the separator between."""
    shown = [i for i in range(len(GAMES)) if games >> i & 1]
    if len(shown) == 1:
        return messages[f"PokedexData_Text_Game{GAME_NAMES[shown[0]]}"]
    return messages["PokedexData_Text_GameSeparator"].join(
        messages[f"PokedexData_Text_GameShort{GAME_NAMES[i]}"] for i in shown)


def check_labels(kept: dict[int, list[list]], font_path: Path):
    font = Font(read_narc(font_path.read_bytes())[LABEL_FONT])
    messages = page_messages()
    for games in {games for entries in kept.values() for games, _ in entries}:
        text = label(games, messages)
        if font.line_width(text) > TAB_TEXT_RIGHT - TAB_TEXT_MIN_X:
            raise FlavourError(f"the tab's label {text!r} is {font.line_width(text)} pixels, wider than its "
                               f"{TAB_TEXT_RIGHT - TAB_TEXT_MIN_X}; shorten the games' names in {PAGE_TEXT.name}")


def tab_member() -> bytes:
    """The tab's 16 colours (BGR555), then its region's tiles (4bpp) across and down, as the page's bitmap has them."""
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
    out = bytearray()
    for r, g, b in (list(colors) + [(0, 0, 0)] * 16)[:16]:
        out += struct.pack("<H", round(r * 31 / 255) | round(g * 31 / 255) << 5 | round(b * 31 / 255) << 10)
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
        for games, text in kept.get(species, []):
            chars = from_text(text) + [LINE_END]
            block += struct.pack(f"<HH{len(chars)}H", games, len(chars), *chars)
        blocks.append(bytes(block))
    offsets = []
    position = 4 * (len(blocks) + 1)
    for block in blocks:
        offsets.append(position)
        position += len(block)
    offsets.append(position)
    return struct.pack(f"<{len(offsets)}I", *offsets) + b"".join(blocks)


def write_templates(out: Path, small):
    """The tab's templates, beside pokedex_templates.py's (which calls this with font 1, its Font): the art to draw
    over (version_flavour_canvas.png, the art itself), version_flavour_guide.png (the art with the OBJs' region
    outlined in red and the label's in green, from TAB_TEXT_MIN_X to TAB_TEXT_RIGHT on the text's rows), and
    version_flavour_reference_<label>.png, the tab as the page shows it with the widest labels: one game's (SoulSilver)
    and the five games' sharing an entry (B/W/D/P/Pt)."""
    from tools.paperwhite2.pokedex_templates import Canvas
    width, height, pixels, colors = read_indexed_png(TAB_ART)
    (out / "version_flavour_canvas.png").write_bytes(TAB_ART.read_bytes())
    palette = (list(colors) + [(0, 0, 0)] * 16)[:16] + [(255, 0, 0), (0, 200, 0)]
    red, green = 16, 17
    guide = Canvas()
    guide.pixels = bytearray(pixels)
    guide.outline(TAB_X, TAB_Y, TAB_WIDTH, TAB_HEIGHT, red)
    guide.outline(TAB_TEXT_MIN_X, TAB_Y + TAB_TEXT_Y, TAB_TEXT_RIGHT - TAB_TEXT_MIN_X, small.height, green)
    guide.write(out / "version_flavour_guide.png", palette)
    messages = page_messages()
    for name, games in (("soulsilver", 1 << 7), ("shared", 0b111011)):
        text = label(games, messages)
        x = max(TAB_TEXT_MIN_X, min(TAB_TEXT_X, TAB_TEXT_RIGHT - small.text_width(text)))
        canvas = Canvas()
        canvas.pixels = bytearray(pixels)
        canvas.text(small, text, x, TAB_Y + TAB_TEXT_Y, letter=4, shadow=9)
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
        for games, _ in entries:
            combos[games] = combos.get(games, 0) + 1
    print("species with entries:", len(kept), "; entries:", sum(len(e) for e in kept.values()),
          "; most for a species:", max((len(e) for e in kept.values()), default=0),
          "; bytes:", len(member(kept)))
    print("games sharing an entry:", {"/".join(GAMES[i][0] for i in range(len(GAMES)) if games >> i & 1): count
                                       for games, count in sorted(combos.items())})
    for name, species, text in report["rewrapped"]:
        print(f"re-wrapped: {name} {species}: {text!r}")
    for name, species, text in report["unfit"]:
        print(f"left out (too long): {name} {species}: {text!r}")
    messages = page_messages()
    print("labels:", sorted({label(games, messages) for games in combos}))
    print("White 2's own entries that don't fit the window:", report["white2"] or "none")


if __name__ == "__main__":
    main()
