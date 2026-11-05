#ifndef PAPERWHITE2_CRASH_WATCH_H
#define PAPERWHITE2_CRASH_WATCH_H

#include "types.h"

// Paper White 2: a crash report for debug builds (PAPERWHITE2_DEBUG_MENU), for freezes that no debugger sees, such as
// the one in melonDS DS's JIT with literal optimisations (docs/paperwhite2/STATUS.md, 2026-11-05). The main loop
// beats once a frame; when the VBlank interrupt finds no beat for CRASH_WATCH_FRAMES frames, it draws over the main
// engine, red, what was running: the address the interrupt came in at, its registers, and the main thread's saved
// registers. An exception (a data abort or an undefined instruction) draws its registers, blue. The screen is a bitmap
// of the main engine's VRAM A, so it shows whatever state the game is in
// (src/paperwhite2/main/paperwhite2_crash_watch.c)

#define CRASH_WATCH_FRAMES 300

// After the system is set up: the exception handler
void PaperWhite2_CrashWatch_Init(void);
// Once a frame, from the main loop
void PaperWhite2_CrashWatch_Beat(void);
// In the VBlank interrupt
void PaperWhite2_CrashWatch_VBlank(void);

#endif // PAPERWHITE2_CRASH_WATCH_H
