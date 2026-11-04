# A C-like language for the field scripts (proposal, 2026-11-04)

The field scripts (`res/field/scripts/<file>.s`) are lists of the script engine's commands, one a line (macros of
`include/asm/field_script.inc`, numbered by `tools/script/field_commands.json`), with labels and jumps for control
flow. The user knows Frost's Gen 5 Editor's script syntax (C-like calls, its names for the commands) and wants to write
scripts in something close to it, with real control flow.

## What it is

A small C-like language that the editor translates to and from a script's block in its `.s` file:

- **The `.s` stays the source.** The Script Editor shows a script in the language (translated from its block); saving
  translates it back and replaces that block only. The build doesn't change; scripts not touched stay as they are.
- **Round trip.** A test translates every script of every file to the language and back and requires the same lines.
  What the translator can't express cleanly stays a raw block of command lines, so nothing is lost.
- **Names.** Frost's names for the commands (from his `FrostScriptCommandsBW2.h`, aligned with the command numbers:
  his list follows them in order, anchored by its `c0xNN` entries, checked against each command's argument count and
  handler), the macros' own names, and the commands he left unnamed under both `c0xNN` and the macro's name.
- **Control flow.** `if` / `else if` / `else`, `while`, `break`, any brace style; `goto` and labels still work.
  Conditions: `flag(F)`, `!flag(F)`, `var(V) == n` (and the other comparisons, and `var(V) == var(W)`), `&&`, `||`.
  They compile to the stack pushes, `VMStackCmp` and `VMJumpIf` the game's scripts use (whose jump is taken when the
  comparison is false), and back.
- **Routines without numbers.** `sub Name { ... }` in the same file: a label the scripts call (`Name();`, `VMCall`) and
  return from (`VMReturn`), with no `ScriptEntry`, so no script is renumbered.
- **Text by line number.** A message names its line in the zone's text file (`Message(0, 52, 2, 0, 0)`); saving writes
  the line's message id (`VirbankCity_Text_...`). The sidebar shows the line under the cursor in the talk window's
  preview, and a button opens the text file beside the script.
- **Named globals.** One file, in the language, names the user's global scripts and the variables they read and set:
  `global RandomItem(first = 0x8011, count = 0x8010) = 10853;` (result in 0x8012), `global WildBattle(species = 0x8010)
  = 10854;`. A call sets the variables and calls the global; existing calls read back as the names.
- **Later:** movements inline (`ApplyMovement(1, { WalkUp(2), FaceLeft() })`), menus as a `switch` on the choice.

## The user's global scripts

- 10853 (`global_10850.s`, Script_4): a random item, `0x8011` plus a random number below `0x8010`, given if the bag has
  room; `0x8012` is 1 when given, 0 when not.
- 10854 (Script_5): a wild battle with `0x8010`'s species at four fifths of the lead's level (rounded down to fives);
  `0x8012` is 1, 2 or 3 by the result; a loss blacks out.

## Order

1. The translator both ways (TypeScript in `editor/shared/`), with the whole-game round trip test.
2. The names: Frost's, the macros', the globals' file.
3. The Script Editor's language view, with the text sidebar and window.
4. Movements inline and menus.
