// The Type icons page's tools: every label and the sheet export and import unchanged, a recolor in a row writes only that
// row's lines of the label palette, an import is checked against the label's size and its row, and the wedge colors
// pack into the header the HUD reads with the values the C table had.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { crc32 } from "node:zlib";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const TOOL = "editor/server/python/type_icons.py";

const run = (...args: string[]) => execFileSync("python3", ["-I", join(ROOT, TOOL), ...args], { cwd: ROOT, encoding: "utf8" });
const check = (...args: string[]) => JSON.parse(run(...args)) as {
  ok: boolean; message: string; nothing: boolean; files: string[]; changes: { row: number; index: number; users: string[]; shared: boolean }[];
};
const scratch = () => mkdtempSync(join(tmpdir(), "type-icons-test-"));
const list = () => JSON.parse(run("list")) as {
  labels: { id: number; constant: string; row: number; member: number }[];
  rows: { row: number; entries: { index: number; labels: number[]; others: string[] }[] }[];
  buttons: { id: number; member: number }[];
};

/** A PNG with one palette entry's color replaced, its chunk's CRC redone. */
function recolor(png: Buffer, index: number, color: [number, number, number]): Buffer {
  const out = Buffer.from(png);
  for (let at = 8; at < out.length;) {
    const size = out.readUInt32BE(at);
    const kind = out.toString("latin1", at + 4, at + 8);
    if (kind === "PLTE") {
      out.set(color, at + 8 + index * 3);
      out.writeUInt32BE(crc32(out.subarray(at + 4, at + 8 + size)), at + 8 + size);
      return out;
    }
    at += 12 + size;
  }
  throw new Error("no palette");
}

test("every label exports and imports unchanged", () => {
  const dir = scratch();
  const { labels } = list();
  assert.equal(labels.length, 19);
  for (const label of labels) {
    const file = join(dir, `${label.id}.png`);
    writeFileSync(file, Buffer.from(run("export", String(label.id)).trim(), "base64"));
    const result = check("check-label", String(label.id), file);
    assert.ok(result.ok && result.nothing, `${label.constant}: ${result.message}`);
  }
});

test("the sheet exports and imports unchanged", () => {
  const dir = scratch();
  const file = join(dir, "sheet.png");
  writeFileSync(file, Buffer.from(run("export-sheet").trim(), "base64"));
  const result = check("check-sheet", file);
  assert.ok(result.ok && result.nothing, result.message);
});

test("a recolor within a row writes only that row of the palette", () => {
  const dir = scratch();
  const out = join(dir, "out");
  mkdirSync(out);
  const label = list().labels.find((l) => l.constant === "TYPE_FAIRY")!;
  assert.equal(label.row, 2);
  const file = join(dir, "fairy.png");
  // Entry 8 is Fairy's fill, which only Fairy and Bug use in row 2 (Bug's is 5 and 7): a change of one entry
  writeFileSync(file, recolor(Buffer.from(run("export", String(label.id)).trim(), "base64"), 8, [10, 200, 30]));
  const result = check("check-label", String(label.id), file, out);
  assert.ok(result.ok && !result.nothing, result.message);
  assert.deepEqual(result.files, ["res/graphics/app_menu_common/033.pal"]);
  assert.equal(result.changes.length, 1);
  assert.deepEqual([result.changes[0].row, result.changes[0].index], [2, 8]);
  const before = readFileSync(join(ROOT, "res/graphics/app_menu_common/033.pal"), "utf8").split("\n");
  const after = readFileSync(join(out, "033.pal"), "utf8").split("\n");
  assert.equal(after.length, before.length);
  const differing = after.flatMap((line, i) => (line === before[i] ? [] : [i - 3]));
  assert.deepEqual(differing, [2 * 16 + 8]);
  // 10 200 30 as the DS's 5 bits an axis, written as the dump writes them
  assert.equal(after[3 + 2 * 16 + 8], "8 197 32");
});

test("an entry shared with another label says so", () => {
  const dir = scratch();
  const labels = list().labels;
  const normal = labels.find((l) => l.constant === "TYPE_NORMAL")!;
  const file = join(dir, "normal.png");
  // Normal's entry 5 (row 0) is also drawn by a menu icon
  writeFileSync(file, recolor(Buffer.from(run("export", String(normal.id)).trim(), "base64"), 5, [1, 2, 3]));
  const result = check("check-label", String(normal.id), file);
  assert.ok(result.ok);
  assert.equal(result.changes.length, 1);
  assert.ok(result.changes[0].shared, "entry 5 of row 0 has other users");
  assert.ok(result.changes[0].users.some((u) => u.startsWith("menu icon")));
});

test("a PNG of the wrong size or an unknown index is refused", () => {
  const dir = scratch();
  const sheet = join(dir, "sheet.png");
  writeFileSync(sheet, Buffer.from(run("export-sheet").trim(), "base64"));
  const result = check("check-label", "0", sheet);
  assert.equal(result.ok, false);
  assert.match(result.message, /must be 32×16/);
});

test("every type's move button palette is a file of res/", () => {
  for (const button of list().buttons) {
    assert.ok(readdirSync(join(ROOT, "res/graphics/btlv")).includes(`${String(button.member).padStart(3, "0")}.pal`));
  }
});

test("the wedge colors pack to the table the C code had", () => {
  const fill = [0x4210, 0x125c, 0x6aae, 0x6552, 0x1dd4, 0x4295, 0x1694, 0x390e, 0x66ad, 0x1d9c,
    0x7266, 0x1e68, 0x16fc, 0x45bd, 0x6729, 0x5dab, 0x210a, 0x4210, 0x5a1d];
  const edge = [0x294a, 0x18e9, 0x4948, 0x28e9, 0x0d4e, 0x0d4e, 0x1da8, 0x28e9, 0x294a, 0x048e,
    0x4948, 0x1da8, 0x0d4e, 0x1ced, 0x4948, 0x48e9, 0x18e9, 0x294a, 0x3914];
  const out = join(scratch(), "type_colors_config.h");
  execFileSync("python3", ["-I", join(ROOT, "tools/paperwhite2/type_colors.py"), out], { cwd: ROOT });
  const text = readFileSync(out, "utf8");
  const values = (name: string) => {
    const block = text.slice(text.indexOf(`#define ${name} `)).split("\n\n")[0].split("#define")[1];
    return [...block.matchAll(/0x([0-9a-f]{4})/g)].map((m) => parseInt(m[1], 16));
  };
  assert.deepEqual(values("PAPERWHITE2_TYPE_FILL_COLORS"), fill);
  assert.deepEqual(values("PAPERWHITE2_TYPE_EDGE_COLORS"), edge);
});
