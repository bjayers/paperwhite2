// What git says about the checkout, and the one write the editor makes to it: a commit the user asks for, when
// settings.local.json allows it, and the files it puts back as the last commit has them (discard). It also reads files
// as a revision had them (a chunk put back as it was).

import { execFile } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { GitState } from "../shared/api.ts";

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
}
