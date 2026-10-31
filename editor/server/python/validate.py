"""Checks data files against their schemas with the build's own validator.

Reads lines of "data_path<TAB>schema_path" on stdin and writes one JSON line per file: {"ok": true} or
{"ok": false, "error": "..."}. It stays running, so the constants are read once rather than on every save."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from tools.data.datajson import DataError, load, load_schema  # noqa: E402


def schema_for(name: str) -> dict:
    """A schema file, or the definition that a "#/$defs/name" fragment names, with the file's definitions, as the
    conditions' tools read one (conditions.py load_def)."""
    path, _, fragment = name.partition("#")
    schema = load_schema(Path(path))
    if not fragment:
        return schema
    part = schema
    for key in fragment.strip("/").split("/"):
        part = part[key]
    return {**part, "$defs": {**schema.get("$defs", {}), **part.get("$defs", {})}}


for line in sys.stdin:
    data_path, _, schema_path = line.rstrip("\n").partition("\t")
    try:
        load(Path(data_path), schema_for(schema_path))
        result = {"ok": True}
    except DataError as error:
        result = {"ok": False, "error": str(error)}
    except Exception as error:  # a broken schema, an unreadable file
        result = {"ok": False, "error": f"{type(error).__name__}: {error}"}
    print(json.dumps(result), flush=True)
