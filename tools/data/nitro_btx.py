"""Write Nitro texture sets (NSBTX, BTX0) of plain textures and palettes, as the game's field sprites have them."""

import struct

from nitro_dictionary import build_dictionary, search_nodes

TEX0_HEADER = 0x3C
# Texture formats (GXTexFmt) and their bits per texel
BITS = {2: 2, 3: 4, 4: 8, 7: 16}


def texture_params(offset, width, height, fmt, color0):
    """Returns a texture's TEXIMAGE_PARAM: its data's offset in 8-byte units, size, format and whether color 0 is
    transparent."""
    return ((offset >> 3) | ((width // 8).bit_length() - 1) << 20 | ((height // 8).bit_length() - 1) << 23
            | fmt << 26 | int(color0) << 29)


def texture_set(textures, palettes, ndspy=False, split_from=None):
    """Returns a BTX0 of textures, (name, width, height, fmt, color0, data), and palettes, (name, data). With ndspy,
    it is written as ndspy writes one, as Pokeweb's Following Pokémon installer did for the follower sprites that
    Paper White 2 has: the dictionaries without their search trees, and no bit 31 in each texture's size word.
    split_from names the textures of a larger set that these were taken from, whose texture dictionary's search
    nodes they keep: its root and, for each texture, the node in that texture's place in it, as Pokeweb's importer
    left them when it saved each frame of HeartGold's two-frame emote sets on its own with ndspy (Paper White 2's
    follower emotes)."""
    texel_data = b"".join(data for *_, data in textures)
    palette_data = b"".join(data for _, data in palettes)
    records, offset = [], 0
    for name, width, height, fmt, color0, data in textures:
        if len(data) != width * height * BITS[fmt] // 8:
            raise ValueError(f"texture {name}: {len(data)} bytes of data for {width} by {height}")
        records.append(struct.pack("<II", texture_params(offset, width, height, fmt, color0),
                                   width | height << 11 | (0 if ndspy else 0x80000000)))
        offset += len(data)
    nodes = None
    if split_from is not None:
        larger = search_nodes(split_from)
        nodes = [larger[0]] + [larger[1 + split_from.index(name)] for name, *_ in textures]
    texture_dictionary = build_dictionary([name for name, *_ in textures], records, not ndspy, nodes)
    palette_records, offset = [], 0
    for _, data in palettes:
        palette_records.append(struct.pack("<HH", offset >> 3, 0))
        offset += len(data)
    palette_dictionary = build_dictionary([name for name, _ in palettes], palette_records, not ndspy)
    palette_info = TEX0_HEADER + len(texture_dictionary)
    texel_start = palette_info + len(palette_dictionary)
    palette_start = texel_start + len(texel_data)
    size = palette_start + len(palette_data)
    header = struct.pack("<4sIIHHIIIHHIIIIIII", b"TEX0", size, 0, len(texel_data) >> 3, TEX0_HEADER, 0, texel_start,
                         0, 0, TEX0_HEADER, 0, palette_start, palette_start, 0, len(palette_data) >> 3, palette_info,
                         palette_start)
    block = header + texture_dictionary + palette_dictionary + texel_data + palette_data
    return struct.pack("<4sHHIHHI", b"BTX0", 0xFEFF, 1, 0x14 + len(block), 0x10, 1, 0x14) + block
