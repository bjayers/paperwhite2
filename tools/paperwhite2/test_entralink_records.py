"""Tests of tools/paperwhite2/entralink_records.py: the codex's entries from records.json and the species' data."""
import json
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data import datajson, species_list  # noqa: E402
from tools.paperwhite2 import entralink_records  # noqa: E402


def records_dir(tmp_path: Path, special: list[dict]) -> Path:
    """The real schema with a records.json of the test's own."""
    directory = tmp_path / "entralink"
    directory.mkdir()
    shutil.copy(entralink_records.SOURCE / "records.schema.json", directory)
    (directory / "records.json").write_text(json.dumps({"$schema": "records.schema.json", "special_forms": special}))
    return directory


def test_real_data_packs():
    # (validity only: the entries are the user's data)
    text = entralink_records.header()
    assert "#define ENTRALINK_RECORDS_CODEX {" in text and "ENTRALINK_RECORDS_CODEX_COUNT" in text


def test_special_forms_are_keys_with_the_special_bit(tmp_path):
    giratina = datajson.constants()["SPECIES_GIRATINA"]
    directory = records_dir(tmp_path, [{"species": "SPECIES_GIRATINA", "form": 1}])
    entries = [entry for _, entry in entralink_records.codex(directory)]
    assert entries[-1] == giratina | 1 << 10 | 0x8000
    assert f"0x{giratina | 1 << 10 | 0x8000:04x}, /* SPECIES_GIRATINA, form 1 */" in entralink_records.header(directory)


def test_a_form_past_the_species_forms_is_refused(tmp_path):
    directory = records_dir(tmp_path, [{"species": "SPECIES_PIKACHU", "form": 1}])
    with pytest.raises(datajson.DataError, match="no form 1"):
        entralink_records.codex(directory)


def test_nightmares_are_the_hidden_species_not_retired(tmp_path):
    """A species with "pokedex": false counts in every form (its number alone); a retired one doesn't."""
    real = species_list.species_data
    first = species_list.FIRST_ADDED
    fake = {first: {"pokedex": False}, first + 1: {"pokedex": False, "retired": True}, first + 2: {}}
    last = species_list.last_species
    species_list.species_data = lambda number, root=None: fake.get(number, {})
    species_list.last_species = lambda: first + 2
    try:
        assert entralink_records.nightmares() == [first]
        entries = [entry for _, entry in entralink_records.codex(records_dir(tmp_path, []))]
        assert entries == [first]
    finally:
        species_list.species_data = real
        species_list.last_species = last


def test_the_codex_is_at_most_the_saves(tmp_path):
    many = [{"species": "SPECIES_UNOWN", "form": form} for form in range(28)]
    many += [{"species": "SPECIES_ARCEUS", "form": form} for form in range(17)]
    many += [{"species": "SPECIES_DEOXYS", "form": form} for form in range(4)]
    many += [{"species": "SPECIES_BURMY", "form": form} for form in range(3)]
    many += [{"species": "SPECIES_WORMADAM", "form": form} for form in range(3)]
    many += [{"species": "SPECIES_ROTOM", "form": form} for form in range(6)]
    many += [{"species": "SPECIES_SHELLOS", "form": form} for form in range(2)]
    many += [{"species": "SPECIES_GASTRODON", "form": form} for form in range(2)]
    with pytest.raises(datajson.DataError, match="more than the save's 64"):
        entralink_records.codex(records_dir(tmp_path, many))
