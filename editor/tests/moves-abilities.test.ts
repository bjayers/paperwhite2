// Add move's and Add ability's tools (tools/paperwhite2/moves.py and abilities.py), as the Move and Ability Editors
// call them through the server: adding and removing leaves generated/moves.txt and abilities.txt, res/moves/ and
// res/abilities/ as they were, byte for byte, and the generated headers too; a copy takes its template's record,
// animation and handlers; retiring keeps the ID; names, handlers and removals are refused as the build would; the
// Mold Breaker list follows "mold_breaker_ignores". It runs in a scratch checkout (the tools and generated/ copied,
// res/'s folders linked but the moves' and abilities', made of links), so the real res/ is only read.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AbilitiesInfo, EntryChange, MoveUses, MovesInfo } from "../src/api.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let scratch = "";

function scratchCheckout(): string {
  const dir = mkdtempSync(join(tmpdir(), "moves-abilities-"));
  for (const folder of ["tools/data", "tools/paperwhite2", "tools/text", "generated"])
    cpSync(join(ROOT, folder), join(dir, folder), { recursive: true, filter: (src) => !src.includes("__pycache__") });
  cpSync(join(ROOT, "tools/__init__.py"), join(dir, "tools/__init__.py"));
  for (const folder of ["include", "src"]) symlinkSync(join(ROOT, folder), join(dir, folder));
  mkdirSync(join(dir, "res"));
  for (const name of readdirSync(join(ROOT, "res"))) {
    if (name !== "moves" && name !== "abilities") { symlinkSync(join(ROOT, "res", name), join(dir, "res", name)); continue; }
    mkdirSync(join(dir, "res", name));
    for (const entry of readdirSync(join(ROOT, "res", name))) symlinkSync(join(ROOT, "res", name, entry), join(dir, "res", name, entry));
  }
  return dir;
}

function tool(script: string, ...args: string[]): string {
  return execFileSync("python3", ["-I", join(scratch, "tools/paperwhite2", script), ...args], { cwd: scratch, maxBuffer: 16 << 20 }).toString();
}
const run = (script: string, ...args: string[]) => JSON.parse(tool(script, ...args).trim().split("\n").pop()!) as EntryChange;

function refusal(script: string, ...args: string[]): string {
  try {
    run(script, ...args);
  } catch (e) {
    const out = String((e as { stdout?: Buffer }).stdout ?? "");
    return (JSON.parse(out.trim().split("\n").pop()!) as { message: string }).message;
  }
  assert.fail(`${args.join(" ")} wasn't refused`);
}

/** A header as the build generates it. */
function header(kind: "moves" | "abilities"): string {
  const out = join(scratch, "build", `${kind}_config.h`);
  tool(`${kind}.py`, "header", out);
  return readFileSync(out, "utf8");
}

/** The files the tools write, and the headers the build generates from them. */
const state = () => ({
  moves: readFileSync(join(scratch, "generated/moves.txt")),
  abilities: readFileSync(join(scratch, "generated/abilities.txt")),
  moveFolders: readdirSync(join(scratch, "res/moves")).sort().join(","),
  abilityFiles: readdirSync(join(scratch, "res/abilities")).sort().join(","),
  movesHeader: header("moves"),
  abilitiesHeader: header("abilities"),
});
const json = (path: string) => JSON.parse(readFileSync(join(scratch, path), "utf8"));

before(() => { scratch = scratchCheckout(); });
after(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }); });

test("adding moves and removing them again leaves every file as it was", () => {
  const before = state();
  const dry = run("moves.py", "add", "Test Move", "--from", "MOVE_TACKLE", "--check");
  assert.equal(dry.check, true);
  assert.deepEqual(dry.changed, ["generated/moves.txt", "res/moves/test_move/data.json"]);
  assert.deepEqual(state(), before, "a dry run writes nothing");

  const info = JSON.parse(tool("moves.py", "json")) as MovesInfo;
  const added = run("moves.py", "add", "Test Move", "--from", "MOVE_TACKLE");
  assert.equal(added.id, info.nextId);
  assert.match(readFileSync(join(scratch, "generated/moves.txt"), "utf8"), /\nMOVE_TEST_MOVE\n$/);
  const data = json("res/moves/test_move/data.json");
  const tackle = json("res/moves/tackle/data.json");
  assert.deepEqual({ ...data, name: tackle.name, animation: undefined }, { ...tackle, animation: undefined });
  assert.equal(data.name, "Test Move");
  assert.equal(data.animation, "MOVE_TACKLE");
  assert.equal(data.handlers_like, undefined, "Tackle has no handlers to take");
  assert.match(state().movesHeader, /PAPERWHITE2_MOVE_ANIMATIONS .*MOVE_TACKLE\n/);

  // A copy of a move with handlers takes them; one of an added move takes its animation; blank is Pound's
  const second = run("moves.py", "add", "Test Venom", "--from", "MOVE_VENOSHOCK", "--effect", "BATTLE_EFFECT_POISON_HIT");
  assert.equal(json("res/moves/test_venom/data.json").handlers_like, "MOVE_VENOSHOCK");
  assert.equal(json("res/moves/test_venom/data.json").effect, "BATTLE_EFFECT_POISON_HIT");
  assert.equal(second.id, info.nextId + 1);
  run("moves.py", "add", "Test Apple", "--from", "MOVE_GRAV_APPLE", "--handlers-like", "none");
  const apple = json("res/moves/test_apple/data.json");
  assert.equal(apple.animation, "MOVE_SEED_BOMB");
  assert.equal(apple.handlers_like, undefined);
  const blank = run("moves.py", "add", "Test Blank", "--blank", "--animation", "MOVE_EMBER", "--description", "Line one\nline two.");
  assert.equal(json("res/moves/test_blank/data.json").animation, "MOVE_EMBER");
  assert.equal(json("res/moves/test_blank/data.json").description, "Line one\nline two.");
  assert.equal(blank.id, info.nextId + 3);

  assert.match(refusal("moves.py", "remove", "MOVE_TEST_MOVE"), /Only the last added move/);
  for (const move of ["MOVE_TEST_BLANK", "MOVE_TEST_APPLE", "MOVE_TEST_VENOM", "MOVE_TEST_MOVE"]) run("moves.py", "remove", move);
  assert.deepEqual(state(), before);
});

test("adding abilities and removing them again leaves every file as it was, and the Mold Breaker list follows", () => {
  const before = state();
  assert.match(before.abilitiesHeader, /PAPERWHITE2_ABILITY_MOLD_BREAKER_IGNORED ABILITY_BULLETPROOF\n/);
  const info = JSON.parse(tool("abilities.py", "json")) as AbilitiesInfo;
  const guard = run("abilities.py", "add", "Test Guard", "--from", "ABILITY_LEVITATE");
  assert.equal(guard.id, info.nextId);
  assert.deepEqual(json("res/abilities/test_guard.json"), {
    $schema: "ability.schema.json", name: "Test Guard", description: json("res/abilities/levitate.json").description,
    handlers_like: "ABILITY_LEVITATE", mold_breaker_ignores: true });
  assert.ok(guard.warnings?.some((w) => /checks ABILITY_LEVITATE by its ID/.test(w)), "Levitate's checks by ID are named");
  assert.match(state().abilitiesHeader, /PAPERWHITE2_ABILITY_MOLD_BREAKER_IGNORED ABILITY_BULLETPROOF, ABILITY_TEST_GUARD\n/);
  assert.match(state().abilitiesHeader, /PAPERWHITE2_ABILITY_MOLD_BREAKER_IGNORED_COUNT 2\n/);

  const syrup = run("abilities.py", "add", "Test Scare", "--from", "ABILITY_INTIMIDATE", "--no-mold-breaker-ignores");
  assert.equal(json("res/abilities/test_scare.json").mold_breaker_ignores, undefined);
  assert.equal(syrup.id, info.nextId + 1);
  const blank = run("abilities.py", "add", "Test Blank", "--blank");
  assert.ok(blank.warnings?.some((w) => /does nothing in battle/.test(w)));
  assert.match(state().abilitiesHeader, /PAPERWHITE2_ABILITY_HANDLERS_LIKE ABILITY_BULLETPROOF, ABILITY_SWEET_SYRUP, ABILITY_RIPEN, ABILITY_LEVITATE, ABILITY_INTIMIDATE, ABILITY_TEST_BLANK\n/);

  for (const ability of ["ABILITY_TEST_BLANK", "ABILITY_TEST_SCARE", "ABILITY_TEST_GUARD"]) run("abilities.py", "remove", ability);
  assert.deepEqual(state(), before);
});

test("retiring keeps the ID and data, and the editor's pickers learn of it", () => {
  const before = state();
  run("moves.py", "add", "Old Move", "--from", "MOVE_POUND");
  run("abilities.py", "add", "Old Guard", "--from", "ABILITY_STURDY");
  const moveText = readFileSync(join(scratch, "res/moves/old_move/data.json"), "utf8");
  run("moves.py", "retire", "MOVE_OLD_MOVE");
  run("abilities.py", "retire", "ABILITY_OLD_GUARD");
  assert.equal(json("res/moves/old_move/data.json").retired, true);
  const moves = JSON.parse(tool("moves.py", "json")) as MovesInfo;
  const abilities = JSON.parse(tool("abilities.py", "json")) as AbilitiesInfo;
  assert.deepEqual(moves.retired, ["MOVE_OLD_MOVE"]);
  assert.deepEqual(abilities.retired, ["ABILITY_OLD_GUARD"]);
  assert.equal(moves.moves.find((m) => m.move === "MOVE_OLD_MOVE")?.last, true);
  // The build ignores it: the header is the one without "retired"
  run("moves.py", "unretire", "MOVE_OLD_MOVE");
  assert.equal(readFileSync(join(scratch, "res/moves/old_move/data.json"), "utf8"), moveText);
  assert.match(refusal("moves.py", "retire", "MOVE_POUND"), /original game's/);
  run("moves.py", "remove", "MOVE_OLD_MOVE");
  run("abilities.py", "remove", "ABILITY_OLD_GUARD");
  assert.deepEqual(state(), before);
});

test("names, handlers, templates and removals are refused as the build would", () => {
  const before = state();
  assert.match(refusal("moves.py", "add", "Thirteen Char", "--blank"), /13 characters/);
  assert.match(refusal("abilities.py", "add", "Supersweet Syrup", "--blank"), /16 characters/);
  assert.match(refusal("moves.py", "add", "9 Lives", "--blank"), /start with a letter/);
  assert.match(refusal("moves.py", "add", "Pound", "--blank"), /already a move/);
  assert.match(refusal("moves.py", "add", "Test", "--blank", "--handlers-like", "MOVE_FIRE_PLEDGE"), /compare the move's own ID/);
  assert.match(refusal("moves.py", "add", "Test", "--blank", "--animation", "MOVE_APPLE_ACID"), /original move/);
  assert.match(refusal("abilities.py", "add", "Test", "--blank", "--handlers-like", "ABILITY_BULLETPROOF"), /original ability/);
  // A pledge's copy keeps its data but not its handlers, which tell the pledges apart by ID
  const pledge = run("moves.py", "add", "Test Pledge", "--from", "MOVE_FIRE_PLEDGE", "--check");
  assert.ok(pledge.warnings?.some((w) => /tell the moves apart/.test(w)));
  // Names in res/ or the code keep a move or ability
  assert.match(refusal("moves.py", "remove", "MOVE_SYRUP_BOMB"), /res\/pokemon\/dipplin\/data\.json/);
  assert.match(refusal("abilities.py", "remove", "ABILITY_RIPEN"), /res\/pokemon\/applin\/data\.json.*paperwhite2_battle\.c/);
  assert.deepEqual(state(), before);
});

test("who learns a move and who has an ability", () => {
  const ball = JSON.parse(tool("moves.py", "uses", "MOVE_SHADOW_BALL")) as MoveUses;
  assert.deepEqual(ball.tm, ["TM30"]);
  const gengar = ball.learners.find((l) => l.species === "SPECIES_GENGAR");
  assert.deepEqual(gengar?.tm, ["TM30"]);
  const grav = JSON.parse(tool("moves.py", "uses", "MOVE_GRAV_APPLE")) as MoveUses;
  assert.deepEqual(grav.learners.map((l) => [l.species, l.levels]), [["SPECIES_FLAPPLE", [32]]]);
  assert.ok(grav.code.includes("src/paperwhite2/ov167/paperwhite2_battle.c"));
  const uses = JSON.parse(tool("abilities.py", "uses", "ABILITY_BULLETPROOF")) as { species: { species: string; slots: string[] }[] };
  assert.deepEqual(uses.species.map((s) => [s.species, s.slots]), [["SPECIES_APPLIN", ["hidden"]]]);
});

test("the pickers leave the retired constants out", async () => {
  const { constantOptions, setHiddenConstants } = await import("../src/modules/schema-form/form.tsx");
  const constants = new Map([["MOVE_NONE", 0], ["MOVE_POUND", 1], ["MOVE_OLD_MOVE", 562], ["ABILITY_OLD_GUARD", 166]]);
  assert.deepEqual(constantOptions(constants, "MOVE_").map((o) => o.value), ["MOVE_NONE", "MOVE_POUND", "MOVE_OLD_MOVE"]);
  setHiddenConstants(["MOVE_OLD_MOVE", "ABILITY_OLD_GUARD"]);
  assert.deepEqual(constantOptions(constants, "MOVE_").map((o) => o.value), ["MOVE_NONE", "MOVE_POUND"]);
  assert.deepEqual(constantOptions(constants, "ABILITY_"), []);
  setHiddenConstants([]);
});
