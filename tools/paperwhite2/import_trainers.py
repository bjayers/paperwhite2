"""Bring the hack's real trainer changes into res/trainers/data/, leaving Frost's re-save noise behind.

Usage: import_trainers.py TRAINER...
Takes each trainer's party, and any message whose text changed for its type, from the hack's dump. Names keep res/'s
unless the hack's differs beyond a stray \\x{ffff}. compress_name and the message order stay as res/ has them.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import write

ROOT = Path(__file__).resolve().parents[2]
HACK, RES = ROOT / "extract/pw2_dump/trainers/data", ROOT / "res/trainers/data"


def main():
    for trainer in sys.argv[1:]:
        res_path = RES / f"{trainer}.json"
        res = json.loads(res_path.read_text())
        hack = json.loads((HACK / f"{trainer}.json").read_text())
        changes = []
        if res["party"] != hack["party"]:
            res["party"] = hack["party"]
            changes.append("party")
        hack_name = hack["name"].replace("\\x{ffff}", "")
        if hack_name != res["name"]:
            res["name"] = hack_name
            changes.append("name")
        hack_texts = {m["type"]: m["text"] for m in hack.get("messages", [])}
        for message in res.get("messages", []):
            if message["type"] in hack_texts and hack_texts[message["type"]] != message["text"]:
                message["text"] = hack_texts[message["type"]]
                changes.append(f"message {message['type']}")
        for key in set(res) | set(hack):
            if key not in ("party", "name", "messages", "compress_name") and res.get(key) != hack.get(key):
                changes.append(f"UNHANDLED {key}")
        write(res_path, res)
        print(f"{trainer}: {', '.join(changes) or 'no change'}")


main()
