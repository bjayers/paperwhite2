#include "types.h"
#include "nitro/os.h"
#include "paperwhite2/crash_watch.h"

// Paper White 2: the crash report of debug builds (paperwhite2/crash_watch.h)

#ifdef PAPERWHITE2_DEBUG_MENU

#define REG_DISPCNT ((volatile u32 *)0x04000000)
#define REG_MASTER_BRIGHT ((volatile u16 *)0x0400006c)
#define REG_VRAMCNT_A ((volatile u8 *)0x04000240)
#define REG_POWCNT1 ((volatile u16 *)0x04000304)
#define VRAM_A_LCDC ((u16 *)0x06800000)
// The main engine shows VRAM A as a bitmap, VRAM A to the LCDC
#define DISPCNT_VRAM_A_BITMAP (2 << 16)
#define VRAMCNT_ENABLE_LCDC 0x80
#define POWCNT_LCD_2D_A 0x3
#define SCREEN_WIDTH 256
#define SCREEN_HEIGHT 192
#define RGB(r, g, b) ((r) | ((g) << 5) | ((b) << 10))
#define COLOR_FREEZE RGB(20, 0, 0)
#define COLOR_EXCEPTION RGB(0, 0, 20)
#define COLOR_TEXT RGB(31, 31, 31)
// A digit is 4 by 6 dots, drawn at 2 pixels a dot
#define GLYPH_SCALE 2
#define GLYPH_ADVANCE 10
#define ROW_HEIGHT 16
#define ROW_TOP 8
#define LEFT 8

// The hex digits, a row of 4 dots in each nibble from the top, the leftmost dot highest
static const u16 sDigits[16][6] = {
    { 0x6, 0x9, 0x9, 0x9, 0x9, 0x6 }, { 0x2, 0x6, 0x2, 0x2, 0x2, 0x7 }, { 0x6, 0x9, 0x1, 0x2, 0x4, 0xf },
    { 0xe, 0x1, 0x6, 0x1, 0x1, 0xe }, { 0x9, 0x9, 0xf, 0x1, 0x1, 0x1 }, { 0xf, 0x8, 0xe, 0x1, 0x1, 0xe },
    { 0x6, 0x8, 0xe, 0x9, 0x9, 0x6 }, { 0xf, 0x1, 0x2, 0x4, 0x4, 0x4 }, { 0x6, 0x9, 0x6, 0x9, 0x9, 0x6 },
    { 0x6, 0x9, 0x9, 0x7, 0x1, 0x6 }, { 0x6, 0x9, 0x9, 0xf, 0x9, 0x9 }, { 0xe, 0x9, 0xe, 0x9, 0x9, 0xe },
    { 0x7, 0x8, 0x8, 0x8, 0x8, 0x7 }, { 0xe, 0x9, 0x9, 0x9, 0x9, 0xe }, { 0xf, 0x8, 0xe, 0x8, 0x8, 0xf },
    { 0xf, 0x8, 0xe, 0x8, 0x8, 0x8 },
};

static u32 sBeats;
static u32 sLastBeats;
static u32 sStillFrames;
static BOOL sReported;
static OSThread *sMainThread;
// The exceptions taken: the first is the one shown, and the count goes on the last row, so that a fault that only
// follows another one doesn't hide it
static u32 sExceptions;

static void CrashWatch_DrawDigit(u32 x, u32 y, u32 digit) {
    u32 row;
    u32 col;
    u32 dy;
    u32 dx;

    for (row = 0; row < 6; row++) {
        for (col = 0; col < 4; col++) {
            if (sDigits[digit][row] & (8 >> col)) {
                for (dy = 0; dy < GLYPH_SCALE; dy++) {
                    for (dx = 0; dx < GLYPH_SCALE; dx++) {
                        VRAM_A_LCDC[(y + row * GLYPH_SCALE + dy) * SCREEN_WIDTH + x + col * GLYPH_SCALE + dx] =
                            COLOR_TEXT;
                    }
                }
            }
        }
    }
}

// A word in 8 hex digits, at its row and column (two columns a row)
static void CrashWatch_DrawWord(u32 row, u32 column, u32 value) {
    u32 i;

    for (i = 0; i < 8; i++) {
        CrashWatch_DrawDigit(LEFT + column * 120 + i * GLYPH_ADVANCE, ROW_TOP + row * ROW_HEIGHT,
                             (value >> (28 - i * 4)) & 0xf);
    }
}

// Shows VRAM A as the main engine's bitmap, filled with the color
static void CrashWatch_BeginScreen(u16 color) {
    u32 i;

    *REG_POWCNT1 |= POWCNT_LCD_2D_A;
    *REG_VRAMCNT_A = VRAMCNT_ENABLE_LCDC;
    *REG_DISPCNT = DISPCNT_VRAM_A_BITMAP;
    *REG_MASTER_BRIGHT = 0;
    for (i = 0; i < SCREEN_WIDTH * SCREEN_HEIGHT; i++) {
        VRAM_A_LCDC[i] = color;
    }
}

// The registers of a context, from its row: pc + 4, lr, sp and cpsr, then r0 to r3
static void CrashWatch_DrawContext(u32 row, const OSContext *context) {
    CrashWatch_DrawWord(row, 0, context->pc_plus4);
    CrashWatch_DrawWord(row, 1, context->lr);
    CrashWatch_DrawWord(row + 1, 0, context->sp);
    CrashWatch_DrawWord(row + 1, 1, context->cpsr);
    CrashWatch_DrawWord(row + 2, 0, context->r[0]);
    CrashWatch_DrawWord(row + 2, 1, context->r[1]);
    CrashWatch_DrawWord(row + 3, 0, context->r[2]);
    CrashWatch_DrawWord(row + 3, 1, context->r[3]);
}

// An exception: the first one's registers (the handler's context begins with an OSContext), then how many there were
static void CrashWatch_OnException(void *context, void *arg) {
    sExceptions++;
    if (sExceptions == 1) {
        sReported = TRUE;
        CrashWatch_BeginScreen(COLOR_EXCEPTION);
        CrashWatch_DrawContext(0, context);
        if (sMainThread != NULL) {
            CrashWatch_DrawContext(5, &sMainThread->context);
        }
    }
    CrashWatch_DrawWord(10, 0, sExceptions);
    // The words after the OSContext: the BIOS frame's first word, the word after it, and the stack's low bit
    CrashWatch_DrawWord(10, 1, ((const u32 *)context)[sizeof(OSContext) / sizeof(u32)]);
    CrashWatch_DrawWord(11, 0, ((const u32 *)context)[sizeof(OSContext) / sizeof(u32) + 1]);
    CrashWatch_DrawWord(11, 1, ((const u32 *)context)[sizeof(OSContext) / sizeof(u32) + 2]);
}

void PaperWhite2_CrashWatch_Init(void) {
    OS_SetUserExceptionHandler(CrashWatch_OnException, NULL);
}

void PaperWhite2_CrashWatch_Beat(void) {
    if (sMainThread == NULL) {
        sMainThread = OS_GetCurrentThread();
    }
    sBeats++;
}

// The BIOS's frame of the interrupt at the top of the IRQ stack: r0 to r3, r12, and lr, the address it came in at + 4
void PaperWhite2_CrashWatch_VBlank(void) {
    const u32 *frame = (const u32 *)(HW_IRQ_STACK - 6 * sizeof(u32));

    if (sReported || sMainThread == NULL) {
        return;
    }
    if (sBeats != sLastBeats) {
        sLastBeats = sBeats;
        sStillFrames = 0;
        return;
    }
    if (++sStillFrames < CRASH_WATCH_FRAMES) {
        return;
    }
    sReported = TRUE;
    CrashWatch_BeginScreen(COLOR_FREEZE);
    CrashWatch_DrawWord(0, 0, frame[5]);
    CrashWatch_DrawWord(0, 1, frame[4]);
    CrashWatch_DrawWord(1, 0, frame[0]);
    CrashWatch_DrawWord(1, 1, frame[1]);
    CrashWatch_DrawWord(2, 0, frame[2]);
    CrashWatch_DrawWord(2, 1, frame[3]);
    CrashWatch_DrawContext(4, &sMainThread->context);
    CrashWatch_DrawWord(9, 0, (u32)OS_GetCurrentThread());
    CrashWatch_DrawWord(9, 1, (u32)sMainThread);
}

#else

void PaperWhite2_CrashWatch_Init(void) {
}

void PaperWhite2_CrashWatch_Beat(void) {
}

void PaperWhite2_CrashWatch_VBlank(void) {
}

#endif
