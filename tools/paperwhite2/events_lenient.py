"""Dump zone events like event_data.py's dump, tolerating files that don't round-trip byte for byte.

Usage: events_lenient.py FILES OUTPUT
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data import event_data
from tools.data.narc import read_narc

real_bytes = event_data.events_bytes


def lenient_bytes(events, where):
    if events.get("extra_padding", 0) < 0:
        events = {k: v for k, v in events.items() if k != "extra_padding"}
    return real_bytes(events, where)


def main():
    files, output = Path(sys.argv[1]), Path(sys.argv[2])
    event_data.events_bytes = lenient_bytes
    members = read_narc((files / "a/1/2/6").read_bytes())
    zones = event_data.zone_files_from_rom(files)
    for number, member in enumerate(members):
        if number not in zones:
            continue
        events = event_data.events_json(member)
        if events.get("extra_padding", 0) < 0:
            print(f"file {number} ({zones[number]}): {-events.pop('extra_padding')} bytes shorter than repacked")
        repacked = real_bytes(events, "")
        if repacked != member and repacked[:len(member)] != member:
            print(f"file {number} ({zones[number]}): repacks differently")
        event_data.write(output / event_data.file_name(zones[number]), events)
    event_data.write(output / "order.json", [zones.get(number) for number in range(len(members))])


main()
