// Runs the hack's build in the repository and streams its output to the page.

import { spawn, type ChildProcess } from "node:child_process";
import type { BuildState } from "../shared/api.ts";

const KEEP_LINES = 5000;

export class Builder {
  state: BuildState = { running: false, command: "", startedAt: null, finishedAt: null, exitCode: null, lines: [] };
  private child: ChildProcess | null = null;

  constructor(private root: string, private onLine: (line: string) => void, private onState: (s: BuildState) => void) {}

  start(command: string): boolean {
    if (this.state.running) return false;
    this.state = { running: true, command, startedAt: Date.now(), finishedAt: null, exitCode: null, lines: [] };
    this.onState(this.state);
    // Its own process group, so Stop ends ninja and the compilers it started too.
    const child = spawn("bash", ["-lc", command], { cwd: this.root, detached: true, env: { ...process.env, TERM: "dumb" } });
    this.child = child;
    let partial = "";
    const take = (chunk: Buffer) => {
      const text = partial + chunk.toString();
      const lines = text.split(/\r?\n/);
      partial = lines.pop() ?? "";
      for (const line of lines) this.line(line);
    };
    child.stdout!.on("data", take);
    child.stderr!.on("data", take);
    child.on("close", (code) => {
      if (partial) this.line(partial);
      this.child = null;
      this.state = { ...this.state, running: false, finishedAt: Date.now(), exitCode: code ?? -1 };
      this.onState(this.state);
    });
    return true;
  }

  stop() {
    if (this.child?.pid) {
      try {
        process.kill(-this.child.pid, "SIGTERM");
      } catch {
        this.child.kill("SIGTERM");
      }
    }
  }

  private line(line: string) {
    this.state.lines.push(line);
    if (this.state.lines.length > KEEP_LINES) this.state.lines.splice(0, this.state.lines.length - KEEP_LINES);
    this.onLine(line);
  }
}
