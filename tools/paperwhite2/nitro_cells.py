"""Reads and writes Nitro cell banks (NCER) and cell animations (NANR), keeping their other blocks as they are.

Only the parts the C-Gear needs are modeled: a cell's objects and bounds, and a sequence's frames, each frame pointing
at one element of the animation data (a cell index, with a rotation, scale and translation for the larger formats).
Each table is addressed relative to its own start, so writing back what was read gives the same bytes, and cells,
sequences and elements added at the ends leave the original offsets as they were.
"""

import struct
from dataclasses import dataclass, field

# Each animation element's size by the sequence's format: a cell index; with SRT; with a translation
ELEMENT_SIZES = {0: 2, 1: 16, 2: 8}


@dataclass
class Obj:
    """One OAM entry of a cell, as the three attribute halfwords."""
    attr0: int
    attr1: int
    attr2: int

    @property
    def tile(self):
        return self.attr2 & 0x3FF

    @property
    def palette(self):
        return self.attr2 >> 12

    def with_palette(self, palette):
        return Obj(self.attr0, self.attr1, (self.attr2 & 0x0FFF) | palette << 12)

    def with_tile(self, tile):
        return Obj(self.attr0, self.attr1, (self.attr2 & ~0x3FF) | tile)


@dataclass
class Cell:
    attr: int
    objs: list
    bounds: tuple  # max x, max y, min x, min y, when the bank has bounds


@dataclass
class Frame:
    element: bytes
    duration: int
    pad: int = 0xBEEF

    @property
    def cell(self):
        return struct.unpack_from("<H", self.element)[0]

    def with_cell(self, cell):
        return Frame(struct.pack("<H", cell) + self.element[2:], self.duration, self.pad)


@dataclass
class Sequence:
    loop_start: int
    fmt: int
    kind: int
    mode: int
    frames: list = field(default_factory=list)


def _blocks(data):
    header_size, count = struct.unpack_from("<HH", data, 12)
    blocks, offset = [], header_size
    for _ in range(count):
        size = struct.unpack_from("<I", data, offset + 4)[0]
        blocks.append(data[offset:offset + size])
        offset += size
    return data[:header_size], blocks


def _file(header, blocks):
    body = b"".join(blocks)
    header = bytearray(header)
    struct.pack_into("<I", header, 8, len(header) + len(body))
    return bytes(header) + body


def _block(magic, payload):
    payload += b"\0" * (-len(payload) % 4)
    return magic + struct.pack("<I", len(payload) + 8) + payload


class CellBank:
    def __init__(self, data):
        self.header, self.blocks = _blocks(data)
        block = self.blocks[0]
        assert block[:4] == b"KBEC"
        count, self.attr, cell_offset = struct.unpack_from("<HHI", block, 8)
        self.tail = block[16:8 + cell_offset]
        entry = 16 if self.attr & 1 else 8
        cells_at = 8 + cell_offset
        oams_at = cells_at + count * entry
        self.cells = []
        # Objects are read by each cell's offset; cells that share objects get copies, which write back the same
        self._oam_offsets = []
        for i in range(count):
            n, attr, offset = struct.unpack_from("<HHI", block, cells_at + i * entry)
            bounds = struct.unpack_from("<hhhh", block, cells_at + i * entry + 8) if entry == 16 else ()
            objs = [Obj(*struct.unpack_from("<HHH", block, oams_at + offset + j * 6)) for j in range(n)]
            self.cells.append(Cell(attr, objs, bounds))
            self._oam_offsets.append((offset, n))
        self._oams = block[oams_at:]

    def to_bytes(self):
        entry = 16 if self.attr & 1 else 8
        oams = bytearray(self._oams)
        # Objects of the original cells go back where they were; added cells' objects go at the end
        offsets = []
        for i, cell in enumerate(self.cells):
            data = b"".join(struct.pack("<HHH", o.attr0, o.attr1, o.attr2) for o in cell.objs)
            # An original cell keeps its objects' place unless it has more of them than it had
            if i < len(self._oam_offsets) and len(cell.objs) <= self._oam_offsets[i][1]:
                offset = self._oam_offsets[i][0]
                oams[offset:offset + len(data)] = data
            else:
                offset = len(oams)
                oams += data
            offsets.append(offset)
        cells = b""
        for cell, offset in zip(self.cells, offsets):
            cells += struct.pack("<HHI", len(cell.objs), cell.attr, offset)
            if entry == 16:
                cells += struct.pack("<hhhh", *cell.bounds)
        payload = struct.pack("<HHI", len(self.cells), self.attr, 8 + len(self.tail)) + self.tail + cells + oams
        return _file(self.header, [_block(b"KBEC", payload)] + self.blocks[1:])


class Animations:
    def __init__(self, data):
        self.header, self.blocks = _blocks(data)
        block = self.blocks[0]
        assert block[:4] == b"KNBA"
        count, _, seq_offset, frame_offset, data_offset = struct.unpack_from("<HHIII", block, 8)
        self.tail = block[24:8 + seq_offset]
        base = 8
        self._data = block[base + data_offset:]
        self._frames_raw = block[base + frame_offset:base + data_offset]
        self.sequences = []
        self._frame_offsets = []
        for i in range(count):
            n, loop, fmt, kind, mode, offset = struct.unpack_from("<HHHHII", block, base + seq_offset + i * 16)
            frames = []
            for j in range(n):
                element, duration, pad = struct.unpack_from("<IHH", block, base + frame_offset + offset + j * 8)
                frames.append((element, duration, pad))
            self.sequences.append(Sequence(loop, fmt, kind, mode,
                                           [Frame(self._data[e:e + ELEMENT_SIZES[fmt]], d, p) for e, d, p in frames]))
            self._frame_offsets.append((offset, [e for e, _, _ in frames]))

    def to_bytes(self):
        data = bytearray(self._data)
        frames = bytearray(self._frames_raw)
        seqs = b""
        for i, seq in enumerate(self.sequences):
            if i < len(self._frame_offsets):
                offset, elements = self._frame_offsets[i]
                # An original sequence keeps its frames' places; an edited element is rewritten in place
                for frame, element in zip(seq.frames, elements):
                    data[element:element + len(frame.element)] = frame.element
            else:
                offset = len(frames)
                for frame in seq.frames:
                    data += b"\0" * (-len(data) % 4 if seq.fmt else 0)
                    element = len(data)
                    data += frame.element
                    frames += struct.pack("<IHH", element, frame.duration, frame.pad)
            seqs += struct.pack("<HHHHII", len(seq.frames), seq.loop_start, seq.fmt, seq.kind, seq.mode, offset)
        frame_count = sum(len(s.frames) for s in self.sequences)
        seq_offset = 16 + len(self.tail)
        payload = struct.pack("<HHIII", len(self.sequences), frame_count, seq_offset, seq_offset + len(seqs),
                              seq_offset + len(seqs) + len(frames)) + self.tail + seqs + frames + data
        return _file(self.header, [_block(b"KNBA", payload)] + self.blocks[1:])
