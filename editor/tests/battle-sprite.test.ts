// The battle sprite art's tool (tools/paperwhite2/battle_sprite.py), as the Pokémon Editor's Battle sprite card calls
// it through the server: its check answers in the shape BattleSpriteArt.tsx reads (api.ts's BattleSpriteCheck), and an
// exported zip imports back unchanged. Reads res/, writes only a temporary zip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BattleSpriteCheck } from "../src/api.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TOOL = join(ROOT, "tools/paperwhite2/battle_sprite.py");
const run = (...args: string[]) => JSON.parse(execFileSync("python3", ["-I", TOOL, ...args], { cwd: ROOT, maxBuffer: 64 << 20 })
  .toString().trim().split("\n").pop()!) as BattleSpriteCheck;

test("the current art's check has a preview of both sides, the stills and the sheets", () => {
  const check = run("check", "SPECIES_PICHU", "--form", "1");
  assert.equal(check.ok, true);
  assert.deepEqual(check.changed, []);
  const preview = check.preview!;
  assert.deepEqual(Object.keys(preview.sides), ["front", "back"]);
  assert.equal(preview.sides.front.frames, 87);
  assert.ok(preview.sides.front.sheets.front.normal.length > 100);
  assert.deepEqual(Object.keys(preview.stills), ["front_single", "back_single"]);
  assert.equal(preview.palettes.shiny.length, 16);
});

test("an export imports back with nothing to change", () => {
  const dir = mkdtempSync(join(tmpdir(), "battle-sprite-"));
  try {
    const zip = join(dir, "art.zip");
    execFileSync("python3", ["-I", TOOL, "export", "SPECIES_ABOMASNOW", zip], { cwd: ROOT });
    const check = run("check", "SPECIES_ABOMASNOW", zip, "--no-preview");
    assert.equal(check.ok, true, check.message);
    assert.deepEqual(check.changed, []);
    assert.deepEqual(check.warnings, []);
    assert.ok(check.given!.includes("front_female"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a form without sheets of its own (Arceus: palettes only) is refused", () => {
  assert.throws(() => execFileSync("python3", ["-I", TOOL, "check", "SPECIES_ARCEUS", "--form", "1"], { cwd: ROOT, stdio: "pipe" }));
});
