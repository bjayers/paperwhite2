// Adding and removing a text bank's messages (src/modules/text/banks.ts): over every bank of res/text/, a message
// added after the last one and removed again gives the file back byte for byte, the new line is written as
// text_data.py writes an empty message, and its ID is new to the bank in the bank's style.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { appendMessage, lastMessage, messageNumber, newMessageId, parseBank, removeLastMessage, setMessage } from "../src/modules/text/banks.ts";

const ROOT = join(import.meta.dirname, "../..");
const banks = ["script", "system"].flatMap((dir) =>
  readdirSync(join(ROOT, "res/text", dir)).filter((f) => f.endsWith(".txt")).map((f) => `res/text/${dir}/${f}`));

test("adding a message and removing it gives every bank back", () => {
  assert.ok(banks.length > 100);
  for (const path of banks) {
    const text = readFileSync(join(ROOT, path), "utf8");
    const messages = parseBank(text);
    const name = path.slice(path.lastIndexOf("/") + 1, -4);
    const id = newMessageId(messages, name);
    assert.ok(!messages.some((m) => m.id === id), `${path}: ${id} is taken`);
    assert.match(id, /^\w+_Text_Empty(_\d+)?$/, path);
    const added = appendMessage(text, id);
    const after = parseBank(added.text);
    assert.equal(after.length, messages.length + 1, path);
    const line = after.find((m) => m.line === added.line)!;
    assert.deepEqual([line.id, line.text], [id, ""], path);
    // After every message line, before the padding line
    assert.equal(lastMessage(after)?.id, id, path);
    assert.ok(after.slice(added.line).every((m) => m.id === null && m.text.startsWith("\\pad{")), path);
    assert.equal(added.text.split("\n")[added.line - 1], `${id} =`, path);
    assert.equal(removeLastMessage(added.text), text, path);
  }
});

test("an empty message is written as text_data.py writes it", () => {
  const text = "Bank_Text_A = a\nBank_Text_B = b\n\\pad{7e}\n";
  assert.equal(setMessage(text, 2, ""), "Bank_Text_A = a\nBank_Text_B =\n\\pad{7e}\n");
  assert.equal(setMessage(text, 2, "x\ny"), "Bank_Text_A = a\nBank_Text_B = x\\ny\n\\pad{7e}\n");
});

test("new IDs follow the bank's style", () => {
  assert.equal(newMessageId(parseBank("Foo_Text_Hi = Hi\n"), "foo"), "Foo_Text_Empty");
  assert.equal(newMessageId(parseBank("Foo_Text_Empty =\nFoo_Text_Empty_2 =\n"), "foo"), "Foo_Text_Empty_3");
  assert.equal(newMessageId([], "castelia_city"), "CasteliaCity_Text_Empty");
  assert.equal(newMessageId([], "0405"), "Bank0405_Text_Empty");
});

test("a bank whose last line stands for many messages has none to remove", () => {
  const text = "Names_Text_Egg = Egg\n\\from{species.name}\n";
  assert.equal(lastMessage(parseBank(text)), null);
  assert.equal(removeLastMessage(text), null);
  assert.equal(messageNumber(parseBank(text), 1), null);
});

test("message numbers count the messages: Castelia's crowd lines start at 28", () => {
  const text = readFileSync(join(ROOT, "res/text/script/global_10350.txt"), "utf8");
  const messages = parseBank(text);
  const wooooo = messages.find((m) => m.id === "Global10350_Text_Wooooo")!;
  assert.equal(messageNumber(messages, wooooo.line), 28);
});
