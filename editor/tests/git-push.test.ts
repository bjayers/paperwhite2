// Push to GitHub (server/git.ts) against a throwaway origin: a bare repository in a temporary folder and two clones of
// it, the editor's and another session's. Never the real checkout or its origin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Git } from "../server/git.ts";
import { neverPushed, pushMessage } from "../shared/api.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const write = (root: string, path: string, text: string) => {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), text);
};

/** An origin with one commit on main, the editor's clone and another one. */
function repos() {
  const dir = mkdtempSync(join(tmpdir(), "pw2-push-"));
  const origin = join(dir, "origin.git");
  git(dir, "init", "-q", "--bare", "-b", "main", origin);
  const clone = (name: string) => {
    const at = join(dir, name);
    git(dir, "clone", "-q", origin, at);
    git(at, "config", "user.email", "test@example.com");
    git(at, "config", "user.name", "Test");
    git(at, "checkout", "-q", "-B", "main");
    return at;
  };
  const seed = clone("seed");
  write(seed, ".gitignore", "ignored/\n");
  write(seed, "res/paperwhite2/encounters/a.json", "1\n");
  write(seed, "res/text/b.txt", "1\n");
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "First");
  git(seed, "push", "-q", "origin", "main");
  return { dir, origin, editor: clone("editor"), other: clone("other"), done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("the paths it never pushes", () => {
  for (const p of ["orig/baserom_w2_us.nds", "extract/a.bin", "build/paperwhite2.nds", "x/game.nds", "res/paperwhite2/scripts/notes.json",
    "editor/settings.local.json", "orig/bios7.bin"]) assert.ok(neverPushed(p), p);
  for (const p of ["res/graphics/b_choice/07.bin", "res/paperwhite2/scripts/zone.json", "editor/src/App.tsx"]) assert.ok(!neverPushed(p), p);
});

test("the default message names the parts of the data", () => {
  assert.equal(pushMessage(["res/paperwhite2/encounters/a.json", "res/paperwhite2/encounters/b.json", "res/text/story/1.txt"]),
    "Editor: encounters, text");
  assert.equal(pushMessage([]), "Editor: changes");
});

test("commits only the files named, merges origin/main in and pushes", async () => {
  const r = repos();
  try {
    // Another session pushed a change to a different file meanwhile
    write(r.other, "res/text/b.txt", "2\n");
    git(r.other, "commit", "-q", "-am", "Other");
    git(r.other, "push", "-q", "origin", "main");

    write(r.editor, "res/paperwhite2/encounters/a.json", "2\n");
    write(r.editor, "res/paperwhite2/encounters/new.json", "3\n");
    write(r.editor, "res/paperwhite2/scripts/notes.json", "{}\n");
    write(r.editor, "build/paperwhite2.nds", "rom");
    write(r.editor, "ignored/x.json", "{}\n");
    write(r.editor, "res/unasked.json", "{}\n");
    const paths = ["res/paperwhite2/encounters/a.json", "res/paperwhite2/encounters/new.json", "res/paperwhite2/scripts/notes.json",
      "build/paperwhite2.nds", "ignored/x.json"];
    const result = await new Git(r.editor).push(paths, "Editor: encounters", { wait: 1 });
    assert.equal(result.error, null, result.log.join("\n"));
    assert.ok(result.pushed && result.merged && result.commit);

    const files = git(r.origin, "show", "--name-only", "--format=", `main^{/Editor: encounters}`).split("\n").sort();
    assert.deepEqual(files, ["res/paperwhite2/encounters/a.json", "res/paperwhite2/encounters/new.json"]);
    assert.equal(git(r.origin, "show", "main:res/text/b.txt"), "2");
    // What wasn't named, or is never pushed, is still only in the working tree
    const status = git(r.editor, "status", "--porcelain", "--untracked-files=all");
    assert.match(status, /\?\? res\/unasked\.json/);
    assert.match(status, /\?\? res\/paperwhite2\/scripts\/notes\.json/);
    assert.equal(git(r.editor, "rev-parse", "HEAD"), git(r.origin, "rev-parse", "main"));
  } finally {
    r.done();
  }
});

test("a conflict aborts the merge and lists the files, without pushing", async () => {
  const r = repos();
  try {
    write(r.other, "res/text/b.txt", "theirs\n");
    git(r.other, "commit", "-q", "-am", "Other");
    git(r.other, "push", "-q", "origin", "main");
    const before = git(r.origin, "rev-parse", "main");

    write(r.editor, "res/text/b.txt", "ours\n");
    const result = await new Git(r.editor).push(["res/text/b.txt"], "Editor: text", { wait: 1 });
    assert.ok(result.commit && !result.pushed && !result.merged);
    assert.deepEqual(result.conflicts, ["res/text/b.txt"]);
    assert.equal(git(r.origin, "rev-parse", "main"), before);
    assert.ok(!existsSync(join(r.editor, ".git", "MERGE_HEAD")));
    assert.equal(git(r.editor, "status", "--porcelain"), "");
  } finally {
    r.done();
  }
});

test("with nothing to commit it pushes the commits not yet on GitHub", async () => {
  const r = repos();
  try {
    write(r.editor, "res/text/b.txt", "local\n");
    git(r.editor, "commit", "-q", "-am", "Local");
    const result = await new Git(r.editor).push([], "", { wait: 1 });
    assert.ok(result.pushed && !result.commit, result.error ?? "");
    assert.equal(git(r.origin, "show", "main:res/text/b.txt"), "local");
  } finally {
    r.done();
  }
});

test("a fetch that fails says so", async () => {
  const r = repos();
  try {
    git(r.editor, "remote", "set-url", "origin", join(r.dir, "missing.git"));
    write(r.editor, "res/text/b.txt", "x\n");
    const result = await new Git(r.editor).push(["res/text/b.txt"], "Editor: text", { tries: 2, wait: 1 });
    assert.ok(result.commit && !result.pushed);
    assert.match(result.error ?? "", /git fetch failed/);
  } finally {
    r.done();
  }
});
