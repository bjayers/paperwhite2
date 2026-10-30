"""Prints every constant the data may name (generated/ and include/constants/) as JSON, using the build's own
reader, so the editor's dropdowns and checks know exactly what the build knows."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from tools.data.datajson import constants  # noqa: E402

json.dump(constants(), sys.stdout)
