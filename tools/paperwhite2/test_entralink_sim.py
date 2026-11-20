"""The run simulator (entralink_sim.py): its multipliers from fixture curves, and on the real data only what any data
gives."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.paperwhite2 import entralink_run, entralink_sim  # noqa: E402


def test_multipliers_follow_the_curves():
    curves = {s: {"rooms": [100, 200, 300], "room_step": [10, 20, 30], "boss": [500, 600, 700]}
              for s in entralink_run.SCALED_STATS}
    assert entralink_sim.multiplier(curves, "hp", 1, 2) == 240
    assert entralink_sim.multiplier(curves, "hp", 2, None) == 700


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
        assert max(curves[stat]["boss"] + curves[stat]["rooms"]) <= 130
