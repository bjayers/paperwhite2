// The battle sprite art's tool (tools/paperwhite2/battle_sprite.py), as the Pokémon Editor's Battle sprite card calls
// it through the server: its check answers in the shape BattleSpriteArt.tsx reads (api.ts's BattleSpriteCheck), and an
// exported zip imports back unchanged. Reads res/, writes only a temporary zip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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

// The walking sprites (docs/paperwhite2/design/battle-sprites.md section 14.7): checks only, nothing is written
const walking = (...args: string[]) => run("walking-check", ...args);
const APPLIN = join(ROOT, "res/field/actors/pokemon/applin");

test("an exported zip's follower sheets import back unchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "battle-sprite-"));
  try {
    const zip = join(dir, "art.zip");
    execFileSync("python3", ["-I", TOOL, "export", "SPECIES_APPLIN", zip], { cwd: ROOT });
    const check = run("check", "SPECIES_APPLIN", zip, "--no-preview");
    assert.equal(check.ok, true, check.message);
    assert.deepEqual(check.changed, []);
    assert.deepEqual(check.walking!.map((w) => [w.stem, w.changed, w.frames, w.layout]), [["pokemon_applin", false, 8, "asymmetric"]]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a new walking sprite for Flapple makes the code, the sheet and the rows' pointers", () => {
  const check = walking("SPECIES_FLAPPLE", join(APPLIN, "sprite.png"));
  assert.equal(check.ok, true, check.message);
  const item = check.walking![0];
  assert.deepEqual([item.new, item.code, item.layout, item.currentCode], [true, "OBJ_CODE_POKEMON_FLAPPLE", "asymmetric", "OBJ_CODE_POKEMON_BUDEW"]);
  assert.ok(item.rows.includes("flapple") && item.rows.every((r) => r.startsWith("flapple")), item.rows.join());
  assert.ok(check.changed!.includes("generated/obj_codes.txt"));
  assert.ok(check.changed!.includes("res/field/actors/pokemon/flapple/sprite.png"));
  assert.ok(item.strips!.down.length > 100);
});

test("a wrong size is refused, and an unchanged palette of another species' sheet is nothing to refuse", () => {
  const dir = mkdtempSync(join(tmpdir(), "battle-sprite-"));
  try {
    // 200x32 is no walking layout
    const bad = join(dir, "bad.png");
    execFileSync("python3", ["-I", "-c", `
import sys
sys.path.insert(0, ${JSON.stringify(ROOT)})
from tools.data.nitro_2d import write_indexed_png
open(sys.argv[1], "wb").write(write_indexed_png(200, 32, bytes(200 * 32), [(0, 0, 0)] * 16))`, bad]);
    const check = walking("SPECIES_FLAPPLE", bad);
    assert.equal(check.ok, false);
    assert.match(check.errors[0], /200 by 32/);
    assert.deepEqual(check.changed, []);
    const shared = walking("SPECIES_FLAPPLE", "--sheet", "OBJ_CODE_POKEMON_BUDEW", join(ROOT, "res/pokemon/budew/normal.pal"));
    assert.equal(shared.ok, true, shared.message);
    assert.deepEqual(shared.changed, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// "Add a female sprite" and "Remove the female sprite" (tools/paperwhite2/follower_sexes.py): checks only. The species
// are found in res/, whichever they are: one whose male row shows both sexes, one with a female row of her own
const FOLLOWER_DIR = join(ROOT, "res/field/actors/followers");
function followerSexes(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const name of readdirSync(FOLLOWER_DIR)) {
    const follower = JSON.parse(readFileSync(join(FOLLOWER_DIR, name, "data.json"), "utf8")).follower;
    if (!follower || follower.form) continue;
    if (!out.has(follower.species)) out.set(follower.species, new Set());
    out.get(follower.species)!.add(String(follower.sex));
  }
  return out;
}

test("a female sprite of her own is a new row after the male's, and one that exists is refused", () => {
  const sexes = followerSexes();
  const both = [...sexes].find(([, s]) => s.has("GENDER_MALE") && !s.has("GENDER_FEMALE"))![0];
  const check = walking(both, "--female", join(APPLIN, "sprite.png"));
  assert.equal(check.ok, true, check.message);
  const row = `${both.replace("SPECIES_", "").toLowerCase()}_female`;
  const item = check.walking![0];
  assert.deepEqual([item.new, item.code, item.rows], [true, `OBJ_CODE_FOLLOWER_${row.toUpperCase()}`, [row]]);
  assert.deepEqual(check.changed, ["generated/obj_codes.txt", `res/field/actors/followers/${row}/data.json`,
    `res/field/actors/followers/${row}/sprite.png`]);
  const own = [...sexes].find(([, s]) => s.has("GENDER_MALE") && s.has("GENDER_FEMALE"))![0];
  const refused = walking(own, "--female", join(APPLIN, "sprite.png"));
  assert.equal(refused.ok, false);
  assert.match(refused.errors[0], /has a female follower row already/);
});

test("removing a female sprite removes her row and code; a species that is always female keeps hers", () => {
  const sexes = followerSexes();
  const tool = join(ROOT, "tools/paperwhite2/follower_sexes.py");
  const remove = (species: string) => JSON.parse(execFileSync("python3", ["-I", tool, "remove-female", species], { cwd: ROOT })
    .toString().trim().split("\n").pop()!) as { ok: boolean; changed: string[]; errors: string[] };
  const own = [...sexes].find(([, s]) => s.has("GENDER_MALE") && s.has("GENDER_FEMALE"))![0];
  const plan = remove(own);
  assert.equal(plan.ok, true, plan.errors.join());
  assert.ok(plan.changed.includes("generated/obj_codes.txt"));
  assert.ok(plan.changed.includes(`res/field/actors/followers/${own.replace("SPECIES_", "").toLowerCase()}_female/data.json`));
  const alone = [...sexes].find(([, s]) => !s.has("GENDER_MALE") && s.has("GENDER_FEMALE"));
  if (alone) assert.match(remove(alone[0]).errors[0], /no male follower row/);
});
