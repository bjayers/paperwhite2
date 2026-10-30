// What git says about the checkout, and the one write the editor makes to it: a commit the user asks for, when
// settings.local.json allows it.

import { execFile } from "node:child_process";
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

  async commit(paths: string[], message: string): Promise<string> {
    await this.git("add", "--", ...paths);
    await this.git("commit", "-m", message, "--", ...paths);
    return (await this.git("log", "-1", "--format=%h")).trim();
  }
}
