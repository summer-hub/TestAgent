/**
 * JSBlurProcess — pure ArkTS Stack Blur implementation.
 *
 * Ported from android-stackblur JavaBlurProcess.java
 * Original algorithm by Mario Klingemann <mario.quasimondo.com>
 *
 * Works on raw RGBA pixel data obtained via PixelMap.readPixelsToBuffer().
 * Each pixel occupies 4 consecutive bytes: [R, G, B, A].
 * The blur is applied to the R, G, B channels; the A channel is preserved.
 *
 * @license Apache License 2.0
 */

import { image } from '@kit.ImageKit';
import { BlurProcess } from './BlurProcess';

// Pre-computed multiplier table for fast integer division
const STACKBLUR_MUL: number[] = [
  512, 512, 456, 512, 328, 456, 335, 512, 405, 328, 271, 456, 388, 335, 292, 512,
  454, 405, 364, 328, 298, 271, 496, 456, 420, 388, 360, 335, 312, 292, 273, 512,
  482, 454, 428, 405, 383, 364, 345, 328, 312, 298, 284, 271, 259, 496, 475, 456,
  437, 420, 404, 388, 374, 360, 347, 335, 323, 312, 302, 292, 282, 273, 265, 512,
  497, 482, 468, 454, 441, 428, 417, 405, 394, 383, 373, 364, 354, 345, 337, 328,
  320, 312, 305, 298, 291, 284, 278, 271, 265, 259, 507, 496, 485, 475, 465, 456,
  446, 437, 428, 420, 412, 404, 396, 388, 381, 374, 367, 360, 354, 347, 341, 335,
  329, 323, 318, 312, 307, 302, 297, 292, 287, 282, 278, 273, 269, 265, 261, 512,
  505, 497, 489, 482, 475, 468, 461, 454, 447, 441, 435, 428, 422, 417, 411, 405,
  399, 394, 389, 383, 378, 373, 368, 364, 359, 354, 350, 345, 341, 337, 332, 328,
  324, 320, 316, 312, 309, 305, 301, 298, 294, 291, 287, 284, 281, 278, 274, 271,
  268, 265, 262, 259, 257, 507, 501, 496, 491, 485, 480, 475, 470, 465, 460, 456,
  451, 446, 442, 437, 433, 428, 424, 420, 416, 412, 408, 404, 400, 396, 392, 388,
  385, 381, 377, 374, 370, 367, 363, 360, 357, 354, 350, 347, 344, 341, 338, 335,
  332, 329, 326, 323, 320, 318, 315, 312, 310, 307, 304, 302, 299, 297, 294, 292,
  289, 287, 285, 282, 280, 278, 275, 273, 271, 269, 267, 265, 263, 261, 259
];

// Pre-computed shift table
const STACKBLUR_SHR: number[] = [
  9, 11, 12, 13, 13, 14, 14, 15, 15, 15, 15, 16, 16, 16, 16, 17,
  17, 17, 17, 17, 17, 17, 18, 18, 18, 18, 18, 18, 18, 18, 18, 19,
  19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 20, 20, 20,
  20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 21,
  21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21,
  21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 22, 22, 22, 22, 22, 22,
  22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22,
  22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 23,
  23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
  23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
  23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
  23, 23, 23, 23, 23, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24
];

/**
 * Run one blur pass over the RGBA byte array.
 *
 * @param src    Uint8Array of RGBA pixel data (4 bytes per pixel)
 * @param w      image width
 * @param h      image height
 * @param radius blur radius
 * @param step   1 = horizontal pass, 2 = vertical pass
 */
function blurIterationRGBA(
  src: Uint8Array,
  w: number,
  h: number,
  radius: number,
  step: number
): void {
  const div: number = radius * 2 + 1;
  const mulSum: number = STACKBLUR_MUL[radius];
  const shrSum: number = STACKBLUR_SHR[radius];
  // Stack stores (R, G, B) triples for each slot in the window
  const stack: Uint8Array = new Uint8Array(div * 3);

  if (step === 1) {
    // ── Horizontal pass ──────────────────────────────────────────────────────
    for (let y = 0; y < h; y++) {
      let sumR: number = 0;
      let sumG: number = 0;
      let sumB: number = 0;
      let sumInR: number = 0;
      let sumInG: number = 0;
      let sumInB: number = 0;
      let sumOutR: number = 0;
      let sumOutG: number = 0;
      let sumOutB: number = 0;

      let srcPtr: number = y * w * 4; // byte offset to start of row

      // Initialise stack and accumulators for the left edge
      for (let i = 0; i <= radius; i++) {
        const si: number = i * 3;
        stack[si] = src[srcPtr];
        stack[si + 1] = src[srcPtr + 1];
        stack[si + 2] = src[srcPtr + 2];
        sumR += src[srcPtr] * (i + 1);
        sumG += src[srcPtr + 1] * (i + 1);
        sumB += src[srcPtr + 2] * (i + 1);
        sumOutR += src[srcPtr];
        sumOutG += src[srcPtr + 1];
        sumOutB += src[srcPtr + 2];
      }

      for (let i = 1; i <= radius; i++) {
        if (i <= w - 1) {
          srcPtr += 4;
        }
        const si: number = (i + radius) * 3;
        stack[si] = src[srcPtr];
        stack[si + 1] = src[srcPtr + 1];
        stack[si + 2] = src[srcPtr + 2];
        sumR += src[srcPtr] * (radius + 1 - i);
        sumG += src[srcPtr + 1] * (radius + 1 - i);
        sumB += src[srcPtr + 2] * (radius + 1 - i);
        sumInR += src[srcPtr];
        sumInG += src[srcPtr + 1];
        sumInB += src[srcPtr + 2];
      }

      let sp: number = radius;
      let xp: number = Math.min(radius, w - 1);
      srcPtr = (xp + y * w) * 4;
      let dstPtr: number = y * w * 4;

      // Slide the window across the row
      for (let x = 0; x < w; x++) {
        const rv: number = Math.floor(sumR * mulSum / (1 << shrSum));
        const gv: number = Math.floor(sumG * mulSum / (1 << shrSum));
        const bv: number = Math.floor(sumB * mulSum / (1 << shrSum));
        const alpha: number = src[dstPtr + 3];
        src[dstPtr] = rv > alpha ? alpha : rv;
        src[dstPtr + 1] = gv > alpha ? alpha : gv;
        src[dstPtr + 2] = bv > alpha ? alpha : bv;
        dstPtr += 4;

        sumR -= sumOutR;
        sumG -= sumOutG;
        sumB -= sumOutB;

        let stackStart: number = sp + div - radius;
        if (stackStart >= div) {
          stackStart -= div;
        }
        const ssi: number = stackStart * 3;
        sumOutR -= stack[ssi];
        sumOutG -= stack[ssi + 1];
        sumOutB -= stack[ssi + 2];

        if (xp < w - 1) {
          srcPtr += 4;
          xp++;
        }

        stack[ssi] = src[srcPtr];
        stack[ssi + 1] = src[srcPtr + 1];
        stack[ssi + 2] = src[srcPtr + 2];

        sumInR += src[srcPtr];
        sumInG += src[srcPtr + 1];
        sumInB += src[srcPtr + 2];
        sumR += sumInR;
        sumG += sumInG;
        sumB += sumInB;

        sp++;
        if (sp >= div) {
          sp = 0;
        }
        const spsi: number = sp * 3;
        sumOutR += stack[spsi];
        sumOutG += stack[spsi + 1];
        sumOutB += stack[spsi + 2];
        sumInR -= stack[spsi];
        sumInG -= stack[spsi + 1];
        sumInB -= stack[spsi + 2];
      }
    }
  } else if (step === 2) {
    // ── Vertical pass ────────────────────────────────────────────────────────
    for (let x = 0; x < w; x++) {
      let sumR: number = 0;
      let sumG: number = 0;
      let sumB: number = 0;
      let sumInR: number = 0;
      let sumInG: number = 0;
      let sumInB: number = 0;
      let sumOutR: number = 0;
      let sumOutG: number = 0;
      let sumOutB: number = 0;

      let srcPtr: number = x * 4; // byte offset to (x, 0)

      for (let i = 0; i <= radius; i++) {
        const si: number = i * 3;
        stack[si] = src[srcPtr];
        stack[si + 1] = src[srcPtr + 1];
        stack[si + 2] = src[srcPtr + 2];
        sumR += src[srcPtr] * (i + 1);
        sumG += src[srcPtr + 1] * (i + 1);
        sumB += src[srcPtr + 2] * (i + 1);
        sumOutR += src[srcPtr];
        sumOutG += src[srcPtr + 1];
        sumOutB += src[srcPtr + 2];
      }

      for (let i = 1; i <= radius; i++) {
        if (i <= h - 1) {
          srcPtr += w * 4;
        }
        const si: number = (i + radius) * 3;
        stack[si] = src[srcPtr];
        stack[si + 1] = src[srcPtr + 1];
        stack[si + 2] = src[srcPtr + 2];
        sumR += src[srcPtr] * (radius + 1 - i);
        sumG += src[srcPtr + 1] * (radius + 1 - i);
        sumB += src[srcPtr + 2] * (radius + 1 - i);
        sumInR += src[srcPtr];
        sumInG += src[srcPtr + 1];
        sumInB += src[srcPtr + 2];
      }

      let sp: number = radius;
      let yp: number = Math.min(radius, h - 1);
      srcPtr = (x + yp * w) * 4;
      let dstPtr: number = x * 4;

      for (let y = 0; y < h; y++) {
        const rv: number = Math.floor(sumR * mulSum / (1 << shrSum));
        const gv: number = Math.floor(sumG * mulSum / (1 << shrSum));
        const bv: number = Math.floor(sumB * mulSum / (1 << shrSum));
        const alpha: number = src[dstPtr + 3];
        src[dstPtr] = rv > alpha ? alpha : rv;
        src[dstPtr + 1] = gv > alpha ? alpha : gv;
        src[dstPtr + 2] = bv > alpha ? alpha : bv;
        dstPtr += w * 4;

        sumR -= sumOutR;
        sumG -= sumOutG;
        sumB -= sumOutB;

        let stackStart: number = sp + div - radius;
        if (stackStart >= div) {
          stackStart -= div;
        }
        const ssi: number = stackStart * 3;
        sumOutR -= stack[ssi];
        sumOutG -= stack[ssi + 1];
        sumOutB -= stack[ssi + 2];

        if (yp < h - 1) {
          srcPtr += w * 4;
          yp++;
        }

        stack[ssi] = src[srcPtr];
        stack[ssi + 1] = src[srcPtr + 1];
        stack[ssi + 2] = src[srcPtr + 2];

        sumInR += src[srcPtr];
        sumInG += src[srcPtr + 1];
        sumInB += src[srcPtr + 2];
        sumR += sumInR;
        sumG += sumInG;
        sumB += sumInB;

        sp++;
        if (sp >= div) {
          sp = 0;
        }
        const spsi: number = sp * 3;
        sumOutR += stack[spsi];
        sumOutG += stack[spsi + 1];
        sumOutB += stack[spsi + 2];
        sumInR -= stack[spsi];
        sumInG -= stack[spsi + 1];
        sumInB -= stack[spsi + 2];
      }
    }
  }
}

/**
 * JSBlurProcess — pure ArkTS implementation of BlurProcess.
 *
 * Reads RGBA pixels from the PixelMap into an ArrayBuffer,
 * runs the horizontal + vertical blur passes entirely in ArkTS,
 * then creates a new PixelMap from the modified buffer.
 */
export class JSBlurProcess implements BlurProcess {
  blur(original: image.PixelMap, radius: number): image.PixelMap {
    if (radius <= 0) {
      return original;
    }
    const clampedRadius: number = radius > 254 ? 254 : radius;

    const info: image.ImageInfo = original.getImageInfoSync();
    const w: number = info.size.width;
    const h: number = info.size.height;

    const bufferSize: number = original.getPixelBytesNumber();
    const buffer: ArrayBuffer = new ArrayBuffer(bufferSize);
    original.readPixelsToBufferSync(buffer);

    const pixels: Uint8Array = new Uint8Array(buffer);

    // Horizontal pass
    blurIterationRGBA(pixels, w, h, clampedRadius, 1);
    // Vertical pass
    blurIterationRGBA(pixels, w, h, clampedRadius, 2);

    const opts: image.InitializationOptions = {
      alphaType: image.AlphaType.UNPREMUL,
      editable: true,
      pixelFormat: image.PixelMapFormat.BGRA_8888,
      size: { width: w, height: h }
    };
    return image.createPixelMapSync(buffer, opts);
  }
}
