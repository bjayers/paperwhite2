"""The run simulator (entralink_sim.py): its multipliers from fixture curves, and on the real data only what any data
gives."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.paperwhite2 import entralink_run, entralink_sim  # noqa: E402


def test_multipliers_follow_the_curves():
    run = {"rounds": [{"rooms": 3, "boss": True}, {"rooms": 2}],
           "enemy_scaling": {"hp": {"start": 100, "end": 500, "curve": 200, "boss_bonus": [300, 200]}}}
    curves = entralink_run.enemy_scaling(run)
    where = {p["label"]: p for p in entralink_sim.places(run)}
    assert entralink_sim.multiplier(curves, "hp", where["R1 room 1"]) == 100
    assert entralink_sim.multiplier(curves, "hp", where["R2 room 1"]) == 325
    # Rebalance 2: a boss is the curve at its round's last room times its bonus; the final room at the run's last
    assert entralink_sim.multiplier(curves, "hp", where["R1 boss"]) == 200 * 3
    assert entralink_sim.multiplier(curves, "hp", where["R2 final"]) == 500 * 2


def test_room_curve_is_keyed_by_depth_across_the_run():
    """The same start, end and curve give the same first and last room for any rooms a round."""
    curve = {"start": 100, "end": 700, "curve": 150}
    for rooms in (2, 3, 5, 8):
        table = [entralink_run.room_percent(curve, i, rooms * 3) for i in range(rooms * 3)]
        assert table[0] == 100 and table[-1] == 700 and table == sorted(table)


def test_simulates_every_place_for_every_build():
    run, buffs = entralink_sim.load()
    results = entralink_sim.simulate(run, buffs)
    places = entralink_sim.places(run)
    assert set(results) == set(entralink_sim.ARCHETYPES)
    for rows in results.values():
        assert [r["place"] for r in rows] == [p["label"] for p in places]
        assert all(r["hit"] > 0 and 0 < r["enemy_hp"] <= 65535 for r in rows)
        assert all(a["picks"] <= b["picks"] for a, b in zip(rows, rows[1:]))
    assert all(r["defence"] == 1.0 for r in results["glass_cannon"])
    assert len(entralink_sim.markdown(results).splitlines()) == len(places) + 2


def test_fit_keeps_defences_at_most_130():
    run, buffs = entralink_sim.load()
    curves = entralink_sim.fit(run, buffs)
    for stat in ("defense", "sp_defense"):
        assert curves[stat]["end"] <= 130 and curves[stat]["boss_bonus"] == [100, 100, 100]
    low, high = entralink_sim.BOSS_STAT_BONUS
    assert all(low <= b <= high for b in curves["attack"]["boss_bonus"])
    low, high = entralink_sim.BOSS_HP_BONUS
    assert all(low <= b <= high for b in curves["hp"]["boss_bonus"])


def test_bosses_count_their_foes(tmp_path):
    """A boss place's good hits are for all its foes: the average foe count of the rooms that can be its boss (a raid
    one foe)."""
    rooms = tmp_path / "rooms"
    rooms.mkdir()
    battle = {"enemies": [{"species": "SPECIES_DIALGA"}] * 2, "format": "double"}
    (rooms / "a.json").write_text(json.dumps({"role": "boss", "rounds": [1], "battles": [battle]}))
    (rooms / "b.json").write_text(json.dumps({"role": "boss", "battles": [{**battle, "format": "raid"}]}))
    (rooms / "c.json").write_text(json.dumps({"role": "final", "battles": [{**battle, "enemies": battle["enemies"] * 2,
                                                                            "format": "triple"}]}))
    run = {"rounds": [{"rooms": 1, "boss": True}, {"rooms": 1, "boss": True}, {"rooms": 1}]}
    assert entralink_sim.boss_foes(run, tmp_path) == [2.0, 1.0, 4.0]
