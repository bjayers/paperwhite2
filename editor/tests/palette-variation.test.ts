// Palette variation's preview transform (src/modules/pokemon/paletteVariation.ts) gives exactly the reference's palettes
// (tools/paperwhite2/palette_variation.py) on the shared vectors, which the Python tests check too; greys stay, and the
// settings file's species strengths read as the game reads them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bgr555, fromBgr555, keyOf, strengthOf, varyPalette, varyRgb, VARIATION_PATH, type VariationSettings } from "../src/modules/pokemon/paletteVariation.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const vectors = JSON.parse(readFileSync(join(ROOT, "tools/paperwhite2/palette_variation_vectors.json"), "utf8")) as {
  palettes: Record<string, number[]>;
  cases: { palette: string; settings: VariationSettings; key: number; strength: number; output: number[] }[];
};

test("the preview matches the reference's vectors", () => {
  assert.ok(vectors.cases.length > 100);
  for (const c of vectors.cases) {
    const out = varyPalette(vectors.palettes[c.palette].map(fromBgr555), c.key, c.settings, c.strength).map(bgr555);
    assert.deepEqual(out, c.output, `${c.palette} key ${c.key} strength ${c.strength} ${JSON.stringify(c.settings)}`);
  }
});

test("greys, white, black and index 0 never change", () => {
  const strong = { enabled: true, hue_degrees: 45, brightness_percent: 25, saturation_percent: 50 };
  const greys = [[31, 0, 31], ...Array.from({ length: 15 }, (_, i) => [i * 2, i * 2, i * 2])] as [number, number, number][];
  for (let key = 0; key < 256; key++) assert.deepEqual(varyPalette(greys, key, strong, 100), greys);
});

test("unchanged colours keep the file's 8-bit values", () => {
  const cfg = { enabled: true, hue_degrees: 12, brightness_percent: 6, saturation_percent: 10 };
  const colors: [number, number, number][] = [[1, 2, 3], [200, 200, 200], [250, 40, 40]];
  const out = varyRgb(colors, 0x0f, cfg, 100);
  assert.deepEqual(out.slice(0, 2), colors.slice(0, 2));
  assert.notDeepEqual(out[2], colors[2]);
});

test("the settings file and its strengths", () => {
  const data = JSON.parse(readFileSync(join(ROOT, VARIATION_PATH), "utf8"));
  assert.equal(typeof data.enabled, "boolean");
  assert.equal(strengthOf(data.species, "SPECIES_KECLEON"), 0);
  assert.equal(strengthOf(data.species, "SPECIES_PIKACHU"), 100);
  assert.equal(keyOf(0xffffabcd), 0xab);
});
