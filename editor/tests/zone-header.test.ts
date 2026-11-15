// The Overworld Editor's zone header section (src/modules/overworld/zoneHeader.ts) on the real res/field/zones/: every
// field of every zone file lands in a group (or in "Other"), a field edited through the document paths writes the file
// as the data tools do and validates, and the schema's optional fields can be added and left out again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileText, parseJson, setIn, type JsonMap } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { Python } from "../server/python.ts";
import { HEADER_GROUPS, headerLayout } from "../src/modules/overworld/zoneHeader.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const DIR = join(ROOT, "res/field/zones");
const schema = JSON.parse(readFileSync(join(DIR, "zone.schema.json"), "utf8")) as Schema;
const constants = new Map(Object.entries(new Python(ROOT).constants()));
const files = globSync("*.json", { cwd: DIR }).filter((f) => f !== "zone.schema.json");

const reachable = new Set(headerLayout(schema).flatMap((g) => g.fields.map((f) => f.key)));

test("every schema property is in the section", () => {
  for (const key of Object.keys(schema.properties ?? {})) if (key !== "$schema") assert.ok(reachable.has(key), key);
  // The groups name only fields the schema has
  for (const g of HEADER_GROUPS) for (const f of g.fields) assert.ok(schema.properties?.[f.key], `${f.key} is not in the schema`);
});

test("every field of every zone file is reachable in the section", () => {
  assert.ok(files.length > 600);
  for (const name of files) {
    const data = parseJson(readFileSync(join(DIR, name), "utf8")) as JsonMap;
    for (const key of data.keys()) if (key !== "$schema") assert.ok(reachable.has(key), `${name}: ${key}`);
  }
});

test("a header field edited writes the file byte for byte as the data tools do, and validates", () => {
  for (const name of ["abundant_shrine.json", ...files.slice(0, 40)]) {
    const text = readFileSync(join(DIR, name), "utf8");
    const data = parseJson(text);
    assert.equal(fileText(data), text, name);
    const edited = setIn(setIn(data, ["battle_bg"], 4), ["cycling"], false);
    assert.deepEqual(validate(edited, schema, constants), [], name);
    const again = fileText(edited);
    assert.equal(fileText(parseJson(again)), again);
    assert.equal(again.split("\n").length, text.split("\n").length, "only values change");
    // Changing it back gives the file again
    const back = setIn(setIn(parseJson(again), ["battle_bg"], (data as JsonMap).get("battle_bg") ?? 0), ["cycling"], (data as JsonMap).get("cycling") ?? false);
    assert.equal(fileText(back), text, name);
  }
});

test("an optional field is added and left out again, and a bad value is caught", () => {
  const data = parseJson(readFileSync(join(DIR, "abundant_shrine.json"), "utf8"));
  const optional = Object.keys(schema.properties ?? {}).filter((k) => k !== "$schema" && !schema.required?.includes(k));
  assert.ok(optional.includes("init_scripts") && optional.includes("flag11"));
  const added = setIn(data, ["flag11"], true);
  assert.deepEqual(validate(added, schema, constants), []);
  assert.equal(fileText(setIn(added, ["flag11"], undefined)), fileText(data));
  assert.equal(validate(setIn(data, ["battle_bg"], 99), schema, constants).length, 1);
  assert.equal(validate(setIn(data, ["bgm"], "SEQ_NOPE"), schema, constants).length > 0, true);
});
