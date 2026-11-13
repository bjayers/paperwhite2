// Add Pokémon's tool (tools/paperwhite2/pokemon_species.py), as the Pokémon Editor calls it through the server: adding
// and removing species leaves generated/species.txt, services.json and res/pokemon as they were, byte for byte;
// retiring keeps the ID and frees the display number; numbers and names are refused as the build would; a retired ID
// is reused in place; a cry is checked and converted. It runs in a scratch checkout (the tools and generated/ copied,
// res/'s folders linked, the folders it writes copied), so the real res/ is only read.
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
  // res/ linked folder by folder, down to the files the tool writes: res/pokemon/<new>/, services.json
  const linkAll = (from: string, to: string, keep: Record<string, ((a: string, b: string) => void) | null>) => {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) {
      if (name in keep) keep[name]?.(join(from, name), join(to, name));
      else symlinkSync(join(from, name), join(to, name));
    }
  };
  linkAll(join(ROOT, "res"), join(dir, "res"), {
    pokemon: (a, b) => linkAll(a, b, {}),
    paperwhite2: (a, b) => linkAll(a, b, {
      pokemon_center: (c, d) => linkAll(c, d, { "services.json": (e, f) => cpSync(e, f) }),
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
const state = () => ({
  species: readFileSync(join(scratch, "generated/species.txt")),
  services: readFileSync(join(scratch, "res/paperwhite2/pokemon_center/services.json")),
  folders: readdirSync(join(scratch, "res/pokemon")).sort().join(","),
});

before(() => { scratch = scratchCheckout(); });
after(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }); });

test("adding species and removing them again leaves every file as it was", () => {
  const before = state();
  const dry = run("add", "Applin", "--from", "SPECIES_BUDEW", "--number", "840", "--check");
  assert.equal(dry.check, true);
  assert.ok(dry.changed.includes("generated/species.txt") && dry.changed.includes("res/pokemon/applin/data.json"));
  assert.deepEqual(state(), before, "a dry run writes nothing");

  const applin = run("add", "Applin", "--from", "SPECIES_BUDEW", "--number", "840");
  assert.equal(applin.id, 687);
  assert.match(readFileSync(join(scratch, "generated/species.txt"), "utf8"),
    /SPECIES_PAPERWHITE2_RESERVED_685\nSPECIES_PAPERWHITE2_RESERVED_686\nSPECIES_APPLIN\n$/);
  const data = JSON.parse(readFileSync(join(scratch, "res/pokemon/applin/data.json"), "utf8"));
  assert.equal(data.name, "Applin");
  assert.equal(data.pokedex.display_number, 840);
  assert.deepEqual(data.pokedex.languages, {});
  assert.deepEqual(data.evolutions, []);
  assert.equal(data.baby_species, "SPECIES_APPLIN");
  assert.equal(data.art_template, "SPECIES_BUDEW");
  assert.deepEqual(readFileSync(join(scratch, "res/pokemon/applin/cry.wav")), readFileSync(join(ROOT, "res/pokemon/budew/cry.wav")));

  assert.equal(run("add", "Secret", "--blank", "--no-pokedex").id, 688);
  assert.equal(run("add", "Thirdmon", "--from", "SPECIES_APPLIN", "--no-wonder-trade").id, 689);
  const listed = info();
  assert.deepEqual(listed.species.map((s) => [s.species, s.number, s.pokedex, s.last]),
    [["SPECIES_APPLIN", 840, true, false], ["SPECIES_SECRET", null, false, false], ["SPECIES_THIRDMON", null, true, true]]);
  assert.equal(listed.species[0].cryCopyOf, "Budew");
  // a copy of an added species takes its art template
  assert.equal(JSON.parse(readFileSync(join(scratch, "res/pokemon/thirdmon/data.json"), "utf8")).art_template, "SPECIES_BUDEW");
  assert.ok(readFileSync(join(scratch, "res/paperwhite2/pokemon_center/services.json"), "utf8").includes("SPECIES_THIRDMON"));

  assert.match(refusal("remove", "SPECIES_APPLIN"), /Only the last added species/);
  run("remove", "SPECIES_THIRDMON");
  run("remove", "SPECIES_SECRET");
  const last = run("remove", "SPECIES_APPLIN");
  assert.match(last.message, /reserved IDs/);
  assert.deepEqual(state(), before);
});

test("retiring keeps the ID and frees the number; a retired ID is reused in place", () => {
  const before = state();
  run("add", "Applin", "--from", "SPECIES_BUDEW", "--number", "840");
  run("add", "Flapple", "--from", "SPECIES_BUDEW", "--number", "841");
  const original = readFileSync(join(scratch, "res/pokemon/applin/data.json"));
  run("retire", "SPECIES_APPLIN");
  assert.equal(JSON.parse(readFileSync(join(scratch, "res/pokemon/applin/data.json"), "utf8")).retired, true);
  assert.deepEqual(info().numbers, { 841: "Flapple" });
  assert.match(refusal("retire", "SPECIES_APPLIN"), /already retired/);
  run("unretire", "SPECIES_APPLIN");
  assert.deepEqual(readFileSync(join(scratch, "res/pokemon/applin/data.json")), original);

  // While retired its number is free; taken meanwhile, bringing it back is refused
  run("retire", "SPECIES_APPLIN");
  run("number", "SPECIES_FLAPPLE", "840");
  assert.match(refusal("unretire", "SPECIES_APPLIN"), /840 is Flapple's/);
  run("number", "SPECIES_FLAPPLE", "841");

  assert.match(refusal("reuse", "SPECIES_FLAPPLE", "Appletun", "--from", "SPECIES_BUDEW"), /isn't retired/);
  const reused = run("reuse", "SPECIES_APPLIN", "Dipplin", "--blank", "--number", "1011");
  assert.equal(reused.id, 687);
  const lines = readFileSync(join(scratch, "generated/species.txt"), "utf8").trimEnd().split("\n");
  assert.deepEqual(lines.slice(-2), ["SPECIES_DIPPLIN", "SPECIES_FLAPPLE"]);
  assert.ok(!readdirSync(join(scratch, "res/pokemon")).includes("applin"));
  assert.equal(JSON.parse(readFileSync(join(scratch, "res/pokemon/dipplin/data.json"), "utf8")).retired, undefined);

  run("remove", "SPECIES_FLAPPLE");
  run("remove", "SPECIES_DIPPLIN");
  assert.deepEqual(state(), before);
});

test("numbers and names the build would stop on are refused", () => {
  run("add", "Applin", "--from", "SPECIES_BUDEW", "--number", "840");
  try {
    assert.match(refusal("add", "Flapple", "--from", "SPECIES_BUDEW", "--number", "840"), /840 is Applin's/);
    assert.match(refusal("add", "Flapple", "--from", "SPECIES_BUDEW", "--number", "999"), /no number/);
    assert.match(refusal("add", "Flapple", "--from", "SPECIES_BUDEW", "--number", "25"), /original game's/);
    assert.match(refusal("add", "Flapple", "--from", "SPECIES_BUDEW", "--number", "10000"), /from 650 to 9999/);
    assert.match(refusal("add", "Flapple", "--from", "SPECIES_BUDEW", "--number", "841", "--no-pokedex"), /no display number/);
    assert.match(refusal("add", "Flapplecore", "--from", "SPECIES_BUDEW"), /holds 10/);
    assert.match(refusal("add", "2pple", "--from", "SPECIES_BUDEW"), /start with a letter/);
    assert.match(refusal("add", "Pikachu", "--from", "SPECIES_BUDEW"), /exists already/);
    assert.match(refusal("add", "Flapple", "--from", "SPECIES_EGG"), /isn't a Pokémon species/);
    assert.match(refusal("number", "SPECIES_PIKACHU", "840"), /original game's/);
    assert.match(refusal("number", "SPECIES_APPLIN", "999"), /no number/);
    assert.equal(run("number", "SPECIES_APPLIN", "none", "--check").message, "Applin shows No. ???");
    assert.match(refusal("remove", "SPECIES_BUDEW"), /original game's/);
    // A species another file names (here Applin's evolution) can't be removed
    run("add", "Flapple", "--from", "SPECIES_BUDEW");
    const path = join(scratch, "res/pokemon/applin/data.json");
    const data = readFileSync(path, "utf8");
    writeFileSync(path, data.replace('"evolutions": []', '"evolutions": [ { "method": "EVO_METHOD_LEVEL", "param": 30, "species": "SPECIES_FLAPPLE" } ]'));
    assert.match(refusal("remove", "SPECIES_FLAPPLE"), /still named in res\/pokemon\/applin\/data\.json/);
    writeFileSync(path, data);
    run("remove", "SPECIES_FLAPPLE");
  } finally {
    run("remove", "SPECIES_APPLIN");
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
