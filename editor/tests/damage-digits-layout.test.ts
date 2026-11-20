// The damage numbers' digits' layout (digitLayout.ts) against the packer's (tools/paperwhite2/damage_digits.py): the
// glyph widths of the real sheet as the packer measures them, and a fixture's layout worked out by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CELL_HEIGHT, CELL_WIDTH, glyphMetrics, layoutDigits } from "../src/modules/palettes/digitLayout.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const PYTHON = join(ROOT, ".venv/bin/python");

test("the glyphs measured as the packer measures them", () => {
  const info = join(mkdtempSync(join(tmpdir(), "digits-")), "info.json");
  execFileSync(PYTHON, [join(ROOT, "tools/paperwhite2/damage_digits.py"), "check",
    join(ROOT, "res/paperwhite2/battle/damage_digits.png"), "--info", info]);
  const facts = JSON.parse(readFileSync(info, "utf8")) as { pixels: string; glyphs: [number, number][] };
  assert.deepEqual(glyphMetrics(facts.pixels).map((g) => [g.left, g.width]), facts.glyphs);
});

test("a fixture's glyphs and layout", () => {
  const sheetWidth = CELL_WIDTH * 10;
  const pixels = Array<string>(sheetWidth * CELL_HEIGHT).fill("0");
  // Digit 1 opaque in columns 5-9, digit 2 in 1-14; digit 0 empty
  for (let x = 5; x < 10; x++) pixels[10 * sheetWidth + 16 + x] = "4";
  for (let x = 1; x < 15; x++) pixels[3 * sheetWidth + 32 + x] = "4";
  const glyphs = glyphMetrics(pixels.join(""));
  assert.deepEqual(glyphs[1], { left: 5, width: 5 });
  assert.deepEqual(glyphs[2], { left: 1, width: 14 });
  assert.deepEqual(glyphs[0], { left: 1, width: 14 });
  // As test_damage_digits.py's test_glyphs_and_layout
  assert.deepEqual(layoutDigits("1212", glyphs, 2, 4), { lefts: [-5, 6, 14, 21], width: 36 });
});
