// The Pokémon Editor lists every form under its species from res/pokemon's data (src/modules/pokemon/forms.ts):
// forms.count's forms, named from pokedex.forms, with or without a record of their own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formEvolutions, isOriginalForm, listSpecies, namesOfForms, type ListedFile } from "../src/modules/pokemon/forms.ts";

const POKEMON = fileURLToPath(new URL("../../res/pokemon/", import.meta.url));

function files(): ListedFile[] {
  const out: ListedFile[] = [];
  for (const folder of readdirSync(POKEMON)) {
    for (const name of existsSync(`${POKEMON}${folder}/data.json`) ? readdirSync(`${POKEMON}${folder}`) : []) {
      if (name === "data.json" || /^form_\d+\.json$/.test(name))
        out.push({ path: `res/pokemon/${folder}/${name}`, data: JSON.parse(readFileSync(`${POKEMON}${folder}/${name}`, "utf8")) });
    }
  }
  return out;
}

const numbers = new Map([["SPECIES_PICHU", 172], ["SPECIES_UNOWN", 201], ["SPECIES_CASTFORM", 351], ["SPECIES_ROTOM", 479]]);
const listed = listSpecies(files(), numbers);
const formsOf = (folder: string) => listed.filter((l) => l.folder === folder && l.form > 0);

test("every form is listed after its species, by its Pokédex name", () => {
  const pichu = listed.findIndex((l) => l.key === "pichu");
  assert.equal(listed[pichu + 1].key, "pichu#1");
  assert.equal(listed[pichu + 1].name, "Pichu: Spiky-eared");
  assert.equal(formsOf("unown").length, 27);
  assert.deepEqual(formsOf("castform").map((l) => l.name.split(": ")[1]), ["Sunny Form", "Rainy Form", "Snowy Form"]);
  assert.deepEqual(formsOf("rotom").slice(0, 5).map((l) => l.name.split(": ")[1]),
    ["Heat Rotom", "Wash Rotom", "Frost Rotom", "Fan Rotom", "Mow Rotom"]);
});

test("a form's record is found where it has one, and none where it is its species in data", () => {
  assert.equal(formsOf("pichu")[0].recordPath, null);
  assert.equal(formsOf("unown")[0].recordPath, null);
  assert.equal(formsOf("rotom")[0].recordPath, "res/pokemon/rotom/form_1.json");
  assert.equal(formsOf("castform")[2].recordPath, "res/pokemon/castform/form_3.json");
  // No form's record is listed as a species of its own
  assert.ok(listed.every((l) => l.form > 0 || l.speciesPath.endsWith("/data.json")));
  assert.ok(!listed.some((l) => l.key.includes("form_")));
});

test("the original game's forms are told from the hack's", () => {
  const original = { unown: 28, rotom: 6 };
  assert.ok(isOriginalForm(original, "rotom", 5));
  assert.ok(!isOriginalForm(original, "rotom", 6));
  assert.ok(!isOriginalForm(original, "pichu", 1));
  assert.ok(isOriginalForm(original, "pichu", 0));
});

test("a form takes its species' evolutions without a form and those for it, none if it can't evolve", () => {
  const pichu = listed.find((l) => l.key === "pichu#1")!;
  assert.deepEqual(pichu.formNames, ["Normal", "Spiky-eared"]);
  assert.deepEqual(pichu.noEvolution, [1]);
  assert.equal(formEvolutions(pichu, 1).length, 0);
  assert.deepEqual(formEvolutions(pichu, 0).map((e) => e.species), ["SPECIES_PIKACHU"]);
  // An Alolan Vulpix by an Ice Rock, a plain one by a Fire Stone (docs/paperwhite2/design/form-evolutions.md)
  const vulpix = {
    noEvolution: [],
    evolutions: [
      { method: "EVO_METHOD_ITEM", param: "ITEM_FIRE_STONE", species: "SPECIES_NINETALES", form: 0 },
      { method: "EVO_METHOD_LEVEL_ICE_ROCK", param: 0, species: "SPECIES_NINETALES", form: 1 },
      { method: "EVO_METHOD_LEVEL", param: 99, species: "SPECIES_NINETALES" },
    ],
  };
  assert.deepEqual(formEvolutions(vulpix, 0).map((e) => e.method), ["EVO_METHOD_ITEM", "EVO_METHOD_LEVEL"]);
  assert.deepEqual(formEvolutions(vulpix, 1).map((e) => e.method), ["EVO_METHOD_LEVEL_ICE_ROCK", "EVO_METHOD_LEVEL"]);
  assert.deepEqual(formEvolutions(vulpix, 2).map((e) => e.method), ["EVO_METHOD_LEVEL"]);
});

test("forms' names: form 0's form_name or the species' name, then pokedex.forms'", () => {
  assert.deepEqual(namesOfForms("Vulpix", undefined, 1), ["Vulpix"]);
  assert.deepEqual(namesOfForms("Vulpix", { forms: [{ name: "Alolan" }] }, 3), ["Vulpix", "Alolan", "Form 2"]);
  const rotom = listed.find((l) => l.key === "rotom")!;
  assert.equal(rotom.formNames.length, rotom.count);
});

test("added species list after Genesect in the Pokédex's order: by display number, unnumbered, out of it, then the rest", () => {
  const ids = new Map([["SPECIES_EGG", 650], ["SPECIES_GENESECT", 649], ["SPECIES_BULBASAUR", 1], ["SPECIES_POKESTAR_UFO", 652],
    ["SPECIES_APPLIN", 687], ["SPECIES_DIPPLIN", 688], ["SPECIES_FLAPPLE", 689], ["SPECIES_SECRET", 690], ["SPECIES_OLDMON", 691],
    ["SPECIES_NONAME", 692]]);
  const file = (folder: string, data: Record<string, unknown> = {}): ListedFile =>
    ({ path: `res/pokemon/${folder}/data.json`, data: { name: folder, forms: { count: 1 }, ...data } });
  const order = listSpecies([
    file("pokestar/ufo"), file("noname"), file("secret", { pokedex: false }), file("oldmon", { pokedex: { display_number: 900 }, retired: true }),
    file("dipplin", { pokedex: { display_number: 1011 } }), file("flapple", { pokedex: { display_number: 841 } }), file("applin"),
    file("genesect"), file("bulbasaur"),
  ], ids, [{ species: "SPECIES_APPLIN", number: 840, retired: false, pokedex: true }]);
  assert.deepEqual(order.map((l) => [l.folder, l.display]), [["bulbasaur", 1], ["genesect", 649], ["applin", 840], ["flapple", 841],
    ["dipplin", 1011], ["noname", null], ["secret", null], ["oldmon", null], ["pokestar/ufo", null]]);
  const oldmon = order.find((l) => l.folder === "oldmon")!;
  assert.deepEqual([oldmon.added, oldmon.retired, oldmon.inDex], [true, true, false]);
});

test("no form's record has evolutions of its own: the game reads its species' (tools/data/species_data.py)", () => {
  for (const f of files()) if (/form_\d+\.json$/.test(f.path)) assert.deepEqual(f.data.evolutions, [], f.path);
});
