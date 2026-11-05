// The flags' and the variables' reference (the Flag and Var Reference, src/modules/flags/): every one with its name,
// its status and where it's used, as tools/paperwhite2/flag_usage.py and var_usage.py find them, and the comment that
// documents it in generated/flags.txt or vars.txt. The tools take a few seconds, so their answer is kept until asked
// to run again.

import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pythonFor } from "./python.ts";

export type UsageKind = "flags" | "vars";

export interface UsageRow {
  number: number;
  name: string;
  /** used, range, indirect-candidate or unused, as the tool says */
  status: string;
  /** Its region: what resets it (map-local, daily, re-battled trainer, Funfest mission) or what it is (trainer,
   * hidden item, map replacement event), or saved */
  region: string;
  /** Where it's used, every use the tool finds */
  where: string[];
}

export interface Usage {
  kind: UsageKind;
  rows: UsageRow[];
  /** Each documented name's comment lines from the generated list */
  docs: Record<string, string>;
}

const TOOLS: Record<UsageKind, { script: string; list: string }> = {
  flags: { script: "tools/paperwhite2/flag_usage.py", list: "generated/flags.txt" },
  vars: { script: "tools/paperwhite2/var_usage.py", list: "generated/vars.txt" },
};

/** CSV as Python's csv module writes it: commas, and quotes around a field with a comma, a quote or a newline. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** The comment lines over each constant of a generated list (the file's first line, its own heading, aside). */
export function listDocs(text: string): Record<string, string> {
  const docs: Record<string, string> = {};
  let comment: string[] = [];
  text.split("\n").slice(1).forEach((line) => {
    const t = line.trim();
    if (t.startsWith("#")) { comment.push(t.replace(/^#\s?/, "")); return; }
    const name = /^([A-Z_][A-Z0-9_]*)/.exec(t)?.[1];
    if (name && comment.length) docs[name] = comment.join(" ");
    comment = [];
  });
  return docs;
}

export class UsageCache {
  private cache = new Map<UsageKind, Promise<Usage>>();

  constructor(private root: string) {}

  get(kind: UsageKind, again = false): Promise<Usage> {
    if (again || !this.cache.has(kind)) {
      const run = this.run(kind);
      run.catch(() => this.cache.delete(kind));
      this.cache.set(kind, run);
    }
    return this.cache.get(kind)!;
  }

  private run(kind: UsageKind): Promise<Usage> {
    const { script, list } = TOOLS[kind];
    const dir = mkdtempSync(join(tmpdir(), "paperwhite2-usage-"));
    const csv = join(dir, `${kind}.csv`);
    return new Promise((done, fail) => {
      execFile(pythonFor(this.root), [script, "--csv", csv, "--quiet", "--all-uses"], { cwd: this.root, maxBuffer: 16 << 20 }, (e, stdout, stderr) => {
        try {
          if (e) throw new Error(`${script} failed: ${`${stdout}${stderr}`.trim()}`);
          const [header, ...lines] = parseCsv(readFileSync(csv, "utf8")).filter((r) => r.length > 1);
          const at = (name: string) => header.indexOf(name);
          const hex = at(kind === "flags" ? "flag_hex" : "var_hex");
          const rows = lines.map((r): UsageRow => ({
            number: parseInt(r[hex], 16),
            name: r[at("name")] ?? "",
            status: r[at("status")] ?? "",
            region: at("region") >= 0 ? r[at("region")] : "",
            where: (r[at("where")] ?? "").split("; ").filter(Boolean),
          }));
          done({ kind, rows, docs: listDocs(readFileSync(join(this.root, list), "utf8")) });
        } catch (error) {
          fail(error);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
    });
  }
}
