/*
 * Copyright (C) 2026 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "napi/native_api.h"
#include <hilog/log.h>
#include <string>
#include <cstdlib>

#undef LOG_TAG
#define LOG_TAG "stackblur"
#define LOGI(...) OH_LOG_Print(LOG_APP, LOG_INFO, 0xFF00, LOG_TAG, __VA_ARGS__)
#define LOGE(...) OH_LOG_Print(LOG_APP, LOG_ERROR, 0xFF00, LOG_TAG, __VA_ARGS__)

// Based on http://vitiy.info/Code/stackblur.cpp
// Stack Blur Algorithm by Mario Klingemann <mario@quasimondo.com>
namespace StackBlur {

constexpr int NUM_0 = 0;
constexpr int NUM_1 = 1;
constexpr int NUM_2 = 2;
constexpr int NUM_3 = 3;
constexpr int NUM_4 = 4;
constexpr int NUM_5 = 5;
constexpr int NUM_6 = 6;
constexpr int NUM_7 = 7;
constexpr int NUM_8 = 8;
constexpr int NUM_9 = 9;
constexpr int NUM_10 = 10;
constexpr int NUM_254 = 254;
static const unsigned short STACKBLUR_MUL[255] = {
    512, 512, 456, 512, 328, 456, 335, 512, 405, 328, 271, 456, 388, 335, 292, 512, 454, 405, 364, 328, 298, 271,
    496, 456, 420, 388, 360, 335, 312, 292, 273, 512, 482, 454, 428, 405, 383, 364, 345, 328, 312, 298, 284, 271,
    259, 496, 475, 456, 437, 420, 404, 388, 374, 360, 347, 335, 323, 312, 302, 292, 282, 273, 265, 512, 497, 482,
    468, 454, 441, 428, 417, 405, 394, 383, 373, 364, 354, 345, 337, 328, 320, 312, 305, 298, 291, 284, 278, 271,
    265, 259, 507, 496, 485, 475, 465, 456, 446, 437, 428, 420, 412, 404, 396, 388, 381, 374, 367, 360, 354, 347,
    341, 335, 329, 323, 318, 312, 307, 302, 297, 292, 287, 282, 278, 273, 269, 265, 261, 512, 505, 497, 489, 482,
    475, 468, 461, 454, 447, 441, 435, 428, 422, 417, 411, 405, 399, 394, 389, 383, 378, 373, 368, 364, 359, 354,
    350, 345, 341, 337, 332, 328, 324, 320, 316, 312, 309, 305, 301, 298, 294, 291, 287, 284, 281, 278, 274, 271,
    268, 265, 262, 259, 257, 507, 501, 496, 491, 485, 480, 475, 470, 465, 460, 456, 451, 446, 442, 437, 433, 428,
    424, 420, 416, 412, 408, 404, 400, 396, 392, 388, 385, 381, 377, 374, 370, 367, 363, 360, 357, 354, 350, 347,
    344, 341, 338, 335, 332, 329, 326, 323, 320, 318, 315, 312, 310, 307, 304, 302, 299, 297, 294, 292, 289, 287,
    285, 282, 280, 278, 275, 273, 271, 269, 267, 265, 263, 261, 259};

static const unsigned char STACKBLUR_SHR[255] = {
    9,  11, 12, 13, 13, 14, 14, 15, 15, 15, 15, 16, 16, 16, 16, 17, 17, 17, 17, 17, 17, 17, 18, 18, 18, 18, 18, 18, 18,
    18, 18, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20,
    20, 20, 20, 20, 20, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21,
    21, 21, 21, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22,
    22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
    23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
    23, 23, 23, 23, 23, 23, 23, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
    24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
    24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24};

// Accumulator state for one Stack Blur scan-line pass
typedef struct {
    unsigned long sumr, sumg, sumb;
    unsigned long sumInR, sumInG, sumInB;
    unsigned long sumOutR, sumOutG, sumOutB;
} BlurAccum;

// Blur parameters encapsulated in a struct to reduce function argument count
typedef struct {
    unsigned int width;
    unsigned int height;
    unsigned int radius;
    int threadCount;
    int threadIndex;
    int round;
} BlurParams;

// Ring buffer operation parameters
typedef struct {
    unsigned int posLimit;
    unsigned int srcStride;
    unsigned int div;
    unsigned int radius;
} RingBufParams;

// Slide pass parameters (fixed values)
typedef struct {
    unsigned int posLimit;
    unsigned int srcStride;
    unsigned int dstStride;
    unsigned int count;
    unsigned int radius;
    unsigned int mulsum;
    unsigned char shrsum;
} SlidePassParams;

// Row/Col processing parameters
typedef struct {
    unsigned int w;
    unsigned int radius;
    unsigned int mulsum;
    unsigned char shrsum;
} RowColParams;

// Horizontal/Vertical pass parameters
typedef struct {
    unsigned int w;
    unsigned int h;
    unsigned int radius;
    int cores;
    int core;
    unsigned int mulsum;
    unsigned char shrsum;
} PassParams;

// Blur processing context (accumulators + stack state)
typedef struct {
    BlurAccum acc;
    unsigned char *stack;
    unsigned int sp;
} BlurContext;

// Slide pass context (all state needed for sliding)
typedef struct {
    unsigned char **srcPtr;
    unsigned char **dstPtr;
    unsigned int *pos;
    BlurContext *ctx;
    SlidePassParams params;
} SlideContext;

// Ring buffer context (all state needed for ring buffer advance)
typedef struct {
    unsigned char **srcPtr;
    unsigned int *pos;
    BlurContext *ctx;
    RingBufParams params;
} RingBufContext;

// Phase 1: load the edge pixel into stack slots [0..radius] with linearly increasing weights
static void BlurAccumInitPhase1(const unsigned char *p, BlurContext *ctx)
{
    unsigned int radius = ctx->sp;
    unsigned int i;
    unsigned char *sp;
    for (i = 0; i <= radius; i++) {
        sp = &ctx->stack[NUM_3 * i];
        sp[0] = p[0];
        sp[1] = p[1];
        sp[NUM_2] = p[NUM_2];
        ctx->acc.sumr += p[0] * (i + 1);
        ctx->acc.sumg += p[1] * (i + 1);
        ctx->acc.sumb += p[NUM_2] * (i + 1);
        ctx->acc.sumOutR += p[0];
        ctx->acc.sumOutG += p[1];
        ctx->acc.sumOutB += p[NUM_2];
    }
}

// Phase 2: walk outward and fill stack slots [radius+1..2*radius] with decreasing weights
static void BlurAccumInitPhase2(unsigned char **srcPtr, unsigned int edgeLimit, unsigned int stride, BlurContext *ctx)
{
    unsigned int radius = ctx->sp;
    unsigned int i;
    unsigned char *sp;
    for (i = 1; i <= radius; i++) {
        if (i <= edgeLimit) {
            *srcPtr += stride;
        }
        sp = &ctx->stack[NUM_3 * (i + radius)];
        sp[0] = (*srcPtr)[0];
        sp[1] = (*srcPtr)[1];
        sp[NUM_2] = (*srcPtr)[NUM_2];
        ctx->acc.sumr += (*srcPtr)[0] * (radius + 1 - i);
        ctx->acc.sumg += (*srcPtr)[1] * (radius + 1 - i);
        ctx->acc.sumb += (*srcPtr)[NUM_2] * (radius + 1 - i);
        ctx->acc.sumInR += (*srcPtr)[0];
        ctx->acc.sumInG += (*srcPtr)[1];
        ctx->acc.sumInB += (*srcPtr)[NUM_2];
    }
}

// Write one blurred pixel to dst, clamped to its alpha channel
static void BlurWritePixel(unsigned char *dst, const BlurAccum *acc, unsigned int mulsum, unsigned char shrsum)
{
    unsigned int alpha = dst[NUM_3];
    unsigned int rv = (acc->sumr * mulsum) >> shrsum;
    unsigned int gv = (acc->sumg * mulsum) >> shrsum;
    unsigned int bv = (acc->sumb * mulsum) >> shrsum;
    dst[0] = static_cast<unsigned char>(rv > alpha ? alpha : rv);
    dst[1] = static_cast<unsigned char>(gv > alpha ? alpha : gv);
    dst[NUM_2] = static_cast<unsigned char>(bv > alpha ? alpha : bv);
}

// Advance the ring buffer one step: pop the outgoing pixel and push the next incoming pixel
static void BlurAdvanceRingBuf(RingBufContext *ctx)
{
    unsigned int div = ctx->params.div;
    unsigned int radius = ctx->params.radius;
    unsigned int stackStart = ctx->ctx->sp + div - radius;
    if (stackStart >= div) {
        stackStart -= div;
    }
    unsigned char *spPtr = &ctx->ctx->stack[NUM_3 * stackStart];
    ctx->ctx->acc.sumOutR -= spPtr[0];
    ctx->ctx->acc.sumOutG -= spPtr[1];
    ctx->ctx->acc.sumOutB -= spPtr[NUM_2];
    if (*ctx->pos < ctx->params.posLimit) {
        *ctx->srcPtr += ctx->params.srcStride;
        ++(*ctx->pos);
    }
    spPtr[0] = (*ctx->srcPtr)[0];
    spPtr[1] = (*ctx->srcPtr)[1];
    spPtr[NUM_2] = (*ctx->srcPtr)[NUM_2];
    ctx->ctx->acc.sumInR += (*ctx->srcPtr)[0];
    ctx->ctx->acc.sumInG += (*ctx->srcPtr)[1];
    ctx->ctx->acc.sumInB += (*ctx->srcPtr)[NUM_2];
    ctx->ctx->acc.sumr += ctx->ctx->acc.sumInR;
    ctx->ctx->acc.sumg += ctx->ctx->acc.sumInG;
    ctx->ctx->acc.sumb += ctx->ctx->acc.sumInB;
    ++(ctx->ctx->sp);
    if (ctx->ctx->sp >= div) {
        ctx->ctx->sp = 0;
    }
    spPtr = &ctx->ctx->stack[ctx->ctx->sp * NUM_3];
    ctx->ctx->acc.sumOutR += spPtr[0];
    ctx->ctx->acc.sumOutG += spPtr[1];
    ctx->ctx->acc.sumOutB += spPtr[NUM_2];
    ctx->ctx->acc.sumInR -= spPtr[0];
    ctx->ctx->acc.sumInG -= spPtr[1];
    ctx->ctx->acc.sumInB -= spPtr[NUM_2];
}

// Slide the blurring window across 'count' output pixels (shared by H and V passes)
static void BlurSlidePass(SlideContext *slideCtx)
{
    unsigned int div = (slideCtx->params.radius * NUM_2) + 1;
    RingBufContext ringCtx = {slideCtx->srcPtr,
                              slideCtx->pos,
                              slideCtx->ctx,
                              {slideCtx->params.posLimit, slideCtx->params.srcStride, div, slideCtx->params.radius}};
    for (unsigned int n = 0; n < slideCtx->params.count; n++) {
        BlurWritePixel(*slideCtx->dstPtr, &slideCtx->ctx->acc, slideCtx->params.mulsum, slideCtx->params.shrsum);
        *slideCtx->dstPtr += slideCtx->params.dstStride;
        slideCtx->ctx->acc.sumr -= slideCtx->ctx->acc.sumOutR;
        slideCtx->ctx->acc.sumg -= slideCtx->ctx->acc.sumOutG;
        slideCtx->ctx->acc.sumb -= slideCtx->ctx->acc.sumOutB;
        BlurAdvanceRingBuf(&ringCtx);
    }
}

// Applies one horizontal-pass row of Stack Blur in-place.
// After BlurAccumInitPhase2, srcPtr is already at position (xp + y*w), ready for the slide.
static void StackBlurProcessHRow(unsigned char *src, unsigned int y, const RowColParams *params)
{
    unsigned int w = params->w;
    unsigned int radius = params->radius;
    unsigned int wm = w - 1;
    unsigned int w4 = w * NUM_4;
    unsigned int div = (radius * NUM_2) + 1;
    unsigned char *stack = (unsigned char *)malloc(div * NUM_3);
    if (!stack) {
        return;
    }
    BlurContext ctx = {{}, stack, radius};
    unsigned char *srcPtr = src + w4 * y;
    unsigned int xp = (radius <= wm) ? radius : wm;
    unsigned char *dstPtr = src + y * w4;
    BlurAccumInitPhase1(srcPtr, &ctx);
    BlurAccumInitPhase2(&srcPtr, wm, NUM_4, &ctx);
    SlideContext slideCtx = {
        &srcPtr, &dstPtr, &xp, &ctx, {wm, NUM_4, NUM_4, w, radius, params->mulsum, params->shrsum}};
    BlurSlidePass(&slideCtx);
    free(stack);
}

// Applies the horizontal pass of Stack Blur over a stripe of rows assigned to one thread.
static void StackBlurHorizontalPass(unsigned char *src, const PassParams *params)
{
    if (params->cores == 0) {
        return;
    }
    RowColParams rowParams = {params->w, params->radius, params->mulsum, params->shrsum};
    int minY = params->core * static_cast<int>(params->h) / params->cores;
    int maxY = (params->core + 1) * static_cast<int>(params->h) / params->cores;
    for (unsigned int y = static_cast<unsigned int>(minY); y < static_cast<unsigned int>(maxY); y++) {
        StackBlurProcessHRow(src, y, &rowParams);
    }
}

// Applies one vertical-pass column of Stack Blur in-place.
// After BlurAccumInitPhase2, srcPtr is already at position (x + yp*w), ready for the slide.
static void StackBlurProcessVCol(unsigned char *src, unsigned int x, const PassParams *params)
{
    unsigned int w = params->w;
    unsigned int h = params->h;
    unsigned int radius = params->radius;
    unsigned int hm = h - 1;
    unsigned int w4 = w * NUM_4;
    unsigned int div = (radius * NUM_2) + 1;
    unsigned char *stack = (unsigned char *)malloc(div * NUM_3);
    if (!stack) {
        return;
    }
    BlurContext ctx = {{}, stack, radius};
    unsigned char *srcPtr = src + NUM_4 * x;
    unsigned int yp = (radius <= hm) ? radius : hm;
    unsigned char *dstPtr = src + NUM_4 * x;
    BlurAccumInitPhase1(srcPtr, &ctx);
    BlurAccumInitPhase2(&srcPtr, hm, w4, &ctx);
    SlideContext slideCtx = {&srcPtr, &dstPtr, &yp, &ctx, {hm, w4, w4, h, radius, params->mulsum, params->shrsum}};
    BlurSlidePass(&slideCtx);
    free(stack);
}

// Applies the vertical pass of Stack Blur over a stripe of columns assigned to one thread.
static void StackBlurVerticalPass(unsigned char *src, const PassParams *params)
{
    if (params->cores == 0) {
        return;
    }
    int minX = params->core * static_cast<int>(params->w) / params->cores;
    int maxX = (params->core + 1) * static_cast<int>(params->w) / params->cores;
    for (unsigned int x = static_cast<unsigned int>(minX); x < static_cast<unsigned int>(maxX); x++) {
        StackBlurProcessVCol(src, x, params);
    }
}

/**
 * Core StackBlur algorithm on raw RGBA pixel data.
 *
 * @param src          RGBA pixel buffer (4 bytes per pixel: R, G, B, A)
 * @param params       Blur parameters struct containing width, height, radius, thread info, and round
 */
static void StackBlurJob(unsigned char *src, const BlurParams *params)
{
    unsigned int radius = params->radius;
    unsigned int w = params->width;
    unsigned int h = params->height;
    int cores = params->threadCount > 0 ? params->threadCount : 1;
    int core = params->threadIndex;
    int step = params->round;

    if (radius < 1 || radius > NUM_254) {
        return;
    }
    if (cores == 0) {
        return;
    }
    unsigned int div = (radius * NUM_2) + 1;
    unsigned int mulsum = STACKBLUR_MUL[radius];
    unsigned char shrsum = STACKBLUR_SHR[radius];

    PassParams passParams = {w, h, radius, cores, core, mulsum, shrsum};
    if (step == 1) {
        StackBlurHorizontalPass(src, &passParams);
    } else if (step == NUM_2) {
        StackBlurVerticalPass(src, &passParams);
    }
}

/**
 * Extracts ArrayBuffer buffer and its length from the first argument.
 * Returns true on success, false on failure (logs error).
 */
static bool GetBufferFromArg(napi_env env, napi_value arg, void **buffer, size_t *bufLen)
{
    napi_get_arraybuffer_info(env, arg, buffer, bufLen);
    if (!*buffer) {
        LOGE("functionToBlur: invalid ArrayBuffer");
        return false;
    }
    return true;
}

/**
 * Extracts blur parameters from the params object (second argument).
 * Returns true on success, false if parameters are invalid (logs error).
 */
static bool ExtractBlurParamsFromObj(napi_env env, napi_value paramsObj, BlurParams *params, size_t *expectedSize)
{
    napi_value widthVal;
    napi_value heightVal;
    napi_value radiusVal;
    napi_value threadCountVal;
    napi_value threadIndexVal;
    napi_value roundVal;
    napi_get_named_property(env, paramsObj, "width", &widthVal);
    napi_get_named_property(env, paramsObj, "height", &heightVal);
    napi_get_named_property(env, paramsObj, "radius", &radiusVal);
    napi_get_named_property(env, paramsObj, "threadCount", &threadCountVal);
    napi_get_named_property(env, paramsObj, "threadIndex", &threadIndexVal);
    napi_get_named_property(env, paramsObj, "round", &roundVal);
    int32_t w;
    int32_t h;
    int32_t radius;
    int32_t threadCount;
    int32_t threadIndex;
    int32_t round;
    napi_get_value_int32(env, widthVal, &w);
    napi_get_value_int32(env, heightVal, &h);
    napi_get_value_int32(env, radiusVal, &radius);
    napi_get_value_int32(env, threadCountVal, &threadCount);
    napi_get_value_int32(env, threadIndexVal, &threadIndex);
    napi_get_value_int32(env, roundVal, &round);
    if (radius < 1 || radius > NUM_254 || w <= 0 || h <= 0) {
        LOGE("functionToBlur: invalid parameters radius=%d w=%d h=%d", radius, w, h);
        return false;
    }
    *expectedSize = static_cast<size_t>(w * h * NUM_4);
    *params = {static_cast<unsigned int>(w),
               static_cast<unsigned int>(h),
               static_cast<unsigned int>(radius),
               threadCount,
               threadIndex,
               round};
    return true;
}

/**
 * NAPI function: functionToBlur
 * Applies one pass of the Stack Blur algorithm to an ArrayBuffer of RGBA pixels.
 *
 * Parameters (from ArkTS):
 *   buffer      : ArrayBuffer  — RGBA pixel data (w * h * 4 bytes), modified in-place
 *   params      : object       — { width, height, radius, threadCount, threadIndex, round }
 */
static napi_value FunctionToBlur(napi_env env, napi_callback_info info)
{
    size_t argc = NUM_2;
    napi_value args[NUM_2] = {nullptr};
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (argc < NUM_2) {
        LOGE("functionToBlur: expected 2 arguments, got %zu", argc);
        return nullptr;
    }

    void *buffer = nullptr;
    size_t bufLen = 0;
    if (!GetBufferFromArg(env, args[0], &buffer, &bufLen)) {
        return nullptr;
    }

    BlurParams params;
    size_t expectedSize = 0;
    if (!ExtractBlurParamsFromObj(env, args[1], &params, &expectedSize)) {
        return nullptr;
    }

    if (bufLen < expectedSize) {
        LOGE("functionToBlur: buffer too small (%zu < %zu)", bufLen, expectedSize);
        return nullptr;
    }

    StackBlurJob(static_cast<unsigned char *>(buffer), &params);
    return nullptr;
}

EXTERN_C_START
static napi_value Init(napi_env env, napi_value exports)
{
    napi_property_descriptor desc[] = {
        {"functionToBlur", nullptr, FunctionToBlur, nullptr, nullptr, nullptr, napi_default, nullptr}};
    napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc);
    return exports;
}
EXTERN_C_END

static napi_module stackblurModule = {
    .nm_version = 1,
    .nm_flags = 0,
    .nm_filename = nullptr,
    .nm_register_func = Init,
    .nm_modname = "library",
    .nm_priv = ((void *)0),
    .reserved = {0},
};

extern "C" __attribute__((constructor)) void RegisterLibraryModule(void)
{
    napi_module_register(&stackblurModule);
}
}