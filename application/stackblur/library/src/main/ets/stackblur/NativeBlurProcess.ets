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
/**
 * NativeBlurProcess — high-performance Stack Blur using Native C via NAPI.
 *
 * Ported from android-stackblur NativeBlurProcess.java
 * Native algorithm by Mario Klingemann <mario.quasimondo.com>
 *
 * This implementation is 25–30× faster than JSBlurProcess.
 * It reads the PixelMap pixels into an ArrayBuffer, calls the native
 * C function to perform the blur in-place, then creates a new PixelMap
 * from the modified buffer.
 *
 * @license Apache License 2.0
 */

import { image } from '@kit.ImageKit';
import { BlurProcess } from './BlurProcess';
import liblibrary from 'liblibrary.so';

/**
 * NativeBlurProcess — BlurProcess implementation backed by native C code.
 */
export class NativeBlurProcess implements BlurProcess {
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

    // Single-threaded: threadCount=1, threadIndex=0
    // Horizontal pass
    liblibrary.functionToBlur(buffer, {
      width: w,
      height: h,
      radius: clampedRadius,
      threadCount: 1,
      threadIndex: 0,
      round: 1
    });
    // Vertical pass
    liblibrary.functionToBlur(buffer, {
      width: w,
      height: h,
      radius: clampedRadius,
      threadCount: 1,
      threadIndex: 0,
      round: 2
    });

    const opts: image.InitializationOptions = {
      alphaType: image.AlphaType.UNPREMUL,
      editable: true,
      pixelFormat: image.PixelMapFormat.BGRA_8888,
      size: { width: w, height: h }
    };
    return image.createPixelMapSync(buffer, opts);
  }
}
