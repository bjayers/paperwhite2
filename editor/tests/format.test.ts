// Every JSON file in res/ reads and writes back byte for byte, in one of the known layouts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { globSync } from "node:fs";
import { detectLayout, parseJson, pythonFloat } from "../shared/json.ts";

const ROOT = resolve(import.meta.dirname, "../..");

test("Python's float repr", () => {
  assert.equal(pythonFloat(3), "3.0");
  assert.equal(pythonFloat(4.8000001697801054e-5), "4.8000001697801054e-05");
  assert.equal(pythonFloat(1e16), "1e+16");
  assert.equal(pythonFloat(0.0001), "0.0001");
  assert.equal(pythonFloat(-296.953125), "-296.953125");
});

test("every res/ JSON file round-trips", () => {
  const files = globSync("res/**/*.json", { cwd: ROOT });
  const unknown: string[] = [];
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    if (detectLayout(text, parseJson(text)) === null) unknown.push(file);
  }
  // Schemas are written by hand, as are a few data files without one; the editor edits those as text.
  const data = unknown.filter((file) => !file.endsWith(".schema.json") && readFileSync(join(ROOT, file), "utf8").includes('"$schema"'));
  assert.ok(files.length > 20000);
  assert.deepEqual(data, [], "data files that wouldn't be written back as they are");
});
