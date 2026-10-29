#!/usr/bin/env python3
"""Fail if a ROM's header CRC is one that nds-bootstrap keys an anti-piracy fix to.

    check_header_crc.py build/paperwhite2.nds 0xe2db

Paper White 2 uses White 2's German game code, IRDD. nds-bootstrap's anti-piracy fix for IRDD applies only to the
retail German ROM's header CRC; a build with the same CRC would get it, and the fix's fixed-address writes corrupt the
hack's moved code and data. Any change to the header, such as the banner or the ROM's size, gives another CRC.
"""
import struct
import sys


def main():
    rom, forbidden = sys.argv[1], int(sys.argv[2], 0)
    with open(rom, "rb") as f:
        crc = struct.unpack_from("<H", f.read(0x160), 0x15E)[0]
    if crc == forbidden:
        sys.exit(f"{rom}: header CRC {crc:#06x} is the retail German ROM's, so nds-bootstrap would apply its "
                 "anti-piracy fix; change anything in the header (the banner's title, say) and rebuild")


if __name__ == "__main__":
    main()
