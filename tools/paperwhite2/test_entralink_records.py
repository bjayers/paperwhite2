"""Tests of tools/paperwhite2/entralink_records.py: the codex's entries from records.json and the species' data."""
import json
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data import datajson, species_list  # noqa: E402
from tools.paperwhite2 import entralink_records  # noqa: E402


def records_dir(tmp_path: Path, special: list[dict], black: list[int] | None = None,
                white: list[str] | None = None, rewards: dict | None = None, shop: list[dict] | None = None) -> Path:
    """The real schema with a records.json of the test's own: every reward at Black rank 1 unless given."""
    directory = tmp_path / "entralink"
    directory.mkdir()
    shutil.copy(entralink_records.SOURCE / "records.schema.json", directory)
    unlocks = {reward: {"tree": "black", "rank": 1} for reward in entralink_records.REWARDS}
    unlocks.update(rewards or {})
    (directory / "records.json").write_text(json.dumps({
        "$schema": "records.schema.json", "special_forms": special,
        "black_ranks": black if black is not None else [1, 2, 3, 4, 5],
        "white_milestones": white if white is not None else ["beat_final"],
        "rewards": unlocks, "dust_bonus": 25, "shard_multiplier": 3, "skip_round": {"picks": 4, "dust": 120},
        "shard_shop": shop if shop is not None else [{"item": "ITEM_POKE_BALL", "price": 7}],
    }))
    return directory


def test_real_data_packs():
    # (validity only: the entries are the user's data)
    text = entralink_records.header()
    assert "#define ENTRALINK_RECORDS_CODEX {" in text and "ENTRALINK_RECORDS_CODEX_COUNT" in text
    assert "#define ENTRALINK_RECORDS_BLACK_RANK_COUNT 5" in text
    assert "#define ENTRALINK_RECORDS_WHITE_MILESTONES 0x" in text
    assert f"#define ENTRALINK_RECORDS_REWARD_COUNT {len(entralink_records.REWARDS)}" in text
    assert "#define ENTRALINK_RECORDS_SHOP_ITEMS {" in text


def test_the_entree_ranks(tmp_path):
    """The Black Tree's thresholds in order, and the White Tree's milestones that count as a bit each in MILESTONES'
    order (include/paperwhite2/entree_menu.h's ENTREE_MILESTONE_*), whatever records.json's order."""
    directory = records_dir(tmp_path, [], black=[3, 10, 30, 90, 270], white=["all_rooms", "catch_all"])
    text = entralink_records.header(directory)
    assert "#define ENTRALINK_RECORDS_BLACK_RANKS { 3, 10, 30, 90, 270 }" in text
    assert "#define ENTRALINK_RECORDS_WHITE_MILESTONES 0x12 /* all_rooms, catch_all */" in text
    assert entralink_records.MILESTONES == ["beat_final", "catch_all", "fill_codex", "shop_cap", "all_rooms"]


def test_no_milestone_counts(tmp_path):
    text = entralink_records.header(records_dir(tmp_path, [], white=[]))
    assert "#define ENTRALINK_RECORDS_WHITE_MILESTONES 0x00 /* none */" in text


def test_black_ranks_must_rise(tmp_path):
    with pytest.raises(datajson.DataError, match="must rise: 20 follows 20"):
        entralink_records.header(records_dir(tmp_path, [], black=[5, 20, 20, 60, 90]))


@pytest.mark.parametrize("black", [[5, 20, 60, 180], [0, 1, 2, 3, 4]])
def test_black_ranks_are_five_positive_numbers(tmp_path, black):
    with pytest.raises(datajson.DataError):
        entralink_records.header(records_dir(tmp_path, [], black=black))


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


def test_the_rewards_pack_as_tree_and_rank(tmp_path):
    """Each reward packs as its tree << 4 | its rank, in REWARDS' order (include/paperwhite2/entralink_ranks.h's
    ENTRALINK_REWARD_*), with the bonuses, the head start and the item shop's goods."""
    directory = records_dir(tmp_path, [], white=["beat_final", "catch_all"],
                            rewards={"fog": {"tree": "white", "rank": 2}, "dust_bonus": {"tree": "black", "rank": 0}},
                            shop=[{"item": "ITEM_POKE_BALL", "price": 7}, {"item": "ITEM_POTION", "price": 3}])
    text = entralink_records.header(directory)
    rows = [line.split(",")[0].strip() for line in text.splitlines() if ": black " in line or ": white " in line]
    assert len(rows) == len(entralink_records.REWARDS)
    assert rows[entralink_records.REWARDS.index("fog")] == "0x12"
    assert rows[entralink_records.REWARDS.index("dust_bonus")] == "0x00"
    assert rows[entralink_records.REWARDS.index("reserve_box")] == "0x01"
    assert "#define ENTRALINK_RECORDS_DUST_BONUS 25" in text
    assert "#define ENTRALINK_RECORDS_SHARD_MULTIPLIER 3" in text
    assert "#define ENTRALINK_RECORDS_SKIP_PICKS 4" in text and "#define ENTRALINK_RECORDS_SKIP_DUST 120" in text
    constants = datajson.constants()
    assert "#define ENTRALINK_RECORDS_SHOP_ITEM_COUNT 2" in text
    assert f"{{ {constants['ITEM_POTION']}, 3 }}, /* ITEM_POTION */" in text
    assert entralink_records.REWARDS[:5] == ["reserve_box", "hub_shop", "buff_room", "dust_bonus", "shard_bonus"]


def test_a_white_rank_past_the_milestones_is_refused(tmp_path):
    directory = records_dir(tmp_path, [], white=["beat_final"], rewards={"skip_round": {"tree": "white", "rank": 2}})
    with pytest.raises(datajson.DataError, match="skip_round needs White Tree rank 2, but only 1 milestones count"):
        entralink_records.header(directory)


def test_an_item_sold_twice_is_refused(tmp_path):
    directory = records_dir(tmp_path, [], shop=[{"item": "ITEM_POKE_BALL", "price": 7},
                                                {"item": "ITEM_POKE_BALL", "price": 9}])
    with pytest.raises(datajson.DataError, match="ITEM_POKE_BALL twice"):
        entralink_records.header(directory)


def test_every_reward_is_required(tmp_path):
    directory = records_dir(tmp_path, [])
    data = json.loads((directory / "records.json").read_text())
    del data["rewards"]["form_change"]
    (directory / "records.json").write_text(json.dumps(data))
    with pytest.raises(datajson.DataError):
        entralink_records.header(directory)
