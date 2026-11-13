// One-off: every side's flat rig converted to an armature bakes back to its file, byte for byte.
import { globSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { detectLayout, fileText, getIn, parseJson } from "../shared/json.ts";
import { dataOf, rigOf } from "../src/modules/rig/model.ts";
import { bake, convertToArmature } from "../src/modules/rig/armature.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const files = globSync("res/pokemon/**/*_rig.json", { cwd: ROOT }).filter((f) => !f.includes("/musical/"));
let bad = 0, n = 0;
const t0 = Date.now();
for (const file of files) {
  const text = readFileSync(join(ROOT, file), "utf8");
  const data = parseJson(text);
  const layout = detectLayout(text, data)!;
  const rig = rigOf(data);
  const source = JSON.parse(JSON.stringify(convertToArmature(rig)));
  const out = bake(source, rig);
  const again = fileText(dataOf(out.rig, getIn(data, ["$schema"])), layout);
  n++;
  if (again !== text || out.warnings.length) {
    bad++;
    if (bad < 6) {
      const a = text.split("\n"), b = again.split("\n");
      const i = a.findIndex((l, k) => l !== b[k]);
      console.log(file, out.warnings.slice(0, 2), i, a[i], "|", b[i]);
    }
  }
}
console.log(`${n} sides, ${bad} differ, ${Date.now() - t0} ms`);
