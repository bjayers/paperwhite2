// The field's talk window, drawn as the game draws it (src/ov036/talkmsgwin.c, ActorMsgWin_CreateAtBottom): a window
// of 30 by 4 tiles at the bottom of the screen, its frame of ARCID_WINFRAME's tiles (member 5, palette 0, row 0), its
// inside filled with the font palette's color 15, and the text in font 0 at 8, 0, two lines of 16 pixels, each letter
// in the colors PRINT_COLOR picks (the glyph's value 1 the letter, 2 its shadow). It prints as the game does, a letter
// at a time; a click is the A button: it finishes the text up to the next wait, or goes on after one. Reusable: any
// editor can show a message with <TextBox text={...} />.

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api.ts";
import { parsePal } from "../palettes/pal.ts";
import { readIndexedPng, type IndexedImage } from "../palettes/png.ts";
import { parseFont, parseNclr, type Font, type Rgb } from "./font.ts";
import { parseMessage, wordSample, type Token } from "./message.ts";

interface Assets {
  font: Font;
  fontColors: Rgb[];
  frame: IndexedImage;
  frameColors: Rgb[];
}

let assets: Promise<Assets> | null = null;
function loadAssets(): Promise<Assets> {
  if (!assets) {
    const bytes = (member: number) => fetch(`/api/font?member=${member}`).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
      return r.arrayBuffer();
    });
    assets = Promise.all([
      bytes(0).then(parseFont),
      bytes(5).then(parseNclr),
      api.asset("res/graphics/winframe/05.png").then(readIndexedPng),
      api.file("res/graphics/winframe/00.pal").then((f) => parsePal(f.text) as Rgb[]),
    ]).then(([font, fontColors, frame, frameColors]) => ({ font, fontColors, frame, frameColors }));
    assets.catch(() => { assets = null; });
  }
  return assets;
}

// The window, in tiles, and where the canvas starts: the frame's row above the window
const WIN_X = 1;
const WIN_Y = 19;
const WIN_W = 30;
const WIN_H = 4;
const TOP = WIN_Y - 1;
const CANVAS_W = 256;
const CANVAS_H = (WIN_H + 2) * 8;
const TEXT_X = 8;
const LINE = 16;
const FILL = 15;
// The scene behind the window, for its transparent pixels
const BACKDROP: Rgb = [120, 160, 112];

interface Placed {
  code: number;
  color: number;
  x: number;
}

interface Printer {
  tokens: Token[];
  pos: number;
  /** The word's letters still to print. */
  pending: number[];
  lines: Placed[][];
  line: number;
  x: number;
  color: number;
  state: "typing" | "scroll" | "clear" | "done";
  /** Just after {be00} cleared the box: the line break that follows it (every one has one) starts the new box. */
  cleared: boolean;
  /** How far a line ran past the window, for a warning. */
  overflow: number;
}

function newPrinter(tokens: Token[]): Printer {
  return { tokens, pos: 0, pending: [], lines: [[], []], line: 0, x: 0, color: 0, state: "typing", overflow: 0, cleared: false };
}

const textWidth = WIN_W * 8 - TEXT_X;

/** Prints the next letter, or acts on the codes before it; false once it waits or ends. */
function step(p: Printer, font: Font, words: Record<number, string>): boolean {
  const put = (code: number) => {
    const g = font.glyph(code);
    p.cleared = false;
    p.lines[p.line].push({ code, color: p.color, x: p.x });
    p.x += g.advance;
    if (p.x > textWidth) p.overflow = Math.max(p.overflow, p.x - textWidth);
  };
  if (p.pending.length) {
    put(p.pending.shift()!);
    return true;
  }
  while (p.pos < p.tokens.length) {
    const t = p.tokens[p.pos++];
    switch (t.kind) {
      case "char":
        put(t.code);
        return true;
      case "word":
        p.pending = [...wordSample(t, words)].map((c) => c.codePointAt(0)!);
        if (p.pending.length) put(p.pending.shift()!);
        return true;
      case "newline":
        if (p.cleared) p.cleared = false;
        else if (p.line === 0) p.line = 1;
        else p.lines = [p.lines[1], []];
        p.x = 0;
        break;
      case "scroll":
        p.state = "scroll";
        return false;
      case "clear":
        p.state = "clear";
        return false;
      case "color":
        p.color = t.color === 255 ? 0 : t.color;
        break;
      case "end":
        p.pos = p.tokens.length;
        break;
      case "code":
        break;
    }
  }
  p.state = "done";
  return false;
}

/** After A while waiting. */
function resume(p: Printer) {
  if (p.state === "clear") {
    p.lines = [[], []];
    p.line = 0;
    p.x = 0;
    p.cleared = true;
  }
  p.state = "typing";
}

function draw(canvas: HTMLCanvasElement, a: Assets, p: Printer, blink: boolean) {
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(CANVAS_W, CANVAS_H);
  const set = (x: number, y: number, c: Rgb) => {
    if (x < 0 || y < 0 || x >= CANVAS_W || y >= CANVAS_H) return;
    image.data.set([c[0], c[1], c[2], 255], (y * CANVAS_W + x) * 4);
  };
  for (let y = 0; y < CANVAS_H; y++) for (let x = 0; x < CANVAS_W; x++) set(x, y, BACKDROP);
  // The frame: TalkMsgWin_DrawNormalFrame's tiles 1 (corners), 3 (top and bottom), 4 (sides), flipped
  const perRow = a.frame.width / 8;
  const tile = (index: number, flip: number, tx: number, ty: number) => {
    const sx = (index % perRow) * 8, sy = Math.floor(index / perRow) * 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = a.frame.pixels[(sy + (flip & 2 ? 7 - y : y)) * a.frame.width + sx + (flip & 1 ? 7 - x : x)];
      if (v) set(tx * 8 + x, (ty - TOP) * 8 + y, a.frameColors[v]);
    }
  };
  const right = WIN_X + WIN_W, bottom = WIN_Y + WIN_H;
  tile(1, 0, WIN_X - 1, WIN_Y - 1);
  tile(1, 1, right, WIN_Y - 1);
  tile(1, 2, WIN_X - 1, bottom);
  tile(1, 3, right, bottom);
  for (let x = WIN_X; x < right; x++) { tile(3, 0, x, WIN_Y - 1); tile(3, 2, x, bottom); }
  for (let y = WIN_Y; y < bottom; y++) { tile(4, 0, WIN_X - 1, y); tile(4, 1, right, y); }
  for (let y = 0; y < WIN_H * 8; y++) for (let x = 0; x < WIN_W * 8; x++) set(WIN_X * 8 + x, (WIN_Y - TOP) * 8 + y, a.fontColors[FILL]);
  // The text, clipped to the window as the window's bitmap clips it
  const ox = WIN_X * 8 + TEXT_X, oy = (WIN_Y - TOP) * 8;
  const font = a.font;
  p.lines.forEach((line, row) => {
    for (const ch of line) {
      const g = font.glyph(ch.code);
      const letter = a.fontColors[1 + ch.color * 2] ?? a.fontColors[1];
      const shadow = a.fontColors[2 + ch.color * 2] ?? a.fontColors[2];
      for (let y = 0; y < font.cellHeight; y++) for (let x = 0; x < font.cellWidth; x++) {
        const v = g.pixels[y * font.cellWidth + x];
        const px = ch.x + g.left + x;
        if (!v || px >= textWidth) continue;
        set(ox + px, oy + row * LINE + y, v === 1 ? letter : shadow);
      }
    }
  });
  // The wait's arrow at the window's bottom right, blinking
  if ((p.state === "scroll" || p.state === "clear") && blink) {
    const ax = (WIN_X + WIN_W) * 8 - 14, ay = oy + LINE + 8;
    for (let r = 0; r < 4; r++) for (let x = r; x < 7 - r; x++) set(ax + x, ay + r, a.fontColors[1]);
  }
  ctx.putImageData(image, 0, 0);
}

const NO_WORDS: Record<number, string> = {};

export function TextBox({ text, words = NO_WORDS, scale = 2, autoPlay = true }: {
  /** The message as the text files write it. */
  text: string;
  /** Sample words for the word set's buffers, by buffer number. */
  words?: Record<number, string>;
  scale?: number;
  /** Prints a letter at a time; false shows each part at once. */
  autoPlay?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [a, setAssets] = useState<Assets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokens = useMemo(() => parseMessage(text), [text]);
  const printer = useRef<Printer>(newPrinter(tokens));
  const [, rerender] = useState(0);

  useEffect(() => { loadAssets().then(setAssets, (e: Error) => setError(e.message)); }, []);
  useEffect(() => { printer.current = newPrinter(tokens); rerender((n) => n + 1); }, [tokens]);

  // A letter a frame while printing, as the game's middle text speed; the arrow blinks while it waits
  useEffect(() => {
    if (!a) return;
    let frame = 0;
    let id = 0;
    let shown = "";
    const tick = () => {
      const p = printer.current;
      if (p.state === "typing") {
        if (autoPlay) step(p, a.font, words);
        else while (step(p, a.font, words));
      }
      const now = `${p.state}:${p.overflow}`;
      if (now !== shown) {
        shown = now;
        rerender((n) => n + 1);
      }
      if (canvas.current) draw(canvas.current, a, p, Math.floor(frame / 16) % 2 === 0);
      frame++;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [a, words, autoPlay]);

  const press = () => {
    if (!a) return;
    const p = printer.current;
    if (p.state === "typing") while (step(p, a.font, words));
    else if (p.state === "done") printer.current = newPrinter(tokens);
    else resume(p);
    rerender((n) => n + 1);
  };

  if (error) return <div className="textbox-error">The text box needs the game's font: {error}</div>;
  const p = printer.current;
  return (
    <div className="textbox">
      <canvas ref={canvas} width={CANVAS_W} height={CANVAS_H} className="textbox-canvas"
              style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }} onClick={press}
              title="Click for the A button" />
      <div className="textbox-status muted">
        {p.state === "done" ? "The end: click to start again" : p.state === "typing" ? "Printing: click to finish" : "Waiting for A: click to go on"}
        {p.overflow > 0 && <span className="textbox-warn"> · a line runs {p.overflow} pixels past the window</span>}
      </div>
    </div>
  );
}
