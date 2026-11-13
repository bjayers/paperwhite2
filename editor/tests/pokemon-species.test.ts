// Add Pokémon's tool (tools/paperwhite2/pokemon_species.py), as the Pokémon Editor calls it through the server: adding
// and removing species leaves generated/species.txt and obj_codes.txt, services.json, res/pokemon and the followers as
// they were, byte for byte; followers are copied with their codes and go with the species; retiring keeps the ID and
// frees the display number; numbers and names are refused as the build would; a retired ID is reused in place; a cry
// is checked and converted. It runs in a scratch checkout (the tools and generated/ copied, res/'s folders linked, the
// folders it writes in made of links), so the real res/ is only read.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PokemonSpeciesChange, PokemonSpeciesInfo } from "../src/api.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let scratch = "";

/** A checkout whose res/ links the real one's folders but those the tool writes in. */
function scratchCheckout(): string {
  const dir = mkdtempSync(join(tmpdir(), "pokemon-species-"));
  for (const folder of ["tools/data", "tools/paperwhite2", "tools/text", "generated"])
    cpSync(join(ROOT, folder), join(dir, folder), { recursive: true, filter: (src) => !src.includes("__pycache__") });
  cpSync(join(ROOT, "tools/__init__.py"), join(dir, "tools/__init__.py"));
  symlinkSync(join(ROOT, "include"), join(dir, "include"));
  // res/ linked folder by folder, down to the files the tool writes: res/pokemon/<new>/, services.json, the followers'
  // folders and the follower dialogue files
  const linkAll = (from: string, to: string, keep: Record<string, ((a: string, b: string) => void) | null>) => {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) {
      if (name in keep) keep[name]?.(join(from, name), join(to, name));
      else symlinkSync(join(from, name), join(to, name));
    }
  };
  linkAll(join(ROOT, "res"), join(dir, "res"), {
    pokemon: (a, b) => linkAll(a, b, {}),
    field: (a, b) => linkAll(a, b, { actors: (c, d) => linkAll(c, d, { followers: (e, f) => linkAll(e, f, {}) }) }),
    paperwhite2: (a, b) => linkAll(a, b, {
      pokemon_center: (c, d) => linkAll(c, d, { "services.json": (e, f) => cpSync(e, f) }),
      following: (c, d) => linkAll(c, d, { dialogue: (e, f) => linkAll(e, f, { species: (g, h) => linkAll(g, h, {}) }) }),
    }),
  });
  return dir;
}

function run(...args: string[]): PokemonSpeciesChange {
  return JSON.parse(execFileSync("python3", ["-I", join(scratch, "tools/paperwhite2/pokemon_species.py"), ...args],
    { cwd: scratch, maxBuffer: 16 << 20 }).toString().trim().split("\n").pop()!) as PokemonSpeciesChange;
}

/** The tool's refusal message. */
function refusal(...args: string[]): string {
  try {
    run(...args);
  } catch (e) {
    const out = String((e as { stdout?: Buffer }).stdout ?? "");
    return (JSON.parse(out.trim().split("\n").pop()!) as { message: string }).message;
  }
  assert.fail(`${args.join(" ")} wasn't refused`);
}

const info = () => run("info") as unknown as PokemonSpeciesInfo;
const FOLLOWERS = "res/field/actors/followers";
const state = () => ({
  species: readFileSync(join(scratch, "generated/species.txt")),
  codes: readFileSync(join(scratch, "generated/obj_codes.txt")),
  services: readFileSync(join(scratch, "res/paperwhite2/pokemon_center/services.json")),
  folders: readdirSync(join(scratch, "res/pokemon")).sort().join(","),
  followers: readdirSync(join(scratch, FOLLOWERS)).sort().join(","),
  dialogue: readdirSync(join(scratch, "res/paperwhite2/following/dialogue/species")).sort().join(","),
});
const followerCodes = () => readFileSync(join(scratch, "generated/obj_codes.txt"), "utf8").split("\n")
  .filter((line) => line.startsWith("OBJ_CODE_FOLLOWER_"));

before(() => { scratch = scratchCheckout(); });
after(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }); });

test("adding species and removing them again leaves every file as it was", () => {
  const before = state();
  const dry = run("add", "Testone", "--from", "SPECIES_BUDEW", "--number", "900", "--check");
  assert.equal(dry.check, true);
  assert.ok(dry.changed.includes("generated/species.txt") && dry.changed.includes("res/pokemon/testone/data.json"));
  assert.deepEqual(state(), before, "a dry run writes nothing");

  const { nextId, species: existing } = info();
  const testone = run("add", "Testone", "--from", "SPECIES_BUDEW", "--number", "900");
  assert.equal(testone.id, nextId);
  // the reserved pair comes first only when res/ has no added species yet
  assert.match(readFileSync(join(scratch, "generated/species.txt"), "utf8"), existing.length
    ? /\nSPECIES_TESTONE\n$/ : /SPECIES_PAPERWHITE2_RESERVED_685\nSPECIES_PAPERWHITE2_RESERVED_686\nSPECIES_TESTONE\n$/);
  const data = JSON.parse(readFileSync(join(scratch, "res/pokemon/testone/data.json"), "utf8"));
  assert.equal(data.name, "Testone");
  assert.equal(data.pokedex.display_number, 900);
  assert.deepEqual(data.pokedex.languages, {});
  assert.deepEqual(data.evolutions, []);
  assert.equal(data.baby_species, "SPECIES_TESTONE");
  assert.equal(data.art_template, "SPECIES_BUDEW");
  assert.deepEqual(readFileSync(join(scratch, "res/pokemon/testone/cry.wav")), readFileSync(join(ROOT, "res/pokemon/budew/cry.wav")));

  assert.equal(run("add", "Secret", "--blank", "--no-pokedex").id, nextId + 1);
  assert.equal(run("add", "Thirdmon", "--from", "SPECIES_TESTONE", "--no-wonder-trade").id, nextId + 2);
  const listed = { ...info(), species: info().species.slice(existing.length) };
  assert.deepEqual(listed.species.map((s) => [s.species, s.number, s.pokedex, s.last]),
    [["SPECIES_TESTONE", 900, true, false], ["SPECIES_SECRET", null, false, false], ["SPECIES_THIRDMON", null, true, true]]);
  assert.equal(listed.species[0].cryCopyOf, "Budew");
  // a copy of an added species takes its art template
  assert.equal(JSON.parse(readFileSync(join(scratch, "res/pokemon/thirdmon/data.json"), "utf8")).art_template, "SPECIES_BUDEW");
  assert.ok(readFileSync(join(scratch, "res/paperwhite2/pokemon_center/services.json"), "utf8").includes("SPECIES_THIRDMON"));

  assert.match(refusal("remove", "SPECIES_TESTONE"), /Only the last added species/);
  run("remove", "SPECIES_THIRDMON");
  run("remove", "SPECIES_SECRET");
  const last = run("remove", "SPECIES_TESTONE");
  if (!existing.length) assert.match(last.message, /reserved IDs/);
  assert.deepEqual(state(), before);
});

test("followers are copies of the template's, with their codes after the last, and go with the species", () => {
  const before = state();
  const last = followerCodes().at(-1)!;
  const testone = run("add", "Testone", "--from", "SPECIES_BUDEW", "--number", "900");
  assert.equal(testone.followers, 4);
  assert.match(testone.message, /4 followers copied from Budew's/);
  const codes = followerCodes();
  assert.deepEqual(codes.slice(codes.indexOf(last) + 1), ["OBJ_CODE_FOLLOWER_TESTONE", "OBJ_CODE_FOLLOWER_TESTONE_SHINY",
    "OBJ_CODE_FOLLOWER_TESTONE_FEMALE", "OBJ_CODE_FOLLOWER_TESTONE_FEMALE_SHINY"]);
  for (const suffix of ["", "_shiny", "_female", "_female_shiny"]) {
    const copy = JSON.parse(readFileSync(join(scratch, FOLLOWERS, `testone${suffix}`, "data.json"), "utf8"));
    const original = JSON.parse(readFileSync(join(ROOT, FOLLOWERS, `budew${suffix}`, "data.json"), "utf8"));
    assert.equal(copy.follower.species, "SPECIES_TESTONE");
    assert.deepEqual({ ...copy, follower: { ...copy.follower, species: original.follower.species } }, original);
  }
  assert.deepEqual(info().species.find((s) => s.species === "SPECIES_TESTONE")!.followers, ["testone", "testone_shiny", "testone_female", "testone_female_shiny"]);

  // a sprite named by another copied follower's code names that one's copy (Pignite's female shows its own sprite)
  run("add", "Testpig", "--from", "SPECIES_PIGNITE");
  const pignite = JSON.parse(readFileSync(join(ROOT, FOLLOWERS, "pignite_female/data.json"), "utf8"));
  assert.equal(pignite.sprite, "OBJ_CODE_FOLLOWER_PIGNITE");
  assert.equal(JSON.parse(readFileSync(join(scratch, FOLLOWERS, "testpig_female/data.json"), "utf8")).sprite,
    "OBJ_CODE_FOLLOWER_TESTPIG");
  assert.deepEqual(readFileSync(join(scratch, FOLLOWERS, "testpig/sprite.png")), readFileSync(join(ROOT, FOLLOWERS, "pignite/sprite.png")));

  // none with --no-follower or the blank template; given and taken away later
  assert.equal(run("add", "Nofollow", "--from", "SPECIES_BUDEW", "--no-follower").followers, 0);
  assert.equal(run("add", "Blankmon", "--blank").followers, 0);
  assert.ok(!readdirSync(join(scratch, FOLLOWERS)).some((name) => name.startsWith("nofollow") || name.startsWith("blankmon")));
  assert.match(refusal("follower", "SPECIES_BLANKMON", "--none"), /has no follower/);
  assert.equal(run("follower", "SPECIES_BLANKMON", "--from", "SPECIES_BUDEW").followers, 4);
  assert.deepEqual(followerCodes().slice(-4), ["OBJ_CODE_FOLLOWER_BLANKMON", "OBJ_CODE_FOLLOWER_BLANKMON_SHINY",
    "OBJ_CODE_FOLLOWER_BLANKMON_FEMALE", "OBJ_CODE_FOLLOWER_BLANKMON_FEMALE_SHINY"]);
  run("follower", "SPECIES_BLANKMON", "--none");
  assert.ok(!followerCodes().some((code) => code.includes("BLANKMON")));
  assert.match(refusal("follower", "SPECIES_BULBASAUR", "--none"), /original game's/);

  // a species' own dialogue file goes with it; another file naming its followers' codes stops its removal
  writeFileSync(join(scratch, "res/paperwhite2/following/dialogue/species/testpig.json"), "{\n}\n");
  const event = join(scratch, "res/paperwhite2/pokemon_center/uses_testpig.json");
  writeFileSync(event, '{ "sprite": "OBJ_CODE_FOLLOWER_TESTPIG_SHINY" }\n');
  run("remove", "SPECIES_BLANKMON");
  run("remove", "SPECIES_NOFOLLOW");
  assert.match(refusal("remove", "SPECIES_TESTPIG"), /still named in res\/paperwhite2\/pokemon_center\/uses_testpig\.json/);
  rmSync(event);
  const removed = run("remove", "SPECIES_TESTPIG");
  assert.ok(removed.removed.includes("res/paperwhite2/following/dialogue/species/testpig.json"));
  assert.ok(removed.removed.includes(`${FOLLOWERS}/testpig_female_shiny`));
  run("remove", "SPECIES_TESTONE");
  assert.deepEqual(state(), before);
});

test("retiring keeps the ID and frees the number; a retired ID is reused in place", () => {
  const before = state();
  const { nextId, numbers } = info();
  run("add", "Testone", "--from", "SPECIES_BUDEW", "--number", "900");
  run("add", "Testtwo", "--from", "SPECIES_BUDEW", "--number", "901");
  const original = readFileSync(join(scratch, "res/pokemon/testone/data.json"));
  run("retire", "SPECIES_TESTONE");
  assert.equal(JSON.parse(readFileSync(join(scratch, "res/pokemon/testone/data.json"), "utf8")).retired, true);
  assert.deepEqual(info().numbers, { ...numbers, 901: "Testtwo" });
  assert.match(refusal("retire", "SPECIES_TESTONE"), /already retired/);
  run("unretire", "SPECIES_TESTONE");
  assert.deepEqual(readFileSync(join(scratch, "res/pokemon/testone/data.json")), original);

  // While retired its number is free; taken meanwhile, bringing it back is refused
  run("retire", "SPECIES_TESTONE");
  run("number", "SPECIES_TESTTWO", "900");
  assert.match(refusal("unretire", "SPECIES_TESTONE"), /900 is Testtwo's/);
  run("number", "SPECIES_TESTTWO", "901");

  assert.match(refusal("reuse", "SPECIES_TESTTWO", "Testthree", "--from", "SPECIES_BUDEW"), /isn't retired/);
  const reused = run("reuse", "SPECIES_TESTONE", "Testfour", "--blank", "--number", "1500");
  assert.equal(reused.id, nextId);
  // the retired species' followers went with it (the blank template has none)
  assert.ok(!readdirSync(join(scratch, FOLLOWERS)).some((name) => name.startsWith("testone")));
  assert.ok(!followerCodes().some((code) => code.includes("TESTONE")));
  const lines = readFileSync(join(scratch, "generated/species.txt"), "utf8").trimEnd().split("\n");
  assert.deepEqual(lines.slice(-2), ["SPECIES_TESTFOUR", "SPECIES_TESTTWO"]);
  assert.ok(!readdirSync(join(scratch, "res/pokemon")).includes("testone"));
  assert.equal(JSON.parse(readFileSync(join(scratch, "res/pokemon/testfour/data.json"), "utf8")).retired, undefined);

  run("remove", "SPECIES_TESTTWO");
  run("remove", "SPECIES_TESTFOUR");
  assert.deepEqual(state(), before);
});

test("numbers and names the build would stop on are refused", () => {
  run("add", "Testone", "--from", "SPECIES_BUDEW", "--number", "900");
  try {
    assert.match(refusal("add", "Testtwo", "--from", "SPECIES_BUDEW", "--number", "900"), /900 is Testone's/);
    assert.match(refusal("add", "Testtwo", "--from", "SPECIES_BUDEW", "--number", "999"), /no number/);
    assert.match(refusal("add", "Testtwo", "--from", "SPECIES_BUDEW", "--number", "25"), /original game's/);
    assert.match(refusal("add", "Testtwo", "--from", "SPECIES_BUDEW", "--number", "10000"), /from 650 to 9999/);
    assert.match(refusal("add", "Testtwo", "--from", "SPECIES_BUDEW", "--number", "901", "--no-pokedex"), /no display number/);
    assert.match(refusal("add", "Testtwocore", "--from", "SPECIES_BUDEW"), /holds 10/);
    assert.match(refusal("add", "2estmon", "--from", "SPECIES_BUDEW"), /start with a letter/);
    assert.match(refusal("add", "Pikachu", "--from", "SPECIES_BUDEW"), /exists already/);
    assert.match(refusal("add", "Testtwo", "--from", "SPECIES_EGG"), /isn't a Pokémon species/);
    assert.match(refusal("number", "SPECIES_PIKACHU", "900"), /original game's/);
    assert.match(refusal("number", "SPECIES_TESTONE", "999"), /no number/);
    assert.equal(run("number", "SPECIES_TESTONE", "none", "--check").message, "Testone shows No. ???");
    assert.match(refusal("remove", "SPECIES_BUDEW"), /original game's/);
    // A species another file names (here Testone's evolution) can't be removed
    run("add", "Testtwo", "--from", "SPECIES_BUDEW");
    const path = join(scratch, "res/pokemon/testone/data.json");
    const data = readFileSync(path, "utf8");
    writeFileSync(path, data.replace('"evolutions": []', '"evolutions": [ { "method": "EVO_METHOD_LEVEL", "param": 30, "species": "SPECIES_TESTTWO" } ]'));
    assert.match(refusal("remove", "SPECIES_TESTTWO"), /still named in res\/pokemon\/testone\/data\.json/);
    writeFileSync(path, data);
    run("remove", "SPECIES_TESTTWO");
  } finally {
    run("remove", "SPECIES_TESTONE");
  }
});

test("a cry is mixed down, resampled to fit the game's buffer, and refused when too long", () => {
  const wav = (rate: number, seconds: number, channels: number) => {
    const frames = Math.round(rate * seconds);
    const out = Buffer.alloc(44 + frames * channels * 2);
    out.write("RIFF", 0); out.writeUInt32LE(36 + frames * channels * 2, 4); out.write("WAVEfmt ", 8);
    out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(channels, 22); out.writeUInt32LE(rate, 24);
    out.writeUInt32LE(rate * channels * 2, 28); out.writeUInt16LE(channels * 2, 32); out.writeUInt16LE(16, 34);
    out.write("data", 36); out.writeUInt32LE(frames * channels * 2, 40);
    for (let i = 0; i < frames * channels; i++) out.writeInt16LE(Math.round(8000 * Math.sin(i / 7)), 44 + i * 2);
    const path = join(scratch, `cry-${rate}-${seconds}-${channels}.wav`);
    writeFileSync(path, out);
    return path;
  };
  const stereo = run("cry", "SPECIES_BULBASAUR", wav(44100, 1.5, 2));
  assert.equal(stereo.check, true);
  assert.equal(stereo.rate, 13379);
  assert.match(stereo.message, /2 channels mixed down.*resampled from 44100 to 13379/);
  assert.ok(stereo.bytes! <= stereo.limit!);
  assert.equal(Buffer.from(stereo.preview!, "base64").subarray(0, 4).toString(), "RIFF");
  const kept = run("cry", "SPECIES_BULBASAUR", wav(22050, 0.8, 1));
  assert.equal(kept.rate, 22050);
  assert.match(refusal("cry", "SPECIES_BULBASAUR", wav(22050, 2.5, 1)), /buffer holds 23524 samples/);
});
