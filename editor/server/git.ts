// What git says about the checkout, and the writes the editor makes to it, when settings.local.json allows them: a
// commit the user asks for, Push to GitHub (a commit, origin/main merged in, a push to main) and the files it puts back
// as the last commit has them (discard). It also reads files as a revision had them (a chunk put back as it was).

import { execFile } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { neverPushed, type GitState, type PushResult } from "../shared/api.ts";

const run = promisify(execFile);

export class Git {
  constructor(private root: string) {}

  private async git(...args: string[]): Promise<string> {
    const { stdout } = await run("git", args, { cwd: this.root, maxBuffer: 64 << 20 });
    return stdout;
  }

  async state(): Promise<GitState> {
    const status = await this.git("status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all");
    const records = status.split("\0").filter(Boolean);
    let branch = "", ahead = 0, behind = 0;
    const changes: GitState["changes"] = [];
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record.startsWith("## ")) {
        branch = record.slice(3).split("...")[0];
        ahead = Number(/ahead (\d+)/.exec(record)?.[1] ?? 0);
        behind = Number(/behind (\d+)/.exec(record)?.[1] ?? 0);
        continue;
      }
      const code = record.slice(0, 2);
      changes.push({ path: record.slice(3), status: code });
      if (code[0] === "R" || code[0] === "C") i++; // the original path follows a rename
    }
    const head = (await this.git("log", "-1", "--format=%h %s").catch(() => "")).trim();
    return { branch, ahead, behind, head, changes };
  }

  async diff(path: string): Promise<string> {
    const tracked = await this.git("ls-files", "--", path);
    if (!tracked.trim()) return "(a new file)";
    return this.git("diff", "HEAD", "--", path);
  }

  /** The files under a folder at a revision (a commit or a tag), or none where it has no such folder. */
  async files(rev: string, folder: string): Promise<string[]> {
    const out = await this.git("ls-tree", "-r", "--name-only", rev, "--", folder.replace(/\/?$/, "/")).catch(() => "");
    return out.split("\n").filter(Boolean);
  }

  /** A file's bytes at a revision. */
  async show(rev: string, path: string): Promise<Buffer> {
    const { stdout } = await run("git", ["show", `${rev}:${path}`], { cwd: this.root, maxBuffer: 64 << 20, encoding: "buffer" });
    return stdout;
  }

  /** Files put back as the last commit has them (in the working tree and the index); a file the last commit doesn't
   * have is removed. */
  async discard(paths: string[]): Promise<void> {
    for (const path of paths) {
      const tracked = (await this.git("ls-tree", "--name-only", "HEAD", "--", path)).trim();
      if (tracked) await this.git("restore", "--source=HEAD", "--staged", "--worktree", "--", path);
      else {
        await this.git("rm", "--cached", "--quiet", "--ignore-unmatch", "--", path);
        rmSync(join(this.root, path), { force: true });
      }
    }
  }

  async commit(paths: string[], message: string): Promise<string> {
    await this.git("add", "--", ...paths);
    await this.git("commit", "-m", message, "--", ...paths);
    return (await this.git("log", "-1", "--format=%h")).trim();
  }

  /** A git step that may fail: its output, or its error's message. */
  private async attempt(...args: string[]): Promise<{ ok: boolean; out: string }> {
    try {
      const { stdout, stderr } = await run("git", args, { cwd: this.root, maxBuffer: 64 << 20, env: { ...process.env, GIT_MERGE_AUTOEDIT: "no", GIT_TERMINAL_PROMPT: "0" } });
      return { ok: true, out: (stdout + stderr).trim() };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message: string };
      return { ok: false, out: ((err.stderr ?? "") + (err.stdout ?? "")).trim() || err.message };
    }
  }

  /** Of the changed files, those Push to GitHub may stage, and those it leaves out (paths it never pushes, files git
   * ignores, and files git doesn't list as changed). */
  async pushable(paths: string[]): Promise<{ files: string[]; left: string[] }> {
    const changed = new Set((await this.state()).changes.map((c) => c.path));
    const candidates = [...new Set(paths)].filter((p) => changed.has(p) && !neverPushed(p));
    // --no-index: a tracked file under an ignore rule is left out too
    const ignored = candidates.length ? await this.attempt("check-ignore", "--no-index", "--", ...candidates) : { ok: false, out: "" };
    const skip = new Set(ignored.ok ? ignored.out.split("\n").map((l) => l.trim()).filter(Boolean) : []);
    const files = candidates.filter((p) => !skip.has(p));
    return { files, left: paths.filter((p) => !files.includes(p)) };
  }

  /** Push to GitHub: commits the files (staged by name), merges origin/main in (aborting on a conflict; never a
   * rebase or a force) and pushes HEAD to main, trying again when the network fails or someone pushed first. With no
   * files it pushes the commits the branch is ahead by. */
  async push(paths: string[], message: string, { tries = 3, wait = 2000 } = {}): Promise<PushResult> {
    const result: PushResult = { commit: null, merged: false, pushed: false, conflicts: [], error: null, log: [] };
    const fail = (error: string) => ({ ...result, error });
    const { files, left } = await this.pushable(paths);
    if (left.length) result.log.push(`Left out: ${left.join(", ")}`);
    if (files.length) {
      const add = await this.attempt("add", "--", ...files);
      if (!add.ok) return fail(`git add failed: ${add.out}`);
      const commit = await this.attempt("commit", "-m", message, "--", ...files);
      if (!commit.ok) return fail(`git commit failed: ${commit.out}`);
      result.commit = (await this.git("log", "-1", "--format=%h")).trim();
      result.log.push(`Committed ${result.commit} (${files.length} file${files.length > 1 ? "s" : ""})`);
    } else if (paths.length) return fail("None of the files can be pushed");
    for (let round = 1; ; round++) {
      const fetch = await this.retry(tries, wait, "fetch", "origin");
      if (!fetch.ok) return fail(`git fetch failed: ${fetch.out}`);
      result.log.push("Fetched origin");
      const merge = await this.attempt("merge", "--no-edit", "origin/main");
      if (!merge.ok) {
        result.conflicts = (await this.attempt("diff", "--name-only", "--diff-filter=U")).out.split("\n").filter(Boolean);
        const merging = await this.attempt("rev-parse", "-q", "--verify", "MERGE_HEAD");
        if (merging.ok) await this.attempt("merge", "--abort");
        result.log.push("The merge was aborted");
        return fail(result.conflicts.length ? `origin/main conflicts with these files, so the merge was aborted` : `git merge failed: ${merge.out}`);
      }
      result.merged = true;
      result.log.push(/Already up to date/i.test(merge.out) ? "origin/main was already merged" : "Merged origin/main");
      const push = await this.retry(tries, wait, "push", "origin", "HEAD:main");
      if (push.ok) {
        result.pushed = true;
        result.log.push("Pushed to origin main");
        return result;
      }
      // Someone pushed first: fetch and merge again
      if (/\[rejected\]|fetch first|non-fast-forward/i.test(push.out) && round < tries) {
        result.log.push("origin/main moved on: merging it again");
        continue;
      }
      return fail(`git push failed: ${push.out}`);
    }
  }

  /** A network step, tried again after a wait while the network is what fails. */
  private async retry(tries: number, wait: number, ...args: string[]) {
    for (let i = 1; ; i++) {
      const step = await this.attempt(...args);
      if (step.ok || i >= tries || !NETWORK_ERROR.test(step.out)) return step;
      await new Promise((r) => setTimeout(r, wait * i));
    }
  }
}

const NETWORK_ERROR = /could not resolve host|unable to access|connection (timed out|reset|refused)|failed to connect|timed out|early eof|remote end hung up|could not read from remote|network is unreachable|temporary failure|ssl|tls|rpc failed/i;
