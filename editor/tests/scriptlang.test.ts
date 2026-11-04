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
import { Names, compileScript, decompileBlock, labelUses, macroNames, replaceBlock, type RefCommand, type RefGlobal, type RefMovement } from "../shared/scriptlang/translate.ts";
import { scriptDifference } from "../shared/scriptlang/equiv.ts";
import { messageIds, messageTexts, scriptBank, valueContext } from "../shared/scriptlang/values.ts";
import { Python } from "../server/python.ts";

const ROOT = join(import.meta.dirname, "../..");
const SCRIPTS = join(ROOT, "res/field/scripts");
const constants = new Map(Object.entries(new Python(ROOT).constants()));
/** A file's values' context: the constants and its text bank's messages. */
const contextOf = (text: string) => {
  const bank = scriptBank(text);
  const bankText = bank ? readFileSync(join(ROOT, `res/text/script/${bank}.txt`), "utf8") : "";
  return valueContext(constants, messageIds(bankText), messageTexts(bankText));
};
const json = (path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const names = new Names(macroNames(readFileSync(join(ROOT, "include/asm/field_script.inc"), "utf8")),
  json("res/paperwhite2/scripts/commands.json").commands as RefCommand[], json("res/paperwhite2/scripts/globals.json").globals as RefGlobal[],
  json("res/paperwhite2/scripts/movements.json").movements as RefMovement[]);

/** The first line two texts differ at, each's. */
function firstDifference(a: string, b: string): string {
  const la = a.split("\n");
  const lb = b.split("\n");
  const at = la.findIndex((l, i) => l !== lb[i]);
  return `line ${at + 1}: ${JSON.stringify(la[at])} / ${JSON.stringify(lb[at])}`;
}

test("each language name names one command", () => {
  const seen = new Map<string, string>();
  for (const [macro, name] of names.toLang) {
    assert.ok(!seen.has(name), `${name}: ${macro} and ${seen.get(name)}`);
    seen.set(name, macro);
    assert.equal(names.toMacro.get(name), macro);
  }
});

test("every script translates to the language and back, runs the same and reopens the same", () => {
  const failures: string[] = [];
  let count = 0;
  for (const file of readdirSync(SCRIPTS).filter((f) => f.endsWith(".s")).sort()) {
    const text = readFileSync(join(SCRIPTS, file), "utf8");
    const lines = parseS(text);
    const uses = labelUses(lines);
    const ctx = contextOf(text);
    for (const block of scriptBlocks(lines)) {
      // (the labels outside the block, as the editor's Apply gives them)
      const taken = new Set(lines.flatMap((l, i) => (l.kind === "label" && (i < block.start || i >= block.end) ? [l.name] : [])));
      count++;
      const where = `${file} script ${block.number}`;
      try {
        const script = decompileBlock(lines, block.start, block.end, block.number, names, uses, ctx);
        const printed = printScript(script);
        const parsed = parseScript(printed);
        const again = printScript(parsed);
        if (again !== printed) { failures.push(`${where}: prints differently once parsed`); continue; }
        const back = compileScript(parsed, block.label, names, new Set(taken), ctx);
        const rewritten = replaceBlock(text, block.start, block.end, back);
        const difference = scriptDifference(text, rewritten, block.label, names, ctx);
        if (difference) { failures.push(`${where}: ${difference.message} (${JSON.stringify(difference.a)} / ${JSON.stringify(difference.b)})`); continue; }
        // (and reopened, it reads as it did)
        const newLines = parseS(rewritten);
        const newBlock = scriptBlocks(newLines).find((b) => b.number === block.number)!;
        const reopened = printScript(decompileBlock(newLines, newBlock.start, newBlock.end, block.number, names, labelUses(newLines), ctx));
        if (reopened !== printed) failures.push(`${where}: reopens differently: ${firstDifference(printed, reopened)}`);
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
    say(VirbankCity_Text_Hello);
    say_npc(2, VirbankCity_Text_Hello, 4);
}
`);
  assert.equal(script.body.length, 10);
  const out = compileScript(script, "Script_1", names, new Set());
  assert.deepEqual(out.slice(0, 7), ["Script_1:", "    ActorsPauseAll", "    VMStackPushFlag 513", "    VMStackPushConst 1",
    "    VMStackCmp CMP_EQ", "    VMJumpIf CMP_STACK, L_Script_1_1", "    SEPlay SEQ_SE_MESSAGE"]);
  assert.ok(out.includes("    VMStackCmp CMP_AND") && out.includes("    VMStackCmp CMP_OR"));
  assert.deepEqual(out.slice(-15), ["L_x:", "    ActorsUnpauseAll", "    WorkAdd 0x4060, 1", "    WorkGet 0x4061, 0x8000",
    "    WorkSetConst 0x8010, 74", "    RTCallGlobal 10854", "    WorkSetConst 0x8010, 5", "    WorkSetConst 0x8011, ITEM_POTION",
    "    RTCallGlobal 10853", "    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_Hello, 0, 0", "    LastKeyWait", "    ActorMsgClose",
    "    ActorMsg MSGFILE_SCRIPT, VirbankCity_Text_Hello, 2, 4, 0", "    LastKeyWait", "    ActorMsgClose"]);
  // (as it prints: variables and flags as functions, a flag's test with its value)
  assert.match(printScript(script), /if \(flag\(513\) == 1\) \{/);
  assert.match(printScript(script), /var\(0x4060\) >= 2 && flag\(EVENT_FLAG_0x01ec\) == 0 \|\| var\(0x4061\) == 1/);
});

test("lines, flags, species and variables written as numbers are stored by name, and show as numbers", () => {
  const text = readFileSync(join(SCRIPTS, "virbank_city.s"), "utf8");
  const ctx = contextOf(text);
  const script = parseScript(`script 1 {
    say(2);
    set_flag(492);
    if (flag(492) == 0 && var(0x40ac) == 1) {
        wild_battle(74);
    }
}
`);
  const out = compileScript(script, "Script_1", names, new Set(), ctx);
  assert.ok(out.includes("    ParentActorMsg MSGFILE_SCRIPT, VirbankCity_Text_CaptainOhDearDaughter, 0, 0"));
  // (with the message's text over it, as a comment)
  assert.ok(out.some((l) => l.startsWith('    // "Captain: Oh, dear daughter.')));
  assert.ok(out.includes("    FlagSet EVENT_FLAG_0x01ec"));
  assert.ok(out.includes("    VMStackPushFlag EVENT_FLAG_0x01ec"));
  assert.ok(out.includes("    VMStackPush EVENT_WORK_0x40ac"));
  assert.ok(out.includes("    WorkSetConst 0x8010, SPECIES_GEODUDE"));
  // And back as the numbers
  const lines = parseS(["#include \"asm/field_script.inc\"", "    ScriptEntry Script_1", ...out].join("\n"));
  const back = decompileBlock(lines, 2, lines.length, 1, names, labelUses(lines), ctx);
  assert.match(printScript(back), /say\(2\);\n {4}set_flag\(492\);\n {4}if \(flag\(492\) == 0 && var\(0x40ac\) == 1\) \{\n {8}wild_battle\(74\);/);
});

test("movements: one a command alone runs goes in it, a shared one is named, and both go back as Move lines", () => {
  const script = parseScript(`script 1 {
    apply_movement(1, [walk_left(3), face_up]);
    wait_movement();
    apply_movement(2, Shared);
    apply_movement(3, Shared);
    end();
    movement Shared = [
        jump_in_place_down,
        emote_exclamation,
    ];
}
`);
  const out = compileScript(script, "Script_1", names, new Set());
  assert.ok(out.includes("    ActorCmdExec 1, Movement_Script_1_1"));
  assert.deepEqual(out.slice(out.indexOf("Shared:"), out.indexOf("Shared:") + 4), ["Shared:", "    Move 49, 1", "    Move 75, 1", "    MoveEnd"]);
  const at = out.indexOf("Movement_Script_1_1:");
  assert.deepEqual(out.slice(at - 1, at + 4), ["    .balign 4, 0", "Movement_Script_1_1:", "    Move 14, 3", "    Move 0, 1", "    MoveEnd"]);
  // (no pad after data, which is an even length: one goes straight after the script's end)
  assert.equal(out[out.length - 1], "    MoveEnd");
  // And back
  const lines = parseS(["#include \"asm/field_script.inc\"", "    ScriptEntry Script_1", ...out].join("\n"));
  const printed = printScript(decompileBlock(lines, 2, lines.length, 1, names, labelUses(lines)));
  assert.match(printed, /apply_movement\(1, \[walk_left\(3\), face_up\]\);/);
  assert.match(printed, /movement Shared = \[jump_in_place_down, emote_exclamation\];/);
  assert.throws(() => compileScript(parseScript("script 1 {\n    apply_movement(1, [fly_backwards]);\n    end();\n}\n"), "Script_1", names, new Set()), /no movement fly_backwards/);
});

test("subs and aliases: a routine by its name after the script, a variable and a flag named for the file", () => {
  const written = `script 1 {
    alias talked = var(0x4060);
    alias got_it = flag(510);
    if (got_it == 0) {
        talked += 1;
        step_aside();
    }
    end();
}

sub step_aside {
    apply_movement(2, [walk_left, face_right]);
    wait_movement();
    return();
}
`;
  const script = parseScript(written);
  assert.equal(printScript(script), written);
  const out = compileScript(script, "Script_1", names, new Set());
  for (const line of ["    //@ alias talked = var(0x4060)", "    VMStackPushFlag 510", "    WorkAdd 0x4060, 1", "    VMCall step_aside", "step_aside:", "    VMReturn"]) {
    assert.ok(out.includes(line), line);
  }
  // Read back from the .s: the same script
  const lines = parseS(["    ScriptEntry Script_1", "", ...out].join("\n"));
  assert.equal(printScript(decompileBlock(lines, 2, lines.length, 1, names, labelUses(lines))), written);
  // (an alias another script of the file wrote names its variable here too)
  const other = compileScript(parseScript("script 2 {\n    talked = 3;\n    end();\n}\n"), "Script_2", names, new Set(), undefined, new Map([["talked", "var(0x4060)"]]));
  assert.ok(other.includes("    WorkSetConst 0x4060, 3"));
  assert.throws(() => compileScript(parseScript("script 1 {\n    goto L;\n}\n\nsub x {\n    end();\n}\n"), "Script_1", names, new Set(["x"])), /label of that name/);
  assert.throws(() => compileScript(parseScript("script 1 {\n    lock_all();\n}\n\nsub x {\n    end();\n}\n"), "Script_1", names, new Set()), /must end/);
});

test("menus and switches: a menu's setup, options and show, and an if's else ifs on one variable, as written", () => {
  const written = `script 1 {
    menu(31, 1, 0, 1, var(0x8010)) {
        option(39, 0);
        option(40, 41, 1);
    }
    switch (var(0x8010)) {
        case 0 {
            set_flag(513);
        }
        case 1 {
        }
        else {
            unlock_all();
        }
    }
    end();
}
`;
  const script = parseScript(written);
  assert.equal(printScript(script), written);
  const ctx = valueContext(constants, []);
  const out = compileScript(script, "Script_1", names, new Set(), ctx);
  assert.deepEqual(out.slice(1, 5), ["    ListMenuAnchorTopRight 31, 1, 0, 1, 0x8010", "    ListMenuAdd 39, 65535, 0", "    ListMenuAdd 40, 41, 1", "    ListMenuShow"]);
  // Read back from the .s: the same script, the empty case and all
  const lines = parseS(["    ScriptEntry Script_1", "", ...out].join("\n"));
  assert.equal(printScript(decompileBlock(lines, 2, lines.length, 1, names, labelUses(lines), ctx)), written);
  assert.throws(() => parseScript("script 1 {\n    switch (var(0x8010)) {\n    }\n}\n"), /a case at least/);
});
