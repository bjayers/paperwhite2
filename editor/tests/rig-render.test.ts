// The Rig Editor's port of MCSS's drawing (src/modules/rig/mcss.ts) against the build's (tools/paperwhite2/mcss.py's
// render, through tests/mcss_render.py): the same frames, pixel for pixel, on sprites chosen for their oddities: Pichu
// (two poses, restarting parts), Charizard (parts that continue, a stop sequence), a female sheet (Abomasnow's),
// Kyurem's form 2 (35 parts, second rectangles) and a Pokéstar prop. Reads res/, writes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJson } from "../shared/json.ts";
import { readIndexedPng } from "../src/modules/palettes/png.ts";
import { lengthOf, render, type Rig } from "../src/modules/rig/mcss.ts";
import { rigOf } from "../src/modules/rig/model.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const HELPER = fileURLToPath(new URL("./mcss_render.py", import.meta.url));

interface PythonFrame { sequence: number; time: number; width: number; height: number; origin: [number, number]; pixels: string }

async function compare(folder: string, side: "front" | "back", sheetName: string) {
  const dir = join(ROOT, "res/pokemon", folder);
  const rig: Rig = rigOf(parseJson(readFileSync(join(dir, `${side}_rig.json`), "utf8")));
  const png = readFileSync(join(dir, sheetName));
  const sheet = (await readIndexedPng(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer)).pixels;
  // Times across each sequence's loop and past it: key edges (multiples of 6), odd frames, a second loop
  const requests = rig.sequences.map((sequence, n) => {
    const length = lengthOf(sequence);
    const times = [0, 1, 5, 6, 7, 37, 100, 239, 240, 241, length - 1, length, length + 13, 2 * length + 55]
      .filter((t, i, all) => t >= 0 && all.indexOf(t) === i);
    return `${n}:${times.join(",")}`;
  });
  const python = JSON.parse(execFileSync("python3", ["-I", HELPER, folder, side, sheetName, ...requests],
    { cwd: ROOT, maxBuffer: 256 << 20 }).toString()) as PythonFrame[];
  assert.ok(python.length >= 10);
  let drawn = 0;
  for (const want of python) {
    const got = render(rig, sheet, want.sequence, want.time);
    const where = `${folder} ${side} ${sheetName} sequence ${want.sequence} at ${want.time}`;
    assert.deepEqual([got.width, got.height, got.originX, got.originY], [want.width, want.height, ...want.origin], `${where}: the canvas`);
    const pixels = Buffer.from(want.pixels, "hex");
    let differ = 0;
    for (let i = 0; i < pixels.length; i++) if (pixels[i] !== got.pixels[i]) differ++;
    assert.equal(differ, 0, `${where}: ${differ} pixels differ`);
    for (const p of pixels) if (p) drawn++;
  }
  assert.ok(drawn > 1000, `${folder}: frames with pixels`);
  return python.length;
}

test("Pichu's front and back draw as mcss.render draws them", async () => {
  await compare("pichu", "front", "front.png");
  await compare("pichu", "back", "back.png");
});

test("Charizard (parts that continue, a stop sequence) draws as mcss.render draws it", async () => {
  await compare("charizard", "front", "front.png");
  await compare("charizard", "back", "back.png");
});

test("a female sheet on the shared rig (Abomasnow) draws as mcss.render draws it", async () => {
  await compare("abomasnow", "front", "front_female.png");
  await compare("abomasnow", "back", "back_female.png");
});

test("Kyurem's form 2 (35 parts, second rectangles) draws as mcss.render draws it", async () => {
  await compare("kyurem/form_2", "front", "front.png");
  await compare("kyurem/form_2", "back", "back.png");
});

test("a Pokéstar Studios prop draws as mcss.render draws it", async () => {
  await compare("pokestar/prop_c1", "front", "front.png");
  await compare("pokestar/ufo", "front", "front.png");
});
