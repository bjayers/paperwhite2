// The build's own Python, used for what must agree with the build exactly: the constants a value may name, the final
// check of a file against its schema before it is saved, and the game's 2D art drawn as the build reads it.

import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const HERE = join(import.meta.dirname, "python");

export function pythonFor(root: string): string {
  const venv = join(root, ".venv", "bin", "python");
  return existsSync(venv) ? venv : "python3";
}

export class Python {
  private constantsCache: Record<string, number> | null = null;
  private validator: ChildProcessWithoutNullStreams | null = null;
  private waiting: ((result: { ok: boolean; error?: string }) => void)[] = [];
  private screens = new Map<string, Buffer>();

  constructor(private root: string) {}

  /** Every constant by name, as datajson.constants() reads them. */
  constants(): Record<string, number> {
    if (!this.constantsCache) {
      const out = execFileSync(pythonFor(this.root), [join(HERE, "constants.py")], { cwd: this.root, maxBuffer: 64 << 20 });
      this.constantsCache = JSON.parse(out.toString());
    }
    return this.constantsCache!;
  }

  /** The constants changed on disk; they are read again when next asked for, and the validator restarts. */
  invalidate() {
    this.constantsCache = null;
    this.validator?.kill();
    this.validator = null;
  }

  /** Checks a file against a schema with datajson.load(), as the build's packers do. */
  validate(dataPath: string, schemaPath: string): Promise<{ ok: boolean; error?: string }> {
    const process = this.start();
    return new Promise((resolve) => {
      this.waiting.push(resolve);
      process.stdin.write(`${dataPath}\t${schemaPath}\n`);
    });
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.validator) return this.validator;
    const child = spawn(pythonFor(this.root), [join(HERE, "validate.py")], { cwd: this.root });
    createInterface({ input: child.stdout }).on("line", (line) => this.waiting.shift()?.(JSON.parse(line)));
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("exit", () => {
      if (this.validator === child) this.validator = null;
      for (const resolve of this.waiting.splice(0)) resolve({ ok: false, error: `The schema check stopped: ${stderr.trim()}` });
    });
    this.validator = child;
    return child;
  }

  /** A 2D screen of res/ drawn as a PNG (screen.py), cached while its three files are unchanged. */
  screen(chars: string, screen: string, palette: string): Buffer {
    const files = [chars, screen, palette];
    const key = files.map((f) => `${f}@${statSync(join(this.root, f)).mtimeMs}`).join("|");
    let image = this.screens.get(key);
    if (!image) {
      image = execFileSync(pythonFor(this.root), [join(HERE, "screen.py"), ...files], { cwd: this.root, maxBuffer: 16 << 20 });
      this.screens.set(key, image);
    }
    return image;
  }

  stop() {
    this.validator?.kill();
  }
}
