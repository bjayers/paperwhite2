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


def test_flagged_icons_get_more_candidates(tmp_path):
    root = make_fixture(tmp_path)
    (root / "res" / "paperwhite2").mkdir(parents=True, exist_ok=True)
    (root / "res" / "paperwhite2" / "icon_remap_choices.json").write_text(
        json.dumps({"choices": {"fakemon": "j"}, "fix_by_hand": ["fakemon"]}))
    summary = icon_remap.generate(root / "res", icon_remap.species_order(root), root / "out", workers=1)
    entries = {e["key"]: e for e in summary["entries"]}
    assert entries["fakemon"]["candidates"] == ["g2", "h", "ih", "k"]
    assert entries["fakemon_form_1"]["candidates"] == []
    d = icon(root, "fakemon")
    assert "candidates" not in icon(root, "fakemon_form_1")
    vpx, vpal = icon_remap.load_icon(root / "res" / "pokemon" / "fakemon" / "icon.png")
    used = set(read_indexed_png(root / "res" / "pokemon" / "fakemon" / "front_single.png")[2]) - {0}
    for name, c in d["candidates"].items():
        px = bytes.fromhex(c["pixels"])
        assert len(px) == 2048 and len(c["slots"]) <= icon_remap.BATTLE_SLOTS, name
        assert all(o for v, o in zip(vpx, px) if v), f"{name}: a coloured pixel became transparent"
        assert all(not o for v, o in zip(vpx, px) if not v), name
        assert set(c["slots"]) <= used, f"{name}: slots are battle indices the art uses"
    # K: from the pick (J), one colour per connected group of one vanilla index, the outline greys kept
    k = d["candidates"]["k"]
    assert k["base"] == "j" and isinstance(k["changes"], list)
    kpx = bytes.fromhex(k["pixels"])
    for v, comp in icon_remap.components(vpx, set(range(1, 16))):
        assert len({kpx[i] for i in comp}) == 1, f"vanilla {v}: a connected group split"
    jpx = bytes.fromhex(d["j"]["pixels"])
    assert all(a == b for a, b in zip(jpx, kpx) if a in (14, 15)), "K keeps the pick's outline greys"



def test_k_keeps_its_base(tmp_path):
    """An icon kept on another method keeps its extra candidates without the flag, and K the base it was built from:
    k_base when recorded, else the last run's K."""
    root = make_fixture(tmp_path)
    choices = root / "res" / "paperwhite2" / "icon_remap_choices.json"
    choices.parent.mkdir(parents=True, exist_ok=True)
    run = lambda: icon_remap.generate(root / "res", icon_remap.species_order(root), root / "out", workers=1)  # noqa: E731
    choices.write_text(json.dumps({"choices": {"fakemon": "j"}, "fix_by_hand": ["fakemon"]}))
    run()
    first = icon(root, "fakemon")["candidates"]
    assert first["k"]["base"] == "j"
    # Kept on G2 and unflagged, before k_base existed: the last run's K
    choices.write_text(json.dumps({"choices": {"fakemon": "g2"}, "fix_by_hand": []}))
    summary = run()
    assert {e["key"]: e for e in summary["entries"]}["fakemon"]["candidates"] == ["g2", "h", "ih", "k"]
    assert icon(root, "fakemon")["candidates"] == first
    # The recorded k_base wins, with or without a last run
    choices.write_text(json.dumps({"choices": {"fakemon": "k"}, "fix_by_hand": [], "k_base": {"fakemon": "j"}}))
    (root / "out" / "icons" / "fakemon" / "icon.json").unlink()
    run()
    assert icon(root, "fakemon")["candidates"] == first
    # Without either, IHM; and an icon kept on IHM or J without the flag has no extra candidates
    choices.write_text(json.dumps({"choices": {"fakemon": "h"}, "fix_by_hand": []}))
    (root / "out" / "icons" / "fakemon" / "icon.json").unlink()
    run()
    assert icon(root, "fakemon")["candidates"]["k"]["base"] == "ihm"
    choices.write_text(json.dumps({"choices": {"fakemon": "j"}, "fix_by_hand": [], "k_base": {"fakemon": "ihm"}}))
    run()
    assert "candidates" not in icon(root, "fakemon")
    assert icon_remap.read_choices(choices)["k_base"] == {"fakemon": "ihm"}

def test_k_takes_the_pale_tint():
    # Battle art: a dark outline, a pale blue-grey body (tinted, chroma 4-12) and a red patch; the pick put the
    # body on a pure grey the art barely uses.
    normal = pad([(0, 0, 0), (30, 30, 30), (200, 200, 200), (180, 200, 236), (200, 40, 40), (150, 20, 20)])
    shiny = pad([(0, 0, 0), (30, 30, 30), (200, 200, 200), (190, 222, 200), (40, 200, 60), (20, 150, 30)])
    rows = [[0] * 24 for _ in range(24)]
    for y in range(2, 22):
        for x in range(2, 22):
            edge = y in (2, 21) or x in (2, 21)
            rows[y][x] = 1 if edge else (2 if (x, y) == (5, 5) else (4 if x > 13 else (5 if x == 13 else 3)))
    battle = palette_remap.BattleArt(normal, shiny, [rows], [rows])
    ipal = pad([(0, 0, 0), GREY_DARK, (200, 200, 200), (230, 80, 80), (160, 40, 40)])
    px = bytearray(2048)
    for f in range(2):
        for y in range(4, 28):
            for x in range(4, 28):
                edge = y in (4, 27) or x in (4, 27)
                px[(32 * f + y) * 32 + x] = 1 if edge else (2 if x < 16 else (3 if y < 20 else 4))
    # The pick: the outline grey kept, the body on battle grey 2, the vanilla reds both on battle 2 as well
    base_slots = [2]
    base_px = bytes(15 if v == 1 else (1 if v else 0) for v in px)
    job = dict(art="/nonexistent", kind="base")
    out, slots, swaps, changes = icon_remap.method_k(job, bytes(px), ipal, battle, base_px, base_slots)
    assert all(o for v, o in zip(px, out) if v)
    by_vanilla = {}
    for v, o in zip(px, out):
        if v:
            by_vanilla.setdefault(v, set()).add(slots[o - 1] if o <= len(slots) else ("grey", o))
    assert by_vanilla[1] == {("grey", 15)}
    assert by_vanilla[2] == {3}, "the grey body takes the pale tint the art uses"
    assert any(c.startswith("grey for tint") for c in changes)


def test_apply_writes_the_chosen_icons(tmp_path):
    """apply: each icon's choice (IHM without one) as icon_battle.png and .json; icons fixed by hand since are kept
    unless forced, and marked hand-edited in the review marks (unmarked when forced)."""
    from tools.paperwhite2 import sprite_edit
    root = make_fixture(tmp_path)
    res = root / "res"
    (res / "paperwhite2").mkdir(parents=True, exist_ok=True)
    (res / icon_remap.CHOICES_FILE).write_text(json.dumps({"choices": {"fakemon": "k"}, "fix_by_hand": ["fakemon"]}))
    icon_remap.generate(res, icon_remap.species_order(root), root / "out", workers=1)
    vanilla = (res / "pokemon" / "fakemon" / "icon.png").read_bytes()
    canon = lambda c: sprite_edit.canonical(bytes.fromhex(c["pixels"]), c["slots"])  # noqa: E731
    r = icon_remap.apply(res, root / "out")
    assert sorted(r["written"]) == ["fakemon", "fakemon_form_1"] and r["methods"] == {"k": 1, "ihm": 1}
    k = icon(root, "fakemon")["candidates"]["k"]
    assert sprite_edit.read_icon(res / "pokemon", "fakemon") == canon(k)
    form = icon(root, "fakemon_form_1")["ihm"]
    assert sprite_edit.read_icon(res / "pokemon", "fakemon_form_1") == canon(form)
    assert (res / "pokemon" / "fakemon" / "icon.png").read_bytes() == vanilla, "the vanilla icon stays"
    assert not (res / sprite_edit.REVIEW_FILE).exists(), "nothing hand-edited yet"
    # Again: nothing to do; a hand fix is kept, and --force overwrites it
    assert icon_remap.apply(res, root / "out")["same"] == ["fakemon", "fakemon_form_1"]
    px, slots = sprite_edit.read_icon(res / "pokemon", "fakemon")
    edited = bytes([14 if px[0] != 14 else 15]) + px[1:]
    sprite_edit.write_files(sprite_edit.icon_files(res / "pokemon", "fakemon", edited, slots))
    r = icon_remap.apply(res, root / "out", dry_run=True)
    assert r["kept"] == ["fakemon"] and r["marked"] == ["fakemon"]
    assert not (res / sprite_edit.REVIEW_FILE).exists(), "a dry run writes nothing"
    r = icon_remap.apply(res, root / "out")
    assert r["kept"] == ["fakemon"] and r["marked"] == ["fakemon"]
    assert sprite_edit.read_icon(res / "pokemon", "fakemon")[0] == edited
    assert sprite_edit.read_review(res)["icons"]["hand_edited"] == ["fakemon"], "a kept icon is marked hand-edited"
    assert icon_remap.apply(res, root / "out")["marked"] == [], "once"
    r = icon_remap.apply(res, root / "out", force=True)
    assert r["written"] == ["fakemon"] and r["unmarked"] == ["fakemon"]
    assert sprite_edit.read_review(res)["icons"]["hand_edited"] == [], "overwritten: generated again"
    assert sprite_edit.read_icon(res / "pokemon", "fakemon")[0] == canon(k)[0]
