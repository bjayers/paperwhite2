// The Pokémon Editor lists every form under its species from res/pokemon's data (src/modules/pokemon/forms.ts):
// forms.count's forms, named from pokedex.forms, with or without a record of their own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isOriginalForm, listSpecies, type ListedFile } from "../src/modules/pokemon/forms.ts";

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
