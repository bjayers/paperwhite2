// The script language's round trip over every script of the game (editor/shared/scriptlang/,
// docs/paperwhite2/design/script-language.md): each block of each res/field/scripts/*.s translated to the language,
// printed and parsed back the same, translated back and put in its file's place, must run as the original does
// (equiv.ts). And conditions and blocks written by hand translate as written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseScript, printScript } from "../shared/scriptlang/lang.ts";
import { scriptBlocks, parseS } from "../shared/scriptlang/sfile.ts";
import { Names, compileScript, decompileBlock, labelUses, macroNames, replaceBlock, type RefCommand, type RefGlobal } from "../shared/scriptlang/translate.ts";
import { scriptDifference } from "../shared/scriptlang/equiv.ts";

const ROOT = join(import.meta.dirname, "../..");
const SCRIPTS = join(ROOT, "res/field/scripts");
const json = (path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const names = new Names(macroNames(readFileSync(join(ROOT, "include/asm/field_script.inc"), "utf8")),
  json("res/paperwhite2/scripts/commands.json").commands as RefCommand[], json("res/paperwhite2/scripts/globals.json").globals as RefGlobal[]);

test("each language name names one command", () => {
  const seen = new Map<string, string>();
  for (const [macro, name] of names.toLang) {
    assert.ok(!seen.has(name), `${name}: ${macro} and ${seen.get(name)}`);
    seen.set(name, macro);
    assert.equal(names.toMacro.get(name), macro);
  }
});

test("every script translates to the language and back, and runs the same", () => {
  const failures: string[] = [];
  let count = 0;
  for (const file of readdirSync(SCRIPTS).filter((f) => f.endsWith(".s")).sort()) {
    const text = readFileSync(join(SCRIPTS, file), "utf8");
    const lines = parseS(text);
    const uses = labelUses(lines);
    const taken = new Set(lines.filter((l) => l.kind === "label").map((l) => (l as { name: string }).name));
    for (const block of scriptBlocks(lines)) {
      count++;
      const where = `${file} script ${block.number}`;
      try {
        const script = decompileBlock(lines, block.start, block.end, block.number, names, uses);
        const printed = printScript(script);
        const parsed = parseScript(printed);
        const again = printScript(parsed);
        if (again !== printed) { failures.push(`${where}: prints differently once parsed`); continue; }
        const back = compileScript(parsed, block.label, names, new Set(taken));
        const rewritten = replaceBlock(text, block.start, block.end, back);
        const difference = scriptDifference(text, rewritten, block.label, names);
        if (difference) failures.push(`${where}: ${difference.message} (${JSON.stringify(difference.a)} / ${JSON.stringify(difference.b)})`);
      } catch (e) {
        failures.push(`${where}: ${(e as Error).message}`);
      }
    }
  }
  assert.ok(count > 3000, `only ${count} scripts`);
  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} of ${count} scripts`);
});

test("conditions and blocks written by hand translate as written", () => {
  const script = parseScript(`script 1 {
    lock_all();
    if (flag(513)) {
        se_play(SEQ_SE_MESSAGE);
    } else if (var(0x4060) >= 2 && flag(EVENT_FLAG_0x01ec) == 0 || 0x4061 == 1) {
        vm_halt();
    } else {
        goto L_x;
    }
L_x:
    unlock_all();
    var(0x4060) += 1;
    0x4061 = var(0x8000);
    wild_battle(74);
    random_item(5, ITEM_POTION);
}
`);
  assert.equal(script.body.length, 8);
  const out = compileScript(script, "Script_1", names, new Set());
  assert.deepEqual(out.slice(0, 7), ["Script_1:", "    ActorsPauseAll", "    VMStackPushFlag 513", "    VMStackPushConst 1",
    "    VMStackCmp CMP_EQ", "    VMJumpIf CMP_STACK, L_Script_1_1", "    SEPlay SEQ_SE_MESSAGE"]);
  assert.ok(out.includes("    VMStackCmp CMP_AND") && out.includes("    VMStackCmp CMP_OR"));
  assert.deepEqual(out.slice(-9), ["L_x:", "    ActorsUnpauseAll", "    WorkAdd 0x4060, 1", "    WorkGet 0x4061, 0x8000",
    "    WorkSetConst 0x8010, 74", "    RTCallGlobal 10854", "    WorkSetConst 0x8010, 5", "    WorkSetConst 0x8011, ITEM_POTION",
    "    RTCallGlobal 10853"]);
  // (as it prints: variables and flags as functions, a flag's test with its value)
  assert.match(printScript(script), /if \(flag\(513\) == 1\) \{/);
  assert.match(printScript(script), /var\(0x4060\) >= 2 && flag\(EVENT_FLAG_0x01ec\) == 0 \|\| var\(0x4061\) == 1/);
});
