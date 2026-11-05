#include "types.h"
#include "gfl/overlay.h"
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
#define COLOR_CODE_CHANGED RGB(20, 0, 20)
#define COLOR_TEXT RGB(31, 31, 31)
// A digit is 4 by 6 dots, drawn at 2 pixels a dot
#define GLYPH_SCALE 2
#define GLYPH_ADVANCE 10
#define ROW_HEIGHT 14
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

// The code check: the code of each watched module, in blocks whose checksums are taken when it loads and checked a few
// at a time each frame. A block that changes while its module stays loaded is reported
#define CODE_BLOCK_SIZE 0x800
#define CODE_BLOCK_MAX 1400
#define CODE_CHECK_BLOCKS_PER_FRAME 32
#define CODE_REGION_COUNT 5
#define CODE_RESIDENT 0xffffffff

extern u32 ARM9_TEXT_START[];
extern u32 ARM9_TEXT_END[];
extern u32 OV012_TEXT_START[];
extern u32 OV012_TEXT_END[];
extern u32 OV036_TEXT_START[];
extern u32 OV036_TEXT_END[];
extern u32 OV167_TEXT_START[];
extern u32 OV167_TEXT_END[];
extern u32 OV168_TEXT_START[];
extern u32 OV168_TEXT_END[];

typedef struct {
    const u32 *start;
    const u32 *end;
    // The overlay, or CODE_RESIDENT for ARM9 main
    u32 overlay;
    // Where its blocks' checksums begin in sCodeSums, and how many it has
    u32 first;
    u32 count;
    BOOL valid;
} CodeRegion;

static CodeRegion sCodeRegions[CODE_REGION_COUNT];
static u32 sCodeSums[CODE_BLOCK_MAX];
static u32 sCodeLoadCount;
static u32 sCodeNext;

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

static u32 CodeCheck_Sum(const u32 *start, const u32 *end) {
    u32 sum = 0;

    for (; start < end; start++) {
        sum = ((sum << 5) | (sum >> 27)) + *start;
    }
    return sum;
}

static const u32 *CodeCheck_BlockEnd(const CodeRegion *region, u32 block) {
    const u32 *end = region->start + (block + 1) * (CODE_BLOCK_SIZE / sizeof(u32));

    return end < region->end ? end : region->end;
}

static void CodeCheck_AddRegion(u32 index, const u32 *start, const u32 *end, u32 overlay, u32 *first) {
    CodeRegion *region = &sCodeRegions[index];

    region->start = start;
    region->end = end;
    region->overlay = overlay;
    region->first = *first;
    region->count = ((u32)end - (u32)start + CODE_BLOCK_SIZE - 1) / CODE_BLOCK_SIZE;
    if (region->first + region->count > CODE_BLOCK_MAX) {
        region->count = CODE_BLOCK_MAX - region->first;
    }
    *first += region->count;
}

// The checksums of a module's blocks, as it is now
static void CodeCheck_Take(CodeRegion *region) {
    u32 i;

    for (i = 0; i < region->count; i++) {
        sCodeSums[region->first + i] =
            CodeCheck_Sum(region->start + i * (CODE_BLOCK_SIZE / sizeof(u32)), CodeCheck_BlockEnd(region, i));
    }
    region->valid = TRUE;
}

static BOOL CodeCheck_IsLoaded(const CodeRegion *region) {
    return region->overlay == CODE_RESIDENT || GFL_OvlIsLoaded(region->overlay);
}

// A block that changed: the block's address, its module's index, the checksum taken and the one now, what the
// interrupt came in at (none from the main loop) and the main thread's registers
static void CodeCheck_Report(u32 index, u32 block, u32 sum) {
    CodeRegion *region = &sCodeRegions[index];

    sReported = TRUE;
    CrashWatch_BeginScreen(COLOR_CODE_CHANGED);
    CrashWatch_DrawWord(0, 0, (u32)(region->start + block * (CODE_BLOCK_SIZE / sizeof(u32))));
    CrashWatch_DrawWord(0, 1, index);
    CrashWatch_DrawWord(1, 0, sCodeSums[region->first + block]);
    CrashWatch_DrawWord(1, 1, sum);
    if (sMainThread != NULL) {
        CrashWatch_DrawContext(3, &sMainThread->context);
    }
}

// Each frame: after an overlay loads or unloads, a watched module that has just loaded has its checksums taken, and
// one that is gone stops being checked (nothing loads over a loaded overlay, gf_overlay.c, so one that stays loaded
// keeps them); then the next blocks in turn are checked
static void CodeCheck_Step(void) {
    u32 i;
    u32 n;

    if (sCodeLoadCount != GFL_OvlGetLoadCount()) {
        sCodeLoadCount = GFL_OvlGetLoadCount();
        for (i = 0; i < CODE_REGION_COUNT; i++) {
            BOOL loaded = CodeCheck_IsLoaded(&sCodeRegions[i]);

            if (loaded && !sCodeRegions[i].valid) {
                CodeCheck_Take(&sCodeRegions[i]);
            } else if (!loaded) {
                sCodeRegions[i].valid = FALSE;
            }
        }
    }
    for (n = 0; n < CODE_CHECK_BLOCKS_PER_FRAME; n++) {
        u32 at = sCodeNext;

        sCodeNext = sCodeNext + 1 < CODE_BLOCK_MAX ? sCodeNext + 1 : 0;
        for (i = 0; i < CODE_REGION_COUNT; i++) {
            CodeRegion *region = &sCodeRegions[i];
            u32 sum;

            if (!region->valid || at < region->first || at >= region->first + region->count) {
                continue;
            }
            sum = CodeCheck_Sum(region->start + (at - region->first) * (CODE_BLOCK_SIZE / sizeof(u32)),
                                CodeCheck_BlockEnd(region, at - region->first));
            if (sum != sCodeSums[at]) {
                CodeCheck_Report(i, at - region->first, sum);
            }
            break;
        }
    }
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
    u32 first = 0;

    OS_SetUserExceptionHandler(CrashWatch_OnException, NULL);
    CodeCheck_AddRegion(0, ARM9_TEXT_START, ARM9_TEXT_END, CODE_RESIDENT, &first);
    CodeCheck_AddRegion(1, OV012_TEXT_START, OV012_TEXT_END, OVERLAY_ID(12), &first);
    CodeCheck_AddRegion(2, OV036_TEXT_START, OV036_TEXT_END, OVERLAY_ID(36), &first);
    CodeCheck_AddRegion(3, OV167_TEXT_START, OV167_TEXT_END, OVERLAY_ID(167), &first);
    CodeCheck_AddRegion(4, OV168_TEXT_START, OV168_TEXT_END, OVERLAY_ID(168), &first);
    CodeCheck_Take(&sCodeRegions[0]);
    sCodeLoadCount = GFL_OvlGetLoadCount() - 1;
}

void PaperWhite2_CrashWatch_Beat(void) {
    if (sMainThread == NULL) {
        sMainThread = OS_GetCurrentThread();
    }
    sBeats++;
    if (!sReported) {
        CodeCheck_Step();
    }
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
