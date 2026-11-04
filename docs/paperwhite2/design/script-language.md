# A C-like language for the field scripts (agreed 2026-11-04)

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
- **Variables** as `0x4060`: a hex number from 0x4000 is a variable, as the engine reads any argument from 0x4000 up
  (`ScriptReadAny`); a decimal one is a value. `alias hiker_talks = 0x4060;` names one for the file.
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
    name, and our own notes).
- **The command reference** is a file of the language's names: each command's name, aliases, what it does, and each
  argument's name, kind and meaning. It starts from Frost's header and the game's handlers, and grows as commands are
  learned.

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
