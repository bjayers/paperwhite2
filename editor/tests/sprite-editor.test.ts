// The Sprite Editor: its logic (painting a battle index into an icon's slots and the 13-slot limit, fill, the palette
// swap of the views, the icon as it is saved) and the server's save through tools/paperwhite2/sprite_edit.py, on a
// fixture (as tools/paperwhite2/test_sprite_edit.py.s: a made-up species with its palettes, a walking sheet on its
// battle palette and an opted-out one). Never the user's res/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { detectLayout, parseJson } from "../shared/json.ts";
import { markSprite, saveSprite } from "../server/spriteEditor.ts";
import { readIndexedPng } from "../src/modules/palettes/png.ts";
import { History, ICON_SLOTS, brushPixels, canonicalIcon, clearedPixels, fill, framesOf, iconFiles, iconKeyOf, indexColour,
  linePixels, markSets, matchesFilter, paint, paintIndex, readReview, replaceIndex, sheetKey, spriteColours, stepKey, swatchOfIndex, toHex,
  viewPalettes, type Rgb, type Sprite } from "../src/modules/spriteeditor/model.ts";

const REPO = resolve(import.meta.dirname, "../..");

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "sprite-editor-"));
  // (test_sprite_edit.py's fixture: make_fixture, then the two sheets; inline, since that file needs pytest)
  execFileSync("python3", ["-c", [`import sys; from pathlib import Path; sys.path.insert(0, ${JSON.stringify(REPO)})`,
    "from tools.data.datajson import dumps",
    "from tools.data.nitro_2d import write_indexed_png, write_palette",
    "from tools.paperwhite2.test_icon_remap import make_fixture, pad",
    `root = make_fixture(Path(${JSON.stringify(root)}))`,
    "for name, palette in (('fakemon', {'pokemon': 'fakemon'}), ('oddmon', {'opt_out': 'its own colours'})):",
    "    d = root / 'res/field/actors/pokemon' / name; d.mkdir(parents=True)",
    "    (d / 'data.json').write_text(dumps({'palette': palette}) + '\\n')",
    "    (d / 'sprite.png').write_bytes(write_indexed_png(64, 32, bytes(64 * 32), pad([(9, 9, 9)])))",
    "(root / 'res/field/actors/pokemon/oddmon/sprite.pal').write_text(write_palette(pad([(0, 0, 0), (10, 20, 30)])))"].join("\n")]);
  return root;
}

const run = (script: string, args: string[]) => new Promise<{ code: number; stdout: string; stderr: string }>((done) =>
  execFile("python3", [join(REPO, script), ...args], (e, stdout, stderr) => done({ code: e ? 1 : 0, stdout, stderr })));

const PALETTE: Rgb[] = Array.from({ length: 16 }, (_, i) => [i * 10, i * 5, 255 - i * 10]);
const SHINY: Rgb[] = PALETTE.map(([r, g, b]) => [b, g, r]);

test("painting a battle index takes a slot, reusing a free one, and refuses a 14th", () => {
  const pixels = new Uint8Array([0, 1, 2, 14]);
  const icon = { kind: "icon" as const, slots: [5, 9] };
  assert.deepEqual(paintIndex(icon, { kind: "palette", index: 9 }, pixels), { index: 2, slots: [5, 9] }, "one it has");
  assert.deepEqual(paintIndex(icon, { kind: "palette", index: 3 }, pixels), { index: 3, slots: [5, 9, 3] }, "a new one");
  assert.deepEqual(paintIndex(icon, { kind: "grey", which: 1 }, pixels), { index: 15, slots: [5, 9] });
  assert.deepEqual(paintIndex(icon, { kind: "transparent" }, pixels), { index: 0, slots: [5, 9] });
  // slot 1 (battle 5) no longer used by any pixel: battle 3 takes it
  assert.deepEqual(paintIndex(icon, { kind: "palette", index: 3 }, new Uint8Array([0, 2, 2])), { index: 1, slots: [3, 9] });
  const full = { kind: "icon" as const, slots: Array.from({ length: ICON_SLOTS }, (_, i) => i + 1) };
  const all = new Uint8Array(Array.from({ length: ICON_SLOTS }, (_, i) => i + 1));
  const refused = paintIndex(full, { kind: "palette", index: 15 }, all);
  assert.ok("error" in refused && /13 battle colours/.test(refused.error));
  assert.deepEqual(paintIndex(full, { kind: "palette", index: 4 }, all), { index: 4, slots: full.slots });
  // a sheet: the index is the palette's own; no greys
  assert.deepEqual(paintIndex({ kind: "sheet" }, { kind: "palette", index: 7 }, pixels), { index: 7, slots: [] });
  assert.ok("error" in paintIndex({ kind: "sheet" }, { kind: "grey", which: 0 }, pixels));
});

test("colours and samples through the slots; nothing turns transparent but the transparent swatch", () => {
  const icon = { kind: "icon" as const, slots: [5, 9] };
  assert.equal(indexColour(icon, PALETTE, 0), null);
  assert.deepEqual(indexColour(icon, PALETTE, 2), PALETTE[9]);
  assert.deepEqual(indexColour(icon, PALETTE, 14), [0x62, 0x62, 0x5a]);
  assert.equal(indexColour(icon, PALETTE, 3), null, "past the slots");
  assert.deepEqual(swatchOfIndex(icon, 2), { kind: "palette", index: 9 });
  assert.deepEqual(swatchOfIndex(icon, 15), { kind: "grey", which: 1 });
  assert.equal(swatchOfIndex(icon, 0), null, "the eyedropper leaves transparency alone");
  assert.deepEqual(swatchOfIndex({ kind: "sheet" }, 6), { kind: "palette", index: 6 });
  // every swatch but the transparent one paints a coloured index
  for (const index of [1, 2, 5, 9, 15]) {
    const r = paintIndex(icon, { kind: "palette", index }, new Uint8Array([1, 2]));
    assert.ok(!("error" in r) && r.index !== 0);
  }
  assert.equal(clearedPixels(new Uint8Array([1, 0, 2]), new Uint8Array([0, 0, 2])), 1);
});

test("the palette swap: the big views show the page's palette, the references the other", () => {
  assert.deepEqual(viewPalettes("normal"), { main: "normal", other: "shiny" });
  assert.deepEqual(viewPalettes("shiny"), { main: "shiny", other: "normal" });
  const icon = { kind: "icon" as const, slots: [5] };
  // the same indices, other colours
  assert.deepEqual(spriteColours(icon, SHINY)[1], SHINY[5]);
  assert.notDeepEqual(spriteColours(icon, SHINY)[1], spriteColours(icon, PALETTE)[1]);
});

test("pencil, lines and fill", () => {
  const sprite: Sprite = { width: 4, height: 4, pixels: new Uint8Array([1, 1, 2, 2, 1, 3, 2, 2, 1, 1, 1, 2, 3, 3, 3, 3]) };
  const filled = fill(sprite, 0, 0, 5);
  assert.deepEqual([...filled], [5, 5, 2, 2, 5, 3, 2, 2, 5, 5, 5, 2, 3, 3, 3, 3], "4-connected: the 1 at (2,2) joins by an edge");
  assert.equal(fill(sprite, 0, 0, 1), sprite.pixels, "same index: unchanged");
  // within a frame only
  const framed = fill(sprite, 2, 0, 7, { x: 2, y: 0, width: 2, height: 2 });
  assert.deepEqual([...framed.slice(0, 8)], [1, 1, 7, 7, 1, 3, 7, 7]);
  assert.equal(framed[11], 2, "outside the frame stays");
  assert.deepEqual(brushPixels(0, 0, 2, { x: 0, y: 0, width: 4, height: 4 }), [[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.deepEqual(brushPixels(0, 0, 3, { x: 0, y: 0, width: 4, height: 4 }).length, 4, "clipped");
  assert.deepEqual(linePixels(0, 0, 3, 1), [[0, 0], [1, 0], [2, 1], [3, 1]]);
  const painted = paint(sprite, [[3, 3]], 9);
  assert.equal(painted[15], 9);
  assert.equal(sprite.pixels[15], 3, "a copy");
  const h = new History();
  const a = { pixels: sprite.pixels, slots: [1] }, b = { pixels: painted, slots: [1, 2] };
  h.push(a);
  assert.equal(h.undo(b), a);
  assert.equal(h.redo(a), b);
  assert.deepEqual(framesOf({ width: 32, height: 64 }, "icon"), [{ x: 0, y: 0, width: 32, height: 32 }, { x: 0, y: 32, width: 32, height: 32 }]);
  assert.equal(framesOf({ width: 256, height: 32 }, "sheet").length, 8);
});

test("the icon as saved merges a repeated battle index and drops unused slots, as sprite_edit.canonical", () => {
  const out = canonicalIcon({ pixels: new Uint8Array([0, 1, 2, 3, 14, 15, 3]), slots: [7, 2, 7, 9] });
  assert.deepEqual(out, { pixels: new Uint8Array([0, 1, 2, 1, 14, 15, 1]), slots: [7, 2] });
  const py = execFileSync("python3", ["-c", `import sys; sys.path.insert(0, ${JSON.stringify(REPO)}); `
    + "from tools.paperwhite2.sprite_edit import canonical; p, s = canonical(bytes([0, 1, 2, 3, 14, 15, 3]), [7, 2, 7, 9]); print(p.hex(), s)"]).toString().trim();
  assert.equal(py, `${toHex(out.pixels)} [7, 2]`);
});

test("icon keys and files", () => {
  assert.deepEqual(iconFiles("fakemon_form_1").png, "res/pokemon/fakemon/form_1/icon_battle.png");
  assert.deepEqual(iconFiles("fakemon_female").png, "res/pokemon/fakemon/icon_female_battle.png");
  assert.equal(iconFiles("fakemon_female").vanilla, "res/pokemon/fakemon/icon_female.png");
  for (const key of ["fakemon", "fakemon_female", "fakemon_form_12", "nidoran_f"]) assert.equal(iconKeyOf(iconFiles(key).png), key);
  assert.equal(iconKeyOf("res/pokemon/fakemon/icon.png"), null);
});

test("the review marks: read with every kind and mark, filters and stepping", () => {
  const empty = { hand_edited: [], checked: [] };
  assert.deepEqual(readReview(null), { icons: empty, followers: empty });
  const review = readReview('{"icons": {"hand_edited": ["b", 3, "a", "b"], "checked": ["a"]}, "followers": {"checked": ["followers/c"]}}');
  assert.deepEqual(review.icons, { hand_edited: ["a", "b"], checked: ["a"] });
  assert.deepEqual(review.followers, { hand_edited: [], checked: ["followers/c"] }, "kinds kept apart");
  assert.equal(sheetKey("res/field/actors/followers/c"), "followers/c");
  const icons = markSets(review, "icons");
  const shows = (f: Parameters<typeof matchesFilter>[2]) => ["a", "b", "c"].filter((k) => matchesFilter([k], icons, f));
  assert.deepEqual(shows("all"), ["a", "b", "c"]);
  assert.deepEqual(shows("unchecked"), ["b", "c"]);
  assert.deepEqual(shows("checked"), ["a"]);
  assert.deepEqual(shows("hand"), ["a", "b"]);
  assert.deepEqual(shows("generated"), ["c"]);
  // a species' sheets: checked when all are, hand-edited when any is; none never shows
  const sheets = markSets(readReview('{"followers": {"hand_edited": ["pokemon/x"], "checked": ["followers/x"]}}'), "followers");
  assert.equal(matchesFilter(["followers/x", "pokemon/x"], sheets, "checked"), false);
  assert.equal(matchesFilter(["followers/x", "pokemon/x"], sheets, "unchecked"), true);
  assert.equal(matchesFilter(["followers/x", "pokemon/x"], sheets, "hand"), true);
  assert.equal(matchesFilter([], sheets, "all"), false);
  // stepping within the filter, from a species it no longer shows too
  const order = ["a", "b", "c", "d", "e"], shown = new Set(["b", "d"]);
  assert.equal(stepKey(order, shown, "b", 1), "d");
  assert.equal(stepKey(order, shown, "d", 1), null);
  assert.equal(stepKey(order, shown, "b", -1), null);
  assert.equal(stepKey(order, shown, "c", 1), "d", "just marked checked under Not checked: on to the next");
  assert.equal(stepKey(order, shown, "c", -1), "b");
  assert.equal(stepKey(order, shown, null, 1), "b");
});

test("the replace tool: one index's pixels in the frame or every frame, the pencil's rules", () => {
  const size = { width: 2, height: 4 };
  const frame = { x: 0, y: 0, width: 2, height: 2 };
  const pixels = new Uint8Array([1, 2, 1, 0, 1, 2, 2, 1]);
  const icon = { kind: "icon" as const, slots: [5, 6] };
  const snap = { pixels, slots: [5, 6] };
  // battle 6 is the icon's slot 2: in this frame only, then in every frame
  const one = replaceIndex(icon, { kind: "palette", index: 6 }, snap, size, 0, 0, frame);
  assert.ok(!("error" in one));
  assert.deepEqual(one.points, [[0, 0], [0, 1]]);
  assert.deepEqual([...one.after.pixels], [2, 2, 2, 0, 1, 2, 2, 1]);
  const all = replaceIndex(icon, { kind: "palette", index: 6 }, snap, size, 0, 0, null);
  assert.ok(!("error" in all));
  assert.deepEqual([...all.after.pixels], [2, 2, 2, 0, 2, 2, 2, 2]);
  assert.deepEqual([...pixels], [1, 2, 1, 0, 1, 2, 2, 1], "a copy");
  // a new battle index: in every frame the replaced slot is freed and takes it (the pixels stay, the colour changes)
  const recolour = replaceIndex(icon, { kind: "palette", index: 9 }, snap, size, 0, 0, null);
  assert.ok(!("error" in recolour));
  assert.deepEqual(recolour.after.slots, [9, 6]);
  assert.equal(recolour.points.length, 4);
  // ... at 13 slots: allowed when the replaced slot is freed, refused when it isn't
  const full = { kind: "icon" as const, slots: Array.from({ length: ICON_SLOTS }, (_, i) => i + 1) };
  const fullPixels = new Uint8Array(32).map((_, i) => (i % ICON_SLOTS) + 1);
  const fullSnap = { pixels: fullPixels, slots: full.slots };
  const swap = replaceIndex(full, { kind: "palette", index: 15 }, fullSnap, { width: 8, height: 4 }, 0, 0, null);
  assert.ok(!("error" in swap));
  assert.equal(swap.after.slots[0], 15);
  const refused = replaceIndex(full, { kind: "palette", index: 15 }, fullSnap, { width: 8, height: 4 }, 0, 0, { x: 0, y: 0, width: 8, height: 1 });
  assert.ok("error" in refused && /13 battle colours/.test(refused.error), "index 1 stays outside the frame");
  // nothing to change; and only the transparent swatch clears
  const same = replaceIndex(icon, { kind: "palette", index: 5 }, snap, size, 0, 0, null);
  assert.ok(!("error" in same) && same.points.length === 0 && same.after === snap);
  const cleared = replaceIndex(icon, { kind: "transparent" }, snap, size, 1, 0, frame);
  assert.ok(!("error" in cleared));
  assert.deepEqual([...cleared.after.pixels], [1, 0, 1, 0, 1, 2, 2, 1]);
  assert.equal(clearedPixels(pixels, cleared.after.pixels), 1, "the transparent swatch, chosen");
  for (const sw of [{ kind: "palette", index: 6 }, { kind: "grey", which: 0 }] as const) {
    const r = replaceIndex(icon, sw, snap, size, 1, 0, null);
    assert.ok(!("error" in r));
    assert.equal(clearedPixels(pixels, r.after.pixels), 0, "a colour never turns a pixel transparent");
  }
  // a sheet: its indices are the palette's; one undo step is the state before
  const sheet = replaceIndex({ kind: "sheet" }, { kind: "palette", index: 7 }, { pixels, slots: [] }, size, 0, 0, null);
  assert.ok(!("error" in sheet));
  assert.deepEqual([...sheet.after.pixels], [7, 2, 7, 0, 7, 2, 2, 7]);
  const h = new History();
  h.push(snap);
  assert.equal(h.undo(sheet.after), snap);
});

test("saving an icon and a sheet round-trips through sprite_edit.py", async () => {
  const root = fixture();
  try {
    const res = join(root, "res");
    const pixels = new Uint8Array(32 * 64);
    pixels.set([1, 2, 14, 15], 40);
    const saved = await saveSprite(run, res, { kind: "icon", key: "fakemon", pixels: toHex(pixels), slots: [3, 5] });
    assert.deepEqual(saved, { ok: true, written: ["res/pokemon/fakemon/icon_battle.png", "res/pokemon/fakemon/icon_battle.json"], handEdited: true });
    const image = await readIndexedPng(new Uint8Array(readFileSync(join(res, "pokemon/fakemon/icon_battle.png"))).buffer);
    assert.deepEqual([image.width, image.height], [32, 64]);
    assert.deepEqual([...image.pixels], [...pixels]);
    const text = readFileSync(join(res, "pokemon/fakemon/icon_battle.json"), "utf8");
    assert.deepEqual(JSON.parse(text), { slots: [3, 5], greys: ["#62625a", "#414141"] });
    assert.notEqual(detectLayout(text, parseJson(text)), null, "written as the data tools write JSON");
    // the tool refuses: more slots than 13, an index past the slots; nothing written
    const many = await saveSprite(run, res, { kind: "icon", key: "fakemon", pixels: toHex(pixels), slots: Array.from({ length: 14 }, (_, i) => i + 1) });
    assert.equal(many.ok, false);
    assert.match(many.error!, /room for 13/);
    assert.equal((await saveSprite(run, res, { kind: "icon", key: "fakemon", pixels: toHex(pixels), slots: [3] })).ok, false);
    assert.deepEqual(JSON.parse(readFileSync(join(res, "pokemon/fakemon/icon_battle.json"), "utf8")).slots, [3, 5]);
    // bad requests never reach the tool
    assert.equal((await saveSprite(run, res, { kind: "icon", key: "../x", pixels: "00", slots: [] })).ok, false);
    assert.equal((await saveSprite(run, res, { kind: "sheet", folder: "res/pokemon/fakemon", pixels: "00" })).ok, false);
    // a sheet keeps its size, coloured from the battle normal.pal
    const sheet = new Uint8Array(64 * 32).map((_, i) => i % 7);
    const done = await saveSprite(run, res, { kind: "sheet", folder: "res/field/actors/pokemon/fakemon", pixels: toHex(sheet) });
    assert.deepEqual(done, { ok: true, written: ["res/field/actors/pokemon/fakemon/sprite.png"], handEdited: true });
    const back = await readIndexedPng(new Uint8Array(readFileSync(join(res, "field/actors/pokemon/fakemon/sprite.png"))).buffer);
    assert.deepEqual([...back.pixels], [...sheet]);
    assert.equal((await saveSprite(run, res, { kind: "sheet", folder: "res/field/actors/pokemon/fakemon", pixels: "00" })).ok, false, "another size");
    // both saves changed their sprite: each marked hand-edited in its own kind, in the data tools' layout
    const marksPath = join(res, "paperwhite2/sprite_review.json");
    let marks = readReview(readFileSync(marksPath, "utf8"));
    assert.deepEqual(marks.icons.hand_edited, ["fakemon"]);
    assert.deepEqual(marks.followers.hand_edited, ["pokemon/fakemon"]);
    const marksText = readFileSync(marksPath, "utf8");
    assert.notEqual(detectLayout(marksText, parseJson(marksText)), null);
    // saving it unchanged marks nothing new
    assert.equal((await saveSprite(run, res, { kind: "sheet", folder: "res/field/actors/pokemon/fakemon", pixels: toHex(sheet) })).handEdited, false);
    // checked, on and off, through the server's mark
    const on = await markSprite(run, res, { kind: "followers", key: "pokemon/fakemon", mark: "checked", on: true });
    assert.deepEqual(on.review?.followers.checked, ["pokemon/fakemon"]);
    assert.deepEqual(on.review?.icons.checked, []);
    await markSprite(run, res, { kind: "icons", key: "fakemon", mark: "checked", on: true });
    await markSprite(run, res, { kind: "icons", key: "fakemon", mark: "checked", on: false });
    marks = readReview(readFileSync(marksPath, "utf8"));
    assert.deepEqual([marks.icons.checked, marks.followers.checked], [[], ["pokemon/fakemon"]]);
    assert.equal((await markSprite(run, res, { kind: "icons", key: "../x", mark: "checked", on: true })).ok, false);
    assert.equal((await markSprite(run, res, { kind: "other", key: "fakemon", mark: "checked", on: true })).ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
