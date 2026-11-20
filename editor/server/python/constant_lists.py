"""Prints the names of each constant list in generated/ (moves.txt, items.txt...) as JSON, {list: [names]}, using the
build's own reader, so the editor's pickers can offer a list's own names: MOVE_ is the moves of moves.txt, not also the
MOVE_CODE_, MOVE_TARGET_ and MOVE_FLAG_ constants that share the prefix."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from tools.data.datajson import LISTS_DIR, parse  # noqa: E402

json.dump({path.stem: list(parse(path)) for path in sorted(LISTS_DIR.glob("*.txt"))}, sys.stdout)
