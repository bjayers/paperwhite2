// The Entralink markers' art and the buff icons on the Sprite sheets page: the tool lists every marker in res/ (the ground
// markers by type, the NPC markers and buff icons by file), and its check enforces what the packer needs (the size, 16
// colors, index 0 clear).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const TOOL = join(ROOT, "tools/paperwhite2/entralink_marker_art.py");
const MARKERS = join(ROOT, "res/paperwhite2/entralink");

const list = () => JSON.parse(execFileSync("python3", ["-I", TOOL, "list"], { cwd: ROOT, encoding: "utf8" })) as {
  name: string; path: string; toolArgs: string[]; width: number; height: number; palette: boolean;
}[];
const scratch = () => mkdtempSync(join(tmpdir(), "marker-art-test-"));
const check = (png: string, size: number, ...extra: string[]) =>
  spawnSync("python3", ["-I", TOOL, "check", png, "--size", String(size), ...extra], { cwd: ROOT, encoding: "utf8" });

test("every marker's PNG is listed with its size", () => {
  const sheets = list();
  const files = [
    ...readdirSync(join(MARKERS, "markers")).map((f) => `res/paperwhite2/entralink/markers/${f}`),
    ...readdirSync(join(MARKERS, "npc_markers")).map((f) => `res/paperwhite2/entralink/npc_markers/${f}`),
    ...readdirSync(join(MARKERS, "buff_icons")).map((f) => `res/paperwhite2/entralink/buff_icons/${f}`),
  ];
  assert.deepEqual(sheets.map((s) => s.path).sort(), files.sort());
  for (const sheet of sheets) {
    const ground = sheet.path.includes("/markers/");
    assert.equal(sheet.width, ground ? 32 : 16);
    assert.equal(sheet.height, sheet.width);
    assert.deepEqual(sheet.toolArgs, ["--size", String(sheet.width)]);
    assert.ok(sheet.palette);
  }
});

test("every marker checks, and writes the file it was read from", () => {
  const dir = scratch();
  for (const sheet of list()) {
    const out = join(dir, "out.png");
    const info = join(dir, "info.json");
    const run = check(join(ROOT, sheet.path), sheet.width, "--output", out, "--preview", join(dir, "p.png"), "--info", info);
    assert.equal(run.status, 0, `${sheet.path}: ${run.stderr}`);
    assert.deepEqual(readFileSync(out), readFileSync(join(ROOT, sheet.path)), sheet.path);
    assert.equal((JSON.parse(readFileSync(info, "utf8")) as { colors: string[] }).colors.length, 16);
  }
});

test("a wrong size is refused", () => {
  const sheet = list().find((s) => s.width === 16)!;
  const run = check(join(ROOT, sheet.path), 32);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /16×16; this marker is 32×32/);
});

test("a palette replaces the colors, to the DS's 5 bits an axis, and the output has them", () => {
  const dir = scratch();
  const sheet = list().find((s) => s.width === 32)!;
  const out = join(dir, "out.png");
  const info = join(dir, "info.json");
  const palette = Array.from({ length: 16 }, (_, i) => (i === 2 ? "#0a14c8" : "#000000")).join(",");
  const run = check(join(ROOT, sheet.path), 32, "--palette", palette, "--output", out, "--info", info);
  assert.equal(run.status, 0, run.stderr);
  const colors = (JSON.parse(readFileSync(info, "utf8")) as { colors: string[] }).colors;
  assert.equal(colors[2], "#0810c5");
  const png = readFileSync(out);
  const at = png.indexOf("PLTE");
  assert.deepEqual([...png.subarray(at + 4 + 6, at + 4 + 9)], [0x08, 0x10, 0xc5]);
  assert.notEqual(check(join(ROOT, sheet.path), 32, "--palette", "#000000").status, 0);
});

test("an indexed PNG that uses a color past 15 is refused", () => {
  const dir = scratch();
  const file = join(dir, "bad.png");
  // A 16×16 8-bit indexed image whose pixels are all index 16, made by the build's own writer
  const script = "import sys; sys.path.insert(0, sys.argv[1]); from tools.data.nitro_2d import write_indexed_png; " +
    "open(sys.argv[2], 'wb').write(write_indexed_png(16, 16, bytes([16]) * 256, [(0, 0, 0)] * 17))";
  execFileSync("python3", ["-I", "-c", script, ROOT, file]);
  const run = check(file, 16);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /color index 16/);
});
