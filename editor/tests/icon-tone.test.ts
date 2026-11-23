// The Sprite Editor's Game tone (src/modules/spriteeditor/tone.ts) against the build's tools/paperwhite2/icon_tone.py, on
// made-up palettes (never the user's res/): equal colours at every strength, strength 0 the identity, transparency and
// the outline greys untouched, the view's nulls kept, and icon_tone.json's checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { Rgb } from "../src/modules/spriteeditor/model.ts";
import { readTone, tone, tonedColours, type ToneParams } from "../src/modules/spriteeditor/tone.ts";

const REPO = resolve(import.meta.dirname, "../..");
const PARAMS: ToneParams = { enabled: true, strength: 1, lightness_spread: 0.12, min_contrast: 0.5, chroma_knee: 0.18, chroma_above_knee: 0.5 };
const GREYS: Rgb[] = [[0x62, 0x62, 0x5a], [0x41, 0x41, 0x41]];

// Made-up icons: deep shading, vivid colours near the sRGB edge, a flat one, near-blacks and whites, unused slots
function palettes(): { colours: Rgb[]; counts: number[] }[] {
  const out: { colours: Rgb[]; counts: number[] }[] = [];
  let seed = 7;
  const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  out.push({ colours: [[0, 128, 0], [20, 40, 120], [60, 90, 200], [140, 170, 250], [230, 20, 20], [255, 255, 255], [8, 8, 8], [200, 160, 40],
    ...Array.from({ length: 6 }, (): Rgb => [0, 128, 0]), ...GREYS], counts: [900, 120, 300, 200, 40, 60, 30, 0, 0, 0, 0, 0, 0, 0, 300, 98] });
  out.push({ colours: [[0, 0, 0], [200, 120, 120], [210, 130, 130], ...Array.from({ length: 11 }, (): Rgb => [0, 0, 0]), ...GREYS],
    counts: [0, 100, 100, ...Array(13).fill(0)] });
  out.push({ colours: [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 0], [16, 0, 32],
    ...Array.from({ length: 6 }, (): Rgb => [0, 0, 0]), ...GREYS], counts: [10, 5, 5, 5, 5, 5, 5, 50, 0, 0, 0, 0, 0, 0, 1, 1] });
  for (let n = 0; n < 12; n++) {
    const colours = Array.from({ length: 16 }, (): Rgb => [0, 1, 2].map(() => Math.floor(next() * 32) * 8) as Rgb);
    colours[14] = GREYS[0]; colours[15] = GREYS[1];
    out.push({ colours, counts: colours.map(() => (next() < 0.25 ? 0 : Math.floor(next() * 400))) });
  }
  return out;
}

const STRENGTHS = [0, 0.3, 0.5, 1];

function python(cases: { colours: Rgb[]; counts: number[]; strength: number }[]): Rgb[][] {
  const script = [`import json, sys; sys.path.insert(0, ${JSON.stringify(REPO)})`,
    "from tools.paperwhite2 import icon_tone",
    "data = json.load(sys.stdin)",
    "print(json.dumps([icon_tone.tone(c['colours'], c['counts'], data['params'], c['strength']) for c in data['cases']]))"].join("\n");
  return JSON.parse(execFileSync("python3", ["-c", script], { input: JSON.stringify({ params: PARAMS, cases }) }).toString());
}

test("the editor's tone equals the build's on fixtures, at every strength", () => {
  const cases = palettes().flatMap((p) => STRENGTHS.map((strength) => ({ ...p, strength })));
  const expected = python(cases);
  cases.forEach((c, i) => assert.deepEqual(tone(c.colours, c.counts, PARAMS, c.strength), expected[i], `case ${i}`));
});

test("strength 0 is the identity; transparency and the outline greys never change", () => {
  for (const p of palettes()) {
    assert.deepEqual(tone(p.colours, p.counts, PARAMS, 0), p.colours);
    const toned = tone(p.colours, p.counts, PARAMS, 1);
    assert.deepEqual(toned[0], p.colours[0]);
    assert.deepEqual(toned.slice(14), GREYS);
  }
});

test("the view's colours keep their nulls", () => {
  const p = palettes()[0];
  const view: (Rgb | null)[] = p.colours.map((c, i) => (i === 0 || (i > 7 && i < 14) ? null : c));
  const pixels = new Uint8Array(p.counts.flatMap((n, i) => Array(n).fill(i)));
  const toned = tonedColours(view, pixels, PARAMS);
  const full = tone(p.colours.map((c, i) => (view[i] ? c : [0, 0, 0])), p.counts, PARAMS);
  toned.forEach((c, i) => assert.deepEqual(c, view[i] ? full[i] : null));
});

test("icon_tone.json's checks", () => {
  assert.deepEqual(readTone(JSON.stringify(PARAMS)), PARAMS);
  assert.equal(readTone(null), null);
  assert.equal(readTone("{"), null);
  assert.equal(readTone(JSON.stringify({ ...PARAMS, strength: 2 })), null);
  assert.equal(readTone(JSON.stringify({ ...PARAMS, enabled: "yes" })), null);
  assert.equal(readTone(JSON.stringify({ ...PARAMS, chroma_knee: undefined })), null);
});
