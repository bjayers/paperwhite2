// The Palette Editor's formats: every palette in res/ reads and writes back byte for byte, so an untouched file never
// changes, and indexed PNGs read as the build's packer reads them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { adjust, bgr555, from5, parsePal, snap, to5, writePal, NO_ADJUSTMENT, type Rgb } from "../src/modules/palettes/pal.ts";
import { readIndexedPng } from "../src/modules/palettes/png.ts";

const ROOT = resolve(import.meta.dirname, "../..");

test("every res/ palette round-trips", () => {
  const files = globSync("res/**/*.pal", { cwd: ROOT });
  assert.ok(files.length > 5000);
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    assert.equal(writePal(parsePal(text)), text, file);
  }
});

test("5-bit axes round-trip through the dump's 8-bit values", () => {
  for (let v = 0; v < 32; v++) assert.equal(to5(from5(v)), v);
  for (let v = 0; v < 256; v++) assert.deepEqual(snap(snap([v, v, v])), snap([v, v, v]));
  assert.equal(bgr555([255, 255, 255]), 0x7fff);
  assert.equal(bgr555([255, 0, 0]), 0x001f);
  const c: Rgb = [205, 213, 180];
  assert.deepEqual(adjust(c, NO_ADJUSTMENT), c);
  assert.deepEqual(adjust(c, { hue: 0, saturation: 0, lightness: 100 }), [255, 255, 255]);
  assert.throws(() => parsePal("JASC-PAL\n0100\n2\n0 0 0\n"));
});

test("indexed PNGs read as the build's packer reads them", async () => {
  const files = ["res/pokemon/bulbasaur/front.png", "res/graphics/geonet/05.png", "res/paperwhite2/dexnav/templates/top.png",
    ...globSync("res/trainers/sprites/*/*.png", { cwd: ROOT }).slice(0, 3)];
  const script = "import sys, hashlib\nfrom pathlib import Path\nsys.path.insert(0, '.')\nfrom tools.data.nitro_2d import read_indexed_png\n" +
    "for p in sys.argv[1:]:\n    w, h, px, _ = read_indexed_png(Path(p))\n    print(w, h, hashlib.sha1(bytes(px)).hexdigest())\n";
  const expected = execFileSync("python3", ["-c", script, ...files], { cwd: ROOT, encoding: "utf8" }).trim().split("\n");
  const { createHash } = await import("node:crypto");
  for (const [i, file] of files.entries()) {
    const buffer = readFileSync(join(ROOT, file));
    const image = await readIndexedPng(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length));
    const hash = createHash("sha1").update(image.pixels).digest("hex");
    assert.equal(`${image.width} ${image.height} ${hash}`, expected[i], file);
  }
});

test("every art target converts as it is", () => {
  const targets = (JSON.parse(readFileSync(join(ROOT, "res/paperwhite2/art/targets.json"), "utf8")) as
    { targets: { name: string }[] }).targets;
  for (const { name } of targets) {
    const out = execFileSync("python3", ["tools/paperwhite2/screen_art.py", "convert", name], { cwd: ROOT, encoding: "utf8" });
    const report = JSON.parse(out) as { ok: boolean };
    assert.ok(report.ok, name);
  }
});
