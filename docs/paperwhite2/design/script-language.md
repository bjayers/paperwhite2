# A C-like language for the field scripts (agreed 2026-11-04)

The field scripts (`res/field/scripts/<file>.s`) are lists of the script engine's commands, one a line (macros of
`include/asm/field_script.inc`, numbered by `tools/script/field_commands.json`), with labels and jumps for control
flow. The user knows Frost's Gen 5 Editor's script syntax (C-like calls, its names for the commands) and wants to write
scripts in something close to it, with real control flow.

## What it is

A small C-like language that the editor translates to and from a script's block in its `.s` file:

- **The `.s` stays the source.** The Script Editor shows a script in the language (translated from its block); saving
  translates it back and replaces that block only: every other line of the file stays as it was, byte for byte, and a
  new script adds its ScriptEntry and its block at the end. The build doesn't change. Before writing, the save
  translates the new block back to the language and checks it reads as the user wrote it; where it doesn't, it
  writes nothing and says what differs (the user's worry from Frost's, which reimported whole files and sometimes
  rewrote scripts it shouldn't have).
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
- **Text by line number.** A message names its line in the zone's text file (`say(52)`, `message(0, 52, 2, 0, 0)`); saving writes
  the line's message id (`VirbankCity_Text_...`). The sidebar shows the line under the cursor in the talk window's
  preview, and a button opens the text file beside the script.
- **Named globals.** One file, in the language, names the user's global scripts and the variables they read and set:
  `global random_item(first = 0x8011, count = 0x8010) = 10853;` (result in 0x8012), `global wild_battle(species =
  0x8010) = 10854;`. A call sets the variables and calls the global; existing calls read back as the names.
- **Later:** movements inline (`move(1, walk_up(2), face_left)`), menus as a `switch` on the choice.

## The user's choices (2026-11-04)

From three options (Frost's names in C style; lowercase with shortcuts; fewer parentheses) the user chose the second:

```c
script 3 {
    lock_all();
    face_player();
    if (flag(1210)) {
        say(14);
    } else if (0x4060 >= 2) {
        say(12);
        wild_battle(74);
        if (0x8012 == 1) {
            set_flag(1210);
            step_aside();
        }
    } else {
        say(10);
        0x4060 += 1;
    }
    unlock_all();
    end();
}

sub step_aside {
    move(2, walk_left(1), face_right);
    wait_move();
}
```

- **Names:** lowercase with underscores, Frost's names where he has them (`LockAll` is `lock_all`), the macros' and
  the `c0xNN` ones too. Every command keeps its full form with all its arguments.
- **Variables and flags as functions** (the user, 2026-11-04): `var(0x4060)` and `flag(510)`, in conditions
  (`if (var(0x8008) == 1)`, `if (flag(510) == 1)`, `== 0` for one that's off) and in the arguments the command
  reference says take a variable or a flag. A hex number from 0x4000 alone still reads as a variable, as the engine
  reads any argument from 0x4000 up (`ScriptReadAny`), and `flag(510)` alone as its test. `alias hiker_talks =
  0x4060;` names one for the file.
- **Numbers for species and flags:** `wild_battle(74)`, `set_flag(513)`. Saving writes the constant's name where the
  `.s` has one (`SPECIES_GEODUDE`, `EVENT_FLAG_...`), so the round trip stays exact; this needs each argument's kind
  (flag, variable, species, item, move, message line, actor, ...), which the command reference gives.
- **Messages:** `say(line)` shows the talk window of the NPC talked to, waits for a key and closes it; a variant for
  each window style Frost had:

  | Frost | Command | Shortcut |
  | --- | --- | --- |
  | Message2 | `ParentActorMsg` | `say(line)` |
  | Message | `ActorMsg` | `say_npc(npc, line)` |
  | EventGreyMessage | `SystemMsg` | `say_event(line)` |
  | BubbleMessage | `InfoMsg` | `say_bubble(line)` |
  | BorderedMessage | `MsgPlaceSign` | `say_sign(line)` |
  | AngryMessage | `ScreamMsg` | `say_yell(line)` |
  | CheckerMessage | `CheckerMsg` | `say_checker(line, x, y)` |
  | ShowMessageAt | `MultiMsg` | `say_at(line, x, y)` |
  | GenderedMessage, VersionMessage | `ActorMsgGendered`, `ActorMsgVersioned` | `say_gendered(male, female)`, `say_versioned(white, black)` |

  Each shortcut is the sequence the game's scripts use for that window (found from the scripts themselves), so
  existing scripts read back as the shortcuts.
- **The sidebar,** for what's under the cursor:
  - a message line: its text in the talk window's preview, editable, and a button that opens the text file beside;
  - a species number: its name and sprite;
  - a flag or a variable: its constant, the user's note for it (kept in a file the editor writes), and every script
    that sets or checks it;
  - a command: what it does and what each argument is, from the command reference (Frost's comments, the handler's
    name, and our own notes);
  - an argument: every choice of its kind, searchable, one click to put it in (the user, 2026-11-04: in Frost's the
    choices could only be guessed or learned from other scripts): the sounds (`SEQ_SE_*`, `SEQ_BGM_*`, with a play
    button where the editor can play them), the movements' actions by name, flags, variables, species, items, moves,
    zones, directions, the windows' positions and box types; and the same as completions while typing.
- **The command reference** is a file of the language's names: each command's name, aliases, what it does, and each
  argument's name, kind and meaning. It starts from Frost's header and the game's handlers, and grows as commands are
  learned.

## Saving, reopening and restoring (the user, 2026-11-04)

- **Reopening** a saved script translates it from its block again, which the save's checks make read as it was
  written, but tidied (brace style, spacing; a flag alone as `flag(510) == 1`). Comments and blank lines are kept in
  the `.s`; what the `.s` has no place for (an `alias`) is kept as a comment line in the block (`//@ alias name =
  0x4060`). No second copy of the script is kept: two sources would come to disagree.
- **Checks before writing**, either failing writes nothing and shows the difference:
  1. the new block translated back reads as the user's script (printed the same);
  2. the new block runs as the user's script compiles, walked by `equiv.ts`.
- **Restore** a script: to the original game's (its block in the `w2-original` tag's file, for a script the original
  file has), or to the last commit's (its block at `HEAD`). Text lines restore the same way from the Text Editor.

## The user's global scripts

- 10853 (`global_10850.s`, Script_4): a random item, `0x8011` plus a random number below `0x8010`, given if the bag has
  room; `0x8012` is 1 when given, 0 when not.
- 10854 (Script_5): a wild battle with `0x8010`'s species at four fifths of the lead's level (rounded down to fives);
  `0x8012` is 1, 2 or 3 by the result; a loss blacks out.

## Progress

- **2026-11-04, the translator** (`editor/shared/scriptlang/`: `sfile.ts` reads a `.s` file into lines and script
  blocks, `lang.ts` is the language's syntax tree, printer and parser, `translate.ts` translates a block to the
  language and back, `equiv.ts` checks that two files run a script the same). Every script of the game (4051) goes to
  the language, prints and parses back the same, goes back to lines in its file's place and runs as the original
  (`editor/tests/scriptlang.test.ts`). The original's jumps become if, else and else if: across the game, 7328 ifs
  and 434 gotos are left of the 8775 jumps; the labels left are those a command names (a routine, a movement) or more
  than one structure jumps to. Commands still carry the macros' names in lowercase (`actor_msg`); Frost's names, the
  shortcuts and the numbers come next.
- **2026-11-04, the names.** The command reference, `res/paperwhite2/scripts/commands.json` (`commands.schema.json`),
  905 commands: each one's number, macro, language name (Frost's in lowercase where he named it, 278 of them, else the
  macro's), the macro's name as an alias, Frost's name, its handler, Frost's description, and each argument's name
  (Frost's where he gave one), type (the command table's) and kind (from Frost's argument names and a few by hand).
  Frost's list was lined up with the command numbers between his `c0xNN` anchors by argument count and the words his
  name shares with the handler's (his list skips numbers without saying). The named globals,
  `res/paperwhite2/scripts/globals.json` (`globals.schema.json`): `random_item(count, first)` (10853) and
  `wild_battle(species)` (10854), read back where a script sets their inputs just before the call. The variable
  commands read as assignments: `var(0x4060) = 2` (WorkSetConst), `= var(0x8000)` (WorkGet), `+= -= *= /= %=`
  (WorkAdd and the rest). An argument the command reads as a variable shows as `var(...)`. Still all 4051 scripts
  round trip.
- **2026-11-04, the shortcuts** (`editor/shared/scriptlang/shortcuts.ts`): `say(line)`, `say_npc(npc, line)`,
  `say_event(line)`, `say_bubble(line)`, `say_sign(line)`, each the sequence the game's scripts use for that window
  (found by counting what follows each message command across the scripts: ParentActorMsg then LastKeyWait and
  ActorMsgClose 1280 times, ActorMsg so 212, SystemMsg with SystemMsgClose 74, InfoMsg with InfoMsgClose 145,
  MsgPlaceSign then MsgPlaceSignClose, which waits itself, 128); arguments after the line default to the game's most
  common value and show only where they differ. The yell, checker, "at", gendered and versioned windows have no one
  sequence in the game's scripts (a yell is mostly followed by a cry's wait), so they stay their commands
  (`angry_message`, `checker_message`, `show_message_at`, `gendered_message`, `version_message`) with their waits and
  closes written out.
- **2026-11-04, the numbers** (`editor/shared/scriptlang/values.ts`): by each argument's kind, a message shows as
  its line in the file's text bank (the bank its `#include "text/script/<bank>.h"` names; the line is the message's
  index in the bank's `.txt`, from 0), a flag and a species by number, a variable as `var(0x40ac)`; in conditions too.
  Saving stores each by the constant's name where there is one (the message's id, `EVENT_FLAG_...`, `SPECIES_...`,
  `EVENT_WORK_...`). A message number past the bank's lines stays a number (some commands take one, 65535 for none);
  the editor will warn about it. `equiv.ts` compares values by number, so a name and its number are the same. Items,
  sounds and the rest keep their names. Still all 4051 scripts round trip.
- **2026-11-04, the Script Editor** (`editor/src/modules/scripts/lang.ts`, `LangSide.tsx`, `ScriptEditor.tsx`): a
  script opens in the language (Script) or as its lines of the .s (.s), the choice kept. Apply puts the draft into its
  block after the check (the new block read back and put back again runs the same, `equiv.ts`; it says whether it
  also reads back as written, or tidied, with how), and Save applies a draft first; a draft not applied keeps a dot on
  its script. Restore… puts the script's block back as the last commit's or the original game's has it (a new read-only
  route, `GET /api/git/show`, HEAD or w2-original only). + New script adds a ScriptEntry and an empty script. Text
  file opens the bank over the code, by line number, filtered, to edit a message or put its number in. The sidebar:
  the call at the caret (a command with its macro, Frost's name and number, a shortcut, a named global, flag() or
  var()), what it does, its arguments with the one at the caret marked; for that argument a message's text in the
  talk window's preview, a species' name and icon, a flag's or a variable's name, the user's note on it
  (`res/paperwhite2/scripts/notes.json`) and the scripts that use it, and every choice of its kind, filtered, a click
  to put it in. The dump's comments of messages' texts are hidden in the language and written again from the bank on
  Apply.
- Equivalence, not sameness: a condition can be the stack's form or a WorkCmp's, a label's name changes, and a jump
  to the next statement may go; `equiv.ts` walks both files from the script's label through every command, condition
  (or its negation with its ways swapped) and jump. Untouched scripts aren't rewritten at all.

## Order

1. The translator both ways (TypeScript in `editor/shared/`), with the whole-game round trip test.
2. The names: Frost's, the macros', the globals' file.
3. The Script Editor's language view, with the text sidebar and window.
4. Movements inline and menus.
