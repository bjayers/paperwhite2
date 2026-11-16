// A message's fit to the talk window (src/modules/text/message.ts, checkMessage and fitMessage, which DialogueField
// shows): lines too wide for the window, lines that scroll away before a wait, and fitting a message by breaking its
// lines at spaces and adding waits, its codes kept. (Over the game's script banks, the scroll check flags 226 of 13776
// messages, most of them shown in windows other than the talk window.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { TEXT_WIDTH, checkMessage, fitMessage, parseMessage } from "../src/modules/text/message.ts";

/** A font of 6-pixel letters: 38 to a line. */
const font = { glyph: () => ({ advance: 6 }) };
const lineWidth = (line: string) => parseMessage(line).filter((t) => t.kind === "char").length * 6;

test("lines that scroll away unread", () => {
  assert.deepEqual(checkMessage("One\nTwo\nThree", font).map((p) => p.message),
    ["Line 1 scrolls away before the player presses A: end line 1 or 2 with a wait ({be01})."]);
  // The game's way: a wait at the end of every second line, then two lines that scroll in
  assert.deepEqual(checkMessage("One\nTwo{be01}\nThree\nFour{be01}\nFive", font), []);
  // A new page empties the window
  assert.deepEqual(checkMessage("One\nTwo{be00}\nThree\nFour", font), []);
  assert.deepEqual(checkMessage("One{be01}\nTwo\nThree", font), []);
});

test("lines too wide for the window", () => {
  const long = "x".repeat(40);
  assert.equal(TEXT_WIDTH, 232);
  assert.deepEqual(checkMessage(`Hi\n${long}`, font).map((p) => p.message), ["Line 2 runs 8 pixels past the window's edge, which cuts it off."]);
  // Codes have no width; a word placeholder its sample's
  assert.deepEqual(checkMessage(`${"x".repeat(38)}{be01}`, font), []);
  assert.equal(checkMessage(`${"x".repeat(35)}{0100:0}`, font, { 0: "Rosa" }).length, 1);
  // No font: only the scrolling
  assert.deepEqual(checkMessage(long, null), []);
});

test("fitting a message to the window", () => {
  const text = "The nightmare grows stronger with every room you clear, and the forest remembers who you are. Turn back while you still can!";
  const fitted = fitMessage(text, font);
  assert.deepEqual(checkMessage(fitted, font), []);
  const lines = fitted.split("\n");
  assert.ok(lines.length > 2);
  for (const line of lines) assert.ok(lineWidth(line) <= TEXT_WIDTH, line);
  assert.equal(fitted.replace(/\{be01\}/g, "").replace(/\n/g, " "), text);
  // Codes and the waits already there are kept; a fitting message is left as it is
  assert.equal(fitMessage("One\nTwo{be01}\nThree", font), "One\nTwo{be01}\nThree");
  assert.equal(fitMessage("One\nTwo\nThree", font), "One\nTwo{be01}\nThree");
  assert.equal(fitMessage("{ff00:1}Red{ff00:0} words\nTwo\nThree", font), "{ff00:1}Red{ff00:0} words\nTwo{be01}\nThree");
  // The text files' form stays in it
  assert.equal(fitMessage("One\\nTwo\\nThree", font), "One\\nTwo{be01}\\nThree");
});
