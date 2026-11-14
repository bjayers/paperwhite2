// The Rig Editor's clock: the sequence played and its time, stepped at the game's 60 frames a second, with the battle's
// behaviour as options (BtlvMcss_OnAnimationEnd and BtlvMcss_IdleTask, src/ov168/btlv_mcss.c; battle-sprites.md section
// 4): at each end of the stay loop a roll, more likely each time (1 in 3, then 2, then 1), starts the idle pause:
// sequence 1 if there is one, stopped, with only the idle parts going on, for 48, 56 or 64 frames; then the stay
// loop again. A status such as sleep slows the animation to a third (BtlvMcss_SetAnimSpeed 0x555).
//
// The clock is kept outside React: the preview draws on each tick, and only what shows the time listens.

import { lengthOf, type Idle, type Rig } from "./mcss.ts";

export const GAME_FPS = 60;
/** The pause's lengths in frames, one chosen at random (BtlvMcss_IdleTask). */
export const PAUSES = [48, 56, 64];
/** 0x555 / 0x1000, the battle's speed for a Pokémon asleep or otherwise slowed. */
export const SLOW = 0x555 / 0x1000;

export interface ClockState {
  sequence: number;
  /** Frames since the sequence started (fractional while slowed). */
  time: number;
  playing: boolean;
  /** The idle pause under way, if any. */
  pause: { elapsed: number; wait: number } | null;
}

type Listener = () => void;

export class Clock {
  state: ClockState = { sequence: 0, time: 0, playing: true, pause: null };
  /** The battle's random idle pauses after each loop. */
  pauses = false;
  slow = false;
  private rig: Rig | null = null;
  private listeners = new Set<Listener>();
  private frame = 0;
  private last = 0;
  private carry = 0;
  private idleCount = 3;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.state;

  private set(next: Partial<ClockState>) {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setRig(rig: Rig) {
    this.rig = rig;
    if (this.state.sequence >= rig.sequences.length) this.set({ sequence: 0, time: 0, pause: null });
  }

  /** The whole frame shown. */
  get frameTime() {
    return Math.floor(this.state.time);
  }

  /** The idle pause as the renderer takes it. */
  idle(): Idle | undefined {
    const pause = this.state.pause;
    if (!pause || !this.rig) return undefined;
    return { parts: new Set(this.rig.idle_parts ?? []), elapsed: Math.floor(pause.elapsed) };
  }

  play(playing = !this.state.playing) {
    this.set({ playing });
    if (playing) this.start();
  }

  seek(time: number, sequence = this.state.sequence) {
    this.set({ time: Math.max(0, time), sequence, pause: null });
  }

  step(by: number) {
    this.set({ playing: false, pause: null, time: Math.max(0, Math.floor(this.state.time) + by) });
  }

  /** Whether the rig can pause at all (its idle parts aren't the game's 0xff "never"). */
  canPause() {
    return !!this.rig && this.rig.idle_parts !== null;
  }

  /** The battle's pause now, as it starts at the end of a loop when the roll wins: sequence 1 if there is one, else the
   * stay loop's start, stopped, with only the idle parts going on, for `wait` frames (48, 56 or 64 at random), then the
   * loop again. Plays the clock. */
  pauseNow(wait = PAUSES[Math.floor(Math.random() * 3)]) {
    if (!this.canPause()) return;
    this.idleCount = 3;
    this.set({ sequence: this.rig!.sequences.length > 1 ? 1 : 0, time: 0, pause: { elapsed: 0, wait }, playing: true });
    this.start();
  }

  start() {
    if (this.frame) return;
    this.last = performance.now();
    this.carry = 0;
    const tick = (now: number) => {
      this.frame = 0;
      if (!this.state.playing) return;
      this.carry += ((now - this.last) / 1000) * GAME_FPS;
      this.last = now;
      // Game frames due, at most a few after a stall (a hidden tab)
      const due = Math.min(Math.floor(this.carry), 4);
      this.carry -= Math.floor(this.carry);
      if (due > 0) this.advance(due);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  /** Game frames passed. */
  advance(frames: number) {
    const rig = this.rig;
    if (!rig) return;
    const speed = this.slow ? SLOW : 1;
    let { time, sequence, pause } = this.state;
    for (let i = 0; i < frames; i++) {
      if (pause) {
        const elapsed = pause.elapsed + speed;
        pause = elapsed >= pause.wait ? null : { ...pause, elapsed };
        if (!pause) { sequence = 0; time = 0; }
        continue;
      }
      const length = lengthOf(rig.sequences[sequence]);
      const next = time + speed;
      if (this.pauses && sequence === 0 && length && rig.idle_parts !== null && Math.floor(next / length) > Math.floor(time / length)) {
        // The loop ended: the battle's roll (GFL_RandomMT * count >> 32 == 0)
        const count = this.idleCount;
        this.idleCount = count - 1;
        if (Math.floor(Math.random() * count) === 0) {
          this.idleCount = 3;
          if (rig.sequences.length > 1) sequence = 1;
          time = 0;
          pause = { elapsed: 0, wait: PAUSES[Math.floor(Math.random() * 3)] };
          continue;
        }
      }
      time = next;
    }
    this.set({ time, sequence, pause });
  }
}
