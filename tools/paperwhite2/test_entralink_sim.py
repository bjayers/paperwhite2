"""The run simulator (entralink_sim.py): its multipliers from fixture curves, and on the real data only what any data
gives."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.paperwhite2 import entralink_run, entralink_sim  # noqa: E402


def test_multipliers_follow_the_curves():
    run = {"rounds": [{"rooms": 3, "boss": True}, {"rooms": 2}],
           "enemy_scaling": {"hp": {"start": 100, "end": 500, "curve": 200, "boss": [700, 900]}}}
    curves = entralink_run.enemy_scaling(run)
    where = {p["label"]: p for p in entralink_sim.places(run)}
    assert entralink_sim.multiplier(curves, "hp", where["R1 room 1"]) == 100
    assert entralink_sim.multiplier(curves, "hp", where["R2 room 1"]) == 325
    assert entralink_sim.multiplier(curves, "hp", where["R1 boss"]) == 700
    assert entralink_sim.multiplier(curves, "hp", where["R2 final"]) == 900


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
        assert max(curves[stat]["boss"] + [curves[stat]["end"]]) <= 130
