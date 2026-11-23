"""Tests of tools/paperwhite2/icon_remap.py on a fixture: a tiny made-up species with its own normal and shiny
palettes, battle frames and icon, a palette-only form, and a species without battle palettes. make_fixture() is also
what the editor's Icon review test generates its candidates from (editor/tests/icon-review.test.ts)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.nitro_2d import read_indexed_png, write_indexed_png, write_palette  # noqa: E402
from tools.paperwhite2 import icon_remap, palette_remap  # noqa: E402

GREY_LIGHT, GREY_DARK = icon_remap.OUTLINE_GREYS
# The battle palette: an outline, a red body in three shades, a cream belly, a blue eye; its shiny turns the reds green
NORMAL = [(0, 0, 0), (40, 40, 48), (200, 40, 40), (130, 20, 20), (240, 120, 110), (240, 230, 200), (40, 80, 200)]
SHINY = [(0, 0, 0), (40, 40, 48), (40, 200, 60), (20, 120, 30), (130, 240, 140), (240, 230, 200), (40, 80, 200)]
FORM_NORMAL = [(0, 0, 0), (40, 40, 48), (40, 60, 200), (20, 30, 130), (120, 140, 240), (240, 230, 200), (200, 40, 40)]
# The icon's bank colours: the two outline greys, its own reds, cream and blue
ICON = [(0, 0, 0), GREY_DARK, GREY_LIGHT, (230, 80, 80), (160, 40, 40), (240, 230, 190), (60, 100, 220)]


def pad(colours):
    return list(colours) + [(0, 0, 0)] * (16 - len(colours))


def figure(width, height, x0, y0, size, outline, body, shadow, light, belly, eye):
    """A square body with a one-pixel outline, a shadowed lower third, a lit corner, a belly patch and an eye."""
    rows = [[0] * width for _ in range(height)]
    for y in range(y0, y0 + size):
        for x in range(x0, x0 + size):
            dy, dx = y - y0, x - x0
            if dy in (0, size - 1) or dx in (0, size - 1):
                v = outline
            elif dy >= 2 * size // 3:
                v = shadow
            elif dy < size // 4 and dx < size // 4:
                v = light
            else:
                v = body
            rows[y][x] = v
    for y in range(y0 + size // 2, y0 + 2 * size // 3):
        for x in range(x0 + size // 3, x0 + 2 * size // 3):
            rows[y][x] = belly
    ey, ex = y0 + size // 3, x0 + 2 * size // 3
    for y in range(ey, ey + max(1, size // 8)):
        for x in range(ex, ex + max(1, size // 8)):
            rows[y][x] = eye
    return rows


def png(rows, colours):
    return write_indexed_png(len(rows[0]), len(rows), bytes(v for r in rows for v in r), pad(colours))


def make_fixture(root):
    """root/res/pokemon/{fakemon, fakemon/form_1, badmon} and root/generated/species.txt."""
    root = Path(root)
    (root / "generated").mkdir(parents=True, exist_ok=True)
    (root / "generated" / "species.txt").write_text("# test species\nSPECIES_NONE = 0\nSPECIES_FAKEMON\nSPECIES_BADMON\n")
    d = root / "res" / "pokemon" / "fakemon"
    (d / "form_1").mkdir(parents=True, exist_ok=True)
    (d / "normal.pal").write_text(write_palette(pad(NORMAL)))
    (d / "shiny.pal").write_text(write_palette(pad(SHINY)))
    (d / "form_1" / "normal.pal").write_text(write_palette(pad(FORM_NORMAL)))
    (d / "form_1" / "shiny.pal").write_text(write_palette(pad(SHINY)))
    battle = figure(96, 96, 16, 16, 64, 1, 2, 3, 4, 5, 6)
    back = figure(96, 96, 20, 20, 56, 1, 2, 3, 4, 2, 2)
    for name, rows in (("front_single", battle), ("front", battle), ("back_single", back), ("back", back)):
        (d / f"{name}.png").write_bytes(png(rows, NORMAL))
    frame0 = figure(32, 32, 6, 6, 22, 1, 3, 4, 5, 5, 6)
    frame1 = figure(32, 32, 6, 7, 22, 1, 3, 4, 5, 5, 6)
    # an inner line of the light grey under the eye, so an interior grey group gets coloured
    for x in range(12, 18):
        frame0[20][x] = frame1[21][x] = 2
    (d / "icon.png").write_bytes(png(frame0 + frame1, ICON))
    bad = root / "res" / "pokemon" / "badmon"
    bad.mkdir(parents=True, exist_ok=True)
    (bad / "icon.png").write_bytes(png(frame0 + frame1, ICON))
    return root


def generate(tmp_path):
    root = make_fixture(tmp_path)
    names = icon_remap.species_order(root)
    return root, icon_remap.generate(root / "res", names, root / "out", workers=1)


def icon(root, key):
    return json.loads((root / "out" / "icons" / key / "icon.json").read_text())


def test_generate_lists_every_icon(tmp_path):
    root, summary = generate(tmp_path)
    assert [e["key"] for e in summary["entries"]] == ["fakemon", "fakemon_form_1"]
    assert summary["errors"] == [{"key": "badmon", "error": "no normal.pal and shiny.pal"}]
    index = json.loads((root / "out" / "index.json").read_text())
    assert index["icons"] == 2 and index["differ"] == sum(1 for e in index["entries"] if e["differ"])
    assert (root / "out" / "differ.txt").read_text().startswith("IHM and J differ on")
    for e in index["entries"]:
        assert set(e) >= {"key", "label", "kind", "differ", "differ_frac", "suspects", "suspect_px"}
    assert {e["kind"] for e in index["entries"]} == {"base", "palette_form"}


def test_candidates_follow_the_rules(tmp_path):
    root, _ = generate(tmp_path)
    vpx, vpal = icon_remap.load_icon(root / "res" / "pokemon" / "fakemon" / "icon.png")
    used = {i for row in read_indexed_png(root / "res" / "pokemon" / "fakemon" / "front_single.png")[2:3] for i in row}
    d = icon(root, "fakemon")
    for name in ("ihm", "j"):
        px = bytes.fromhex(d[name]["pixels"])
        slots = d[name]["slots"]
        assert len(px) == 2048 and len(slots) <= icon_remap.BATTLE_SLOTS
        assert all(o for v, o in zip(vpx, px) if v), "a coloured pixel became transparent"
        assert all(not o for v, o in zip(vpx, px) if not v)
        assert set(slots) <= used - {0}, "slots are battle indices the art uses"
        assert all(0 <= o <= len(slots) or o in (14, 15) for o in px)
        # The outline greys touching transparency keep slots 14 and 15
        greys = {i for i, c in enumerate(vpal) if tuple(c) in icon_remap.OUTLINE_GREYS}
        for v, comp in icon_remap.components(vpx, greys):
            if icon_remap.touches_outside(vpx, comp):
                want = 14 + icon_remap.OUTLINE_GREYS.index(tuple(vpal[v]))
                assert {px[i] for i in comp} == {want}
        # One new index per vanilla index inside the icon
        inner = collections_by(vpx, px)
        assert all(len(v) == 1 for v in inner.values()), inner
    # The interior grey line is coloured, not a grey slot
    line = 20 * 32 + 14
    assert bytes.fromhex(d["ihm"]["pixels"])[line] not in (14, 15)


def collections_by(vpx, px):
    out = {}
    for i, (v, o) in enumerate(zip(vpx, px)):
        if v and o not in (14, 15):
            out.setdefault(v, set()).add(o)
    return out


def test_body_takes_the_battle_reds(tmp_path):
    root, _ = generate(tmp_path)
    d = icon(root, "fakemon")
    px = bytes.fromhex(d["ihm"]["pixels"])
    slots = d["ihm"]["slots"]
    body = px[12 * 32 + 12]   # the icon's body red (vanilla index 3)
    assert slots[body - 1] in (2, 3, 4), "the red body lands on a battle red"


def test_palette_form_reuses_the_base_pixels(tmp_path):
    root, _ = generate(tmp_path)
    base, form = icon(root, "fakemon"), icon(root, "fakemon_form_1")
    assert form["ihm"]["pixels"] == base["ihm"]["pixels"]
    assert form["normal"][2] == "#283cc8" and form["group"].endswith("pokemon/fakemon/form_1")
    assert form["vanilla"] == base["vanilla"]


def test_images_and_palettes(tmp_path):
    root, _ = generate(tmp_path)
    d = icon(root, "fakemon")
    folder = root / "out" / "icons" / "fakemon"
    for name in ("ihm", "j"):
        w, h, px, pal = read_indexed_png(folder / f"{name}.png")
        assert (w, h) == (32, 64) and px.hex() == d[name]["pixels"]
        for n, t in enumerate(d[name]["slots"]):
            assert tuple(pal[1 + n]) == NORMAL[t]
        assert tuple(pal[14]) == GREY_LIGHT and tuple(pal[15]) == GREY_DARK
    assert read_indexed_png(folder / "vanilla.png")[2].hex() == d["vanilla"]["pixels"]
    assert d["front"]["width"] == 96 and len(d["normal"]) == 16 and len(d["shiny"]) == 16
    assert d["greys"] == ["#62625a", "#414141"]


def test_generate_is_deterministic(tmp_path):
    root, _ = generate(tmp_path / "a")
    again, _ = generate(tmp_path / "b")
    for key in ("fakemon", "fakemon_form_1"):
        a, b = icon(root, key), icon(again, key)
        assert a["ihm"] == b["ihm"] and a["j"] == b["j"]


def test_most_used_twin_swap():
    # Indices 2 and 3 have the same normal colour but different shinies; the art uses 3 far more, so a slot on 2
    # takes 3. Index 4 has no twin and stays.
    normal = pad([(0, 0, 0), (30, 30, 30), (200, 40, 40), (200, 40, 40), (40, 80, 200)])
    shiny = pad([(0, 0, 0), (30, 30, 30), (40, 200, 60), (230, 200, 40), (40, 80, 200)])
    rows = [[0] * 16 for _ in range(16)]
    for y in range(2, 14):
        for x in range(2, 14):
            rows[y][x] = 1 if y in (2, 13) or x in (2, 13) else (2 if (x, y) == (5, 5) else (4 if x > 10 else 3))
    battle = palette_remap.BattleArt(normal, shiny, [rows], [rows])
    slots, swaps = icon_remap.swap_most_used(battle, [2, 4])
    assert slots == [3, 4] and swaps == [[2, 3]]
    assert icon_remap.swap_most_used(battle, [3, 4]) == ([3, 4], [])


def test_difference_counts_colours(tmp_path):
    root = make_fixture(tmp_path)
    group = root / "res" / "pokemon" / "fakemon"
    vpx, _ = icon_remap.load_icon(group / "icon.png")
    px = bytes(1 if v else 0 for v in vpx)
    r = dict(icon=str(group / "icon.png"), group=str(group),
             ihm=dict(pixels=px.hex(), slots=[2]), j=dict(pixels=px.hex(), slots=[2]))
    assert icon_remap.difference(r)["differ"] is False
    r["j"] = dict(pixels=px.hex(), slots=[3])
    d = icon_remap.difference(r)
    assert d["differ"] and d["normal"] == sum(1 for v in vpx if v) and d["frac"] == 1.0
