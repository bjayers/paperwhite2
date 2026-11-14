// A picture swap on a key is a texture change (rig-editor-v2.md, "Built: picture swaps"): a piece a bone doesn't show
// anywhere yet is put where the bone's default picture is when a key first shows it; Align with default, Place (moves
// only that piece), and a piece another bone shows is copied for this one. The swapped frame is checked in pixels
// against a rig whose sheet has a solid block per piece.
import { test } from "node:test";
import assert from "node:assert/strict";
import { render, SHEET_HEIGHT, SHEET_WIDTH, type Rig } from "../src/modules/rig/mcss.ts";
import { bakeV2, type V2 } from "../src/modules/rig/v2.ts";
import { setKeyAt } from "../src/modules/rig/sequences.ts";
import { alignPiece, movePiece, movePieces, pieceBox, placeForPick, unplacedFor } from "../src/modules/rig/setup.ts";

/** Two bones: a body showing a 8x8 piece, a tail showing "tail_up" (8x8 at 0,0 of the sheet) with "tail_down" (a
 * second 8x8, the sheet's next block) drawn somewhere else on its bone. Piece 3 is a 16x8 alternate. */
function tail(): V2 {
  return {
    format: 2, side: "front", step: 6, box: { width: 32, height: 32, x: 0, y: 0 }, stop_flags: 0,
    pieces: [
      { name: "body", rectangles: [{ sheet: [32, 0], size: [16, 16], at: [-8, 16] }] },
      { name: "tail_up", rectangles: [{ sheet: [0, 0], size: [8, 8], at: [-4, 12] }] },
      { name: "tail_down", rectangles: [{ sheet: [8, 0], size: [8, 8], at: [-20, 30] }] },
      { name: "tail_wide", rectangles: [{ sheet: [16, 0], size: [16, 8], at: [10, -3] }] },
    ],
    bones: [
      { name: "body", head: [0, -8], tail: [0, -16], parent: null, default: { piece: 0 } },
      { name: "tail", head: [10, -8], tail: [16, -14], parent: 0, default: { piece: 1 } },
    ],
    layers: [0, 1], sequences: [{ name: "Idle", frames: 48, parts: [] }], timeline: { name: "stay", blocks: [{ sequence: 0 }] },
  } as unknown as V2;
}

const sheet = (() => {
  const s = new Uint8Array(SHEET_WIDTH * SHEET_HEIGHT);
  const fill = (x: number, w: number, h: number, v: number) => { for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) s[y * SHEET_WIDTH + x + i] = v; };
  fill(0, 8, 8, 1); fill(8, 8, 8, 2); fill(16, 16, 8, 3); fill(32, 16, 16, 4);
  return s;
})();

const frame = (src: V2, time: number, canvas?: ReturnType<typeof render>) => render(bakeV2(src).rig as Rig, sheet, 0, time, canvas);
/** The pixels with this colour, as "x,y" from the feet. */
const covered = (f: ReturnType<typeof render>, colour: number) => {
  const out: string[] = [];
  for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) if (f.pixels[y * f.width + x] === colour) out.push(`${x - f.originX},${y - f.originY}`);
  return out;
};

test("a key picking a piece no bone shows puts it where the default is: the swapped frame covers the same pixels", () => {
  const src = tail();
  assert.ok(unplacedFor(src, 1, 2));
  const keyed = setKeyAt(src, 0, 1, 24, () => ({ piece: 2 }));
  const lane = keyed.sequences[0].parts.find((l) => l.bone === 1)!;
  assert.equal(lane.keys.find((k) => k.frame === 24)?.piece, 2);
  assert.deepEqual(keyed.pieces[2].rectangles[0].at, keyed.pieces[1].rectangles[0].at, "same top left from the head");
  assert.deepEqual(keyed.pieces[1], src.pieces[1], "the default piece is untouched");
  const before = frame(keyed, 0);
  const after = frame(keyed, 30, before);
  assert.deepEqual(covered(after, 2), covered(before, 1), "the new picture covers the old one's pixels");
  assert.equal(covered(after, 1).length, 0);
  // Without the fix the swapped picture would stand elsewhere
  const raw = { ...keyed, pieces: keyed.pieces.map((p, n) => (n === 2 ? src.pieces[2] : p)) };
  assert.notDeepEqual(covered(frame(raw, 30, before), 2), covered(before, 1));
  // A second key picking it again leaves it where the first put it (it is placed now)
  assert.ok(!unplacedFor(keyed, 1, 2));
  const moved = movePiece(keyed, 1, 2, [3, -2]).src;
  const again = setKeyAt(moved, 0, 1, 36, () => ({ piece: 2 }));
  assert.deepEqual(again.pieces[2], moved.pieces[2]);
});

test("a swap of another size is centred on the default, the note says so; hidden and placed picks are left alone", () => {
  const src = tail();
  const r = placeForPick(src, 1, 3);
  const a = pieceBox(r.src.pieces[1])!, b = pieceBox(r.src.pieces[3])!;
  assert.equal((a[0] + a[2]) / 2, (b[0] + b[2]) / 2);
  assert.equal((a[1] + a[3]) / 2, (b[1] + b[3]) / 2);
  assert.match(r.note ?? "", /Placed tail_wide where tail_up is \(centred/);
  const note = alignPiece(src, 1, 2).note;
  assert.equal(note, "Placed tail_down where tail_up is.");
  // Hidden, and a pick marked placed, change no piece
  assert.deepEqual(setKeyAt(src, 0, 1, 24, () => ({ hidden: true })).pieces, src.pieces);
  assert.deepEqual(setKeyAt(src, 0, 1, 24, () => ({ piece: 2, placed: true })).pieces, src.pieces);
});

test("Align with default moves a misplaced swap piece and nothing else", () => {
  let src = setKeyAt(tail(), 0, 1, 24, () => ({ piece: 2 }));
  src = movePiece(src, 1, 2, [7, 5]).src;
  assert.notDeepEqual(src.pieces[2].rectangles[0].at, src.pieces[1].rectangles[0].at);
  const r = alignPiece(src, 1, 2);
  assert.deepEqual(r.src.pieces[2].rectangles[0].at, r.src.pieces[1].rectangles[0].at);
  assert.deepEqual(r.src.pieces.filter((_, n) => n !== 2), src.pieces.filter((_, n) => n !== 2));
  assert.deepEqual(r.src.sequences, src.sequences);
  assert.equal(r.copied, false);
});

test("Place moves only that piece's at; movePieces would have moved them all", () => {
  const src = setKeyAt(tail(), 0, 1, 24, () => ({ piece: 2 }));
  const placed = movePiece(src, 1, 2, [2, -1]);
  assert.deepEqual(placed.src.pieces[2].rectangles[0].at, [src.pieces[2].rectangles[0].at[0] + 2, src.pieces[2].rectangles[0].at[1] - 1]);
  assert.deepEqual(placed.src.pieces[1], src.pieces[1]);
  assert.deepEqual(placed.src.bones, src.bones);
  assert.deepEqual(placed.src.sequences, src.sequences);
  const all = movePieces(src, 1, [2, -1]).src;
  assert.notDeepEqual(all.pieces[1], src.pieces[1], "(the old drag moved every picture of the bone)");
});

test("a piece another bone shows is copied for the bone before it is placed", () => {
  const src0 = tail();
  // The body shows tail_down by default: it is placed for the body, not for the tail
  const src: V2 = { ...src0, bones: src0.bones.map((b, i) => (i === 0 ? { ...b, default: { piece: 2 } } : b)) };
  assert.ok(unplacedFor(src, 1, 2));
  const keyed = setKeyAt(src, 0, 1, 24, () => ({ piece: 2 }));
  assert.equal(keyed.pieces.length, 5);
  assert.equal(keyed.pieces[4].name, "tail_down (tail)");
  assert.deepEqual(keyed.pieces[2], src.pieces[2], "the body's picture is untouched");
  assert.deepEqual(keyed.pieces[4].rectangles[0].at, keyed.pieces[1].rectangles[0].at);
  assert.equal(keyed.sequences[0].parts.find((l) => l.bone === 1)!.keys.find((k) => k.frame === 24)!.piece, 4);
  // Placing a shared picture the bone already shows copies it and points the bone's keys at the copy
  const shared = movePiece(keyed, 0, 2, [1, 1]);
  assert.equal(shared.copied, false, "the body's piece 2 is no longer shared");
  const both: V2 = { ...keyed, bones: keyed.bones.map((b, i) => (i === 0 ? { ...b, default: { piece: 1 } } : b)) };
  const moved = movePiece(both, 1, 1, [4, 4]);
  assert.equal(moved.copied, true);
  assert.deepEqual(moved.src.pieces[1], both.pieces[1]);
  assert.equal(moved.src.bones[1].default?.piece, moved.piece);
});
