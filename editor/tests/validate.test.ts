// The editor's validator agrees with the build's: every data file in res/, which the build accepts, has no errors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseJson, setIn } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { Project } from "../server/project.ts";
import { Python } from "../server/python.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const project = new Project(ROOT);
const constants = new Map(Object.entries(new Python(ROOT).constants()));

test("every data file passes the editor's validator", () => {
  const failures: string[] = [];
  for (const type of project.types()) {
    const schema = JSON.parse(readFileSync(project.abs(type.schema), "utf8")) as Schema;
    for (const entry of project.entries(type.schema)) {
      const errors = validate(parseJson(readFileSync(project.abs(entry.path), "utf8")), schema, constants);
      if (errors.length) failures.push(`${entry.path}: ${errors[0].path.join(".")}: ${errors[0].message}`);
    }
  }
  assert.deepEqual(failures.slice(0, 20), []);
});

test("it catches what the build would", () => {
  const schema = JSON.parse(readFileSync(project.abs("res/natures/nature.schema.json"), "utf8")) as Schema;
  const data = parseJson(readFileSync(project.abs("res/natures/adamant.json"), "utf8"));
  assert.deepEqual(validate(setIn(data, ["name"], 3), schema, constants).map((e) => e.message), ["3 is not string"]);
  assert.deepEqual(validate(setIn(data, ["colour"], "red"), schema, constants).map((e) => e.message), ["colour is not a field here"]);
  assert.deepEqual(validate(setIn(data, ["name"], undefined), schema, constants).map((e) => e.message), ["name is missing"]);
});
